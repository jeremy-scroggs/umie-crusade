import { describe, it, expect, vi } from 'vitest';
import { Economy } from '@/game/systems/Economy';
import type { EconomyStoreLike } from '@/game/systems/Economy';
import { GameEvents } from '@/game/systems/events';
import type { WaveCompletePayload } from '@/game/systems/events';
import { SimpleEventEmitter } from '@/game/components/EventEmitter';
import { Human } from '@/game/entities/Human';
import { Orc } from '@/game/entities/Orc';
import mouggGrunt from '@/data/orcs/mougg-grunt.json';
import peasantLevy from '@/data/humans/peasant-levy.json';
import m1Wave1 from '@/data/waves/m1-wave-1.json';
import type { UnitDef, WaveDef } from '@/types';

const orcDef = mouggGrunt as UnitDef;
const humanDef = peasantLevy as UnitDef;
const wave1 = m1Wave1 as WaveDef;

/** Simple in-memory store matching the Economy `EconomyStoreLike` contract. */
function makeStubStore(initial = 0): EconomyStoreLike & {
  setGold(n: number): void;
} {
  let gold = initial;
  return {
    get gold() {
      return gold;
    },
    addGold(n: number) {
      gold += n;
    },
    spendGold(n: number) {
      if (gold < n) return false;
      gold -= n;
      return true;
    },
    setGold(n: number) {
      gold = n;
    },
  };
}

describe('Economy — human kills', () => {
  it('credits goldDrop to the store on human death (AC)', () => {
    const store = makeStubStore(0);
    const economy = new Economy({ store });
    const human = Human.fromDef(humanDef);
    const spy = vi.fn();
    economy.emitter.on('economy:gold-drop', spy);

    economy.registerHuman(human);
    human.damageable.applyDamage(999);

    expect(store.gold).toBe(humanDef.goldDrop);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      unitId: humanDef.id,
      amount: humanDef.goldDrop,
    });
  });

  it('missing goldDrop -> no credit, no event', () => {
    const store = makeStubStore(0);
    const economy = new Economy({ store });
    const stripped: UnitDef = { ...humanDef };
    delete (stripped as { goldDrop?: number }).goldDrop;
    const human = Human.fromDef(stripped);
    const spy = vi.fn();
    economy.emitter.on('economy:gold-drop', spy);

    economy.registerHuman(human);
    human.damageable.applyDamage(999);

    expect(store.gold).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('re-registering the same human does not double-credit', () => {
    const store = makeStubStore(0);
    const economy = new Economy({ store });
    const human = Human.fromDef(humanDef);

    economy.registerHuman(human);
    economy.registerHuman(human);
    human.damageable.applyDamage(999);

    expect(store.gold).toBe(humanDef.goldDrop);
  });
});

describe('Economy — orc respawn', () => {
  it('debits gold and starts a timer when funded', () => {
    const cost = orcDef.respawnCost;
    if (!cost) throw new Error('fixture: mougg-grunt must have respawnCost');
    const store = makeStubStore(cost.gold * 2);
    const economy = new Economy({ store });
    const orc = Orc.fromDef(orcDef);

    const result = economy.requestRespawn(orc);

    expect(result).toEqual({ ok: true, respawnAt: cost.time });
    expect(store.gold).toBe(cost.gold * 2 - cost.gold);
    expect(economy.hasPendingRespawn(orc)).toBe(true);
  });

  it('returns insufficient-gold when under-funded; store untouched (AC)', () => {
    const cost = orcDef.respawnCost;
    if (!cost) throw new Error('fixture: mougg-grunt must have respawnCost');
    const store = makeStubStore(cost.gold - 1);
    const economy = new Economy({ store });
    const orc = Orc.fromDef(orcDef);
    const spy = vi.fn();
    economy.emitter.on('economy:insufficient-gold', spy);

    const result = economy.requestRespawn(orc);

    expect(result).toEqual({
      ok: false,
      reason: 'insufficient-gold',
      needed: cost.gold,
      have: cost.gold - 1,
    });
    expect(store.gold).toBe(cost.gold - 1);
    expect(economy.hasPendingRespawn(orc)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('fires respawn-ready event when the timer elapses (AC)', () => {
    const cost = orcDef.respawnCost;
    if (!cost) throw new Error('fixture: mougg-grunt must have respawnCost');
    const store = makeStubStore(cost.gold);
    const economy = new Economy({ store });
    const orc = Orc.fromDef(orcDef);
    const spy = vi.fn();
    economy.emitter.on('economy:respawn-ready', spy);

    economy.requestRespawn(orc);
    economy.update(cost.time);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ orc });
    expect(economy.hasPendingRespawn(orc)).toBe(false);

    // Further updates are a no-op.
    economy.update(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('progresses the timer across multiple ticks', () => {
    const cost = orcDef.respawnCost;
    if (!cost) throw new Error('fixture: mougg-grunt must have respawnCost');
    const store = makeStubStore(cost.gold);
    const economy = new Economy({ store });
    const orc = Orc.fromDef(orcDef);
    const spy = vi.fn();
    economy.emitter.on('economy:respawn-ready', spy);

    economy.requestRespawn(orc);
    economy.update(cost.time / 2);
    expect(spy).not.toHaveBeenCalled();
    expect(economy.hasPendingRespawn(orc)).toBe(true);

    economy.update(cost.time / 2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns no-respawn-cost when the def lacks a respawnCost block', () => {
    const store = makeStubStore(1000);
    const economy = new Economy({ store });
    // Peasant levy has no `respawnCost` — use it as the defensive input
    // (cast through the structural orc-like shape the system expects).
    const humanish = { def: humanDef };
    const result = economy.requestRespawn(humanish);
    expect(result).toEqual({ ok: false, reason: 'no-respawn-cost' });
    expect(store.gold).toBe(1000);
  });
});

describe('Economy — wave complete', () => {
  it('credits reward.gold when wave:complete is emitted (AC)', () => {
    const store = makeStubStore(0);
    const economy = new Economy({ store });
    const spy = vi.fn();
    economy.emitter.on('economy:wave-reward', spy);

    const payload: WaveCompletePayload = {
      waveId: wave1.id,
      waveNumber: wave1.number,
      reward: { gold: wave1.reward.gold },
    };
    economy.emitter.emit(GameEvents.WaveComplete, payload);

    expect(store.gold).toBe(wave1.reward.gold);
    expect(spy).toHaveBeenCalledWith({
      waveId: wave1.id,
      amount: wave1.reward.gold,
    });
  });

  it('shares a single emitter with a future wave system', () => {
    // Pass an explicit bus in the ctor — simulates the wave-spawning
    // system emitting on the same shared emitter.
    const bus = new SimpleEventEmitter();
    const store = makeStubStore(0);
    new Economy({ store, emitter: bus });

    bus.emit(GameEvents.WaveComplete, {
      waveId: wave1.id,
      waveNumber: wave1.number,
      reward: { gold: wave1.reward.gold },
    } satisfies WaveCompletePayload);

    expect(store.gold).toBe(wave1.reward.gold);
  });

  it('zero-gold wave reward is a no-op', () => {
    const store = makeStubStore(0);
    const economy = new Economy({ store });
    const spy = vi.fn();
    economy.emitter.on('economy:wave-reward', spy);

    economy.emitter.emit(GameEvents.WaveComplete, {
      waveId: 'synthetic',
      waveNumber: 99,
      reward: { gold: 0 },
    } satisfies WaveCompletePayload);

    expect(store.gold).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Economy — canAfford', () => {
  it('reports true when the store holds at least `amount`', () => {
    const store = makeStubStore(50);
    const economy = new Economy({ store });
    expect(economy.canAfford(50)).toBe(true);
    expect(economy.canAfford(49)).toBe(true);
    expect(economy.canAfford(51)).toBe(false);
  });
});
