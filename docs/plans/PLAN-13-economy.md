# PLAN-13 — Economy: gold from kills + respawn cost + wave rewards

## Context

Issue #13 wires the gold economy: killing humans drops gold (from
`humans/*.json`'s `goldDrop`), orc respawn debits gold + enforces a
respawn timer (from `orcs/*.json`'s `respawnCost`), and wave completion
awards `reward.gold` (from `waves/*.json`). React HUD reads gold via
`useGameStore`; Phaser writes via the bridge.

Upstream already merged:
- `gameStore.ts` (M0) — has `gold`, `addGold(n)`, `spendGold(n) -> bool`,
  `reset()`. These already satisfy the "clear failure signal" shape,
  so we re-use them rather than adding a `tryDebit`.
- `bridge.ts` (M0) — exposes `getGameStore()` / `subscribeGameStore`.
- `Damageable` (#6) emits `'died'` on the entity's emitter when HP hits 0.
- `Orc` / `Human` (#6) expose `.def` and `.emitter`.
- `GameEvents` registry in `src/game/systems/events.ts` (#7 / #8).
- `UnitDef` schema (#2) already has `goldDrop?: number` and
  `respawnCost?: { gold, time }`.
- `WaveDef` schema (#3) has `reward.gold`.

## Branch

`feat/13-economy`

## Approach

### 1. `GameEvents` — add `wave:complete` (additive)

Extend `src/game/systems/events.ts` with a new constant
`WaveComplete = 'wave:complete'` and a `WaveCompletePayload`
(`{ waveId, waveNumber, reward: { gold } }`). Re-export from the
systems barrel. Additive only — no existing entries moved.

A wave-spawning system does not exist yet; #13 only defines the contract
and makes the Economy system subscribe. The emitter is passed in at
construction so future wave code can wire up by calling `emit('wave:complete', payload)`.

### 2. `Economy` system — `src/game/systems/Economy.ts` (new)

Pure TS, jsdom-safe (no Phaser top-level import). Responsibilities:

- **Human-kill gold drops.** `registerHuman(human)` subscribes once to the
  human's `'died'` event. On death, reads `human.def.goldDrop ?? 0` and
  credits the store via `addGold`. Emits a system-level `'economy:gold-drop'`
  event with `{ unitId, amount }`.
- **Orc respawn.** `requestRespawn(orc)` reads
  `orc.def.respawnCost`. If absent, returns `{ ok: false, reason: 'no-respawn-cost' }`.
  Otherwise attempts `spendGold(cost.gold)`:
  - On `false` (insufficient gold) → returns `{ ok: false, reason: 'insufficient-gold', needed, have }`
    and emits `'economy:insufficient-gold'`.
  - On `true` → records a respawn timer keyed off the orc (Map) with
    `remaining = cost.time`, returns `{ ok: true, respawnAt: remaining }`.
- **Respawn timer progression.** `update(dt)` decrements all pending
  respawn timers. When one hits zero, emits `'economy:respawn-ready'` with
  `{ orc }` and removes the timer entry. A later issue (#17/HUD or an AI
  system) will consume this event to actually re-place the orc on the map
  — Economy is only responsible for the *gold + timer* half of the
  contract per the issue wording "enforces respawn timer from data (#2)".
- **Wave completion reward.** `onWaveComplete(payload)` (also wired via
  the emitter) reads `payload.reward.gold` and calls `addGold` on the
  store. Emits `'economy:wave-reward'` with `{ waveId, amount }`.
- **Affordability helper.** `canAfford(amount): boolean` reads
  `getGameStore().gold >= amount`. Used by callers (build panel, #14/#15)
  to grey-out buttons before attempting a debit. "Clear failure signal" =
  the `{ ok: false, reason }` discriminated union returned from mutating
  calls; no throws.

Constructor shape:

```ts
interface EconomyOptions {
  emitter?: EventEmitterLike;     // system bus (defaults to new SimpleEventEmitter)
  store?: {                       // test seam — defaults to bridge.getGameStore
    gold: number;
    addGold(n: number): void;
    spendGold(n: number): boolean;
  };
  getStore?: () => {              // function variant for live Zustand store
    gold: number;
    addGold(n: number): void;
    spendGold(n: number): boolean;
  };
}
```

Tests pass a `getStore` lambda that returns a plain object; production
passes the default (which delegates to `getGameStore()` from bridge).

### 3. `gameStore.ts` — leave as-is

The existing slice is already sufficient:
- `gold: number`, `addGold`, `spendGold` (returns `boolean` — matches
  "clear failure signal"), `reset`.
- No `tryDebit` alias needed — `spendGold` already fits. (Adding one
  would be scope creep + a naming fork across the codebase.)

### 4. `bridge.ts` — no changes needed structurally

`getGameStore()` already exists and returns the live store. The Economy
system's default `getStore` uses it. No new code.

### 5. Systems barrel — additive

`src/game/systems/index.ts`: add `export { Economy } from './Economy';`
and its types. Never re-order.

## Files

- `docs/plans/PLAN-13-economy.md` (this plan)
- `src/game/systems/events.ts` — extend with `WaveComplete` + payload (additive)
- `src/game/systems/Economy.ts` (new)
- `src/game/systems/index.ts` — additive export
- `tests/game/systems/Economy.test.ts` (new)
- `tests/state/gameStore.test.ts` — extend with a cross-system "kill → respawn → wave-complete" math walk-through that exercises the real store + Economy together

No data files change. No schemas change.

## Test strategy

All Vitest + jsdom, `SimpleEventEmitter` — no Phaser.

### `Economy.test.ts`
1. **Human death credits goldDrop.** Construct Economy with a stub store.
   `registerHuman(human)` then force `human.damageable.applyDamage(999)`.
   Assert `store.gold === humanDef.goldDrop` and `'economy:gold-drop'` fired
   with `{ unitId, amount }`.
2. **Missing `goldDrop` → no credit, no throw.** Clone a human def sans
   `goldDrop` → death credits 0 gold, still emits event with `amount: 0`
   OR suppresses event (choose the simpler semantics — see Decisions).
3. **Orc respawn succeeds when funded.** Seed store with `cost.gold * 2`,
   call `requestRespawn(orc)`, assert `{ ok: true, respawnAt: cost.time }`,
   store gold debited, timer present.
4. **Orc respawn fails on insufficient gold (AC).** Seed store with
   `cost.gold - 1`, `requestRespawn` returns `{ ok: false,
   reason: 'insufficient-gold', needed, have }`. Store unchanged. Emits
   `'economy:insufficient-gold'`.
5. **Respawn timer fires event when ready (AC).** Requesting then calling
   `update(cost.time)` emits `'economy:respawn-ready'` with the orc and
   removes the timer. A subsequent `update(dt)` is a no-op.
6. **Wave complete credits gold (AC).** Emit `wave:complete` on the
   system emitter with `{ waveId: 'm1-wave-1', waveNumber: 1,
   reward: { gold: 25 } }`. Store credited by 25. `'economy:wave-reward'`
   emitted.
7. **Orc missing `respawnCost` returns `no-respawn-cost`.** Edge — human
   def passed to `requestRespawn` should also return `ok: false` with the
   same reason (defensive).
8. **No double-credit on a re-registered human.** `registerHuman` called
   twice on the same human; death credits once.

### Extended `gameStore.test.ts` — end-to-end math (AC)

Exact math exercise using the real store + real Economy + real defs:
1. Start gold: 0.
2. Kill a peasant levy (`goldDrop: 4`) → gold = 4.
3. Kill 5 more peasants → gold = 24.
4. `requestRespawn(grunt)` (`respawnCost.gold: 15`) → gold = 9.
5. Emit `wave:complete` with `m1-wave-1.reward.gold = 25` → gold = 34.
6. Attempt to respawn a second grunt when gold = 5 (via `spendGold(29)`
   first to drain) → returns `{ ok: false, reason: 'insufficient-gold' }`,
   gold unchanged at 5.
7. Advance timer with `update(10)` — respawn-ready event fires.

All numbers pulled from the JSON defs — no hardcoded balance.

## Verification

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test -- --run`
4. `pnpm validate:data`
5. Grep `src/game/systems/Economy.ts` for numeric literals — should only
   contain structural constants (`0` default-credit, `1` nowhere). All
   balance numbers flow from `def.goldDrop`, `def.respawnCost.{gold,time}`,
   `payload.reward.gold`.

## Decisions

- **No `tryDebit` alias.** `spendGold(n)` already returns `boolean` and
  matches the orchestrator's semantics ("clear failure signal, don't
  throw"). Adding a synonym would fork the API.
- **Economy does not own live store state.** It calls through a pluggable
  `getStore`; default is `getGameStore()` from `bridge.ts`. Keeps tests
  easy and lets a future React-only preview call into a fake.
- **Respawn is timer-only in #13.** Actually placing the orc back on the
  map is a later orc-spawning/AI issue (#9 or future). Economy emits
  `'economy:respawn-ready'` so downstream can hook in.
- **Subscribing to human deaths is opt-in via `registerHuman`.** Economy
  doesn't scan the scene — callers (wave spawner, later work) register
  each spawned human. Keeps coupling explicit. Same pattern as
  `DamageSystem.watchDeath`. Registration is idempotent.
- **`onWaveComplete` wired via the system's emitter, not a direct call.**
  Matches the event-bus pattern of #7/#8. The Economy ctor subscribes to
  `WaveComplete` on its emitter; test code emits directly. A future wave
  system will share the same emitter instance.
- **`goldDrop` absent → no credit, no event.** Simpler semantics; tests
  assert the store is untouched and no event fires. Matches "kills drop
  gold per data" — if data says no drop, nothing happens.
- **Defensive `no-respawn-cost` reason.** Calling `requestRespawn` on any
  entity (e.g. a human, or an orc variant without `respawnCost`) should
  fail cleanly, not throw. Future upgrade: hero respawn might have its
  own cost block — additive.
- **No JSON/schema changes.** All required fields (`goldDrop`,
  `respawnCost`, `reward.gold`) already in M1 data.
