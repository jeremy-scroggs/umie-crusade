# PLAN-19 — Build panel (wall + ballista, gold-aware, with manual repair)

## Context

Issue #19 wants a React overlay that opens when the player taps an empty
tile and offers wall (`wall-wood`) + ballista (`ballista`) options with
their gold costs. Options dim/disable when gold is insufficient
(reads `gameStore`). When the selection is a damaged wall instead, the
panel surfaces a manual repair action wired to BuildingSystem
(`tryRepairWall`, from #15). Confirming a build calls into BuildingSystem
(`tryPlaceWall`, from #14).

Upstream pieces already merged:
- `src/data/buildings/wall-wood.json` (buildCost.gold=20) and
  `ballista.json` (buildCost.gold=60) — costs read at runtime.
- `gameStore.ts` exposes a `gold` slice + `spendGold(n)`. Selectors only.
- `Button` atom with 44px tap target + disabled styles.
- `t(key)` i18n helper. The build strings are already present in
  `en.json` and the `strings.schema.ts` Zod schema:
  `build.wall`, `build.ballista`, `build.repair`, `build.insufficientGold`.
- `BuildingSystem` exposes `tryPlaceWall(cell)` and `tryRepairWall(cell, hp)`.

Per the orchestrator's notes, this issue intentionally only owns the UI
+ a thin selection slice on `gameStore`. The actual input wiring (which
tile is selected, where the panel anchors physically) is owned by #21
(Input integration). This issue's BuildPanel is OPEN-ABLE based on a
new additive slice (`selectedTile: Cell | null`, `selectedWall: WallSelection | null`),
and exposes prop callbacks (`onConfirmBuild`, `onConfirmRepair`, `onClose`)
that the page-level wiring fills in.

## Branch

`feat/19-build-panel`

## Approach

### Atomic decomposition

- **atom (existing)** `Button` — used for confirm/repair/close actions.
- **molecule (new)** `BuildSlot` — single buildable tile: icon + label +
  gold cost + onClick. Disabled state when not affordable. Mobile tap
  target ≥44px (use min-height).
- **organism (new)** `BuildPanel` — anchored bottom-sheet overlay that
  reads `selectedTile` / `selectedWall` from `gameStore`, renders either
  the build slots or the repair action, plus a close button. Closes on
  Esc keydown or backdrop tap (calls a prop callback `onClose`).

### `gameStore` additive slice

Two thin slices:

```ts
export interface SelectedCell { x: number; y: number; }

export interface SelectedWall {
  /** Grid cell — used by callers when they invoke tryRepairWall. */
  cell: SelectedCell;
  /** Current HP / max HP — used to gate the repair action. */
  hp: number;
  maxHp: number;
}

selectedTile: SelectedCell | null;
selectedWall: SelectedWall | null;

setSelectedTile(cell: SelectedCell | null): void;
setSelectedWall(wall: SelectedWall | null): void;
clearSelection(): void; // clears both
```

`reset()` clears both back to null.

These are deliberately decoupled from the entity layer — the input
system (#21) writes them, the BuildPanel reads them. Other consumers
ignore them.

### Component contract

```ts
interface BuildSlotProps {
  label: string;
  cost: number;
  goldLabel: string;        // localised "Gold" prefix on the cost chip
  affordable: boolean;
  iconSrc?: string;          // optional sprite path; falls back to label initial
  onSelect: () => void;
  insufficientLabel: string; // localised tooltip-like notice when not affordable
}

interface BuildPanelProps {
  /** Localised labels — caller injects via `t()`. */
  labels: {
    wall: string;
    ballista: string;
    repair: string;
    insufficientGold: string;
    goldPrefix: string;
  };
  /** Build options — `cost` from each def's `buildCost.gold` (data-driven). */
  options: Array<{
    id: 'wall' | 'ballista';
    label: string;
    cost: number;
    iconSrc?: string;
  }>;
  /** Confirm a placement. Caller wires to BuildingSystem.tryPlaceWall etc. */
  onConfirmBuild: (id: 'wall' | 'ballista', cell: SelectedCell) => void;
  /** Confirm a repair. Caller wires to BuildingSystem.tryRepairWall. */
  onConfirmRepair: (cell: SelectedCell) => void;
  /** Close handler — callers clear selection slices. */
  onClose: () => void;
}
```

The page-level wiring (`App.tsx` / a future `BattlePage`) builds the
`options` array from the validated wall + ballista defs; the panel itself
reads no JSON. This keeps the data-driven invariant: balance numbers come
from JSON via callers, not hardcoded in the UI.

### Esc + backdrop handling

- Esc: `useEffect` on document keydown listener while a selection is
  open; calls `onClose()`. Cleans up on unmount/selection change.
- Backdrop tap: a backdrop div (`pointer-events-auto`) wraps the panel;
  clicking the backdrop (not the panel) calls `onClose()`. Stop
  propagation on the panel root.

### Gold-aware affordability

`affordable = gold >= cost`. When false:
- Slot is `disabled` and rendered at `opacity-50`.
- Slot shows the `build.insufficientGold` string as `aria-describedby` /
  visible note.
- Click on a disabled slot is a no-op.

### Damaged-wall repair

When `selectedWall != null`:
- Hide build slots; show repair action.
- Repair action is enabled iff `selectedWall.hp < selectedWall.maxHp`
  AND `gold > 0` (we surface a cheap "any gold" check; the actual cost
  for full repair is `(maxHp - hp) * goldPerHp` but the player can repair
  partially from BuildingSystem's caller side — gating on `gold > 0` keeps
  the panel honest without re-deriving cost here).
- Confirm calls `onConfirmRepair(cell)`.

When `selectedTile != null` and `selectedWall == null`: show the build
slots. When both null: panel hidden (returns null).

When both non-null, `selectedWall` wins (repair UX is more specific).

## Files

- `src/state/gameStore.ts` — additive selection slice. (modify)
- `src/ui/molecules/BuildSlot.tsx` — new molecule.
- `src/ui/organisms/BuildPanel.tsx` — new organism.
- `tests/ui/molecules/BuildSlot.test.tsx` — affordable/disabled cases.
- `tests/ui/organisms/BuildPanel.test.tsx` — open/close, options,
  insufficient gold, repair branch.

No JSON additions — strings already exist. No schema additions — keys
already in `strings.schema.ts`.

## Test strategy

`BuildSlot`:
- Renders label + cost + (optional) icon.
- Calls `onSelect` when clicked (affordable=true).
- Disabled + does not call `onSelect` when `affordable=false`.
- Shows insufficient-gold note when not affordable.

`BuildPanel`:
- Returns null when no selection.
- Renders both slots when `selectedTile` set; cost reflects the option
  data (passed in by caller).
- Disables wall slot when gold < wall cost; disables ballista when gold <
  ballista cost; both disabled when gold = 0.
- `onConfirmBuild` fires with the right id + cell for affordable click.
- Backdrop click + Esc fire `onClose`.
- When `selectedWall` set with `hp < maxHp`: shows repair action; clicking
  it fires `onConfirmRepair(cell)`.
- When `selectedWall` set with `hp == maxHp`: repair action disabled (no
  damage to fix).

## Verification

- `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm validate:data`
- Mobile viewport check (375px) deferred to human review.
- No new deps; no edits to build/test config.

## Decisions

1. **Selection slice on gameStore (vs. local state in App)** — The input
   system (#21) and any other callers (e.g. tutorial overlays later) need
   to publish a selection without owning the whole UI tree. A store slice
   is a minimal, additive contract that survives later input wiring.
2. **Prop callbacks (vs. importing BuildingSystem in the panel)** — Keeps
   the organism testable via React Testing Library without spinning up a
   Pathfinding instance or an emitter. The page-level wiring fills the
   callbacks with the actual system calls. Matches the HUD pattern (HUD
   doesn't directly trigger Hero abilities; the glue layer does).
3. **No new icon atom** — Use a small `<img>` element inside `BuildSlot`
   for the optional sprite (mirrors `BloodlineCard`'s portrait approach).
   A dedicated `Icon` atom is over-engineering for two slots.
4. **Repair gates on `gold > 0` only** — The full cost depends on
   `maxHp - hp` × `goldPerHp`, which is system-owned. The system's
   `tryRepairWall` already returns `insufficient-gold`; the panel just
   prevents the obvious zero-gold case so the user gets feedback before
   the system call. Anything finer would duplicate the system's logic.
5. **Both selections present → wall wins** — If the input system ever
   publishes both simultaneously (e.g. tap on a wall on top of an empty
   tile), the more specific repair UX is the right answer.
