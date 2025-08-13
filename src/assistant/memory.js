// Memory Service - Phase B scaffold
// Per-tab short-term memory and simple global store

const TAB_LIMIT = 200; // messages per tab

export class MemoryService {
  constructor(storage = window?.localStorage) {
    this.storage = storage;
  }
  _keyTab(tabId) { return `ai_convo_${tabId || 'default'}`; }
  _keyGlobal() { return `ai_global_memory`; }

  getTabConversation(tabId) {
    try { return JSON.parse(this.storage.getItem(this._keyTab(tabId)) || '[]'); } catch { return []; }
  }
  appendConversation(tabId, msg) {
    try {
      const arr = this.getTabConversation(tabId);
      arr.push(msg);
      const trimmed = arr.slice(-TAB_LIMIT);
      this.storage.setItem(this._keyTab(tabId), JSON.stringify(trimmed));
      return true;
    } catch { return false; }
  }
  summarizeTab(tabId) { /* TODO: integrate LLM summarization */ return null; }

  getGlobal() {
    try { return JSON.parse(this.storage.getItem(this._keyGlobal()) || '{}'); } catch { return {}; }
  }
  setGlobal(obj) {
    try { this.storage.setItem(this._keyGlobal(), JSON.stringify(obj||{})); return true; } catch { return false; }
  }
  recordSelectorSuccess(host, selector) {
    try {
      const g = this.getGlobal();
      g.selectorStats = g.selectorStats || {};
      const key = `${host}::${selector}`;
      g.selectorStats[key] = (g.selectorStats[key] || 0) + 1;
      this.setGlobal(g);
    } catch {}
  }
}

export default function createMemory() { return new MemoryService(); }
