# PLAN-39 — Skowt hero + ranged ability JSON

## Context

Issue #39 (D3 of M2 data) adds the **Skowt hero** variant — a named,
single-instance ranged hero on top of the line Skowt scout-archer
seeded by issue #57. The work is purely data authoring: a new fixture
under `src/data/heroes/` validated by `heroDefSchema`.

Schema state at dispatch:

- `src/data/schemas/hero.schema.ts` extends `unitDefSchema` with a
  required `ability` block (`id`, `damage`, `radius`, `stunMs`,
  `cooldownMs`, optional `cost.souls`).
- `src/data/schemas/unit.schema.ts` already permits `kind: "skowt"`
  (issue #65) and `role: "scout"`.
- `tools/validate-data.ts` walks every directory in `dataRegistry`,
  including `heroes → heroDefSchema`, so a new file under
  `src/data/heroes/` is picked up with no code changes.

Baselines:

- Line Skowt (`src/data/orcs/skowt.json`): hp 50 / dps 7 / speed 90 /
  armor 0; cost gold 30, trainTime 5; respawn gold 18, time 12;
  `category: ranged`, `kind: skowt`, `role: scout`,
  `sprite: "orcs/skowt.png"`, flavor `"Umies! Klerg jat!"`.
- Existing hero fixture (`src/data/heroes/brute.json`): hp 260 /
  dps 22 / speed 55 / armor 5; cost gold 150, trainTime 12;
  respawn gold 80, time 30; sprite `orcs/brute-hero.png`;
  `animations: ["idle","walk","attack","ability","death"]`;
  ability `clompuk` (damage 30 / radius 64 / stun 1.5s / cd 12s).

## Branch

`feat/39-skowt-hero`

## Approach

Mirror `brute.json` exactly in shape — same field set, same key
ordering — but tune stats and ability for the ranged-precision
fantasy of the Skowt rather than the Brute's tank/stun. The Skowt
hero must clearly out-class the line Skowt on the same axes
(`hp`, `dps`, optionally `armor`) while preserving the scout's
mobility identity.

### Ability shape — "Mark Target" (single-target damage spike)

The issue suggests two starter shapes: "Volley" (line of 3 arrows)
or "Mark Target" (single-target spike). The current `heroAbilitySchema`
is AoE-shaped (`damage` + `radius` + `stunMs`). Both options can be
encoded against it, but Mark Target maps cleanly with `radius: 0` for
a precise kill-shot and uses `stunMs` to model the brief flinch /
command-lost moment. Volley would need to abuse `radius` to approximate
a line, which is a worse fit for the schema and the lore.

Lore alignment from `docs/war-tome.md`:

> *"A skilled Skowt counts his kills not in heads taken but in the
> moments of confusion he creates — the captain dropped before he
> could give the order, the standard-bearer down before the charge
> was joined."*

That is verbatim Mark Target. The ability is named **`klerg-jat`**
(orcish for "war now" / kill-strike — already canon in the Skowt's
warning cry **"Umies! Klerg jat!"**, which doubles as the trigger
shout). It is a high-damage single-target shot with a short stun;
the radius is a small splash so adjacent umies get a faceful of
falling captain rather than a literal AoE. Cooldown is shorter than
Brute's Clomp'uk because the Skowt's tactical impact is per-shot
rather than per-charge.

### Sprite path

`orcs/skowt-hero.png` — mirrors the existing `orcs/brute-hero.png`
convention (heroes live alongside line orcs under the `orcs/`
namespace, suffixed `-hero`). Confirmed against `brute.json` line 9.

## Files

- `src/data/heroes/skowt.json` (new)
- `docs/plans/PLAN-39-skowt-hero.md` (this file, new)

## Test strategy

Pure JSON add. No new test code:

- `pnpm validate:data` — must report `✓ src/data/heroes/skowt.json`.
- `pnpm typecheck` — JSON imports unchanged, but cheap sanity check.
- `pnpm lint` — no JS/TS code touched.
- `pnpm test -- --run` — schema-validation suite already pins the
  hero shape via `tests/data/schema-validation.test.ts`.

## Verification

- New fixture parses under `heroDefSchema` (validated by the script).
- Stats strictly improve on the line Skowt where it matters
  (`hp`, `dps`, `armor`); speed retained at the line Skowt baseline
  (heroes don't need to be faster than their line — the line Skowt is
  already the speed leader at 90).
- Sprite path uses kebab-case under `orcs/` per CLAUDE.md.
- Flavor + ability id stay inside the Bloodrock orcish glossary;
  no Ultima/UO IP touched.

## Decisions

### Ability shape choice — Mark Target

Picked over Volley because:

1. **Schema fit.** `heroAbilitySchema` already gives us `damage` +
   `radius` + `stunMs` — the natural shape of a marked-target spike
   with a small flinch. Volley would need `radius` to stand in for
   "line length", which the schema does not actually mean.
2. **Lore fit.** The war-tome describes the Skowt explicitly as a
   precision killer who picks off captains and standard-bearers.
   Mark Target is that, mechanized. Volley is more of a Howl'r /
   barrage fantasy.
3. **Anti-overlap.** Auto-attacks will already model the Skowt's
   sustained ranged damage when the projectile/combat block lands
   later. The hero's *active* should be a different lever — burst on
   demand, not "more arrows".

`klerg-jat` numbers, calibrated against Brute's `clompuk`
(damage 30, radius 64, stunMs 1500, cooldownMs 12000):

- `damage: 60` — roughly 2× Brute's AoE damage, concentrated on a
  single target. Enough to one-shot most line umies (peasant-levy
  has 20 hp; even a sturdier zealot drops). Models the "captain
  dropped before he could give the order" beat from war-tome.
- `radius: 24` — small splash (~0.75 tile at 32px). The marked
  target gets the full hit; bodies adjacent take the splash from
  panic / the falling target. Distinguishes from a true single-pixel
  hit while staying well short of Brute's 64px AoE.
- `stunMs: 750` — half of Brute's 1500ms. The stun is the target
  flinching from the impact, not a knockdown. Adjacent splash
  inherits the same brief stun, modelling momentary disarray.
- `cooldownMs: 9000` — shorter than Brute's 12s. Skowt's tactical
  impact is per-shot rhythm; a 9s window lets a hero contribute
  one Mark Target per medium wave-tempo without trivializing
  pressure.
- `cost` — omitted. Souls economy isn't plumbed yet (same call as
  PLAN-12 for Brute); the field is optional and we don't price
  placeholders.

### Stats vs line Skowt baseline (`hp 50 / dps 7 / speed 90 / armor 0`)

- **hp 110** (2.2× line). Higher than the line Skowt as required,
  but well below Brute's 260 — the Skowt hero is still a fragile
  precision unit, not a frontline tank.
- **dps 16** (~2.3× line). Beats line on auto-attack output too,
  echoing Brute's ~1.8× over its line counterpart. Lower than
  Brute's 22 — Skowt's damage is back-loaded into the active.
- **speed 90** — kept at the line Skowt baseline. The line Skowt
  is already the roster's speed leader (vs grunt 60 / brute 55);
  bumping it further makes the hero feel non-Skowt. Holding the
  line covers "ranged + scout + mobility" without blowing past the
  archetype.
- **armor 1** (line: 0). Just enough to give the hero a little
  edge survivability over the line; nowhere near Brute's 5.

### Cost vs line Skowt + vs Brute hero

- `cost.gold: 120`, `cost.trainTime: 10`. Below Brute hero's
  `150 / 12` because the Skowt hero is statistically softer and
  shorter-cooldown; clearly above the line Skowt's `30 / 5`.
- `respawnCost.gold: 60`, `respawnCost.time: 25`. Below Brute hero's
  `80 / 30`, above line Skowt's `18 / 12`. Same shape (longer respawn
  + higher cost than line) the AC for hero fixtures requires.

### Identifiers and naming

- `id: "skowt-hero"` — mirrors Brute's `"brute-hero"` so lookups
  can't collide with the line `"skowt"` definition.
- `name: "Skowt"` — same display name as the line; the hero
  is a named member of the kind, not a renamed kind.
- `kind: "skowt"`, `role: "scout"` — same enums as the line, both
  already permitted by the M2 schema (#65). No schema change
  needed.
- `sprite: "orcs/skowt-hero.png"` — kebab-case under `orcs/`,
  matching the `orcs/brute-hero.png` precedent.
- `animations: ["idle","walk","attack","ability","death"]` — same
  set as Brute hero (heroes get the extra `ability` anim).
- `abilities: ["klerg-jat"]` — references the embedded ability id.
- `unlockRequirement: null` — like Brute, available from start.
  The Rokgagh-virtue gating from `docs/LORE.md` §"Urucku" is a
  meta-progression concern that lands with the virtue tree.

### Flavor

`"Umies! Klerg jat!"` — same canon battle cry the line Skowt
already uses (it's the cry that wakes the fort in the war-tome).
Doubles as the trigger shout for the `klerg-jat` ability — the
hero's "war now" is the marked-target kill-shot. No new orcish
words invented; entirely inside the Bloodrock glossary;
no Ultima/UO IP touched.
