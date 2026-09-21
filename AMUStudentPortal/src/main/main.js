'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  session,
  dialog,
  shell,
  desktopCapturer,
} = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const { 
  startInteractiveProcess, writeToProcess, killInteractiveProcess,
  listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile, deleteWorkspaceFile, clearWorkspace, getWorkspacePath, zipAndUploadWorkspace, setWorkspaceRollNumber
} = require('./codeExecutor');
const { getClientIP, getAllIPs } = require('./networkUtils');
const { SERVER_URL, EVENTS } = require('../common/constants');

// ── CLI Flags ──
const isDevMode  = process.argv.includes('--dev');
const isMockMode = process.argv.includes('--mock');

let mainWindow = null;
let socketClient = null;       // Socket.io client (loaded dynamically)
let clientIP    = '127.0.0.1';
let focusViolations = 0;
let allowExit = false;
let previousUsbCount = 0;
let usbPollingInterval = null;
let blockKeysProcess = null;
let usbDetectorProcess = null;
let screenStreamInterval = null;
let isLicenseValid = false;

const LICENSE_DIR = 'C:\\ProgramData\\AMUExamPortal';
const LICENSE_FILE = path.join(LICENSE_DIR, 'sys_lock.dat');
const MASTER_SECRET = 'AMU_AI_CENTER_AARIF_SECURE_2026';

function getMachineUUID() {
  try {
    const output = execSync('powershell.exe -Command "Get-CimInstance -Class Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID"').toString().trim();
    return output;
  } catch (err) {
    return 'UNKNOWN_UUID';
  }
}

function checkLicense() {
  if (!fs.existsSync(LICENSE_FILE)) return false;
  
  try {
    const encryptedData = fs.readFileSync(LICENSE_FILE, 'utf8');
    const parts = encryptedData.split(':');
    if (parts.length !== 2) return false;
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(MASTER_SECRET.padEnd(32, '0')), iv);
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    const storedUUID = decrypted.toString();
    const currentUUID = getMachineUUID();
    
    return storedUUID === currentUUID;
  } catch (err) {
    console.error('License verification failed:', err);
    return false;
  }
}

function createHardwareLock() {
  if (!fs.existsSync(LICENSE_DIR)) {
    fs.mkdirSync(LICENSE_DIR, { recursive: true });
  }
  const currentUUID = getMachineUUID();
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MASTER_SECRET.padEnd(32, '0')), iv);
  
  let encrypted = cipher.update(currentUUID);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const lockedData = iv.toString('hex') + ':' + encrypted.toString('hex');
  fs.writeFileSync(LICENSE_FILE, lockedData, 'utf8');
}

function verifyAakoLicense(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    // Basic verification: The Admin server will generate an AES encrypted generic token
    const parts = fileContent.split(':');
    if (parts.length !== 2) return false;
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(MASTER_SECRET.padEnd(32, '0')), iv);
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    if (decrypted.toString() === 'AMU_MASTER_LICENSE_AUTHORIZED') {
      createHardwareLock();
      return true;
    }
    return false;
  } catch (err) {
    console.error('AAKO verification failed:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
//  1.  Window Creation
// ═══════════════════════════════════════════════════════════

function createMainWindow() {
  mainWindow = new BrowserWindow({
    // ── Kiosk / Lockdown ──
    fullscreen: !isDevMode,
    kiosk:      !isDevMode,   // True kiosk hides taskbar & system UI
    alwaysOnTop: !isDevMode,
    resizable:   isDevMode,
    movable:     isDevMode,
    frame:       false,       // We draw our own XP title bar
    autoHideMenuBar: true,

    // ── Appearance ──
    show: false,              // Avoid white flash; show on 'ready-to-show'
    backgroundColor: '#008080', // Classic teal desktop
    minWidth:  800,
    minHeight: 600,
    icon: path.join(__dirname, '../../app_icon.png'),

    // ── Security ──
    webPreferences: {
      nodeIntegration:  false,    // CRITICAL: No Node.js in renderer
      contextIsolation: true,     // CRITICAL: Isolated execution worlds
      sandbox:          true,     // Chromium sandbox enabled
      webviewTag:       false,    // No <webview> attack surface
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDevMode,        // DevTools only in --dev mode
    },
  });

  isLicenseValid = checkLicense();

  if (isLicenseValid) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/setup.html'));
  }

  if (!isDevMode && isLicenseValid) {
    // Extreme top-level to hide Windows Start Menu
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    // Hook into blur to aggressively steal back focus
    setInterval(() => {
      if (mainWindow && !mainWindow.isFocused()) {
        mainWindow.focus();
      }
    }, 500);
  }

  // Show once DOM is ready (no white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDevMode) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
      console.log('[Main] Running in DEV mode - kiosk disabled');
    }
    if (isMockMode) {
      console.log('[Main] Running in MOCK mode - server connection simulated');
    }
  });

  // ── Prevent navigation away from app ──
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // ── Focus Loss Tracking ──
  mainWindow.on('blur', () => {
    if (!isDevMode) {
      focusViolations++;
      mainWindow.webContents.send('exam-event', {
        type: 'FOCUS_LOST',
        violationCount: focusViolations,
      });
      mainWindow.focus();
    }
  });

  mainWindow.on('close', (e) => {
    if (!isDevMode && !allowExit) {
      e.preventDefault(); // Block Taskbar Close, Alt+F4, etc.
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ═══════════════════════════════════════════════════════════
//  2.  Keyboard Lockdown
// ═══════════════════════════════════════════════════════════

function registerKeyboardLocks() {
  if (isDevMode) return;

  const blocked = [
    'Alt+Tab', 'Alt+F4',
    'Ctrl+W', 'Ctrl+Shift+W',
    'Ctrl+Shift+I', 'Ctrl+Shift+J',   // DevTools
    'Ctrl+R', 'Ctrl+Shift+R', 'F5',   // Refresh
    'Ctrl+N', 'Ctrl+T',                // New window/tab
    'Meta+Tab', 'Meta+D',              // Windows key combos
    'Escape', 'CommandOrControl+Esc', 'Alt+Space', 'CommandOrControl+Shift+Esc',
    'F1', 'F2', 'F3', 'F4', 'F6',
    'F8', 'F9', 'F10', 'F11', 'F12',
  ];

  for (const shortcut of blocked) {
    try {
      globalShortcut.register(shortcut, () => {
        // Silently swallow — do nothing
      });
    } catch (e) {
      console.warn(`[Main] Could not block shortcut: ${shortcut}`);
    }
  }

  // Master Exit Key
  globalShortcut.register('CommandOrControl+Shift+Alt+O', () => {
    console.log('[Main] Master exit key activated.');
    allowExit = true;
    app.quit();
  });

  // Block shortcuts at the webContents level too
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const block = (
      (input.alt && input.key === 'Tab') ||
      (input.alt && input.key === 'F4') ||
      (input.control && input.key === 'w') ||
      (input.control && input.key === 'W') ||
      (input.control && input.shift && input.key === 'I') ||
      (input.control && input.shift && input.key === 'J') ||
      (input.meta) ||
      (input.key === 'F12') ||
      (input.key === 'F11')
    );

    if (block) {
      event.preventDefault();
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  3.  Socket.io Connection (Server Communication)
// ═══════════════════════════════════════════════════════════

ipcMain.handle('connect-server', async (event, { ip, port }) => {
  const url = `http://${ip}:${port}`;
  initSocketConnection(url);
  return { success: true };
});

function initSocketConnection(serverUrl) {
  if (isDevMode && isMockMode) {
    console.log('[Socket] Mock mode - simulating server connection to ' + serverUrl);
    // Delay long enough for Monaco + all scripts to load in renderer
    setTimeout(() => {
      if (mainWindow) {
        mainWindow.webContents.send('connection-status', { connected: true, mock: true });
        // Send questions 1.5s after connection confirmed
        setTimeout(() => loadMockQuestions(), 1500);
      }
    }, 3500);
    return;
  }

  try {
    if (socketClient) {
      socketClient.disconnect();
      socketClient.removeAllListeners();
      socketClient = null;
    }

    // Dynamically require socket.io-client from node_modules
    const { io } = require('socket.io-client');

    socketClient = io(serverUrl, {
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    socketClient.on('connect', () => {
      console.log('[Socket] Connected to server');
      if (mainWindow) {
        mainWindow.webContents.send('connection-status', { connected: true, mock: false });
        // Send client IP for seat identification
        socketClient.emit('client-identify', { ip: clientIP });
      }
    });

    socketClient.on('stop_screen_capture', () => {
      console.log('[Main] Stopping screen capture stream.');
      if (screenStreamInterval) clearInterval(screenStreamInterval);
      screenStreamInterval = null;
    });

    socketClient.on('start_screen_capture', () => {
      console.log('[Main] Starting screen capture stream...');
      if (screenStreamInterval) clearInterval(screenStreamInterval);
      
      screenStreamInterval = setInterval(async () => {
        try {
          const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
          if (sources && sources.length > 0) {
            // Send JPEG compressed at roughly 30% quality for very low bandwidth
            const frameData = sources[0].thumbnail.toJPEG(30).toString('base64');
            socketClient.emit('screen_frame', { frameData: `data:image/jpeg;base64,${frameData}` });
          }
        } catch (err) {
          console.error('[Main] Screen capture error:', err);
        }
      }, 1000); // 1 FPS
    });

    socketClient.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
      if (mainWindow) {
        mainWindow.webContents.send('connection-status', { connected: false });
      }
    });

    socketClient.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('connection-status', { connected: false, error: err.message });
      }
    });

    // ── Teacher Commands ──
    socketClient.on(EVENTS.FORCE_LOCK,       () => forwardExamEvent({ type: 'FORCE_LOCK' }));
    socketClient.on(EVENTS.PAUSE_EXAM,       (d) => forwardExamEvent({ type: 'PAUSE_EXAM', ...d }));
    socketClient.on(EVENTS.RESUME_EXAM,      () => forwardExamEvent({ type: 'RESUME_EXAM' }));
    socketClient.on(EVENTS.SUBMIT_AND_CLOSE, () => forwardExamEvent({ type: 'SUBMIT_AND_CLOSE' }));
    socketClient.on(EVENTS.TIMER_SYNC,       (d) => {
      if (mainWindow) mainWindow.webContents.send('timer-sync', d);
    });
    socketClient.on(EVENTS.QUESTIONS_LOAD,   (questions) => {
      if (mainWindow) mainWindow.webContents.send('questions-loaded', questions);
    });
    socketClient.on(EVENTS.AUTH_SUCCESS,     (data) => {
      if (mainWindow) mainWindow.webContents.send('auth-result', { success: true, ...data });
    });
    socketClient.on(EVENTS.AUTH_FAILURE,     (data) => {
      if (mainWindow) mainWindow.webContents.send('auth-result', { success: false, ...data });
    });
    
    // ── Exam State Commands ──
    socketClient.on('exam_started', () => forwardExamEvent({ type: 'exam_started' }));
    socketClient.on('exam_scheduled', (data) => forwardExamEvent({ type: 'exam_scheduled', data }));

    // ── Invigilator Commands ──
    socketClient.on('warning', (data) => {
      if (mainWindow) mainWindow.webContents.send('invigilator-event', { type: 'WARNING', ...data });
    });
    socketClient.on('announcement', (data) => {
      if (mainWindow) mainWindow.webContents.send('invigilator-event', { type: 'ANNOUNCEMENT', ...data });
    });
    socketClient.on('screen_lock', (data) => {
      if (mainWindow) mainWindow.webContents.send('invigilator-event', { type: 'SCREEN_LOCK', ...data });
    });
    socketClient.on('screen_unlock', () => {
      if (mainWindow) mainWindow.webContents.send('invigilator-event', { type: 'SCREEN_UNLOCK' });
    });
    socketClient.on('emergency_kill', () => {
      console.log('[Main] Received emergency kill command from server');
      if (blockKeysProcess) blockKeysProcess.kill();
      app.exit(0);
    });

  } catch (err) {
    console.error('[Socket] Failed to initialize socket.io-client:', err.message);
    if (mainWindow) {
      mainWindow.webContents.send('connection-status', { connected: false, error: 'Socket module unavailable. Run npm install.' });
    }
  }
}

function forwardExamEvent(data) {
  if (mainWindow) {
    mainWindow.webContents.send('exam-event', data);
  }
}

// ═══════════════════════════════════════════════════════════
//  4.  IPC Handlers  (Renderer → Main)
// ═══════════════════════════════════════════════════════════

function registerIpcHandlers() {

  // ── Code Execution (Interactive) ──
  ipcMain.handle('start-interactive', async (event, { code, language }) => {
    // Send output back to the specific renderer that started it
    const sender = event.sender;
    
    startInteractiveProcess(
      code, 
      language,
      // onStdout
      (data) => sender.send('terminal-output', data),
      // onStderr
      (data) => sender.send('terminal-error', data),
      // onExit
      (exitCode, executionTime, timedOut) => sender.send('terminal-exit', { exitCode, executionTime, timedOut })
    );
    return { success: true };
  });

  ipcMain.on('terminal-input', (_event, text) => {
    writeToProcess(text);
  });

  ipcMain.on('stop-interactive', () => {
    killInteractiveProcess();
  });

  // ── Workspace File System ──
  ipcMain.handle('list-workspace', () => listWorkspaceFiles());
  ipcMain.handle('read-workspace', (_event, filename) => readWorkspaceFile(filename));
  ipcMain.handle('write-workspace', (_event, { filename, content }) => writeWorkspaceFile(filename, content));
  ipcMain.handle('delete-workspace', (_event, filename) => deleteWorkspaceFile(filename));
  ipcMain.handle('clear-workspace', () => clearWorkspace());

  // ── Authentication ──
  ipcMain.handle('authenticate', async (_event, { rollNumber, examPassword }) => {
    if (isMockMode) {
      setWorkspaceRollNumber(rollNumber || 'mock');
      return mockAuthenticate(rollNumber, examPassword);
    }

    if (!socketClient || !socketClient.connected) {
      return { success: false, message: 'Server not connected' };
    }

    return new Promise((resolve) => {
      socketClient.emit('auth', { rollNumber, password: examPassword, clientIP }, (result) => {
        if (result.success) {
          setWorkspaceRollNumber(rollNumber);
        }
        resolve(result);
      });
      // We set a timeout in case server doesn't respond
      setTimeout(() => resolve({ success: false, message: 'Server did not respond. Try again.' }), 8000);
    });
  });

  // ── Client IP ──
  ipcMain.handle('get-client-ip', () => clientIP);

  // ── Code Submission ──
  ipcMain.handle('submit-code', async (_event, { questionId, code, language }) => {
    if (isMockMode) {
      console.log(`[Mock] Submitting Q${questionId}: ${language} (${code.length} chars)`);
      return { success: true };
    }
    if (socketClient && socketClient.connected) {
      socketClient.emit('submit-code', { questionId, code, language, clientIP });
      return { success: true };
    }
    return { success: false, message: 'Not connected to server.' };
  });

  // ── Final Submit All ──
  ipcMain.handle('final-submit-all', async (_event, { codeBuffers, rollNumber }) => {
    if (isMockMode) {
      console.log('[Mock] Final submit:', JSON.stringify(Object.keys(codeBuffers)));
      return { success: true };
    }

    // Zip and upload the workspace
    if (rollNumber) {
      const zipSuccess = await zipAndUploadWorkspace(rollNumber, SERVER_URL);
      if (!zipSuccess) {
        console.warn('[Main] Workspace zip upload failed or returned false.');
      } else {
        console.log('[Main] Workspace zip uploaded successfully.');
      }
    }

    if (socketClient && socketClient.connected) {
      socketClient.emit('final-submit', { codeBuffers, clientIP });
      return { success: true };
    }
    // Fallback: HTTP POST
    return submitViaHttp(codeBuffers);
  });

  // ── App Info ──
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    clientIP,
    allIPs: getAllIPs(),
    devMode: isDevMode,
    mockMode: isMockMode,
    serverURL: SERVER_URL,
    platform: process.platform,
  }));

  // ── Anti-Cheat Report (fire-and-forget) ──
  ipcMain.on('report-focus-loss', (_event) => {
    console.warn(`[AntiCheat] Focus loss reported. Total violations: ${focusViolations}`);
    if (socketClient && socketClient.connected) {
      socketClient.emit('focus-loss', { clientIP, focusViolations });
    }
  });
}

// ── HTTP Fallback Submission ──
function submitViaHttp(codeBuffers) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ codeBuffers, clientIP });
    const url = new URL(`${SERVER_URL}/api/submit`);

    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      resolve({ success: res.statusCode === 200 });
    });

    req.on('error', (err) => {
      resolve({ success: false, message: err.message });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ success: false, message: 'HTTP submission timed out.' });
    });

    req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
//  5.  Mock Data (--mock mode for standalone testing)
// ═══════════════════════════════════════════════════════════

function mockAuthenticate(rollNumber, examPassword) {
  if (!rollNumber || rollNumber.trim() === '') {
    return { success: false, message: 'Roll Number cannot be empty.' };
  }
  if (examPassword !== 'exam123') {
    return { success: false, message: 'Invalid credentials. Hint: use "exam123".' };
  }
  return {
    success: true,
    studentName: `Student ${rollNumber}`,
    rollNumber,
    examTitle: 'CS301 — Data Structures Mid-Term',
    durationMinutes: 90,
    globalScheduledTime: Date.now() + 10000,
    mockMode: true
  };
}

function loadMockQuestions() {
  const mockQuestions = [
    {
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      description: 'Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.',
      constraints: '• 2 ≤ nums.length ≤ 10⁴\n• -10⁹ ≤ nums[i] ≤ 10⁹\n• -10⁹ ≤ target ≤ 10⁹\n• Only one valid answer exists.',
      sampleInput: 'nums = [2, 7, 11, 15], target = 9',
      sampleOutput: '[0, 1]',
      explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].',
      testCases: [
        { input: '4\n2 7 11 15\n9', expected: '0 1' },
        { input: '3\n3 2 4\n6', expected: '1 2' },
      ],
    },
    {
      id: 2,
      title: 'Reverse a String',
      difficulty: 'Easy',
      description: 'Write a function that reverses a string. The input string is given as an array of characters `s`.\n\nYou must do this by modifying the input array in-place with O(1) extra memory.',
      constraints: '• 1 ≤ s.length ≤ 10⁵\n• s[i] is a printable ASCII character.',
      sampleInput: 's = ["h","e","l","l","o"]',
      sampleOutput: '["o","l","l","e","h"]',
      explanation: 'The string "hello" reversed is "olleh".',
      testCases: [
        { input: 'hello', expected: 'olleh' },
        { input: 'abcde', expected: 'edcba' },
      ],
    },
    {
      id: 3,
      title: 'Fibonacci Sequence',
      difficulty: 'Medium',
      description: 'Given a number N, print the first N terms of the Fibonacci sequence.\n\nThe Fibonacci sequence is: 0, 1, 1, 2, 3, 5, 8, 13, ...\nwhere each number is the sum of the two preceding ones.',
      constraints: '• 1 ≤ N ≤ 50',
      sampleInput: 'N = 7',
      sampleOutput: '0 1 1 2 3 5 8',
      explanation: 'The first 7 Fibonacci numbers are 0, 1, 1, 2, 3, 5, 8.',
      testCases: [
        { input: '7', expected: '0 1 1 2 3 5 8' },
        { input: '1', expected: '0' },
      ],
    },
  ];

  if (mainWindow) {
    mainWindow.webContents.send('questions-loaded', mockQuestions);
  }
}

// ═══════════════════════════════════════════════════════════
//  6.  CSP (Content Security Policy)
// ═══════════════════════════════════════════════════════════

function applyCSP() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;" +
          "script-src * 'unsafe-inline' 'unsafe-eval' blob:;" +
          "style-src * 'unsafe-inline';"
        ],
      },
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  7.  App Lifecycle
// ═══════════════════════════════════════════════════════════

app.whenReady().then(async () => {
  // Detect client IP before anything else
  clientIP = getClientIP();
  console.log(`[Main] Client IP: ${clientIP}`);

  if (!isDevMode) {
    const { spawn } = require('child_process');
    const blockKeysPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'BlockKeys.exe')
      : path.join(__dirname, '../../BlockKeys.exe');
      
    blockKeysProcess = spawn(blockKeysPath);
    blockKeysProcess.on('error', (err) => console.log('BlockKeys error:', err));
  }

  applyCSP();
  createMainWindow();
  registerIpcHandlers();
  registerKeyboardLocks();
  startUsbDetection();

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
});

function startUsbDetection() {
  if (isDevMode) return;
  const { spawn } = require('child_process');
  const path = require('path');
  
  const exePath = app.isPackaged 
    ? path.join(process.resourcesPath, 'DetectUSB.exe')
    : path.join(__dirname, '..', '..', 'DetectUSB.exe');
  
  usbDetectorProcess = spawn(exePath);
  
  usbDetectorProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('USB_INSERTED')) {
      console.log('[Main] Event-driven USB insertion detected!');
      if (mainWindow) {
        mainWindow.webContents.send('exam-event', { type: 'USB_DETECTED' });
      }
      if (socketClient) {
        socketClient.emit('usb_detected', { ip: clientIP });
      }
    }
  });

  usbDetectorProcess.on('error', (err) => {
    console.error('Failed to start USB detector:', err);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ═══════════════════════════════════════════════════════════
//  LICENSE AND SETUP LOGIC
// ═══════════════════════════════════════════════════════════

ipcMain.handle('manual-license-browse', async () => {
  if (!isDevMode) {
    mainWindow.setAlwaysOnTop(false);
  }

  // Create a dummy transparent window to host the dialog so it doesn't freeze under kiosk mode
  const dummyWin = new BrowserWindow({
    show: false,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    width: 10,
    height: 10
  });

  const { canceled, filePaths } = await dialog.showOpenDialog(dummyWin, {
    title: 'Select AMU License Token',
    filters: [{ name: 'AMU License', extensions: ['aako'] }],
    properties: ['openFile']
  });
  
  dummyWin.close();

  if (!isDevMode) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  if (canceled || filePaths.length === 0) return false;

  mainWindow.webContents.send('license-processing');
  const valid = verifyAakoLicense(filePaths[0]);
  
  if (valid) {
    mainWindow.webContents.send('license-success');
    isLicenseValid = true;
    
    // Slight delay so the renderer promise resolves cleanly before context is destroyed
    setTimeout(() => {
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      if (!isDevMode) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    }, 1000);
    
    return true;
  } else {
    mainWindow.webContents.send('license-error', 'Invalid or Corrupted License Token.');
    return false;
  }
});

function startUSBDetector() {
  const detectorPath = app.isPackaged
    ? path.join(process.resourcesPath, 'DetectUSB.exe')
    : path.join(__dirname, '../../DetectUSB.exe');
  if (fs.existsSync(detectorPath)) {
    usbDetectorProcess = spawn(detectorPath, [], { detached: true });
    
    usbDetectorProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('USB_INSERTED')) {
        console.log('[AntiCheat] USB Insertion Detected via WMI Event');
        
        // If in setup mode, scan for amutestlicense.aako
        if (!isLicenseValid && mainWindow) {
          mainWindow.webContents.send('usb-inserted');
          setTimeout(() => {
            mainWindow.webContents.send('license-processing');
            let found = false;
            // Scan D: to Z:
            for (let i = 68; i <= 90; i++) {
              const drive = String.fromCharCode(i) + ':\\';
              const licensePath = path.join(drive, 'amutestlicense.aako');
              if (fs.existsSync(licensePath)) {
                found = true;
                const valid = verifyAakoLicense(licensePath);
                if (valid) {
                  mainWindow.webContents.send('license-success');
                  isLicenseValid = true;
                  
                  // Redirect instantly
                  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
                  if (!isDevMode) {
                    mainWindow.setAlwaysOnTop(true, 'screen-saver');
                  }
                  break;
                } else {
                  mainWindow.webContents.send('license-error', 'Token found on USB, but it is invalid or corrupted.');
                  break;
                }
              }
            }
            if (!found) {
              mainWindow.webContents.send('license-error', 'No amutestlicense.aako found on the inserted USB.');
            }
          }, 300); // 300ms delay so the UI can briefly show "USB Inserted"
        }
      }
    });

    usbDetectorProcess.on('error', (err) => {
      console.error('[AntiCheat] Failed to start USB Detector:', err);
    });
  }
}

app.on('window-all-closed', () => {
  if (usbPollingInterval) clearInterval(usbPollingInterval);
  if (socketClient) socketClient.disconnect();
  globalShortcut.unregisterAll();
  if (blockKeysProcess) blockKeysProcess.kill();
  if (usbDetectorProcess) usbDetectorProcess.kill();
  if (screenStreamInterval) clearInterval(screenStreamInterval);
  app.quit();
});

app.whenReady().then(() => {
  registerKeyboardLocks();
  startUSBDetector();
  createMainWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// Prevent creating additional windows (security)
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
