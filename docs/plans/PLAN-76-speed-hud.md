# PLAN-76 — Pause / Speed HUD widget

## Context

Issue #76 adds the player-facing speed widget that consumes the
`timeScale` slice landed in #54. The HUD overlay currently composes
atoms (`ResourcePill`, `WaveBadge`, `SkullCounter`) and a molecule
(`HeroStatus`, `AbilityButton`). #54 already exports a single source
of truth — the `TIME_SCALES` tuple `[0, 1, 2, 4] as const` — together
with a guarded `setTimeScale(n)` action. The widget must iterate that
tuple rather than hardcode the values, so adding/removing a speed
preset later is a one-line edit on the gameStore.

The widget is purely a controlled view over the store. `0` is "pause"
(rendered with a pause glyph + the localised "Pause" label); the rest
render as `Nx` labels. Tap targets must clear 44px and the row must
fit within a 375px viewport without wrapping awkwardly.

## Branch

`feat/76-speed-hud`

## Approach

1. **`SpeedButton` atom** (`src/ui/atoms/SpeedButton.tsx`).
   - Pure controlled view: `scale: TimeScale`, `active: boolean`,
     `label: string`, `ariaLabel: string`, `onSelect(): void`.
   - Renders a `<button>` with `min-h-[44px]` AND `min-w-[44px]` so
     a single icon (the pause glyph) still hits the 44px guidance.
   - Active state visually distinct: filled crimson background +
     `aria-pressed="true"`. Inactive uses the ghost/outline chrome
     consistent with `Button.tsx` ghost variant.
   - Renders a U+23F8 pause glyph for `scale === 0`; otherwise the
     caller-supplied `label`.

2. **`SpeedControl` molecule** (`src/ui/molecules/SpeedControl.tsx`).
   - Reads `timeScale` and `setTimeScale` from `useGameStore`.
   - Imports `TIME_SCALES` from gameStore and `.map()`s it into
     `SpeedButton` instances. Iteration order is the tuple order.
   - Owns the label-mapping policy: `0 -> t('hud.speed.pause')`,
     `1/2/4 -> t('hud.speed.<n>x')`. Aria labels likewise localised.
   - Wraps the buttons in a flex row with `gap-1` so the four 44px
     buttons (≈ 4×44 + 3×4 = 188px) fit comfortably under 375px.
   - Accessible region: `role="group"` + `aria-label`.

3. **HUD organism integration** (additive).
   - Compose `<SpeedControl />` into the existing top-row flex
     container so it shares the same wrap-on-narrow behaviour as the
     resource pill / wave badge / skull counter / hero status.

4. **i18n keys (additive).**
   - Add to `src/data/strings/en.json` and the strings Zod schema:
     - `hud.speed.pause`        — "Pause"
     - `hud.speed.pauseAria`    — "Pause"  (icon-only screen-reader label)
     - `hud.speed.1x`           — "1×"
     - `hud.speed.2x`           — "2×"
     - `hud.speed.4x`           — "4×"
     - `hud.speed.groupAria`    — "Game speed"
   - The pause glyph is a unicode char so the visible label and the
     accessible name diverge — one localised string for each.

5. **No new constants module needed.**
   - The 44px tap target is already established in sibling atoms via
     the Tailwind `min-h-[44px]` class. Reusing the existing pattern
     keeps the widget consistent without introducing a new exported
     constant for a CSS class string.

## Files

Order of edits:

1. `src/data/schemas/strings.schema.ts` — add the six new keys.
2. `src/data/strings/en.json` — add the six new key/value pairs.
3. `src/ui/atoms/SpeedButton.tsx` — new atom.
4. `src/ui/molecules/SpeedControl.tsx` — new molecule.
5. `src/ui/organisms/HUD.tsx` — render `<SpeedControl />` in the top row.
6. `tests/ui/atoms/SpeedButton.test.tsx` — new.
7. `tests/ui/molecules/SpeedControl.test.tsx` — new.
8. `tests/ui/organisms/HUD.test.tsx` — extend with one assertion that
   `SpeedControl` is rendered inside the HUD.

PROTECTED files untouched: vitest/vite/tsconfig/eslint/tailwind/setup.

## Test strategy

- **Atom (`SpeedButton.test.tsx`)**:
  - Renders the supplied label.
  - Has `min-h-[44px]` AND `min-w-[44px]` classes for tap-target.
  - `aria-pressed` reflects `active`.
  - Click invokes `onSelect`.
  - Pause glyph appears for `scale === 0`.

- **Molecule (`SpeedControl.test.tsx`)**:
  - Renders one button per `TIME_SCALES` entry (4 buttons).
  - The button matching the current `timeScale` is `aria-pressed=true`,
    others `false`.
  - Clicking a button calls `setTimeScale` with the matching value
    (verified by reading the store after the click).
  - Pause button uses the `Pause` label, others render as `1×`/`2×`/`4×`.
  - Group is exposed under `role="group"` with the localised aria label.

- **Organism (`HUD.test.tsx`)**: smoke-level — assert that the speed
  group is present after a default `<HUD />` render.

Visual mobile-viewport verification cannot be exercised in the worker
(no browser); it is deferred to human review.

## Verification

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm validate:data
```

All four must be green. Mobile-viewport visual check (375px) deferred
to human; the unit tests assert tap-target classes, render correctness,
active-state, and click semantics.

## Decisions

1. **Iterate `TIME_SCALES` in the molecule.** Hardcoding `[0, 1, 2, 4]`
   in the widget would duplicate the policy already living in
   `gameStore.ts`. The molecule is the only place that maps a tuple
   entry to a label/aria string, keeping the atom pure.

2. **Atom does NOT read the store.** `SpeedButton` is a pure controlled
   view (the molecule passes `active` + `onSelect`). This mirrors
   `AbilityButton` and keeps atoms framework-agnostic and trivially
   testable without store setup.

3. **Pause uses unicode glyph + Label.** The label text `"Pause"` is
   shown next to the glyph rather than glyph-only, so a screen reader
   user does not need the `aria-label` to disambiguate. The glyph is
   `aria-hidden`. This is deliberately more verbose than glyph-only —
   accessibility wins over absolute compactness on a 375px target,
   and four 44px buttons fit at ~188px so we have headroom.

4. **`aria-pressed` for active state.** Toggle-button semantics fit
   better than `aria-current` here because the user is not navigating
   between distinct destinations — they are setting a single mutually-
   exclusive property. Each button is independently a "pressed/not"
   toggle, and exactly one is pressed at a time. Tested via attribute.

5. **No new lib constant for 44px.** The class literal `min-h-[44px]`
   is the established pattern across sibling atoms; introducing a
   shared constant for a Tailwind class string is over-engineering
   and would require a Tailwind safelist entry. Add later if the
   value is referenced from JS (it isn't today).

6. **No new molecule barrel.** The molecule directory has no
   `index.ts`; we follow the existing per-file import pattern.
