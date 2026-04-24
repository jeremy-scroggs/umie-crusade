import { describe, it, expect, vi } from 'vitest';
import { Hero } from '@/game/entities/Hero';
import type { HeroAbilityTargetLike } from '@/game/entities/Hero';
import { Damageable, SimpleEventEmitter } from '@/game/components';
import mouggR from '@/data/heroes/mougg-r.json';
import type { HeroDef } from '@/types';

const heroDef = mouggR as HeroDef;

/** Build a plain target that satisfies HeroAbilityTargetLike. */
const makeTarget = (
  x: number,
  y: number,
  opts: { hp?: number; armor?: number } = {},
): HeroAbilityTargetLike & {
  damageable: Damageable;
  stunnedUntilMs?: number;
} => {
  const hp = opts.hp ?? 100;
  const armor = opts.armor ?? 0;
  const damageable = new Damageable({
    hp,
    armor,
    emitter: new SimpleEventEmitter(),
  });
  return {
    position: { x, y },
    damageable,
  };
};

describe('Hero.fromDef', () => {
  it('reads hp/armor/category from the def (no hardcoded stats)', () => {
    const hero = Hero.fromDef(heroDef);
    expect(hero.damageable.maxHp).toBe(heroDef.stats.hp);
    expect(hero.damageable.armor).toBe(heroDef.stats.armor);
    expect(hero.damageable.hp).toBe(heroDef.stats.hp);
    expect(hero.targetable.isTargetable).toBe(true);
    expect(typeof hero.targetable.priority).toBe('number');
  });

  it('wires the Ability component from def.ability', () => {
    const hero = Hero.fromDef(heroDef);
    expect(hero.ability.id).toBe(heroDef.ability.id);
    expect(hero.ability.cooldownMs).toBe(heroDef.ability.cooldownMs);
    expect(hero.ability.canUse(0)).toBe(true);
  });

  it('throws on non-orc faction (parity with Orc.fromDef)', () => {
    const bogus: HeroDef = { ...heroDef, faction: 'human' };
    expect(() => Hero.fromDef(bogus)).toThrow(/faction 'orc'/);
  });
});

describe('Hero.tryUseAbility (Clomp\'uk)', () => {
  it('damages every in-radius target by def.ability.damage (armor-aware)', () => {
    const hero = Hero.fromDef(heroDef);
    const { radius, damage } = heroDef.ability;

    // Two in range, one with armor 5 so effective = damage - 5.
    const a = makeTarget(0, 0, { armor: 0 });
    const b = makeTarget(radius - 1, 0, { armor: 5 });
    // One just outside the radius.
    const c = makeTarget(radius + 1, 0, { armor: 0 });

    const hpA = a.damageable.hp;
    const hpB = b.damageable.hp;
    const hpC = c.damageable.hp;

    const result = hero.tryUseAbility({
      nowMs: 0,
      position: { x: 0, y: 0 },
      targets: [a, b, c],
    });

    expect(result.used).toBe(true);
    if (!result.used) throw new Error('unreachable');
    expect(result.hits).toHaveLength(2);

    expect(a.damageable.hp).toBe(hpA - damage);
    expect(b.damageable.hp).toBe(hpB - Math.max(0, damage - 5));
    expect(c.damageable.hp).toBe(hpC); // untouched
  });

  it('applies stun (stunnedUntilMs = nowMs + stunMs) to each hit target', () => {
    const hero = Hero.fromDef(heroDef);
    const { radius, stunMs } = heroDef.ability;
    const nowMs = 10_000;

    const inRange = makeTarget(radius / 2, 0);
    const outOfRange = makeTarget(radius * 3, 0);

    hero.tryUseAbility({
      nowMs,
      position: { x: 0, y: 0 },
      targets: [inRange, outOfRange],
    });

    expect(inRange.stunnedUntilMs).toBe(nowMs + stunMs);
    expect(outOfRange.stunnedUntilMs).toBeUndefined();
  });

  it('skips dead targets (no re-apply of damage or stun)', () => {
    const hero = Hero.fromDef(heroDef);
    const target = makeTarget(0, 0);

    // Kill the target before the slam.
    target.damageable.applyDamage(target.damageable.maxHp + 1);
    expect(target.damageable.dead).toBe(true);

    const result = hero.tryUseAbility({
      nowMs: 0,
      position: { x: 0, y: 0 },
      targets: [target],
    });

    expect(result.used).toBe(true);
    if (!result.used) throw new Error('unreachable');
    expect(result.hits).toHaveLength(0);
    expect(target.stunnedUntilMs).toBeUndefined();
  });

  it('respects cooldown: second call before cooldown elapses is a no-op', () => {
    const hero = Hero.fromDef(heroDef);
    const { cooldownMs } = heroDef.ability;

    const t = makeTarget(0, 0);
    const hpBefore = t.damageable.hp;

    const first = hero.tryUseAbility({
      nowMs: 0,
      position: { x: 0, y: 0 },
      targets: [t],
    });
    expect(first.used).toBe(true);
    const hpAfterFirst = t.damageable.hp;
    expect(hpAfterFirst).toBeLessThan(hpBefore);
    const stunAfterFirst = t.stunnedUntilMs;

    // Call again immediately and mid-cooldown: both rejected.
    for (const nowMs of [1, Math.floor(cooldownMs / 2), cooldownMs - 1]) {
      const result = hero.tryUseAbility({
        nowMs,
        position: { x: 0, y: 0 },
        targets: [t],
      });
      expect(result.used).toBe(false);
      if (result.used) throw new Error('unreachable');
      expect(result.reason).toBe('cooldown');
    }

    // HP and stun timestamp unchanged after the failed calls.
    expect(t.damageable.hp).toBe(hpAfterFirst);
    expect(t.stunnedUntilMs).toBe(stunAfterFirst);
  });

  it('is usable again once cooldownMs has fully elapsed', () => {
    const hero = Hero.fromDef(heroDef);
    const { cooldownMs } = heroDef.ability;

    hero.tryUseAbility({
      nowMs: 0,
      position: { x: 0, y: 0 },
      targets: [makeTarget(0, 0)],
    });

    const later = hero.tryUseAbility({
      nowMs: cooldownMs,
      position: { x: 0, y: 0 },
      targets: [makeTarget(0, 0)],
    });
    expect(later.used).toBe(true);
  });

  it("emits 'hero-ability-used' once per successful slam", () => {
    const hero = Hero.fromDef(heroDef);
    const onUsed = vi.fn();
    hero.emitter.on('hero-ability-used', onUsed);

    hero.tryUseAbility({
      nowMs: 500,
      position: { x: 10, y: 20 },
      targets: [makeTarget(10, 20)],
    });

    expect(onUsed).toHaveBeenCalledTimes(1);
    const [payload] = onUsed.mock.calls[0] as [
      {
        id: string;
        position: { x: number; y: number };
        hits: unknown[];
        stunUntilMs: number;
        usedAtMs: number;
      },
    ];
    expect(payload.id).toBe(heroDef.ability.id);
    expect(payload.position).toEqual({ x: 10, y: 20 });
    expect(payload.hits).toHaveLength(1);
    expect(payload.stunUntilMs).toBe(500 + heroDef.ability.stunMs);
    expect(payload.usedAtMs).toBe(500);
  });

  it('does NOT emit when on cooldown', () => {
    const hero = Hero.fromDef(heroDef);
    const onUsed = vi.fn();
    hero.emitter.on('hero-ability-used', onUsed);

    hero.tryUseAbility({
      nowMs: 0,
      position: { x: 0, y: 0 },
      targets: [makeTarget(0, 0)],
    });
    expect(onUsed).toHaveBeenCalledTimes(1);

    hero.tryUseAbility({
      nowMs: 1,
      position: { x: 0, y: 0 },
      targets: [makeTarget(0, 0)],
    });
    expect(onUsed).toHaveBeenCalledTimes(1);
  });
});
