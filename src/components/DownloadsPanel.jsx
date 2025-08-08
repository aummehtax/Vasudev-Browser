import React from 'react';

export default function DownloadsPanel({ downloads, onClose, onShowInFolder, onClearItem, onClearAll }) {
  return (
    <div className="downloads-panel" role="region" aria-label="Downloads">
      <div className="downloads-header">
        <div className="title">Downloads</div>
        <div className="spacer" />
        <button className="chip" onClick={onClearAll} title="Clear all">Clear</button>
        <button className="icon" onClick={onClose} title="Close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="downloads-list">
        {downloads.length === 0 && (
          <div className="empty">No recent downloads</div>
        )}
        {downloads.map(d => (
          <div key={d.id} className="download-item">
            <div className="meta">
              <div className="name" title={d.filename}>{d.filename || d.url || 'Unknown file'}</div>
              <div className={`state ${d.state}`}>{labelForState(d.state)}</div>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: percent(d) }} />
            </div>
            <div className="row">
              <div className="size">{sizeText(d)}</div>
              <div className="actions">
                {d.filePath && (
                  <button className="chip" onClick={() => onShowInFolder?.(d.filePath)}>Show in folder</button>
                )}
                <button className="chip ghost" onClick={() => onClearItem?.(d.id)}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function percent(d) {
  if (!d.totalBytes) return '0%';
  const p = Math.min(100, Math.max(0, Math.round((d.receivedBytes / d.totalBytes) * 100)));
  return `${p}%`;
}

function sizeText(d) {
  if (!d.totalBytes) return '';
  return `${fmtBytes(d.receivedBytes)} / ${fmtBytes(d.totalBytes)}`;
}

function fmtBytes(bytes = 0) {
  const units = ['B','KB','MB','GB','TB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function labelForState(s) {
  if (s === 'interrupted' || s === 'failed') return 'Failed';
  if (s === 'completed') return 'Completed';
  if (s === 'progressing' || s === 'updated' || s === 'started') return 'Downloading';
  return s || '';
}
