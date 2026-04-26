import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BuildPanel, type BuildOption } from '@/ui/organisms/BuildPanel';
import { useGameStore } from '@/state/gameStore';

const LABELS = {
  wall: 'Wall',
  ballista: 'Ballista',
  repair: 'Repair',
  insufficientGold: 'Nub nuff gold!',
  goldPrefix: 'Gold',
  close: 'Close',
};

const OPTIONS: BuildOption[] = [
  { id: 'wall', label: 'Wall', cost: 20, iconSrc: 'buildings/wall-wood-pristine.png' },
  { id: 'ballista', label: 'Ballista', cost: 60, iconSrc: 'buildings/ballista.png' },
];

describe('BuildPanel organism', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  function renderPanel(overrides: Partial<{
    onConfirmBuild: (id: 'wall' | 'ballista', cell: { x: number; y: number }) => void;
    onConfirmRepair: (cell: { x: number; y: number }) => void;
    onClose: () => void;
  }> = {}) {
    return render(
      <BuildPanel
        labels={LABELS}
        options={OPTIONS}
        onConfirmBuild={overrides.onConfirmBuild ?? vi.fn()}
        onConfirmRepair={overrides.onConfirmRepair ?? vi.fn()}
        onClose={overrides.onClose ?? vi.fn()}
      />,
    );
  }

  it('returns null when no selection', () => {
    renderPanel();
    expect(screen.queryByTestId('build-panel')).toBeNull();
  });

  it('renders both build slots when a tile is selected', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 3, y: 4 });
      useGameStore.getState().addGold(100);
    });
    renderPanel();
    expect(screen.getByTestId('build-panel')).toBeDefined();
    expect(screen.getByRole('button', { name: /Wall, 20 Gold/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Ballista, 60 Gold/i })).toBeDefined();
  });

  it('disables wall slot when gold < wall cost', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 0, y: 0 });
      useGameStore.getState().addGold(10); // < 20 wall cost
    });
    renderPanel();
    const wallBtn = screen.getByRole('button', { name: /Wall, 20 Gold/i });
    const ballBtn = screen.getByRole('button', { name: /Ballista, 60 Gold/i });
    expect((wallBtn as HTMLButtonElement).disabled).toBe(true);
    expect((ballBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables wall but disables ballista when gold is between costs', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 1, y: 1 });
      useGameStore.getState().addGold(30); // >= 20 wall, < 60 ballista
    });
    renderPanel();
    expect(
      (screen.getByRole('button', { name: /Wall, 20 Gold/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: /Ballista, 60 Gold/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('fires onConfirmBuild with id + cell when affordable slot is clicked', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 7, y: 9 });
      useGameStore.getState().addGold(100);
    });
    const onConfirmBuild = vi.fn();
    renderPanel({ onConfirmBuild });
    fireEvent.click(screen.getByRole('button', { name: /Wall, 20 Gold/i }));
    expect(onConfirmBuild).toHaveBeenCalledTimes(1);
    expect(onConfirmBuild).toHaveBeenCalledWith('wall', { x: 7, y: 9 });
  });

  it('does NOT fire onConfirmBuild when disabled slot is clicked', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 0, y: 0 });
      // Zero gold — both options disabled.
    });
    const onConfirmBuild = vi.fn();
    renderPanel({ onConfirmBuild });
    fireEvent.click(screen.getByRole('button', { name: /Wall, 20 Gold/i }));
    expect(onConfirmBuild).not.toHaveBeenCalled();
  });

  it('closes on backdrop click', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 0, y: 0 });
    });
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByTestId('build-panel-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on panel-internal click', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 0, y: 0 });
    });
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByTestId('build-panel'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 0, y: 0 });
    });
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows repair action when a damaged wall is selected', () => {
    act(() => {
      useGameStore.getState().setSelectedWall({
        cell: { x: 2, y: 3 },
        hp: 50,
        maxHp: 100,
      });
      useGameStore.getState().addGold(20);
    });
    const onConfirmRepair = vi.fn();
    renderPanel({ onConfirmRepair });
    const repairBtn = screen.getByRole('button', { name: 'Repair' });
    expect((repairBtn as HTMLButtonElement).disabled).toBe(false);
    // Build slots should be hidden in repair mode.
    expect(screen.queryByRole('button', { name: /Wall, 20 Gold/i })).toBeNull();
    fireEvent.click(repairBtn);
    expect(onConfirmRepair).toHaveBeenCalledTimes(1);
    expect(onConfirmRepair).toHaveBeenCalledWith({ x: 2, y: 3 });
  });

  it('disables repair when wall is at full hp', () => {
    act(() => {
      useGameStore.getState().setSelectedWall({
        cell: { x: 0, y: 0 },
        hp: 100,
        maxHp: 100,
      });
      useGameStore.getState().addGold(50);
    });
    renderPanel();
    expect(
      (screen.getByRole('button', { name: 'Repair' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('disables repair when player has zero gold', () => {
    act(() => {
      useGameStore.getState().setSelectedWall({
        cell: { x: 0, y: 0 },
        hp: 50,
        maxHp: 100,
      });
      // No gold.
    });
    renderPanel();
    expect(
      (screen.getByRole('button', { name: 'Repair' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('repair UX wins when both selections are present', () => {
    act(() => {
      useGameStore.getState().setSelectedTile({ x: 5, y: 5 });
      useGameStore.getState().setSelectedWall({
        cell: { x: 5, y: 5 },
        hp: 30,
        maxHp: 100,
      });
      useGameStore.getState().addGold(100);
    });
    renderPanel();
    expect(screen.getByRole('button', { name: 'Repair' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Wall, 20 Gold/i })).toBeNull();
  });
});
