import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Hero } from '@/types';

export interface MetaState {
  roster: Hero[];
  activeHeroId: string | null;
  /**
   * Hedk'nah Pile (#20) — total skulls accumulated across **all** runs.
   * Persisted via the same `persist` middleware as the roster, so it
   * survives reloads and run resets. The win-screen page (RunSummary)
   * commits the current run's `skulls` here on mount; `reset()` does
   * NOT clear it (meta-progression survives a roster wipe).
   */
  hedknahPile: number;
  addHero: (hero: Hero) => void;
  setActiveHero: (id: string | null) => void;
  addToHedknahPile: (count: number) => void;
  resetHedknahPile: () => void;
  reset: () => void;
}

// Roster + active hero are run-meta the player chooses to start over.
// `hedknahPile` is excluded so a `reset()` doesn't wipe the lifetime
// skull tally — see `resetHedknahPile()` for the test-only escape hatch.
const INITIAL_STATE: Pick<MetaState, 'roster' | 'activeHeroId'> = {
  roster: [],
  activeHeroId: null,
};

const INITIAL_HEDKNAH_PILE = 0;

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

      addHero: (hero) => {
        const { roster, activeHeroId } = get();
        set({
          roster: [...roster, hero],
          // First hero becomes active by default; subsequent adds don't bump.
          activeHeroId: activeHeroId ?? hero.id,
        });
      },

      setActiveHero: (id) => set({ activeHeroId: id }),

      addToHedknahPile: (count) => {
        if (count <= 0) return;
        set((s) => ({ hedknahPile: s.hedknahPile + count }));
      },

      resetHedknahPile: () => set({ hedknahPile: INITIAL_HEDKNAH_PILE }),

      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'umie-crusade-meta',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
