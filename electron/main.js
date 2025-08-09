const { app, BrowserWindow, ipcMain, nativeTheme, session, shell, Menu, clipboard } = require('electron');
const path = require('path');

let mainWindow;

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
