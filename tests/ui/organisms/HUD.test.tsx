import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { HUD } from '@/ui/organisms/HUD';
import { useGameStore } from '@/state/gameStore';
import { WAVE_START_BANNER_MS } from '@/lib/constants';
import * as gameBridge from '@/game/scenes/gameBridge';

describe('HUD organism', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders gold, wave, skulls, and hero HP from gameStore', () => {
    useGameStore.getState().addGold(120);
    useGameStore.getState().setWave(2);
    useGameStore.getState().setSkulls(7);
    useGameStore.getState().setHero(40, 80);

    render(<HUD />);

    expect(screen.getByText('Bludgelt')).toBeDefined();
    expect(screen.getByText('120')).toBeDefined();
    expect(screen.getByText('Wave')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.getByText('Hero HP')).toBeDefined();
    expect(screen.getByText('40/80')).toBeDefined();
  });

  it('renders the ability button with localised label', () => {
    render(<HUD />);
    expect(
      screen.getByRole('button', { name: "Clomp'uk" }),
    ).toBeDefined();
  });

  it('does NOT show the ISE HAI! banner by default', () => {
    render(<HUD />);
    expect(screen.queryByTestId('hud-wave-banner')).toBeNull();
  });

  it('shows the ISE HAI! banner when waveStartAtMs is set, then clears it', () => {
    render(<HUD />);

    act(() => {
      useGameStore.getState().triggerWaveStart(1000);
    });

    const banner = screen.getByTestId('hud-wave-banner');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('ISE HAI!');

    act(() => {
      vi.advanceTimersByTime(WAVE_START_BANNER_MS + 50);
    });

    expect(screen.queryByTestId('hud-wave-banner')).toBeNull();
    expect(useGameStore.getState().waveStartAtMs).toBe(null);
  });

  it('dispatches the hero ability via gameBridge.tryHeroAbility on click', () => {
    const spy = vi
      .spyOn(gameBridge, 'tryHeroAbility')
      .mockReturnValue({ used: true, hits: [], stunUntilMs: 0 });
    vi.setSystemTime(new Date(123456));
    render(<HUD />);

    const btn = screen.getByRole('button', { name: "Clomp'uk" });
    fireEvent.click(btn);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(123456);
  });

  it('reflects ability cooldown updates from the store', () => {
    // Lock the wall clock used by the HUD's interval-driven `nowMs`.
    vi.setSystemTime(new Date(0));
    render(<HUD />);

    act(() => {
      useGameStore.getState().setHeroAbilityCooldown(12000, 8000);
    });
    // Tick the HUD's 250ms internal clock so it picks up the cooldown.
    act(() => {
      vi.advanceTimersByTime(250);
    });

    const btn = screen.getByRole('button', { name: "Clomp'uk" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toContain('s');
  });
});
