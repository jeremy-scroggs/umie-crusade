# PLAN-06 — Entities: composition components + Orc/Human/Building

## Context

Issue #6 requires the first non-data TypeScript in the game layer: four
composable components (Damageable, Targetable, Breakable, Upgradeable) and
three entity factories (Orc, Human, Building) that accept validated data
objects from issues #2 (unit JSON) and #11 (building JSON).

Per `CLAUDE.md`, Phaser game entities use **composition**, not inheritance.
Components are attachable behaviors — objects we wire onto a Phaser
`GameObject` (or a lightweight host that exposes a Phaser `EventEmitter`),
never a base class anyone extends.

Upstream types already exist:
- `UnitDef` (from `src/data/schemas/unit.schema.ts`) — `stats.{hp, dps, speed,
  armor}`, `cost`, `faction: 'orc' | 'human'`, `category`, `abilities`, etc.
- `BuildingDef` — discriminated union keyed on `category: 'wall' | 'tower'`,
  always has `hp` + `armor`; walls add `repairCost` + `damageStates`; towers
  add a `combat` block.
- All surfaced in `src/types/index.ts`.

## Branch

`feat/6-entities`

## Approach

**Composition pattern: facade objects wrapping a Phaser `EventEmitter`.**
Each component is a small class constructed with an `emitter:
Phaser.Events.EventEmitter` plus its own parameters. The component owns its
state (e.g. current HP) and exposes methods (`applyDamage`) that mutate that
state and emit events on the shared emitter.

Entities (`Orc`, `Human`, `Building`) are lightweight host objects that:
- Hold a reference to an optional Phaser `GameObject` (for runtime rendering)
  but **do not require one** in tests — they own their own
  `Phaser.Events.EventEmitter`, created in their constructor.
- Expose the original `def` and attached components as public readonly
  fields. This keeps entity files free of balance-number literals — every
  stat is read from `def`.
- Expose static `fromDef(def)` factories that build + wire the components.

Why not inherit from `Phaser.GameObjects.Sprite`? Two reasons:
1. We want tests to run in jsdom without spinning up a Phaser game/scene.
2. The issue explicitly states components are attached to a Phaser
   `GameObject` — the entity itself does not need to BE one. A later PR can
   connect entities to sprites via a Scene helper.

**Component roles:**
- `Damageable` — `{ maxHp, hp, armor, emitter }`. `applyDamage(n)`:
  `effective = max(0, n - armor)`, decrement `hp`, emit `damaged` with
  `{ amount, effective, hp }`. If `hp <= 0`, clamp to `0` and emit `died`
  once (guarded by an internal `dead` flag).
- `Targetable` — `{ isTargetable, priority, emitter }`. Simple flag +
  tie-breaker used by future targeting systems. Method `setTargetable(bool)`
  emits `targetable-changed`. No balance numbers — priority is derived from
  `def.category` by the entity constructor, per a small in-file constant map
  documented under Decisions.
- `Breakable` — building-specific damageable-with-damage-states. Composes a
  `Damageable` internally plus a `damageStates: DamageState[]` list; exposes
  `currentSprite()` returning the sprite key for the current HP fraction.
  Emits `damage-state-changed` when it crosses a threshold downward. For
  towers (no damageStates) we pass an empty list and `currentSprite()`
  returns the def's top-level sprite.
- `Upgradeable` — placeholder. `{ level: 1, upgrades: [] }`. Method
  `canUpgrade(): boolean` returns `false` (no upgrade paths defined in M1).
  `applyUpgrade()` is a stub that throws a clear error. Sized for future
  issues to flesh out without blocking M1.

**Building wall vs tower handling:** `Building.fromDef(def)` switches on
`def.category`. Walls attach `Breakable` with the damageStates; towers
attach `Breakable` with an empty damageStates list (keeps the interface
uniform) plus expose `def.combat` via a getter for future combat systems.
Both also get `Upgradeable`. Towers do **not** get `Targetable` by default
(they're structures), but walls + towers both get hit by attacks so they
rely on `Breakable` for damage.

**Orc/Human entities:** both read from `UnitDef`. They attach `Damageable`
(hp + armor from def) and `Targetable` (priority from `def.category`).
`Human.fromDef` asserts `def.faction === 'human'`; `Orc.fromDef` asserts
`def.faction === 'orc'`. This is a defensive runtime assertion — the schema
already enforces it but the assertion gives a clearer error if someone
hands the wrong def to the wrong factory.

**Zero balance numbers check:** entity files only reference
`def.<field>` to pull numbers. Priority map in `Targetable` hookups is a
logical priority (integers 1..5), not balance — walls/ranged/melee
targeting order — and this is a design constant, not a stat. We document
this choice so the grep check stays clean.

## Files

- `src/game/components/EventEmitter.ts` (new) — `EventEmitterLike`
  interface + `SimpleEventEmitter` (see Decisions)
- `src/game/components/Damageable.ts` (new)
- `src/game/components/Targetable.ts` (new)
- `src/game/components/Breakable.ts` (new)
- `src/game/components/Upgradeable.ts` (new)
- `src/game/components/index.ts` (new) — barrel export
- `src/game/entities/Orc.ts` (new)
- `src/game/entities/Human.ts` (new)
- `src/game/entities/Building.ts` (new)
- `src/game/entities/index.ts` (new) — barrel export
- `tests/game/components/Damageable.test.ts` (new) — AC coverage
- `tests/game/components/Targetable.test.ts` (new) — small sanity
- `tests/game/components/Breakable.test.ts` (new) — threshold transitions
- `tests/game/entities/Orc.test.ts` (new) — `fromDef` reads HP/armor from def
- `tests/game/entities/Building.test.ts` (new) — wall + tower paths
- `docs/plans/PLAN-06-entities.md` (this doc)

## Test strategy

- Use vitest + jsdom (already configured).
- For the emitter, import `Phaser.Events.EventEmitter` from `phaser`. Phaser
  tolerates being imported in jsdom as long as we don't create a Game /
  Scene; `EventEmitter` is a standalone class.
  - Fallback: if Phaser import balks in jsdom, swap to a minimal mock
    emitter implementing `on/emit/off`. Document the outcome.
- `Damageable` test covers the exact AC:
  1. `damage − armor` with a floor at 0 (damage < armor → 0 damage applied).
  2. HP decrement over multiple hits.
  3. `died` event fires exactly once when HP reaches 0 (or crosses below).
  4. Further hits after death do not re-emit `died`.
- `Breakable` test: construct with the wall-wood damageStates fixture;
  damage across a threshold fires `damage-state-changed` with the new
  sprite; verify `currentSprite()` updates.
- `Orc.fromDef` test: passes the `mougg-grunt` def, asserts
  `entity.damageable.hp === def.stats.hp`, etc. — enforces no hardcoding.
- `Building.fromDef` test: wall fixture → `breakable` has damageStates;
  tower fixture → `combat` getter returns the def's combat block.

## Verification

1. Grep for literal balance numbers in entity files — only numbers allowed
   are `0` (armor floor / initial counts) and `1` (default upgrade level).
   Stats always come from `def`. Script:
   `grep -nE "(^|[^.])[0-9]+" src/game/entities/*.ts src/game/components/*.ts`
   reviewed manually; any hit must be a loop index / array length / an
   explicitly-justified design constant.
2. `pnpm typecheck` passes.
3. `pnpm lint` passes.
4. `pnpm test -- --run` passes, including the new Damageable test.
5. `pnpm validate:data` unchanged / still green.

## Decisions

- **Composition style = facade objects over an EventEmitter.** Chose this
  over (a) mixin-style class decorators (TS mixins are noisy, worse DX) or
  (b) Phaser Data Manager `setData('damageable', ...)` (ties us to a full
  `GameObject` in tests). The facade keeps components plain-old-TS classes
  easy to unit-test and still compatible with Phaser later (a Scene helper
  can do `sprite.setData('damageable', entity.damageable)` when sprites are
  wired in).
- **Breakable = Damageable + damageStates, NOT just Damageable.** Semantic
  clarity wins over DRY — buildings have sprite-state transitions that
  units don't. Internally, `Breakable` *composes* a `Damageable` (so hp /
  armor logic lives in one place) and adds the state-transition emitter.
- **Upgradeable minimal (stub).** Real upgrade paths are future issues.
  The stub exposes the API surface (`level`, `canUpgrade`, `applyUpgrade`)
  so later work can extend without renaming.
- **Entities are NOT `Phaser.GameObjects.Sprite` subclasses.** They own
  components and an emitter; a later issue will bind a sprite. This keeps
  this PR testable in jsdom without a full scene.
- **`died` event name.** Chose `'died'` (past tense, as used in Phaser
  examples) over `'death'` / `'dead'`. Matches the issue wording ("emits
  `died` event").
- **Defensive faction assertions** in `Orc.fromDef` / `Human.fromDef`. The
  schema enforces `faction` values, but a runtime guard catches mis-wiring
  at the factory boundary (cheap, unambiguous error).
- **Targeting priority map** lives in `Targetable.ts` as an exported const
  `CATEGORY_TARGET_PRIORITY`. It's a design ordering (higher = hit first
  when multiple in range), not a balance number. Documented in-file.
- **Event names standardised** as hyphenated strings:
  `'damaged'`, `'died'`, `'targetable-changed'`, `'damage-state-changed'`,
  `'upgraded'`. Consistent across components.
- **EventEmitter abstraction (impl-time adjustment).** Importing
  `Phaser` at the top of any component module loads Phaser's canvas
  feature-detection inside jsdom and crashes during test collection
  (HTMLCanvasElement.getContext not implemented; eventemitter3 is a
  Phaser transitive dep and not directly importable under pnpm).
  Resolved by introducing an `EventEmitterLike` interface + a tiny
  `SimpleEventEmitter` default implementation in
  `src/game/components/EventEmitter.ts`. Components accept any object
  matching the interface; entity factories default to
  `SimpleEventEmitter` but accept an override so production code can
  pass a `Phaser.Events.EventEmitter` or attached `GameObject`
  (Phaser's GameObject extends EventEmitter). This keeps components
  fully testable in jsdom without touching Phaser side effects, while
  preserving the "attached to a Phaser GameObject" production path.
