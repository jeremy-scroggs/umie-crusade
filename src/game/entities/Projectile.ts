/**
 * Projectile — lightweight chase-object used by ranged towers (ballista).
 *
 * Not a Phaser GameObject. Owns only its kinematic state (`position`) and
 * a reference to a target. Per-tick, `update(dt)` advances `position`
 * along the unit vector toward the target's CURRENT position at `speed`
 * px/s. On arrival (within `hitRadius`), `applyDamageOnHit()` calls the
 * target's `Damageable.applyDamage(damage)` once and marks the projectile
 * done.
 *
 * Balance numbers (speed, damage) come from the caller — the Damage
 * system reads them off `TowerDef.combat`. No stats are hardcoded here.
 *
 * `DEFAULT_HIT_RADIUS` is a physics tolerance (half a tile at 1280x720
 * virtual resolution), NOT a balance number — documented here so the
 * data-driven-numbers grep stays honest.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Minimal structural shape a Projectile needs from its target. */
export interface TargetLike {
  readonly position: Vec2;
  readonly damageable: {
    readonly dead: boolean;
    applyDamage(amount: number): number;
  };
}

export interface ProjectileOptions {
  from: Vec2;
  target: TargetLike;
  speed: number;
  damage: number;
  /** Collision tolerance in virtual pixels. Design constant, not balance. */
  hitRadius?: number;
}

/**
 * Half a tile at 1280x720 virtual resolution. Physics tolerance — not a
 * balance number (does not scale damage / HP / speed).
 */
export const DEFAULT_HIT_RADIUS = 6;

export class Projectile {
  readonly target: TargetLike;
  readonly speed: number;
  readonly damage: number;
  readonly hitRadius: number;
  readonly position: Vec2;
  private _done = false;
  private _hit = false;

  constructor(opts: ProjectileOptions) {
    this.target = opts.target;
    this.speed = opts.speed;
    this.damage = opts.damage;
    this.hitRadius = opts.hitRadius ?? DEFAULT_HIT_RADIUS;
    this.position = { x: opts.from.x, y: opts.from.y };
  }

  get done(): boolean {
    return this._done;
  }

  get hit(): boolean {
    return this._hit;
  }

  /**
   * Advance the projectile toward the target's current position. If the
   * step would overshoot the remaining distance, snap to the target.
   * No-op once the projectile is done.
   */
  update(dt: number): void {
    if (this._done) return;

    // If the target already died before we arrived, resolve without damage.
    if (this.target.damageable.dead) {
      this._done = true;
      return;
    }

    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= this.hitRadius) {
      // Already within tolerance — don't step further.
      return;
    }

    const step = this.speed * dt;
    if (step >= dist) {
      // Would overshoot; snap.
      this.position.x = this.target.position.x;
      this.position.y = this.target.position.y;
      return;
    }

    this.position.x += (dx / dist) * step;
    this.position.y += (dy / dist) * step;
  }

  /** True when the projectile is within `hitRadius` of its target. */
  hasReachedTarget(): boolean {
    if (this._done) return this._hit;
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    return Math.hypot(dx, dy) <= this.hitRadius;
  }

  /**
   * Apply this projectile's damage to the target's Damageable exactly once.
   * Returns the effective damage dealt (0 if already resolved or target dead).
   */
  applyDamageOnHit(): number {
    if (this._done) return 0;
    this._done = true;
    if (this.target.damageable.dead) return 0;
    this._hit = true;
    return this.target.damageable.applyDamage(this.damage);
  }
}
