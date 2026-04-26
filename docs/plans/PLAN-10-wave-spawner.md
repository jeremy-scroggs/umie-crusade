# PLAN-10 — Wave spawner + fort-core game-over

## Context

Issue #10 wires the wave system that drives the run from start to finish:

- Reads `m1-wave-{1..5}.json` (#3, merged) and emits humans onto the map
  at the configured edge with the configured timing.
- Adds a fort-core entity whose destruction ends the run as a loss.
- Completing wave 5 ends the run as a win.

Upstream already merged:

- `WaveDef` schema (`src/data/schemas/wave.schema.ts`) — `id`, `number`,
  `spawns[]` of `{ unitId, count, edge: 'N'|'S'|'W', startDelay, interval }`,
  `reward.gold`, optional `cry`.
- 5 wave files at `src/data/waves/m1-wave-{1..5}.json`.
- `Human` entity (#6) with `Damageable`/`Targetable`.
- `Building` entity (#6) with `Breakable.damageable` for HP/armor.
- `Damageable` (#6) emits `'died'` once on HP ≤ 0.
- `AISystem` (#9) — exposes `registerHuman({ entity, cell })` so spawned
  humans get pathing toward the fort goal.
- `Pathfinding` (#7) — wave system uses `tileWidth` to convert pixel
  spawn-marker coordinates from `m1-slice.json` to grid cells.
- `GameEvents` registry (`src/game/systems/events.ts`) — already has
  `WaveComplete = 'wave:complete'` from #13, which Economy listens to.
- Map data `src/data/maps/m1-slice.json` — has 4 object markers in the
  `spawns` layer: `spawn-north` (608, 0), `spawn-south` (608, 704),
  `spawn-west` (0, 352), `fort-core` (960, 352). Tile size 32 → cells
  (19,0), (19,22), (0,11), and (30,11) respectively.

## Branch

`feat/10-wave-spawner`

## Approach

### 1. `GameEvents` — add `WaveStart`, `RunWon`, `RunLost` (additive)

Extend `src/game/systems/events.ts` additively (no reordering):

- `WaveStart = 'wave:start'` with `WaveStartPayload = { waveId, waveNumber }`.
- `RunWon = 'run:won'` with `RunWonPayload = { lastWaveNumber }`.
- `RunLost = 'run:lost'` with `RunLostPayload = { reason: 'fort-destroyed' }`.

`WaveComplete` already exists from #13 — re-use it. Re-export new names
from the systems barrel.

### 2. `WaveSystem` — `src/game/systems/Wave.ts` (new)

Pure TypeScript, jsdom-safe (no Phaser top-level import). Mirrors
`Economy` / `AISystem` ctor-injectable patterns so tests can wire mocks.

#### Responsibilities

- Take `waves: WaveDef[]` in the constructor (sorted by `number`). Tests
  inject a mock array. Production calls a new helper that imports the 5
  M1 JSONs (Vite handles JSON-as-module).
- Take `unitDefs: Record<string, UnitDef>` so the spawner can look up
  the def by `unitId`. Test injects a single `peasant-levy` entry; prod
  passes the M1 humans map.
- Take spawn-edge cells `{ N, S, W }` — the caller (scene) computes
  these from the Tiled map markers; the system stays data-pure.
- Take a `fortCore: { entity: Building; cell: Cell }` — wave system
  subscribes to its `damageable.died` and emits `RunLost`.
- Take `onSpawn(human, edge)` callback — invoked for each spawned human
  so the scene can register it with `AISystem.registerHuman` and any
  scene-level lists (sprites, etc.). Wave system itself does **not**
  hold a reference to the AI system; the scene wires them together.
- Take `humansProvider()` — returns currently-alive humans, used to
  detect "wave defeated → emit `wave:complete`". Defaults to the set
  of humans this system has spawned, minus those whose `damageable.dead`
  is true.
- `start()`: emits `WaveStart` for wave[0], begins spawn timing.
- `update(dt)`: advances each spawn's timer; each tick a `spawn.unitId`
  reaches its next emission (`startDelay` then `interval * k`), build
  a `Human.fromDef(unitDefs[unitId])`, place at the appropriate edge
  cell, call `onSpawn(human, edge)`, then track it for "is the wave
  defeated?" detection.
- When all spawns of the current wave have emitted **and** all spawned
  humans are dead → emit `WaveComplete` (which Economy listens to and
  credits gold). If next wave exists, emit `WaveStart` and begin the
  next; otherwise emit `RunWon` (final wave defeated).
- On fort-core `died` event → emit `RunLost` once and stop spawning
  (`destroyed = true` flag short-circuits future `update` calls).

#### Internal state

```ts
interface ActiveSpawn {
  spawn: WaveSpawn;       // from the wave def
  emittedCount: number;   // how many we've fired
  nextAt: number;         // seconds elapsed when next emission fires
}

interface ActiveWave {
  def: WaveDef;
  activeSpawns: ActiveSpawn[];
  spawnedHumans: Set<Human>;
  elapsed: number;        // since wave start
  startEmitted: boolean;
  completeEmitted: boolean;
}
```

Single `currentIndex` advances 0…N-1 across the `waves` array. After
the final wave's `WaveComplete`, emit `RunWon` with
`lastWaveNumber: waves[waves.length-1].number`.

#### Edge → cell mapping

The scene supplies `edges: { N: Cell; S: Cell; W: Cell }`. Wave system
reads `spawn.edge` and looks up the cell. No magic numbers in the
system — coords come from the Tiled map at runtime.

### 3. Fort-core hookup

The fort-core is just a `Building` (or any object with a `Damageable`).
The issue allows extending Building OR new class; Building suffices —
the schema already supports walls/towers, but fort-core is neither.
**Decision:** treat fort-core as a thin wrapper provided by the caller
(scene constructs it from data once we have a fort-core JSON; for now
the WaveSystem accepts any `{ damageable: { dead, applyDamage } }`-like
target). The system listens to `damageable.died` exactly like
`DamageSystem.watchDeath` listens. We do **not** add a new entity class
in this issue — that's #11 territory. The damageable-shape interface
keeps the contract pure.

```ts
export interface FortCoreLike {
  readonly cell: Cell;
  readonly damageable: {
    readonly dead: boolean;
    readonly emitter: EventEmitterLike;
  };
}
```

The scene will hand in a `Building.fromDef(fortCoreDef)` whose
`breakable.damageable` matches; tests can hand in a tiny inline object.

### 4. Loader helper (production wiring)

Add `loadM1Waves()` in `Wave.ts` (or a sibling) that imports the 5 JSON
files and sorts by `number`. Used only by production scene code; tests
bypass via the `waves` ctor param. JSON imports are validated against
`waveDefSchema` at load time so a malformed file fails loud.

### 5. Test strategy — `tests/game/systems/Wave.test.ts`

Mirror `tests/game/systems/Economy.test.ts` and `AI.test.ts`:

- **Spawn count + timing.** Single wave, 3 peasants, `startDelay=2`,
  `interval=1`. `start()` then advance `update(dt=0.5)` ticks; expect
  no spawns before t=2, exactly 1 by t=2, 2 by t=3, 3 by t=4.
- **Multiple spawns / multiple edges.** Wave with two spawn entries on
  different edges — confirm each human gets the configured edge cell.
- **`wave:start` emitted on `start()`** and on each subsequent wave
  transition.
- **`wave:complete` emitted only after** all spawns have emitted **and**
  all spawned humans are dead. Drive: spawn all, manually call
  `human.damageable.applyDamage(maxHp)` on each → tick once → expect
  the event.
- **Run won.** A 2-wave sequence; complete both; expect `run:won` once.
- **Run lost.** Construct a fort-core mock with a `Damageable`; emit
  `applyDamage` to kill it mid-spawn; expect `run:lost` once and no
  further spawns even after enough sim time.
- **Mock peasant def** — pull `peasant-levy.json` and pass into the
  ctor as `{ 'peasant-levy': peasantLevy }`. Aligns with #9's pattern.
- **Mock wave defs** — define small inline `WaveDef` literals so
  timing assertions don't depend on the M1 balance numbers.

## Files

New:

- `src/game/systems/Wave.ts` — wave spawner + run-state emitter.
- `tests/game/systems/Wave.test.ts` — unit tests.
- `docs/plans/PLAN-10-wave-spawner.md` (this doc).

Modified (additive only):

- `src/game/systems/events.ts` — add `WaveStart`, `RunWon`, `RunLost`
  + payload types.
- `src/game/systems/index.ts` — re-export new system + types.

## Verification

Local gate (must all pass):

```
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm validate:data
```

Acceptance-criteria mapping:

- [x] **Wave system reads #3 data and spawns Peasant Levies at
      configured edges + timing** — `update(dt)` honors `startDelay` +
      `interval` per spawn entry; spawn cell comes from the
      caller-supplied edge map. Test asserts count + timing.
- [x] **Emits `wave:start`, `wave:complete`** — events added; tests
      assert both.
- [x] **Fort-core takes damage; HP ≤ 0 emits `run:lost`** — system
      subscribes to fort-core's `damageable.died`; test kills it and
      asserts the event + no further spawns.
- [x] **Completing wave 5 emits `run:won`** — after the final
      `WaveComplete`, system emits `RunWon`. Tested with a 2-wave
      sequence (configurable `waves` array).
- [x] **Unit test: mock wave spec → spawner produces expected count /
      timing** — `tests/game/systems/Wave.test.ts`.

## Decisions

- **`waves: WaveDef[]` ctor param** (per orchestrator hint) — the
  alternative (Vite `import.meta.glob`) would couple the system to
  Vite's module resolver and complicate jsdom tests. A separate
  `loadM1Waves()` helper handles production wiring; the system stays
  pure.
- **`onSpawn` callback over direct `AISystem.registerHuman` call** —
  keeps the wave system from needing an `AISystem` reference. The
  scene composes the two. AISystem and Wave share zero runtime state.
- **`FortCoreLike` interface, not a new entity class** — issue #11
  owns building authoring. Wave system needs only the damageable
  shape; using a structural interface lets the scene plug in any
  `Building` / future fort-core entity without churn here.
- **`humansProvider` defaults to system's own spawned set** — keeps
  tests trivial; production can override if death-tracking lives
  elsewhere (it currently doesn't).
- **No Phaser import** — system runs under jsdom for tests and pulls
  zero canvas-feature-detection side effects, mirroring AI / Economy.
- **No new dependencies** — uses zod (already present) only via the
  schema validation in `loadM1Waves`. No new lockfile changes.
