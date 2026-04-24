import type { HeroAbility } from '@/types';
import type { EventEmitterLike } from './EventEmitter';

/**
 * Ability — cooldown + metadata tracker for a hero active ability.
 *
 * The component is effect-agnostic: it only tracks "can I use this right
 * now?" and "how long until ready?" — the actual effect (AoE damage,
 * stun, etc.) lives on the hero entity that owns the Ability.
 *
 * Time is always supplied by the caller (`nowMs`) — this keeps unit
 * tests deterministic and lets the scene own the game clock. Same
 * pattern as the DamageSystem taking `dt`.
 *
 * All balance numbers (cooldownMs) come from the validated HeroAbility
 * def. No stats are hardcoded here.
 */

export interface AbilityOptions {
  def: HeroAbility;
  emitter: EventEmitterLike;
}

export interface AbilityUsedPayload {
  id: string;
  usedAtMs: number;
}

export class Ability {
  readonly def: HeroAbility;
  readonly emitter: EventEmitterLike;
  private _lastUsedAtMs: number | null = null;

  constructor(opts: AbilityOptions) {
    this.def = opts.def;
    this.emitter = opts.emitter;
  }

  /** Ability id, copied from the def for convenience. */
  get id(): string {
    return this.def.id;
  }

  /** Total cooldown in ms, copied from the def. */
  get cooldownMs(): number {
    return this.def.cooldownMs;
  }

  /** Timestamp of the most recent successful use, or null if never used. */
  get lastUsedAtMs(): number | null {
    return this._lastUsedAtMs;
  }

  /**
   * True when the ability is ready to use at the supplied timestamp.
   * Never-used abilities are always ready; otherwise we require
   * `nowMs - lastUsedAtMs >= cooldownMs`.
   */
  canUse(nowMs: number): boolean {
    if (this._lastUsedAtMs === null) return true;
    return nowMs - this._lastUsedAtMs >= this.cooldownMs;
  }

  /**
   * Milliseconds remaining until the ability is ready. 0 when ready.
   * UI consumers use this to render a dim/fill state.
   */
  remainingMs(nowMs: number): number {
    if (this._lastUsedAtMs === null) return 0;
    const readyAt = this._lastUsedAtMs + this.cooldownMs;
    return Math.max(0, readyAt - nowMs);
  }

  /**
   * Record a successful use at `nowMs`. Emits `'ability-used'` once per
   * call. Callers should only invoke this after they have confirmed
   * `canUse(nowMs)` and applied the ability's effects.
   */
  markUsed(nowMs: number): void {
    this._lastUsedAtMs = nowMs;
    const payload: AbilityUsedPayload = { id: this.id, usedAtMs: nowMs };
    this.emitter.emit('ability-used', payload);
  }
}
