# PLAN-27 — Require emitter on WaveSystem

## Context

Issue #27 (soft blocker surfaced by #22's M1 integration smoke). `WaveSystem`
currently accepts an **optional** `emitter` and falls back to a fresh local
`SimpleEventEmitter` when one isn't provided. Lifecycle events (`wave:start`,
`wave:complete`, `run:won`, `run:lost`) emitted into that private emitter
fire into the void — no scene listener, no economy hook, no HUD.

The smoke worker (#22) already paid this tax once: the first wired pass of
`tests/integration/m1-smoke.test.ts` failed silently until `emitter: bus` was
threaded explicitly. The next integrator (#26 GameScene wiring) would hit the
same trap.

## Branch

`feat/27-wave-emitter`

## Approach

**Option A (recommended in the issue) — make `emitter` required.**

Rationale:
- One trap, one fix. Optional + warning (Option B) only nags; it doesn't stop
  a release build from shipping with a silent drop.
- The "shared bus" is already the only sane wiring — every other system
  (`Pathfinding`, `BuildingSystem`, `DamageSystem`, `Economy`) is constructed
  with a bus. Aligning `WaveSystem` removes a special case.
- Cost is cheap: 12 test sites + 1 smoke caller. Production has no callers
  yet (no `GameScene` wiring landed).
- TS will catch every missed call site at compile time — no runtime hunt.

The `emitter` property on `WaveSystem` stays public and read-only; downstream
code that subscribes via `sys.emitter.on(...)` continues to work unchanged.

## Files

1. `src/game/systems/Wave.ts`
   - `WaveSystemOptions.emitter`: drop the `?` — make it required.
   - Constructor: `this.emitter = opts.emitter` (no fallback).
   - Drop the now-unused `SimpleEventEmitter` import.
   - Update the JSDoc on the field to drop the "defaults to" wording and
     note the required-bus rationale.

2. `tests/game/systems/Wave.test.ts`
   - 12 `new WaveSystem({ ... })` sites currently omit `emitter`. Each
     constructs its own listeners off `sys.emitter`, which means a quick
     pattern works: build a `const bus = new SimpleEventEmitter()` per test,
     pass `emitter: bus`, and listen on `bus` (or keep `sys.emitter` since
     `sys.emitter === bus` after the change). I'll go with the tighter
     "create bus per test, pass it, listen on it" form to mirror how
     production will wire.
   - Alternative considered: just pass `emitter: new SimpleEventEmitter()`
     inline. Less explicit but identical behavior. Picking the named-bus
     form for clarity.

3. `tests/integration/m1-smoke.test.ts`
   - Already passes `emitter: bus`. Verify no change needed.

4. Anything else surfaced by `git grep -n "new WaveSystem"`. Confirmed: only
   the two files above (12 + 1 = 13 sites total).

## Test strategy

- Existing `Wave.test.ts` cases cover the entire lifecycle event surface
  (`wave:start`, `wave:complete`, `run:won`, `run:lost`, idempotency,
  destroy). Updating them to pass an explicit emitter is mechanical — no
  behavior assertions need to change because `sys.emitter === bus` and
  the system never reads any state through the emitter.
- The integration smoke is the canary: if it still passes, the contract
  tightening hasn't regressed the fully-wired path.
- No new tests needed. The acceptance criterion "no silent-drop possible"
  is enforced statically by the TS compiler — there is no runtime branch
  to test.

## Verification

`pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm validate:data`.

All four must pass clean. TS will fail loudly on any caller that omits
`emitter`, which is the whole point of this change.

## Decisions

- **Why not Option B (warn).** A console warning still lets the bug ship. The
  whole point of the issue is to make this class of bug structurally
  impossible. Option A wins.
- **Pattern in tests: bus-per-test vs. inline.** Bus-per-test is one extra
  line per test but matches how the smoke and the upcoming GameScene wire
  it. Mirrors the way `makeFortCore(bus, hp)` already gets its emitter from
  the surrounding scope in the smoke. No need for a helper function — the
  tests are flat enough that one `new SimpleEventEmitter()` per `it` is
  fine.
- **JSDoc on the field.** I'll update the inline comment on
  `WaveSystemOptions.emitter` to explain why it's required (silent-drop
  prevention, shared-bus contract) — this is exactly the "non-obvious
  reason" hook from the AC, even though the reasoning here is now
  obvious. Better to over-document a contract than under-document.
- **`SimpleEventEmitter` import in `Wave.ts`.** Removed since the fallback
  is gone. `EventEmitterLike` (the type) is still imported.
