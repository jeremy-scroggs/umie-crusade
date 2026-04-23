import { create } from 'zustand';

export interface GameState {
  gold: number;
  wave: number;
  lives: number;
  addGold: (amount: number) => void;
  spendGold: (amount: number) => boolean;
  setWave: (wave: number) => void;
  loseLife: () => void;
  reset: () => void;
}

const INITIAL_STATE = {
  gold: 0,
  wave: 0,
  lives: 10,
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

  reset: () => set(INITIAL_STATE),
}));
