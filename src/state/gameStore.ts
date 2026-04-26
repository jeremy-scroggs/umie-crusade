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

/**
 * Lifecycle of the current run. The wave system (#10) is expected to
 * call `winRun()` on `run:won` (wave 5 cleared) and `loseRun()` on
 * `run:lost` (fort destroyed). The React overlay routes to the
 * appropriate page based on this value (#20).
 */
export type RunStatus = 'running' | 'won' | 'lost';

/**
 * Grid cell — duplicated locally (rather than imported from
 * Pathfinding) to keep `gameStore` framework-agnostic. The shape
 * matches `Pathfinding.Cell` exactly; callers (input integration in
 * #21) cast freely.
 */
export interface SelectedCell {
  x: number;
  y: number;
}

/**
 * BuildPanel-facing selection state for a damaged wall (#19/#15). The
 * input integration (#21) writes both `cell` and the current HP / max
 * HP so the UI can decide whether the manual repair action is enabled
 * without re-importing the entity layer.
 */
export interface SelectedWall {
  cell: SelectedCell;
  hp: number;
  maxHp: number;
}

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
  /**
   * Lifecycle state of the current run (#20). Drives win/lose page
   * routing in `App.tsx`. `reset()` returns this to `'running'` so a
   * single store reset is enough to start a fresh run.
   */
  runStatus: RunStatus;
  /**
   * BuildPanel selection (#19). When `selectedTile` is non-null and
   * `selectedWall` is null, the panel shows wall + ballista build
   * options. When `selectedWall` is non-null, the panel shows the
   * manual repair action regardless of `selectedTile` (more specific
   * UX wins). Both null = panel hidden. The actual selection logic
   * (which entity / cell the player tapped) is wired by the input
   * integration in #21; this slice is the React-facing surface.
   */
  selectedTile: SelectedCell | null;
  selectedWall: SelectedWall | null;
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
  setRunStatus: (status: RunStatus) => void;
  winRun: () => void;
  loseRun: () => void;
  setSelectedTile: (cell: SelectedCell | null) => void;
  setSelectedWall: (wall: SelectedWall | null) => void;
  clearSelection: () => void;
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
  runStatus: 'running' as RunStatus,
  selectedTile: null as SelectedCell | null,
  selectedWall: null as SelectedWall | null,
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

  setRunStatus: (status) => set({ runStatus: status }),

  winRun: () => set({ runStatus: 'won' }),

  loseRun: () => set({ runStatus: 'lost' }),

  setSelectedTile: (cell) => set({ selectedTile: cell }),

  setSelectedWall: (wall) => set({ selectedWall: wall }),

  clearSelection: () => set({ selectedTile: null, selectedWall: null }),

  reset: () => set(INITIAL_STATE),
}));
