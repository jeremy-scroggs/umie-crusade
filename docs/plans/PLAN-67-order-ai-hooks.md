# PLAN-67 — Per-order AI hooks for the four Crusade orders

## Context

Issue #67 layers lightweight per-order behavior on top of the existing
human path-to-fort spine in `src/game/systems/AI.ts`. D5 (#59) and D6
(#60) already shipped the four humans; each carries its order tag in
`abilities[]` (the schema has no `behavior` field):

- `order-of-honor.json`        → `abilities: ['gate-charge']`
- `rangers-of-justice.json`    → `abilities: ['volley']`
- `knights-of-valor.json`      → `abilities: ['no-retreat']`
- `paladins-of-compassion.json` → `abilities: ['heal', 'escort-wounded']`

The existing AI has separate FSMs for humans (path-to-fort) and orcs
(intercept), plus the Gukka FSM from #30. This issue adds ONE small
per-order behavior layer for humans — NOT a new FSM. Each order gets a
single predicate / hook that mutates target choice, charge timing, or
retreat threshold within the existing `tickHuman` branch.

## Branch

`feat/67-order-ai-hooks`

## Approach

A single tag table + four predicates inside `AI.ts`:

```ts
const OrderTag = {
  GateCharge: 'gate-charge',
  Volley: 'volley',
  NoRetreat: 'no-retreat',
  EscortWounded: 'escort-wounded',
} as const;
```

Each predicate reads the human's `def.abilities[]` array and triggers
its specific mutation in the existing tick path. No new states, no new
FSMs.

### Hooks

1. **Order of Honor (`gate-charge`)** — target priority biases gates
   over flanks. When `humanStepPath` finds the next cell blocked by a
   non-gate building, it scans Chebyshev-1 for a Building whose
   `def.category === 'gate'` and prefers it as the `targetWall`. The
   plain `wallAt(next)` lookup is unchanged for non-Order humans. The
   hook reads gate identity from `Building.def.category`, not from a
   hardcoded id.

2. **Rangers of Justice (`volley`)** — stop at archery range, fire from
   distance. While `Pathing`, if the human's Chebyshev distance to
   `fortGoal` is ≤ a per-unit `archeryRangeTiles` value, the human
   halts forward motion (clears `path`, stays in `Pathing`, no further
   step). Combat damage is the existing `dps` cadence; for #67 the
   ranger sits and lets the existing damage pulse continue against
   adjacent orcs (which is unchanged). The "stop" is the only mutation.

   No `range` stat lives on `unit.schema.ts` today and the bail rule
   says we must NOT modify `#59`'s human JSON. We document a default
   `RANGERS_RANGE_TILES_DEFAULT = 5` in AI.ts and expose an optional
   `archeryRangeTiles?: number` on `AISystemOptions` so the scene /
   tests can tune it without touching JSON. Follow-up issue: thread
   `range` into the unit schema once #59 reopens.

3. **Knights of Valor (`no-retreat`)** — never retreat. We add a tiny
   generic retreat predicate `shouldRetreat(h)` (true when
   `hp/maxHp < retreatThreshold`). Default threshold is `0`, so
   ZERO units retreat unless a scene wires
   `retreatThresholdRatio` on `AISystemOptions`. Knights short-circuit
   the predicate via the `no-retreat` tag and never observe the
   threshold. Until other humans gain a retreat threshold (a future
   issue), the predicate is dormant in production — but the hook is
   testable in isolation, which is exactly what the AC asks for.

   The "retreat" effect, when active, drops the current target and
   transitions the human to `Idle` so the scene can despawn it. This
   is intentionally minimal and additive — the existing four-state
   human FSM is unchanged.

4. **Paladins of Compassion (`escort-wounded`)** — prefer escorting
   wounded over advancing. While `Pathing` with no engaged orc, scan
   for a wounded ally human (`hp/maxHp < escortWoundedRatio`,
   default `0.6`) within `escortRadiusTiles` (default `6`). If found,
   the paladin steps toward that ally instead of advancing along the
   fort path. The hook reuses the existing `stepToward` helper. No
   change to the existing path-following code path — only a precedence
   guard in front of `humanStepPath`.

### Pattern: predicate vs strategy

Predicate-style. Each hook is a small `private` method on `AISystem`
that reads `h.instance.entity.def.abilities` once and returns either a
mutation directive or a boolean. They are called from the existing
`tickHuman` switch and `humanStepPath` body — additive, no FSM
restructuring.

## Files

- `src/game/systems/AI.ts` — add `OrderTag` const, four predicates, four
  small call-sites in the existing human branch. Add four ctor option
  fields (`archeryRangeTiles?`, `retreatThresholdRatio?`,
  `escortWoundedRatio?`, `escortRadiusTiles?`) with defaults.
- `tests/game/systems/AI.test.ts` — one isolated test per hook (4),
  asserting the predicate fires given the right `abilities[]` tag and
  scenario.

## Test strategy

Four new tests under a fresh `describe('AISystem — Order behavior hooks')`:

1. **Order of Honor** — given a peasant-style melee human with
   `abilities: ['gate-charge']`, an adjacent gate-walled choke at the
   next cell, the human attacks the GATE in preference to the
   flanking wood wall.
2. **Rangers of Justice** — a ranger with `abilities: ['volley']`
   walking a corridor toward `fortGoal` halts at `archeryRangeTiles`
   distance and stops stepping further. A non-ranger continues to
   march.
3. **Knights of Valor** — a knight with `abilities: ['no-retreat']`
   below the retreat HP threshold stays in its combat state. A
   non-knight with the same HP ratio drops to IDLE.
4. **Paladins of Compassion** — a paladin with `abilities:
   ['escort-wounded']` and a wounded ally within radius steps toward
   the ally's cell instead of toward the fort goal.

Run gate: `pnpm typecheck && pnpm lint && pnpm test -- --run &&
pnpm validate:data`.

## Verification

- AC1 (Order of Honor: gate-prefer) — covered by gate-vs-wall test.
- AC2 (Rangers: stop at range) — covered by ranger halts test.
- AC3 (Knights: never retreat) — covered by knight stays vs paladin
  retreats test.
- AC4 (Paladins: escort wounded) — covered by paladin steps to ally
  test.
- AC5 (small predicates, NOT FSMs) — diff stays ADD-ONLY and shows no
  new state machine. Each hook is < 30 lines.
- AC6 (unit tests cover each hook) — 4 dedicated tests.
- AC7 (`pnpm test` green; smoke test passes) — enforced by run gate.

## Decisions

- **Predicate pattern over strategy classes**: each hook is one
  function; classes would be over-engineered for four 5-line
  behaviors.
- **Tags read from `abilities[]`**: D5/D6 used `abilities[]` as the
  per-order tag carrier; we match exact strings (`'gate-charge'`,
  `'volley'`, `'no-retreat'`, `'escort-wounded'`).
- **Range / threshold values come from ctor options**, not from JSON:
  the unit schema doesn't yet carry `range` or `retreatThreshold`.
  Documented constants act as defaults. A schema update is out of
  scope for #67 (and bail rule says don't edit human JSON).
- **Knights' "no-retreat" is a guard around a generic retreat
  predicate**, not a dedicated state. The predicate is dormant for the
  other three orders unless the scene supplies a non-zero
  `retreatThresholdRatio`. This keeps the behavior testable today
  without changing any other unit's runtime behavior.
- **Gate identity comes from `Building.def.category === 'gate'`**, not
  from the gate's id, matching the discriminated-union shape from #28.
- **Additivity over Gukka (#30)**: every existing export
  (`gukkaBehavior`, `registerGukka`, `cancelGukkaTask`,
  `GukkaState`, ...) is untouched. The new code lives between the
  existing human FSM helpers and the orc FSM in AI.ts.
