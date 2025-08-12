import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function AISidebar({ visible, onClose, getActiveWebview }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [question, setQuestion] = useState('');
  const messagesEndRef = useRef(null);

  const systemPrompt = useMemo(() => (
    'You are an assistant embedded in a desktop browser. Be concise. Use bullet points when helpful. Avoid hallucinations. '
    + 'Use ONLY the provided live context (URL, title, selection, viewport, scroll, text). If an answer is not present, say so.'
  ), []);

  const getContext = useCallback(async () => {
    try {
      const wv = getActiveWebview?.();
      if (!wv) return null;
      const ctx = await wv.getLiveContext?.(8000);
      return ctx || null;
    } catch { return null; }
  }, [getActiveWebview]);

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
            twitter: 'https://x.com/', x: 'https://x.com/', reddit: 'https://www.reddit.com/'
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
          // If not a URL, fall through to LLM/search
        }

        const history = conversation.slice(-5).map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        const masterSystemPrompt = [
          'You are a helpful, conversational AI assistant in a web browser.',
          'Your goal is to provide accurate, relevant, and concise answers.',
          '',
          'You have two ways to answer:',
          '1.  **Direct Answer:** If the user\'s question is general, conversational, or something you know, answer it directly.',
          '2.  **Web Search:** If the question requires up-to-date information, specific facts, or deep knowledge, you must use a web search. To do this, you MUST respond with ONLY the string "[search]" followed by a single, optimized, keyword-rich search query. For example: `[search] best open source projects for beginners`.',
          '',
          '**Conversation History:**',
          history
        ].join('\n');

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
        } else {
          // The AI decided to answer directly
          finalAnswer = responseText;
        }
      } catch (err) {
        const errorText = String(err?.message || err);
        setError(errorText);
        finalAnswer = `Sorry, an error occurred: ${errorText}`;
      } finally {
        setConversation(prev => prev.map(msg => 
          msg.id === thinkingMessageId ? { ...msg, text: finalAnswer, isThinking: false } : msg
        ));
        setBusy(false);
      }
    })();
  }, [question, busy, getActiveWebview, systemPrompt, getContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  if (!visible) return null;

  return (
    <aside className="ai-sidebar" aria-label="AI Sidebar">
      <div className="ai-header">
        <div className="ai-title">AI Assistant</div>
        <button className="icon" onClick={onClose} aria-label="Close AI">✕</button>
      </div>

      <div className="ai-body">
        <div className="ai-conversation-area">
          {conversation.map((msg, index) => (
            <div key={index} className={`ai-message-row ${msg.sender}`}>
              <div className={`ai-message ${msg.sender}`}>
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
                  {msg.text || ''}
                </ReactMarkdown>
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
