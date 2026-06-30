/**
 * AURA Studio — 后端构建脚本
 * 使用 PyInstaller 将 Python 后端编译为单个 exe
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 自动查找可用的 Python：优先 py 命令，其次 PATH 中的 python
function findPython() {
  const { execSync } = require('child_process');
  // 1. 尝试 python 命令
  try {
    execSync('python --version', { stdio: 'pipe', shell: true });
    return 'python';
  } catch {}
  // 2. 尝试 py 启动器（Windows 官方）
  try {
    execSync('py -3 --version', { stdio: 'pipe', shell: true });
    return 'py -3';
  } catch {}
  throw new Error('未找到 Python，请确保 python 或 py 命令可用');
}
const PYTHON = findPython();

const cmd = [
  `"${PYTHON}"`,
  '-m PyInstaller',
  '--onefile',
  '--distpath', `"${path.join(ROOT, 'build')}"`,
  '--name', 'backend',
  `"${path.join(ROOT, 'backend', 'main.py')}"`
].join(' ');

console.log('[build:backend] Running PyInstaller...');
console.log(`[build:backend] ${cmd}`);
try {
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
  console.log('[build:backend] PyInstaller complete.');

  // 复制配置文件到 build/ 目录，打包时会随 extraResources 进入安装包
  // ⚠️ 安全：打包时只允许使用空模板，禁止将 user_config.json（含真实密钥）打入安装包
  const fs = require('fs');
  const configDst = path.join(ROOT, 'build', 'config.json');
  const configSrc = path.join(ROOT, 'backend', 'config.json');
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, configDst);
    console.log('[build:backend] Config copied from backend/config.json (empty template)');
  } else {
    console.warn('[build:backend] WARNING: backend/config.json not found, creating empty config');
    fs.writeFileSync(configDst, JSON.stringify({
      upyun_ak: '',
      upyun_sk: '',
      upyun_bucket: '',
      upyun_domain: '',
      upyun_endpoint: 'https://s3.api.upyun.com'
    }, null, 2));
    console.log('[build:backend] Created empty config.json');
  }
} catch (e) {
  console.error('[build:backend] PyInstaller failed:', e.message);
  process.exit(1);
}
