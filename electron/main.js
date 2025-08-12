require('dotenv').config();
const { app, BrowserWindow, ipcMain, nativeTheme, session, shell, Menu, clipboard, webContents } = require('electron');
const fs = require('fs');
const path = require('path');
// Server-side parsing for robust article extraction
let JSDOM, Readability;
try {
  ({ JSDOM } = require('jsdom'));
  ({ Readability } = require('@mozilla/readability'));
} catch (_e) {
  // Dependencies might not be installed yet; handler will guard accordingly.
}

let mainWindow;
// Map: tabId -> { wcId, pid }
const tabProcessMap = new Map();
// Metrics sampling cache and control (to keep usage super lightweight)
let metricsCache = { ts: 0, data: { ok: true, overall: { cpuPercent: 0, memoryKB: 0 }, perTab: [] } };
let metricsTimer = null;
let metricsSubscribers = 0;

// Gemini completion endpoint (non-streaming) - register early at top-level
// Reusable function to call the Gemini API, with multi-key fallback support
const callGeminiAPI = async ({ system, prompt } = {}) => {
  // Collect keys from GEMINI_API_KEYS (comma-separated) or fallback to GEMINI_API_KEY
  const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  const keys = keysEnv
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  if (keys.length === 0) return { ok: false, error: 'MISSING_GEMINI_API_KEY' };

  const model = 'gemini-1.5-flash-latest';
  const combinedPrompt = `${system || ''}\n\n${prompt || ''}`.trim();
  const body = { contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }] };

  let lastError = null;
  for (const key of keys) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });


      if (!res.ok) {
        const msg = await res.text();
        // Rotate only on 429 or 5xx; otherwise return immediately
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          lastError = { ok: false, error: `HTTP_${res.status}`, detail: msg };
          continue; // try next key
        } else {
          return { ok: false, error: `HTTP_${res.status}`, detail: msg };
        }
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      return { ok: true, text };
    } catch (err) {
      // Network/transport error -> try next key
      lastError = { ok: false, error: String(err?.message || err) };
      continue;
    }
  }

  // If all keys failed, return the last error
  return lastError || { ok: false, error: 'GEMINI_REQUEST_FAILED' };
};

ipcMain.handle('ai-complete-gemini', async (_event, args) => {
  return callGeminiAPI(args);
});

// Refine a user's search query using the AI model
ipcMain.handle('refine-search-query', async (_event, userQuery) => {
  try {
    const systemPrompt = `
      You are an expert at refining search queries. A user wants to find information, but their query might be vague or conversational. 
      Your task is to rewrite their query into an optimal, concise, and keyword-focused search query that is likely to yield the best results on a search engine like Google.
      Do not answer the query. Only return the refined search query.
      User Query: "${userQuery}"
      Refined Query:
    `;
    
    // Call the reusable Gemini function directly
    const result = await callGeminiAPI({ system: systemPrompt, prompt: '' });

    if (result.ok) {
      // Clean up the result, removing potential quotes or extra text.
      const refinedQuery = result.text.trim().replace(/^"|"$/g, '');
      return { ok: true, refinedQuery };
    } else {
      return { ok: false, error: result.error, detail: result.detail };
    }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// Relay renderer-originated open-new-tab requests back to the host window (register once at top-level)
ipcMain.on('open-new-tab', (event, url) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.send('open-new-tab', url);
  } catch {}
});

// Perform a web search in a hidden window and scrape the top results
ipcMain.handle('perform-background-search', async (_event, searchUrl) => {
  return new Promise((resolve, reject) => {
    const searchWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      }
    });

    // Set a realistic user agent to avoid bot detection
    searchWindow.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');

    searchWindow.loadURL(searchUrl);

    searchWindow.webContents.on('did-finish-load', async () => {
      try {
        // Execute a script to scrape the top search result URLs.
        // This looks for organic search result links and filters out ads/Google links.
        const results = await searchWindow.webContents.executeJavaScript(`
          Array.from(document.querySelectorAll('div[data-ved] a[href]'))
            .map(a => ({ href: a.href, text: a.querySelector('h3')?.innerText?.trim() }))
            .filter(r => 
              r.href && 
              r.href.startsWith('http') && 
              !r.href.includes('google.com') && 
              !r.href.includes('webcache.googleusercontent.com') &&
              r.text
            );
        `);
        
        searchWindow.close();
        // Return the top 5 unique results
        const uniqueResults = Array.from(new Map(results.map(item => [item.href, item])).values());
        resolve(uniqueResults.slice(0, 5));
      } catch (error) {
        searchWindow.close();
        reject(error);
      }
    });

    searchWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      if (errorCode === -3) { // ERR_ABORTED, often not a real error
        return;
      }
      searchWindow.close();
      reject(new Error(`Failed to load search page: ${errorDescription} (code: ${errorCode})`));
    });
  });
});

// Extract main content from a given URL
ipcMain.handle('extract-content-from-urls', async (_event, urls) => {
  const readabilityScript = fs.readFileSync(path.join(__dirname, 'Readability.js'), 'utf8');
  const allContents = [];
  for (const url of urls) {
    try {
      const content = await new Promise((resolve, reject) => {
        const contentWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
        contentWindow.loadURL(url).catch(() => {}); // Ignore navigation errors on load

        const timeout = setTimeout(() => {
          contentWindow.close();
          reject(new Error(`Timeout loading ${url}`));
        }, 15000); // 15-second timeout per page

        contentWindow.webContents.on('did-finish-load', async () => {
          clearTimeout(timeout);
          try {
            // Inject the local Readability.js script content directly
            await contentWindow.webContents.executeJavaScript(readabilityScript);

            // Now use Readability to extract the article
            const article = await contentWindow.webContents.executeJavaScript(`
              (() => {
                const documentClone = document.cloneNode(true);
                const reader = new Readability(documentClone);
                return reader.parse();
              })()
            `);
            contentWindow.close();
            // Resolve with the article's text content
            resolve(article ? article.textContent.trim() : '');
          } catch (e) {
            contentWindow.close();
            // Instead of rejecting, resolve with an error message to handle it gracefully
            reject(e);
          }
        });

        contentWindow.webContents.on('did-fail-load', (e, code, desc) => {
          if (code === -3) return; // Ignore ERR_ABORTED
          clearTimeout(timeout);
          contentWindow.close();
          reject(new Error(`Failed to load ${url}: ${desc}`));
        });
      });
      if (content) {
        allContents.push({ url, content });
      }
    } catch (error) {
      console.error(`Skipping ${url} due to error:`, error.message);
      // Push an error marker to indicate failure for this URL
      allContents.push({ url, error: error.message });
    }
  }
  return allContents;
});

// New: Extract content by fetching HTML in the main process and running Readability via jsdom
ipcMain.handle('extract-content-via-fetch', async (_event, urls) => {
  const results = [];
  if (!JSDOM || !Readability) {
    return urls.map(url => ({ url, error: 'READABILITY_SERVER_MODE_UNAVAILABLE: install jsdom and @mozilla/readability' }));
  }
  // Concurrency control
  const maxConcurrent = 3;
  const queue = [...urls];

  const fetchOne = async (url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { url, error: `HTTP_${res.status}: ${body.substring(0, 200)}` };
      }
      const html = await res.text();
      // Build DOM with proper URL for relative links
      const dom = new JSDOM(html, { url, contentType: 'text/html' });
      const doc = dom.window.document;
      const article = new Readability(doc).parse();
      if (article) {
        const content = (article.textContent || '').trim();
        const title = (article.title || '').trim();
        return { url, title, content };
      }
      // Fallback for non-article pages (e.g., YouTube, Instagram). Build a metadata-based summary.
      const meta = (name, prop) =>
        doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
        doc.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || '';
      const title = (doc.querySelector('title')?.textContent || meta('og:title','og:title') || '').trim();
      const desc = (meta('description','og:description') || '').trim();
      const h1 = (doc.querySelector('h1')?.textContent || '').trim();
      const h2s = Array.from(doc.querySelectorAll('h2')).slice(0, 3).map(n => n.textContent.trim()).filter(Boolean);
      const summaryParts = [];
      if (title) summaryParts.push(`Title: ${title}`);
      if (desc) summaryParts.push(`Description: ${desc}`);
      if (h1) summaryParts.push(`H1: ${h1}`);
      if (h2s.length) summaryParts.push(`Headings: ${h2s.join(' | ')}`);
      const content = summaryParts.join('\n');
      if (!content) {
        return { url, error: 'READABILITY_PARSE_FAILED' };
      }
      return { url, title, content };
    } catch (e) {
      return { url, error: String(e?.message || e) };
    }
  };

  const workers = Array.from({ length: Math.min(maxConcurrent, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      const out = await fetchOne(next);
      results.push(out);
    }
  });
  await Promise.all(workers);
  return results;
});

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

app.whenReady().then(async () => {
  try {
    // Allow microphone access for voice recognition in renderer
    const ses = session.defaultSession;
    if (ses && ses.setPermissionRequestHandler) {
      ses.setPermissionRequestHandler((wc, permission, callback) => {
        if (permission === 'media') {
          // Allow mic; deny camera by default
          callback(true);
          return;
        }
        callback(false);
      });
    }
  } catch {}
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
