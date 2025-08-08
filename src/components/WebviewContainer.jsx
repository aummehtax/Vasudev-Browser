import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const WebviewContainer = forwardRef(function WebviewContainer({ initialUrl, onUrlUpdate, onMetaUpdate, active = true }, ref) {
  const webviewEl = useRef(null);

  useEffect(() => {
    const wv = webviewEl.current;
    if (!wv) return;

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
      wv.removeEventListener('page-title-updated', handleTitle);
      wv.removeEventListener('page-favicon-updated', handleFavicon);
      wv.removeEventListener('did-change-theme-color', handleTheme);
      wv.removeEventListener('did-start-loading', handleStartLoading);
      wv.removeEventListener('did-stop-loading', handleStopLoading);
      wv.removeEventListener('did-fail-load', handleFailLoad);
      wv.removeEventListener('media-started-playing', handleMediaStart);
      wv.removeEventListener('media-paused', handleMediaPause);
    };
  }, [onUrlUpdate, onMetaUpdate]);

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
