# PLAN-09 — AI: human path-to-fort + orc intercept behavior

## Context

Issue #9 wires the behavior layer on top of the already-merged
Pathfinding (#7) and Damage (#8) systems. Humans pathfind to the fort
(a rally-like "goal" cell), attack walls when their path is blocked,
and re-path when `path:invalidated` fires. Orcs idle at a rally point,
engage the nearest human in aggro radius, melee-attack until dead, then
return to rally.

Upstream already merged:
- `Pathfinding` (`src/game/systems/Pathfinding.ts`) — `findPath(fx, fy,
  tx, ty): Promise<Cell[] | null>`, emits `path:invalidated` +
  `path:recompute` on wall changes. Source: `GameEvents.PathInvalidated`
  / `GameEvents.PathRecompute`.
- `DamageSystem` (`src/game/systems/Damage.ts`) — `meleeAttack(attacker,
  target)` applies attacker dps through target's Damageable; also tracks
  cooldowns + projectile lifetime. Listens for `'died'` on damaged
  targets.
- `Orc` / `Human` entities (`src/game/entities/{Orc,Human}.ts`) — own
  `.emitter`, `.damageable`, `.targetable`; `.def.stats` has `{hp, dps,
  speed, armor}`. No position/behavior yet.
- `Building` (`src/game/entities/Building.ts`) — walls expose
  `.breakable` (a Damageable wrapper with sprite states), also emit
  `'died'` through their shared emitter.
- `GameEvents` + `EventEmitterLike` pattern (`src/game/systems/events.ts`,
  `src/game/components/EventEmitter.ts`).

Scene/sprite binding is still out of scope (per #6 / #8 plans).
No map-specific "fort cell" is hardcoded yet — the rally / goal cell is
passed in by the scene at system construction time.

## Branch

`feat/9-ai`

## Approach

One new file — a single `AI` system that encapsulates both human and
orc state machines. The system is tick-driven via `update(dt)`, reads
Pathfinding for routes, reads Damage for attacks, and subscribes to
`GameEvents.PathInvalidated` to re-request paths.

### State lives in the AI system

We attach behavior state via a `Map<Entity, BehaviorState>` inside the
AI system rather than as a new field on the entity class. Rationale
(see Decisions for the trade-off):
- Keeps `Orc` / `Human` pure data hosts as they are today (`#6` decision).
- Lets the AI system own lifecycle — when we `register`/`unregister`,
  we don't leak state onto the entity.
- Parallels the pattern used by `DamageSystem.towers: Map<TowerLike, ...>`.

### State machines

**Human FSM** (`path → attack-wall → path → attack-orc`):
  - `PATHING` — walking the current path toward the goal. Each tick,
    advance along the path at `def.stats.speed` px/s. If an orc enters
    engagement range, switch to `ATTACK_ORC`. If the next step is
    blocked by a wall, switch to `ATTACK_WALL`.
  - `ATTACK_WALL` — face the blocking wall, melee it on attack-rate
    cadence until destroyed, then request a new path (returns to
    `PATHING`). `path:invalidated` during this state also triggers a
    re-path attempt — if no wall is in the way anymore, we leave
    `ATTACK_WALL` and go back to `PATHING`.
  - `ATTACK_ORC` — melee the engaged orc on attack-rate cadence. When
    the orc dies (or disengages out of range), request a new path and
    return to `PATHING`.
  - `IDLE` — initial state before the first path is requested (also the
    "no path exists" fallback, from which we retry on `path:invalidated`).

**Orc FSM** (`idle → engage → attack → return-to-rally`):
  - `IDLE_AT_RALLY` — at the rally point. Scan for humans within
    `aggroRadius`; if any, switch to `ENGAGE`.
  - `ENGAGE` — walking toward the nearest human target.
  - `ATTACK` — in melee range; melee on attack-rate cadence.
  - `RETURN_TO_RALLY` — target died or walked out of aggro; move back
    toward rally. On arrival, switch to `IDLE_AT_RALLY`.

Both FSMs are implemented as a `switch` in `tickHuman(state, dt)` /
`tickOrc(state, dt)` — compact, no class-per-state ceremony, easy to
test by stepping `update(dt)` with observed state transitions.

### Positions

Entities don't carry positions yet. The AI system stores each unit's
current **grid cell** on the attached `HumanBehavior` / `OrcBehavior`
record, plus a pixel offset if non-integer progress between cells is
needed. For this first pass, positions advance tile-by-tile on a
cooldown derived from speed (`secondsPerTile = tileSize /
def.stats.speed`). This is enough to test state transitions; pixel-
smooth interpolation can layer on later without changing the FSM.

### Subscriptions

- On construction, subscribe to `GameEvents.PathInvalidated`. In the
  handler, mark every human as "needs-repath" on their next tick
  (state stays the same; the tick re-queries `findPath`). This also
  lets a human in `ATTACK_WALL` give up on a wall that was destroyed
  remotely.
- On `destroy()`, unsubscribe.

### Attacks go through DamageSystem

Melee hits use `damage.meleeAttack(attacker, targetLike)` — the AI
never decrements HP directly. For humans attacking walls, we construct
a `TargetLike` from the wall building's `.breakable.damageable` + a
position, matching the shape `meleeAttack` expects (it only reads
`.damageable`). For orcs attacking humans and vice versa, we pass
their entity's `.damageable` + current world position.

## Files

- `src/game/systems/AI.ts` (new) — the system + FSM logic.
- `src/game/systems/index.ts` — **add-only** export for `AI`.
- `tests/game/systems/AI.test.ts` (new) — FSM transitions, wall block,
  aggro, rally return.
- `docs/plans/PLAN-09-ai.md` (this doc).

No entity-class modifications. No data-file modifications. No schema
modifications (see Decisions on why aggro / attackRate are ctor params
for now — not yet in `UnitDef`).

## Test strategy

All tests under Vitest + jsdom using `SimpleEventEmitter` — no Phaser
imports. Pattern follows `tests/game/systems/Pathfinding.test.ts` +
`tests/game/systems/Damage.test.ts`.

1. **Human enters `ATTACK_WALL` when path is blocked by a wall, resumes
   path when wall dies (ACCEPTANCE CRITERION).** Build a 5×1 corridor;
   place a `wall-wood` Building at the midpoint; spawn a human at
   col 0 targeting col 4 (fort cell); tick `update(dt)` until the
   human's behavior state is `ATTACK_WALL`; verify it's adjacent to
   the wall; drive `update(dt)` forward (or directly exhaust the
   wall's HP via the shared emitter emitting enough `meleeAttack`s)
   until the wall dies; tick again — human returns to `PATHING` and
   reaches the goal cell.
2. **Human re-requests path on `path:invalidated`.** Spawn a human on
   an open path; tick once so it gets a path; emit
   `GameEvents.PathInvalidated`; assert the internal "needs-repath"
   flag is set; after next tick, `findPath` is called again (spy on
   the Pathfinding's `findPath`).
3. **Orc engages nearest human in aggro radius.** Place two humans at
   different distances from the orc's rally; tick; assert the orc's
   target is the closer one; tick until melee range; assert state is
   `ATTACK` and the human is taking damage each attack-rate tick.
4. **Orc returns to rally when target dies.** One human, orc engages
   and melees until human dies; assert orc transitions to
   `RETURN_TO_RALLY`, then `IDLE_AT_RALLY` after reaching the rally
   cell.
5. **Orc ignores humans outside aggro radius.** Far human — orc stays
   `IDLE_AT_RALLY`.
6. **Rally point is configurable per run.** Construct the AI system
   with a different rally cell; orc returns to the provided cell, not
   a hardcoded one.
7. **Human switches to `ATTACK_ORC` when orc engages in melee range.**
   Drive the combined interaction; after contact, both sides attack
   each other (via `DamageSystem.meleeAttack`).

Mocks:
- A small `fakePathfinding` exposing `findPath` + the same
  `WallBuilt/Destroyed → path:invalidated` contract — or instantiate
  the real `Pathfinding` on a minimal `TiledMapLike` (matches the
  existing test pattern).
- Real `DamageSystem` + `SimpleEventEmitter`.
- Real `Orc` / `Human` / `Building` entities constructed from the
  existing JSON (`mougg-grunt`, `peasant-levy`, `wall-wood`) — all
  balance numbers flow from def.

## Verification

1. `pnpm typecheck` — passes under strict TS.
2. `pnpm lint` — passes.
3. `pnpm test -- --run` — all new + existing tests green (118 + new).
4. `pnpm validate:data` — unchanged, still green (no data changes).
5. Grep `src/game/systems/AI.ts` for balance literals. Allowed
   structural constants only: grid-adjacency math (1-tile Chebyshev
   distance), `Math.hypot` usage, 0 for initial cooldown, rally/aggro
   must come from ctor options (see Decisions).

## Decisions

- **State-in-AI-map (NOT state-on-entity).** Rationale above; also
  keeps the option open to let multiple AI systems (e.g. a future
  "debug AI") drive the same entity without a field collision. Trade-
  off: `AI` must expose `register(unit, initialState?)` / `unregister`
  so the caller can add/remove entities as they spawn and die.
- **Aggro radius source = AI ctor option, default = `6 * tile`.** The
  `UnitDef` schema does not (yet) carry an `aggroRadius`. Adding a
  new required field would break validated JSON and pull
  data-schema work (#1 territory) into this PR. Since wave spawning
  (#10) is the caller that will eventually want per-unit tuning, we
  accept `aggroRadius` as a ctor option on the AI system for now and
  document the future migration: "move to `UnitDef.stats.aggroRadius`
  when a caller needs per-unit values." The *value* still isn't a
  magic number inside the system — it comes from the ctor. The **
  default** is expressed in tiles (`6`) times the map's `tileWidth` —
  structural, not balance (the caller always overrides for a real
  game).
- **Attack cadence source = derived from `def.stats.dps`.** `UnitDef`
  has `dps` but not a separate `attackRate`. For the initial slice we
  treat melee as "one attack per second dealing dps damage" — i.e.
  `secondsPerMeleeAttack = 1` and the AI simply calls
  `DamageSystem.meleeAttack` on that cadence. This matches the
  existing `DamageSystem.meleeAttack` semantics (it reads `dps` as the
  hit amount). Towers already have `attackRate` in their schema; units
  can gain one in a future data migration. Documented in-file.
- **Rally point default = map centre if not supplied.** The issue
  calls out "rally point configurable per run" — we expose it as a
  required ctor option in the AI system (`{ rally: Cell }`). The
  scene calls this once per run; tests supply their own cell. No
  hardcoded default inside the system.
- **Goal cell (humans' pathfind target) = ctor option, not derived.**
  The concept of "the fort" isn't a single cell the AI system can
  infer — the map may evolve. Scene passes `{ fortGoal: Cell }` in
  ctor. (Could later come from an `objectgroup` layer in the Tiled
  map, but that's scene-level parsing.)
- **No diagonal pathing; no smoothing.** Matches `Pathfinding`
  default. Humans walk tile-by-tile on cardinal steps.
- **Tile-by-tile step instead of pixel-smooth motion.** Smooth-between-
  cells is animation polish and not load-bearing for the FSM. The
  system stores `cell: Cell` + `tileProgress: number` so a later
  renderer can interpolate.
- **Barrel additive-only.** New export line appended to
  `src/game/systems/index.ts`, never reordering existing lines — per
  orchestrator's structured-conflict-resolver note.
- **No new npm deps.** Everything needed is already installed (Zod /
  easystarjs via Pathfinding / the emitter / entity classes).
