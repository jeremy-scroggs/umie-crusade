import { describe, it, expect, beforeEach } from 'vitest';
import { useMetaStore } from '@/state/metaStore';
import type { Hero } from '@/types';

const STORAGE_KEY = 'umie-crusade-meta';

function makeHero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'hero-1',
    name: "Mougg'r",
    bloodline: 'mougg-r',
    heroDefId: 'mougg-r-hero',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('metaStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useMetaStore.getState().reset();
  });

  it('starts with empty roster and no active hero', () => {
    const state = useMetaStore.getState();
    expect(state.roster).toEqual([]);
    expect(state.activeHeroId).toBeNull();
  });

  it('addHero appends and activates the first hero', () => {
    const hero = makeHero();
    useMetaStore.getState().addHero(hero);

    const state = useMetaStore.getState();
    expect(state.roster).toHaveLength(1);
    expect(state.roster[0]).toEqual(hero);
    expect(state.activeHeroId).toBe('hero-1');
  });

  it('addHero does not bump active when one is already active', () => {
    const first = makeHero({ id: 'a' });
    const second = makeHero({ id: 'b', name: 'Krog' });
    useMetaStore.getState().addHero(first);
    useMetaStore.getState().addHero(second);

    const state = useMetaStore.getState();
    expect(state.roster.map((h) => h.id)).toEqual(['a', 'b']);
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
    expect(state.roster).toEqual([]);
    expect(state.activeHeroId).toBeNull();
  });

  it('persists roster to localStorage under the expected key', () => {
    const hero = makeHero();
    useMetaStore.getState().addHero(hero);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      state: { roster: Hero[]; activeHeroId: string | null };
    };
    expect(parsed.state.roster).toHaveLength(1);
    expect(parsed.state.roster[0]?.id).toBe('hero-1');
    expect(parsed.state.activeHeroId).toBe('hero-1');
  });

  it('rehydrates from localStorage on persist.rehydrate()', async () => {
    const hero = makeHero({ id: 'persist-me' });
    useMetaStore.getState().addHero(hero);

    // Simulate a fresh page load: persist middleware re-reads from
    // localStorage (the hero we just wrote) and applies it to the store.
    await useMetaStore.persist.rehydrate();

    const state = useMetaStore.getState();
    expect(state.roster.map((h) => h.id)).toContain('persist-me');
    expect(state.activeHeroId).toBe('persist-me');
  });
});
