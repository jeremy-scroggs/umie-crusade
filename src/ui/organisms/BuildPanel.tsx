import { useEffect } from 'react';
import { useGameStore, type SelectedCell } from '@/state/gameStore';
import { Button } from '@/ui/atoms/Button';
import { BuildSlot } from '@/ui/molecules/BuildSlot';

export type BuildOptionId = 'wall' | 'ballista';

export interface BuildOption {
  id: BuildOptionId;
  label: string;
  /** Build cost (gold) — caller reads from the validated JSON def. */
  cost: number;
  iconSrc?: string;
}

interface BuildPanelLabels {
  wall: string;
  ballista: string;
  repair: string;
  insufficientGold: string;
  /** Localised "Bludgelt" prefix shown on cost chips. From `t('hud.bludgelt')`. */
  goldPrefix: string;
  /** Optional close-button label — defaults to 'X' if omitted. */
  close?: string;
}

interface BuildPanelProps {
  /** Localised copy. Caller injects via `t()`. */
  labels: BuildPanelLabels;
  /** Build options. Cost flows from JSON; the panel never hardcodes. */
  options: BuildOption[];
  /** Confirm a placement. Caller wires to BuildingSystem.tryPlaceWall etc. */
  onConfirmBuild: (id: BuildOptionId, cell: SelectedCell) => void;
  /** Confirm a repair. Caller wires to BuildingSystem.tryRepairWall. */
  onConfirmRepair: (cell: SelectedCell) => void;
  /** Close handler. Callers typically clear the selection slices. */
  onClose: () => void;
}

/**
 * BuildPanel — bottom-sheet overlay surfacing wall + ballista options
 * for an empty tile, or a manual repair action for a damaged wall.
 *
 * Open / closed is driven by `gameStore` selection slices (`selectedTile`
 * and `selectedWall`); the actual selection logic lives in input
 * integration (#21). When both null, the panel returns null.
 *
 * The panel itself is read-only over JSON: balance numbers (cost) come
 * from the caller, who reads the validated `WallDef` / `TowerDef`. This
 * preserves the data-driven invariant — no magic numbers in the UI.
 *
 * Mobile-first: every interactive element is ≥44px tall (Button atom +
 * BuildSlot molecule both already enforce this). The backdrop covers the
 * viewport so a tap outside the sheet closes the panel.
 */
export function BuildPanel({
  labels,
  options,
  onConfirmBuild,
  onConfirmRepair,
  onClose,
}: BuildPanelProps) {
  const gold = useGameStore((s) => s.gold);
  const selectedTile = useGameStore((s) => s.selectedTile);
  const selectedWall = useGameStore((s) => s.selectedWall);

  const open = selectedTile !== null || selectedWall !== null;

  // Esc-to-close. Effect re-arms whenever `open` changes so the listener
  // is only mounted while the panel is visible.
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  // Repair UX wins when both selections are present — the more specific
  // action is the right answer if input ever publishes both.
  const showRepair = selectedWall !== null;
  const repairCell = selectedWall?.cell;
  const repairAffordable =
    selectedWall !== null &&
    selectedWall.hp < selectedWall.maxHp &&
    gold > 0;

  return (
    <div
      data-testid="build-panel-backdrop"
      onClick={onClose}
      className="absolute inset-0 z-30 flex items-end justify-center bg-black/40"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={showRepair ? labels.repair : labels.wall}
        data-testid="build-panel"
        // Stop the backdrop's onClose from firing when the user taps the
        // panel itself.
        onClick={(event) => event.stopPropagation()}
        className="m-3 flex w-full max-w-md flex-col gap-3 rounded-t-lg border border-white/20 bg-black/85 p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm uppercase tracking-wider text-white/70">
            {showRepair ? labels.repair : `${labels.wall} / ${labels.ballista}`}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close ?? 'Close'}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-white/70 hover:bg-white/10"
          >
            <span aria-hidden="true">X</span>
          </button>
        </div>

        {showRepair && repairCell ? (
          <Button
            disabled={!repairAffordable}
            onClick={() => {
              if (!repairAffordable) return;
              onConfirmRepair(repairCell);
            }}
          >
            {labels.repair}
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            {options.map((option) => {
              const affordable = gold >= option.cost;
              const label =
                option.id === 'wall' ? labels.wall : labels.ballista;
              return (
                <BuildSlot
                  key={option.id}
                  label={label}
                  cost={option.cost}
                  goldLabel={labels.goldPrefix}
                  affordable={affordable}
                  iconSrc={option.iconSrc}
                  insufficientLabel={labels.insufficientGold}
                  onSelect={() => {
                    if (!affordable || selectedTile === null) return;
                    onConfirmBuild(option.id, selectedTile);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
