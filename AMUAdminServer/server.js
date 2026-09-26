const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

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

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
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
      cors: { origin: '*' }
    });

    const path = require('path');
    const session = require('express-session');
    const multer = require('multer');
    const { parse } = require('csv-parse');
    const fs = require('fs');
    const AdmZip = require('adm-zip');
    
    const { 
      getAdminCredentials, insertLog, getLogs, addStudent, getStudents, 
      addQuestion, getQuestions, getStudentByRoll, bindStudent, unbindStudent, 
      setStudentLockStatus, clearTable, updateAssignedQuestions, setStudentSubmitted
    } = require('./db');

    function logEvent(msg) {
      console.log(`[Server] ${msg}`);
      insertLog(msg).catch(e => console.error('Log DB Error:', e));
      if (mainWindowRef) {
        mainWindowRef.webContents.send('server-log', msg);
      }
    }

    const upload = multer({ dest: 'temp/' });

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
    app.use(session({
      secret: 'amu-exam-secret-key-2026',
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
        await addStudent(roll_number, name, password);
        logEvent(`Registered new student: ${name} (${roll_number})`);
        res.json({ success: true });
      } catch (e) { res.status(500).json({ success: false, error: 'Error adding student. Roll number might already exist.' }); }
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
        await addQuestion(id, title, description, parseInt(time_limit, 10), difficulty, constraints, sampleInput, sampleOutput, explanation, testCases);
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
        await new Promise((resolve, reject) => {
          require('./db').getDb().run(`DELETE FROM questions WHERE id = ?`, [id], (err) => {
            if (err) reject(err);
            resolve();
          });
        });
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
        })
        .on('end', async () => {
          fs.unlinkSync(req.file.path);
          let successCount = 0;
          for (let row of results) {
            console.log('[CSV] Processing row:', row);
            if (row.roll_number && row.name && row.password) {
              try {
                await addStudent(row.roll_number, row.name, row.password);
                successCount++;
              } catch(e) {
                console.log(`[CSV] Failed to add ${row.roll_number}: ${e.message}`);
              }
            } else {
              console.log('[CSV] Missing fields in row:', row);
            }
          }
          logEvent(`Bulk uploaded ${successCount} students via CSV.`);
          res.json({ success: true, count: successCount });
        });
    });

    // Workspace Submission
    app.post('/api/admin/submit-workspace', upload.single('workspace_zip'), (req, res) => {
      const rollNumber = req.body.roll_number;
      if (!req.file || !rollNumber) {
        return res.status(400).json({ success: false, error: 'Missing file or roll_number' });
      }

      try {
        const zipPath = req.file.path;
        
        const { app: electronApp } = require('electron');
        const submissionsDir = path.join(electronApp.getPath('documents'), 'AMU_Exam_Submissions');
        if (!fs.existsSync(submissionsDir)) {
          fs.mkdirSync(submissionsDir);
        }

        // Folder named by student roll number
        const studentDir = path.join(submissionsDir, rollNumber);
        if (!fs.existsSync(studentDir)) {
          fs.mkdirSync(studentDir);
        }

        // Extract zip
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(studentDir, true);

        // Delete temporary zip
        fs.unlinkSync(zipPath);
        
        // Update DB
        setStudentSubmitted(rollNumber, true).catch(e => console.log('DB Error:', e));

        logEvent(`Received and extracted workspace for student: ${rollNumber}`);
        res.json({ success: true });
      } catch (e) {
        console.error('[Submit Workspace Error]', e);
        res.status(500).json({ success: false, error: 'Failed to process workspace submission' });
      }
    });

    // View Submitted Workspace Files
    app.get('/api/admin/submissions/:rollNumber', requireAdmin, (req, res) => {
      const { rollNumber } = req.params;
      const studentDir = path.join(__dirname, 'submissions', rollNumber);
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
      const filePath = path.join(__dirname, 'submissions', rollNumber, safeFilename);
      
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

    // Logout
    app.post('/api/admin/logout', requireAdmin, (req, res) => {
      req.session.destroy();
      logEvent('Admin logged out.');
      res.json({ success: true });
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
        await clearTable(table);
        logEvent(`Admin cleared table: ${table}`);
        res.json({ success: true });
      } catch(e) { res.status(500).json({ success: false, error: e.message }); }
    });

    app.get('/api/admin/database/download', requireAdmin, (req, res) => {
      const dbPath = path.join(__dirname, 'database.sqlite');
      if (fs.existsSync(dbPath)) {
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
          if (data && data.systemNumber) connectedClients[socket.id].systemNumber = data.systemNumber;
          if (data && data.hostname) connectedClients[socket.id].hostname = data.hostname;
          if (data && data.ip) connectedClients[socket.id].ip = data.ip;
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
              logEvent(`Admin dashboard connected (Socket: ${socket.id})`);
            }
          }
        } catch(e) {}
      });

      socket.on('usb_detected', (data) => {
        const rollNumber = connectedClients[socket.id]?.rollNumber || 'Unknown';
        const msg = `WARNING: USB/Pen Drive detected on student machine! (Roll: ${rollNumber}, IP: ${data.ip})`;
        logEvent(msg);
        io.to('admin').emit('security_alert', { message: msg });
      });

      // Handle Authentication & Device Binding
      socket.on('auth', async (data, callback) => {
        const { rollNumber, password } = data;
        logEvent(`Student Auth attempt from ${socket.id} (Roll: ${rollNumber})`);
        
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

          connectedClients[socket.id].rollNumber = rollNumber;
          connectedClients[socket.id].name = student.name;
          connectedClients[socket.id].status = 'AUTHENTICATED';
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
            globalScheduledTime: globalScheduledTime
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
          const ip = c.ip || data.ip || 'Unknown IP';
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
           connectedClients[actionData.targetSocketId].status = 'SUBMITTED';
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

      socket.on('submit_exam', async (data) => {
        logEvent(`Student ${data.rollNumber} submitted the exam.`);
        if (connectedClients[socket.id]) {
          connectedClients[socket.id].status = 'SUBMITTED';
          broadcastClientsUpdate();
        }
      });
      
    });

    server.listen(port, () => {
      logEvent(`Exam Server listening on port ${port}`);
      resolve({ ip: getLocalIpAddress(), port });
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
    mainWindowRef.webContents.send('clients-update', getConnectedClients());
  }
  if (io) {
    io.to('admin').emit('clients_update', connectedClients);
  }
}

module.exports = {
  startServer,
  stopServer,
  getLocalIpAddress,
  getConnectedClients
};
