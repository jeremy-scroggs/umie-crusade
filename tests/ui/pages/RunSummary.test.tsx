import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RunSummary } from '@/ui/pages/RunSummary';
import { useGameStore } from '@/state/gameStore';
import { useMetaStore } from '@/state/metaStore';
import { RUN_EVENTS, runSignal } from '@/state/runSignal';

describe('RunSummary page', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.getState().reset();
    useMetaStore.getState().reset();
    useMetaStore.getState().resetHedknahPile();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the AC win title', () => {
    render(<RunSummary />);
    expect(
      screen.getByRole('heading', { name: 'Bludchok-hai gug!' }),
    ).toBeDefined();
  });

  it('shows wave, skulls, and gold from gameStore', () => {
    useGameStore.getState().setWave(5);
    useGameStore.getState().setSkulls(13);
    useGameStore.getState().addGold(120);

    render(<RunSummary />);

    expect(screen.getByText('Wave reached')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('Skulls taken')).toBeDefined();
    expect(screen.getByText('13')).toBeDefined();
    expect(screen.getByText('Bludgelt earned')).toBeDefined();
    expect(screen.getByText('120')).toBeDefined();
  });

  it('renders Replay and Main Menu buttons with localised labels', () => {
    render(<RunSummary />);
    expect(screen.getByRole('button', { name: 'Klerg agen!' })).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Back to Bludchok' }),
    ).toBeDefined();
  });

  it('Replay click resets the gameStore (runStatus -> running, gold cleared)', () => {
    useGameStore.getState().winRun();
    useGameStore.getState().addGold(50);
    useGameStore.getState().setSkulls(4);

    render(<RunSummary />);

    fireEvent.click(screen.getByRole('button', { name: 'Klerg agen!' }));

    const s = useGameStore.getState();
    expect(s.runStatus).toBe('running');
    expect(s.gold).toBe(0);
    expect(s.skulls).toBe(0);
  });

  it('Main Menu click emits RUN_EVENTS.MAIN_MENU and resets the run', () => {
    const listener = vi.fn();
    runSignal.on(RUN_EVENTS.MAIN_MENU, listener);

    useGameStore.getState().winRun();
    render(<RunSummary />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Bludchok' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().runStatus).toBe('running');

    runSignal.off(RUN_EVENTS.MAIN_MENU, listener);
  });

  it('commits the run skulls into the Hedk\'nah Pile on mount', () => {
    useGameStore.getState().setSkulls(7);

    render(<RunSummary />);

    expect(useMetaStore.getState().hedknahPile).toBe(7);
  });

  it('does not double-commit under React StrictMode', () => {
    useGameStore.getState().setSkulls(3);

    // StrictMode double-invokes effects in dev to surface bugs. The
    // page guards the pile commit with a ref, so the player banks the
    // run's skulls exactly once even when the effect runs twice.
    render(
      <StrictMode>
        <RunSummary />
      </StrictMode>,
    );

    expect(useMetaStore.getState().hedknahPile).toBe(3);
  });

  it('does not commit when the run had zero skulls', () => {
    expect(useGameStore.getState().skulls).toBe(0);

    render(<RunSummary />);

    expect(useMetaStore.getState().hedknahPile).toBe(0);
  });
});
