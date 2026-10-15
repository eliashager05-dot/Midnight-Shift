// Minimal event emitter used to decouple game logic from audio / rendering / UI.
export class Emitter {
  constructor() {
    this._handlers = new Map();
  }
  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type)?.delete(fn);
  }
  /** Listen to every event: fn(type, payload) */
  onAny(fn) {
    return this.on('*', fn);
  }
  emit(type, payload = {}) {
    this._handlers.get(type)?.forEach((fn) => fn(payload));
    this._handlers.get('*')?.forEach((fn) => fn(type, payload));
  }
}
