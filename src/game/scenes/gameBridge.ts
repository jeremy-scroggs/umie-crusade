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
import type { HeroAbilityResult, HeroAbilityTargetLike } from '@/game/entities/Hero';
import { getGameStore } from '@/state/bridge';

let activeSystems: SceneBootstrap | null = null;

export function setActiveSystems(systems: SceneBootstrap | null): void {
  activeSystems = systems;
}

export function getActiveSystems(): SceneBootstrap | null {
  return activeSystems;
}

/**
 * Dispatch the hero's active ability (Clomp'uk) from the React HUD.
 *
 * Reads the live system bootstrap, builds the candidate target list
 * (every alive registered human, positioned at its current AI cell),
 * calls `Hero.tryUseAbility(...)`, and on success writes the cooldown
 * back into the gameStore so the HUD's `AbilityButton` can show the
 * countdown. Returns the raw result so callers can decide what to do
 * (most callers — the HUD — only need the side effects).
 *
 * Returns `null` when there is no active scene (boot sequence /
 * teardown). All numbers come from the Hero's validated def — no
 * hardcoded balance values.
 */
export function tryHeroAbility(nowMs: number): HeroAbilityResult | null {
  const systems = activeSystems;
  if (!systems) return null;
  const hero = systems.hero;
  const tileSize = systems.pathfinding.tileWidth;

  // Hero stays at the rally cell in M1 (no movement controller yet).
  const heroPosition = {
    x: (systems.rallyCell.x + 0.5) * tileSize,
    y: (systems.rallyCell.y + 0.5) * tileSize,
  };

  // Collect every alive human. We iterate through the AI's known set via
  // the public `humanBehavior` lookup keyed off the wave-tracked humans
  // — in M1 the only spawn channel is WaveSystem, so all live humans
  // were registered with the AI on spawn.
  const targets: HeroAbilityTargetLike[] = [];
  for (const beh of systems.ai.allHumanBehaviors()) {
    if (beh.instance.entity.damageable.dead) continue;
    targets.push({
      position: {
        x: (beh.cell.x + 0.5) * tileSize,
        y: (beh.cell.y + 0.5) * tileSize,
      },
      damageable: beh.instance.entity.damageable,
    });
  }

  const result = hero.tryUseAbility({
    nowMs,
    position: heroPosition,
    targets,
  });

  if (result.used) {
    const cooldownMs = hero.def.ability.cooldownMs;
    getGameStore().setHeroAbilityCooldown(cooldownMs, nowMs + cooldownMs);
  }

  return result;
}
