# PLAN-08 — Combat: damage resolution + ballista projectiles

## Context

Issue #8 wires up the combat loop's damage side: melee application on the
attack-frame event, and ranged projectile flight + collision for towers
(ballista first). Armor reduction + death handling already live on the
`Damageable` component from #6; this PR only orchestrates it, never
re-implements it.

Upstream already merged:
- `Damageable.applyDamage(n)` applies `max(0, n - armor)`, floors HP at 0,
  emits `'damaged'` and (once) `'died'` (`src/game/components/Damageable.ts`).
- `EventEmitterLike` + `SimpleEventEmitter` for jsdom-safe tests
  (`src/game/components/EventEmitter.ts`).
- `Orc` / `Human` entities expose `.damageable` and `.emitter`
  (`src/game/entities/{Orc,Human}.ts`).
- `Building` exposes `.combat` for towers (range, damage, attackRate,
  projectileSpeed) — stats from `src/data/buildings/ballista.json`.
- Scene/sprite binding is out of scope (per #6 plan).

## Branch

`feat/8-combat`

## Approach

Two new files, both pure TS (no Phaser top-level import):

### `src/game/entities/Projectile.ts`
A lightweight data object — **not** a Phaser GameObject.

Fields: `from {x,y}`, `target` (a reference to a damage-receiving entity +
its current position accessor), `speed`, `damage`, `position {x,y}`,
`done: boolean`.

Ctor: `new Projectile({ from, target, speed, damage, hitRadius? })`.

Methods:
- `update(dt)` — advance `position` toward the target's **current** position
  by `speed * dt` along the unit vector from current `position` → target
  position. If the step length would exceed the remaining distance, snap to
  target. Checks `hasReachedTarget()` each call.
- `hasReachedTarget()` — true when `distance(position, target.position) <=
  hitRadius` (default `hitRadius` is a design constant, see Decisions).
- `applyDamageOnHit()` — calls `target.damageable.applyDamage(this.damage)`
  and sets `done = true`. Safe to call multiple times (no-op after first).

The projectile does **not** own rendering. A later scene-binding issue can
attach a sprite that reads `projectile.position` each frame.

`TargetLike` interface: `{ position: { x: number; y: number }; damageable:
{ applyDamage(n: number): number }; damageable_dead?: () => boolean }` — a
minimal structural shape so the Projectile works with `Orc`, `Human`, and
(later) `Building` targets without importing those classes. Projectile
marks itself done if the target is already dead when it arrives.

### `src/game/systems/Damage.ts`
System that orchestrates melee hits, tower firing, and projectile lifetime.

Fields:
- `emitter: EventEmitterLike` — system-level events (`'projectile-spawned'`,
  `'projectile-hit'`, `'target-died'`).
- `projectiles: Set<Projectile>` — active projectiles.
- `towers: Map<TowerEntity, { cooldown: number }>` — registered towers +
  their per-tower cooldown timer (seconds until next shot).

Methods:
- `register(tower)` / `unregister(tower)` — adds/removes a tower from the
  firing loop with cooldown initialised to 0 (ready to fire).
- `meleeAttack(attacker, target)` — reads attacker's damage from
  `attacker.def.stats.dps` (UnitDef) and calls
  `target.damageable.applyDamage(dps)`. Emits `'melee-hit'` with
  `{ attacker, target, effective }`. This is the "attack-frame event" hook:
  a later AI/animation system calls this once per attack frame.
- `fireProjectile(tower, target)` — reads `tower.combat.{damage,
  projectileSpeed}`, spawns a `Projectile`, adds it to `projectiles`, emits
  `'projectile-spawned'`. Returns the projectile (for tests).
- `update(dt, towerPosition?)` — the system's per-tick step:
  1. For each registered tower, decrement `cooldown` by `dt`. If `cooldown
     <= 0` AND a target-selection callback produced a target in range, call
     `fireProjectile` and reset `cooldown = 1 / combat.attackRate`.
  2. For each live projectile, call `projectile.update(dt)`. If it's reached
     its target, call `projectile.applyDamageOnHit()`, emit
     `'projectile-hit'`, mark done, and remove from the set.
  3. Clean up done projectiles.

**Firing loop scope note.** Target selection + range check is AI territory
(#9) and out of scope here. The Damage system exposes `fireProjectile`
directly so tests can drive it without the AI. For the `update(dt)`
tower-cooldown path we accept an optional `selectTarget(tower): target |
null` callback in the constructor — when unset, the system never
auto-fires (cooldown still ticks). This keeps the API future-ready without
depending on a system that doesn't exist yet.

**Death handling / "freed" semantics.** When the damage we apply (melee or
projectile) causes the target to die, the `Damageable` emits `'died'` on
its shared emitter. The Damage system also subscribes to `'died'` for any
target it hits, and on the first `'died'` it emits a system-level
`'target-died'` event and calls an optional `onEntityDied(target)` callback
(passed in the ctor) — a later scene/entity-registry PR plugs in here to
drop the entity from active sets. Per the orchestrator's note, "freed"
means "removed from active sets"; we don't play sprite animations (no
sprite binding yet). To give the requested "short death animation →
freed" shape without wiring Phaser, we expose `deathLingerSeconds` on the
system (default `0` — immediate free) which, if set by a caller, delays
the `onEntityDied` callback by that many simulated seconds (scheduled
via the `update(dt)` loop). This is a future-proof seam; the default path
frees on the tick the target dies.

## Files

- `src/game/entities/Projectile.ts` (new)
- `src/game/systems/Damage.ts` (new)
- `src/game/systems/index.ts` (new) — barrel export for future systems
- `src/game/entities/index.ts` — add-only: export `Projectile`
- `tests/game/systems/Damage.test.ts` (new) — melee + projectile + death
- `tests/game/entities/Projectile.test.ts` (new) — flight + hit tolerance
- `docs/plans/PLAN-08-combat.md` (this doc)

No data files change. No schemas change. Ballista numbers already
validated via #11.

## Test strategy

All tests under Vitest + jsdom, using `SimpleEventEmitter` — no Phaser.

### `Projectile.test.ts`
1. **Straight-line flight toward stationary target:** `speed = 100`,
   `from = (0,0)`, `target at (100,0)`, step `update(0.5)` twice; expect
   position within tolerance of `(100,0)` and `hasReachedTarget()` true.
2. **Moving target, hits within tolerance (ACCEPTANCE CRITERION):** target
   moves at a fixed velocity each tick (mocked by mutating its position);
   step many small `dt`s; assert projectile eventually reaches the target
   within `hitRadius`, and that `applyDamageOnHit()` applies damage to the
   target's `Damageable`.
3. **Damage accounts for armor (ACCEPTANCE CRITERION):** target with
   `armor: 3`, projectile `damage: 10` → effective HP loss is `7`.
4. **No double-hit:** calling `applyDamageOnHit()` twice only damages once.
5. **Dead target:** if target already dead on arrival, projectile marks
   itself done without applying further damage.

### `Damage.test.ts`
1. **Melee hit on attack frame:** `meleeAttack(orc, human)` calls
   `human.damageable.applyDamage(orc.def.stats.dps)`; verify HP drops and
   `'damaged'` fires on the target's emitter.
2. **Armor reduction via melee:** attacker `dps = 10` vs target `armor = 4`
   → effective `6`.
3. **Tower fires projectile with correct stats:** construct a ballista
   Building + a human target; call `fireProjectile(tower, target)`; assert
   the returned projectile's `speed === tower.combat.projectileSpeed` and
   `damage === tower.combat.damage`.
4. **Update loop advances projectiles + resolves on hit:** spawn one
   projectile via `fireProjectile`, repeatedly call `system.update(dt)`
   until the projectile resolves; assert target took damage, projectile is
   cleaned out of the set, and `'projectile-hit'` event fired.
5. **Death triggers free callback:** construct with an `onEntityDied` spy;
   apply enough damage to kill the target; after one `update(dt)` (with
   default `deathLingerSeconds = 0`) the spy was called with the target.
6. **Cooldown loop:** register a tower with a stubbed `selectTarget` that
   always returns the same target; run `update` over ~3 seconds; assert
   expected number of `'projectile-spawned'` events ≈ `3 * attackRate`.

## Verification

1. `pnpm typecheck` passes (strict TS).
2. `pnpm lint` passes.
3. `pnpm test -- --run` — all new + existing tests green.
4. `pnpm validate:data` — unchanged, still green.
5. Grep `src/game/systems/*.ts src/game/entities/Projectile.ts` for
   balance-number literals — every stat must come from the def / ctor
   args. Only structural constants allowed: `0` (armor-floor mirrored
   in tests only), `1` (default upgrade level is not relevant here), and
   the one design constant `DEFAULT_HIT_RADIUS` (documented in-file).

## Decisions

- **Tick-based, not event-based, for projectile motion.** Projectiles have
  continuous position; the Damage system's `update(dt)` drives them. Melee
  stays event-based (one call per attack-frame event). This matches the
  issue wording: "melee hit applies damage via Damageable on attack
  animation frame" vs "ballista spawns projectile … flies to target".
- **Projectile hit radius.** A small design constant
  `DEFAULT_HIT_RADIUS = 6` (pixels, at 1280x720 virtual res — roughly a
  half-tile at the intended zoom). Not a balance number (doesn't affect
  damage/hp/speed), documented in-file. Overridable per projectile via ctor
  for future unit tests + special projectiles. Keeps stats fully data-driven;
  this is a physics tolerance.
- **Projectile does not own its sprite.** Consistent with #6's decision not
  to subclass `Phaser.GameObjects.Sprite`. A later scene-binding PR can
  render `projectiles` by reading `position` each frame.
- **`TargetLike` structural type over concrete classes.** Keeps the
  Projectile decoupled from `Human`/`Orc`/`Building`. Importing entity
  classes would pull in their component dependency graph and Phaser (once
  sprite binding lands).
- **Projectiles always hit — no miss mechanic yet.** Projectile speed >
  target speed in shipping data, so the velocity-based chase converges.
  Miss/dodge is a future issue (#9+).
- **Projectile homes on current target position every tick.** Simpler than
  leading-shot prediction and easier to test deterministically. Real
  siege/ballista behaviour can be added in a later feel-pass issue.
- **Damage system owns the tower cooldown timer**, not the Building
  entity. Keeps `Building` a pure data host; the cooldown is a runtime
  concern only relevant when the system is running.
- **`selectTarget` callback injected at construction** to keep the
  auto-fire loop testable without the AI system. The callback is optional
  and defaults to always-null (no auto-fire); tests pass explicit stubs.
- **"Freed" = removed from active sets.** Per orchestrator note. We expose
  an `onEntityDied(target)` callback on the system; the default is a
  no-op. A later scene/registry PR will plug in. `deathLingerSeconds`
  (default `0`) is a future-proof seam for a short death animation delay;
  not wired to any sprite right now.
- **System-level events** use the same emitter-like abstraction as
  components. The Damage system accepts an optional emitter in the ctor
  (defaults to a `SimpleEventEmitter`). Events: `'projectile-spawned'`,
  `'projectile-hit'`, `'melee-hit'`, `'target-died'`.
- **No new data files.** Ballista numbers already live in
  `src/data/buildings/ballista.json`. Attacker melee damage comes from
  `UnitDef.stats.dps` (existing schema).
