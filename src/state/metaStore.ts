import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Hero } from '@/types';

/**
 * Save format version (#73). Bumped whenever the persisted shape changes
 * in a non-additive way. Defined ONCE here and threaded into both the
 * persisted `saveVersion` field and the Zustand `persist({ version })`
 * option so a future migration has a single source of truth — same
 * pattern the gameStore uses for `TIME_SCALES`.
 */
export const SAVE_VERSION = 1 as const;

export interface MetaState {
  /** Player's hero roster (#73). Renamed from `roster` to match the AC. */
  heroRoster: Hero[];
  activeHeroId: string | null;
  /**
   * Hedk'nah Pile (#20) — total skulls accumulated across **all** runs.
   * Persisted via the same `persist` middleware as the roster, so it
   * survives reloads and run resets. The win-screen page (RunSummary)
   * commits the current run's `skulls` here on mount; `reset()` does
   * NOT clear it (meta-progression survives a roster wipe).
   */
  hedknahPile: number;
  /**
   * Lifetime bludgelt (#73) — running total of bludgelt earned across
   * all runs. The run-summary flow (U5 #77) accumulates the run's
   * earnings here. Excluded from `reset()` (meta-progression).
   */
  lifetimeBludgelt: number;
  /**
   * Highest wave index ever reached across all runs (#73). Updated via
   * `updateHighestWave(wave)` which only writes when `wave` is strictly
   * greater than the current value. Excluded from `reset()`.
   */
  highestWaveReached: number;
  /**
   * Persisted save format version (#73). Initialized to `SAVE_VERSION`
   * and excluded from `reset()` so a roster wipe does not appear to
   * downgrade the format. Future schema changes bump `SAVE_VERSION` and
   * supply a `migrate` function on the persist middleware.
   */
  saveVersion: number;
  addHero: (hero: Hero) => void;
  removeHero: (id: string) => void;
  setActiveHero: (id: string | null) => void;
  addToHedknahPile: (count: number) => void;
  resetHedknahPile: () => void;
  /** Accumulator for lifetime bludgelt. Ignores non-positive amounts. */
  addLifetimeBludgelt: (amount: number) => void;
  /** Max-update for highest wave. Only writes when `wave` is strictly greater. */
  updateHighestWave: (wave: number) => void;
  reset: () => void;
}

// Roster + active hero are run-meta the player chooses to start over.
// The lifetime accumulators (`hedknahPile`, `lifetimeBludgelt`,
// `highestWaveReached`) and `saveVersion` are excluded so a `reset()`
// doesn't wipe meta-progression — see `resetHedknahPile()` for the
// test-only escape hatch (no equivalents are needed for the other
// lifetime fields; `localStorage.clear()` covers the test path).
const INITIAL_STATE: Pick<MetaState, 'heroRoster' | 'activeHeroId'> = {
  heroRoster: [],
  activeHeroId: null,
};

const INITIAL_HEDKNAH_PILE = 0;
const INITIAL_LIFETIME_BLUDGELT = 0;
const INITIAL_HIGHEST_WAVE = 0;

/**
 * Meta-progression store. Survives across runs via localStorage so the roster
 * the player builds (hero identities, chosen names) persists between sessions.
 * Kept intentionally separate from `gameStore` (which is run-scoped) so the
 * two can be reset independently.
 */
export const useMetaStore = create<MetaState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,
      hedknahPile: INITIAL_HEDKNAH_PILE,
      lifetimeBludgelt: INITIAL_LIFETIME_BLUDGELT,
      highestWaveReached: INITIAL_HIGHEST_WAVE,
      saveVersion: SAVE_VERSION,

      addHero: (hero) => {
        const { heroRoster, activeHeroId } = get();
        set({
          heroRoster: [...heroRoster, hero],
          // First hero becomes active by default; subsequent adds don't bump.
          activeHeroId: activeHeroId ?? hero.id,
        });
      },

      removeHero: (id) => {
        const { heroRoster, activeHeroId } = get();
        set({
          heroRoster: heroRoster.filter((h) => h.id !== id),
          // Clear active when the removed hero was the active one — the
          // hero-picker (#74) is the right place for "auto-pick next" UX.
          activeHeroId: activeHeroId === id ? null : activeHeroId,
        });
      },

      setActiveHero: (id) => set({ activeHeroId: id }),

      addToHedknahPile: (count) => {
        if (count <= 0) return;
        set((s) => ({ hedknahPile: s.hedknahPile + count }));
      },

      resetHedknahPile: () => set({ hedknahPile: INITIAL_HEDKNAH_PILE }),

      addLifetimeBludgelt: (amount) => {
        if (amount <= 0) return;
        set((s) => ({ lifetimeBludgelt: s.lifetimeBludgelt + amount }));
      },

      updateHighestWave: (wave) => {
        if (wave <= get().highestWaveReached) return;
        set({ highestWaveReached: wave });
      },

      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'umie-crusade-meta',
      storage: createJSONStorage(() => localStorage),
      version: SAVE_VERSION,
    },
  ),
);
