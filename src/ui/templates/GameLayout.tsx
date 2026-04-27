import { useCallback, useMemo } from 'react';
import wallWoodJson from '@/data/buildings/wall-wood.json';
import ballistaJson from '@/data/buildings/ballista.json';
import {
  buildingDefSchema,
  wallDefSchema,
} from '@/data/schemas';
import { PhaserGame } from '@/game/PhaserGame';
import { getActiveSystems } from '@/game/scenes/gameBridge';
import { useGameStore, type SelectedCell } from '@/state/gameStore';
import { t } from '@/lib/i18n';
import { HUD } from '@/ui/organisms/HUD';
import {
  BuildPanel,
  type BuildOption,
  type BuildOptionId,
} from '@/ui/organisms/BuildPanel';

// Validate at module load — drift in the wall/ballista JSON should fail
// loud here rather than silently slipping past an `as` cast. The
// BuildPanel's data-driven contract requires the costs flow from the
// validated def.
const WALL_DEF = wallDefSchema.parse(wallWoodJson);
const BALLISTA_DEF = buildingDefSchema.parse(ballistaJson);

const BUILD_LABELS = {
  wall: t('build.wall'),
  ballista: t('build.ballista'),
  repair: t('build.repair'),
  insufficientGold: t('build.insufficientGold'),
  goldPrefix: t('hud.gold'),
};

/**
 * GameLayout — in-run template that mounts the Phaser canvas + every
 * DOM overlay (HUD #17 + BuildPanel #19).
 *
 * BuildPanel is driven by `gameStore` selection slices, populated by
 * the scene's input bridge (#21 + scene wiring in #26). Build/repair
 * confirm callbacks reach into the scene via `gameBridge.getActiveSystems()`
 * — a tiny module-scoped pointer that mirrors the existing
 * `state/bridge.ts` getter pattern.
 *
 * Mobile-first: HUD anchors the top edge, BuildPanel slides up from
 * the bottom (its own z-index keeps it above the canvas), every
 * interactive surface uses the existing 44px-tall atoms/molecules.
 */
export function GameLayout() {
  const setSelectedTile = useGameStore((s) => s.setSelectedTile);
  const setSelectedWall = useGameStore((s) => s.setSelectedWall);
  const clearSelection = useGameStore((s) => s.clearSelection);

  const buildOptions = useMemo<BuildOption[]>(
    () => [
      {
        id: 'wall',
        label: t('build.wall'),
        cost: WALL_DEF.buildCost.gold,
      },
      {
        id: 'ballista',
        label: t('build.ballista'),
        cost: BALLISTA_DEF.buildCost.gold,
      },
    ],
    [],
  );

  const handleConfirmBuild = useCallback(
    (id: BuildOptionId, cell: SelectedCell) => {
      const systems = getActiveSystems();
      if (!systems) return;
      // M1: only walls are wired through BuildingSystem. Ballista
      // placement lands with its own system (#14 follow-up); for now
      // tapping ballista is a no-op so the panel doesn't lie about
      // the action.
      if (id !== 'wall') return;
      const result = systems.building.tryPlaceWall(cell);
      if (result.ok) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  const handleConfirmRepair = useCallback(
    (cell: SelectedCell) => {
      const systems = getActiveSystems();
      if (!systems) return;
      const wall = systems.building.buildingAt(cell);
      if (!wall) return;
      const missing = wall.breakable.maxHp - wall.breakable.hp;
      if (missing <= 0) return;
      const result = systems.building.tryRepairWall(cell, missing);
      if (result.ok) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  const handleClose = useCallback(() => {
    setSelectedTile(null);
    setSelectedWall(null);
  }, [setSelectedTile, setSelectedWall]);

  return (
    <div className="relative w-screen h-screen bg-black">
      <PhaserGame />
      <HUD />
      <BuildPanel
        labels={BUILD_LABELS}
        options={buildOptions}
        onConfirmBuild={handleConfirmBuild}
        onConfirmRepair={handleConfirmRepair}
        onClose={handleClose}
      />
    </div>
  );
}
