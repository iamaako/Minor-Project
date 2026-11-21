const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { getNetworkCandidates, getBestIp } = require('./network');

const JWT_SECRET = crypto.randomBytes(32).toString('hex');

let app, server, io;
let connectedClients = {}; // socket.id -> { ip, rollNumber, status }
let mainWindowRef = null;
let globalExamDuration = 90; // default 90 minutes
let globalExamTitle = "End Semester Examination 2026-27";
let globalExamStatus = "WAITING"; // WAITING or STARTED
let globalScheduledTime = null; // timestamp or null
let globalExamStartTime = null; // timestamp
let autoStartInterval = null;
let liveStudentAnalysis = {};

// roll number -> random token, issued when that student logs in. The workspace upload is a
// plain HTTP POST (no socket), so this token is how the server knows who is uploading.
const uploadTokens = new Map();

// ── Input hygiene: everything a student client sends is untrusted ──

// Roll numbers become folder names. Same rule as the student app's codeExecutor.js.
function sanitizeRoll(roll) {
  return String(roll === undefined || roll === null ? '' : roll)
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 64);
}

function safeFileName(name) {
  return String(name || '')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 80);
}

// Text that ends up in logs / the dashboard: drop control characters and angle brackets.
function cleanText(value, max) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .slice(0, max);
}

// What the dashboard shows for each webcam alert type (direction/cause/duration are validated first)
const WEBCAM_ALERT_TEXT = {
  LOOKING_BESIDE: (dir, cause, sec) =>
    `looking ${dir ? dir.toLowerCase() : 'aside'}${cause ? ` (${cause.toLowerCase()})` : ''} for ${sec}s, away from the screen`,
  LOOKING_DOWN: (dir, cause, sec) => `looking down for ${sec}s`,
  FACE_ABSENT: (dir, cause, sec) => `not visible to the camera for ${sec}s`,
  CAMERA_COVERED: (dir, cause, sec) => `camera appears covered (${sec}s)`,
  CAMERA_LOST: () => 'camera was disconnected or stopped',
  CAMERA_UNAVAILABLE: () => 'camera could not be started',
  ENGINE_FAILED: () => 'AI proctor failed to start (camera preview only)',
};

const SOLUTION_LANGS = ['python', 'c', 'cpp'];
const SOLUTION_EXT = { python: 'py', c: 'c', cpp: 'cpp' };

function getSubmissionsDir() {
  const { app: electronApp } = require('electron');
  const dir = path.join(electronApp.getPath('documents'), 'AMU_Exam_Submissions');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// The old "first non-internal address" picked VirtualBox / VMware / Hyper-V adapters.
// See network.js for how real adapters are told apart.
function getLocalIpAddress() {
  return getBestIp();
}

function startServer(port = 3000, mainWindow) {
  return new Promise((resolve, reject) => {
    if (server) {
      return reject(new Error('Server is already running'));
    }

    mainWindowRef = mainWindow;
    app = express();
    server = http.createServer(app);
    io = new Server(server, {
      cors: { origin: '*' },
      maxHttpBufferSize: 5e6 // final-submit carries every question's code
    });

    const session = require('express-session');
    const multer = require('multer');
    const { parse } = require('csv-parse');
    const AdmZip = require('adm-zip');
    const { spawn } = require('child_process');
    
    const { 
      getAdminCredentials, insertLog, getLogs, addStudent, getStudents, 
      addQuestion, getQuestions, getStudentByRoll, bindStudent, unbindStudent, 
      setStudentLockStatus, clearTable, updateAssignedQuestions, setStudentSubmitted,
      deleteQuestion, addSubmission
    } = require('./db');

    function logEvent(msg) {
      console.log(`[Server] ${msg}`);
      insertLog(msg).catch(e => console.error('Log DB Error:', e));
      if (mainWindowRef) {
        mainWindowRef.webContents.send('server-log', msg);
      }
    }

    // Keeps a student's code in the database AND as a file the dashboard can open and run.
    async function storeSolution(rollNumber, questionId, language, code, status) {
      const body = String(code).slice(0, 500000);
      const dbOk = await addSubmission(rollNumber, questionId, body, language, status);
      try {
        const dir = path.join(getSubmissionsDir(), sanitizeRoll(rollNumber));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `Q${safeFileName(questionId)}.${SOLUTION_EXT[language]}`), body, 'utf8');
      } catch (e) {
        console.error('[Submissions] Could not write solution file:', e.message);
        return false;
      }
      return dbOk;
    }

    // Uploads land in the OS temp folder (not the app's working directory) with a size cap.
    const upload = multer({
      dest: path.join(os.tmpdir(), 'amu-uploads'),
      limits: { fileSize: 20 * 1024 * 1024, files: 1 }
    });

    // Polling for auto-start based on scheduled time
    if (autoStartInterval) clearInterval(autoStartInterval);
    autoStartInterval = setInterval(() => {
      if (globalExamStatus === 'WAITING' && globalScheduledTime) {
        if (Date.now() >= globalScheduledTime) {
          globalExamStatus = 'STARTED';
          globalExamStartTime = Date.now();
          globalScheduledTime = null;
          logEvent('Scheduled time reached. Auto-starting exam.');
          io.emit('exam_started');
        }
      }
    }, 1000);

    app.use(express.json());
    
    // Add CORS headers to allow cross-origin requests from any device
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    app.use(session({
      // New random secret per run (sessions are in memory and die with the server anyway).
      secret: crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 86400000 } // 1 day
    }));

    // Serve public assets
    app.use('/css', express.static(path.join(__dirname, 'css')));
    app.use('/assets', express.static(path.join(__dirname, 'assets')));
    app.use(express.static(path.join(__dirname, 'public')));

    // Login API
    app.post('/api/admin/login', async (req, res) => {
      const { password } = req.body;
      try {
        const creds = await getAdminCredentials();
        if (creds && creds.password === password) {
          req.session.isAdmin = true;
          logEvent('Admin logged into Web Dashboard.');
          const adminToken = jwt.sign({ role: 'admin', id: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
          return res.json({ success: true, adminToken });
        }
        logEvent('Failed login attempt to Web Dashboard.');
        res.status(401).json({ success: false, message: 'Invalid password' });
      } catch (err) {
        res.status(500).json({ success: false, message: 'Database error' });
      }
    });

    // Check auth middleware
    const requireAdmin = (req, res, next) => {
      if (req.session && req.session.isAdmin) {
        next();
      } else {
        if (req.path.startsWith('/api/')) return res.status(401).json({error: 'Unauthorized'});
        res.redirect('/admin');
      }
    };

    // --- REST APIs (Secured) ---
    
    // Students
    app.get('/api/admin/students', requireAdmin, async (req, res) => {
      try {
        const students = await getStudents();
        res.json({ success: true, students });
      } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

    app.post('/api/admin/students', requireAdmin, async (req, res) => {
      const { roll_number, name, password } = req.body;
      if (!roll_number || !name || !password) return res.status(400).json({success: false, error: 'Missing fields'});
      try {
        const ok = await addStudent(roll_number, name, password);
        if (!ok) return res.status(500).json({ success: false, error: 'Error adding student.' });
        logEvent(`Registered new student: ${name} (${roll_number})`);
        res.json({ success: true });
      } catch (e) { res.status(500).json({ success: false, error: 'Error adding student.' }); }
    });

    app.post('/api/admin/students/assign-questions', requireAdmin, async (req, res) => {
      const { roll_number, questions } = req.body;
      if (!roll_number || !Array.isArray(questions)) return res.status(400).json({ success: false, error: 'Invalid data' });
      try {
        await updateAssignedQuestions(roll_number, JSON.stringify(questions));
        logEvent(`Assigned questions [${questions.join(',')}] to student ${roll_number}`);
        res.json({ success: true });
      } catch (e) { res.status(500).json({ success: false, error: 'Error assigning questions' }); }
    });

    // Questions
    app.get('/api/admin/questions', requireAdmin, async (req, res) => {
      try {
        const questions = await getQuestions();
        res.json({ success: true, questions });
      } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

    app.post('/api/admin/questions', requireAdmin, async (req, res) => {
      const { id, title, description, time_limit, difficulty, constraints, sampleInput, sampleOutput, explanation, testCases } = req.body;
      if (!id || !title || !description) return res.status(400).json({success: false, error: 'Missing basic fields'});
      try {
        const ok = await addQuestion(id, title, description, parseInt(time_limit, 10), difficulty, constraints, sampleInput, sampleOutput, explanation, testCases);
        if (!ok) return res.status(500).json({ success: false, error: 'Error adding question.' });
        logEvent(`Added new question: ${title}`);
        res.json({ success: true });
      } catch (e) {
        console.error('[Add Question Error]', e);
        res.status(500).json({ success: false, error: 'Error adding question: ' + e.message }); 
      }
    });

    app.delete('/api/admin/questions/:id', requireAdmin, async (req, res) => {
      const { id } = req.params;
      if (!id) return res.status(400).json({ success: false, error: 'Missing ID' });
      try {
        // sql.js has no callback API: the old getDb().run(sql, params, cb) never answered the
        // request and never saved. deleteQuestion() runs the statement and schedules the save.
        const ok = await deleteQuestion(id);
        if (!ok) return res.status(500).json({ success: false, error: 'Error deleting question' });
        logEvent(`Deleted question: ${id}`);
        res.json({ success: true });
      } catch (e) {
        console.error('[Delete Question Error]', e);
        res.status(500).json({ success: false, error: 'Error deleting question' });
      }
    });

    // CSV Bulk Upload
    app.post('/api/admin/students/csv', requireAdmin, upload.single('file'), (req, res) => {
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
      
      const results = [];
      fs.createReadStream(req.file.path)
        .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
        .on('data', (data) => results.push(data))
        .on('error', (err) => {
          console.error('[CSV Parse Error]', err);
          try { fs.unlinkSync(req.file.path); } catch (e) { /* already gone */ }
          // Without a response the browser request hung forever.
          if (!res.headersSent) res.status(400).json({ success: false, error: 'Invalid CSV file: ' + err.message });
        })
        .on('end', async () => {
          try { fs.unlinkSync(req.file.path); } catch (e) { /* already gone */ }
          let successCount = 0;
          for (let row of results) {
            if (row.roll_number && row.name && row.password) {
              const ok = await addStudent(row.roll_number, row.name, row.password);
              if (ok) {
                successCount++;
              } else {
                console.log(`[CSV] Failed to add ${row.roll_number}`);
              }
            } else {
              console.log('[CSV] Missing fields in row (password hidden):', { roll_number: row.roll_number, name: row.name });
            }
          }
          logEvent(`Bulk uploaded ${successCount} students via CSV.`);
          res.json({ success: true, count: successCount });
        });
    });

    // Workspace Submission
    app.post('/api/admin/submit-workspace', upload.single('workspace_zip'), async (req, res) => {
      const rollNumber = req.body && req.body.roll_number;
      const token = req.body && req.body.upload_token;
      const zipPath = req.file && req.file.path;
      const discardUpload = () => { try { if (zipPath) fs.unlinkSync(zipPath); } catch (e) { /* ignore */ } };

      if (!req.file || !rollNumber) {
        discardUpload();
        return res.status(400).json({ success: false, error: 'Missing file or roll_number' });
      }

      // This route cannot sit behind the admin session (students call it), so it checks the
      // token handed out when that student logged in. Without it anyone on the LAN could
      // overwrite another student's submission.
      const expected = uploadTokens.get(String(rollNumber));
      const tokenOk = expected && typeof token === 'string' &&
        token.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
      if (!tokenOk) {
        discardUpload();
        return res.status(403).json({ success: false, error: 'Not authorised to upload for this roll number' });
      }

      try {
        // Folder named by (sanitised) roll number, same place the dashboard reads from
        const studentDir = path.join(getSubmissionsDir(), sanitizeRoll(rollNumber));
        fs.mkdirSync(studentDir, { recursive: true });

        // Extract by hand: flat files only, safe names, size limits. No directory entries,
        // no "../" tricks, whatever the zip claims.
        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries().filter(e => !e.isDirectory);
        if (entries.length > 100) throw new Error('Too many files in workspace zip');
        let written = 0;
        for (const entry of entries) {
          const name = safeFileName(path.basename(entry.entryName.replace(/\\/g, '/')));
          if (!name) continue;
          if (entry.header.size > 2 * 1024 * 1024) continue;
          fs.writeFileSync(path.join(studentDir, name), entry.getData());
          written++;
        }
        discardUpload();

        const marked = await setStudentSubmitted(rollNumber, true);
        if (!marked) console.warn('[Submit Workspace] Could not mark student as submitted:', rollNumber);

        logEvent(`Received and extracted workspace for student: ${cleanText(rollNumber, 40)} (${written} files)`);
        res.json({ success: true });
      } catch (e) {
        discardUpload();
        console.error('[Submit Workspace Error]', e);
        res.status(500).json({ success: false, error: 'Failed to process workspace submission' });
      }
    });

    // View Submitted Workspace Files
    app.get('/api/admin/submissions/:rollNumber', requireAdmin, (req, res) => {
      const studentDir = path.join(getSubmissionsDir(), sanitizeRoll(req.params.rollNumber));
      if (!fs.existsSync(studentDir)) {
        return res.json({ success: true, files: [] });
      }
      try {
        const files = fs.readdirSync(studentDir);
        res.json({ success: true, files });
      } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to read submissions directory' });
      }
    });

    app.get('/api/admin/submissions/:rollNumber/:filename', requireAdmin, (req, res) => {
      const { rollNumber, filename } = req.params;
      // Basic sanitization
      const safeFilename = path.basename(filename);
      const filePath = path.join(getSubmissionsDir(), sanitizeRoll(rollNumber), safeFilename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ success: true, content });
      } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to read file' });
      }
    });

    // Run Submitted Code for Testing by Teacher
    app.post('/api/admin/submissions/run', requireAdmin, async (req, res) => {
      const { rollNumber, filename, input } = req.body;
      if (!rollNumber || !filename) {
        return res.status(400).json({ success: false, error: 'Missing rollNumber or filename' });
      }

      const safeFilename = path.basename(String(filename));
      const studentDir = path.join(getSubmissionsDir(), sanitizeRoll(rollNumber));
      const filePath = path.join(studentDir, safeFilename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      const ext = path.extname(safeFilename).toLowerCase();
      let command = '';
      let args = [];
      const startTime = Date.now();

      const portablePy = path.join(__dirname, '..', 'AMUStudentPortal', 'portable-tools', 'python-embed', 'python.exe');
      const pythonCmd = fs.existsSync(portablePy) ? portablePy : 'python';

      const portableGcc = path.join(__dirname, '..', 'AMUStudentPortal', 'portable-tools', 'mingw', 'bin', 'gcc.exe');
      const gccCmd = fs.existsSync(portableGcc) ? portableGcc : 'gcc';
      const portableGpp = path.join(__dirname, '..', 'AMUStudentPortal', 'portable-tools', 'mingw', 'bin', 'g++.exe');
      const gppCmd = fs.existsSync(portableGpp) ? portableGpp : 'g++';

      const cleanupFiles = [];

      try {
        if (ext === '.py') {
          command = pythonCmd;
          args = [filePath];
        } else if (ext === '.c' || ext === '.cpp') {
          const compiler = ext === '.c' ? gccCmd : gppCmd;
          const outName = process.platform === 'win32' ? 'runner.exe' : 'runner.out';
          const outPath = path.join(studentDir, outName);
          cleanupFiles.push(outPath);

          const compileArgs = process.platform === 'win32'
            ? [filePath, '-o', outPath, '-lm']
            : [filePath, '-o', outPath, '-lm'];

          const compileResult = await new Promise((resolve) => {
            let stderr = '';
            const proc = spawn(compiler, compileArgs, { windowsHide: true, cwd: studentDir });
            proc.stderr.on('data', d => stderr += d.toString());
            proc.on('close', code => resolve({ code, stderr }));
          });

          if (compileResult.code !== 0) {
            return res.json({
              success: true,
              stdout: '',
              stderr: `Compilation Error:\n${compileResult.stderr}`,
              exitCode: compileResult.code,
              executionTime: Date.now() - startTime
            });
          }

          command = outPath;
          args = [];
        } else {
          return res.status(400).json({ success: false, error: `Execution not supported for ${ext} files` });
        }

        const execResult = await new Promise((resolve) => {
          let stdout = '';
          let stderr = '';
          let finished = false;

          const proc = spawn(command, args, {
            windowsHide: true,
            cwd: studentDir
          });

          const timer = setTimeout(() => {
            if (!finished) {
              finished = true;
              try {
                if (process.platform === 'win32') {
                  spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { windowsHide: true });
                } else {
                  proc.kill('SIGKILL');
                }
              } catch(e) {}
              resolve({ stdout, stderr: stderr + '\n[Execution timed out (limit: 8s)]', exitCode: 124, timedOut: true });
            }
          }, 8000);

          if (input && proc.stdin && proc.stdin.writable) {
            try {
              proc.stdin.write(input.endsWith('\n') ? input : input + '\n');
              proc.stdin.end();
            } catch(e) {}
          } else if (proc.stdin) {
            proc.stdin.end();
          }

          proc.stdout.on('data', d => stdout += d.toString());
          proc.stderr.on('data', d => stderr += d.toString());

          proc.on('close', (code) => {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              resolve({ stdout, stderr, exitCode: code, timedOut: false });
            }
          });

          proc.on('error', (err) => {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              resolve({ stdout, stderr: `Process Error: ${err.message}`, exitCode: 1, timedOut: false });
            }
          });
        });

        for (const f of cleanupFiles) {
          try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch(e) {}
        }

        res.json({
          success: true,
          stdout: execResult.stdout,
          stderr: execResult.stderr,
          exitCode: execResult.exitCode,
          executionTime: Date.now() - startTime
        });

      } catch (err) {
        for (const f of cleanupFiles) {
          try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch(e) {}
        }
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // Logout
    app.post('/api/admin/logout', requireAdmin, (req, res) => {
      req.session.destroy();
      logEvent('Admin logged out.');
      res.json({ success: true });
    });

    // Live Code & Test Analysis
    app.get('/api/admin/live-analysis', requireAdmin, (req, res) => {
      const activeRolls = new Set();
      const combined = [];

      Object.values(connectedClients).forEach(c => {
        if (!c || !c.rollNumber) return;
        activeRolls.add(c.rollNumber);
        combined.push({
          rollNumber: c.rollNumber,
          name: c.name || 'Candidate',
          systemNumber: c.systemNumber || 'SYS-??',
          ip: c.ip || '',
          status: c.status || 'CONNECTED',
          socketId: c.id,
          currentCode: c.currentCode || (c.behavior ? c.behavior.currentCode : '') || '',
          currentLanguage: c.currentLanguage || (c.behavior ? c.behavior.currentLanguage : 'python') || 'python',
          wpm: c.behavior ? c.behavior.wpm : 0,
          idleSeconds: c.behavior ? c.behavior.idleSeconds : 0,
          keystrokeVariance: c.behavior ? c.behavior.keystrokeVariance : 0,
          backspaceRatio: c.behavior ? c.behavior.backspaceRatio : 0,
          suspicionScore: c.behavior ? c.behavior.suspicionScore : 0,
          riskLevel: c.behavior ? c.behavior.riskLevel : 'NORMAL',
          anomalies: c.behavior ? (c.behavior.anomalies || []) : [],
          lastUpdated: c.behavior ? c.behavior.lastUpdated : Date.now(),
          isConnected: true
        });
      });

      Object.keys(liveStudentAnalysis).forEach(roll => {
        if (!activeRolls.has(roll)) {
          combined.push({
            ...liveStudentAnalysis[roll],
            isConnected: false
          });
        }
      });

      res.json({ success: true, students: combined });
    });

    // Global Settings
    app.get('/api/admin/settings', requireAdmin, (req, res) => {
      res.json({ success: true, globalExamDuration, globalExamTitle, globalExamStatus, globalScheduledTime });
    });

    app.post('/api/admin/settings/title', requireAdmin, (req, res) => {
      const { title } = req.body;
      if (title && title.trim()) {
        globalExamTitle = title.trim();
        logEvent(`Global exam title set to: ${globalExamTitle}`);
        res.json({ success: true, globalExamTitle });
      } else {
        res.status(400).json({ success: false, error: 'Invalid title' });
      }
    });

    app.post('/api/admin/settings/state', requireAdmin, (req, res) => {
      const { action, time } = req.body; // action: 'start', 'schedule', 'reset'
      if (action === 'start') {
        globalExamStatus = 'STARTED';
        // Without a start time every student who logs in (or re-logs in) later got the full duration.
        globalExamStartTime = Date.now();
        globalScheduledTime = null;
        logEvent('Exam manually started by admin.');
        io.emit('exam_started');
        res.json({ success: true, globalExamStatus });
      } else if (action === 'schedule') {
        if (!time || isNaN(time)) return res.status(400).json({ success: false, error: 'Invalid scheduled time' });
        globalExamStatus = 'WAITING';
        globalScheduledTime = parseInt(time, 10);
        logEvent(`Exam scheduled to start at ${new Date(globalScheduledTime).toLocaleString()}`);
        io.emit('exam_scheduled', { scheduledTime: globalScheduledTime });
        res.json({ success: true, globalExamStatus, globalScheduledTime });
      } else if (action === 'reset') {
        globalExamStatus = 'WAITING';
        globalExamStartTime = null;
        globalScheduledTime = null;
        logEvent('Exam state reset to waiting.');
        res.json({ success: true, globalExamStatus });
      } else {
        res.status(400).json({ success: false, error: 'Invalid action' });
      }
    });

    app.post('/api/admin/settings/duration', requireAdmin, (req, res) => {
      const { duration } = req.body;
      if (duration && !isNaN(duration)) {
        globalExamDuration = parseInt(duration, 10);
        logEvent(`Global exam duration set to ${globalExamDuration} minutes.`);
        res.json({ success: true, globalExamDuration });
      } else {
        res.status(400).json({ success: false, error: 'Invalid duration' });
      }
    });

    // Database Management
    app.post('/api/admin/database/clear', requireAdmin, async (req, res) => {
      const { table } = req.body;
      try {
        const ok = await clearTable(table);
        if (!ok) return res.status(400).json({ success: false, error: 'Unknown table or database error' });
        logEvent(`Admin cleared table: ${table}`);
        res.json({ success: true });
      } catch(e) { res.status(500).json({ success: false, error: e.message }); }
    });

    app.get('/api/admin/database/download', requireAdmin, (req, res) => {
      // The real file is <Documents>/AMU_Exam_Database.sqlite (see db.js). The old path
      // ("database.sqlite" next to server.js) never existed, so the backup always failed.
      const dbModule = require('./db');
      dbModule.flushDB(); // include writes that are still waiting in the batch
      const dbPath = dbModule.getDbPath();
      if (dbPath && fs.existsSync(dbPath)) {
        res.download(dbPath, 'backup.sqlite');
        logEvent('Admin downloaded database backup.');
      } else {
        res.status(404).send('Database file not found.');
      }
    });

    // Logs
    app.get('/api/admin/logs', requireAdmin, async (req, res) => {
      try {
        const logs = await getLogs(200);
        res.json({ success: true, logs });
      } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

    // --- Page Routes ---
    // Admin Dashboard (Secure)
    app.get('/admin/dashboard', requireAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
    });

    // Serve admin login page
    app.get('/admin', (req, res) => {
      if (req.session && req.session.isAdmin) {
        return res.redirect('/admin/dashboard');
      }
      res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
    });

    app.get('/', (req, res) => {
      res.send('AMU Exam Server is running.');
    });

    io.on('connection', (socket) => {
      const clientIp = socket.handshake.address;
      logEvent(`Socket connected: ${socket.id} (IP: ${clientIp})`);

      connectedClients[socket.id] = {
        id: socket.id,
        ip: clientIp,
        systemNumber: 'SYS-??',
        hostname: 'Unknown',
        rollNumber: null,
        name: null,
        status: 'CONNECTED',
        connectedAt: Date.now()
      };
      
      broadcastClientsUpdate();

      socket.on('client-identify', (data) => {
        if (connectedClients[socket.id]) {
          // These strings are shown in the dashboard, so keep them plain and short.
          if (data && data.systemNumber) connectedClients[socket.id].systemNumber = cleanText(data.systemNumber, 40);
          if (data && data.hostname) connectedClients[socket.id].hostname = cleanText(data.hostname, 80);
          if (data && data.ip) connectedClients[socket.id].ip = cleanText(data.ip, 64);
          logEvent(`Client Identified: Socket ${socket.id} (System: ${connectedClients[socket.id].systemNumber}, IP: ${connectedClients[socket.id].ip})`);
          broadcastClientsUpdate();
        }
      });

      socket.on('disconnect', () => {
        logEvent(`Socket disconnected: ${socket.id}`);
        delete connectedClients[socket.id];
        broadcastClientsUpdate();
      });

      socket.on('request_clients_update', () => {
        socket.emit('clients_update', connectedClients);
      });
      
      socket.on('admin_join', (data) => {
        try {
          if (data && data.adminToken) {
            const decoded = jwt.verify(data.adminToken, JWT_SECRET);
            if (decoded.role === 'admin') {
              socket.join('admin');
              socket.isAdminSocket = true;
              if (connectedClients[socket.id]) {
                delete connectedClients[socket.id];
                broadcastClientsUpdate();
              }
              logEvent(`Admin dashboard connected (Socket: ${socket.id})`);
            }
          }
        } catch(e) {}
      });

      // Handle Authentication & Device Binding
      socket.on('auth', async (data, callback) => {
        if (typeof callback !== 'function') return;
        const rollNumber = data && data.rollNumber;
        const password = data && data.password;
        if (typeof rollNumber !== 'string' || typeof password !== 'string' || rollNumber.length > 50 || password.length > 200) {
          return callback({ success: false, message: 'Invalid login data' });
        }
        // rollNumber is typed by the student: never put the raw value in a log line.
        logEvent(`Student Auth attempt from ${socket.id} (Roll: ${cleanText(rollNumber, 50)})`);
        
        try {
          const student = await getStudentByRoll(rollNumber);
          if (!student) return callback({ success: false, message: 'Invalid Roll Number' });
          if (student.password !== password) return callback({ success: false, message: 'Invalid Password' });
          
          // Device Binding Logic
          if (student.bound_ip && student.bound_ip !== clientIp) {
            logEvent(`Binding Error: ${rollNumber} tried to login from ${clientIp} but is bound to ${student.bound_ip}`);
            return callback({ success: false, message: 'Account is bound to another device. Contact Invigilator.' });
          }

          if (!student.bound_ip) {
            await bindStudent(rollNumber, clientIp);
            logEvent(`Bound student ${rollNumber} to IP ${clientIp}`);
          }

          if (student.is_locked) {
            return callback({ success: false, message: 'Your account is locked. Contact Invigilator.' });
          }

          if (!connectedClients[socket.id]) return callback({ success: false, message: 'Connection closed' });

          connectedClients[socket.id].rollNumber = rollNumber;
          connectedClients[socket.id].name = student.name;
          connectedClients[socket.id].status = student.has_submitted ? 'SUBMITTED' : 'AUTHENTICATED';

          // Proof of login for the HTTP workspace upload (see /api/admin/submit-workspace).
          // Re-login after a reconnect keeps the existing token.
          if (!uploadTokens.has(rollNumber)) {
            uploadTokens.set(rollNumber, crypto.randomBytes(24).toString('hex'));
          }
          connectedClients[socket.id].is_locked = student.is_locked;
          if (data && data.systemNumber) {
            connectedClients[socket.id].systemNumber = data.systemNumber;
          }
          
          // Load questions and send them to the newly connected student
          const allQuestions = await getQuestions();
          let assignedIds = [];
          try {
            assignedIds = JSON.parse(student.assigned_questions || '[]');
          } catch(e) { assignedIds = []; }
          
          let studentQuestions = [];
          if (assignedIds.length > 0) {
            studentQuestions = allQuestions.filter(q => assignedIds.includes(q.id));
          } else {
            studentQuestions = []; // 0 questions by default
          }
          
          socket.emit('questions-load', studentQuestions);

          let currentRemainingSeconds = globalExamDuration * 60;
          if (globalExamStatus === 'STARTED' && globalExamStartTime) {
             const elapsed = Math.floor((Date.now() - globalExamStartTime) / 1000);
             currentRemainingSeconds = Math.max(0, (globalExamDuration * 60) - elapsed);
          }

          callback({ 
            success: true, 
            message: 'Authenticated successfully',
            studentName: student.name,
            rollNumber: student.roll_number,
            globalExamDuration: globalExamDuration,
            currentRemainingSeconds: currentRemainingSeconds,
            globalExamTitle: globalExamTitle,
            globalExamStatus: globalExamStatus,
            globalScheduledTime: globalScheduledTime,
            uploadToken: uploadTokens.get(rollNumber)
          });
          
          broadcastClientsUpdate();

        } catch (e) {
          callback({ success: false, message: 'Server error' });
        }
      });
      
      socket.on('usb_detected', (data) => {
        const c = connectedClients[socket.id];
        if (c) {
          c.usbAlert = true;
          c.is_locked = 1;
          const roll = c.rollNumber || 'Unknown Roll';
          const name = c.name || 'Unknown Student';
          const ip = c.ip || (data && cleanText(data.ip, 64)) || 'Unknown IP';
          const msg = `🔴 ALARM: USB device inserted by ${name} (${roll}) at IP: ${ip}!`;
          logEvent(msg);
          io.to('admin').emit('student_alert', { name, roll, ip });
          
          if (c.rollNumber) {
            setStudentLockStatus(c.rollNumber, 1).then(() => {
              io.to(socket.id).emit('screen_lock', { message: 'Exam Locked: Unauthorized USB Device Detected!' });
              broadcastClientsUpdate();
            });
          } else {
            broadcastClientsUpdate();
          }
        }
      });

      // Student Behavioral Biometrics Listener
      socket.on('student_behavior', (data) => {
        const c = connectedClients[socket.id];
        if (c && data) {
          const currentCode = data.currentCode || '';
          const currentLanguage = data.currentLanguage || 'python';
          c.currentCode = currentCode;
          c.currentLanguage = currentLanguage;
          c.behavior = {
            wpm: data.wpm || 0,
            idleSeconds: data.idleSeconds || 0,
            keystrokeVariance: data.keystrokeVariance || 0,
            backspaceRatio: data.backspaceRatio || 0,
            suspicionScore: data.suspicionScore || 0,
            riskLevel: data.riskLevel || 'NORMAL',
            anomalies: data.anomalies || [],
            currentCode,
            currentLanguage,
            lastUpdated: Date.now()
          };

          if (c.rollNumber) {
            liveStudentAnalysis[c.rollNumber] = {
              rollNumber: c.rollNumber,
              name: c.name || 'Candidate',
              systemNumber: c.systemNumber || 'SYS-??',
              ip: c.ip || '',
              status: c.status || 'CONNECTED',
              socketId: socket.id,
              currentCode,
              currentLanguage,
              ...c.behavior
            };
          }

          if (data.alertAnomaly) {
            const roll = c.rollNumber || 'Unknown';
            const name = c.name || 'Candidate';
            const sys = c.systemNumber || 'SYS-??';
            const logMsg = `⚠️ [Behavior Anomaly] ${name} (${roll}, ${sys}): ${data.alertAnomaly} (Suspicion: ${data.suspicionScore}%)`;
            logEvent(logMsg);
            io.to('admin').emit('behavior_alert', {
              socketId: socket.id,
              rollNumber: roll,
              name,
              systemNumber: sys,
              anomaly: data.alertAnomaly,
              score: data.suspicionScore
            });
          }

          broadcastClientsUpdate();
        }
      });

      // Webcam Neighbor / Gaze Violation Listener
      socket.on('webcam_violation', (data) => {
        const c = connectedClients[socket.id];
        // Only logged-in students may raise alerts, and only known alert types are accepted.
        if (!c || !c.rollNumber || !data || typeof data !== 'object') return;
        if (!Object.prototype.hasOwnProperty.call(WEBCAM_ALERT_TEXT, data.type)) return;

        // Light rate limit per socket so a modified client cannot flood the dashboard.
        const now = Date.now();
        if (c.lastWebcamAlertAt && now - c.lastWebcamAlertAt < 1500) return;
        c.lastWebcamAlertAt = now;

        const type = data.type;
        const roll = c.rollNumber;
        const name = c.name || 'Candidate';
        const sys = c.systemNumber || 'SYS-??';
        const ip = c.ip || '';
        const direction = ['LEFT', 'RIGHT', 'DOWN'].includes(data.direction) ? data.direction : null;
        const cause = ['HEAD', 'EYES', 'HEAD+EYES'].includes(data.cause) ? data.cause : null;
        const duration = Math.max(0, Math.min(3600, parseInt(data.durationSeconds, 10) || 0));
        const detail = cleanText(data.detail, 200);
        const snapshot = (typeof data.snapshot === 'string' && data.snapshot.length <= 300000 &&
          /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.snapshot)) ? data.snapshot : null;

        const what = WEBCAM_ALERT_TEXT[type](direction, cause, duration);
        const msg = `🚨 [Webcam Alert] ${name} (${roll}, ${sys}) ${what}`;
        logEvent(msg);

        // Notify Admin UI
        io.to('admin').emit('webcam_alert', {
          socketId: socket.id,
          rollNumber: roll,
          name,
          systemNumber: sys,
          ip,
          type,
          direction,
          cause,
          detail,
          duration,
          message: what,
          snapshot,
          timestamp: now
        });

        // Also push into student alert channel so it highlights on the lab map
        io.to('admin').emit('student_alert', {
          name,
          roll,
          ip,
          type: 'WEBCAM_VIOLATION',
          message: msg,
          snapshot
        });

        broadcastClientsUpdate();
      });

      // Student pressed "Save" on a question
      socket.on('submit-code', async (data) => {
        const c = connectedClients[socket.id];
        if (!c || !c.rollNumber || !data || typeof data !== 'object') return;
        const language = SOLUTION_LANGS.includes(data.language) ? data.language : null;
        const questionId = cleanText(data.questionId, 40);
        if (!language || !questionId || typeof data.code !== 'string') return;
        await storeSolution(c.rollNumber, questionId, language, data.code, 'SAVED');
      });

      // Student pressed "Final Submit": every question's code buffers
      socket.on('final-submit', async (data) => {
        const c = connectedClients[socket.id];
        const buffers = data && data.codeBuffers;
        if (!c || !c.rollNumber || !buffers || typeof buffers !== 'object') return;

        let saved = 0;
        for (const [questionId, byLang] of Object.entries(buffers).slice(0, 50)) {
          if (!byLang || typeof byLang !== 'object') continue;
          for (const [language, code] of Object.entries(byLang)) {
            if (!SOLUTION_LANGS.includes(language) || typeof code !== 'string' || !code.trim()) continue;
            if (await storeSolution(c.rollNumber, cleanText(questionId, 40), language, code, 'FINAL')) saved++;
          }
        }
        logEvent(`Final submission received from ${c.name || 'Candidate'} (${c.rollNumber}): ${saved} solution(s) stored.`);
      });

      // Window focus lost on the student machine
      socket.on('focus-loss', (data) => {
        const c = connectedClients[socket.id];
        if (!c || !c.rollNumber) return;
        const count = data && Number.isFinite(data.focusViolations) ? ` (focus violations: ${data.focusViolations})` : '';
        const name = c.name || 'Candidate';
        const sys = c.systemNumber || 'SYS-??';
        logEvent(`⚠️ [Focus Loss] ${name} (${c.rollNumber}, ${sys}) left the exam window${count}.`);
        io.to('admin').emit('behavior_alert', {
          socketId: socket.id,
          rollNumber: c.rollNumber,
          name,
          systemNumber: sys,
          anomaly: 'Exam window lost focus',
          score: (c.behavior && c.behavior.suspicionScore) || 0
        });
      });
      
      // Admin Actions Receiver (from Admin UI to specific socket)
      socket.on('admin_action', async (actionData, callback) => {
        // VERIFY token first
        if (!actionData.adminToken) {
          logEvent('Unauthorized admin_action attempt (no token)');
          if (callback) callback({ success: false, error: 'Unauthorized - No token' });
          return;
        }
        
        try {
          const decoded = jwt.verify(actionData.adminToken, JWT_SECRET);
          if (decoded.role !== 'admin') {
            logEvent('Unauthorized admin_action attempt (invalid role)');
            if (callback) callback({ success: false, error: 'Unauthorized - Not admin' });
            return;
          }
        } catch (err) {
          logEvent('Unauthorized admin_action attempt (invalid/expired token)');
          if (callback) callback({ success: false, error: 'Invalid or expired token' });
          return;
        }

        // actionData: { type: 'warn'|'lock'|'unlock'|'unbind'|'submit'|'unsubmit', targetSocketId, targetRoll, message, adminToken }
        
        if (actionData.type === 'unbind') {
           await unbindStudent(actionData.targetRoll);
           logEvent(`Unbound student ${actionData.targetRoll}`);
           broadcastClientsUpdate();
        } 
        else if (actionData.type === 'lock') {
           await setStudentLockStatus(actionData.targetRoll, 1);
           if (connectedClients[actionData.targetSocketId]) connectedClients[actionData.targetSocketId].is_locked = 1;
           io.to(actionData.targetSocketId).emit('screen_lock', { message: 'System Locked. Contact Invigilator.' });
           logEvent(`Locked student ${actionData.targetRoll}`);
           broadcastClientsUpdate();
        }
        else if (actionData.type === 'unlock') {
           await setStudentLockStatus(actionData.targetRoll, 0);
           if (connectedClients[actionData.targetSocketId]) {
               connectedClients[actionData.targetSocketId].is_locked = 0;
               connectedClients[actionData.targetSocketId].usbAlert = false;
           }
           io.to(actionData.targetSocketId).emit('screen_unlock');
           logEvent(`Unlocked student ${actionData.targetRoll} and cleared alerts`);
           broadcastClientsUpdate();
        }
        else if (actionData.type === 'warn') {
           io.to(actionData.targetSocketId).emit('warning', { message: actionData.message });
           logEvent(`Warned student ${actionData.targetRoll}: ${actionData.message}`);
        }
        else if (actionData.type === 'announcement') {
           io.emit('announcement', { message: actionData.message });
           logEvent(`Announcement: ${actionData.message}`);
        }
        else if (actionData.type === 'submit_all') {
           io.emit('submit-and-close');
           logEvent(`Forced submit for all students.`);
           Object.keys(connectedClients).forEach(sid => {
             connectedClients[sid].status = 'SUBMITTED';
           });
           broadcastClientsUpdate();
        }
        else if (actionData.type === 'submit') {
           io.to(actionData.targetSocketId).emit('submit-and-close');
           logEvent(`Forced submit for student ${actionData.targetRoll}`);
           if (connectedClients[actionData.targetSocketId]) connectedClients[actionData.targetSocketId].status = 'SUBMITTED';
           broadcastClientsUpdate();
        }
        else if (actionData.type === 'unsubmit') {
           logEvent(`Un-submitted exam for student ${actionData.targetRoll}`);
           setStudentSubmitted(actionData.targetRoll, false).catch(e => {});
           if (connectedClients[actionData.targetSocketId]) {
              connectedClients[actionData.targetSocketId].status = 'AUTHENTICATED';
           }
           io.to(actionData.targetSocketId).emit('exam_command', { type: 'UNSUBMIT' });
           broadcastClientsUpdate();
        }
        else if (actionData.type === 'emergency_kill') {
           logEvent(`Emergency kill sent to student ${actionData.targetRoll}`);
           io.to(actionData.targetSocketId).emit('emergency_kill');
        }
        else if (actionData.type === 'update_system_number') {
           const targetSid = actionData.targetSocketId;
           const newSysNum = (actionData.targetSystemNumber || '').trim();
           if (targetSid && newSysNum && connectedClients[targetSid]) {
              connectedClients[targetSid].systemNumber = newSysNum;
              io.to(targetSid).emit('set_system_number', { systemNumber: newSysNum });
              logEvent(`Admin updated System Number for socket ${targetSid} (IP: ${connectedClients[targetSid].ip}) to: ${newSysNum}`);
              broadcastClientsUpdate();
           }
        }

        if (callback) callback({ success: true });
      });

      // Stream Routing
      socket.on('start_stream', (data) => {
        if (data.targetSocketId) {
          io.to(data.targetSocketId).emit('start_screen_capture');
        }
      });

      socket.on('stop_stream', (data) => {
        if (data.targetSocketId) {
          io.to(data.targetSocketId).emit('stop_screen_capture');
        }
      });

      socket.on('screen_frame', (data) => {
        // Forward the frame to the admin dashboard
        io.to('admin').emit('stream_frame_receive', { 
          targetSocketId: socket.id, 
          frameData: data.frameData 
        });
      });

      socket.on('submit_exam', async () => {
        // Use the roll number of the logged-in socket, not whatever the client claims.
        const c = connectedClients[socket.id];
        if (!c || !c.rollNumber) return;
        logEvent(`Student ${c.rollNumber} submitted the exam.`);
        c.status = 'SUBMITTED';
        await setStudentSubmitted(c.rollNumber, true);
        broadcastClientsUpdate();
      });
      
    });

    // Listen on all network interfaces (0.0.0.0) to allow connections from other devices
    server.listen(port, '0.0.0.0', () => {
      const localIp = getLocalIpAddress();
      logEvent(`Exam Server listening on port ${port}`);
      logEvent(`Access from this PC: http://localhost:${port}/admin`);
      const usable = getNetworkCandidates().filter((c) => !c.virtual);
      if (usable.length === 0) {
        logEvent('WARNING: no Wi-Fi / Ethernet / hotspot address found. Connect to a network first; other devices cannot reach this PC.');
      }
      usable.forEach((c) => logEvent(`Access from other devices (${c.label}): http://${c.address}:${port}/admin`));
      getNetworkCandidates().filter((c) => c.virtual)
        .forEach((c) => logEvent(`Ignored virtual adapter ${c.name} (${c.address}): other devices cannot use it.`));
      resolve({ ip: localIp, port });
    });

    server.on('error', (err) => {
      server = null;
      io = null;
      reject(err);
    });
  });
}

function stopServer() {
  if (io) io.close();
  if (server) {
    server.close();
    server = null;
    io = null;
    app = null;
    connectedClients = {};
    uploadTokens.clear();
    if (mainWindowRef) {
      mainWindowRef.webContents.send('server-stopped');
    }
  }
}

function getConnectedClients() {
  return Object.values(connectedClients);
}

function broadcastClientsUpdate() {
  if (mainWindowRef) {
    const loggedInStudents = Object.values(connectedClients).filter(c => c && c.rollNumber);
    mainWindowRef.webContents.send('clients-update', loggedInStudents);
  }
  if (io) {
    io.to('admin').emit('clients_update', connectedClients);
  }
}

module.exports = {
  startServer,
  stopServer,
  getLocalIpAddress,
  getNetworkCandidates,
  getConnectedClients
};
