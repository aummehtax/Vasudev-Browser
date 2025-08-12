import React, { useRef, useCallback } from 'react';

function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab, previews = {}, onHoverPreview, onToggleMute, onTogglePin, onReorder }) {
  const tabsRef = useRef(null);

  const onTabKeyDown = useCallback((e, idx, id) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const max = tabs.length - 1;
    if (ctrl && e.key.toLowerCase() === 'w') { e.preventDefault(); onClose?.(id); return; }
    if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); onNewTab?.(); return; }
    if (e.key === 'Delete') { e.preventDefault(); onClose?.(id); return; }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = Math.min(idx + 1, max);
      const nextId = tabs[next]?.id;
      if (nextId) { onSelect?.(nextId); requestAnimationFrame(() => tabsRef.current?.querySelector(`[data-tab-id="${nextId}"]`)?.focus()); }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = Math.max(idx - 1, 0);
      const prevId = tabs[prev]?.id;
      if (prevId) { onSelect?.(prevId); requestAnimationFrame(() => tabsRef.current?.querySelector(`[data-tab-id="${prevId}"]`)?.focus()); }
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      const firstId = tabs[0]?.id; if (firstId) { onSelect?.(firstId); requestAnimationFrame(() => tabsRef.current?.querySelector(`[data-tab-id="${firstId}"]`)?.focus()); }
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      const lastId = tabs[max]?.id; if (lastId) { onSelect?.(lastId); requestAnimationFrame(() => tabsRef.current?.querySelector(`[data-tab-id="${lastId}"]`)?.focus()); }
      return;
    }
  }, [tabs, onSelect, onClose, onNewTab]);

  return (
    <div className="tabbar">
      <div className="tabs" ref={tabsRef} role="tablist" aria-label="Tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${t.pinned ? 'pinned' : ''} ${t.id === activeTabId ? 'active' : ''}`}
            onClick={() => onSelect(t.id)}
            onMouseUp={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.id); } }}
            title={t.title || 'New Tab'}
            aria-label={t.title || 'New Tab'}
            role="tab"
            aria-selected={t.id === activeTabId}
            tabIndex={t.id === activeTabId ? 0 : -1}
            data-tab-id={t.id}
            onKeyDown={(e) => onTabKeyDown(e, tabs.findIndex(x => x.id === t.id), t.id)}
            onMouseEnter={() => onHoverPreview?.(t.id)}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/tab-id', t.id); e.currentTarget.classList.add('dragging'); }}
            onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const fromId = e.dataTransfer.getData('text/tab-id');
              const toId = t.id;
              if (fromId && toId && fromId !== toId) onReorder?.(fromId, toId);
            }}
          >
            {t.favicon ? (
              <img className="tab-favicon" src={t.favicon} alt="" aria-hidden="true" />
            ) : null}
            <span className="tab-title">{t.title || (t.url?.replace(/^https?:\/\//, '') || 'New Tab')}</span>
            <span className="pin-btn" onClick={(e) => { e.stopPropagation(); onTogglePin?.(t.id); }} title={t.pinned ? 'Unpin' : 'Pin'} aria-label={t.pinned ? 'Unpin Tab' : 'Pin Tab'}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M14 3l7 7-4 1-3 3 3 3-2 2-3-3-3 3-2-2 3-3-3-3 1-4 7-7z" opacity="0.9"/></svg>
            </span>
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

export default React.memo(TabBar);
