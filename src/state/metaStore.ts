import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Hero } from '@/types';

export interface MetaState {
  roster: Hero[];
  activeHeroId: string | null;
  addHero: (hero: Hero) => void;
  setActiveHero: (id: string | null) => void;
  reset: () => void;
}

const INITIAL_STATE: Pick<MetaState, 'roster' | 'activeHeroId'> = {
  roster: [],
  activeHeroId: null,
};

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

      addHero: (hero) => {
        const { roster, activeHeroId } = get();
        set({
          roster: [...roster, hero],
          // First hero becomes active by default; subsequent adds don't bump.
          activeHeroId: activeHeroId ?? hero.id,
        });
      },

      setActiveHero: (id) => set({ activeHeroId: id }),

      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'umie-crusade-meta',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
