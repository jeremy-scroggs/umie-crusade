# PLAN-16 — Hero: Clomp'uk slam + AoE stun active ability

## Context

Issue #16 implements the first hero runtime — the Mougg'r hero entity plus
its Clomp'uk active ability. Upstream work is already merged:

- **#6 entities + components** — `Damageable`, `Targetable`, `EventEmitterLike`
  (`src/game/components/`), `Orc.fromDef` / `Human.fromDef` lightweight host
  objects (`src/game/entities/`).
- **#8 combat** — `DamageSystem` + `Projectile` orchestrate damage but only
  ever call `Damageable.applyDamage`. We follow that pattern here.
- **#12 hero data** — `src/data/heroes/mougg-r.json` holds the validated
  Mougg'r def with an `ability` block:
  ```
  { id: 'clompuk', damage: 30, radius: 64, stunMs: 1500, cooldownMs: 12000 }
  ```
  The `HeroDef` / `HeroAbility` types already ship in `src/types/index.ts`.

In-flight work we must NOT couple to:
- **#9 AI (parallel worker)** — the AI system that reads a stun flag before
  acting is being built in a sibling worktree. We don't have its internal
  shape. See Decisions for the contract we assume; #9 either matches it or
  an integration follow-up closes the gap.
- **#17 HUD button** — not built yet. We expose the ability via a
  triggerable method only; wiring lands in #17.

## Branch

`feat/16-hero-ability`

## Approach

### Hero entity (new)

`src/game/entities/Hero.ts` — separate class from `Orc`, not a subclass.
Mechanically the Mougg'r is a more-powerful Orc with an ability, but
conceptually he's the player avatar; PROJECT_PLAN §4.3 treats heroes as a
distinct concept. A standalone class:

- Keeps `Orc.fromDef` (unit-builder path) free of hero-only fields.
- Lets us attach an `Ability` component without muddying `Orc`.
- Mirrors the existing entity pattern (`Human`, `Orc`, `Building`): a
  lightweight host that owns an `EventEmitterLike` plus its components.

Structure:

```ts
Hero
  readonly def: HeroDef
  readonly emitter: EventEmitterLike
  readonly damageable: Damageable       // hp/armor from def.stats
  readonly targetable: Targetable       // priority from def.category
  readonly ability: AbilityState        // see below
  tryUseAbility(ctx): AbilityResult     // triggers if canUse()
```

Factory `Hero.fromDef(def, emitter?)` validates `def.faction === 'orc'`
(Mougg'r is an orc) and wires the same Damageable/Targetable pattern the
Orc/Human entities use.

### Ability component (new)

`src/game/components/Ability.ts` — a small, ability-agnostic state + cooldown
tracker. Constructed from a `HeroAbility` def. No balance numbers — all
read from the def.

```ts
class Ability {
  readonly def: HeroAbility
  readonly cooldownMs: number           // = def.cooldownMs
  private lastUsedAtMs: number | null
  canUse(nowMs: number): boolean        // elapsed >= cooldownMs (or never used)
  remainingMs(nowMs: number): number    // 0 when ready; for UI dimming
  markUsed(nowMs: number): void         // sets lastUsedAtMs; emits 'ability-used'
}
```

The Ability instance is ability-**shape** agnostic — it only tracks cooldown
+ metadata. The actual effect (AoE damage + stun) lives in `Hero.tryUseAbility`
so we can test the effect independently of cooldown bookkeeping.

### tryUseAbility (AoE + stun application)

`Hero.tryUseAbility(ctx)` takes a context carrying:

- `nowMs: number` — the current timestamp (the caller owns the clock; we
  never read `Date.now()` inside game logic, which kills determinism and
  testability).
- `position: Vec2` — where the slam lands (the hero's current position; the
  caller passes it so Hero doesn't need its own position yet — a later
  scene/movement PR will add that).
- `targets: HeroAbilityTargetLike[]` — candidate human entities the caller
  wants considered. The caller (AI system / scene) is responsible for
  passing the right set; keeps this method pure.

Algorithm:

1. If `!ability.canUse(nowMs)` → return `{ used: false, reason: 'cooldown' }`.
2. Filter targets: `dist(target.position, slamPos) <= def.ability.radius`
   and `!target.damageable.dead`. (`radius` from JSON; squared-distance
   compare to avoid unnecessary `Math.sqrt`.)
3. For each hit target:
   - `target.damageable.applyDamage(def.ability.damage)` — reuse existing
     armor/death pipeline (same pattern as `DamageSystem`).
   - Set the stun flag (see Decisions): `target.stunnedUntilMs = nowMs + def.ability.stunMs`.
4. `ability.markUsed(nowMs)`.
5. Emit `'ability-used'` on the hero's emitter with `{ id, position, hits,
   stunUntilMs }` so UI/VFX can react.
6. Return `{ used: true, hits, stunUntilMs }`.

### HeroAbilityTargetLike

A minimal structural interface (same pattern as `TargetLike` in
`Projectile.ts`):

```ts
interface HeroAbilityTargetLike {
  readonly position: Vec2;
  readonly damageable: { readonly dead: boolean; applyDamage(n: number): number };
  stunnedUntilMs?: number;   // set by the ability
}
```

Structural typing means `Human` satisfies the interface automatically the
moment #9 adds a `stunnedUntilMs` property (or similar). Our code only
writes the field; it doesn't demand a particular host class.

### gameStore slice (UI dimming hook)

`src/state/gameStore.ts` — add an additive `heroAbility` slice:

```ts
heroAbility: {
  cooldownMs: number;       // total cooldown (def-driven)
  readyAtMs: number | null; // null = ready now
}
setHeroAbilityCooldown(cooldownMs, readyAtMs): void
clearHeroAbility(): void     // reset path
```

`Hero.tryUseAbility` does NOT import the store (entities stay framework-
free). Instead the caller — in #17 the HUD wiring, today a smoke-test
callback — updates `gameStore.setHeroAbilityCooldown(ability.cooldownMs,
nowMs + ability.cooldownMs)` after a successful slam. This mirrors how
`DamageSystem` stays pure and a Scene glue layer would bridge to React.

The slice is additive (doesn't rename or remove existing fields); `reset`
is extended to also clear the ability block.

## Files

- `src/game/components/Ability.ts` (new)
- `src/game/components/index.ts` — add-only: export `Ability`, types
- `src/game/entities/Hero.ts` (new)
- `src/game/entities/index.ts` — add-only: export `Hero`, types
- `src/state/gameStore.ts` — add-only: `heroAbility` slice + setters
- `tests/game/components/Ability.test.ts` (new) — cooldown gating
- `tests/game/entities/Hero.test.ts` (new) — AoE damage + stun + cooldown
- `docs/plans/PLAN-16-hero-ability.md` (this doc)

Zero data-file changes. The hero JSON already carries every number we read.

## Test strategy

Vitest + jsdom. All tests use `SimpleEventEmitter` + the real
`mougg-r.json` fixture — no hardcoded stats.

### `Ability.test.ts`
1. Brand new ability — `canUse(0)` is true.
2. After `markUsed(t)`, `canUse(t)` is false; `canUse(t + cooldownMs - 1)`
   is false; `canUse(t + cooldownMs)` is true.
3. `remainingMs` is 0 before use, ~cooldown immediately after, decreasing
   with time, 0 at/after ready.
4. `'ability-used'` fires on the ability's emitter with `{ id, usedAtMs }`.

### `Hero.test.ts`
1. `Hero.fromDef` populates `damageable.maxHp`, `damageable.armor`,
   `targetable.priority` — all read from the def (asserts no hardcoding).
2. `tryUseAbility` damages every human within `def.ability.radius` by
   `def.ability.damage` (with armor reduction via Damageable).
3. `tryUseAbility` sets `stunnedUntilMs = nowMs + def.ability.stunMs` on
   each hit.
4. Humans outside the radius are untouched (no damage, no stun flag).
5. Dead humans in range are skipped (no re-apply).
6. Cooldown respected: calling `tryUseAbility` immediately again returns
   `{ used: false, reason: 'cooldown' }` and does NOT damage/stun again.
7. After `cooldownMs` has elapsed (caller advances `nowMs`), ability is
   usable again.
8. `'ability-used'` fires on the hero's emitter exactly once per
   successful slam.
9. Non-orc def throws (parity with `Orc.fromDef`).

Test targets are plain objects satisfying `HeroAbilityTargetLike` — no
dependency on the in-flight AI from #9.

## Verification

1. `pnpm typecheck` — strict.
2. `pnpm lint` — clean.
3. `pnpm test -- --run` — all existing + new tests green.
4. `pnpm validate:data` — unchanged, still green (no data changes).
5. Grep `src/game/components/Ability.ts src/game/entities/Hero.ts` for
   literal balance numbers — every stat must come from the def / caller
   args. Only structural constants allowed: `0` (initial count), `null`
   sentinels, and documented design constants (none needed).

## Decisions

- **Separate `Hero` class, not `Orc` extension.** Heroes are conceptually
  distinct (player avatar, single-instance-per-game) and carry an
  `ability` field on their def that `UnitDef` doesn't have. Extending `Orc`
  would force generic `Orc` code to branch on "is it a hero?" — the host-
  object composition pattern is cleaner. Mechanical similarity is preserved
  by reusing `Damageable` + `Targetable` (same components Orc uses).

- **Stun representation = `stunnedUntilMs` (timestamp).** Per orchestrator
  note, AI is in flight in #9. We set an absolute-timestamp field on the
  target (`nowMs + stunMs`) rather than a `stunned: boolean` flag because:
  (a) it's self-expiring without a ticker on Human; (b) the AI can do a
  single `nowMs < stunnedUntilMs` compare instead of juggling timers.
  Structural typing on `HeroAbilityTargetLike` means whichever host class
  the AI lands picks it up. If #9 names the field differently
  (`stunnedUntil`, `stunUntil`, …), the rename is a one-line follow-up
  that touches Hero.ts. Documented here so the integration path is
  obvious.

- **Caller owns the clock (`nowMs` passed in).** Entities don't read
  `Date.now()` / `performance.now()` — keeps unit tests deterministic and
  lets the scene drive the game clock. Same pattern as `DamageSystem`
  taking `dt`.

- **Caller passes `targets` + `position`.** `Hero.tryUseAbility` is pure
  w.r.t. the world; it doesn't query scenes or component registries. The
  caller (AI / Scene / test) owns spatial queries. Matches PLAN-08's
  `selectTarget` callback approach.

- **Ability component is effect-agnostic.** `Ability` only tracks
  cooldown + metadata; the effect logic lives on `Hero.tryUseAbility`.
  This makes unit-testing the cooldown trivial and leaves room to reuse
  `Ability` for future heroes (different effects, same bookkeeping).

- **Cooldown is stored as a timestamp (`lastUsedAtMs`), not a countdown.**
  No per-tick decrement needed; cheaper and matches how the UI will dim
  (render computes `max(0, readyAtMs - nowMs)` per frame).

- **`gameStore.heroAbility` slice is additive + caller-driven.** The Hero
  entity doesn't import the store — that would tie game logic to a
  specific state container. Instead, whoever triggers the slam (HUD in
  #17, smoke test today) also calls `setHeroAbilityCooldown`. The slice
  is present NOW so #17 has a hook to consume; nothing in the existing
  `gameStore` shape changes.

- **No new dependencies.** Everything uses existing `zustand`, `zod`,
  Vitest + the project's established patterns.

- **Hero position left out for now.** The hero's position is passed in by
  the caller (`ctx.position`) rather than being a field on Hero, because
  no other entity owns a position field yet and the sprite-binding PR
  hasn't landed. When it does, Hero gains a `position` field and the
  ctx arg becomes optional — additive change.
