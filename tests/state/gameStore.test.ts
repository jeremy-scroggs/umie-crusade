import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore, TIME_SCALES, isTimeScale } from '@/state/gameStore';
import { Economy } from '@/game/systems/Economy';
import { GameEvents } from '@/game/systems/events';
import type { WaveCompletePayload } from '@/game/systems/events';
import { Human } from '@/game/entities/Human';
import { Orc } from '@/game/entities/Orc';
import peasantLevy from '@/data/humans/peasant-levy.json';
import grunt from '@/data/orcs/grunt.json';
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

  describe('hero hp slice', () => {
    it('starts with heroHp 0 and heroMaxHp 0', () => {
      const { heroHp, heroMaxHp } = useGameStore.getState();
      expect(heroHp).toBe(0);
      expect(heroMaxHp).toBe(0);
    });

    it('setHero records both hp and maxHp', () => {
      useGameStore.getState().setHero(40, 80);
      const { heroHp, heroMaxHp } = useGameStore.getState();
      expect(heroHp).toBe(40);
      expect(heroMaxHp).toBe(80);
    });

    it('setHero clamps hp to [0, maxHp]', () => {
      useGameStore.getState().setHero(500, 100);
      expect(useGameStore.getState().heroHp).toBe(100);
      useGameStore.getState().setHero(-30, 100);
      expect(useGameStore.getState().heroHp).toBe(0);
    });

    it('damageHero floors at 0', () => {
      useGameStore.getState().setHero(50, 100);
      useGameStore.getState().damageHero(80);
      expect(useGameStore.getState().heroHp).toBe(0);
    });

    it('healHero caps at maxHp', () => {
      useGameStore.getState().setHero(80, 100);
      useGameStore.getState().healHero(50);
      expect(useGameStore.getState().heroHp).toBe(100);
    });

    it('damageHero / healHero ignore non-positive amounts', () => {
      useGameStore.getState().setHero(50, 100);
      useGameStore.getState().damageHero(0);
      useGameStore.getState().damageHero(-10);
      useGameStore.getState().healHero(0);
      useGameStore.getState().healHero(-10);
      expect(useGameStore.getState().heroHp).toBe(50);
    });
  });

  describe('skulls slice', () => {
    it('starts at 0', () => {
      expect(useGameStore.getState().skulls).toBe(0);
    });

    it('addSkull increments by one', () => {
      useGameStore.getState().addSkull();
      useGameStore.getState().addSkull();
      expect(useGameStore.getState().skulls).toBe(2);
    });

    it('setSkulls overrides and floors negatives at 0', () => {
      useGameStore.getState().setSkulls(13);
      expect(useGameStore.getState().skulls).toBe(13);
      useGameStore.getState().setSkulls(-5);
      expect(useGameStore.getState().skulls).toBe(0);
    });
  });

  describe('wave-start banner slice', () => {
    it('starts null', () => {
      expect(useGameStore.getState().waveStartAtMs).toBe(null);
    });

    it('triggerWaveStart records the timestamp', () => {
      useGameStore.getState().triggerWaveStart(12345);
      expect(useGameStore.getState().waveStartAtMs).toBe(12345);
    });

    it('clearWaveStart resets to null', () => {
      useGameStore.getState().triggerWaveStart(12345);
      useGameStore.getState().clearWaveStart();
      expect(useGameStore.getState().waveStartAtMs).toBe(null);
    });
  });

  describe('reset clears HUD slices', () => {
    it('reset zeroes hero hp, skulls, and wave-start banner', () => {
      useGameStore.getState().setHero(50, 100);
      useGameStore.getState().setSkulls(7);
      useGameStore.getState().triggerWaveStart(999);
      useGameStore.getState().reset();
      const s = useGameStore.getState();
      expect(s.heroHp).toBe(0);
      expect(s.heroMaxHp).toBe(0);
      expect(s.skulls).toBe(0);
      expect(s.waveStartAtMs).toBe(null);
    });
  });

  describe('runStatus slice', () => {
    it('starts as running', () => {
      expect(useGameStore.getState().runStatus).toBe('running');
    });

    it('winRun() flips to won', () => {
      useGameStore.getState().winRun();
      expect(useGameStore.getState().runStatus).toBe('won');
    });

    it('loseRun() flips to lost', () => {
      useGameStore.getState().loseRun();
      expect(useGameStore.getState().runStatus).toBe('lost');
    });

    it('setRunStatus(s) sets to a given value', () => {
      useGameStore.getState().setRunStatus('won');
      expect(useGameStore.getState().runStatus).toBe('won');
      useGameStore.getState().setRunStatus('lost');
      expect(useGameStore.getState().runStatus).toBe('lost');
      useGameStore.getState().setRunStatus('running');
      expect(useGameStore.getState().runStatus).toBe('running');
    });

    it('reset() returns runStatus to running', () => {
      useGameStore.getState().winRun();
      useGameStore.getState().reset();
      expect(useGameStore.getState().runStatus).toBe('running');
    });
  });

  describe('timeScale slice', () => {
    it('exposes the canonical TIME_SCALES tuple', () => {
      // Lock the supported set so a future change to the tuple is a
      // visible breaking-change (HUD #76 reads the same tuple).
      expect([...TIME_SCALES]).toEqual([0, 1, 2, 4]);
    });

    it('isTimeScale guards every member of the tuple', () => {
      for (const n of TIME_SCALES) {
        expect(isTimeScale(n)).toBe(true);
      }
    });

    it('isTimeScale rejects values outside the tuple', () => {
      expect(isTimeScale(3)).toBe(false);
      expect(isTimeScale(0.5)).toBe(false);
      expect(isTimeScale(-1)).toBe(false);
      expect(isTimeScale(Number.NaN)).toBe(false);
    });

    it('starts at 1', () => {
      expect(useGameStore.getState().timeScale).toBe(1);
    });

    it.each(TIME_SCALES)('setTimeScale accepts %s', (n) => {
      useGameStore.getState().setTimeScale(n);
      expect(useGameStore.getState().timeScale).toBe(n);
    });

    it('setTimeScale rejects out-of-set values (no-op + warn)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        useGameStore.getState().setTimeScale(2);
        expect(useGameStore.getState().timeScale).toBe(2);
        useGameStore.getState().setTimeScale(3);
        expect(useGameStore.getState().timeScale).toBe(2);
        useGameStore.getState().setTimeScale(0.5);
        expect(useGameStore.getState().timeScale).toBe(2);
        expect(warn).toHaveBeenCalledTimes(2);
      } finally {
        warn.mockRestore();
      }
    });

    it('reset returns timeScale to 1', () => {
      useGameStore.getState().setTimeScale(4);
      expect(useGameStore.getState().timeScale).toBe(4);
      useGameStore.getState().reset();
      expect(useGameStore.getState().timeScale).toBe(1);
    });
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
  const orcDef = grunt as UnitDef;
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
    if (!cost) throw new Error('fixture: grunt must have respawnCost');
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
