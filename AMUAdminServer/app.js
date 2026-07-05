const setupPanel = document.getElementById('setup-panel');
const dashboardPanel = document.getElementById('dashboard-panel');
const ipDisplay = document.getElementById('ip-display');
const portInput = document.getElementById('port-input');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const errorMsg = document.getElementById('error-msg');

const serverLogs = document.getElementById('server-logs');
const adminId = document.getElementById('admin-id');
const adminPass = document.getElementById('admin-pass');
const webUrl = document.getElementById('web-url');
const studentIp = document.getElementById('student-ip');
const studentPort = document.getElementById('student-port');

let currentPassword = '';

function addLog(msg) {
  if (serverLogs) {
    const d = new Date();
    const timeStr = d.toLocaleTimeString([], { hour12: false });
    const div = document.createElement('div');
    div.textContent = `[${timeStr}] ${msg}`;
    serverLogs.appendChild(div);
    
    // Prevent UI hang by keeping only the last 200 log messages
    while (serverLogs.childNodes.length > 200) {
      serverLogs.removeChild(serverLogs.firstChild);
    }
    
    serverLogs.scrollTop = serverLogs.scrollHeight;
  }
}

// Initialize
async function init() {
  const ip = await window.adminAPI.getLocalIp();
  ipDisplay.textContent = ip;

  const creds = await window.adminAPI.getAdminCredentials();
  if (creds) {
    adminId.textContent = creds.id;
    currentPassword = creds.password;
  }
}

// Password UI Logic
const btnShowPass = document.getElementById('btn-show-pass');
const btnCopyPass = document.getElementById('btn-copy-pass');

let passVisible = false;
btnShowPass.addEventListener('click', () => {
  passVisible = !passVisible;
  if (passVisible) {
    adminPass.textContent = currentPassword;
    adminPass.style.letterSpacing = '1px';
    btnShowPass.textContent = 'Hide';
  } else {
    adminPass.textContent = '***';
    adminPass.style.letterSpacing = '2px';
    btnShowPass.textContent = 'Show';
  }
});

btnCopyPass.addEventListener('click', () => {
  navigator.clipboard.writeText(currentPassword);
  const oldText = btnCopyPass.textContent;
  btnCopyPass.textContent = 'Copied!';
  setTimeout(() => { btnCopyPass.textContent = oldText; }, 1500);
});

// URL click logic
let serverUrl = '';
webUrl.addEventListener('click', (e) => {
  e.preventDefault();
  if (serverUrl) {
    window.adminAPI.openExternal(serverUrl);
    addLog(`Opened Web Admin in external browser.`);
  }
});

btnStart.addEventListener('click', async () => {
  const port = parseInt(portInput.value, 10) || 3000;
  btnStart.disabled = true;
  errorMsg.textContent = 'Starting...';
  
  const result = await window.adminAPI.startServer(port);
  if (result.success) {
    errorMsg.textContent = '';
    
    // Highlighted Student Details
    studentIp.textContent = result.info.ip;
    studentPort.textContent = result.info.port;
    
    serverUrl = `http://${result.info.ip}:${result.info.port}/admin`;
    
    setupPanel.classList.add('hidden');
    dashboardPanel.classList.remove('hidden');
    
    addLog(`Server started on ${serverUrl}`);
  } else {
    errorMsg.textContent = 'Error: ' + result.error;
    addLog(`Error starting server: ${result.error}`);
  }
  btnStart.disabled = false;
});

btnStop.addEventListener('click', async () => {
  btnStop.disabled = true;
  await window.adminAPI.stopServer();
  addLog(`Server stopped.`);
  btnStop.disabled = false;
});

// Listeners
window.adminAPI.onClientsUpdate((clients) => {
  addLog(`Connected students count: ${clients.length}`);
});

if (window.adminAPI.onServerLog) {
  window.adminAPI.onServerLog((msg) => {
    addLog(msg);
  });
}

window.adminAPI.onServerStopped(() => {
  dashboardPanel.classList.add('hidden');
  setupPanel.classList.remove('hidden');
});

init();
