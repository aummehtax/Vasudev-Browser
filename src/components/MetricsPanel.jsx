import React, { useMemo } from 'react';

export default function MetricsPanel({ overall, perTab, tabs, onClose }) {
  const byTab = useMemo(() => {
    const map = new Map(perTab.map(x => [x.tabId, x]));
    return tabs.map(t => ({
      id: t.id,
      title: t.title || 'New Tab',
      cpuPercent: (map.get(t.id)?.cpuPercent || 0),
      memoryKB: (map.get(t.id)?.memoryKB || 0)
    }));
  }, [perTab, tabs]);

  const fmtMem = (kb) => {
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="metrics-panel">
      <div className="metrics-header">
        <div className="metrics-title">System Usage</div>
        <button className="metrics-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="metrics-overall">
        <div className="metric">
          <div className="label">Overall CPU</div>
          <div className="value">{overall?.cpuPercent?.toFixed?.(1) || 0}%</div>
        </div>
        <div className="metric">
          <div className="label">Overall Memory</div>
          <div className="value">{fmtMem(overall?.memoryKB || 0)}</div>
        </div>
      </div>
      <div className="metrics-tabs">
        {byTab.map(row => (
          <div key={row.id} className="metrics-row" title={row.title}>
            <div className="name">{row.title}</div>
            <div className="bar cpu" style={{ ['--w']:`${Math.min(100, row.cpuPercent)}%` }}>
              <span>{row.cpuPercent.toFixed(1)}%</span>
            </div>
            <div className="bar mem" style={{ ['--w']:`${Math.min(100, (row.memoryKB/1024)/200*100)}%` }}>
              <span>{fmtMem(row.memoryKB)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
