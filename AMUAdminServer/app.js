const setupPanel = document.getElementById('setup-panel');
const dashboardPanel = document.getElementById('dashboard-panel');
const ipDisplay = document.getElementById('ip-display');
const portInput = document.getElementById('port-input');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const errorMsg = document.getElementById('error-msg');
const btnDownloadLicense = document.getElementById('btnDownloadLicense');

if (btnDownloadLicense) {
  btnDownloadLicense.addEventListener('click', async () => {
    try {
      const success = await window.adminAPI.generateAako();
      if (success) {
        alert('Master License Token saved successfully to your USB Drive!');
      }
    } catch (err) {
      console.error('Failed to generate license:', err);
      alert('Error generating license: ' + err.message);
    }
  });
}

const serverLogs = document.getElementById('server-logs');
const adminId = document.getElementById('admin-id');
const adminPass = document.getElementById('admin-pass');
const webUrl = document.getElementById('web-url');
const studentIp = document.getElementById('student-ip');
const studentPort = document.getElementById('student-port');

let currentPassword = '';

const MAX_LOG_LINES = 30; // Strictly limit items to prevent UI hang & memory leaks

function addLog(msg) {
  if (serverLogs) {
    const d = new Date();
    const timeStr = d.toLocaleTimeString([], { hour12: false });
    const div = document.createElement('div');
    div.style.marginBottom = '3px';
    div.style.wordBreak = 'break-all';
    div.textContent = `[${timeStr}] ${msg}`;
    serverLogs.appendChild(div);
    
    // Retain only latest MAX_LOG_LINES
    while (serverLogs.childNodes.length > MAX_LOG_LINES) {
      serverLogs.removeChild(serverLogs.firstChild);
    }
    
    serverLogs.scrollTop = serverLogs.scrollHeight;
  }
}

// ── Network addresses ─────────────────────────────────────
// The list is re-read every few seconds: the laptop hotspot is often switched on
// AFTER this app was opened, and its address must show up without a restart.

const ipList = document.getElementById('ip-list');
const studentIpList = document.getElementById('student-ip-list');
let currentIp = '';
let serverRunning = false;

function _chip(c) {
  const el = document.createElement('span');
  el.textContent = `${c.address}  (${c.label})`;
  el.title = 'Click to copy';
  el.style.cssText = 'display:inline-block;margin:2px 6px 2px 0;padding:2px 9px;border-radius:999px;' +
    'background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;font-weight:600;cursor:pointer;';
  el.addEventListener('click', () => { navigator.clipboard.writeText(c.address); el.style.background = '#d1fae5'; });
  return el;
}

function _renderIpList(target, cands) {
  if (!target) return;
  target.textContent = '';
  const usable = cands.filter((c) => !c.virtual);
  const virtual = cands.filter((c) => c.virtual);

  if (usable.length === 0) {
    const warn = document.createElement('div');
    warn.textContent = 'No Wi-Fi, Ethernet or hotspot address found. Connect this PC to a network (or switch on Mobile Hotspot), ' +
      'then wait a few seconds. Other devices cannot reach this PC until then.';
    warn.style.cssText = 'color:#b91c1c;font-weight:600;';
    target.appendChild(warn);
  } else {
    const head = document.createElement('div');
    head.textContent = usable.length > 1 ? 'Use the address of the network the students are on:' : 'Students connect to:';
    head.style.cssText = 'color:#475569;';
    target.appendChild(head);
    usable.forEach((c) => target.appendChild(_chip(c)));
  }

  virtual.forEach((c) => {
    const note = document.createElement('div');
    note.textContent = `Ignored: ${c.address} (${c.name}) is a virtual adapter (VirtualBox / VMware / Hyper-V). Other devices cannot use it.`;
    note.style.cssText = 'color:#94a3b8;font-size:11px;';
    target.appendChild(note);
  });
}

async function refreshIps() {
  let cands = [];
  try { cands = await window.adminAPI.getNetworkCandidates(); } catch (e) { return; }
  const best = cands.find((c) => !c.virtual) || null;
  currentIp = best ? best.address : '';

  ipDisplay.textContent = best ? best.address : 'No network';
  ipDisplay.style.color = best ? '' : '#b91c1c';
  if (serverRunning && studentIp) studentIp.textContent = currentIp || 'No network';
  if (serverRunning) serverUrl = currentIp ? `http://${currentIp}:${studentPort.textContent}/admin` : '';

  _renderIpList(ipList, cands);
  _renderIpList(studentIpList, cands);
}

// Initialize
async function init() {
  await refreshIps();
  setInterval(refreshIps, 3000);

  const creds = await window.adminAPI.getAdminCredentials();
  if (creds) {
    adminId.textContent = creds.id;
    currentPassword = creds.password;
  }
}

// Copy IP Logic (with Checkmark Tick & Auto-Revert)
const btnCopyIp = document.getElementById('btn-copy-ip');
if (btnCopyIp) {
  const originalSvg = btnCopyIp.innerHTML;
  let copyIpTimeout = null;

  btnCopyIp.addEventListener('click', () => {
    const ip = currentIp;
    if (ip) {
      navigator.clipboard.writeText(ip);

      if (copyIpTimeout) clearTimeout(copyIpTimeout);

      // Show animated right tick (Checkmark)
      btnCopyIp.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="animation: checkmarkPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      btnCopyIp.classList.add('copied');
      btnCopyIp.setAttribute('title', 'Copied to clipboard!');

      // Revert back to copy icon after 2 seconds
      copyIpTimeout = setTimeout(() => {
        btnCopyIp.innerHTML = originalSvg;
        btnCopyIp.classList.remove('copied');
        btnCopyIp.setAttribute('title', 'Copy Local IP');
      }, 2000);
    }
  });
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

let passCopyTimeout = null;
btnCopyPass.addEventListener('click', () => {
  navigator.clipboard.writeText(currentPassword);
  if (passCopyTimeout) clearTimeout(passCopyTimeout);

  btnCopyPass.innerHTML = `✓ Copied!`;
  btnCopyPass.style.color = '#059669';
  btnCopyPass.style.borderColor = '#a7f3d0';
  btnCopyPass.style.background = '#ecfdf5';

  passCopyTimeout = setTimeout(() => {
    btnCopyPass.innerHTML = 'Copy';
    btnCopyPass.style.color = '';
    btnCopyPass.style.borderColor = '';
    btnCopyPass.style.background = '';
  }, 2000);
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
    serverRunning = true;
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
  serverRunning = false;
  dashboardPanel.classList.add('hidden');
  setupPanel.classList.remove('hidden');
});

init();
