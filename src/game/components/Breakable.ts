import { Damageable } from './Damageable';
import type { EventEmitterLike } from './EventEmitter';

/**
 * Breakable — building-flavoured damage component. Composes a Damageable
 * for hp/armor and adds sprite-state transitions driven by HP fraction.
 *
 * - damageStates: ordered list of `{hpThreshold, sprite}` where hpThreshold
 *   is a FRACTION of max HP (e.g. 1.0 = pristine, 0.33 = crumbling).
 * - currentSprite(): returns the sprite key matching the current HP fraction.
 *   Matches the highest threshold that the current fraction is >=.
 * - Emits 'damage-state-changed' with the new sprite when crossing a
 *   threshold downward.
 *
 * Towers (no damageStates) are supported: pass `damageStates: []` and
 * `fallbackSprite`; `currentSprite()` returns the fallback.
 */
export interface DamageState {
  hpThreshold: number;
  sprite: string;
}

export interface BreakableOptions {
  hp: number;
  armor: number;
  emitter: EventEmitterLike;
  damageStates: DamageState[];
  fallbackSprite: string;
}

export class Breakable {
  readonly emitter: EventEmitterLike;
  readonly damageable: Damageable;
  readonly damageStates: DamageState[];
  readonly fallbackSprite: string;
  private _currentSprite: string;

  constructor(opts: BreakableOptions) {
    this.emitter = opts.emitter;
    this.damageable = new Damageable({
      hp: opts.hp,
      armor: opts.armor,
      emitter: opts.emitter,
    });
    // Sort highest-first so iteration finds the matching band quickly.
    this.damageStates = [...opts.damageStates].sort(
      (a, b) => b.hpThreshold - a.hpThreshold,
    );
    this.fallbackSprite = opts.fallbackSprite;
    this._currentSprite = this.computeSprite();

    this.emitter.on('damaged', () => this.refreshSprite());
  }

  get hp(): number {
    return this.damageable.hp;
  }

  get maxHp(): number {
    return this.damageable.maxHp;
  }

  get dead(): boolean {
    return this.damageable.dead;
  }

  applyDamage(amount: number): number {
    return this.damageable.applyDamage(amount);
  }

  currentSprite(): string {
    return this._currentSprite;
  }

  private computeSprite(): string {
    if (this.damageStates.length === 0) return this.fallbackSprite;
    const fraction = this.damageable.maxHp === 0
      ? 0
      : this.damageable.hp / this.damageable.maxHp;
    for (const state of this.damageStates) {
      if (fraction >= state.hpThreshold) return state.sprite;
    }
    // Below the lowest threshold — use the last (lowest) state's sprite.
    const last = this.damageStates[this.damageStates.length - 1];
    return last ? last.sprite : this.fallbackSprite;
  }

  private refreshSprite(): void {
    const next = this.computeSprite();
    if (next !== this._currentSprite) {
      this._currentSprite = next;
      this.emitter.emit('damage-state-changed', next);
    }
  }
}
