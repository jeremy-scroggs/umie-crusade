import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/state/gameStore';
import { Economy } from '@/game/systems/Economy';
import { GameEvents } from '@/game/systems/events';
import type { WaveCompletePayload } from '@/game/systems/events';
import { Human } from '@/game/entities/Human';
import { Orc } from '@/game/entities/Orc';
import peasantLevy from '@/data/humans/peasant-levy.json';
import mouggGrunt from '@/data/orcs/mougg-grunt.json';
import m1Wave1 from '@/data/waves/m1-wave-1.json';
import type { UnitDef, WaveDef } from '@/types';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('starts with zero gold', () => {
    expect(useGameStore.getState().gold).toBe(0);
  });

  it('starts at wave 0', () => {
    expect(useGameStore.getState().wave).toBe(0);
  });

  it('starts with 10 lives', () => {
    expect(useGameStore.getState().lives).toBe(10);
  });

  it('addGold increases gold', () => {
    useGameStore.getState().addGold(25);
    expect(useGameStore.getState().gold).toBe(25);

    useGameStore.getState().addGold(10);
    expect(useGameStore.getState().gold).toBe(35);
  });

  it('spendGold decreases gold when sufficient', () => {
    useGameStore.getState().addGold(50);
    const result = useGameStore.getState().spendGold(30);
    expect(result).toBe(true);
    expect(useGameStore.getState().gold).toBe(20);
  });

  it('spendGold returns false when insufficient', () => {
    useGameStore.getState().addGold(10);
    const result = useGameStore.getState().spendGold(20);
    expect(result).toBe(false);
    expect(useGameStore.getState().gold).toBe(10);
  });

  it('setWave updates wave number', () => {
    useGameStore.getState().setWave(5);
    expect(useGameStore.getState().wave).toBe(5);
  });

  it('loseLife decrements lives', () => {
    useGameStore.getState().loseLife();
    expect(useGameStore.getState().lives).toBe(9);
  });

  it('reset returns to initial state', () => {
    useGameStore.getState().addGold(100);
    useGameStore.getState().setWave(10);
    useGameStore.getState().loseLife();
    useGameStore.getState().reset();

    const state = useGameStore.getState();
    expect(state.gold).toBe(0);
    expect(state.wave).toBe(0);
    expect(state.lives).toBe(10);
  });

  describe('heroAbility slice', () => {
    it('starts empty (cooldownMs 0, readyAtMs null)', () => {
      const { heroAbility } = useGameStore.getState();
      expect(heroAbility.cooldownMs).toBe(0);
      expect(heroAbility.readyAtMs).toBe(null);
    });

    it('setHeroAbilityCooldown records both values', () => {
      useGameStore.getState().setHeroAbilityCooldown(12000, 13000);
      const { heroAbility } = useGameStore.getState();
      expect(heroAbility.cooldownMs).toBe(12000);
      expect(heroAbility.readyAtMs).toBe(13000);
    });

    it('clearHeroAbility resets the slice', () => {
      useGameStore.getState().setHeroAbilityCooldown(12000, 13000);
      useGameStore.getState().clearHeroAbility();
      const { heroAbility } = useGameStore.getState();
      expect(heroAbility.cooldownMs).toBe(0);
      expect(heroAbility.readyAtMs).toBe(null);
    });

    it('reset clears the heroAbility slice as well', () => {
      useGameStore.getState().setHeroAbilityCooldown(12000, 13000);
      useGameStore.getState().reset();
      const { heroAbility } = useGameStore.getState();
      expect(heroAbility.cooldownMs).toBe(0);
      expect(heroAbility.readyAtMs).toBe(null);
    });
  });
});

describe('gameStore + Economy — kill -> respawn -> wave-complete math (AC)', () => {
  const humanDef = peasantLevy as UnitDef;
  const orcDef = mouggGrunt as UnitDef;
  const wave1 = m1Wave1 as WaveDef;

  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('exercises the full gold loop against the real Zustand store', () => {
    // Economy with default `getStore` pointing at the real store via bridge.
    const economy = new Economy();

    // 1. Start state
    expect(useGameStore.getState().gold).toBe(0);

    // 2. Kill one peasant levy -> + goldDrop
    const firstKill = Human.fromDef(humanDef);
    economy.registerHuman(firstKill);
    firstKill.damageable.applyDamage(999);
    expect(useGameStore.getState().gold).toBe(humanDef.goldDrop);

    // 3. Kill five more -> cumulative
    for (let i = 0; i < 5; i++) {
      const h = Human.fromDef(humanDef);
      economy.registerHuman(h);
      h.damageable.applyDamage(999);
    }
    const goldAfterKills = (humanDef.goldDrop ?? 0) * 6;
    expect(useGameStore.getState().gold).toBe(goldAfterKills);

    // 4. Request orc respawn -> debit respawnCost.gold
    const cost = orcDef.respawnCost;
    if (!cost) throw new Error('fixture: mougg-grunt must have respawnCost');
    const orc = Orc.fromDef(orcDef);
    const respawn = economy.requestRespawn(orc);
    expect(respawn).toEqual({ ok: true, respawnAt: cost.time });
    expect(useGameStore.getState().gold).toBe(goldAfterKills - cost.gold);

    // 5. Wave complete -> + reward.gold
    economy.emitter.emit(GameEvents.WaveComplete, {
      waveId: wave1.id,
      waveNumber: wave1.number,
      reward: { gold: wave1.reward.gold },
    } satisfies WaveCompletePayload);
    const goldAfterWave = goldAfterKills - cost.gold + wave1.reward.gold;
    expect(useGameStore.getState().gold).toBe(goldAfterWave);

    // 6. Drain and attempt another respawn with insufficient gold
    const drainTo = cost.gold - 1;
    const drain = goldAfterWave - drainTo;
    expect(useGameStore.getState().spendGold(drain)).toBe(true);
    expect(useGameStore.getState().gold).toBe(drainTo);

    const secondOrc = Orc.fromDef(orcDef);
    const failed = economy.requestRespawn(secondOrc);
    expect(failed).toEqual({
      ok: false,
      reason: 'insufficient-gold',
      needed: cost.gold,
      have: drainTo,
    });
    // Insufficient debit must not mutate the store.
    expect(useGameStore.getState().gold).toBe(drainTo);

    // 7. Advance the first timer to completion
    const readySpy = (received: unknown[] = []) => {
      const capture = (payload: unknown) => {
        received.push(payload);
      };
      return { capture, received };
    };
    const { capture, received } = readySpy();
    economy.emitter.on('economy:respawn-ready', capture);
    economy.update(cost.time);
    expect(received).toHaveLength(1);
  });
});
