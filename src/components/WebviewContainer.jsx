import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const WebviewContainer = forwardRef(function WebviewContainer({ tabId, initialUrl, onUrlUpdate, onMetaUpdate, active = true }, ref) {
  const webviewEl = useRef(null);

  useEffect(() => {
    const wv = webviewEl.current;
    if (!wv) return;

    const tryRegister = () => {
      try {
        const id = wv.getWebContentsId?.();
        if (tabId && typeof id === 'number') {
          window.api?.registerTabWebContents?.(tabId, id);
        }
      } catch {}
    };

    const updateState = (url) => {
      onUrlUpdate?.(url, { canGoBack: wv.canGoBack(), canGoForward: wv.canGoForward() });
    };

    const handleDidNavigate = (e) => updateState(e.url);
    const handleDidNavigateInPage = (e) => updateState(e.url);
    const handleDidFinishLoad = async () => {
      updateState(wv.getURL());
      try {
        const color = await wv.executeJavaScript(`
          (() => {
            const m = document.querySelector('meta[name="theme-color"]');
            return m && m.content ? m.content : null;
          })();
        `);
        if (color) onMetaUpdate?.({ themeColor: color });
      } catch {}
      tryRegister();
    };
    const handleTitle = (e) => onMetaUpdate?.({ title: e.title });
    const handleFavicon = (e) => {
      const icon = Array.isArray(e.favicons) && e.favicons.length ? e.favicons[0] : undefined;
      if (icon) onMetaUpdate?.({ favicon: icon });
    };
    const handleTheme = (e) => {
      // Electron forwards { themeColor } for did-change-theme-color
      const color = e?.themeColor || e?.color || null;
      if (color) onMetaUpdate?.({ themeColor: color });
    };
    const handleStartLoading = () => onMetaUpdate?.({ isLoading: true });
    const handleStopLoading = () => onMetaUpdate?.({ isLoading: false });
    const handleFailLoad = () => onMetaUpdate?.({ isLoading: false });
    const handleMediaStart = () => onMetaUpdate?.({ audible: true });
    const handleMediaPause = () => onMetaUpdate?.({ audible: false });

    wv.addEventListener('did-navigate', handleDidNavigate);
    wv.addEventListener('did-navigate-in-page', handleDidNavigateInPage);
    wv.addEventListener('did-finish-load', handleDidFinishLoad);
    wv.addEventListener('dom-ready', tryRegister);
    wv.addEventListener('page-title-updated', handleTitle);
    wv.addEventListener('page-favicon-updated', handleFavicon);
    wv.addEventListener('did-change-theme-color', handleTheme);
    wv.addEventListener('did-start-loading', handleStartLoading);
    wv.addEventListener('did-stop-loading', handleStopLoading);
    wv.addEventListener('did-fail-load', handleFailLoad);
    wv.addEventListener('media-started-playing', handleMediaStart);
    wv.addEventListener('media-paused', handleMediaPause);

    return () => {
      wv.removeEventListener('did-navigate', handleDidNavigate);
      wv.removeEventListener('did-navigate-in-page', handleDidNavigateInPage);
      wv.removeEventListener('did-finish-load', handleDidFinishLoad);
      wv.removeEventListener('dom-ready', tryRegister);
      wv.removeEventListener('page-title-updated', handleTitle);
      wv.removeEventListener('page-favicon-updated', handleFavicon);
      wv.removeEventListener('did-change-theme-color', handleTheme);
      wv.removeEventListener('did-start-loading', handleStartLoading);
      wv.removeEventListener('did-stop-loading', handleStopLoading);
      wv.removeEventListener('did-fail-load', handleFailLoad);
      wv.removeEventListener('media-started-playing', handleMediaStart);
      wv.removeEventListener('media-paused', handleMediaPause);
    };
  }, [onUrlUpdate, onMetaUpdate, tabId]);

  useImperativeHandle(ref, () => ({
    navigate: (url) => {
      if (webviewEl.current && url) {
        webviewEl.current.src = url;
      }
    },
    back: () => {
      if (webviewEl.current?.canGoBack()) webviewEl.current.goBack();
    },
    forward: () => {
      if (webviewEl.current?.canGoForward()) webviewEl.current.goForward();
    },
    reload: () => {
      webviewEl.current?.reload();
    },
    getURL: () => webviewEl.current?.getURL?.(),
    isLoading: () => !!webviewEl.current?.isLoading?.(),
    canGoBack: () => webviewEl.current?.canGoBack?.() || false,
    canGoForward: () => webviewEl.current?.canGoForward?.() || false,
    async capturePreview() {
      try {
        const img = await webviewEl.current?.capturePage?.();
        return img ? img.toDataURL() : null;
      } catch { return null; }
    },
    setAudioMuted: (v) => {
      try { webviewEl.current?.setAudioMuted?.(!!v); } catch {}
    },
    isAudioMuted: () => {
      try { return !!webviewEl.current?.isAudioMuted?.(); } catch { return false; }
    },
    async extractReadableText(maxChars = 20000) {
      try {
        if (!webviewEl.current || webviewEl.current?.isLoading?.()) return '';
        const js = `(() => {
          const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null);
          let txt = '';
          while (walker.nextNode()) {
            const t = walker.currentNode.nodeValue;
            if (t && t.trim()) txt += t.replace(/\s+/g, ' ') + '\n';
            if (txt.length > ${Number(20000) + 1000}) break;
          }
          return txt.slice(0, ${Number(20000)});
        })();`;
        const res = await webviewEl.current?.executeJavaScript?.(js, true);
        return typeof res === 'string' ? res : '';
      } catch { return ''; }
    },
    async getLiveContext(maxChars = 8000) {
      try {
        if (!webviewEl.current || webviewEl.current?.isLoading?.()) return null;
        const js = `(() => {
          const sel = window.getSelection ? String(window.getSelection()) : '';
          const title = document.title || '';
          const url = location.href || '';
          const vh = window.innerHeight || 0;
          const vw = window.innerWidth || 0;
          const sh = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
          const st = document.documentElement.scrollTop || document.body.scrollTop || 0;
          const sp = sh ? Math.round((st / Math.max(1, sh - vh)) * 100) : 0;
          // Collect visible text (rough heuristic)
          const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null);
          let txt = '';
          while (walker.nextNode()) {
            const t = walker.currentNode.nodeValue;
            if (t && t.trim()) txt += t.replace(/\\s+/g, ' ') + '\n';
            if (txt.length > ${Number(8000) + 500}) break;
          }
          return { url, title, selectionText: sel.slice(0, 800), viewport: { width: vw, height: vh }, scroll: { top: st, percent: sp }, text: txt.slice(0, ${Number(8000)}) };
        })();`;
        const res = await webviewEl.current?.executeJavaScript?.(js, true);
        if (res && typeof res === 'object') return res;
        return null;
      } catch { return null; }
    },
    async performAction(action = {}) {
      if (!webviewEl.current) return { ok: false, error: 'NO_WEBVIEW' };
      if (webviewEl.current?.isLoading?.()) return { ok: false, error: 'PAGE_LOADING' };
      const { type } = action || {};
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const waitForLoadComplete = async (timeout = 20000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          try { if (!webviewEl.current?.isLoading?.()) return true; } catch {}
          await wait(150);
        }
        return false;
      };
      const exec = async (js) => {
        try { return await webviewEl.current.executeJavaScript(js, true); }
        catch (e) { return { __error: String(e?.message || e) }; }
      };
      const waitForSelector = async (selector, timeout = 6000) => {
        const code = `(() => {
          const sel = ${JSON.stringify(String(action.selector || ''))} || ${JSON.stringify(String(selector || ''))};
          return (async () => {
            const sleep = (ms) => new Promise(r=>setTimeout(r, ms));
            for (let i=0;i<20;i++) {
              const el = sel ? document.querySelector(sel) : null;
              if (el) {
                const r = el.getBoundingClientRect();
                const visible = r && r.width>0 && r.height>0;
                if (visible) return true;
              }
              await sleep(300);
            }
            return false;
          })();
        })();`;
        const res = await exec(code);
        return res === true;
      };
      try {
        if (type === 'navigate') {
          const url = String(action.url || '');
          if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'BAD_URL' };
          webviewEl.current.src = url;
          // Wait for load to stabilize
          await waitForLoadComplete(25000);
          return { ok: true };
        }
        if (type === 'scrollBy') {
          const dy = Number(action.dy || 0);
          const js = `(() => { window.scrollBy(0, ${Number.isFinite(dy) ? dy : 0}); return true; })();`;
          await exec(js);
          return { ok: true };
        }
        if (type === 'scrollTo') {
          const y = Number(action.y || 0);
          const js = `(() => { window.scrollTo(0, ${Number.isFinite(y) ? y : 0}); return true; })();`;
          await exec(js);
          return { ok: true };
        }
        if (type === 'click') {
          const selector = String(action.selector || '');
          const textContains = String(action.textContains || '').toLowerCase();
          // If selector provided, wait briefly for it
          if (selector) await waitForSelector(selector, 6000);
          const js = `(() => {
            function visible(el){ const r = el.getBoundingClientRect(); return r && r.width>0 && r.height>0; }
            let el = null;
            const sel = ${JSON.stringify(selector)};
            if (sel){ el = document.querySelector(sel); }
            if (!el && ${JSON.stringify(!!textContains)} ){
              const all = Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"], [aria-label]'));
              el = all.find(e => ((e.innerText||e.value||e.getAttribute('aria-label')||'')+"").toLowerCase().includes(${JSON.stringify(textContains)}));
            }
            if (!el || !visible(el)) return { ok:false, error:'NOT_FOUND' };
            try { el.scrollIntoView({behavior:'smooth', block:'center'}); } catch {}
            try { el.focus(); } catch {}
            try { el.click(); } catch(e) { return { ok:false, error:String(e?.message||e) }; }
            return { ok:true };
          })();`;
          const res = await exec(js);
          return res && typeof res === 'object' ? res : { ok: true };
        }
        if (type === 'type') {
          const selector = String(action.selector || '');
          const value = String(action.value || '');
          if (selector) await waitForSelector(selector, 6000);
          const js = `(() => {
            let el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return { ok:false, error:'NOT_FOUND' };
            const isEditable = (e) => e && (e.tagName==='INPUT' || e.tagName==='TEXTAREA' || e.isContentEditable);
            if (!isEditable(el)) {
              const candidate = el.querySelector('input,textarea,[contenteditable="true"]');
              if (candidate) el = candidate;
            }
            if (!isEditable(el)) return { ok:false, error:'NOT_EDITABLE' };
            try { el.focus(); } catch {}
            try { el.select?.(); } catch {}
            try { el.value = ${JSON.stringify(value)}; } catch {}
            try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
            try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
            return { ok:true };
          })();`;
          const res = await exec(js);
          return res && typeof res === 'object' ? res : { ok: true };
        }
        return { ok: false, error: 'UNKNOWN_ACTION' };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    },
    async performActions(actions = []) {
      const out = [];
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      for (const a of (Array.isArray(actions) ? actions : [])) {
        // do not auto-submit forms; only supported types
        if (!['navigate','scrollBy','scrollTo','click','type'].includes(a?.type)) {
          out.push({ ok:false, error:'UNSUPPORTED', action:a });
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const res = await this.performAction(a);
        out.push({ ...res, action:a });
        if (!res?.ok) break;
        if (a.type === 'navigate') {
          // Extra wait after navigation for heavy pages
          // eslint-disable-next-line no-await-in-loop
          await wait(1200);
        } else {
          // Small pacing to reduce rapid-fire JS
          // eslint-disable-next-line no-await-in-loop
          await wait(200);
        }
      }
      return out;
    }
  }), []);

  return (
    <div className="webview-wrapper" style={{ display: active ? 'block' : 'none' }}>
      <webview
        ref={webviewEl}
        src={initialUrl}
        allowpopups="true"
        style={{ width: '100%', height: '100%', background: '#111315' }}
      />
    </div>
  );
});

export default WebviewContainer;
