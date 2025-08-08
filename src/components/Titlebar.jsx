import React, { useCallback } from 'react';

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
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') onAddressSubmit();
  }, [onAddressSubmit]);

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
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          placeholder="Search or enter address"
        />
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
