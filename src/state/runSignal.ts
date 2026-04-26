import { SimpleEventEmitter } from '@/game/components/EventEmitter';

/**
 * Cross-system "begin run" signal. React fires it after the hero is persisted;
 * Phaser subscribes to swap scenes. Using the existing `SimpleEventEmitter`
 * keeps this jsdom-safe (no Phaser canvas init in tests) and matches the
 * codebase's established event pattern.
 *
 * The actual Phaser-side subscription + scene change is out of scope for
 * issue #18 — this module defines the contract (event name + payload).
 */
export const RUN_EVENTS = {
  BEGIN: 'run:begin',
  /**
   * "Back to the main menu" navigation signal (#20). Emitted by the
   * win/lose pages when the player taps Main Menu. The Phaser-side
   * subscription (actual scene swap to a main-menu scene) is wired
   * separately — defining the contract here keeps the React layer
   * decoupled from scene specifics.
   */
  MAIN_MENU: 'run:mainMenu',
} as const;

export interface BeginRunPayload {
  heroId: string;
}

export const runSignal = new SimpleEventEmitter();
