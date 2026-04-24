import { describe, it, expect } from 'vitest';
import {
  Projectile,
  DEFAULT_HIT_RADIUS,
  type TargetLike,
} from '@/game/entities/Projectile';
import { Damageable } from '@/game/components/Damageable';
import { SimpleEventEmitter } from '@/game/components/EventEmitter';

function makeTarget(
  position: { x: number; y: number },
  opts: { hp?: number; armor?: number } = {},
): TargetLike & { damageable: Damageable; position: { x: number; y: number } } {
  const emitter = new SimpleEventEmitter();
  const damageable = new Damageable({
    hp: opts.hp ?? 100,
    armor: opts.armor ?? 0,
    emitter,
  });
  return { position, damageable };
}

describe('Projectile', () => {
  it('flies in a straight line to a stationary target', () => {
    const target = makeTarget({ x: 100, y: 0 });
    const p = new Projectile({
      from: { x: 0, y: 0 },
      target,
      speed: 100,
      damage: 10,
    });

    p.update(0.5);
    expect(p.position.x).toBeCloseTo(50, 5);
    expect(p.position.y).toBeCloseTo(0, 5);
    expect(p.hasReachedTarget()).toBe(false);

    p.update(0.5);
    expect(p.hasReachedTarget()).toBe(true);
  });

  it('snaps to target when the step would overshoot', () => {
    const target = makeTarget({ x: 10, y: 0 });
    const p = new Projectile({
      from: { x: 0, y: 0 },
      target,
      speed: 1000,
      damage: 5,
    });
    p.update(1.0); // step = 1000 >> 10 remaining
    expect(p.position.x).toBeCloseTo(10, 5);
    expect(p.hasReachedTarget()).toBe(true);
  });

  it('hits a moving target within tolerance (AC)', () => {
    // Target moves at 60 px/s along +y while projectile closes from -x.
    const target = makeTarget({ x: 200, y: 0 });
    const p = new Projectile({
      from: { x: 0, y: 0 },
      target,
      speed: 300,
      damage: 12,
    });

    const dt = 1 / 60;
    const targetSpeed = 60;
    let steps = 0;
    // Give it up to 4 seconds of simulated time; projectile speed > target
    // speed so it must converge.
    while (!p.hasReachedTarget() && steps < 240) {
      target.position.y += targetSpeed * dt;
      p.update(dt);
      steps += 1;
    }

    expect(p.hasReachedTarget()).toBe(true);
    const dx = target.position.x - p.position.x;
    const dy = target.position.y - p.position.y;
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(DEFAULT_HIT_RADIUS);
  });

  it('damage on hit accounts for target armor (AC)', () => {
    const target = makeTarget({ x: 0, y: 0 }, { hp: 100, armor: 3 });
    const p = new Projectile({
      from: { x: 0, y: 0 },
      target,
      speed: 100,
      damage: 10,
    });
    // Already at target position → reached.
    expect(p.hasReachedTarget()).toBe(true);
    const effective = p.applyDamageOnHit();
    expect(effective).toBe(7);
    expect(target.damageable.hp).toBe(93);
  });

  it('does not double-hit when applyDamageOnHit is called twice', () => {
    const target = makeTarget({ x: 0, y: 0 }, { hp: 50, armor: 0 });
    const p = new Projectile({
      from: { x: 0, y: 0 },
      target,
      speed: 100,
      damage: 10,
    });
    p.applyDamageOnHit();
    p.applyDamageOnHit();
    expect(target.damageable.hp).toBe(40);
    expect(p.done).toBe(true);
    expect(p.hit).toBe(true);
  });

  it('resolves without damage if target already died before arrival', () => {
    const target = makeTarget({ x: 1000, y: 0 }, { hp: 5, armor: 0 });
    const p = new Projectile({
      from: { x: 0, y: 0 },
      target,
      speed: 100,
      damage: 10,
    });
    // Kill target before projectile arrives.
    target.damageable.applyDamage(100);
    expect(target.damageable.dead).toBe(true);
    p.update(0.1);
    expect(p.done).toBe(true);
    expect(p.hit).toBe(false);
  });
});
