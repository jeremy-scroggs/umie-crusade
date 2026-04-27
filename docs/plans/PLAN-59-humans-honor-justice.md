# PLAN-59 — humans: Order of Honor + Rangers of Justice JSON

## Context

Issue #59 ships two new human unit fixtures from the Umie Orders:

- **Order of Honor** — virtue: Honor. Charges the front gate; refuses
  traps and ambush. (Per `docs/LORE.md` §"The Umie Crusade" and
  `docs/PROJECT_PLAN.md` §4.2.) Stronger melee than `peasant-levy`.
- **Rangers of Justice** — virtue: Justice. Open-field rank-and-file
  archery. Ranged unit; first archer fixture in the human roster.

Anchor state:

- Schema: `src/data/schemas/unit.schema.ts` is a single shared schema
  for orcs and humans (faction discriminator). Issue #65 added
  optional `kind`/`role` enums. The `role` enum admits `fighter`,
  `builder`, `gatherer`, `caster`, `scout`. The `kind` enum is
  M1/M2-orc-only (`grunt | brute | peon | gukka | skowt | mojoka`) —
  no human kinds exist yet.
- Existing human fixture: `src/data/humans/peasant-levy.json` — uses
  `category: fodder`, `goldDrop: 4`, no `respawnCost`, no `kind`, no
  `role`. We mirror that shape.
- Validator: `tools/validate-data.ts` walks `src/data/humans/` against
  `unitDefSchema` via `dataRegistry`. Two new files drop in
  automatically.
- Naming: kebab-case + namespaced sprite (`humans/<slug>.png`).

## Branch

`feat/59-humans-honor-justice`

## Approach

Author two new JSON files only. No schema changes (that is #65's
domain), no system code, no AI behavior wiring (that is S1 / #67).

### `src/data/humans/order-of-honor.json`

- `id: order-of-honor`
- `name: Order of Honor`
- `category: melee`
- `faction: human`
- `stats`: stronger than peasant-levy across the board — heavy plate,
  trained swordsmen, but still slower than a grunt.
  - `hp: 60` (3x peasant-levy's 20; ~75% of grunt's 80 — they bring
    weight but the grunt still hits harder per-blow).
  - `dps: 8` (vs peasant-levy 3, grunt 12 — solid mid-tier).
  - `speed: 60` (matches grunt; honor-bound knights are armored, not
    fast — but they DO close the gap, hence not slower than levy).
  - `armor: 3` (heaviest infantry armor in the human set so far).
- `cost: { gold: 0, trainTime: 0 }` — fixtures are spawn-side
  (defenders are spawned by waves, the cost block represents human-
  side training; mirrors peasant-levy precedent of zero/zero).
- `sprite: humans/order-of-honor.png`.
- `animations: ['idle', 'walk', 'attack', 'death']`.
- `abilities: ['gate-charge']` — see Decisions §1. This is the
  identifying behavior signal the wave-AI (#67) will read. Empty
  string array would carry no signal; the schema requires
  `z.array(z.string())` so we encode the per-order trait here.
- `unlockRequirement: null`.
- `flavor`: short, in-character zealot line. NOT a Britannian virtue
  pull — game-original phrasing.
- `goldDrop: 12` (3x peasant-levy; rewards the player for breaking a
  charging knight; under grunt-equivalent because humans drop, orcs
  don't).
- `role: 'fighter'` — explicit per AC.

### `src/data/humans/rangers-of-justice.json`

- `id: rangers-of-justice`
- `name: Rangers of Justice`
- `category: ranged` — first ranged human; the schema admits
  `'ranged'` already.
- `faction: human`
- `stats`: glass cannon archers — low HP, no armor, ranged dps.
  - `hp: 30` (1.5x peasant-levy; rangers are skirmishers not levy).
  - `dps: 6` (less than Order of Honor 8 because they fire from
    range — DPS in this codebase is a continuous attack-rate × damage
    abstraction, not range-tagged; we keep it modest to compensate).
  - `speed: 75` (faster than peasant-levy 70 and Order of Honor 60 —
    open-field rank-and-file mobility).
  - `armor: 1` (leather over no-armor fodder).
- `cost: { gold: 0, trainTime: 0 }` — same convention.
- `sprite: humans/rangers-of-justice.png`.
- `animations: ['idle', 'walk', 'attack', 'death']`.
- `abilities: ['volley']` — identifying behavior signal: rank-and-file
  archery. See Decisions §1.
- `unlockRequirement: null`.
- `flavor`: short, in-character. Game-original.
- `goldDrop: 8` (between peasant-levy 4 and Order of Honor 12 — squishy
  but high-value target for the player).
- `role: 'fighter'` — per the issue body's note that rangers are also
  `fighter` with a `category: ranged` distinction.

## Files

- `src/data/humans/order-of-honor.json` — NEW.
- `src/data/humans/rangers-of-justice.json` — NEW.
- `docs/plans/PLAN-59-humans-honor-justice.md` — NEW (this file).

No schema, registry, test, or barrel changes.

## Test strategy

The existing `tests/data/schema-validation.test.ts` exercises
`unitDefSchema` directly; positive cases include a peasant-levy-shaped
human and a kind/role-tagged unit. New fixtures share the
peasant-levy shape (plus `role`), so they ride that coverage. Per
plan-59 scope (data fixtures only), no test edits are required.

End-to-end coverage flows through `pnpm validate:data`, which walks
`src/data/humans/` and parses every JSON against `unitDefSchema`.
Both new files must come back green.

## Verification

1. `pnpm install --frozen-lockfile` — lockfile honored (no new deps).
2. `pnpm typecheck` — clean (no TS changes; sanity gate).
3. `pnpm lint` — clean (no source changes; sanity gate).
4. `pnpm test --run` — green (existing suite unchanged).
5. `pnpm validate:data` — green; both new files reported `✓`.

## Decisions

1. **Behavior signal: encoded via `abilities[]`, not a `behavior`
   field.** The issue's AC mentions "`behavior` / `role` fields
   reflect their per-order traits". The schema (post-#65) does NOT
   define a `behavior` field on `unitDefSchema`. The closest
   available, AI-readable, schema-blessed field is the existing
   `abilities: z.array(z.string())` array — which is already the
   convention for the orc roster (e.g. `grunt.abilities: ['stun']`).
   Per the worker bail rule ("if schema doesn't have a `behavior`
   field but the AC requires it: document the gap and use the closest
   available field; do NOT modify the schema — that's #65's domain"),
   we encode each order's per-virtue trait as a tag inside
   `abilities`:
   - `order-of-honor` → `['gate-charge']` (charges the front gate;
     refuses traps/ambush — the "refuses" half is the absence of a
     `flank` or `ambush` tag, which the wave AI reads as a negative
     filter).
   - `rangers-of-justice` → `['volley']` (rank-and-file archery —
     stays in formation, fires en masse).
   The S1 wave-AI hook (#67) can read `unit.abilities` to dispatch
   per-order behavior. If #67 later wants a dedicated `behavior`
   string, that's a schema PR; this fixture is forward-compatible —
   adding a `behavior: 'gate-charge'` field later is additive and the
   existing `abilities` tag can be dropped or kept as a duplicate.
2. **`role: 'fighter'` for both.** The issue body explicitly notes:
   "Order of Honor likely uses `fighter`; Rangers of Justice may also
   use `fighter` with a `category: ranged` distinction." We follow
   that guidance. `role` is the M2 functional axis, `category` is the
   combat-shape axis — they describe different things and both are
   set explicitly.
3. **No `kind` field.** The `kind` enum (post-#65) is orc-only
   (`grunt | brute | peon | gukka | skowt | mojoka`). There is no
   human kind value, and the field is optional. Adding human kinds
   to the enum is a schema change (#65 territory), so we omit `kind`
   and stay schema-clean.
4. **No `respawnCost`.** Humans don't respawn — they're spawned by
   waves. Mirrors `peasant-levy`.
5. **Stat baselines vs `peasant-levy` (hp 20 / dps 3 / speed 70 /
   armor 0, goldDrop 4):**
   - Order of Honor = +200% HP, +166% DPS, slightly slower (-14%),
     +3 armor, +200% goldDrop. Reads as a heavy melee threat that
     forces the player to deal with the gate, not just kite.
   - Rangers of Justice = +50% HP, +100% DPS, +7% speed, +1 armor,
     +100% goldDrop. Reads as a ranged glass-cannon that's worth
     pushing into via cover/walls.
   These are conservative first-pass numbers; the M2 balancing pass
   will tune them. They're internally consistent (Order of Honor is
   the heavier unit; Rangers of Justice is the squishier-but-faster
   ranged unit).
6. **Sprite paths reference files that don't exist yet.** This
   matches the peasant-levy precedent (`humans/peasant-levy.png` is
   declared but the asset is part of the M2 art track). No regression.
7. **Game-original flavor lines, not Britannian.** Per IP guardrail:
   no UO/Ultima virtue pulls, no Britannian phrasing. Lines are
   short fanatical-zealot snippets in the Crusade voice.
