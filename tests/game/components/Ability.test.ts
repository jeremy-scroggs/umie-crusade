import { describe, it, expect, vi } from 'vitest';
import { Ability } from '@/game/components/Ability';
import { SimpleEventEmitter } from '@/game/components/EventEmitter';
import mouggR from '@/data/heroes/mougg-r.json';
import type { HeroDef } from '@/types';

const heroDef = mouggR as HeroDef;

const makeAbility = () =>
  new Ability({ def: heroDef.ability, emitter: new SimpleEventEmitter() });

describe('Ability', () => {
  it('copies id + cooldownMs from the def (no hardcoded stats)', () => {
    const a = makeAbility();
    expect(a.id).toBe(heroDef.ability.id);
    expect(a.cooldownMs).toBe(heroDef.ability.cooldownMs);
  });

  it('a fresh ability is usable at any nowMs', () => {
    const a = makeAbility();
    expect(a.canUse(0)).toBe(true);
    expect(a.canUse(999999)).toBe(true);
    expect(a.lastUsedAtMs).toBe(null);
    expect(a.remainingMs(0)).toBe(0);
  });

  it('after markUsed, stays on cooldown until the full interval elapses', () => {
    const a = makeAbility();
    const usedAt = 1000;
    a.markUsed(usedAt);

    expect(a.canUse(usedAt)).toBe(false);
    expect(a.canUse(usedAt + heroDef.ability.cooldownMs - 1)).toBe(false);
    expect(a.canUse(usedAt + heroDef.ability.cooldownMs)).toBe(true);
    expect(a.lastUsedAtMs).toBe(usedAt);
  });

  it('remainingMs counts down from cooldownMs to 0', () => {
    const a = makeAbility();
    const cd = heroDef.ability.cooldownMs;
    a.markUsed(0);

    expect(a.remainingMs(0)).toBe(cd);
    expect(a.remainingMs(Math.floor(cd / 2))).toBe(cd - Math.floor(cd / 2));
    expect(a.remainingMs(cd)).toBe(0);
    expect(a.remainingMs(cd + 500)).toBe(0);
  });

  it("emits 'ability-used' with { id, usedAtMs } on markUsed", () => {
    const emitter = new SimpleEventEmitter();
    const onUsed = vi.fn();
    emitter.on('ability-used', onUsed);

    const a = new Ability({ def: heroDef.ability, emitter });
    a.markUsed(1234);

    expect(onUsed).toHaveBeenCalledTimes(1);
    expect(onUsed).toHaveBeenCalledWith({
      id: heroDef.ability.id,
      usedAtMs: 1234,
    });
  });
});
