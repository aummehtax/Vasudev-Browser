// Telemetry / Metrics Logger - Phase B scaffold
// In-memory ring buffer + simple emitter; integrate with MetricsPanel later

export class Telemetry {
  constructor(max = 500) {
    this.max = max;
    this.events = [];
    this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt) {
    const e = { ts: Date.now(), ...evt };
    this.events.push(e);
    if (this.events.length > this.max) this.events.shift();
    for (const l of this.listeners) { try { l(e); } catch {} }
  }
  getAll() { return [...this.events]; }
}

export default function createTelemetry() { return new Telemetry(); }
