// TEMPORARY: drives the REAL student portal (main.js, --dev --mock) through Chrome DevTools Protocol
// and saves screenshots for the project report. Deleted afterwards.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const ROOT = __dirname;
const OUT = process.argv[2];
const FEED = process.argv[3];
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject);
});

(async () => {
  const electron = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  const ud = path.join(require('os').tmpdir(), 'amu-student-shots');
  const app = spawn(electron, ['.', '--dev', '--mock', `--remote-debugging-port=${PORT}`, `--user-data-dir=${ud}`,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${FEED}`], { cwd: ROOT, stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json`);
      target = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
    } catch (e) { /* not up yet */ }
  }
  if (!target) { console.log('no page target; targets:', JSON.stringify(await getJson(`http://127.0.0.1:${PORT}/json`).catch((e) => String(e)))); app.kill(); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0; const pending = new Map();
  ws.on('message', (m) => { const o = JSON.parse(m); if (o.id && pending.has(o.id)) { pending.get(o.id)(o); pending.delete(o.id); } });
  const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async (name) => {
    await sleep(600);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
    console.log('saved', name);
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 810, deviceScaleFactor: 1, mobile: false });
  await sleep(2500);

  await shot('student_setup.png');

  // connect (mock mode simulates the server)
  await evalJs(`document.getElementById('input-server-ip').value = '10.11.43.81'; document.getElementById('input-server-port').value = '3000'; document.getElementById('btn-connect-server').click();`);
  await sleep(5500);
  await evalJs(`document.getElementById('input-roll').value = '24AIBEA142'; document.getElementById('input-password').value = 'exam123';`);
  await shot('student_login.png');

  await evalJs(`document.getElementById('btn-login').click()`);
  await sleep(2500);
  await shot('student_instructions.png');

  await evalJs(`const c = document.getElementById('chk-agree-instructions'); c.checked = true; c.dispatchEvent(new Event('change')); document.getElementById('btn-proceed-instructions').click();`);
  await sleep(2500);
  await shot('student_waiting.png');

  // mock exam starts when the countdown (10 s) reaches zero
  for (let i = 0; i < 40; i++) {
    const vis = await evalJs(`!document.getElementById('exam-screen').classList.contains('hidden')`);
    if (vis) break;
    await sleep(500);
  }
  await sleep(1200);

  await evalJs(`(() => {
    const m = monaco.editor.getModels()[0];
    m.setValue('def two_sum(nums, target):\\n    seen = {}\\n    for i, n in enumerate(nums):\\n        if target - n in seen:\\n            return [seen[target - n], i]\\n        seen[n] = i\\n\\nprint(two_sum([2, 7, 11, 15], 9))\\n');
  })()`);
  await sleep(400);
  await evalJs(`document.getElementById('btn-run').click()`);
  await sleep(1800);
  await shot('student_exam.png');

  // proctor warning: no face in the (neutral) camera picture -> the real 3 s absence rule fires
  for (let i = 0; i < 30; i++) {
    const shown = await evalJs(`(() => { const b = document.getElementById('webcam-warning-banner'); return !!b && b.style.display !== 'none' && b.style.opacity !== '0'; })()`);
    if (shown) break;
    await sleep(300);
  }
  await shot('student_proctor_alert.png');

  await sleep(4500);
  await evalJs(`document.getElementById('btn-final-submit').click()`);
  await sleep(800);
  await shot('student_submit_confirm.png');

  ws.close();
  try { spawn('taskkill', ['/pid', String(app.pid), '/f', '/t']); } catch (e) { /* ignore */ }
  setTimeout(() => process.exit(0), 500);
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 150000);
