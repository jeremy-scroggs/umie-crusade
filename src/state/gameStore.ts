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
  /**
   * HUD-facing hero state (#17). The Hero entity itself remains
   * framework-agnostic — the glue layer copies HP into the store so
   * the React overlay can subscribe with cheap selectors.
   */
  heroHp: number;
  heroMaxHp: number;
  /** Total skulls (humans defeated) for the current run. */
  skulls: number;
  /**
   * Timestamp (ms) at which the most recent `wave:start` was triggered.
   * Non-null = the HUD shows the "ISE HAI!" banner. The HUD clears the
   * value via a timeout so the banner is transient. See #17 / #10.
   */
  waveStartAtMs: number | null;
  addGold: (amount: number) => void;
  spendGold: (amount: number) => boolean;
  setWave: (wave: number) => void;
  loseLife: () => void;
  setHeroAbilityCooldown: (cooldownMs: number, readyAtMs: number) => void;
  clearHeroAbility: () => void;
  setHero: (hp: number, maxHp: number) => void;
  damageHero: (amount: number) => void;
  healHero: (amount: number) => void;
  addSkull: () => void;
  setSkulls: (count: number) => void;
  triggerWaveStart: (nowMs: number) => void;
  clearWaveStart: () => void;
  reset: () => void;
}

const INITIAL_STATE = {
  gold: 0,
  wave: 0,
  lives: 10,
  heroAbility: INITIAL_HERO_ABILITY,
  heroHp: 0,
  heroMaxHp: 0,
  skulls: 0,
  waveStartAtMs: null as number | null,
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

  setHero: (hp, maxHp) => {
    const safeMax = Math.max(0, maxHp);
    const clampedHp = Math.max(0, Math.min(hp, safeMax));
    set({ heroHp: clampedHp, heroMaxHp: safeMax });
  },

  damageHero: (amount) => {
    if (amount <= 0) return;
    set((s) => ({ heroHp: Math.max(0, s.heroHp - amount) }));
  },

  healHero: (amount) => {
    if (amount <= 0) return;
    set((s) => ({ heroHp: Math.min(s.heroMaxHp, s.heroHp + amount) }));
  },

  addSkull: () => set((s) => ({ skulls: s.skulls + 1 })),

  setSkulls: (count) => set({ skulls: Math.max(0, count) }),

  triggerWaveStart: (nowMs) => set({ waveStartAtMs: nowMs }),

  clearWaveStart: () => set({ waveStartAtMs: null }),

  reset: () => set(INITIAL_STATE),
}));
