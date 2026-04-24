import type { EventEmitterLike } from './EventEmitter';

/**
 * Damageable — attachable component that owns HP/armor state and emits
 * damage + death events. Composed onto entities (Orc, Human, Breakable).
 *
 * Balance numbers come from the caller (a validated Def). This file must
 * contain zero hardcoded stats — only structural defaults.
 *
 * The `emitter` is typed as `EventEmitterLike` so components run in any
 * Node/jsdom environment without pulling in Phaser's canvas side effects.
 * In production we pass a `Phaser.Events.EventEmitter` (or the attached
 * GameObject, which extends it).
 */
export interface DamageableOptions {
  hp: number;
  armor: number;
  emitter: EventEmitterLike;
}

export interface DamagedPayload {
  amount: number;
  effective: number;
  hp: number;
}

export class Damageable {
  readonly emitter: EventEmitterLike;
  readonly maxHp: number;
  readonly armor: number;
  private _hp: number;
  private _dead = false;

  constructor(opts: DamageableOptions) {
    this.emitter = opts.emitter;
    this.maxHp = opts.hp;
    this.armor = opts.armor;
    this._hp = opts.hp;
  }

  get hp(): number {
    return this._hp;
  }

  get dead(): boolean {
    return this._dead;
  }

  /**
   * Apply incoming damage. Returns the effective damage dealt.
   * - effective = max(0, amount - armor)
   * - hp is decremented (floored at 0)
   * - emits 'damaged' on every call (even if effective === 0)
   * - emits 'died' exactly once when hp reaches 0
   */
  applyDamage(amount: number): number {
    if (this._dead) return 0;

    const effective = Math.max(0, amount - this.armor);
    this._hp = Math.max(0, this._hp - effective);

    const payload: DamagedPayload = { amount, effective, hp: this._hp };
    this.emitter.emit('damaged', payload);

    if (this._hp <= 0 && !this._dead) {
      this._dead = true;
      this.emitter.emit('died');
    }

    return effective;
  }

  /** Heal up to maxHp. No-op if dead. */
  heal(amount: number): number {
    if (this._dead) return 0;
    const before = this._hp;
    this._hp = Math.min(this.maxHp, this._hp + amount);
    return this._hp - before;
  }
}
