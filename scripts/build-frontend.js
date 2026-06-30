/**
 * AURA Studio — 前端构建脚本
 * 
 * L1 保护层：
 * 1. 从 frontend/ 复制到 frontend-dist/
 * 2. Terser 压缩混淆 scripts/app.js（原地覆盖）
 * 3. 调整 index.html 路径为相对路径（适配 electron loadFile）
 * 4. 保留样式/CSS/静态资源不变
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'frontend');
const DST = path.join(ROOT, 'frontend-dist');

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// === Step 1: 清理并复制 frontend/ → frontend-dist/ ===
console.log('[build:frontend] Copying frontend/ → frontend-dist/ ...');
if (fs.existsSync(DST)) fs.rmSync(DST, { recursive: true });
copyDirSync(SRC, DST);
console.log('[build:frontend] Copy done.');

// === Step 2: 调整 index.html 为相对路径（electron loadFile 模式） ===
const htmlPath = path.join(DST, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf-8');
html = html.replace(/href="\/static\//g, 'href="');
html = html.replace(/src="\/static\//g, 'src="');
fs.writeFileSync(htmlPath, html, 'utf-8');
console.log('[build:frontend] Paths adjusted for electron loadFile.');

// === Step 3: Terser 混淆 app.js ===
console.log('[build:frontend] Minifying scripts/app.js with Terser...');
const terserPath = path.join(ROOT, 'node_modules', 'terser', 'bin', 'terser');
const appJsPath = path.join(DST, 'scripts', 'app.js');

if (!fs.existsSync(appJsPath)) {
  console.error('[build:frontend] ERROR: scripts/app.js not found in frontend-dist!');
  process.exit(1);
}

try {
  require('child_process').execFileSync(
    process.execPath,
    [terserPath, appJsPath, '-o', appJsPath, '-c', 'passes=2', '-m'],
    { stdio: 'inherit', cwd: ROOT }
  );
  console.log('[build:frontend] Minification complete.');
} catch (e) {
  console.error('[build:frontend] Terser failed:', e.message);
  process.exit(1);
}

// === Step 4: 确认产物 ===
const size = fs.statSync(appJsPath).size;
console.log(`[build:frontend] Done. app.js size: ${(size / 1024).toFixed(1)} KB`);
