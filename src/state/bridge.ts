import { useGameStore } from './gameStore';

/**
 * Access the game store from outside React (e.g., Phaser scenes).
 * Call getGameStore().addGold(10) etc.
 */
export const getGameStore = () => useGameStore.getState();

/**
 * Subscribe to store changes from outside React.
 * Returns an unsubscribe function.
 */
export const subscribeGameStore = useGameStore.subscribe;
