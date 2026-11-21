'use strict';

/**
 * Generates the installer artwork for BOTH apps from the AMU seal:
 *   <app>/installer-assets/icon.ico               multi-size app / installer icon (16..256)
 *   <app>/installer-assets/installerSidebar.bmp   164x314 wizard side panel (welcome / finish)
 *   <app>/installer-assets/uninstallerSidebar.bmp same, for the uninstaller
 *   <app>/installer-assets/installerHeader.bmp    150x57 header strip of the inner wizard pages
 *
 * Run:  npx electron scripts/make-installer-assets.js [--preview <folder>]
 * (Electron is used only because it has a canvas; nothing is installed.)
 */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SEAL = path.join(ROOT, 'AMUStudentPortal', 'AMULogo.png');
const APPS = [
  // style 'light' = white badge, green seal (students).  style 'admin' = dark green badge, white seal, amber ring.
  { dir: path.join(ROOT, 'AMUStudentPortal', 'installer-assets'), title: 'AMU Exam Portal', subtitle: 'Secure Examination System', style: 'light' },
  { dir: path.join(ROOT, 'AMUAdminServer', 'installer-assets'), title: 'AMU Admin Server', subtitle: 'Examination Control Panel', style: 'admin' },
];
const GREEN = '#005200';          // the colour of the seal
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

// ── Runs inside the hidden window (has a canvas) ─────────────────────────────
const PAGE_CODE = `
(async (sealB64, apps, iconSizes, GREEN) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + sealB64;
  await img.decode();

  // 1. Seal as a coverage mask: dark green on white (or transparent) -> alpha.
  const S = 1024;
  const src = document.createElement('canvas'); src.width = src.height = S;
  const sx = src.getContext('2d', { willReadFrequently: true });
  sx.drawImage(img, 0, 0, S, S);
  const sd = sx.getImageData(0, 0, S, S).data;
  const mask = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    mask[i] = (sd[i * 4 + 3] / 255) * ((255 - sd[i * 4]) / 255);
  }
  const sealCanvas = (r, g, b, alpha = 1) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const out = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = b;
      out.data[i * 4 + 3] = Math.round(mask[i] * 255 * alpha);
    }
    x.putImageData(out, 0, 0);
    return c;
  };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const sealGreen = sealCanvas(...hex(GREEN));
  const sealWhite = sealCanvas(255, 255, 255);
  const sealGhost = sealCanvas(255, 255, 255, 0.07);

  // Halve step by step so small sizes stay clean
  const scaled = (srcC, size) => {
    let cur = srcC;
    while (cur.width / 2 >= size) {
      const n = document.createElement('canvas'); n.width = n.height = cur.width / 2;
      const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    const f = document.createElement('canvas'); f.width = f.height = size;
    const fx = f.getContext('2d'); fx.imageSmoothingQuality = 'high'; fx.drawImage(cur, 0, 0, size, size);
    return f;
  };
  const rgba = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < d.length; i += chunk) bin += String.fromCharCode.apply(null, d.subarray(i, i + chunk));
    return btoa(bin);
  };
  const png = (c) => c.toDataURL('image/png').split(',')[1];

  // 2. Icon frames: white disc + green seal (readable on dark and light backgrounds)
  const iconFrame = (s, style) => {
    const c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d');
    const edge = Math.max(0.5, s * 0.01);
    x.imageSmoothingQuality = 'high';
    if (style === 'admin') {
      // dark green badge + white seal + amber ring: clearly different from the student icon, even at 16 px
      x.fillStyle = '#0a5a14';
      x.beginPath(); x.arc(s / 2, s / 2, s / 2 - edge, 0, Math.PI * 2); x.fill();
      const ring = Math.max(1, s * 0.06);
      x.strokeStyle = '#f2b705'; x.lineWidth = ring;
      x.beginPath(); x.arc(s / 2, s / 2, s / 2 - edge - ring / 2, 0, Math.PI * 2); x.stroke();
      const inner = Math.round(s * 0.74);
      const o = Math.round((s - inner) / 2);
      x.drawImage(scaled(sealWhite, inner), o, o);
    } else {
      x.fillStyle = '#ffffff';
      x.beginPath(); x.arc(s / 2, s / 2, s / 2 - edge, 0, Math.PI * 2); x.fill();
      const inner = Math.round(s * 0.92);
      const o = Math.round((s - inner) / 2);
      x.drawImage(scaled(sealGreen, inner), o, o);
    }
    return c;
  };
  const iconSet = (style) => iconSizes.map((s) => { const c = iconFrame(s, style); return { size: s, rgba: rgba(c), png: s === 256 ? png(c) : null }; });
  const icons = { light: iconSet('light'), admin: iconSet('admin') };
  const adminPng512 = png(iconFrame(512, 'admin'));

  // 3. Side panel (164x314) and header (150x57), drawn at 3x and scaled down
  const K = 3;
  const finish = (big, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(big, 0, 0, w, h);
    return c;
  };
  const sidebar = (app) => {
    const W = 164 * K, H = 314 * K;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d6b22'); g.addColorStop(1, '#022b0c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // big ghost seal bleeding off the bottom-left corner
    x.drawImage(sealGhost, -W * 0.35, H * 0.52, W * 1.5, W * 1.5);
    // badge
    const d = 92 * K, cx = W / 2, cy = 66 * K;
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.arc(cx, cy + 2 * K, d / 2 + 1 * K, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, cy, d / 2, 0, Math.PI * 2); x.fill();
    x.imageSmoothingQuality = 'high';
    const si = Math.round(d * 0.92);
    x.drawImage(scaled(sealGreen, si), cx - si / 2, cy - si / 2);
    // text
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#ffffff'; x.font = 'bold ' + (16 * K) + 'px "Segoe UI", Arial, sans-serif';
    x.fillText(app.title, cx, 160 * K);
    x.fillStyle = 'rgba(255,255,255,0.78)'; x.font = (10.5 * K) + 'px "Segoe UI", Arial, sans-serif';
    x.fillText(app.subtitle, cx, 178 * K);
    x.fillStyle = '#9be7a6'; x.fillRect(cx - 22 * K, 190 * K, 44 * K, 2 * K);
    x.fillStyle = 'rgba(255,255,255,0.65)'; x.font = (9.5 * K) + 'px "Segoe UI", Arial, sans-serif';
    x.fillText('Aligarh Muslim University', cx, 296 * K);
    return finish(c, 164, 314);
  };
  const header = () => {
    const W = 150 * K, H = 57 * K;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.imageSmoothingQuality = 'high';
    const s = 46 * K;
    x.drawImage(scaled(sealGreen, s), W - s - 6 * K, (H - s) / 2);
    return finish(c, 150, 57);
  };

  return {
    icons,
    adminPng512,
    apps: apps.map((a) => {
      const sb = sidebar(a), hd = header();
      return { sidebar: rgba(sb), sidebarPng: png(sb), header: rgba(hd), headerPng: png(hd) };
    }),
  };
})
`;

// ── File writers (main process) ──────────────────────────────────────────────

function buildIco(frames) {
  const parts = [];
  const count = frames.length;
  const header = Buffer.alloc(6 + 16 * count);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  let offset = header.length;
  frames.forEach((f, i) => {
    let data;
    if (f.png) {
      data = Buffer.from(f.png, 'base64');                    // 256x256 stays PNG-compressed
    } else {
      const s = f.size;
      const px = Buffer.from(f.rgba, 'base64');                // RGBA, top-down
      const maskRow = ((s + 31) >> 5) * 4;
      const dib = Buffer.alloc(40 + s * s * 4 + maskRow * s);  // header + BGRA bottom-up + 1bpp AND mask (zeros)
      dib.writeUInt32LE(40, 0); dib.writeInt32LE(s, 4); dib.writeInt32LE(s * 2, 8);
      dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(0, 16);
      dib.writeUInt32LE(s * s * 4 + maskRow * s, 20);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const si = ((s - 1 - y) * s + x) * 4;
          const di = 40 + (y * s + x) * 4;
          dib[di] = px[si + 2]; dib[di + 1] = px[si + 1]; dib[di + 2] = px[si]; dib[di + 3] = px[si + 3];
        }
      }
      data = dib;
    }
    const e = 6 + i * 16;
    header[e] = f.size >= 256 ? 0 : f.size; header[e + 1] = f.size >= 256 ? 0 : f.size;
    header[e + 2] = 0; header[e + 3] = 0;
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
    parts.push(data);
  });
  return Buffer.concat([header].concat(parts));
}

// 24-bit uncompressed BMP, which is what NSIS wants for wizard images (no alpha)
function buildBmp(rgbaB64, w, h) {
  const px = Buffer.from(rgbaB64, 'base64');
  const row = ((w * 3 + 3) >> 2) << 2;
  const out = Buffer.alloc(54 + row * h);
  out.write('BM', 0); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14); out.writeInt32LE(w, 18); out.writeInt32LE(h, 22);
  out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28); out.writeUInt32LE(row * h, 34);
  out.writeInt32LE(2835, 38); out.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((h - 1 - y) * w + x) * 4;
      const di = 54 + y * row + x * 3;
      out[di] = px[si + 2]; out[di + 1] = px[si + 1]; out[di + 2] = px[si];
    }
  }
  return out;
}

app.whenReady().then(async () => {
  const previewIdx = process.argv.indexOf('--preview');
  const previewDir = previewIdx > -1 ? process.argv[previewIdx + 1] : null;

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  await win.loadURL('about:blank');
  const fn = `${PAGE_CODE}(${JSON.stringify(fs.readFileSync(SEAL).toString('base64'))}, ${JSON.stringify(APPS.map(({ title, subtitle }) => ({ title, subtitle })))}, ${JSON.stringify(ICON_SIZES)}, ${JSON.stringify(GREEN)})`;
  const r = await win.webContents.executeJavaScript(fn);

  APPS.forEach((a, i) => {
    fs.mkdirSync(a.dir, { recursive: true });
    fs.writeFileSync(path.join(a.dir, 'icon.ico'), buildIco(r.icons[a.style]));
    if (a.style === 'admin') {
      // Window / taskbar / Linux icon of the admin app (BrowserWindow `icon` in main.js)
      fs.writeFileSync(path.join(a.dir, 'app_icon.png'), Buffer.from(r.adminPng512, 'base64'));
    }
    const sb = buildBmp(r.apps[i].sidebar, 164, 314);
    fs.writeFileSync(path.join(a.dir, 'installerSidebar.bmp'), sb);
    fs.writeFileSync(path.join(a.dir, 'uninstallerSidebar.bmp'), sb);
    fs.writeFileSync(path.join(a.dir, 'installerHeader.bmp'), buildBmp(r.apps[i].header, 150, 57));
    console.log('wrote', a.dir);
    if (previewDir) {
      fs.mkdirSync(previewDir, { recursive: true });
      const tag = i === 0 ? 'student' : 'admin';
      fs.writeFileSync(path.join(previewDir, `${tag}-sidebar.png`), Buffer.from(r.apps[i].sidebarPng, 'base64'));
      fs.writeFileSync(path.join(previewDir, `${tag}-header.png`), Buffer.from(r.apps[i].headerPng, 'base64'));
    }
  });
  if (previewDir) {
    ['light', 'admin'].forEach((s) => {
      r.icons[s].forEach((f) => {
        if (f.png) fs.writeFileSync(path.join(previewDir, `icon-${s}-256.png`), Buffer.from(f.png, 'base64'));
      });
    });
  }
  app.exit(0);
});
