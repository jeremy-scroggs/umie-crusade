# PLAN-56 — Audit `public/data/maps/m1-slice.json` duplicate

## Context

Issue #56. M1 wave 2 (#5) introduced `public/data/maps/m1-slice.json`
alongside the pre-existing `src/data/maps/m1-slice.json`. The same
duplication exists for `placeholder.json`. We need to confirm whether
both are load-bearing and either delete the dead copy or document why
they must coexist.

## Branch

`feat/56-maps-audit`

## Approach

Audit findings (from `grep -r "m1-slice"` + reading the codebase):

1. **`public/data/maps/m1-slice.json` — runtime-loaded by Phaser.**
   `src/game/scenes/PreloadScene.ts` line 10 calls
   `this.load.tilemapTiledJSON('m1-slice', 'data/maps/m1-slice.json')`.
   Vite serves the `public/` directory at root, so the bare path
   `data/maps/m1-slice.json` resolves to `public/data/maps/m1-slice.json`.
   `placeholder.json` is loaded the same way on line 9.

2. **`src/data/maps/m1-slice.json` — imported as a TS JSON module.**
   - `src/game/scenes/scene-bootstrap.ts` line 43:
     `import m1Slice from '@/data/maps/m1-slice.json';`
   - `tests/data/m1-slice.test.ts` line 2
   - `tests/game/systems/Pathfinding.test.ts` line 5
   - `tests/game/scenes/sprite-binder.test.ts` line 27
   - `tests/integration/m1-smoke.test.ts` line 26

3. **Both files are byte-identical.** `diff` reports no differences.

**Conclusion:** Both copies are load-bearing — the `public/` copy for
Phaser's runtime fetch, the `src/data/` copy for typed JSON imports
used by `scene-bootstrap` and 4 test suites. Neither can be deleted
without breaking the build or tests. The duplication is a real cost
(two files to keep in sync) but is structurally required by the split
between Phaser's loader (URL-based) and TypeScript's import system
(module-graph based).

Action: leave both files in place; add a short note in
`docs/ARCHITECTURE.md` near the existing tile-size-lock section
explaining the duplication and why it must stay.

The same reasoning applies to `placeholder.json`, so the docs note
covers both files (any future map added to the bundle will need the
same dual-copy treatment).

## Files

- **Modify:** `docs/ARCHITECTURE.md` — add a "Map JSON dual-copy"
  section explaining the duplication.
- **Add:** `docs/plans/PLAN-56-maps-audit.md` (this file).
- **Delete:** none.

## Verification

```
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm validate:data
pnpm build
```

All five must pass green; nothing about the audit should change runtime
behavior.

## Decisions

- **Keep both copies.** Both are load-bearing; deleting either breaks
  the runtime or the tests. Verified by grepping every reference and
  by reading `PreloadScene.ts` (uses URL load → `public/`) plus the
  test suite (uses TS imports → `src/data/`).
- **Document, don't dedupe.** A symlink or build-time copy would be a
  larger refactor and is explicitly out of scope for this issue. If a
  future change wants to single-source the JSON, the natural follow-up
  would be a Vite plugin or a `prebuild` script that copies
  `src/data/maps/*.json` into `public/data/maps/`.
- **Audit scope confirmed.** No other `public/data/` duplicates exist
  beyond `m1-slice.json` and `placeholder.json` (only `public/data/maps/`
  contains files; `public/assets/placeholder-tileset.png` has no
  `src/` twin).
