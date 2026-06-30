const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let backendProcess;
const BACKEND_PORT = 18922;
const isDev = !app.isPackaged;

// ===== 自动更新（基于 GitHub Releases） =====
autoUpdater.autoDownload = false; // 先通知用户，让用户决定
autoUpdater.allowPrerelease = true;

// 生产环境通过 package.json 的 build.publish (provider: github) 自动定位 Release；
// 开发环境指向本地 HTTP 服务器便于联调。
if (isDev) {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'http://localhost:8888/'
  });
}
// 生产环境无需 setFeedURL，electron-updater 会读取打包时内置的 GitHub 配置

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] 检查更新中...');
    mainWindow?.webContents.send('update-status', '检查中');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] 发现新版本:', info.version);
    mainWindow?.webContents.send('update-status', `发现 v${info.version}`);
    // 弹窗询问
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `AURA Studio v${info.version} 可用`,
      detail: '是否下载更新？下载完成后会自动安装。',
      buttons: ['立即更新', '稍后']
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] 已是最新版本');
    mainWindow?.webContents.send('update-status', '已是最新版');
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`[Updater] 下载中 ${pct}%`);
    mainWindow?.webContents.send('update-progress', pct);
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('[Updater] 下载完成');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已下载',
      message: '更新已下载完成，立即安装？',
      buttons: ['立即安装', '下次启动']
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] 错误:', err.message);
    mainWindow?.webContents.send('update-status', `错误: ${err.message}`);
  });
}

// IPC: 前端触发检查更新
ipcMain.handle('check-for-update', () => {
  autoUpdater.checkForUpdates();
});

// IPC: 打开用户手册
ipcMain.handle('open-manual', async () => {
  // 根据 exe 所在目录定位 docs 文件夹，用户装哪都能找到
  const exeDir = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : path.join(__dirname, '..');
  const docsDir = path.join(exeDir, 'docs');
  try {
    await shell.openPath(docsDir);
    return true;
  } catch (e) {
    return false;
  }
});

// IPC: 打开又拍云配置文档
ipcMain.handle('open-docs', async () => {
  const exeDir = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : path.join(__dirname, '..');
  const docsDir = path.join(exeDir, 'docs');
  // 优先打开 HTML（排版好），没有则打开 MD，都没有则打开目录
  const htmlPath = path.join(docsDir, '又拍云配置指南.html');
  const mdPath = path.join(docsDir, '又拍云配置指南.md');
  try {
    if (require('fs').existsSync(htmlPath)) {
      await shell.openPath(htmlPath);
    } else if (require('fs').existsSync(mdPath)) {
      await shell.openPath(mdPath);
    } else {
      await shell.openPath(docsDir);
    }
    return true;
  } catch (e) {
    return false;
  }
});

// ===== 后端进程管理 =====
function killBackend() {
  if (!backendProcess) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /f /t /pid ${backendProcess.pid} 2>nul`, { stdio: 'ignore' });
    } else {
      process.kill(-backendProcess.pid, 'SIGTERM');
    }
  } catch (e) {}
  try { backendProcess.kill(); } catch(e) {}
  backendProcess = null;
}

function startBackend() {
  const backendPath = isDev
    ? path.join(__dirname, '..', 'backend', 'main.py')
    : path.join(process.resourcesPath, 'backend', 'backend.exe');

  if (isDev) {
    backendProcess = spawn('python', [backendPath], {
      stdio: 'pipe',
      env: { ...process.env, PYTHONUNBUFFERED: '1', AURA_DEV: '1' }
    });
  } else {
    backendProcess = spawn(backendPath, [], { stdio: 'pipe' });
  }

  backendProcess.stdout?.on('data', (d) => console.log('[Backend]', d.toString().trim()));
  backendProcess.stderr?.on('data', (d) => console.error('[Backend]', d.toString().trim()));
  backendProcess.on('exit', (code) => console.log(`[Backend] exited with code ${code}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'AURA Studio',
    icon: path.join(__dirname, '..', 'frontend', 'assets', 'logo.ico'),
    backgroundColor: '#08090d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(
    isDev
      ? path.join(__dirname, '..', 'frontend', 'index.html')
      : path.join(__dirname, '..', 'frontend-dist', 'index.html')
  );
  mainWindow.on('closed', () => {
    killBackend();
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  startBackend();
  setupAutoUpdater();
  setTimeout(createWindow, 1500);
  // 启动时不自动检查更新，用户点 ⬆ 按钮才手动检查
});

app.on('window-all-closed', () => {
  killBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killBackend();
});
