const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { startServer, stopServer, getLocalIpAddress, getConnectedClients } = require('./server');
const { initDB, setAdminPassword } = require('./db');

let mainWindow;
let adminCredentials = null;

async function initializeApp() {
  await initDB();
  
  // Generate a new 6-digit numeric password every time the app starts
  const newPass = Math.floor(100000 + Math.random() * 900000).toString();
  await setAdminPassword(newPass);
  
  adminCredentials = { id: 'admin', password: newPass };
  console.log('[Main] Generated new Admin Credentials for this session');

  createWindow();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: "AMU Admin Server",
    icon: path.join(__dirname, 'app_icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  initializeApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-local-ip', () => {
  return getLocalIpAddress();
});

ipcMain.handle('get-admin-credentials', () => {
  return adminCredentials;
});

ipcMain.handle('open-external', (event, url) => {
  require('electron').shell.openExternal(url);
});

ipcMain.handle('start-server', async (event, port) => {
  try {
    const info = await startServer(port, mainWindow);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-server', () => {
  try {
    stopServer();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-connected-clients', () => {
  return getConnectedClients();
});

ipcMain.handle('generate-aako', async () => {
  const MASTER_SECRET = 'AMU_AI_CENTER_AARIF_SECURE_2026';
  
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Master License Token to USB',
    defaultPath: 'amutestlicense.aako',
    filters: [{ name: 'AMU License', extensions: ['aako'] }]
  });

  if (canceled || !filePath) return false;

  const payload = 'AMU_MASTER_LICENSE_AUTHORIZED';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MASTER_SECRET.padEnd(32, '0')), iv);
  
  let encrypted = cipher.update(payload);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const lockedData = iv.toString('hex') + ':' + encrypted.toString('hex');
  fs.writeFileSync(filePath, lockedData, 'utf8');
  
  return true;
});
