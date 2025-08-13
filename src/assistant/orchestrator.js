// Assistant Orchestrator - Phase B scaffold
// Drives the Jarvis loop: intent -> plan -> permission -> execute -> observe -> reflect -> memory -> next

export class AssistantOrchestrator {
  constructor({ skills, policy, memory, telemetry } = {}) {
    this.skills = skills;
    this.policy = policy;
    this.memory = memory;
    this.telemetry = telemetry;
  }

  normalizeURL(input = '') {
    const s0 = String(input || '').trim();
    if (!s0) return '';
    const shortcuts = {
      youtube: 'https://www.youtube.com/', yt: 'https://www.youtube.com/',
      instagram: 'https://www.instagram.com/', ig: 'https://www.instagram.com/',
      google: 'https://www.google.com/', gmail: 'https://mail.google.com/',
      twitter: 'https://x.com/', x: 'https://x.com/', reddit: 'https://www.reddit.com/'
    };
    if (shortcuts[s0.toLowerCase()]) return shortcuts[s0.toLowerCase()];
    if (/^https?:\/\//i.test(s0)) return s0;
    if (/^[\w-]+\.[\w.-]+\/?/.test(s0)) return `https://${s0}`;
    return '';
  }

  // Deterministic planning for common intents
  async run({ input, context, tabId }) {
    try {
      const qRaw = String(input || '').trim();
      if (!qRaw) return { ok: false, plan: [], reason: 'EMPTY_INPUT' };
      const q = qRaw.toLowerCase();
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const has = (w) => q.includes(w);

      // Typos and Hindi synonyms normalization
      const isScrollDown = /\bscroll\b|\bscrol\b|niche|neeche|neche|down| नीचे /i.test(qRaw);
      const isScrollUp = /\bscroll up\b|upar|oo\s*par|up\b| ऊपर /i.test(qRaw);
      const maybeYouTube = /(youtube|yt|youtub|youtbe|yotube|you tube)/i.test(qRaw);

      // Helper that returns a plan array for a single instruction sentence
      const planFor = (text, ctx) => {
        const raw = String(text || '').trim();
        const lower = raw.toLowerCase();

        // open/go to/visit
        const openIntent = /^(open|opn|go to|visit)\s+(.+)/i.exec(raw);
        if (openIntent) {
          const target = this.normalizeURL(openIntent[2]);
          if (target) {
            return [ { type: 'navigate', url: target }, { type: 'waitFor', selector: 'body', timeout: 15000 } ];
          }
          const term = String(openIntent[2] || '').trim();
          return [ { type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(term)}` } ];
        }

        // search/find/look up ... on <site>
        const searchMatch = /^(search|find|look up|play)\s+(?:for\s+)?(.+?)(?:\s+on\s+(youtube|yt|youtbe|youtub|google|amazon|flipkart))?\s*$/i.exec(raw);
        if (searchMatch) {
          const qtext = searchMatch[2]?.trim() || '';
          const siteRaw = (searchMatch[3] || '').toLowerCase();
          const site = siteRaw.replace('youtbe','youtube').replace('youtub','youtube');
          const onYouTubeNow = !!(ctx?.url && /(^|\.)youtube\.com\//i.test(String(ctx.url)));
          if (site === 'youtube' || site === 'yt' || (!site && onYouTubeNow)) {
            const needsNavigate = !onYouTubeNow;
            const arr = [
              ...(needsNavigate ? [ { type: 'navigate', url: 'https://www.youtube.com/' } ] : []),
              { type: 'waitFor', selector: 'input#search', timeout: 15000 },
              { type: 'type', selector: 'input#search', value: qtext },
              { type: 'pressEnter' },
              { type: 'waitFor', selector: 'ytd-video-renderer a#video-title', timeout: 18000 }
            ];
            if (/^(play)/i.test(searchMatch[1] || '')) arr.push({ type: 'click', selector: 'ytd-video-renderer a#video-title' });
            return arr;
          }
          if (site === 'amazon') {
            return [
              { type: 'navigate', url: 'https://www.amazon.in' },
              { type: 'waitFor', selector: 'input#twotabsearchtextbox', timeout: 15000 },
              { type: 'type', selector: 'input#twotabsearchtextbox', value: qtext },
              { type: 'pressEnter' }
            ];
          }
          if (site === 'flipkart') {
            return [
              { type: 'navigate', url: 'https://www.flipkart.com' },
              { type: 'waitFor', selector: 'input[name="q"]', timeout: 15000 },
              { type: 'type', selector: 'input[name="q"]', value: qtext },
              { type: 'pressEnter' }
            ];
          }
          // default Google search
          return [ { type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(qtext)}` } ];
        }

        // KTB episode
        const ktbMatch = /(ktb).*?(ep|episode|ep\.|no\.|number)?\s*(0?\d{1,2})/i.exec(raw);
        if (ktbMatch || (/play\s+ktb/i.test(raw) && /\b\d{1,2}\b/.test(raw))) {
          const ep = ktbMatch ? ktbMatch[3] : (raw.match(/\b(\d{1,2})\b/)?.[1] || '01');
          const query = `KTB episode ${ep}`;
          return [
            { type: 'navigate', url: 'https://www.youtube.com/' },
            { type: 'waitFor', selector: 'input#search', timeout: 15000 },
            { type: 'type', selector: 'input#search', value: query },
            { type: 'pressEnter' },
            { type: 'waitFor', selector: 'ytd-video-renderer a#video-title', timeout: 20000 },
            { type: 'click', textContains: String(ep) }
          ];
        }

        // Scroll
        if (/\bscroll\b|\bscrol\b|niche|neeche|neche|nche|down| नीचे /i.test(raw)) return [ { type: 'scrollBy', dy: 800 } ];
        if (/\bscroll up\b|upar|oo\s*par|up\b| ऊपर /i.test(raw)) return [ { type: 'scrollBy', dy: -800 } ];

        return [];
      };

      // If multiple intents provided (newlines), process sequentially and merge plans
      if (/\n/.test(qRaw)) {
        const parts = qRaw.split(/\n+/).map(s => s.trim()).filter(Boolean);
        let merged = [];
        for (const p of parts) {
          const pl = planFor(p, context);
          merged = merged.concat(pl);
        }
        if (merged.length) return { ok: true, plan: merged };
      }

      // Single-intent flow using helper
      const planSingle = planFor(qRaw, context);
      if (planSingle.length) return { ok: true, plan: planSingle };

      // fallthrough to legacy handlers below (ytPlay, ktb, scroll already covered in planFor)

      // YouTube combined instruction: open and play best
      const ytPlay = /(open|go to|visit)?\s*(youtube|yt).*?(play|search).*?(best|top)?\s*python.*(video|tutorial)/i.test(qRaw);
      if (ytPlay) {
        return {
          ok: true,
          plan: [
            { type: 'navigate', url: 'https://www.youtube.com/' },
            { type: 'waitFor', selector: 'input#search', timeout: 15000 },
            { type: 'type', selector: 'input#search', value: 'best python programming tutorial for beginners' },
            { type: 'pressEnter' },
            { type: 'waitFor', selector: 'ytd-video-renderer a#video-title', timeout: 18000 },
            { type: 'click', selector: 'ytd-video-renderer a#video-title' }
          ]
        };
      }

      // KTB episode play intents, e.g., "ktb ka 06 episode chala" / "Play KTB ep 06"
      const ktbMatch = /(ktb).*?(ep|episode|ep\.|no\.|number)?\s*(0?\d{1,2})/i.exec(qRaw);
      if (ktbMatch || (/play\s+ktb/i.test(qRaw) && /\b\d{1,2}\b/.test(qRaw))) {
        const ep = ktbMatch ? ktbMatch[3] : (qRaw.match(/\b(\d{1,2})\b/)?.[1] || '01');
        const query = `KTB episode ${ep}`;
        return {
          ok: true,
          plan: [
            { type: 'navigate', url: 'https://www.youtube.com/' },
            { type: 'waitFor', selector: 'input#search', timeout: 15000 },
            { type: 'type', selector: 'input#search', value: query },
            { type: 'pressEnter' },
            { type: 'waitFor', selector: 'ytd-video-renderer a#video-title', timeout: 20000 },
            // Prefer a title that includes the episode number
            { type: 'click', textContains: String(ep) }
          ]
        };
      }

      // Scroll intents (Hindi + typos)
      if (isScrollDown) {
        return { ok: true, plan: [ { type: 'scrollBy', dy: 800 } ] };
      }
      if (isScrollUp) {
        return { ok: true, plan: [ { type: 'scrollBy', dy: -800 } ] };
      }

      return { ok: false, plan: [], reason: 'NO_MATCH' };
    } catch (e) {
      return { ok: false, plan: [], reason: String(e?.message || e) };
    }
  }
}

export default function createOrchestrator(deps) {
  return new AssistantOrchestrator(deps);
}
