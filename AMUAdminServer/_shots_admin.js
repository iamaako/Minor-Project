// TEMPORARY: captures the admin launcher + web dashboard for the project report (deleted afterwards).
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');

const OUT = process.argv[2];
app.setPath('documents', fs.mkdtempSync(path.join(os.tmpdir(), 'amu-shots-')));
const { io } = require(path.join(__dirname, '..', 'AMUStudentPortal', 'node_modules', 'socket.io-client'));
const db = require('./db');
const { startServer, stopServer, getLocalIpAddress, getNetworkCandidates } = require('./server');

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = '';
const api = async (method, url, body) => {
  const res = await fetch(BASE + url, { method, headers: Object.assign({ cookie }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  return { res, json };
};
const shot = async (win, name) => {
  await sleep(700);
  win.webContents.invalidate();
  await sleep(600);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name), img.toPNG());
  console.log('saved', name, img.getSize().width + 'x' + img.getSize().height);
};

const CODES = {
  python: 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n\nn = int(input())\nnums = list(map(int, input().split()))\nprint(two_sum(nums, int(input())))\n',
  cpp: '#include <iostream>\n#include <vector>\nusing namespace std;\nint main() {\n    int n; cin >> n;\n    vector<int> v(n);\n    for (auto &x : v) cin >> x;\n    cout << v.size() << endl;\n    return 0;\n}\n',
};

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await db.initDB();
  await db.setAdminPassword('482913');
  let launcher;

  ipcMain.handle('get-network-candidates', () => getNetworkCandidates());
  ipcMain.handle('get-local-ip', () => getLocalIpAddress());
  ipcMain.handle('get-admin-credentials', () => ({ id: 'admin', password: '482913' }));
  ipcMain.handle('start-server', async (e, port) => ({ success: true, info: await startServer(port, launcher) }));
  ipcMain.handle('stop-server', () => { stopServer(); return { success: true }; });
  ipcMain.handle('open-external', () => {});
  ipcMain.handle('generate-aako', () => false);
  ipcMain.handle('get-connected-clients', () => []);

  // ── 1. Launcher window ──
  launcher = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  await launcher.loadFile('index.html');
  await sleep(1500);
  await shot(launcher, 'admin_launcher_setup.png');
  await launcher.webContents.executeJavaScript(`document.getElementById('port-input').value = '${PORT}'; document.getElementById('btn-start').click();`);
  await sleep(1500);

  // ── 2. Sample data (fictitious) ──
  const login = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: '482913' }) });
  cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const adminToken = (await login.json()).adminToken;

  const students = [
    ['24AIBEA101', 'Ayesha Siddiqui'], ['24AIBEA102', 'Rahul Verma'], ['24AIBEA103', 'Mohd Faizan'], ['24AIBEA104', 'Sana Parveen'],
    ['24AIBEA105', 'Imran Ansari'], ['24AIBEA106', 'Neha Gupta'], ['24AIBEA107', 'Zaid Hussain'], ['24AIBEA108', 'Priya Singh'],
  ];
  for (const [r, n] of students) await api('POST', '/api/admin/students', { roll_number: r, name: n, password: 'pass' + r.slice(-3) });
  const qs = [
    { id: 'Q1', title: 'Two Sum', difficulty: 'Easy', description: 'Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target.', constraints: '2 <= nums.length <= 10^4', sampleInput: '4\n2 7 11 15\n9', sampleOutput: '[0, 1]', explanation: 'nums[0] + nums[1] == 9', time_limit: 30, testCases: [{ input: '4\n2 7 11 15\n9', expected: '[0, 1]' }] },
    { id: 'Q2', title: 'Reverse a String', difficulty: 'Easy', description: 'Write a program that reverses a given string.', constraints: '1 <= length <= 10^5', sampleInput: 'hello', sampleOutput: 'olleh', explanation: 'The string hello reversed is olleh.', time_limit: 20, testCases: [{ input: 'hello', expected: 'olleh' }] },
    { id: 'Q3', title: 'Fibonacci Sequence', difficulty: 'Medium', description: 'Print the first N terms of the Fibonacci sequence.', constraints: '1 <= N <= 50', sampleInput: '7', sampleOutput: '0 1 1 2 3 5 8', explanation: 'First seven terms.', time_limit: 25, testCases: [{ input: '7', expected: '0 1 1 2 3 5 8' }] },
  ];
  for (const q of qs) await api('POST', '/api/admin/questions', q);
  for (const [r] of students) await api('POST', '/api/admin/students/assign-questions', { roll_number: r, questions: ['Q1', 'Q2', 'Q3'] });
  await api('POST', '/api/admin/settings/duration', { duration: 90 });
  await api('POST', '/api/admin/settings/state', { action: 'start' });

  // generic camera snapshot for the webcam alert cards (a plain silhouette, not a real person)
  const snap = await launcher.webContents.executeJavaScript(`(() => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 240); g.addColorStop(0, '#3b4452'); g.addColorStop(1, '#1f252e');
    x.fillStyle = g; x.fillRect(0, 0, 320, 240);
    x.fillStyle = '#8b95a5';
    x.beginPath(); x.arc(160, 98, 46, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(160, 250, 105, 82, 0, Math.PI, 0); x.fill();
    return c.toDataURL('image/jpeg', 0.6); })()`);

  // ── 3. Simulated students ──
  const socks = [];
  const connect = () => new Promise((resolve, reject) => { const s = io(BASE, { transports: ['websocket'], reconnection: false }); s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
  const metrics = [
    { wpm: 38, idle: 4, var: 85, bs: 14, score: 4, risk: 'NORMAL', anomalies: [], lang: 'python' },
    { wpm: 44, idle: 2, var: 72, bs: 11, score: 8, risk: 'NORMAL', anomalies: [], lang: 'python' },
    { wpm: 151, idle: 1, var: 9, bs: 0, score: 82, risk: 'HIGH_RISK', anomalies: ['[10:42:15] Abnormally high typing speed (151 WPM)', '[10:41:58] Sudden code injection (+212 characters in 3ms)'], lang: 'cpp' },
    { wpm: 29, idle: 21, var: 140, bs: 19, score: 6, risk: 'NORMAL', anomalies: [], lang: 'python' },
    { wpm: 58, idle: 68, var: 60, bs: 3, score: 41, risk: 'UNUSUAL', anomalies: ['[10:40:02] Burst Typing (74 chars) immediately after 68s idle'], lang: 'python' },
    { wpm: 41, idle: 6, var: 96, bs: 12, score: 5, risk: 'NORMAL', anomalies: [], lang: 'cpp' },
  ];
  for (let i = 0; i < metrics.length; i++) {
    const s = await connect(); socks.push(s);
    const [roll] = students[i];
    s.emit('client-identify', { systemNumber: 'SYS-' + String(i + 1).padStart(2, '0'), hostname: 'LAB-PC-' + (i + 1), ip: '10.58.242.' + (20 + i) });
    await new Promise((r) => s.emit('auth', { rollNumber: roll, password: 'pass' + roll.slice(-3), systemNumber: 'SYS-' + String(i + 1).padStart(2, '0') }, r));
    const m = metrics[i];
    s.emit('student_behavior', { wpm: m.wpm, idleSeconds: m.idle, keystrokeVariance: m.var, backspaceRatio: m.bs, suspicionScore: m.score, riskLevel: m.risk, anomalies: m.anomalies, currentCode: CODES[m.lang], currentLanguage: m.lang, alertAnomaly: m.anomalies[0] || null });
    await sleep(120);
  }
  await sleep(500);

  // ── 4. Launcher after start (dashboard panel) ──
  await shot(launcher, 'admin_launcher_running.png');

  // ── 5. Web dashboard ──
  const win = new BrowserWindow({ show: false, width: 1366, height: 1400, webPreferences: { contextIsolation: true } });
  await win.loadURL(BASE + '/admin');
  await sleep(1200);
  await shot(win, 'admin_web_login.png');
  await win.webContents.executeJavaScript(`document.getElementById('passInput').value = '482913'; document.getElementById('btnLogin').click();`);
  await sleep(3500);
  await win.webContents.executeJavaScript(`document.getElementById('monitor-tbody').scrollIntoView({ block: 'start' }); window.scrollBy(0, -90);`).catch(() => {});
  await sleep(800);
  await shot(win, 'admin_web_monitor.png');
  await win.webContents.executeJavaScript(`window.scrollTo(0, 0)`).catch(() => {});
  const cases = [[0, 'LOOKING_BESIDE', 'LEFT', 'HEAD', 3], [2, 'LOOKING_BESIDE', 'RIGHT', 'EYES', 2], [4, 'FACE_ABSENT', null, null, 4], [2, 'LOOKING_DOWN', 'DOWN', 'HEAD', 9]];
  for (const [idx, type, direction, cause, sec] of cases) {
    socks[idx].emit('webcam_violation', { type, direction, cause, durationSeconds: sec, snapshot: snap });
    await sleep(1700);
  }
  socks[3].emit('focus-loss', { focusViolations: 2 });
  socks[1].emit('submit-code', { questionId: 'Q1', code: CODES.python, language: 'python' });
  await sleep(7000); // let the red pop-up notices fade out
  const tabs = [['tab-analysis', 'admin_web_live_analysis.png'], ['tab-webcam-alerts', 'admin_web_webcam_alerts.png'], ['tab-students', 'admin_web_students.png'], ['tab-questions', 'admin_web_questions.png'], ['tab-logs', 'admin_web_logs.png']];
  for (const [t, f] of tabs) {
    await win.webContents.executeJavaScript(`document.getElementById('${t.replace('tab-', 'nav-')}').click()`).catch((e) => console.log('showTab failed', t, e.message));
    await sleep(1500);
    await win.webContents.executeJavaScript(`window.scrollTo(0, 0); document.querySelectorAll('*').forEach((e) => { if (e.scrollTop > 0) e.scrollTop = 0; });`).catch(() => {});
    await sleep(1200);
    await shot(win, f);
  }
  socks.forEach((s) => s.disconnect());
  stopServer();
  app.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); app.exit(3); }, 170000);
