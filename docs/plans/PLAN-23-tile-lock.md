# PLAN-23 — Lock TILE_SIZE = 32 + document rationale

## Context

Issue #23 is the FINAL M1 issue. Per `docs/PROJECT_PLAN.md` §0 the tile
size has been deferred ("prototype at 32×32, lock by end of M1") and
§7.1 frames the rationale ("code is tile-size-agnostic; one config
value"). This issue converts the deferred decision into a locked one,
puts the constant in its proper home (`src/game/config/tile.ts`), and
adds an `ARCHITECTURE.md` section capturing decision / rationale /
revisit conditions.

The codebase already obeys the tile-size-agnostic rule — `Pathfinding`
reads `tilewidth` / `tileheight` off the parsed Tiled map; tests pass
`32` as a fixture value, not as game balance. The only runtime use of
the literal `TILE_SIZE` constant today is `GameScene.ts` for the
pointer→cell math in M0's tap-to-add-gold proof of concept.

## Branch

`feat/23-tile-lock`

## Approach

### 1. Move `TILE_SIZE` to its proper home

Create `src/game/config/tile.ts` exporting:

```ts
export const TILE_SIZE = 32 as const;
export const TILE_HALF = TILE_SIZE / 2;
```

`as const` narrows the type to the literal `32`, signalling "locked
config value, not a knob". `TILE_HALF` is included because it's the
common "centre of cell" offset that every entity-spawn site computes
inline today (or via the existing `0.5` literal in systems). Cheap to
export now even if no caller uses it yet — it costs nothing and the
file is the right home.

`src/lib/constants.ts` keeps `VIRTUAL_WIDTH` / `VIRTUAL_HEIGHT` /
`MAP_COLS` / `MAP_ROWS` / `WAVE_START_BANNER_MS` (UI / canvas-shape
concerns, not tile-shape). It re-exports `TILE_SIZE` from the new
config module so existing imports do not break, but the new
`src/game/config/tile.ts` becomes the canonical source.

Rationale: the directory `src/game/config/` is what the issue body
calls out, and PROJECT_PLAN §3 keeps "balance numbers" in
`src/data/`. Tile size is neither balance (it's a structural config
constant) nor a UI-canvas dim — it's a game-engine config value, and
`src/game/config/` is its right home. Re-export keeps the diff small.

### 2. Audit `32` literals — replacement criterion

Run `git grep -nP '\b32\b' src/`. Each hit graded by hand:

| File | Hit | Action | Rationale |
|---|---|---|---|
| `src/lib/constants.ts:1` | `TILE_SIZE = 32` | Replace with re-export from new config | Source of truth moves to `src/game/config/tile.ts` |
| `src/data/maps/m1-slice.json` (multiple) | `tilewidth`/`tileheight`/object width/height = 32 | LEAVE | Tiled JSON format requires concrete numeric values; data files cannot import TS constants |
| `src/data/maps/placeholder.json` (multiple) | same as above | LEAVE | Same Tiled-format requirement |
| `src/ui/molecules/HeroStatus.tsx:43` | `sm:w-32` | LEAVE | Tailwind utility class — `w-32` is `width: 8rem`, not 32px and not a tile dim |

Tests (`tests/data/m1-slice.test.ts`, `tests/game/systems/*.test.ts`)
use `32` as fixture values. Per the issue's notes ("no regression in
M1 smoke #22") and the existing pattern (`AI.test.ts` line 212
`aggroRadius: 4 * 32`), these are deliberate fixture inputs documenting
the test scenario. Replacing them with `TILE_SIZE` would arguably be
nicer but is outside the AC — the AC says "no `32` literal in
tile-dimension contexts outside the config" in `src/`, not tests, and
the tests are already tile-size-agnostic where it matters (e.g.
`Pathfinding` reads `map.tilewidth`). LEAVE tests untouched.

Consequence: zero source-code substitutions. The audit is
satisfied by relocating the canonical `TILE_SIZE` and verifying no
other tile-dim 32 literals exist in `src/`.

### 3. Document in `docs/ARCHITECTURE.md`

Create `docs/ARCHITECTURE.md`. Sections:

- Title + 1-paragraph framing (links to PROJECT_PLAN).
- "Tile size lock" with three sub-sections:
  - **Decision**: 32 × 32 px, locked end of M1.
  - **Rationale**: fidelity vs. perf vs. artist pipeline. Phaser
    `pixelArt: true` already configured; 32 px is the dominant indie
    pixel-art density for orcish/medieval tilesets and aligns with
    the Tiled map already shipped in `src/data/maps/m1-slice.json`.
    Performance: at 1280×720 virtual canvas the visible grid is 40 ×
    22.5 tiles — comfortably within mobile GPU budgets even with
    overlay sprites and projectiles.
  - **Revisit conditions**: only re-open if (a) artist pipeline
    delivers a complete asset set at a different size, (b) playtest
    feedback reveals readability problems on small screens that
    sub-pixel scaling can't fix, or (c) a tooling change makes
    16 × 16 cheaper to author. Code remains tile-size-agnostic in
    both cases — the lock affects assets and PROJECT_PLAN, not
    runtime systems.

Total length: ~250 words. Under the 500-word cap noted in the
orchestrator brief.

## Files

- **New** `src/game/config/tile.ts` — `TILE_SIZE`, `TILE_HALF`.
- **Modified** `src/lib/constants.ts` — drop the local `TILE_SIZE`
  declaration, re-export it from `@/game/config/tile`. No behavioural
  change for downstream importers.
- **New** `docs/ARCHITECTURE.md` — tile-size lock section.
- **Modified** `docs/PROJECT_PLAN.md` — flip the "Deferred" entry in
  §0 to "Locked" and add a one-line pointer to ARCHITECTURE.md. §7.1
  similarly updated to reflect the locked status.

## Test strategy

No new tests — the issue is a constant relocation + docs. Existing
tests guarantee no regression:

- `tests/integration/grep-guard.test.ts` already enforces no
  hardcoded literals in `src/game/systems/`. Our changes don't touch
  systems code, so the guard stays green.
- `tests/integration/m1-smoke.test.ts` exercises every M1 system end
  to end. If the re-export breaks import resolution, the smoke fails
  fast.
- `tests/data/m1-slice.test.ts` validates Tiled-format `32`s remain
  intact — useful sanity that we didn't accidentally rewrite map
  data.

Verification: `pnpm typecheck && pnpm lint && pnpm test -- --run &&
pnpm validate:data`. All 306 tests must pass.

## Verification

1. `git grep -nP '\b32\b' src/` shows only the canonical declaration in
   `src/game/config/tile.ts`, the re-export in `src/lib/constants.ts`,
   the Tailwind class in `HeroStatus.tsx`, and the Tiled JSON files.
2. `git grep -nP '\bTILE_SIZE\b' src/` shows the new config file and
   the existing `GameScene.ts` import (now resolved through the
   re-export).
3. `docs/ARCHITECTURE.md` exists with the three required subsections.
4. `pnpm test -- --run` returns the same 306-pass count as pre-change.

## Decisions

- **Tiled JSON `32`s left as-is.** The Tiled map format requires
  literal numeric `tilewidth` / `tileheight` fields; JSON cannot
  import TS constants. If we ever change `TILE_SIZE`, we regenerate
  the maps from Tiled — that's the artist-pipeline path, not a
  code-side concern.
- **Canvas resolution `1280 × 720` left as literals.** Yes, those
  are 40 × 22.5 tiles, but the canvas size is a Phaser-virtual-screen
  concern (Scale.FIT mode) independent of the tile-size lock. Mixing
  them would couple two unrelated configs.
- **Test fixture `32`s left as literals.** Tests assert specific
  pixel values (`expect(byName['spawn-south'].y).toBe(22 * 32)`)
  documenting the on-disk map; rewriting them with `TILE_SIZE` would
  be cosmetic and risks confusing the test's "this fixture lives at
  these pixel coords" intent.
- **Grep-guard interaction**: the guard scans
  `src/game/systems/*.ts`. Our changes touch `src/game/config/`,
  `src/lib/`, and `docs/` — none of which the guard sees. No
  whitelist update needed.
- **`TILE_HALF` exported speculatively.** Cheap, idiomatic, gives
  future entity-placement code a single import for "centre of cell"
  math.
