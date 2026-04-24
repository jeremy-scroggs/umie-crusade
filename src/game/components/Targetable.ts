import type { UnitDef } from '@/types';
import type { EventEmitterLike } from './EventEmitter';

/**
 * Targetable — marks an entity as a valid target and carries a priority
 * integer used by future targeting systems as a tie-breaker.
 *
 * Priorities are a DESIGN ORDERING, not a balance stat — they express
 * "which category of target do we hit first when multiple are in range."
 * Documented in-file so the data-driven-numbers grep check stays honest.
 */
export const CATEGORY_TARGET_PRIORITY: Record<UnitDef['category'], number> = {
  // Higher priority = preferred target when multiple are in range.
  caster: 5,
  ranged: 4,
  siege: 4,
  healer: 3,
  melee: 2,
  builder: 2,
  fodder: 1,
};

export interface TargetableOptions {
  isTargetable?: boolean;
  priority: number;
  emitter: EventEmitterLike;
}

export class Targetable {
  readonly emitter: EventEmitterLike;
  readonly priority: number;
  private _isTargetable: boolean;

  constructor(opts: TargetableOptions) {
    this.emitter = opts.emitter;
    this.priority = opts.priority;
    this._isTargetable = opts.isTargetable ?? true;
  }

  get isTargetable(): boolean {
    return this._isTargetable;
  }

  setTargetable(next: boolean): void {
    if (this._isTargetable === next) return;
    this._isTargetable = next;
    this.emitter.emit('targetable-changed', next);
  }
}
