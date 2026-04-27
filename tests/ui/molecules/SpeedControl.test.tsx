import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SpeedControl } from '@/ui/molecules/SpeedControl';
import { useGameStore, TIME_SCALES } from '@/state/gameStore';

describe('SpeedControl molecule', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders one button per TIME_SCALES entry', () => {
    render(<SpeedControl />);
    const group = screen.getByRole('group', { name: 'Game speed' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.length).toBe(TIME_SCALES.length);
  });

  it('uses the localised Pause label and the Nx labels for the rest', () => {
    render(<SpeedControl />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDefined();
    expect(screen.getByRole('button', { name: '1×' })).toBeDefined();
    expect(screen.getByRole('button', { name: '2×' })).toBeDefined();
    expect(screen.getByRole('button', { name: '4×' })).toBeDefined();
  });

  it('marks the button matching the current timeScale as pressed', () => {
    render(<SpeedControl />);
    // Default timeScale is 1.
    expect(
      screen.getByRole('button', { name: '1×' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: '2×' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: '4×' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('clicking a button calls setTimeScale with the matching value', () => {
    render(<SpeedControl />);

    fireEvent.click(screen.getByRole('button', { name: '2×' }));
    expect(useGameStore.getState().timeScale).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: '4×' }));
    expect(useGameStore.getState().timeScale).toBe(4);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(useGameStore.getState().timeScale).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: '1×' }));
    expect(useGameStore.getState().timeScale).toBe(1);
  });

  it('updates the active button when timeScale changes', () => {
    render(<SpeedControl />);
    fireEvent.click(screen.getByRole('button', { name: '4×' }));

    expect(
      screen.getByRole('button', { name: '4×' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: '1×' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('exposes the group under role=group with the localised aria label', () => {
    render(<SpeedControl />);
    const group = screen.getByRole('group', { name: 'Game speed' });
    expect(group).toBeDefined();
  });
});
