/**
 * Minimal EventEmitter interface + default implementation.
 *
 * Components accept any object that satisfies `EventEmitterLike` — in
 * production this is a `Phaser.Events.EventEmitter` (or a `GameObject`,
 * which extends it); in tests we can pass a lightweight emitter, or the
 * default implementation below, to avoid loading Phaser's canvas-feature
 * detection inside jsdom.
 *
 * This keeps components testable in a Node/jsdom environment without
 * coupling them to Phaser's top-level module side effects.
 */
export interface EventEmitterLike {
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener?: (...args: unknown[]) => void): this;
}

type Listener = (...args: unknown[]) => void;

export class SimpleEventEmitter implements EventEmitterLike {
  private listeners = new Map<string, Listener[]>();

  emit(event: string, ...args: unknown[]): boolean {
    const list = this.listeners.get(event);
    if (!list || list.length === 0) return false;
    // Copy to tolerate listeners that unsubscribe during emit.
    for (const fn of [...list]) fn(...args);
    return true;
  }

  on(event: string, listener: Listener): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  off(event: string, listener?: Listener): this {
    if (!listener) {
      this.listeners.delete(event);
      return this;
    }
    const list = this.listeners.get(event);
    if (!list) return this;
    const idx = list.indexOf(listener);
    if (idx >= 0) list.splice(idx, 1);
    return this;
  }
}
