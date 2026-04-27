# PLAN-58 — Mojoka hero + totem ability

## Context

Issue #58 adds a Mojoka hero variant alongside the line Mojoka caster shipped
in #57. The hero gets an active, totem-based ability that fits the Tra-avatar
fantasy from `docs/LORE.md`.

- Schema: `src/data/schemas/hero.schema.ts` — `heroDefSchema = unitDefSchema.extend({ ability })`,
  where `ability` = `{ id, damage, radius, stunMs, cooldownMs, cost? }` (all
  numbers nonnegative, `id` non-empty).
- Sibling fixture: `src/data/heroes/brute.json` (Brute hero, "clompuk"
  ability — radius 64, stunMs 1500, cooldownMs 12000, damage 30).
- Line fixture: `src/data/orcs/mojoka.json` — hp 40, dps 4, speed 55,
  armor 0, caster, `kind: mojoka`, `role: caster`.
- Hero is loaded by the registry via `src/data/heroes/*.json` and validated
  by `tools/validate-data.ts` + `tests/data/schema-validation.test.ts`.

## Branch

`feat/58-mojoka-hero` (off main `cf7f5d8`).

## Approach

Mirror the shape of `brute.json` exactly. Author one new file:

- `src/data/heroes/mojoka.json`

Stats: stronger than the line Mojoka but still the frail-mage shape (hp ~ 1.6x,
dps ~ 1.75x, same speed, +1 armor). Keep her well below Brute's tank profile
(260/22/55/5).

Ability: a totem with a damage burst on drop and a longer cooldown than the
Brute. The schema only models `damage / radius / stunMs / cooldownMs`, so the
totem fantasy is expressed through the ability `id` and the strings (the
hero's `flavor` and the ability `id`). No schema extension this issue —
issue #58 is JSON-only.

## Files

- `src/data/heroes/mojoka.json` — new.
- `docs/plans/PLAN-58-mojoka-hero.md` — this plan.

## Test strategy

- `pnpm validate:data` — Zod-validates every JSON file under `src/data/`,
  including the new `heroes/mojoka.json` against `heroDefSchema`.
- `pnpm typecheck` — confirms JSON typing stays clean (heroes are imported
  via JSON modules elsewhere; this run is precautionary).
- `pnpm test` — re-runs `tests/data/schema-validation.test.ts` hero suite to
  guard the schema shape did not regress.
- `pnpm lint` — sanity.

## Verification

- `src/data/heroes/mojoka.json` validates.
- Ability id/flavor reads as Bloodrock orcish, no UO IP.
- Stats stronger than line Mojoka, weaker than Brute (caster shape).
- `pnpm validate:data` green.

## Decisions

### Stat tuning

| Field | Line Mojoka | Hero Mojoka | Reason |
|---|---|---|---|
| hp | 40 | 65 | +62%; still fragile vs Brute 260 |
| dps | 4 | 7 | +75%; caster auto-attack stays weak |
| speed | 55 | 55 | unchanged — Mojoka are not fast |
| armor | 0 | 1 | a single point; Brute has 5 |
| cost.gold | 60 | 140 | between Brute (150) and line Mojoka (60) |
| cost.trainTime | 8 | 12 | matches Brute hero |
| respawnCost.gold | 35 | 75 | scaled with cost |
| respawnCost.time | 18 | 30 | matches Brute hero |

### Ability — "Wargh Totem"

Lore: a small Krull'nuk-marked totem that the Mojoka plants. The Tra
"answer" with a green burst that staggers nearby umies; the totem then
keeps the spot marked for the duration (gameplay layer that consumes
`stunMs` and `radius` will be implemented later — JSON-only now).

| Field | Value | Reason |
|---|---|---|
| `id` | `"wargh-totem"` | kebab-case; "wargh" is invented orcish (no UO IP) |
| `damage` | `18` | burst on plant; lower than Brute's 30 |
| `radius` | `96` | larger AoE than Brute's 64 — caster shape |
| `stunMs` | `1000` | shorter daze than Brute's 1500 |
| `cooldownMs` | `15000` | 25% longer than Brute's 12000 — heavier mojo |

No `cost.souls` this milestone — leave the optional field unset until the
souls economy lands.

### Naming + flavor

- Hero `id`: `"mojoka-hero"` (mirrors `"brute-hero"`).
- Hero `name`: `"Mojoka"` (matches Brute / Mojoka label convention).
- `category`: `"caster"`.
- `kind`: `"mojoka"` (M2 taxonomy; was added by #65).
- `role`: `"caster"`.
- `sprite`: `"orcs/mojoka-hero.png"` (kebab-case, namespaced).
- `animations`: `["idle", "walk", "attack", "ability", "death"]` —
  matches Brute hero (adds `"ability"` over the line Mojoka).
- `abilities`: `["wargh-totem"]` — string ref to the ability id.
- `flavor`: `"Tra plak'sh, umie blud."` — invented orcish meaning roughly
  "Tra take, umie blood." Uses canonical lore words: Tra, umie, blud.
- `unlockRequirement`: `null` (gated by Urucku #5 Ghigneh in meta-progression
  later; null today matches Brute hero).
