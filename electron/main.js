const { app, BrowserWindow, ipcMain, nativeTheme, session, shell, Menu, clipboard, webContents } = require('electron');
const path = require('path');

let mainWindow;
// Map: tabId -> { wcId, pid }
const tabProcessMap = new Map();
// Metrics sampling cache and control (to keep usage super lightweight)
let metricsCache = { ts: 0, data: { ok: true, overall: { cpuPercent: 0, memoryKB: 0 }, perTab: [] } };
let metricsTimer = null;
let metricsSubscribers = 0;

function collectMetricsNow() {
  try {
    const metrics = app.getAppMetrics?.() || [];
    let totalCPU = 0;
    let totalMemKB = 0;
    for (const m of metrics) {
      totalCPU += (m?.cpu?.percentCPUUsage || 0);
      totalMemKB += (m?.memory?.workingSetSize || 0);
    }
    const perTab = [];
    for (const [tabId, info] of tabProcessMap.entries()) {
      const pid = info?.pid;
      const mm = pid ? metrics.find(x => x.pid === pid) : undefined;
      perTab.push({
        tabId,
        pid: pid || null,
        cpuPercent: mm?.cpu?.percentCPUUsage || 0,
        memoryKB: mm?.memory?.workingSetSize || 0,
        processType: mm?.type || null
      });
    }
    metricsCache = { ts: Date.now(), data: { ok: true, overall: { cpuPercent: totalCPU, memoryKB: totalMemKB }, perTab } };
  } catch {
    metricsCache = { ts: Date.now(), data: { ok: false, overall: { cpuPercent: 0, memoryKB: 0 }, perTab: [] } };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111315' : '#ffffff',
    icon: path.join(__dirname, '../assets/icon.png'),
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: false
    }
  });

  // Unregister a tab mapping when tab is closed
  ipcMain.handle('unregister-tab', (_event, tabId) => {
    try {
      if (!tabId) return { ok: false };
      tabProcessMap.delete(tabId);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  // Register a tab's webContents id with its OS process id
  ipcMain.handle('register-tab-wc', (_event, payload) => {
    try {
      const { tabId, wcId } = payload || {};
      if (!tabId || typeof wcId !== 'number') return { ok: false };
      const wc = webContents.fromId?.(wcId);
      const pid = wc?.getOSProcessId?.();
      tabProcessMap.set(tabId, { wcId, pid });
      return { ok: true, wcId, pid };
    } catch {
      return { ok: false };
    }
  });

  // Return overall app metrics and per-tab usage (CPU %, memory KB)
  ipcMain.handle('get-resource-usage', async () => {
    try {
      // If no active timer, refresh at most every 15s
      if (!metricsTimer && Date.now() - metricsCache.ts > 15000) {
        collectMetricsNow();
      }
      return metricsCache.data;
    } catch {
      return { ok: false, overall: { cpuPercent: 0, memoryKB: 0 }, perTab: [] };
    }
  });

  // Lightweight sampling: renderer tells us when panel is open/closed
  ipcMain.handle('metrics-start', () => {
    metricsSubscribers++;
    if (!metricsTimer) {
      collectMetricsNow();
      metricsTimer = setInterval(collectMetricsNow, 5000);
    }
    return { ok: true };
  });
  ipcMain.handle('metrics-stop', () => {
    metricsSubscribers = Math.max(0, metricsSubscribers - 1);
    if (metricsSubscribers === 0 && metricsTimer) {
      clearInterval(metricsTimer);
      metricsTimer = null;
    }
    return { ok: true };
  });

  // DevTools controls per-tab (Chrome-like): mode can be 'right' | 'bottom' | 'undocked' | 'detach'
  ipcMain.handle('open-devtools', (_e, { tabId, mode = 'right' } = {}) => {
    try {
      const info = tabProcessMap.get(tabId);
      if (!info) return { ok: false, error: 'TAB_NOT_FOUND' };
      const wc = webContents.fromId(info.wcId);
      if (!wc) return { ok: false, error: 'WC_NOT_FOUND' };
      wc.openDevTools({ mode });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle('close-devtools', (_e, { tabId } = {}) => {
    try {
      const info = tabProcessMap.get(tabId);
      if (!info) return { ok: false, error: 'TAB_NOT_FOUND' };
      const wc = webContents.fromId(info.wcId);
      if (!wc) return { ok: false, error: 'WC_NOT_FOUND' };
      wc.closeDevTools();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle('toggle-devtools', (_e, { tabId, mode = 'right' } = {}) => {
    try {
      const info = tabProcessMap.get(tabId);
      if (!info) return { ok: false, error: 'TAB_NOT_FOUND' };
      const wc = webContents.fromId(info.wcId);
      if (!wc) return { ok: false, error: 'WC_NOT_FOUND' };
      if (wc.isDevToolsOpened()) wc.closeDevTools(); else wc.openDevTools({ mode });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  // Context menu for main window contents
  const attachContextMenu = (contents) => {
    contents.on('context-menu', (_event, params) => {
      try {
        const template = [];
        const hasLink = !!params.linkURL;
        const isEditable = !!params.isEditable;
        const hasSelection = !!(params.selectionText && params.selectionText.trim());

        // Navigation
        if (contents.canGoBack?.() || contents.canGoForward?.()) {
          template.push({ label: 'Back', enabled: !!contents.canGoBack?.(), click: () => contents.goBack?.() });
          template.push({ label: 'Forward', enabled: !!contents.canGoForward?.(), click: () => contents.goForward?.() });
          template.push({ label: 'Reload', click: () => contents.reload?.() });
          template.push({ type: 'separator' });
        } else {
          template.push({ label: 'Reload', click: () => contents.reload?.() });
          template.push({ type: 'separator' });
        }

        // Link actions
        if (hasLink) {
          const host = contents.hostWebContents || contents;
          template.push({ label: 'Open Link in New Tab', click: () => host.send?.('open-new-tab', params.linkURL) });
          template.push({ label: 'Copy Link Address', click: () => { try { clipboard.writeText(params.linkURL); } catch {} } });
          template.push({ type: 'separator' });
        }

        // Image actions
        const isImage = params.mediaType === 'image' || (params.srcURL && /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test((params.srcURL.split('?')[0] || '')));
        if (isImage && params.srcURL) {
          const host = contents.hostWebContents || contents;
          template.push({ label: 'Open Image in New Tab', click: () => host.send?.('open-new-tab', params.srcURL) });
          template.push({ label: 'Save Image As…', click: () => { try { contents.downloadURL?.(params.srcURL); } catch {} } });
          template.push({ label: 'Copy Image Address', click: () => { try { clipboard.writeText(params.srcURL); } catch {} } });
          template.push({ label: 'Copy Image', click: () => { try { const img = contents.copyImageAt?.(params.x, params.y); if (img && !img.isEmpty?.()) clipboard.writeImage(img); } catch {} } });
          template.push({ type: 'separator' });
        }

        // Media (video/audio) actions
        const isVideo = params.mediaType === 'video';
        const isAudio = params.mediaType === 'audio';
        if ((isVideo || isAudio) && params.srcURL) {
          const host = contents.hostWebContents || contents;
          template.push({ label: `Open ${isVideo ? 'Video' : 'Audio'} in New Tab`, click: () => host.send?.('open-new-tab', params.srcURL) });
          template.push({ label: `Save ${isVideo ? 'Video' : 'Audio'} As…`, click: () => { try { contents.downloadURL?.(params.srcURL); } catch {} } });
          template.push({ label: `Copy ${isVideo ? 'Video' : 'Audio'} Address`, click: () => { try { clipboard.writeText(params.srcURL); } catch {} } });
          template.push({ type: 'separator' });
        }

        // Edit actions
        if (isEditable) {
          template.push({ role: 'cut' });
          template.push({ role: 'copy' });
          template.push({ role: 'paste' });
          template.push({ role: 'selectAll' });
          template.push({ type: 'separator' });
        } else if (hasSelection) {
          template.push({ role: 'copy' });
          template.push({ type: 'separator' });
        }

        // Inspect element
        template.push({ label: 'Inspect Element', click: () => contents.inspectElement?.(params.x, params.y) });

        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: BrowserWindow.fromWebContents(contents) });
      } catch {}
    });
  };

  attachContextMenu(mainWindow.webContents);

  // Also attach to all future webviews
  app.on('web-contents-created', (_e, contents) => {
    try {
      if (contents.getType && contents.getType() === 'webview') {
        attachContextMenu(contents);
      }
    } catch {}
  });

  // Download handler
  ipcMain.handle('download', (event, url) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !url) return;
    try { win.webContents.downloadURL(url); } catch {}
  });
  // Suggestions fetch (avoid renderer CORS)
  ipcMain.handle('get-suggestions', async (_event, query) => {
    try {
      if (!query || typeof query !== 'string') return [];
      const u = new URL('https://suggestqueries.google.com/complete/search');
      u.searchParams.set('client', 'firefox');
      u.searchParams.set('q', query);
      const res = await fetch(u.toString());
      const data = await res.json();
      const items = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
      return items.slice(0, 8);
    } catch {
      return [];
    }
  });
session.defaultSession.on('will-download', (event, item, webContents) => {
  const win = BrowserWindow.fromWebContents(webContents);
  if (!win) return;
  const id = Date.now() + ':' + Math.random().toString(36).slice(2);
  const filename = item.getFilename();
  const url = item.getURL?.();
  win.webContents.send('download-progress', { id, state: 'started', filename, url, receivedBytes: 0, totalBytes: item.getTotalBytes?.() || 0 });

  item.on('updated', (_evt, state) => {
    win.webContents.send('download-progress', {
      id,
      state,
      filename,
      url,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes()
    });
  });

  item.once('done', (_evt, state) => {
    const filePath = (item.getSavePath && item.getSavePath()) || item.savePath || undefined;
    win.webContents.send('download-progress', {
      id,
      state: state === 'completed' ? 'completed' : 'failed',
      filename,
      url,
      filePath,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes()
    });
  });
});

// Show in folder
ipcMain.handle('show-in-folder', (_e, filePath) => {
  if (filePath) try { shell.showItemInFolder(filePath); } catch {}
});

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Secure window controls via IPC
ipcMain.handle('window-controls', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  switch (action) {
    case 'close':
      win.close();
      break;
    case 'minimize':
      win.minimize();
      break;
    case 'maximizeOrRestore':
      if (win.isMaximized()) win.restore();
      else win.maximize();
      break;
    default:
      break;
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
