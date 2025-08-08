import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function Titlebar({
  address,
  onAddressChange,
  onAddressSubmit,
  onBack,
  onForward,
  onReload,
  onHistory,
  onDownload,
  onNewTab,
  onCopyLink,
  canGoBack,
  canGoForward,
  themeColor
}) {
  // Suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Heuristic: treat input as URL => do not show suggestions
  const isProbablyUrl = useCallback((q) => {
    if (!q) return false;
    const s = q.trim();
    if (/\s/.test(s)) return false; // spaces => likely a query
    if (/^(https?:\/\/|file:|chrome:)/i.test(s)) return true;
    if (/^[\w-]+:\/\//.test(s)) return true; // any scheme
    const domainLike = /^(localhost|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:[\/?#].*)?$/i;
    return domainLike.test(s);
  }, []);

  // Fetch suggestions (debounced) via preload (avoids CORS)
  useEffect(() => {
    const q = (address || '').trim();
    if (!q || isProbablyUrl(q)) { setSuggestions([]); setOpen(false); setActiveIdx(-1); return; }
    const id = setTimeout(async () => {
      try {
        const items = await window.api?.getSuggestions?.(q);
        setSuggestions(items);
        setOpen(items.length > 0);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
        setActiveIdx(-1);
      }
    }, 120);
    return () => clearTimeout(id);
  }, [address, isProbablyUrl]);

  const commit = useCallback((text) => {
    if (typeof onAddressChange === 'function') onAddressChange(text);
    // Defer submit so state updates before navigate uses latest value
    if (typeof onAddressSubmit === 'function') setTimeout(() => onAddressSubmit(), 0);
    setOpen(false);
    setActiveIdx(-1);
  }, [onAddressChange, onAddressSubmit]);

  const handleKeyDown = useCallback((e) => {
    if (!open) {
      if (e.key === 'Enter') onAddressSubmit();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min((i < 0 ? -1 : i) + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max((i < 0 ? suggestions.length : i) - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = activeIdx >= 0 ? suggestions[activeIdx] : address;
      commit(chosen);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setActiveIdx(-1);
    }
  }, [open, suggestions, activeIdx, address, commit, onAddressSubmit]);

  const handleBlur = useCallback((e) => {
    // Close if clicking outside the list
    setTimeout(() => setOpen(false), 100);
  }, []);

  const style = themeColor ? {
    background: `linear-gradient(180deg, ${hexToRgba(themeColor, 0.22)}, ${hexToRgba(themeColor, 0.12)})`
  } : undefined;

  return (
    <div className="titlebar" style={style}>
      <div className="nav">
        <button className="icon" onClick={onBack} disabled={!canGoBack} title="Back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="icon" onClick={onForward} disabled={!canGoForward} title="Forward" aria-label="Forward">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="icon" onClick={onReload} title="Reload" aria-label="Reload">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 12a9 9 0 10-3.5 7.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 12v-6m0 6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="addressbar">
        <span className="lock" title="Secure" aria-label="Secure">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 10V7a5 5 0 0110 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </span>
        <input
          ref={inputRef}
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length && !isProbablyUrl(address)) setOpen(true); }}
          onBlur={handleBlur}
          spellCheck={false}
          placeholder="Search or enter address"
        />
        {open && suggestions.length > 0 && (
          <div className="omnibox-suggestions" role="listbox" ref={listRef}>
            {suggestions.map((s, idx) => (
              <div
                key={`${s}-${idx}`}
                role="option"
                aria-selected={idx === activeIdx}
                className={`omnibox-item ${idx === activeIdx ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                onMouseEnter={() => setActiveIdx(idx)}
                title={s}
              >
                <span className="omnibox-icon" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 4a7 7 0 015.292 11.708l3 3a1 1 0 01-1.414 1.414l-3-3A7 7 0 1111 4zm0 2a5 5 0 100 10 5 5 0 000-10z" fill="currentColor"/></svg>
                </span>
                <span className="omnibox-text">{s}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="actions">
        <button className="icon" onClick={onHistory} title="History" aria-label="History">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 12a9 9 0 109-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="icon" onClick={onDownload} title="Download" aria-label="Download">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M7 11l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="icon" onClick={onNewTab} title="New Tab" aria-label="New Tab">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="icon" onClick={onCopyLink} title="Copy Link" aria-label="Copy Link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 00-7.07-7.07L10 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 11a5 5 0 00-7.07 0L5.5 12.43a5 5 0 007.07 7.07L14 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="traffic-lights">
        <button className="light red" onClick={() => window.api?.windowControls?.close?.()} aria-label="Close" />
        <button className="light yellow" onClick={() => window.api?.windowControls?.minimize?.()} aria-label="Minimize" />
        <button className="light green" onClick={() => window.api?.windowControls?.maximizeOrRestore?.()} aria-label="Maximize" />
      </div>
    </div>
  );
}

function hexToRgba(input, alpha = 1) {
  try {
    let c = input.trim();
    if (c.startsWith('rgb')) return c; // already rgb/rgba
    if (c.startsWith('#')) c = c.slice(1);
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch {
    return input;
  }
}
