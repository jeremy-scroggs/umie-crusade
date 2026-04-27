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
 * Allowed simulation-time multipliers. `0` is pause; `1`/`2`/`4` are
 * the player-facing speed presets (HUD wiring lands in #76).
 *
 * Defined once as a literal tuple so both the static `TimeScale` type
 * and the runtime validator (`isTimeScale`) derive from the same
 * source — we never want to hardcode the set in two places (per
 * CLAUDE.md: "do NOT hardcode in multiple places").
 */
export const TIME_SCALES = [0, 1, 2, 4] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

/** Runtime guard — true when `n` matches one of `TIME_SCALES`. */
export const isTimeScale = (n: number): n is TimeScale =>
  (TIME_SCALES as readonly number[]).includes(n);

/** Default speed when a run begins (and after `reset()`). */
const DEFAULT_TIME_SCALE: TimeScale = 1;

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
  /**
   * Simulation-time multiplier. The Phaser scene mirrors this into
   * `scene.time.timeScale` and multiplies the per-frame `dt` it feeds
   * each system by this value (#54). `0` pauses the simulation;
   * `1`/`2`/`4` are the player-facing speed presets. The HUD widget
   * that exposes these speeds is U4 #76.
   */
  timeScale: TimeScale;
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
  /**
   * Set the simulation-time multiplier. Values not in `TIME_SCALES` are
   * rejected (no-op + console.warn) so callers that thread an arbitrary
   * `number` from a UI or URL hash can't smuggle in a fractional speed.
   */
  setTimeScale: (n: number) => void;
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
  timeScale: DEFAULT_TIME_SCALE,
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

  setTimeScale: (n) => {
    if (!isTimeScale(n)) {
      // Loud-but-non-fatal: a stray UI handler that passes 3 or 0.5
      // should leave the store untouched rather than break the sim.
      console.warn(`gameStore.setTimeScale: rejected value ${n}; expected one of ${TIME_SCALES.join('/')}.`);
      return;
    }
    set({ timeScale: n });
  },

  reset: () => set(INITIAL_STATE),
}));
