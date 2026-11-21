'use strict';

/**
 * electron-builder afterPack hook (Windows only).
 *
 * Stamps the AMU icon and version info onto the app .exe with the rcedit that ships in
 * node_modules. electron-builder normally does this itself, but only after downloading
 * "winCodeSign", which needs symlink rights and fails on a normal Windows account
 * (that is why a local build used to end up with the default Electron icon).
 * The matching build setting is win.signAndEditExecutable = false.
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const info = context.packager.appInfo;
  const projectDir = context.packager.projectDir;
  const exe = path.join(context.appOutDir, `${info.productFilename}.exe`);
  const icon = path.join(projectDir, 'installer-assets', 'icon.ico');
  const rcedit = path.join(projectDir, 'node_modules', 'rcedit', 'bin',
    process.arch === 'ia32' ? 'rcedit.exe' : 'rcedit-x64.exe');

  for (const f of [exe, icon, rcedit]) {
    if (!fs.existsSync(f)) throw new Error(`afterPack: missing ${f}`);
  }

  const version = info.version;
  const strings = {
    ProductName: info.productName,
    FileDescription: info.productName,
    InternalName: info.productName,
    OriginalFilename: `${info.productFilename}.exe`,
    CompanyName: 'Aligarh Muslim University',
    LegalCopyright: 'AMU Interdisciplinary Centre for Artificial Intelligence'
  };

  const args = [exe, '--set-icon', icon, '--set-file-version', version, '--set-product-version', version];
  for (const [k, v] of Object.entries(strings)) args.push('--set-version-string', k, v);

  execFileSync(rcedit, args, { stdio: 'inherit' });
  console.log(`  afterPack: icon and version info set on ${path.basename(exe)}`);
};