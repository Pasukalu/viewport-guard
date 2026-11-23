'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewportGuard', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  startDemo: () => ipcRenderer.invoke('demo:start'),
  stopDemo: () => ipcRenderer.invoke('demo:stop'),
  chooseOutputPath: (currentPath) => ipcRenderer.invoke('dialog:save-report', currentPath),
  runScan: (payload) => ipcRenderer.invoke('scan:run', payload),
  onScanProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on('scan:progress', handler);
    return () => ipcRenderer.removeListener('scan:progress', handler);
  },
  openReport: (htmlPath) => ipcRenderer.invoke('report:open', htmlPath),
  revealReport: (htmlPath) => ipcRenderer.invoke('report:reveal', htmlPath),
  saveReportCopy: (sourcePath) => ipcRenderer.invoke('report:save-copy', sourcePath),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
});
