import React, { useRef } from 'react';

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab, previews = {}, onHoverPreview, onToggleMute }) {
  const tabsRef = useRef(null);

  return (
    <div className="tabbar">
      <div className="tabs" ref={tabsRef}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${t.id === activeTabId ? 'active' : ''}`}
            onClick={() => onSelect(t.id)}
            onMouseUp={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.id); } }}
            title={t.title || 'New Tab'}
            aria-label={t.title || 'New Tab'}
            onMouseEnter={() => onHoverPreview?.(t.id)}
          >
            {t.favicon ? (
              <img className="tab-favicon" src={t.favicon} alt="" aria-hidden="true" />
            ) : null}
            <span className="tab-title">{t.title || (t.url?.replace(/^https?:\/\//, '') || 'New Tab')}</span>
            {t.audible !== undefined && (
              <span className={`audio ${t.muted ? 'muted' : (t.audible ? 'on' : '')}`} onClick={(e) => { e.stopPropagation(); onToggleMute?.(t.id); }} title={t.muted ? 'Unmute' : 'Mute'} aria-label="Toggle Mute">
                {t.muted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 5L7 9H4v6h3l4 4V5z" fill="currentColor"/><path d="M16 9.35a4.5 4.5 0 010 5.3M19 7a8 8 0 010 10M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 5L7 9H4v6h3l4 4V5z" fill="currentColor"/><path d="M16 9.35a4.5 4.5 0 010 5.3M19 7a8 8 0 010 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                )}
              </span>
            )}
            <span className="tab-close" onClick={(e) => { e.stopPropagation(); onClose(t.id); }} aria-label="Close Tab">×</span>
            {t.isLoading && (
              <span className="tab-progress" aria-hidden="true" />
            )}
            <div className="tab-preview" aria-hidden="true">
              {previews[t.id] ? (
                <img src={previews[t.id]} alt="preview" />
              ) : (
                <div className="preview-skeleton" />
              )}
              <div className="preview-meta">
                <div className="p-title">{t.title || 'New Tab'}</div>
              </div>
            </div>
          </button>
        ))}
        {/* Active tab underline is now handled via CSS ::after on .tab.active */}
        <button className="tab add" onClick={onNewTab} aria-label="New Tab">+</button>
      </div>
    </div>
  );
}
