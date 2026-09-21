'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');
const FormData = require('form-data');
const http = require('http');
const {
  EXECUTION_TIMEOUT_MS,
  MAX_OUTPUT_BUFFER,
  SUPPORTED_LANGUAGES,
  LANG_EXTENSIONS,
  TEMP_DIR,
} = require('../common/constants');

const tempDirPath = path.join(app.getPath('userData'), TEMP_DIR);

const isWin = process.platform === 'win32';

const resourcesPath = app.isPackaged 
  ? process.resourcesPath 
  : path.join(__dirname, '..', '..', 'portable-tools');

const PYTHON_EXE = isWin
  ? path.join(resourcesPath, 'python-embed', 'python.exe')
  : 'python3';
const GCC_EXE = isWin
  ? path.join(resourcesPath, 'mingw', 'bin', 'gcc.exe')
  : 'gcc';
const GPP_EXE = isWin
  ? path.join(resourcesPath, 'mingw', 'bin', 'g++.exe')
  : 'g++';

const PYTHON_BLOCKED = [
  /import\s+os\b/,
  /import\s+subprocess/,
  /import\s+socket/,
  /import\s+requests/,
  /from\s+os\s+import/,
  /__import__\s*\(/
];

const CPP_BLOCKED = [
  /system\s*\(/,
  /popen\s*\(/,
  /exec[vple]*\s*\(/,
  /ShellExecute/,
  /CreateProcess/,
  /#include\s*<windows\.h>/,
  /#include\s*<winsock/
];

let activeProcess = null;

function ensureTempDir() {
  if (!fs.existsSync(tempDirPath)) {
    fs.mkdirSync(tempDirPath, { recursive: true });
  }
}

/**
 * Starts an interactive process and pipes output via callbacks.
 */
async function startInteractiveProcess(code, language, onStdout, onStderr, onExit) {
  if (activeProcess) {
    try {
      activeProcess.kill('SIGKILL');
    } catch (e) {}
    activeProcess = null;
  }

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    onStderr(`Error: Unsupported language "${language}".`);
    onExit(1, 0, false);
    return;
  }

  // --- Pattern Scanner ---
  let isBlocked = false;
  if (language === 'python') {
    for (let pattern of PYTHON_BLOCKED) {
      if (pattern.test(code)) isBlocked = true;
    }
  } else if (language === 'c' || language === 'cpp') {
    for (let pattern of CPP_BLOCKED) {
      if (pattern.test(code)) isBlocked = true;
    }
  }

  if (isBlocked) {
    onStderr('Security Error: Code contains restricted functions or modules (e.g. system calls, os module).');
    onExit(1, 0, false);
    return;
  }
  // -----------------------

  ensureTempDir();
  const workspacePath = getWorkspacePath();

  const ext = LANG_EXTENSIONS[language];
  // Instead of UUID, we use a fixed filename in the workspace
  const sourceFileName = language === 'python' ? 'main.py' : `main${ext}`;
  const sourceFile = path.join(workspacePath, sourceFileName);
  const outputFileName = isWin ? 'main.exe' : 'main.out';
  const outputFile = path.join(workspacePath, outputFileName);

  const filesToClean = []; // We don't clean source files anymore so they persist
  let command = '';
  let args = [];

  try {
    fs.writeFileSync(sourceFile, code, 'utf8');

    if (language === 'python') {
      command = PYTHON_EXE;
      args = [sourceFile];
    } else {
      filesToClean.push(outputFile);
      const compiler = language === 'c' ? GCC_EXE : GPP_EXE;
      
      const compileArgs = isWin
        ? [sourceFile, '-o', outputFile, '-lm', '-static']
        : [sourceFile, '-o', outputFile, '-lm'];

      // Compile synchronously or use another promise so we don't block
      const compileResult = await new Promise((resolve) => {
        let stderr = '';
        const compilerProc = spawn(compiler, compileArgs, { windowsHide: true });
        compilerProc.stderr.on('data', d => stderr += d.toString());
        compilerProc.on('close', code => resolve({ code, stderr }));
      });

      if (compileResult.code !== 0) {
        onStderr(`Compilation Error:\n${compileResult.stderr}`);
        onExit(1, 0, false);
        cleanupFiles(filesToClean);
        return;
      }

      if (!isWin) {
        try {
          fs.chmodSync(outputFile, 0o755);
        } catch (e) {}
      }

      command = outputFile;
      args = [];
    }

    _runStreamProcess(command, args, workspacePath, onStdout, onStderr, (exitCode, time, timedOut) => {
      onExit(exitCode, time, timedOut);
      cleanupFiles(filesToClean);
    });

  } catch (err) {
    onStderr(`System Error: ${err.message}`);
    onExit(1, 0, false);
    cleanupFiles(filesToClean);
  }
}

function _runStreamProcess(command, args, cwdPath, onStdout, onStderr, onExit) {
  const startTime = Date.now();
  let timedOut = false;
  let finished = false;
  
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
    cwd: cwdPath // Run inside the workspace directory explicitly
  });

  activeProcess = child;

  const timer = setTimeout(() => {
    if (!finished) {
      timedOut = true;
      try {
        if (isWin) {
          spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true });
        } else {
          child.kill('SIGKILL');
        }
      } catch (e) {
        child.kill('SIGKILL');
      }
    }
  }, EXECUTION_TIMEOUT_MS);

  let stdoutBuffer = '';
  let stderrBuffer = '';
  let outputLength = 0;

  function flush() {
    if (stdoutBuffer) {
      onStdout(stdoutBuffer);
      stdoutBuffer = '';
    }
    if (stderrBuffer) {
      onStderr(stderrBuffer);
      stderrBuffer = '';
    }
  }

  const flushInterval = setInterval(flush, 50);

  function cleanup() {
    if (finished) return;
    finished = true;
    activeProcess = null;
    clearTimeout(timer);
    clearInterval(flushInterval);
    flush();
  }

  child.stdout.on('data', (data) => {
    if (finished) return;
    const chunk = data.toString();
    stdoutBuffer += chunk;
    outputLength += chunk.length;
    if (outputLength > MAX_OUTPUT_BUFFER) {
      stdoutBuffer += '\n\n[Max output buffer exceeded! Forcefully terminating process.]';
      killInteractiveProcess();
      cleanup();
      onExit(1, Date.now() - startTime, false);
    }
  });
  
  child.stderr.on('data', (data) => {
    if (finished) return;
    const chunk = data.toString();
    stderrBuffer += chunk;
    outputLength += chunk.length;
  });

  child.on('close', (exitCode) => {
    if (finished) return;
    cleanup();
    onExit(exitCode, Date.now() - startTime, timedOut);
  });

  child.on('error', (err) => {
    if (finished) return;
    cleanup();
    let msg = err.message;
    if (err.code === 'ENOENT') msg = `Command not found: "${command}".`;
    onStderr(msg);
    onExit(1, Date.now() - startTime, false);
  });
}

function writeToProcess(data) {
  if (activeProcess && activeProcess.stdin && activeProcess.stdin.writable) {
    try {
      activeProcess.stdin.write(data);
    } catch (e) {
      console.warn('Failed to write to stdin:', e.message);
    }
  }
}

function killInteractiveProcess() {
  if (activeProcess) {
    try {
      if (isWin) {
        spawn('taskkill', ['/pid', String(activeProcess.pid), '/f', '/t'], { windowsHide: true });
      } else {
        activeProcess.kill('SIGKILL');
      }
    } catch (e) {
      activeProcess.kill('SIGKILL');
    }
    activeProcess = null;
  }
}

function cleanupFiles(files) {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (e) {}
  }
}

// -- Workspace File Management APIs --
let currentRollNumber = 'default';

function setWorkspaceRollNumber(roll) {
  currentRollNumber = roll;
}

function getWorkspacePath() {
  const ws = path.join(tempDirPath, `workspace_${currentRollNumber}`);
  if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
  return ws;
}

function listWorkspaceFiles() {
  const ws = getWorkspacePath();
  try {
    const files = fs.readdirSync(ws);
    return files.filter(f => fs.statSync(path.join(ws, f)).isFile());
  } catch(e) { return []; }
}

function readWorkspaceFile(filename) {
  const ws = getWorkspacePath();
  const filePath = path.join(ws, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
}

function writeWorkspaceFile(filename, content) {
  const ws = getWorkspacePath();
  const filePath = path.join(ws, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function deleteWorkspaceFile(filename) {
  const ws = getWorkspacePath();
  const filePath = path.join(ws, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
}

function clearWorkspace() {
  const ws = getWorkspacePath();
  try {
    const files = fs.readdirSync(ws);
    for (const file of files) {
      if (file !== 'main.exe' && file !== 'main.out') {
        fs.unlinkSync(path.join(ws, file));
      }
    }
  } catch(e) {}
}

async function zipAndUploadWorkspace(rollNumber, serverUrl) {
  return new Promise((resolve) => {
    const ws = getWorkspacePath();
    const zipPath = path.join(tempDirPath, `workspace_${rollNumber}.zip`);
    
    try {
      const zip = new AdmZip();
      zip.addLocalFolder(ws);
      zip.writeZip(zipPath);
      
      // Upload via HTTP form-data
      const form = new FormData();
      form.append('roll_number', rollNumber);
      form.append('workspace_zip', fs.createReadStream(zipPath), `workspace_${rollNumber}.zip`);
      
      const urlObj = new URL(`${serverUrl}/api/admin/submit-workspace`);
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port || 3000,
        path: urlObj.pathname,
        method: 'POST',
        headers: form.getHeaders()
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', (err) => {
        console.error('[codeExecutor] Upload error:', err);
        resolve(false);
      });
      
      form.pipe(req);
    } catch (err) {
      console.error('[codeExecutor] Zip error:', err);
      resolve(false);
    }
  });
}

module.exports = { 
  startInteractiveProcess, 
  writeToProcess, 
  killInteractiveProcess,
  getWorkspacePath,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile,
  clearWorkspace,
  zipAndUploadWorkspace,
  setWorkspaceRollNumber
};
