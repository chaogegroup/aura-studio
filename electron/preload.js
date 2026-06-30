const { contextBridge, ipcRenderer } = require('electron');

// Expose minimal API to renderer
contextBridge.exposeInMainWorld('aura', {
  platform: process.platform,
  version: '1.0.0',
  isElectron: true,
  // 更新相关
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  onUpdateStatus: (cb) => {
    ipcRenderer.on('update-status', (_e, msg) => cb(msg));
  },
  onUpdateProgress: (cb) => {
    ipcRenderer.on('update-progress', (_e, pct) => cb(pct));
  },
  // 打开文件/文件夹
  openManual: () => ipcRenderer.invoke('open-manual'),
  openDocs: () => ipcRenderer.invoke('open-docs'),
});
