/**
 * gameBridge — module-scoped pointer to the active `SceneBootstrap` so
 * the React UI layer (BuildPanel callbacks in `GameLayout`) can call
 * into `BuildingSystem.tryPlaceWall` / `tryRepairWall` without prop-
 * drilling system refs through React components.
 *
 * Mirrors the `state/bridge.ts` pattern (Zustand store getter for
 * non-React callers). Keeping this single-ref + module-scoped:
 *  - avoids React re-renders when the scene swaps systems on replay,
 *  - matches the existing "bridge" idiom in this codebase,
 *  - keeps GameLayout dumb (no system wiring in the JSX layer),
 *  - leaves a single seam that tests can mock by setting + reading
 *    the same module export.
 *
 * The scene calls `setActiveSystems(bootstrap)` in `create()` and
 * `setActiveSystems(null)` in `shutdown()`. Callers that read it before
 * the scene has booted (or after teardown) get `null` and bail.
 */
import type { SceneBootstrap } from './scene-bootstrap';

let activeSystems: SceneBootstrap | null = null;

export function setActiveSystems(systems: SceneBootstrap | null): void {
  activeSystems = systems;
}

export function getActiveSystems(): SceneBootstrap | null {
  return activeSystems;
}
