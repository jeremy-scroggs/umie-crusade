# PLAN-60 — humans: Knights of Valor + Paladins of Compassion JSON

## Context

Issue #60 ships two more human unit fixtures from the Umie Orders, the
sequel to #59 (Order of Honor + Rangers of Justice):

- **Knights of Valor** — virtue: Valor. Charge until they die; high HP,
  no retreat. (Per `docs/LORE.md` §"The Umie Crusade" and
  `docs/PROJECT_PLAN.md` §4.2.) The tankiest human melee in the M2
  roster.
- **Paladins of Compassion** — virtue: Compassion. Healers in train,
  refuse to leave wounded. The first human healer fixture.

Anchor state:

- Schema: `src/data/schemas/unit.schema.ts` — single shared
  `unitDefSchema` for orcs and humans, faction discriminator. Optional
  `kind`/`role` enums (#65). The `category` enum admits `'healer'`,
  which Paladins of Compassion will use. The `role` enum is
  `fighter | builder | gatherer | caster | scout` — no `healer` role
  exists; healers map to `role: 'caster'` as the closest non-combat
  support functional bucket (decision §2 below).
- Existing human roster: `peasant-levy.json` (fodder), `order-of-honor.json`
  (melee fighter), `rangers-of-justice.json` (ranged fighter) — D5 just
  landed and established the per-order behavior-tag-in-`abilities[]`
  convention. We mirror it.
- Validator: `tools/validate-data.ts` walks `src/data/humans/` against
  `unitDefSchema` via `dataRegistry`. Two new files drop in
  automatically.
- Naming: kebab-case + namespaced sprite (`humans/<slug>.png`).

## Branch

`feat/60-humans-valor-compassion`

## Approach

Author two new JSON files only. No schema changes (that is #65's
domain), no system code, no AI behavior wiring (that is S1 / #67).
Mirror the D5 fixture shape exactly: `cost: { gold: 0, trainTime: 0 }`,
no `respawnCost`, no `kind`, explicit `role`, behavior tag in
`abilities[]`, game-original flavor.

### `src/data/humans/knights-of-valor.json`

- `id: knights-of-valor`
- `name: Knights of Valor`
- `category: melee`
- `faction: human`
- `stats`: tankiest human melee — high HP, no-retreat conviction
  encoded as a HP buff over Order of Honor.
  - `hp: 90` (1.5x Order of Honor's 60; +13% over orc grunt's 80 —
    these are the heaviest plate humans field, sized to feel like the
    wall the player has to crack).
  - `dps: 10` (vs Order of Honor 8; higher than Order of Honor because
    Knights are elite, but lower than grunt's 12 — humans hit slightly
    softer per blow than top-tier orcs across the roster).
  - `speed: 55` (slightly slower than Order of Honor's 60 — heavier
    plate, slower close).
  - `armor: 4` (heaviest infantry armor in the human set; +1 over
    Order of Honor 3).
- `cost: { gold: 0, trainTime: 0 }` — fixtures are spawn-side
  (defenders are spawned by waves). Mirrors peasant-levy / Order of
  Honor / Rangers of Justice precedent.
- `sprite: humans/knights-of-valor.png`.
- `animations: ['idle', 'walk', 'attack', 'death']`.
- `abilities: ['no-retreat']` — see Decisions §1. The wave-AI (#67)
  reads this tag to suppress the retreat-on-low-HP branch for this
  unit, matching lore "charge until they die".
- `unlockRequirement: null`.
- `flavor`: short, in-character zealot line. Game-original.
- `goldDrop: 18` (1.5x Order of Honor 12; rewards the player for
  breaking the elite knight; below grunt-equivalent because humans
  drop, orcs don't).
- `role: 'fighter'`.

### `src/data/humans/paladins-of-compassion.json`

- `id: paladins-of-compassion`
- `name: Paladins of Compassion`
- `category: healer` — the schema admits `'healer'` already; first
  human healer fixture.
- `faction: human`
- `stats`: medium-bodied support — better than peasant-levy, well
  below Knights of Valor; carries armor because they're plated
  paladins, but their identity is healing not damage.
  - `hp: 50` (between peasant-levy 20 and Order of Honor 60; below
    Knights of Valor 90 — healers should die before knights when
    focused).
  - `dps: 4` (above peasant-levy 3, well below Order of Honor 8 —
    paladins fight in self-defense; healing is their job).
  - `speed: 65` (faster than Order of Honor 60, slower than rangers
    75 — healers keep up with the line, prefer escorting wounded).
  - `armor: 2` (plated, but lighter than Order of Honor 3).
- `cost: { gold: 0, trainTime: 0 }`.
- `sprite: humans/paladins-of-compassion.png`.
- `animations: ['idle', 'walk', 'attack', 'death']`.
- `abilities: ['heal', 'escort-wounded']` — see Decisions §1. `heal`
  is the active healing tag; `escort-wounded` is the AI-readable
  behavior tag that S1 (#67) reads to make this unit prefer staying
  with low-HP allies over advancing.
- `unlockRequirement: null`.
- `flavor`: short, in-character. Game-original.
- `goldDrop: 14` (between Order of Honor 12 and Knights of Valor 18;
  high-priority target because killing them stops healing — but not
  the highest because they're squishier).
- `role: 'caster'` — see Decisions §2.

## Files

- `src/data/humans/knights-of-valor.json` — NEW.
- `src/data/humans/paladins-of-compassion.json` — NEW.
- `docs/plans/PLAN-60-humans-valor-compassion.md` — NEW (this file).

No schema, registry, test, or barrel changes.

## Test strategy

The existing `tests/data/schema-validation.test.ts` exercises
`unitDefSchema` directly; positive cases include human-shaped
fixtures. New fixtures share the established human shape (plus
`role`), so they ride that coverage. Per plan-60 scope (data fixtures
only), no test edits are required.

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
   field.** Same convention PLAN-59 established. The schema (post-#65)
   does NOT define a `behavior` field on `unitDefSchema`. The closest
   schema-blessed, AI-readable field is `abilities: z.array(z.string())`,
   already used by D5 sibling fixtures (`gate-charge`, `volley`).
   We encode each order's per-virtue trait as a tag inside `abilities`:
   - `knights-of-valor` → `['no-retreat']` — the wave AI (#67) reads
     this to disable the standard retreat-on-low-HP branch, matching
     "charge until they die".
   - `paladins-of-compassion` → `['heal', 'escort-wounded']` —
     `heal` is the active ability tag (mirrors orc roster style), and
     `escort-wounded` is the per-order behavior tag the wave AI reads
     to prefer trailing low-HP allies over front-line advance.
   The S1 wave-AI hook (#67) can read `unit.abilities` to dispatch
   per-order behavior. Forward-compatible with a future `behavior`
   schema field — the new field is additive, the existing tags can be
   dropped or kept as duplicates.
2. **`role: 'fighter'` for Knights, `role: 'caster'` for Paladins.**
   Knights of Valor are pure melee combatants — `'fighter'` is the
   exact match. Paladins of Compassion are healers; the `role` enum
   does NOT include `'healer'` (it's `fighter | builder | gatherer |
   caster | scout`). `'caster'` is the closest available non-combat
   support functional bucket — paladins channel healing, which is a
   caster-shaped action (target an ally, apply effect, cooldown). The
   `category: 'healer'` field carries the combat-shape signal
   distinctly from the functional `role`. If the schema later adds a
   `'healer'` role, the migration is a one-line update; until then,
   `'caster'` is the conservative documented choice and the AC's
   "Stats differentiated from D5 humans" is satisfied either way.
3. **No `kind` field.** The `kind` enum (post-#65) is orc-only. No
   human kind value, field is optional, omit and stay schema-clean.
4. **No `respawnCost`.** Humans don't respawn — they're spawned by
   waves. Mirrors `peasant-levy` / Order of Honor / Rangers of
   Justice.
5. **Stat baselines vs D5 humans (Order of Honor: hp 60 / dps 8 /
   speed 60 / armor 3 / goldDrop 12; Rangers of Justice: hp 30 / dps
   6 / speed 75 / armor 1 / goldDrop 8):**
   - Knights of Valor = +50% HP, +25% DPS, -8% speed, +33% armor,
     +50% goldDrop vs Order of Honor. Reads as the elite-tier melee
     successor — slower, tankier, hits harder.
   - Paladins of Compassion = different axis entirely — `category:
     healer`, mid-tier HP, low DPS, mid-speed. Distinguished from D5
     humans by being the first non-`fighter` role and the first
     `healer` category in the roster. Stats are clearly differentiated
     (per AC).
   These are conservative first-pass numbers; the M2 balancing pass
   will tune them. They're internally consistent — Knights are the
   heaviest melee, Paladins are the squishier-but-supportive healer.
6. **Sprite paths reference files that don't exist yet.** Matches
   peasant-levy / Order of Honor / Rangers of Justice precedent (M2
   art track). No regression.
7. **Game-original flavor lines, not Britannian.** Per IP guardrail:
   no UO/Ultima virtue pulls, no Britannian phrasing, no Shadowlord
   refs. Lines are short fanatical-zealot snippets in the Crusade
   voice.
