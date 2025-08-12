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
  openDevTools: ({ tabId, mode } = {}) => ipcRenderer.invoke('open-devtools', { tabId, mode }),
  closeDevTools: ({ tabId } = {}) => ipcRenderer.invoke('close-devtools', { tabId }),
  toggleDevTools: ({ tabId, mode } = {}) => ipcRenderer.invoke('toggle-devtools', { tabId, mode }),
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
  },
  // Request opening a new tab from anywhere in the renderer
  openNewTab: (url) => {
    try { ipcRenderer.send('open-new-tab', url); } catch {}
  },
  aiCompleteGemini: ({ system, prompt }) => ipcRenderer.invoke('ai-complete-gemini', { system, prompt }),
  performBackgroundSearch: (searchUrl) => ipcRenderer.invoke('perform-background-search', searchUrl),
  extractContentFromUrls: (urls) => ipcRenderer.invoke('extract-content-from-urls', urls),
  extractContentViaFetch: (urls) => ipcRenderer.invoke('extract-content-via-fetch', urls),
  refineSearchQuery: (query) => ipcRenderer.invoke('refine-search-query', query)
};

// Back-compat + new name
contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('electronAPI', api);
