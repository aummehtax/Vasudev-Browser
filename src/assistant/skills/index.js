// Skills Registry - Phase B scaffold
// Wraps first-party tools and web actions behind a consistent interface

export function registerDefaultSkills({ getActiveWebview, ipc }) {
  return {
    async navigate(url) {
      const wv = getActiveWebview?.();
      if (!wv?.navigate) return { ok: false, error: 'NO_WEBVIEW' };
      try { await wv.navigate(url); return { ok: true }; } catch (e) { return { ok: false, error: String(e?.message||e) }; }
    },
    async performActions(actions = []) {
      const wv = getActiveWebview?.();
      if (!wv?.performActions) return { ok: false, error: 'NO_WEBVIEW' };
      try { const res = await wv.performActions(actions); return { ok: true, data: res }; } catch (e) { return { ok: false, error: String(e?.message||e) }; }
    },
    async backgroundSearch(url) {
      try { const res = await ipc?.performBackgroundSearch?.(url); return { ok: true, data: res };
      } catch (e) { return { ok: false, error: String(e?.message||e) }; }
    },
    async extractContent(urls) {
      try {
        if (ipc?.extractContentViaFetch) {
          const data = await ipc.extractContentViaFetch(urls);
          return { ok: true, data };
        }
        const data = await ipc?.extractContentFromUrls?.(urls);
        return { ok: true, data };
      } catch (e) { return { ok: false, error: String(e?.message||e) }; }
    },
    async openTab(url) {
      try { await ipc?.openNewTab?.(url); return { ok: true }; } catch (e) { return { ok: false, error: String(e?.message||e) }; }
    }
  };
}

export default registerDefaultSkills;
