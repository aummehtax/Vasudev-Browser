const { contextBridge, ipcRenderer } = require('electron');

const api = {
  windowControls: {
    close: () => ipcRenderer.invoke('window-controls', 'close'),
    minimize: () => ipcRenderer.invoke('window-controls', 'minimize'),
    maximizeOrRestore: () => ipcRenderer.invoke('window-controls', 'maximizeOrRestore'),
  },
  download: (url) => ipcRenderer.invoke('download', url),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  getSuggestions: (q) => ipcRenderer.invoke('get-suggestions', q),
  // Metrics API
  registerTabWebContents: (tabId, wcId) => ipcRenderer.invoke('register-tab-wc', { tabId, wcId }),
  unregisterTab: (tabId) => ipcRenderer.invoke('unregister-tab', tabId),
  getResourceUsage: () => ipcRenderer.invoke('get-resource-usage'),
  metricsStart: () => ipcRenderer.invoke('metrics-start'),
  metricsStop: () => ipcRenderer.invoke('metrics-stop'),
  onDownloadProgress: (callback) => {
    const handler = (_e, data) => {
      try { callback?.(data); } catch {}
    };
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  onOpenNewTab: (callback) => {
    const handler = (_e, url) => {
      try { callback?.(url); } catch {}
    };
    ipcRenderer.on('open-new-tab', handler);
    return () => ipcRenderer.removeListener('open-new-tab', handler);
  }
};

// Back-compat + new name
contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('electronAPI', api);
