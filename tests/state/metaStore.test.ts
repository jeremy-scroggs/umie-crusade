import { describe, it, expect, beforeEach } from 'vitest';
import { useMetaStore, SAVE_VERSION } from '@/state/metaStore';
import type { Hero } from '@/types';

const STORAGE_KEY = 'umie-crusade-meta';

function makeHero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'hero-1',
    name: 'Brute',
    heroDefId: 'brute-hero',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('metaStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useMetaStore.getState().reset();
    useMetaStore.getState().resetHedknahPile();
    // Lifetime fields don't have public reset helpers (intentional —
    // they're meta-progression). The localStorage.clear() above is the
    // canonical test path; we additionally zero them via setState so a
    // single test doesn't bleed accumulator state into the next.
    useMetaStore.setState({
      lifetimeBludgelt: 0,
      highestWaveReached: 0,
      saveVersion: SAVE_VERSION,
    });
  });

  it('starts with empty roster and no active hero', () => {
    const state = useMetaStore.getState();
    expect(state.heroRoster).toEqual([]);
    expect(state.activeHeroId).toBeNull();
  });

  it('addHero appends and activates the first hero', () => {
    const hero = makeHero();
    useMetaStore.getState().addHero(hero);

    const state = useMetaStore.getState();
    expect(state.heroRoster).toHaveLength(1);
    expect(state.heroRoster[0]).toEqual(hero);
    expect(state.activeHeroId).toBe('hero-1');
  });

  it('addHero does not bump active when one is already active', () => {
    const first = makeHero({ id: 'a' });
    const second = makeHero({ id: 'b', name: 'Krog' });
    useMetaStore.getState().addHero(first);
    useMetaStore.getState().addHero(second);

    const state = useMetaStore.getState();
    expect(state.heroRoster.map((h) => h.id)).toEqual(['a', 'b']);
    expect(state.activeHeroId).toBe('a');
  });

  it('setActiveHero(null) clears the active hero', () => {
    useMetaStore.getState().addHero(makeHero());
    useMetaStore.getState().setActiveHero(null);
    expect(useMetaStore.getState().activeHeroId).toBeNull();
  });

  it('setActiveHero(id) switches the active hero', () => {
    useMetaStore.getState().addHero(makeHero({ id: 'a' }));
    useMetaStore.getState().addHero(makeHero({ id: 'b' }));
    useMetaStore.getState().setActiveHero('b');
    expect(useMetaStore.getState().activeHeroId).toBe('b');
  });

  it('reset wipes roster and active hero', () => {
    useMetaStore.getState().addHero(makeHero());
    useMetaStore.getState().reset();

    const state = useMetaStore.getState();
    expect(state.heroRoster).toEqual([]);
    expect(state.activeHeroId).toBeNull();
  });

  it('persists roster to localStorage under the expected key', () => {
    const hero = makeHero();
    useMetaStore.getState().addHero(hero);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      state: { heroRoster: Hero[]; activeHeroId: string | null };
    };
    expect(parsed.state.heroRoster).toHaveLength(1);
    expect(parsed.state.heroRoster[0]?.id).toBe('hero-1');
    expect(parsed.state.activeHeroId).toBe('hero-1');
  });

  it('rehydrates from localStorage on persist.rehydrate()', async () => {
    const hero = makeHero({ id: 'persist-me' });
    useMetaStore.getState().addHero(hero);

    // Simulate a fresh page load: persist middleware re-reads from
    // localStorage (the hero we just wrote) and applies it to the store.
    await useMetaStore.persist.rehydrate();

    const state = useMetaStore.getState();
    expect(state.heroRoster.map((h) => h.id)).toContain('persist-me');
    expect(state.activeHeroId).toBe('persist-me');
  });

  describe('removeHero', () => {
    it('removes a hero from the roster', () => {
      useMetaStore.getState().addHero(makeHero({ id: 'a' }));
      useMetaStore.getState().addHero(makeHero({ id: 'b' }));
      useMetaStore.getState().removeHero('a');

      const state = useMetaStore.getState();
      expect(state.heroRoster.map((h) => h.id)).toEqual(['b']);
    });

    it('clears activeHeroId when the active hero is removed', () => {
      useMetaStore.getState().addHero(makeHero({ id: 'a' }));
      useMetaStore.getState().addHero(makeHero({ id: 'b' }));
      // 'a' was first added and is therefore active.
      useMetaStore.getState().removeHero('a');
      expect(useMetaStore.getState().activeHeroId).toBeNull();
    });

    it('preserves activeHeroId when a non-active hero is removed', () => {
      useMetaStore.getState().addHero(makeHero({ id: 'a' }));
      useMetaStore.getState().addHero(makeHero({ id: 'b' }));
      useMetaStore.getState().removeHero('b');
      expect(useMetaStore.getState().activeHeroId).toBe('a');
    });

    it('is a no-op for an unknown id', () => {
      useMetaStore.getState().addHero(makeHero({ id: 'a' }));
      useMetaStore.getState().removeHero('does-not-exist');
      expect(useMetaStore.getState().heroRoster.map((h) => h.id)).toEqual([
        'a',
      ]);
      expect(useMetaStore.getState().activeHeroId).toBe('a');
    });
  });

  describe('Hedk\'nah Pile slice', () => {
    it('starts at 0', () => {
      expect(useMetaStore.getState().hedknahPile).toBe(0);
    });

    it('addToHedknahPile(n) accumulates', () => {
      useMetaStore.getState().addToHedknahPile(3);
      useMetaStore.getState().addToHedknahPile(5);
      expect(useMetaStore.getState().hedknahPile).toBe(8);
    });

    it('addToHedknahPile ignores zero and negative values', () => {
      useMetaStore.getState().addToHedknahPile(0);
      useMetaStore.getState().addToHedknahPile(-7);
      expect(useMetaStore.getState().hedknahPile).toBe(0);
    });

    it('persists hedknahPile to localStorage under the same key', () => {
      useMetaStore.getState().addToHedknahPile(11);

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string) as {
        state: { hedknahPile: number };
      };
      expect(parsed.state.hedknahPile).toBe(11);
    });

    it('reset() does NOT clear hedknahPile (meta-progression survives)', () => {
      useMetaStore.getState().addToHedknahPile(4);
      useMetaStore.getState().reset();
      expect(useMetaStore.getState().hedknahPile).toBe(4);
    });

    it('resetHedknahPile() clears the pile', () => {
      useMetaStore.getState().addToHedknahPile(4);
      useMetaStore.getState().resetHedknahPile();
      expect(useMetaStore.getState().hedknahPile).toBe(0);
    });

    it('rehydrates hedknahPile from localStorage', async () => {
      useMetaStore.getState().addToHedknahPile(9);
      await useMetaStore.persist.rehydrate();
      expect(useMetaStore.getState().hedknahPile).toBe(9);
    });
  });

  describe('lifetimeBludgelt slice', () => {
    it('starts at 0', () => {
      expect(useMetaStore.getState().lifetimeBludgelt).toBe(0);
    });

    it('addLifetimeBludgelt(n) accumulates', () => {
      useMetaStore.getState().addLifetimeBludgelt(50);
      useMetaStore.getState().addLifetimeBludgelt(75);
      expect(useMetaStore.getState().lifetimeBludgelt).toBe(125);
    });

    it('addLifetimeBludgelt ignores zero and negative values', () => {
      useMetaStore.getState().addLifetimeBludgelt(0);
      useMetaStore.getState().addLifetimeBludgelt(-10);
      expect(useMetaStore.getState().lifetimeBludgelt).toBe(0);
    });

    it('persists lifetimeBludgelt to localStorage', () => {
      useMetaStore.getState().addLifetimeBludgelt(42);

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string) as {
        state: { lifetimeBludgelt: number };
      };
      expect(parsed.state.lifetimeBludgelt).toBe(42);
    });

    it('reset() does NOT clear lifetimeBludgelt', () => {
      useMetaStore.getState().addLifetimeBludgelt(33);
      useMetaStore.getState().reset();
      expect(useMetaStore.getState().lifetimeBludgelt).toBe(33);
    });

    it('rehydrates lifetimeBludgelt from localStorage', async () => {
      useMetaStore.getState().addLifetimeBludgelt(17);
      await useMetaStore.persist.rehydrate();
      expect(useMetaStore.getState().lifetimeBludgelt).toBe(17);
    });
  });

  describe('highestWaveReached slice', () => {
    it('starts at 0', () => {
      expect(useMetaStore.getState().highestWaveReached).toBe(0);
    });

    it('updateHighestWave(n) only writes when n is strictly greater', () => {
      useMetaStore.getState().updateHighestWave(3);
      expect(useMetaStore.getState().highestWaveReached).toBe(3);

      useMetaStore.getState().updateHighestWave(5);
      expect(useMetaStore.getState().highestWaveReached).toBe(5);

      // Equal — no-op.
      useMetaStore.getState().updateHighestWave(5);
      expect(useMetaStore.getState().highestWaveReached).toBe(5);

      // Lower — no-op.
      useMetaStore.getState().updateHighestWave(2);
      expect(useMetaStore.getState().highestWaveReached).toBe(5);
    });

    it('persists highestWaveReached to localStorage', () => {
      useMetaStore.getState().updateHighestWave(4);

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string) as {
        state: { highestWaveReached: number };
      };
      expect(parsed.state.highestWaveReached).toBe(4);
    });

    it('reset() does NOT clear highestWaveReached', () => {
      useMetaStore.getState().updateHighestWave(5);
      useMetaStore.getState().reset();
      expect(useMetaStore.getState().highestWaveReached).toBe(5);
    });

    it('rehydrates highestWaveReached from localStorage', async () => {
      useMetaStore.getState().updateHighestWave(7);
      await useMetaStore.persist.rehydrate();
      expect(useMetaStore.getState().highestWaveReached).toBe(7);
    });
  });

  describe('saveVersion', () => {
    it('starts at SAVE_VERSION (1)', () => {
      expect(useMetaStore.getState().saveVersion).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBe(1);
    });

    it('persists saveVersion in the state payload', () => {
      // Trigger a write so the persist middleware flushes.
      useMetaStore.getState().addLifetimeBludgelt(1);

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string) as {
        state: { saveVersion: number };
        version: number;
      };
      expect(parsed.state.saveVersion).toBe(SAVE_VERSION);
      // Zustand persist's own `version` option should match the state field
      // so a future migration has a single source of truth.
      expect(parsed.version).toBe(SAVE_VERSION);
    });
  });
});
