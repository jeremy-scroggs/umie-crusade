# PLAN-57 — Skowt scout + Mojoka shaman JSON

## Context

Issue #57 (D2 of M2 data) asks for two new orc unit JSON fixtures: the **Skowt**
ranged scout and the **Mojoka** shaman/caster. Issue #65 already extended
`unitDefSchema` to accept the new `kind` enum values (`skowt`, `mojoka`) and the
`role` enum values (`scout`, `caster`), so this work is purely data authoring.

Hero variants of these kinds are explicitly out of scope (D3 #39 and D4 #58
own those JSONs). This issue only seeds the line-orc definitions used by the
roster, build menu, and wave/AI systems downstream.

## Branch

`feat/57-orc-skowt-mojoka`

## Approach

Mirror the shape of `src/data/orcs/grunt.json` (the canonical M1 fixture) and
populate the new optional `kind` / `role` fields per the M2 schema. Pick stats
that are internally consistent with grunt's baseline — grunt is the line
infantry yardstick (`hp 80 / dps 12 / speed 60 / armor 2`).

- **Skowt** — ranged scout, mobile, fragile, bow-style attack. Lower HP,
  higher speed, low melee dps (the bow itself isn't part of stats yet — the
  ranged-attack block lands with combat data in a later issue), zero armor.
  `category: ranged`, `kind: skowt`, `role: scout`.
- **Mojoka** — disciplined caster, frail and rare, very low base dps,
  ability-driven. The actual ability JSONs (totems, casts) are deferred to
  D4 #58 — here we just leave `abilities: []` as a placeholder so the
  fixture validates today and the later issue can append ability ids without
  touching the rest of the file. `category: caster`, `kind: mojoka`,
  `role: caster`.

Both fixtures get `respawnCost` (orcs respawn from the hai), no `goldDrop`
(orcs don't drop gold to themselves), `unlockRequirement: null` for now —
the Urucku-gating that would tie Skowt to Rokgagh and Mojoka to Ghigneh is
a meta-progression concern, not a fixture-shape concern, and lands with the
virtue tree.

## Files

- `src/data/orcs/skowt.json` (new)
- `src/data/orcs/mojoka.json` (new)
- `docs/plans/PLAN-57-orc-skowt-mojoka.md` (this file)

## Test strategy

Run the existing data gate:

- `pnpm validate:data` — must list both new files with a green checkmark.
- `pnpm typecheck` — JSON imports shouldn't change types but cheap to run.
- `pnpm lint` — no JS/TS code touched, but proves no incidental damage.
- `pnpm test` — schema-validation suite already covers the kind/role enums.

## Verification

- Both fixtures parse under `unitDefSchema` (verified via validate:data).
- Stat shape matches grunt baseline (positive hp, non-negative dps, etc.).
- Flavor strings stay inside the Bloodrock canon (orcish from
  `docs/LORE.md` glossary, no UO IP).
- Sprite paths use kebab-case under `orcs/` per CLAUDE.md asset rules.

## Decisions

### Stat reasoning vs grunt baseline (`hp 80 / dps 12 / speed 60 / armor 2`)

**Skowt** (`hp 50 / dps 7 / speed 90 / armor 0`)

- HP ~62% of grunt — scouts go down fast, that's the deal.
- Speed +50% — patient and quick, fires `lursk'a` from cover then repositions.
- DPS lower than grunt's melee — the bow's actual range/damage lands with
  the projectile/combat plumbing; the `dps` field captures the average
  damage output the AI will plan around.
- Armor 0 — no chok, no bone plate, just hides.

**Mojoka** (`hp 40 / dps 4 / speed 55 / armor 0`)

- Lowest HP in the orc roster — `Nub klomp Mojoka` exists because they
  *can* be klomped. Frail by design.
- DPS 4 — base staff/totem strike only; the real damage will come from
  abilities seeded in D4 #58.
- Speed slightly under grunt — disciplined, deliberate, not a runner.
- Armor 0 — robes and totems, not plate.

### Ability placeholders

Mojoka ships with `abilities: []`. Per the issue brief, ability JSONs are
explicitly D4 #58's territory — emitting fake ids here would either fail
schema (if a hero/ability schema appears) or pollute the roster with
references to files that don't exist. Empty array is the conservative move:
schema permits it, downstream code that branches on `role === 'caster'`
can already light up, and the next issue just appends.

Skowt also ships `abilities: []` — its ranged behavior isn't an ability,
it's its base attack, which lives in the combat block (future issue).

### Flavor strings

Pulled from canonical battle cries in `docs/LORE.md` §"Battle Cries":

- Skowt: `"Umies! Klerg jat!"` — exactly the cry the lore tags as the
  Skowt's wave-incoming warning.
- Mojoka: `"Nub klomp Mojoka."` — exactly the line tagged in lore as
  Mojoka unit flavor.

Both are already in the Bloodrock orcish glossary; no new strings invented,
no UO IP touched.
