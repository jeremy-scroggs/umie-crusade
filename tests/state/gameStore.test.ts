import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/state/gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('starts with zero gold', () => {
    expect(useGameStore.getState().gold).toBe(0);
  });

  it('starts at wave 0', () => {
    expect(useGameStore.getState().wave).toBe(0);
  });

  it('starts with 10 lives', () => {
    expect(useGameStore.getState().lives).toBe(10);
  });

  it('addGold increases gold', () => {
    useGameStore.getState().addGold(25);
    expect(useGameStore.getState().gold).toBe(25);

    useGameStore.getState().addGold(10);
    expect(useGameStore.getState().gold).toBe(35);
  });

  it('spendGold decreases gold when sufficient', () => {
    useGameStore.getState().addGold(50);
    const result = useGameStore.getState().spendGold(30);
    expect(result).toBe(true);
    expect(useGameStore.getState().gold).toBe(20);
  });

  it('spendGold returns false when insufficient', () => {
    useGameStore.getState().addGold(10);
    const result = useGameStore.getState().spendGold(20);
    expect(result).toBe(false);
    expect(useGameStore.getState().gold).toBe(10);
  });

  it('setWave updates wave number', () => {
    useGameStore.getState().setWave(5);
    expect(useGameStore.getState().wave).toBe(5);
  });

  it('loseLife decrements lives', () => {
    useGameStore.getState().loseLife();
    expect(useGameStore.getState().lives).toBe(9);
  });

  it('reset returns to initial state', () => {
    useGameStore.getState().addGold(100);
    useGameStore.getState().setWave(10);
    useGameStore.getState().loseLife();
    useGameStore.getState().reset();

    const state = useGameStore.getState();
    expect(state.gold).toBe(0);
    expect(state.wave).toBe(0);
    expect(state.lives).toBe(10);
  });
});
