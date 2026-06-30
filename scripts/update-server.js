/**
 * AURA Studio — 本地更新服务器
 * 
 * 模拟 GitHub Releases 的更新检查。
 * 把 latest.yml 和安装包放在同一目录下，运行此脚本即可测试自动更新。
 * 
 * 使用：
 *   node scripts/update-server.js
 *   然后打开 AURA Studio → 点击 ⬆ 按钮检查更新
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8888;
const UPDATE_DIR = path.resolve(__dirname, '..', 'release');

const MIME = {
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.exe': 'application/x-msdownload',
  '.blockmap': 'application/json',
  '.json': 'application/json',
  '.asar': 'application/octet-stream'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(UPDATE_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  
  // 安全：确保不跳出 UPDATE_DIR
  filePath = path.resolve(filePath);
  if (!filePath.startsWith(UPDATE_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 尝试找 .exe.blockmap 文件
      if (!filePath.endsWith('.blockmap')) {
        const bmPath = filePath + '.blockmap';
        fs.readFile(bmPath, (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            return res.end('Not Found: ' + url.pathname);
          }
          const ext = path.extname(bmPath);
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          res.end(data2);
        });
        return;
      }
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🔄 AURA Studio 本地更新服务器已启动`);
  console.log(`  📡 http://localhost:${PORT}`);
  console.log(`  📁 更新目录: ${UPDATE_DIR}`);
  console.log(`\n  确保 release/ 目录下有:`);
  console.log(`    - latest.yml`);
  console.log(`    - AURA-Studio-*-Setup.exe`);
  console.log(`    - AURA-Studio-*.exe.blockmap`);
  console.log(`\n  按 Ctrl+C 停止\n`);
});
