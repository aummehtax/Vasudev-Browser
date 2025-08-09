import React, { useCallback, useEffect, useRef, useState } from 'react';
import Titlebar from './components/Titlebar.jsx';
import DownloadsPanel from './components/DownloadsPanel.jsx';
import WebviewContainer from './components/WebviewContainer.jsx';
import TabBar from './components/TabBar.jsx';
import MetricsPanel from './components/MetricsPanel.jsx';

const HOMEPAGE = new URL('homepage.html', window.location.href).href;

// Sanitize URL for display/copy: remove common tracking params and noisy Google fragments
function sanitizeUrlDisplay(input) {
  try {
    if (!input || input === HOMEPAGE) return '';
    const url = new URL(input);
    // Strip common tracking params
    const deny = new Set([
      'fbclid','gclid','gbraid','wbraid','sca_esv','ved','sa','oi','udm','fbs',
      'biw','bih','dpr','ei','source','sourceid','oq','aqs','gs_lp','gws_rd',
      'sclient','rlz','hl','tbm','tbs','utm_source','utm_medium','utm_campaign',
      'utm_term','utm_content','utm_id','utm_name','utm_cid','utm_reader','ncid','igsh'
    ]);
    // Remove utm_* generically too
    const toDelete = [];
    url.searchParams.forEach((_, key) => {
      if (deny.has(key) || key.startsWith('utm_')) toDelete.push(key);
    });
    toDelete.forEach(k => url.searchParams.delete(k));
    // Clean Google image/search hash fragments
    if (url.hostname.includes('google.') && url.hash) {
      if (/^#(vhid|imgrc|lrd|tt|spf)/i.test(url.hash)) url.hash = '';
    }
    return url.toString();
  } catch {
    return input || '';
  }
}

// Sanitize URL for navigation: same as display, but never blank out and always return a valid string
function sanitizeUrlForNav(input) {
  try {
    if (!input) return input;
    const url = new URL(input);
    const deny = new Set([
      'fbclid','gclid','gbraid','wbraid','sca_esv','ved','sa','oi','udm','fbs',
      'biw','bih','dpr','ei','source','sourceid','oq','aqs','gs_lp','gws_rd',
      'sclient','rlz','hl','tbm','tbs','utm_source','utm_medium','utm_campaign',
      'utm_term','utm_content','utm_id','utm_name','utm_cid','utm_reader','ncid','igsh'
    ]);
    const toDelete = [];
    url.searchParams.forEach((_, key) => {
      if (deny.has(key) || key.startsWith('utm_')) toDelete.push(key);
    });
    toDelete.forEach(k => url.searchParams.delete(k));
    if (url.hostname.includes('google.') && url.hash) {
      if (/^#(vhid|imgrc|lrd|tt|spf)/i.test(url.hash)) url.hash = '';
    }
    return url.toString();
  } catch {
    return input;
  }
}

export default function App() {
  const webviewRefs = useRef({}); // id -> ref
  const [tabs, setTabs] = useState(() => {
    const id = crypto.randomUUID?.() || String(Date.now());
    webviewRefs.current[id] = React.createRef();
    return [{ id, url: HOMEPAGE, title: 'Vasudev' }];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const [address, setAddress] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const getActiveRef = () => webviewRefs.current[activeTabId]?.current;

  const handleNavigate = useCallback((url) => {
    if (!url) return;
    let finalUrl = url.trim();
    const looksLikeUrl = /^(https?:\/\/|chrome:|file:)/i.test(finalUrl) || finalUrl.includes('.')
    if (!/^(https?:\/\/|chrome:|file:)/i.test(finalUrl) && looksLikeUrl) {
      finalUrl = 'https://' + finalUrl;
    }
    if (!looksLikeUrl) {
      finalUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
    finalUrl = sanitizeUrlForNav(finalUrl);
    getActiveRef()?.navigate(finalUrl);
  }, [activeTabId]);

  const handleBack = useCallback(() => getActiveRef()?.back(), [activeTabId]);
  const handleForward = useCallback(() => getActiveRef()?.forward(), [activeTabId]);
  const handleReload = useCallback(() => getActiveRef()?.reload(), [activeTabId]);
  const handleCopyLink = useCallback(async () => {
    try { await navigator.clipboard.writeText(address); } catch {}
  }, [address]);

  const onUrlChange = useCallback((tabId) => (url, state) => {
    // update tab url/title; force homepage title
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, url, title: url === HOMEPAGE ? 'Vasudev' : t.title } : t));
    if (tabId === activeTabId) {
      setAddress(url === HOMEPAGE ? '' : sanitizeUrlDisplay(url));
      if (state) {
        setCanGoBack(state.canGoBack);
        setCanGoForward(state.canGoForward);
      }
    }
  }, [activeTabId]);

  const createTab = useCallback((url = HOMEPAGE) => {
    const id = crypto.randomUUID?.() || String(Date.now() + Math.random());
    webviewRefs.current[id] = React.createRef();
    const navUrl = url === HOMEPAGE ? HOMEPAGE : sanitizeUrlForNav(url);
    setTabs(prev => [...prev, { id, url: navUrl, title: url === HOMEPAGE ? 'Vasudev' : 'New Tab' }]);
    setActiveTabId(id);
    setAddress(url === HOMEPAGE ? '' : sanitizeUrlDisplay(navUrl));
    setCanGoBack(false);
    setCanGoForward(false);
  }, []);

  // Metrics panel and polling (super lightweight)
  const [showMetrics, setShowMetrics] = useState(false);
  const [metrics, setMetrics] = useState({ overall: { cpuPercent: 0, memoryKB: 0 }, perTab: [] });
  useEffect(() => {
    let timer = null;
    let active = true; // active only when window focused and tab visible

    const schedule = () => {
      // poll every 5s, scheduled in idle time if possible
      const run = async () => {
        if (!active) return; // skip when inactive
        try {
          const res = await window.api?.getResourceUsage?.();
          if (res && res.ok) {
            // Avoid re-render if values barely changed
            setMetrics(prev => {
              const next = { overall: res.overall, perTab: res.perTab || [] };
              try {
                const a = prev.overall?.cpuPercent?.toFixed?.(1);
                const b = next.overall?.cpuPercent?.toFixed?.(1);
                const am = Math.round((prev.overall?.memoryKB || 0) / 1024);
                const bm = Math.round((next.overall?.memoryKB || 0) / 1024);
                if (a === b && am === bm && prev.perTab?.length === next.perTab?.length) {
                  return prev;
                }
              } catch {}
              return next;
            });
          }
        } catch {}
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
          run();
          timer = window.setTimeout(schedule, 5000);
        }, { timeout: 2000 });
      } else {
        run();
        timer = window.setTimeout(schedule, 5000);
      }
    };

    const onVisibility = () => { active = !document.hidden; };
    const onFocus = () => { active = true; };
    const onBlur = () => { active = false; };

    if (showMetrics) {
      try { window.api?.metricsStart?.(); } catch {}
      active = !document.hidden;
      window.addEventListener('focus', onFocus);
      window.addEventListener('blur', onBlur);
      document.addEventListener('visibilitychange', onVisibility);
      schedule();
      return () => {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onVisibility);
        if (timer) clearTimeout(timer);
        try { window.api?.metricsStop?.(); } catch {}
      };
    }
  }, [showMetrics]);

  // Open link in new tab from native context menu
  useEffect(() => {
    const off = window.api?.onOpenNewTab?.((url) => {
      if (url) createTab(url);
    });
    return () => { if (typeof off === 'function') off(); };
  }, [createTab]);

  // Tab utilities: preview capture and audio mute
  const [previews, setPreviews] = useState({}); // id -> dataURL
  const requestPreview = useCallback(async (id) => {
    const ref = webviewRefs.current[id]?.current;
    if (!ref || !ref.capturePreview) return;
    try {
      const dataUrl = await ref.capturePreview();
      if (dataUrl) setPreviews(prev => ({ ...prev, [id]: dataUrl }));
    } catch {}
  }, []);
  const toggleMute = useCallback(async (id) => {
    const ref = webviewRefs.current[id]?.current;
    if (!ref) return;
    try {
      const cur = !!ref.isAudioMuted?.();
      ref.setAudioMuted?.(!cur);
      setTabs(prev => prev.map(t => t.id === id ? { ...t, muted: !cur } : t));
    } catch {}
  }, []);

  const closeTab = useCallback((id) => {
    try { window.api?.unregisterTab?.(id); } catch {}
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.id !== id);
      // cleanup ref
      delete webviewRefs.current[id];
      if (id === activeTabId && next.length) {
        const newActive = next[Math.max(0, idx - 1)].id;
        setActiveTabId(newActive);
        const ref = webviewRefs.current[newActive]?.current;
        const currentUrl = ref?.getURL?.() || next.find(t => t.id === newActive)?.url || HOMEPAGE;
        setAddress(currentUrl === HOMEPAGE ? '' : sanitizeUrlDisplay(currentUrl));
        setCanGoBack(!!ref?.canGoBack?.());
        setCanGoForward(!!ref?.canGoForward?.());
      }
      return next;
    });
  }, [activeTabId]);

  const selectTab = useCallback((id) => {
    setActiveTabId(id);
    const ref = webviewRefs.current[id]?.current;
    const currentUrl = ref?.getURL?.() || tabs.find(t => t.id === id)?.url || HOMEPAGE;
    setAddress(currentUrl === HOMEPAGE ? '' : sanitizeUrlDisplay(currentUrl));
    setCanGoBack(!!ref?.canGoBack?.());
    setCanGoForward(!!ref?.canGoForward?.());
  }, [tabs]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey; // support Cmd on macOS if needed
      // Ctrl+T => new tab
      if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); createTab(); return; }
      // Ctrl+W => close tab
      if (ctrl && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(activeTabId); return; }
      // Ctrl+Tab / Ctrl+Shift+Tab => next/prev tab
      if (ctrl && e.key === 'Tab') {
        e.preventDefault();
        if (!tabs.length) return;
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const nextIdx = e.shiftKey ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length;
        selectTab(tabs[nextIdx].id);
        return;
      }
      // Ctrl+L => focus address bar
      if (ctrl && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const input = document.querySelector('.addressbar input');
        if (input) { input.focus(); input.select?.(); }
        return;
      }
      // F5 or Ctrl+R => reload
      if (e.key === 'F5' || (ctrl && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        handleReload();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs, activeTabId, selectTab, createTab, closeTab, handleReload]);

  // Downloads: panel + toast + history
  const [showDownloads, setShowDownloads] = useState(false);
  const [downloads, setDownloads] = useState([]); // [{id, filename, url, state, receivedBytes, totalBytes, filePath, startedAt, completedAt}]
  const handleToggleDownloads = useCallback(() => setShowDownloads(v => !v), []);
  const [downloadToast, setDownloadToast] = useState(null);
  useEffect(() => {
    const off = window.api?.onDownloadProgress?.((data) => {
      // Update history list
      setDownloads(prev => {
        const idx = prev.findIndex(d => d.id === data.id);
        const item = {
          id: data.id,
          filename: data.filename,
          url: data.url,
          state: data.state,
          receivedBytes: data.receivedBytes || 0,
          totalBytes: data.totalBytes || 0,
          filePath: data.filePath,
          startedAt: idx === -1 ? Date.now() : (prev[idx].startedAt || Date.now()),
          completedAt: data.state === 'completed' || data.state === 'failed' ? Date.now() : undefined,
        };
        if (idx === -1) return [item, ...prev].slice(0, 50);
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...item };
        return updated;
      });

      // Toast
      setDownloadToast({
        filename: data.filename,
        progress: data.totalBytes ? Math.round((data.receivedBytes / data.totalBytes) * 100) : undefined,
        state: data.state,
      });
      if (data.state === 'completed' || data.state === 'failed') {
        setTimeout(() => setDownloadToast(null), 3000);
      }
    });
    return () => { if (typeof off === 'function') off(); };
  }, []);

  return (
    <div className="window-shell">
      <div className="window">
        <Titlebar
          address={address}
          onAddressChange={setAddress}
          onAddressSubmit={() => handleNavigate(address)}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onNewTab={() => createTab()}
          onHistory={() => {}}
          onDownload={handleToggleDownloads}
          onCopyLink={handleCopyLink}
          onMetrics={() => setShowMetrics(v => !v)}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          themeColor={(tabs.find(t => t.id === activeTabId) || {}).themeColor}
        />
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={selectTab}
          onClose={closeTab}
          onNewTab={() => createTab()}
          onHoverPreview={requestPreview}
          previews={previews}
          onToggleMute={toggleMute}
        />
        <div className="webviews">
          {tabs.map(t => (
            <WebviewContainer
              key={t.id}
              ref={webviewRefs.current[t.id]}
              tabId={t.id}
              initialUrl={t.url}
              active={t.id === activeTabId}
              onUrlUpdate={onUrlChange(t.id)}
              onMetaUpdate={(meta) => setTabs(prev => prev.map(tab => tab.id === t.id ? { ...tab, ...meta } : tab))}
            />
          ))}
          {showMetrics && (
            <MetricsPanel
              overall={metrics.overall}
              perTab={metrics.perTab}
              tabs={tabs}
              onClose={() => setShowMetrics(false)}
            />
          )}
          {showDownloads && (
            <DownloadsPanel
              downloads={downloads}
              onClose={() => setShowDownloads(false)}
              onShowInFolder={(filePath) => window.api?.showInFolder?.(filePath)}
              onClearItem={(id) => setDownloads(prev => prev.filter(d => d.id !== id))}
              onClearAll={() => setDownloads([])}
            />
          )}
          {downloadToast && (
            <div className="download-toast">
              <div className="download-name">{downloadToast.filename}</div>
              <div className={`download-state ${downloadToast.state}`}>{downloadToast.state}</div>
              {typeof downloadToast.progress === 'number' && (
                <div className="download-progress"><div style={{ width: `${downloadToast.progress}%` }} /></div>
              )}
            </div>
          )}
          {(tabs.find(t => t.id === activeTabId)?.isLoading) && (
            <div className="bottom-glow" />
          )}
        </div>
      </div>
    </div>
  );
}
