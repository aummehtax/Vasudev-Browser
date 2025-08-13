import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import createOrchestrator from '../assistant/orchestrator';
import { validatePlan } from '../assistant/policy';

export default function AISidebar({ visible, onClose, getActiveWebview, activeTab }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [question, setQuestion] = useState('');
  const [pendingPlan, setPendingPlan] = useState(null); // { actions: [], summary: string, thinkingId: number, isFallback: boolean }
  const [groundedHost, setGroundedHost] = useState('');
  const [selectedSteps, setSelectedSteps] = useState([]); // booleans per action index
  const [handsFree, setHandsFree] = useState(() => {
    try { return localStorage.getItem('ai_hands_free') === '1'; } catch { return false; }
  });
  const messagesEndRef = useRef(null);
  const orchestratorRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);

  // Storage key per-tab for session memory
  const convoKey = useMemo(() => activeTab?.id ? `ai_convo_${activeTab.id}` : 'ai_convo_default', [activeTab?.id]);

  const systemPrompt = useMemo(() => (
    'You are an assistant embedded in a desktop browser. Be concise. Use bullet points when helpful. Avoid hallucinations. '
    + 'Use ONLY the provided live context (URL, title, selection, viewport, scroll, text). If an answer is not present, say so.\n\n'
    + 'If the task requires interacting with the current page or navigating to complete a workflow, DO NOT answer directly.\n'
    + 'Instead, output a single line that starts with "[actions]" followed by a JSON array of steps using this schema: \n'
    + '[{"type":"navigate","url":"https://example.com"}, \n'
    + ' {"type":"scrollBy","dy":800}, \n'
    + ' {"type":"scrollTo","y":0}, \n'
    + ' {"type":"click","selector":"button.buy", "textContains":"buy now"}, \n'
    + ' {"type":"type","selector":"input[name=\"q\"]","value":"laptops under 60k"}]\n\n'
    + 'Rules: Use minimal steps. Prefer selector when reliable; otherwise use textContains. Always use absolute https URLs for navigation. Return ONLY one of: a normal direct answer, or an [actions] JSON plan.\n'
    + 'If no live context is available, you may still propose an [actions] plan using reasonable defaults, or emit a [search] query when web search is better.'
  ), [activeTab?.id]);

  const getContext = useCallback(async () => {
    try {
      const wv = getActiveWebview?.();
      if (!wv) return null;
      // retry a few times if page is loading
      for (let i = 0; i < 4; i++) {
        try {
          const loading = typeof wv.isLoading === 'function' ? !!wv.isLoading() : false;
          if (!loading) break;
        } catch {}
        // wait 250ms
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 250));
      }
      let ctx = null;
      try { ctx = await wv.getLiveContext?.(8000); } catch {}
      if (ctx && typeof ctx === 'object') return ctx;
      // fallback: minimal context
      let url = '';
      try { url = String(wv.getURL?.() || ''); } catch {}
      if (url) return { url, title: '', selectionText: '', viewport: {}, scroll: {}, text: '' };
      return null;
    } catch { return null; }
  }, [getActiveWebview]);

  // Load/save conversation per active tab
  useEffect(() => {
    try {
      const raw = localStorage.getItem(convoKey);
      setConversation(raw ? JSON.parse(raw) : []);
    } catch { setConversation([]); }
  }, [convoKey]);
  useEffect(() => {
    try { localStorage.setItem(convoKey, JSON.stringify(conversation.slice(-200))); } catch {}
  }, [convoKey, conversation]);

  useEffect(() => {
    try { localStorage.setItem('ai_hands_free', handsFree ? '1' : '0'); } catch {}
  }, [handsFree]);

  // Visual indicator: toggle body class for hands-free mode
  useEffect(() => {
    const cls = 'hands-free-active';
    try {
      if (handsFree) {
        document.body.classList.add(cls);
      } else {
        document.body.classList.remove(cls);
      }
    } catch {}
    return () => {
      try { document.body.classList.remove(cls); } catch {}
    };
  }, [handsFree]);

  // Create orchestrator once
  useEffect(() => {
    if (!orchestratorRef.current) {
      orchestratorRef.current = createOrchestrator({});
    }
  }, []);

  // Initialize SpeechRecognition (voice input)
  useEffect(() => {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { setSttSupported(false); return; }
      setSttSupported(true);
      const rec = new SR();
      rec.lang = 'hi-IN'; // prioritize Hindi; recognizer can still pick English
      rec.interimResults = true;
      rec.continuous = false;
      let finalTranscript = '';

      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalTranscript += res[0].transcript;
          else interim += res[0].transcript;
        }
        // show interim by reflecting in the input without committing
        if (interim) {
          setQuestion(prev => prev && !prev.endsWith(' ') ? prev + ' ' + interim : (prev || '') + interim);
        }
      };
      rec.onerror = () => { setListening(false); };
      rec.onend = () => {
        setListening(false);
        // commit final transcript into the input field
        if (finalTranscript && finalTranscript.trim()) {
          setQuestion(prev => {
            const base = (prev || '').replace(/\s+$/,'');
            return base ? base + ' ' + finalTranscript.trim() : finalTranscript.trim();
          });
        }
        finalTranscript = '';
      };
      recognitionRef.current = rec;
      return () => { try { rec.abort(); } catch {} };
    } catch {}
  }, []);

  const toggleListening = useCallback(() => {
    try {
      if (!recognitionRef.current) return;
      if (listening) {
        recognitionRef.current.stop();
        setListening(false);
      } else {
        // switch language dynamically based on groundedHost if useful
        try {
          if (recognitionRef.current && groundedHost) {
            recognitionRef.current.lang = 'hi-IN';
          }
        } catch {}
        recognitionRef.current.start();
        setListening(true);
      }
    } catch {}
  }, [listening, groundedHost]);

  // Initialize per-step toggles whenever a new plan arrives
  useEffect(() => {
    if (pendingPlan && Array.isArray(pendingPlan.actions)) {
      setSelectedSteps(pendingPlan.actions.map(() => true));
    } else {
      setSelectedSteps([]);
    }
  }, [pendingPlan]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!question.trim() || busy) return;

    const userMessage = { id: Date.now(), sender: 'user', text: question };
    const thinkingMessageId = Date.now() + 1;
    const thinkingMessage = { id: thinkingMessageId, sender: 'ai', text: '...', isThinking: true };

    setConversation(prev => [...prev, userMessage, thinkingMessage]);
    setQuestion('');
    setBusy(true);
    setError(null);

    (async () => {
      let finalAnswer = '';
      let handledByPanel = false;
      try {
        // Quick "open <site>" intent: immediately open in a new tab
        const qRaw = question.trim();
        const q = qRaw.toLowerCase();
        const openIntent = /^(open|go to|visit)\s+(.+)/i.exec(qRaw);
        const normalizeURL = (input) => {
          let s = input.trim();
          // common shortcuts
          const shortcuts = {
            youtube: 'https://www.youtube.com/', yt: 'https://www.youtube.com/',
            instagram: 'https://www.instagram.com/', ig: 'https://www.instagram.com/',
            google: 'https://www.google.com/', gmail: 'https://mail.google.com/',
            twitter: 'https://x.com/', x: 'https://x.com/', reddit: 'https://www.reddit.com/',
            chatgpt: 'https://chat.openai.com/', chat: 'https://chat.openai.com/'
          };
          if (shortcuts[s.toLowerCase()]) return shortcuts[s.toLowerCase()];
          if (/^https?:\/\//i.test(s)) return s;
          if (/^[\w-]+\.[\w.-]+\/?/.test(s)) return `https://${s}`;
          return s; // not a URL; let search handle it
        };
        if (openIntent) {
          const target = normalizeURL(openIntent[2]);
          if (target.startsWith('http')) {
            try { window.api?.openNewTab?.(target); } catch {}
            finalAnswer = `Opening: [${target}](${target})`;
            setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg));
            setBusy(false);
            return;
          }
          // Not a URL/shortcut: propose a Google search navigate as actions
          const term = String(openIntent[2] || '').trim();
          const actions = [ { type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(term)}` } ];
          const summary = actions.map((a, i) => `  ${i+1}. ${a.type}${a.url ? ` -> ${a.url}` : ''}`).join('\n');
          setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Proposed actions (open):\n${summary}\n\nReview and approve below.`, isThinking: false } : msg));
          setPendingPlan({ actions, summary, thinkingId: thinkingMessageId, isFallback: true });
          handledByPanel = true;
          setBusy(false);
          return;
        }

        // Deterministic "search ..." intent handling (avoids relying on LLM)
        const searchMatch = /^(search|find|look up)\s+(?:for\s+)?(.+?)(?:\s+on\s+(youtube|yt|google|amazon|flipkart))?\s*$/i.exec(qRaw);
        if (searchMatch) {
          const qtext = searchMatch[2]?.trim() || '';
          const site = (searchMatch[3] || '').toLowerCase();
          let actions = [];
          if (site === 'youtube' || site === 'yt') {
            actions = [
              { type: 'navigate', url: 'https://www.youtube.com/' },
              { type: 'type', selector: 'input#search', value: qtext },
              { type: 'click', selector: 'button#search-icon-legacy' }
            ];
          } else if (site === 'amazon') {
            actions = [
              { type: 'navigate', url: 'https://www.amazon.in' },
              { type: 'type', selector: 'input#twotabsearchtextbox', value: qtext },
              { type: 'click', selector: 'input#nav-search-submit-button' }
            ];
          } else if (site === 'flipkart') {
            actions = [
              { type: 'navigate', url: 'https://www.flipkart.com' },
              { type: 'type', selector: 'input[name="q"]', value: qtext },
              { type: 'click', selector: 'button[type="submit"]' }
            ];
          } else if (site === 'google' || !site) {
            const url = `https://www.google.com/search?q=${encodeURIComponent(qtext)}`;
            actions = [ { type: 'navigate', url } ];
          }
          const v = validatePlan(actions);
          if (!v.ok) {
            finalAnswer = `Plan validation failed: ${v.errors.join(', ')}`;
            setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg));
            setBusy(false);
            return;
          }
          const summary = v.plan.map((a, i) => `  ${i+1}. ${a.type}${a.url ? ` -> ${a.url}` : ''}${a.selector ? ` selector=${a.selector}` : ''}`).join('\n');
          if (handsFree) {
            const wv = getActiveWebview?.();
            const norm = v.plan.map(a => (a?.type === 'navigate' && a.url && !/^https?:\/\//i.test(a.url)) ? { ...a, url: `https://${a.url}` } : a);
            setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: 'Executing (hands-free)...', isThinking: true } : msg));
            const results = await wv.performActions(norm);
            const lines = results.map((r, i) => `  ${i+1}. ${r.action?.type || '?'} -> ${r.ok ? 'ok' : `error: ${r.error}`}`).join('\n');
            setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Executed actions. Results:\n${lines}`, isThinking: false } : msg));
            setBusy(false);
            return;
          }
          setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Proposed actions (search):\n${summary}\n\nReview and approve below.`, isThinking: false } : msg));
          setPendingPlan({ actions: v.plan, summary, thinkingId: thinkingMessageId, isFallback: true });
          handledByPanel = true;
          setBusy(false);
          return;
        }

        // Live page context
        const ctx = await getContext();
        try {
          const u = ctx?.url || activeTab?.url || '';
          const host = u ? new URL(u).host : '';
          setGroundedHost(host || '');
        } catch { setGroundedHost(''); }
        const ctxText = ctx ? [
          `URL: ${ctx.url || ''}`,
          `Title: ${ctx.title || ''}`,
          ctx.selectionText ? `Selection: ${ctx.selectionText}` : '',
          ctx.text ? `VisibleText:\n${ctx.text}` : ''
        ].filter(Boolean).join('\n') : 'No live context available.';

        const history = conversation.slice(-5).map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        const masterSystemPrompt = [
          systemPrompt,
          '',
          '--- LIVE CONTEXT ---',
          ctxText,
          '--------------------',
          '',
          'Conversation History (last 5):',
          history
        ].join('\n');

        // Orchestrator first: try deterministic plan without LLM
        try {
          const orch = orchestratorRef.current;
          if (orch) {
            const o = await orch.run({ input: question, context: ctx, tabId: activeTab?.id });
            if (o?.ok && Array.isArray(o.plan) && o.plan.length > 0) {
              const v = validatePlan(o.plan);
              if (!v.ok) {
                finalAnswer = `Plan validation failed: ${v.errors.join(', ')}`;
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg));
                setBusy(false);
                return;
              }
              const actions = v.plan;
              const summary = actions.map((a, i) => `  ${i+1}. ${a.type}${a.url ? ` -> ${a.url}` : ''}${a.selector ? ` selector=${a.selector}` : ''}`).join('\n');
              if (handsFree) {
                const wv = getActiveWebview?.();
                if (!wv?.performActions) {
                  finalAnswer = 'Actions not available for the current tab.';
                  setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg));
                  setBusy(false);
                  return;
                }
                const norm = actions.map(a => (a?.type === 'navigate' && a.url && !/^https?:\/\//i.test(a.url)) ? { ...a, url: `https://${a.url}` } : a);
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: 'Executing (hands-free)...', isThinking: true } : msg));
                const results = await wv.performActions(norm);
                const lines = results.map((r, i) => `  ${i+1}. ${r.action?.type || '?'} -> ${r.ok ? 'ok' : `error: ${r.error}`}`).join('\n');
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Executed actions. Results:\n${lines}`, isThinking: false } : msg));
                setBusy(false);
                return;
              }
              setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Proposed actions (orchestrator):\n${summary}\n\nReview and approve below.`, isThinking: false } : msg));
              setPendingPlan({ actions, summary, thinkingId: thinkingMessageId, isFallback: false });
              handledByPanel = true;
              setBusy(false);
              return;
            }
          }
        } catch {}

        const initialResponse = await window.api.aiCompleteGemini({ system: masterSystemPrompt, prompt: question });

        if (!initialResponse.ok) {
          throw new Error(initialResponse.error || 'INITIAL_RESPONSE_ERROR');
        }

        const responseText = initialResponse.text.trim();

        if (responseText.startsWith('[search]')) {
          const refinedQuery = responseText.replace('[search]', '').trim();
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(refinedQuery)}`;

          setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Searching for: "${refinedQuery}"...` } : msg));
          const searchResults = await window.api.performBackgroundSearch(searchUrl);

          if (!searchResults || searchResults.length === 0) {
            finalAnswer = "I couldn't find any relevant results for that query.";
          } else {
            const sourceList = searchResults.map(r => `*   [${r.text}](${r.href})`).join('\n');
            setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Found sources. Now reading:\n${sourceList}` } : msg));
            
            const urlsToScrape = searchResults.map(r => r.href);
            // Prefer server-side extraction (jsdom + Readability) to avoid CSP/script issues
            let extractedContents = [];
            try {
              if (window.api?.extractContentViaFetch) {
                extractedContents = await window.api.extractContentViaFetch(urlsToScrape);
                const unavailable = extractedContents.every(c => c?.error?.includes('READABILITY_SERVER_MODE_UNAVAILABLE'));
                if (unavailable) {
                  // Fallback to in-page extractor if server-side mode is unavailable
                  extractedContents = await window.api.extractContentFromUrls(urlsToScrape);
                }
              } else {
                extractedContents = await window.api.extractContentFromUrls(urlsToScrape);
              }
            } catch (_e) {
              // Final safety fallback
              extractedContents = await window.api.extractContentFromUrls(urlsToScrape);
            }
            const validContents = extractedContents.filter(c => c.content && !c.error);
            const failedContents = extractedContents.filter(c => c.error);

            if (validContents.length === 0) {
              const errorList = failedContents.map(c => `*   ${c.url}: ${c.error}`).join('\n');
              finalAnswer = `I found search results, but was unable to read their content. The following errors occurred:\n${errorList}`;
            } else {
              // Auto-open the top result in a new tab for navigational queries
              try {
                const top = searchResults[0];
                if (top?.href && /\b(open|go to|visit|launch)\b/i.test(q)) {
                  window.api?.openNewTab?.(top.href);
                }
              } catch {}
              setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: 'All sources read. Synthesizing answer...' } : msg));
              const synthesisSystemPrompt = 'You are a research assistant. Answer the user\'s question based only on the provided sources. Synthesize into a single, coherent, concise answer with helpful bullet points. Include important constraints from the question (e.g., budgets). Cite sources inline using markdown links at the end of relevant sentences.';
              const sourcesText = validContents.map((c, i) => `Source (${c.url}):\n${c.content}`).join('\n\n---\n\n');
              const synthesisPrompt = `USER QUESTION: ${question}\n\nSOURCES:\n${sourcesText}`;

              const synthesisRes = await window.api.aiCompleteGemini({ system: synthesisSystemPrompt, prompt: synthesisPrompt });
              if (!synthesisRes?.ok) throw new Error(synthesisRes?.error || 'SYNTHESIS_ERROR');

              const sourceLinks = searchResults.map((r, i) => `${i+1}. [${r.text}](${r.href})`).join('\n');
              let finalAnswerText = `${synthesisRes.text}\n\n**Sources:**\n${sourceLinks}`;

              if (failedContents.length > 0) {
                const errorList = failedContents.map(c => `*   ${c.url.substring(0, 50)}...: ${c.error}`).join('\n');
                finalAnswerText += `\n\n**Note:** I was unable to read the following sources:\n${errorList}`;
              }
              finalAnswer = finalAnswerText;
            }
          }
        } else if (responseText.startsWith('[actions]')) {
          // Agentic actions plan
          const jsonPart = responseText.replace('[actions]', '').trim();
          let actions = null;
          try { actions = JSON.parse(jsonPart); } catch (e) { actions = null; }
          if (!Array.isArray(actions)) {
            // Heuristic fallback for common intents when model outputs bad JSON
            const qRaw2 = qRaw;
            const searchMatch2 = /^(search|find|look up)\s+(?:for\s+)?(.+?)(?:\s+on\s+(youtube|yt|google|amazon|flipkart))?\s*$/i.exec(qRaw2);
            if (searchMatch2) {
              const qtext = searchMatch2[2]?.trim() || '';
              const site = (searchMatch2[3] || '').toLowerCase();
              let heuristic = [];
              if (site === 'youtube' || site === 'yt') {
                heuristic = [
                  { type: 'navigate', url: 'https://www.youtube.com/' },
                  { type: 'type', selector: 'input#search', value: qtext },
                  { type: 'click', selector: 'button#search-icon-legacy' }
                ];
              } else if (site === 'amazon') {
                heuristic = [
                  { type: 'navigate', url: 'https://www.amazon.in' },
                  { type: 'type', selector: 'input#twotabsearchtextbox', value: qtext },
                  { type: 'click', selector: 'input#nav-search-submit-button' }
                ];
              } else if (site === 'flipkart') {
                heuristic = [
                  { type: 'navigate', url: 'https://www.flipkart.com' },
                  { type: 'type', selector: 'input[name="q"]', value: qtext },
                  { type: 'click', selector: 'button[type="submit"]' }
                ];
              } else {
                heuristic = [ { type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(qtext)}` } ];
              }
              const v = validatePlan(heuristic);
              if (!v.ok) {
                finalAnswer = `Plan validation failed: ${v.errors.join(', ')}`;
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg));
                setBusy(false);
                return;
              }
              const summary = v.plan.map((a, i) => `  ${i+1}. ${a.type}${a.url ? ` -> ${a.url}` : ''}${a.selector ? ` selector=${a.selector}` : ''}`).join('\n');
              if (handsFree) {
                const wv = getActiveWebview?.();
                const norm = v.plan.map(a => (a?.type === 'navigate' && a.url && !/^https?:\/\//i.test(a.url)) ? { ...a, url: `https://${a.url}` } : a);
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: 'Executing (hands-free)...', isThinking: true } : msg));
                const results = await wv.performActions(norm);
                const lines = results.map((r, i) => `  ${i+1}. ${r.action?.type || '?'} -> ${r.ok ? 'ok' : `error: ${r.error}`}`).join('\n');
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Executed actions. Results:\n${lines}`, isThinking: false } : msg));
                setBusy(false);
                return;
              }
              setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Proposed actions (fallback):\n${summary}\n\nReview and approve below.`, isThinking: false } : msg));
              setPendingPlan({ actions: v.plan, summary, thinkingId: thinkingMessageId, isFallback: true });
              handledByPanel = true;
              setBusy(false);
              return;
            }
            finalAnswer = 'The action plan was not valid JSON. Please rephrase or be more specific.';
          } else {
            // Summarize actions for confirmation
            const v = validatePlan(actions);
            if (!v.ok) {
              finalAnswer = `Plan validation failed: ${v.errors.join(', ')}`;
              setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg));
              setBusy(false);
              return;
            }
            const summary = v.plan.map((a, i) => `  ${i+1}. ${a.type}${a.url ? ` -> ${a.url}` : ''}${a.selector ? ` selector=${a.selector}` : ''}${a.textContains ? ` text~=${a.textContains}` : ''}${a.value ? ` value=\"${String(a.value).slice(0,60)}\"` : ''}`).join('\n');
            if (handsFree) {
              const wv = getActiveWebview?.();
              const norm = v.plan.map(a => (a?.type === 'navigate' && a.url && !/^https?:\/\//i.test(a.url)) ? { ...a, url: `https://${a.url}` } : a);
              setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: 'Executing (hands-free)...', isThinking: true } : msg));
              const results = await wv.performActions(norm);
              const lines = results.map((r, i) => `  ${i+1}. ${r.action?.type || '?'} -> ${r.ok ? 'ok' : `error: ${r.error}`}`).join('\n');
              setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Executed actions. Results:\n${lines}`, isThinking: false } : msg));
              setBusy(false);
              return;
            }
            setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Proposed actions:\n${summary}\n\nReview and approve below.`, isThinking: false } : msg));
            setPendingPlan({ actions: v.plan, summary, thinkingId: thinkingMessageId, isFallback: false });
            handledByPanel = true;
            setBusy(false);
            return;
          }
        } else {
          // Fallback heuristic: if no context and the user asked to search/navigate/scroll, build a minimal actions plan
          const imperative = /\b(search|open|visit|go to|scroll)\b/i.test(qRaw);
          if (!ctx && imperative) {
            // Extract a coarse query and optional site
            const m = /search\s+for\s+(.+?)(\s+on\s+([\w.-]+))?$/i.exec(qRaw) || [];
            const qtext = (m[1] || qRaw).replace(/\bon\b\s+[\w.-]+$/i, '').trim();
            const site = (m[3] || '').toLowerCase();
            let target = '';
            if (site.includes('amazon')) target = 'https://www.amazon.in';
            else if (site.includes('flipkart')) target = 'https://www.flipkart.com';
            if (target) {
              // Just navigate to site and scroll a bit
              const actions = [
                { type: 'navigate', url: target },
                { type: 'scrollBy', dy: 800 }
              ];
              const v = validatePlan(actions);
              if (!v.ok) {
                finalAnswer = `Plan validation failed: ${v.errors.join(', ')}`;
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg));
                setBusy(false);
                return;
              }
              const summary = v.plan.map((a, i) => `  ${i+1}. ${a.type}${a.url ? ` -> ${a.url}` : ''}`).join('\n');
              if (handsFree) {
                const wv = getActiveWebview?.();
                const norm = v.plan.map(a => (a?.type === 'navigate' && a.url && !/^https?:\/\//i.test(a.url)) ? { ...a, url: `https://${a.url}` } : a);
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: 'Executing (hands-free)...', isThinking: true } : msg));
                const results = await wv.performActions(norm);
                const lines = results.map((r, i) => `  ${i+1}. ${r.action?.type || '?'} -> ${r.ok ? 'ok' : `error: ${r.error}`}`).join('\n');
                setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Executed actions. Results:\n${lines}`, isThinking: false } : msg));
                setBusy(false);
                return;
              }
              setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Proposed actions (fallback):\n${summary}\n\nReview and approve below.`, isThinking: false } : msg));
              setPendingPlan({ actions: v.plan, summary, thinkingId: thinkingMessageId, isFallback: true });
              handledByPanel = true;
              setBusy(false);
              return;
            } else {
              // Use Google site search
              const query = qtext ? `${qtext} site:amazon.in` : 'site:amazon.in';
              const actions = [
                { type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
                { type: 'scrollBy', dy: 800 }
              ];
              const summary = actions.map((a, i) => `  ${i+1}. ${a.type}${a.url ? ` -> ${a.url}` : ''}`).join('\n');
              setConversation(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, text: `Proposed actions (fallback):\n${summary}\n\nReview and approve below.`, isThinking: false } : msg));
              setPendingPlan({ actions, summary, thinkingId: thinkingMessageId, isFallback: true });
              handledByPanel = true;
              setBusy(false);
              return;
            }
          } else {
            // The AI decided to answer directly
            finalAnswer = responseText;
          }
        }
      } catch (err) {
        const errorText = String(err?.message || err);
        setError(errorText);
        finalAnswer = `Sorry, an error occurred: ${errorText}`;
      } finally {
        if (!handledByPanel) {
          setConversation(prev => prev.map(msg => 
            msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg
          ));
          setBusy(false);
        }
      }
    })();
  }, [question, busy, getActiveWebview, systemPrompt, getContext, conversation, activeTab?.url]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  if (!visible) return null;

  return (
    <aside className="ai-sidebar" aria-label="AI Sidebar">
      <div className="ai-header">
        <div className="ai-title">AI Assistant</div>
        {groundedHost ? (
          <div className="ai-grounding" title={`Grounded to: ${groundedHost}`}>🔗 {groundedHost}</div>
        ) : null}
        <button
          className="icon"
          onClick={toggleListening}
          disabled={!sttSupported}
          title={sttSupported ? (listening ? 'Stop voice input' : 'Start voice input (Hindi/English)') : 'Voice input not supported in this build'}
          aria-pressed={listening}
          aria-label="Voice input"
        >{listening ? '🎙️•' : '🎙️'}</button>
        <label className="ai-toggle" title="Auto-approve action plans (hands-free)">
          <input
            type="checkbox"
            checked={handsFree}
            onChange={(e) => setHandsFree(!!e.target.checked)}
          />
          <span style={{ marginLeft: 6 }}>Hands-free</span>
        </label>
        <button className="icon" onClick={onClose} aria-label="Close AI">✕</button>
      </div>

      <div className="ai-body">
        <div className="ai-conversation-area">
          {conversation.map((msg, index) => (
            <div key={index} className={`ai-message-row ${msg.sender}`}>
              <div className={`ai-message ${msg.sender}`}>
                {(() => {
                  const text = msg.text || '';
                  const splitToken = '\n\n**Sources:**\n';
                  const hasSources = text.includes(splitToken);
                  const [body, sources] = hasSources ? text.split(splitToken) : [text, null];
                  return (
                    <>
                      <ReactMarkdown
                        components={{
                          a: ({node, href, children, ...props}) => (
                            <a
                              {...props}
                              href={href}
                              onClick={(e) => {
                                try {
                                  if (href && window.api?.openNewTab) {
                                    e.preventDefault();
                                    window.api.openNewTab(href);
                                  }
                                } catch {}
                              }}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {children}
                            </a>
                          )
                        }}
                      >
                        {body}
                      </ReactMarkdown>
                      {sources ? (
                        <div className="ai-citations">
                          <div className="ai-citations-title">Sources</div>
                          <ReactMarkdown
                            components={{
                              a: ({node, href, children, ...props}) => (
                                <a
                                  {...props}
                                  href={href}
                                  onClick={(e) => {
                                    try {
                                      if (href && window.api?.openNewTab) {
                                        e.preventDefault();
                                        window.api.openNewTab(href);
                                      }
                                    } catch {}
                                  }}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                >
                                  {children}
                                </a>
                              )
                            }}
                          >
                            {sources}
                          </ReactMarkdown>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
          {busy && conversation[conversation.length - 1]?.sender === 'user' && (
            <div className="ai-message-row ai">
              <div className="ai-message ai is-thinking">
                <span>.</span><span>.</span><span>.</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {conversation.length === 0 && !busy && (
          <div className="ai-visualizer-area">
            <div className="audio-visualizer">
              <div className="audio-visualizer-circle" />
            </div>
            <p className="ai-placeholder-text">Ask me anything...</p>
          </div>
        )}
      </div>

      <div className="ai-input-area">
        {error && <div className="ai-error" role="alert">{error}</div>}
        {pendingPlan && (
          <div className="ai-permission-panel" role="dialog" aria-modal="true">
            <div className="ai-permission-title">Review proposed actions {pendingPlan.isFallback ? '(fallback)' : ''}</div>
            <pre className="ai-permission-summary">{pendingPlan.summary}</pre>
            <div className="ai-per-step-toggles">
              {pendingPlan.actions?.map((a, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={selectedSteps[i] ?? true}
                    onChange={(e) => {
                      const next = [...selectedSteps];
                      next[i] = !!e.target.checked;
                      setSelectedSteps(next);
                    }}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {i+1}. {a.type}{a.url ? ` -> ${a.url}` : ''}{a.selector ? ` selector=${a.selector}` : ''}{a.textContains ? ` text~=${a.textContains}` : ''}{a.value ? ` value="${String(a.value).slice(0,40)}"` : ''}
                  </span>
                </label>
              ))}
            </div>
            <div className="ai-permission-actions">
              <button
                className="btn"
                onClick={async () => {
                  try {
                    setBusy(true);
                    const wv = getActiveWebview?.();
                    if (!wv?.performActions) {
                      setConversation(prev => prev.map(msg => msg.id === pendingPlan.thinkingId ? { ...msg, text: 'Actions not available for the current tab.', isThinking: false } : msg));
                      setPendingPlan(null);
                      setBusy(false);
                      return;
                    }
                    const chosen = pendingPlan.actions.filter((_, i) => selectedSteps[i] !== false);
                    if (chosen.length === 0) {
                      setConversation(prev => prev.map(msg => msg.id === pendingPlan.thinkingId ? { ...msg, text: 'No steps selected. Cancelled.', isThinking: false } : msg));
                      setPendingPlan(null);
                      setBusy(false);
                      return;
                    }
                    const norm = chosen.map(a => {
                      if (a?.type === 'navigate' && a.url && !/^https?:\/\//i.test(a.url)) {
                        return { ...a, url: `https://${a.url}` };
                      }
                      return a;
                    });
                    setConversation(prev => prev.map(msg => msg.id === pendingPlan.thinkingId ? { ...msg, text: 'Executing approved actions...', isThinking: true } : msg));
                    const results = await wv.performActions(norm);
                    const lines = results.map((r, i) => `  ${i+1}. ${r.action?.type || '?'} -> ${r.ok ? 'ok' : `error: ${r.error}`}`).join('\n');
                    setConversation(prev => prev.map(msg => msg.id === pendingPlan.thinkingId ? { ...msg, text: `Executed actions. Results:\n${lines}`, isThinking: false } : msg));
                  } catch (e) {
                    setConversation(prev => prev.map(msg => msg.id === pendingPlan.thinkingId ? { ...msg, text: `Failed to execute actions: ${String(e?.message || e)}`, isThinking: false } : msg));
                  } finally {
                    setPendingPlan(null);
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >Approve & Run</button>
              <button
                className="btn secondary"
                onClick={() => {
                  setConversation(prev => prev.map(msg => msg.id === pendingPlan.thinkingId ? { ...msg, text: 'Cancelled execution.', isThinking: false } : msg));
                  setPendingPlan(null);
                }}
                disabled={busy}
              >Cancel</button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="ai-input-form">
          <textarea
            rows={1}
            placeholder="Message AI Assistant..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={busy}
          />
          <button
            type="button"
            className="btn secondary"
            title="Ask about current selection"
            onClick={async () => {
              try {
                // try twice with a small delay for selection to be available
                let ctx = await getContext();
                let sel = (ctx?.selectionText || '').trim();
                if (!sel) {
                  await new Promise(r => setTimeout(r, 200));
                  ctx = await getContext();
                  sel = (ctx?.selectionText || '').trim();
                }
                if (sel) {
                  setQuestion(q => q?.trim() ? `${q}\n\n${sel}` : `Explain: ${sel}`);
                } else {
                  setError('No text selected on the page.');
                  setTimeout(() => setError(null), 2500);
                }
              } catch {}
            }}
            disabled={busy}
          >
            Use Selection
          </button>
          <button type="submit" className="btn" disabled={busy || !question.trim()} aria-label="Send Message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </form>
      </div>
    </aside>
  );
}
