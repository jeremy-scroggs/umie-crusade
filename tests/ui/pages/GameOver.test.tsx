import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameOver } from '@/ui/pages/GameOver';
import { useGameStore } from '@/state/gameStore';
import { useMetaStore } from '@/state/metaStore';
import { RUN_EVENTS, runSignal } from '@/state/runSignal';

describe('GameOver page', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.getState().reset();
    useMetaStore.getState().reset();
    useMetaStore.getState().resetHedknahPile();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the AC creed title', () => {
    render(<GameOver />);
    expect(
      screen.getByRole('heading', { name: "Nub goth. Nub pulga. Hedk'nah." }),
    ).toBeDefined();
  });

  it('shows wave, skulls, and gold from gameStore', () => {
    useGameStore.getState().setWave(3);
    useGameStore.getState().setSkulls(2);
    useGameStore.getState().addGold(40);

    render(<GameOver />);

    expect(screen.getByText('Wave reached')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('Skulls taken')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('Bludgelt earned')).toBeDefined();
    expect(screen.getByText('40')).toBeDefined();
  });

  it('renders Replay and Main Menu buttons with localised labels', () => {
    render(<GameOver />);
    expect(screen.getByRole('button', { name: 'Klerg agen!' })).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Back to Bludchok' }),
    ).toBeDefined();
  });

  it('Replay click resets the gameStore (runStatus -> running, gold cleared)', () => {
    useGameStore.getState().loseRun();
    useGameStore.getState().addGold(20);
    useGameStore.getState().setSkulls(1);

    render(<GameOver />);

    fireEvent.click(screen.getByRole('button', { name: 'Klerg agen!' }));

    const s = useGameStore.getState();
    expect(s.runStatus).toBe('running');
    expect(s.gold).toBe(0);
    expect(s.skulls).toBe(0);
  });

  it('Main Menu click emits RUN_EVENTS.MAIN_MENU and resets the run', () => {
    const listener = vi.fn();
    runSignal.on(RUN_EVENTS.MAIN_MENU, listener);

    useGameStore.getState().loseRun();
    render(<GameOver />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Bludchok' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().runStatus).toBe('running');

    runSignal.off(RUN_EVENTS.MAIN_MENU, listener);
  });

  it('does NOT commit skulls to the Hedk\'nah Pile on a defeat', () => {
    useGameStore.getState().setSkulls(9);

    render(<GameOver />);

    // A loss earns no tribute — the pile is purely a victory accumulator.
    expect(useMetaStore.getState().hedknahPile).toBe(0);
  });
});
