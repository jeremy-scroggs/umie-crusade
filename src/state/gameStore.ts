import { create } from 'zustand';

/**
 * Hero active-ability UI state.
 *
 * The Hero entity itself does NOT import this store — entities stay
 * framework-agnostic. Instead the caller that triggers the ability
 * (HUD in #17, smoke tests today) writes `readyAtMs` here so the React
 * overlay can dim/fill the button. `cooldownMs` is the total cooldown
 * from the hero def (copied once for convenience).
 */
export interface HeroAbilityState {
  cooldownMs: number;
  readyAtMs: number | null;
}

const INITIAL_HERO_ABILITY: HeroAbilityState = {
  cooldownMs: 0,
  readyAtMs: null,
};

export interface GameState {
  gold: number;
  wave: number;
  lives: number;
  heroAbility: HeroAbilityState;
  addGold: (amount: number) => void;
  spendGold: (amount: number) => boolean;
  setWave: (wave: number) => void;
  loseLife: () => void;
  setHeroAbilityCooldown: (cooldownMs: number, readyAtMs: number) => void;
  clearHeroAbility: () => void;
  reset: () => void;
}

const INITIAL_STATE = {
  gold: 0,
  wave: 0,
  lives: 10,
  heroAbility: INITIAL_HERO_ABILITY,
};

export const useGameStore = create<GameState>()((set, get) => ({
  ...INITIAL_STATE,

  addGold: (amount) => set((s) => ({ gold: s.gold + amount })),

  spendGold: (amount) => {
    if (get().gold < amount) return false;
    set((s) => ({ gold: s.gold - amount }));
    return true;
  },

  setWave: (wave) => set({ wave }),

  loseLife: () => set((s) => ({ lives: s.lives - 1 })),

  setHeroAbilityCooldown: (cooldownMs, readyAtMs) =>
    set({ heroAbility: { cooldownMs, readyAtMs } }),

  clearHeroAbility: () => set({ heroAbility: INITIAL_HERO_ABILITY }),

  reset: () => set(INITIAL_STATE),
}));
