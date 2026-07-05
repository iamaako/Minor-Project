const fs = require('fs-extra');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const buildDir = path.join(__dirname, '..', '.build_src');

// List of files and folders to copy and obfuscate
const targets = [
  'app.js',
  'db.js',
  'main.js',
  'preload.js',
  'server.js',
  'public',
  'css',
  'assets'
];

async function secureBuild() {
  console.log('--- Starting Secure Encrypted Build for Admin Server ---');
  
  if (fs.existsSync(buildDir)) {
    console.log('Cleaning old .build_src folder...');
    fs.removeSync(buildDir);
  }
  
  fs.mkdirSync(buildDir);

  // Copy target files and folders
  console.log('Copying target files to .build_src...');
  for (const target of targets) {
    const srcPath = path.join(__dirname, '..', target);
    const destPath = path.join(buildDir, target);
    if (fs.existsSync(srcPath)) {
      fs.copySync(srcPath, destPath);
    }
  }

  // Obfuscate all JS files
  console.log('Applying Military-Grade JavaScript Obfuscation...');
  const files = getAllJsFiles(buildDir);

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      stringArray: true,
      stringArrayEncoding: ['rc4'],
      stringArrayThreshold: 0.75,
      unicodeEscapeSequence: false,
      renameGlobals: false,
      identifierNamesGenerator: 'hexadecimal'
    });
    
    fs.writeFileSync(file, obfuscationResult.getObfuscatedCode(), 'utf8');
  }

  console.log(`Successfully encrypted ${files.length} JavaScript files.`);
  console.log('--- Encryption Complete! Handing over to Electron Builder ---');
}

function getAllJsFiles(dirPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllJsFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.js')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

secureBuild().catch(console.error);
