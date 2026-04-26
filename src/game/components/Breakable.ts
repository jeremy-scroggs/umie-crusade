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
 * - currentDamageState(): returns the structural state name
 *   ('pristine' | 'cracked' | 'crumbling') derived from the same HP
 *   fraction. Filename-independent so tests / consumers don't depend on
 *   sprite asset paths.
 * - Emits 'damage-state-changed' with the new sprite when crossing a
 *   threshold downward.
 * - Emits 'destroyed' (no payload) exactly once when HP first reaches 0.
 *   Components don't know grid coords; the owning entity (Building) is
 *   responsible for translating this into a system-level
 *   `wall:destroyed` event with `{x,y}`.
 *
 * Towers (no damageStates) are supported: pass `damageStates: []` and
 * `fallbackSprite`; `currentSprite()` returns the fallback,
 * `currentDamageState()` returns 'pristine' until HP === 0 and then
 * 'crumbling' (so consumers can still see a strict downward progression).
 */
export interface DamageState {
  hpThreshold: number;
  sprite: string;
}

/**
 * Structural state name derived from HP fraction. Consumers should use
 * the `dead` boolean for the "is it gone" check; this union is purely
 * the visual band for sprite-swap UIs and matches the three-band design
 * used by `wall-wood.json`.
 */
export type DamageStateName = 'pristine' | 'cracked' | 'crumbling';

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
  /** Guards single-fire of the structural 'destroyed' event. */
  private _destroyedFired = false;

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
    // Damageable emits 'died' exactly once when HP first hits 0 — perfect
    // upstream signal to translate into our structural 'destroyed' event.
    this.emitter.on('died', () => this.maybeFireDestroyed());
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

  /**
   * Restore HP via the underlying Damageable. Caps at `maxHp`. No-op
   * when dead (matches Damageable's contract). Returns the HP actually
   * restored.
   */
  heal(amount: number): number {
    const restored = this.damageable.heal(amount);
    if (restored > 0) this.refreshSprite();
    return restored;
  }

  currentSprite(): string {
    return this._currentSprite;
  }

  /**
   * Filename-independent visual state band. Mapping:
   *   - HP === maxHp           → 'pristine'
   *   - below the LOWEST       → 'crumbling'
   *     non-1.0 threshold
   *   - otherwise              → 'cracked'
   * For towers (no damageStates), returns 'pristine' until HP === 0
   * and then 'crumbling'. Consumers should use `dead` to detect
   * destruction; this is purely a visual band.
   */
  currentDamageState(): DamageStateName {
    const max = this.damageable.maxHp;
    const hp = this.damageable.hp;
    if (max === 0) return 'crumbling';
    if (hp >= max) return 'pristine';
    if (hp <= 0) return 'crumbling';

    // Find the smallest threshold strictly below 1.0 in the sorted
    // (descending) list. damageStates may include the 1.0 entry first.
    let lowest: number | undefined;
    for (const s of this.damageStates) {
      if (s.hpThreshold < 1.0) lowest = s.hpThreshold;
    }
    if (lowest === undefined) {
      // No band besides pristine — non-full HP is 'crumbling'.
      return 'crumbling';
    }

    const fraction = hp / max;
    return fraction < lowest ? 'crumbling' : 'cracked';
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

  private maybeFireDestroyed(): void {
    if (this._destroyedFired) return;
    if (!this.damageable.dead) return;
    this._destroyedFired = true;
    this.emitter.emit('destroyed');
  }
}
