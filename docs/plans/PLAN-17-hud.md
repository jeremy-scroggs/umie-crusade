# PLAN-17 — HUD organism (gold, wave, hero HP, skulls + ability + ISE HAI banner)

## Context

Issue #17 asks for a React HUD overlay following atomic design: atoms →
molecules → organism, mounted via `GameLayout`. The HUD subscribes to
`gameStore` for live values — gold (#13), wave number, hero HP, skulls
taken — plus the Clomp'uk hero ability cooldown (#16). On `wave:start` an
"ISE HAI!" banner flashes briefly using the string from #4.

The existing scaffold already has:
- A trivial `HUD.tsx` that renders Gold/Wave/Lives via `ResourcePill`
  (we'll expand it).
- `gameStore` with `gold`, `wave`, `lives`, and a `heroAbility` slice
  ({ cooldownMs, readyAtMs }) from #13/#16.
- `t(key)` + `en.json` with `hud.gold`, `hud.wave`, `hud.skulls`,
  `hud.heroHp`, `battle.waveStart` ("ISE HAI!") already present.
- Atoms: `Button`, `TextInput`, `ResourcePill`. We add `WaveBadge`,
  `SkullCounter`. Molecules: we add `HeroStatus` (HP bar) and
  `AbilityButton` (cooldown).

Missing in the store today: hero current HP, skulls taken, an "ise hai"
transient flag for the banner. These are HUD-driven UI concerns, so we
add an additive HUD slice — the gameStore is shared with #14 so we MUST
add only.

## Branch

`feat/17-hud`

## Approach

### Atomic decomposition

- **atoms**
  - `ResourcePill` (existing) — generic label/value chip; reuse for gold.
  - `WaveBadge` — emphasised wave indicator with the wave number prefix.
  - `SkullCounter` — skull pictogram + count, mobile-friendly.
- **molecules**
  - `HeroStatus` — HP bar + HP number (current/max). Composes a label
    atom + numeric.
  - `AbilityButton` — round 56px button showing Clomp'uk readiness. Dims
    + shows remaining seconds when on cooldown. ≥44px touch target.
- **organism**
  - `HUD` — composes the above; subscribes to `gameStore`. Renders the
    "ISE HAI!" overlay when the transient store flag is true. Mobile-
    first stack with `gap-2` and `flex-wrap`.
- **template**
  - `GameLayout` — already mounts `HUD`. No structural change needed.

### gameStore additions (additive only)

Add to `GameState`:
- `heroHp: number`
- `heroMaxHp: number`
- `skulls: number`
- `waveStartAtMs: number | null` — non-null = banner visible. Cleared by
  the HUD's `useEffect` after `WAVE_START_BANNER_MS`.

Actions:
- `setHero(hp, maxHp)` — set both at once (called by Hero glue, today
  by tests).
- `damageHero(delta)` / `healHero(delta)` — clamp to `[0, maxHp]`.
- `addSkull()` / `setSkulls(n)`.
- `triggerWaveStart(nowMs)` — sets `waveStartAtMs = nowMs`. Pragmatic
  decision: HUD reacts whether or not #10 wires its emitter to this
  action.
- `clearWaveStart()`.
- Extend `reset()` to clear new fields.

### "ISE HAI!" overlay

When `waveStartAtMs !== null`, show a fullscreen-but-non-blocking centred
banner (`pointer-events-none`). The HUD owns a `useEffect` that calls
`clearWaveStart()` after `WAVE_START_BANNER_MS` (a constant in
`src/lib/constants.ts`).

### Strings

All visible copy via `t()`. Existing keys cover the labels. We add ONE
new key, `hud.skullsAria`, to give the skull counter a localised
accessible label. Schema is additive.

## Files

Created:
- `src/ui/atoms/WaveBadge.tsx`
- `src/ui/atoms/SkullCounter.tsx`
- `src/ui/molecules/HeroStatus.tsx`
- `src/ui/molecules/AbilityButton.tsx`
- `tests/ui/atoms/WaveBadge.test.tsx`
- `tests/ui/atoms/SkullCounter.test.tsx`
- `tests/ui/molecules/HeroStatus.test.tsx`
- `tests/ui/molecules/AbilityButton.test.tsx`
- `tests/ui/organisms/HUD.test.tsx`

Modified:
- `src/state/gameStore.ts` — additive slices.
- `src/data/schemas/strings.schema.ts` — add `hud.skullsAria`.
- `src/data/strings/en.json` — add `hud.skullsAria`.
- `src/lib/constants.ts` — add `WAVE_START_BANNER_MS`.
- `src/ui/organisms/HUD.tsx` — full HUD.
- `tests/state/gameStore.test.ts` — cover new slices.

## Test strategy

Testing Library + jsdom (already set up). Pattern from
`tests/ui/organisms/HeroCreateForm.test.tsx`:
- Mock store via `useGameStore.getState().setX(...)`; reset in
  `beforeEach`.
- Atom tests: render with props, assert label/value visible, ≥44px tap
  size present (assert class or aria).
- Molecule tests: HeroStatus reflects 0%/50%/100%; AbilityButton dims
  when `readyAtMs > nowMs`.
- Organism test: render `<HUD />`, set store values, assert all fields.
  Trigger `triggerWaveStart` — banner present; advance timers — banner
  gone.
- gameStore tests: new actions update state; reset clears.

## Verification

- `pnpm typecheck` — no errors.
- `pnpm lint` — clean.
- `pnpm test --run` — all green.
- `pnpm validate:data` — schema/json still match.
- Mobile: tap targets ≥44px (Tailwind `min-h-[44px]` / `h-11 w-11`),
  HUD `flex-wrap` so it doesn't clip at 375px. Visual verification
  deferred to human review per the orchestrator note.

## Decisions

- **gameStore wave-state:** `triggerWaveStart`/`clearWaveStart` live in
  the store rather than waiting for #10's event emitter. The HUD reads
  one source of truth (the store) regardless of who calls it. When #10
  lands, its system calls `getGameStore().triggerWaveStart(nowMs)` from
  its event handler.
- **Banner timing constant** lives in `src/lib/constants.ts` (not data),
  matching existing UI timing constants pattern. Three-second feel.
- **HeroStatus / AbilityButton are molecules** because each composes
  multiple visual primitives (label + bar + value, label + ring +
  countdown) and owns light layout logic. Pure ratio-bar would be an
  atom but the labelling pushes it to molecule.
- **"ISE HAI!" implemented in HUD** (organism) via store flag + effect.
  Simpler than a separate Banner organism for one transient banner.
- **Mobile verification deferred** — agent cannot run a browser. Tests
  assert tap-target classes; visual confirmation is a human checklist
  in the PR.
- **No Phaser bridge changes** — `bridge.ts`'s `getGameStore` is
  sufficient; no new event wiring this issue.
