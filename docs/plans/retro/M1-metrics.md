# M1 Retro Metrics — Dry-run wave 1

**Started:** 2026-04-24T19:19:33Z
**Ended:** 2026-04-24T19:33:20Z
**Main SHA at start:** 04bbca3
**Main SHA at end:** ab97dd9
**Scope:** Dry-run targeting issues #2 and #11 only; remaining 20 issues paused.

## Per-issue

### #2 data(units): Mougg'r grunt + Peasant Levy
- **Worker timing:** plan 31s, impl 33s, validate 5s. Total worker wall-clock ≈ 1m 09s.
- **Orchestrator merge:** ~80s (gate + push). FF clean — worker's branch base = main at dispatch.
- **Plan vs actual files:** 2 planned (peasant-levy.json, plan doc) / 2 created. Match.
- **Conflict:** none.
- **Bail:** —
- **Tests before → after:** 30 → 30 (no new test code; data-only change validated by existing schema tests).
- **Decisions made:** Worker chose to leave `mougg-grunt.json` untouched since the M0 fixture already conforms to the schema and acceptance criteria. Documented in plan as scope-creep avoidance.
- **Notes:** Worker correctly used UTC timestamps.

### #11 data(buildings): wood wall + ballista
- **Worker timing:** plan 60s, impl 30s, validate 40s. Total worker wall-clock ≈ 2m 10s. (Worker's reported timestamps used local time mislabeled as `Z` — confirmed by comparing dispatch time to worker's claimed start.)
- **Orchestrator merge:** ~10m. Most of this was orchestrator overhead (see Anomalies). Pure rebase + gate + push was probably ~90s.
- **Plan vs actual files:** 3 planned (wall-wood.json, ballista.json, plan doc) / 3 created. Match.
- **Conflict:** none on rebase (different files from #2).
- **Bail:** —
- **Tests before → after:** 30 → 30.
- **Decisions made:** Numeric calibration was speculative since Peasant Levy stats from #2 weren't visible during planning. Worker chose conservative defaults; final tuning deferred to #22.

## Summary

- **Wall-clock:** 13m 47s (dispatch → final merge).
- **Issues merged:** 2 / 2 (100%).
- **Blocked:** 0.
- **Auto-resolved conflicts:** 0.
- **Biggest time burn:** orchestrator merge of #11 (~10m of overhead vs ~90s of actual work).
- **Biggest plan/actual drift:** none.

## Anomalies and skill bugs surfaced

1. **Worker worktrees lock the feature branches.** The Agent tool's `isolation: "worktree"` keeps the worktree (and thus its checked-out branch) locked even after the agent completes. The skill's Phase 3 step "git checkout `<feature-branch>` && git rebase main" cannot work directly. Worked around by creating a temp ref at the worker's commit (`git branch tmp-rebase-N <sha>`), checking that out in the main checkout, rebasing, ff-merging, then deleting the temp ref. The original feat/X branch ref is preserved (still in the worker's worktree) for rollback.
2. **First merge needs no rebase.** When a worker's branch starts from current `main`, the rebase step is a no-op AND can be skipped entirely — orchestrator can `git merge --ff-only feat/<N>-<slug>` directly from main without checkout. Saves a step.
3. **Worker timestamp inconsistency.** #11 worker used local time labeled with `Z`. Workers should be told to use `date -u +%FT%TZ` explicitly.
4. **Worktree cleanup not handled.** Locked worker worktrees remain at `.claude/worktrees/agent-*` after the milestone ends. Need a cleanup step or rely on harness auto-cleanup later. Branches `worktree-agent-*` (the agent harness's auto-created branches) are also still around.
5. **Orchestrator overhead per merge.** Mostly correct shell sequencing. With the temp-ref pattern hardened, future merges should be 60–90s of orchestrator time per issue.

## Recommendations for skill v2

- Update Phase 3 to use the temp-ref rebase pattern by default (works in both base-matches-main and divergent cases).
- Update worker prompt to specify `date -u +%FT%TZ` for all timestamps.
- Add a final cleanup phase that removes orphaned `worktree-agent-*` branches once their worktrees are reaped (or document leaving them).
- Add an explicit fast-path: when `git merge-base feat/<N> main` equals main HEAD, skip the rebase entirely.

---

# M1 Retro Metrics — Dry-run wave 2

**Started:** 2026-04-24T20:10:20Z
**Ended:** 2026-04-24T20:44:09Z
**Main SHA at start:** bb2154b
**Main SHA at end:** c06b6dd
**Scope:** Wave 2 dry-run targeting issues #3, #4, #5, #6, #12. Tested patched skill v2 (temp-ref merge handler, fast-path test, UTC timestamps, worktree cleanup). First non-data issue (#6 entities) included.

## Sub-wave structure

- Sub-wave 1 (parallel): #3, #4, #5 dispatched at 20:10:20Z (3/3 cap).
- Sub-wave 2 (parallel): #6, #12 dispatched at 20:27:01Z after sub-wave 1 fully merged (2/3 cap).

## Per-issue

### #3 data(waves): 5 hand-authored M1 waves
- **Worker timing:** plan 53s, impl 20s, validate 19s. Wall-clock ≈ 1m 32s.
- **Orchestrator merge:** ~2m. FAST-PATH (base = main at dispatch).
- **Plan vs actual files:** 6 planned (5 wave files + plan doc) / 6 created. Match.
- **Conflict:** none.
- **Bail:** —
- **Decisions made:** Worker chose 5 separate files (one wave per file) vs single array, citing the schema-per-file CLI invariant. Conservative + correct call.
- **Tests:** 30 → 30 (data-only).

### #4 data(strings): expand en.json + i18n helper
- **Worker timing:** plan 64s, impl 66s, validate 15s. Wall-clock ≈ 2m 25s.
- **Orchestrator merge:** ~2m. SLOW-PATH (rebased onto e3770aa via temp-ref).
- **Plan vs actual files:** 6 planned / 6 created (incl. tests/lib/i18n.test.ts).
- **Conflict:** none on rebase.
- **Bail:** —
- **Decisions made:** Tightened strings schema from `z.record` to `z.object({...})` for typo safety. Added typed `StringKey` export. `t()` throws on missing key (vs fallback). Strong call — locks the contract.
- **Tests:** 30 → 34 (+4: 2 negative schema, 2 i18n helper).

### #5 data(maps): hand-authored Tiled M1 slice
- **Worker timing:** plan 74s, impl 5m 45s, validate 27s. Wall-clock ≈ 7m 26s.
- **Orchestrator merge:** ~2m. SLOW-PATH (rebased onto d6ac598).
- **Plan vs actual files:** 5 created (m1-slice.json + duplicate in public/, PreloadScene update, test, plan doc).
- **Conflict:** none.
- **Bail:** —
- **Decisions made:** Hand-authored Tiled-shape JSON (no Tiled GUI available — documented deviation). Added the new map alongside placeholder.json (additive — no rip-out). Added 7 vitest cases pinning dimensions/layer names/spawn positions.
- **Anomaly:** Worker created BOTH `src/data/maps/m1-slice.json` AND `public/data/maps/m1-slice.json`. The duplicate in public/ may be Vite's static-asset convention but worth verifying — could be unused waste. Note for review.
- **Tests:** 34 → 41 (+7).

### #12 data(heroes): Mougg'r hero + Clomp'uk
- **Worker timing:** plan 70s, impl 51s, validate ~0s. Wall-clock ≈ 2m 1s.
- **Orchestrator merge:** ~3m. FAST-PATH (base = main at dispatch — sub-wave 2 dispatched after sub-wave 1 fully merged, so #12 base equaled main at dispatch).
- **Plan vs actual files:** 2 created.
- **Conflict:** none.
- **Bail:** —
- **Decisions made:** Stat calibration (hero stats > grunt). Omitted optional `souls` cost (no soul economy yet). Sprite naming kebab-case.
- **Anomaly:** Worker noted worktree had no `node_modules` — ran validators "via the main repo's pnpm against the worktree's files". Workaround was harmless but suggests pnpm install behavior in worktrees needs investigation. Workers should be able to gate locally without main repo dependency.
- **Tests:** 41 → 41 (data-only).

### #6 feat(entities): composition components + Orc/Human/Building
- **Worker timing:** plan 1m 37s, impl 6m 29s, validate 15s. Wall-clock ≈ 8m 21s.
- **Orchestrator merge:** ~7m. SLOW-PATH (rebased onto 688e76b).
- **Plan vs actual files:** 17 created/modified (4 components + 1 helper + 1 barrel + 3 entities + 1 barrel + 6 test files + plan doc). High file count for the issue's scope, but acceptable — entities + components per AC.
- **Conflict:** none.
- **Bail:** —
- **Decisions made:**
  1. Facade-style components wrapping `EventEmitterLike` interface. Production code passes `Phaser.Events.EventEmitter`; tests use bundled `SimpleEventEmitter`. Rationale: importing Phaser at module top crashes jsdom (canvas feature detection).
  2. `Breakable = Damageable + damageStates`, composing internally for DRY but distinct semantically.
  3. Entities are NOT Phaser.GameObjects.Sprite subclasses — sprite binding deferred to a later issue.
  4. Zero literal numbers in `src/game/entities/*.ts` (validated by worker grep).
- **Tests:** 41 → 73 (+32: 4 component tests + 2 entity tests).
- **Notes:** First real-code issue. Worker handled composition pattern + Phaser's jsdom hostility cleanly.

## Summary

- **Wall-clock:** 33m 49s (dispatch → final merge of #6).
- **Issues merged:** 5 / 5 (100%).
- **Blocked:** 0.
- **Auto-resolved conflicts:** 0.
- **Biggest time burn:** #6 (executing: 6m 29s) + its merge (~7m). Both expected — substantial implementation.
- **Plan/actual drift:**
  - #5 added unplanned `public/data/maps/m1-slice.json` (Vite static convention, possibly unnecessary duplicate).
  - #6 added 17 files vs 7 in the issue's "Files affected" — but all are reasonable scope (tests + barrels + EventEmitter helper).
- **Tests grew:** 30 → 73 (+43 across 5 issues).

## Anomalies and skill v2 results

1. **Skill v2 patches all worked as designed.**
   - Temp-ref pattern: cleanly handled both fast-path (#3, #12) and slow-path (#4, #5, #6) merges.
   - Fast-path test: correctly identified base-matches-main cases, skipped redundant rebase.
   - UTC timestamps: all 5 workers reported correct UTC (no repeats of wave 1's #11 local-time bug).
2. **Stash dance for status board.** Each slow-path merge required `git stash push docs/plans/status/M1.md` → rebase → pop. Adds ~5s per merge. The skill could codify this rather than expecting it to be done ad-hoc, OR the orchestrator could write status board updates AFTER the merge instead of before — that simpler pattern eliminates the stash entirely.
3. **Worker pnpm-in-worktree confusion (#12).** Worker noted no `node_modules` in worktree and ran validators against main repo's setup. Likely the Agent tool's worktree doesn't bring node_modules along (pnpm symlinks?). Workers should either: (a) run `pnpm install --frozen-lockfile` in the worktree first (we forbid new deps but installing the existing lockfile is fine), or (b) the orchestrator dispatches workers with node_modules already pre-installed via worktree setup. (a) is simpler but adds ~30s per worker.
4. **#5's `public/data/maps/` duplicate** — needs human review. Either it's correct Vite static convention or it's dead weight. Not a blocker but a code-review note.
5. **Token consumption.** Worker totals: #3=32k, #4=39k, #5=74k, #12=38k, #6=90k. Total ≈ 273k worker tokens for 5 issues. Heavier than wave 1's 61k for 2 issues — partly because #5 and #6 are bigger, partly because workers explored more.

## Recommendations for skill v3

- **Move status board updates to AFTER each merge** (eliminates stash dance entirely). Update planning-state when dispatching, but defer "merged" state writes until after the merge is complete. Or write to a separate file the orchestrator owns exclusively.
- **Worker should run `pnpm install --frozen-lockfile` first** (or document that a missing node_modules is a known constraint and validators should run against the main repo). Either way, surface this in the worker prompt.
- **Consider squashing the per-issue plan doc commits** into the artifacts commit at milestone end. Currently every feature branch carries its own plan doc as a separate file in main — 5 plan docs in main now. That's fine but could be a single `docs/plans/M1-PLANS.md` consolidated doc.
- **Audit #5's `public/data/maps/m1-slice.json`** — decide whether it's needed.

---

# M1 Retro Metrics — Dry-run wave 3

**Started:** 2026-04-24T21:17:05Z
**Ended:** 2026-04-24T21:33:04Z
**Main SHA at start:** a27ab93
**Main SHA at end:** 343ed83
**Scope:** Wave 3 dry-run targeting #7 (pathfinding), #8 (combat), #18 (hero-create UI). Tests skill v3 patches (stash dance codified, `pnpm install --frozen-lockfile` allowed). First wave to include React UI work and the first auto-resolved structured conflict.

## Per-issue

### #7 feat(pathfinding): easystarjs A* + wall recompute
- **Worker timing:** plan 2m 0s, impl 1m 55s, validate 13s. Wall-clock ≈ 4m 8s.
- **Orchestrator merge:** ~3m. FAST-PATH (base = main at dispatch).
- **Plan vs actual files:** 5 created. Match.
- **Conflict:** none (fast-path).
- **Bail:** —
- **Decisions made:** Reused #6's `EventEmitterLike` / `SimpleEventEmitter` pattern. easystarjs sync mode for deterministic perf. Walls + water always impassable; forest passable but `blocksSight`. Cache invalidated on wall events.
- **Tests:** 73 → 83 (+10).

### #8 feat(combat): damage system + ballista projectiles
- **Worker timing:** plan 2m 3s, impl 2m 34s, validate 13s. Wall-clock ≈ 4m 50s.
- **Orchestrator merge:** ~6m. SLOW-PATH (rebased onto c9e4618). **Auto-resolved an additive conflict** on `src/game/systems/index.ts` — both #7 and #8 created the file with their respective exports. Structured-conflict resolver kept both sides; rebase continued cleanly.
- **Plan vs actual files:** 7 created. Match.
- **Conflict:** auto-resolved additive (systems/index.ts barrel exports).
- **Bail:** —
- **Decisions made:** Tick-based update loop. `DEFAULT_HIT_RADIUS = 6` documented as physics constant (not balance). DamageSystem orchestrates; doesn't reimplement Damageable.
- **Tests:** 83 → 100 (+17).

### #18 feat(ui): hero-creation page + metaStore + run signal
- **Worker timing:** plan 1m 58s, impl 6m 0s, validate 17s. Wall-clock ≈ 8m 19s.
- **Orchestrator merge:** ~6m. SLOW-PATH (rebased onto 1c2244f). Clean rebase.
- **Plan vs actual files:** 16 created/modified. High file count justified — first React UI requires building atom layer (Button, TextInput) + molecule (BloodlineCard) + organism + page + new metaStore + runSignal + types update + 4 test files + Vite/test config patches.
- **Conflict:** none on rebase.
- **Bail:** —
- **Decisions made:** Zustand `persist` middleware for localStorage. `runSignal` as a bare event emitter for React→Phaser handoff (not a Zustand action). Mobile 375px verification deferred to human review (no browser available — documented). Tailwind mobile-first defaults + ≥44px tap targets used by convention.
- **Anomalies handled by worker:**
  1. Node 25's incomplete built-in `localStorage` overrode jsdom's — worker added a shim in `tests/setup.ts`.
  2. Vitest config missing automatic JSX — worker patched `vitest.config.ts`.
  Both are additive infrastructure fixes; worth a human review for whether they should land long-term.
- **Tests:** 100 → 118 (+18).

## Summary

- **Wall-clock:** 15m 59s (dispatch → final merge of #18).
- **Issues merged:** 3 / 3 (100%).
- **Blocked:** 0.
- **Auto-resolved conflicts:** 1 (systems/index.ts — additive barrel exports).
- **Biggest time burn:** #18 (impl 6m + merge 6m). Expected — full React feature including atoms/molecules/organism/page/store + first-time test infra patches.
- **Plan/actual drift:**
  - #18 added Vite/Vitest config patches not in the original "Files affected" list. Necessary for the work but worth a code-review note.

## Skill v3 patches: results

- **Stash dance codified.** Worked cleanly for #8 and #18 slow-paths. No surprises.
- **`pnpm install --frozen-lockfile` allowance.** None of the 3 workers reported the bootstrap problem from wave 2 — they handled it cleanly per the new instruction. (Or they didn't need it because the harness pre-installed; either way the rule wasn't tripped.)
- **Structured-conflict auto-resolve.** First time fired in production. Verified working on additive-only conflict (systems/index.ts). The resolver wrote a valid concatenated file and rebase --continue succeeded without manual intervention.

## Recommendations for skill v4

- **Worker should NOT modify `vitest.config.ts` without flagging.** Config changes are infrastructure, not feature work. Add a soft rule: "if you need to modify build/test config, document the change prominently in `## Decisions` and consider whether it should be a separate issue." Code-review can override.
- **Plan doc count is creeping.** After 8 merged issues, main has 8 plan docs in `docs/plans/`. Worth bundling them at milestone end — defer to M1 retrospective.
- **#18 worker's tests/setup.ts patch** also worth a human eye — Node 25 vs jsdom localStorage shim could break in different envs.

---

# M1 Retro Metrics — Dry-run wave 4

**Started:** 2026-04-24T21:54:21Z
**Ended:** 2026-04-24T22:08:35Z
**Main SHA at start:** 5a19762
**Main SHA at end:** 7d91b7d
**Scope:** Wave 4 dry-run targeting #9 (AI), #13 (economy), #16 (hero ability). First wave where all 3 workers modified shared barrel/store files concurrently. Expected 2-3 additive conflicts.

## Per-issue

### #13 feat(economy): gold + respawn + wave rewards
- **Worker timing:** plan 2m 4s, impl 2m 31s, validate 10s. Wall-clock ≈ 4m 45s.
- **Orchestrator merge:** ~1m. FAST-PATH (first to finish, base = main).
- **Plan vs actual files:** 6 created. Match.
- **Conflict:** none (fast-path).
- **Bail:** —
- **Decisions made:** Discriminated `{ok, reason}` return for `respawn()` — no throws. `gameStore.spendGold` already satisfied "insufficient gold" contract, no new API needed.
- **Tests:** 118 → 131 (+13).

### #16 feat(hero): Clomp'uk slam + AoE stun
- **Worker timing:** plan 2m 5s, impl 2m 51s, validate 0s. Wall-clock ≈ 4m 56s.
- **Orchestrator merge:** ~3m. SLOW-PATH (rebased onto 8e751fc). **`src/state/gameStore.ts` modified by both #13 and #16 — git's auto-merge handled it cleanly** (different sections). No structured-resolver invocation needed.
- **Plan vs actual files:** 9 created/modified.
- **Conflict:** none on rebase (git auto-merge on gameStore.ts).
- **Bail:** —
- **Decisions made:** Separate `Hero` class over extending `Orc` (different def shape). Pure-function `tryUseAbility(ctx)` — caller owns clock and spatial query. Structural-type `HeroAbilityTargetLike` with `stunnedUntilMs` timestamp — one-line follow-up if #9 uses different shape.
- **Tests:** 131 → 150 (+19).

### #9 feat(ai): human + orc behavior FSMs
- **Worker timing:** plan 2m 36s, impl 4m 8s, validate 0s. Wall-clock ≈ 6m 44s.
- **Orchestrator merge:** ~5m. SLOW-PATH (rebased onto 7d182ce). **Auto-resolved additive conflict on `src/game/systems/index.ts`** — main had #13's Economy exports, incoming had #9's AI exports. Structured-conflict resolver concatenated both sides cleanly.
- **Plan vs actual files:** 4 created. Match.
- **Conflict:** auto-resolved additive (systems/index.ts).
- **Bail:** —
- **Decisions made:** On `path:invalidated`, keep stale path while async `findPath` resolves — lets human reach blocking wall before falling to IDLE. Found via one-iteration test failure (first-try recovery).
- **Tests:** 150 → 158 (+8).

## Summary

- **Wall-clock:** 14m 14s (dispatch → final merge of #9).
- **Issues merged:** 3 / 3 (100%).
- **Blocked:** 0.
- **Auto-resolved conflicts:** 1 (systems/index.ts — structured resolver). One git-native auto-merge on gameStore.ts (different sections — didn't need structured resolver).
- **Biggest time burn:** #9 (worker 6m 44s + merge 5m). Most complex issue this wave — full FSM with path integration.
- **Plan/actual drift:** none — all three workers matched their "Files affected" within expected scope creep.

## Skill v3 patches: continued validation

- **Stash dance:** worked for both #16 and #9 slow-paths. Minor friction but reliable.
- **Structured-conflict auto-resolve:** second production trigger (systems/index.ts again — barrel files are the main conflict surface). Handled cleanly.
- **Git-native merge:** notably, gameStore.ts (modified by #13 and #16 at different sections) merged without conflict via git's 3-way merge. Good — not every shared-file touch needs the structured resolver.

## Observations

1. **Barrel files are the predictable conflict surface.** Every wave so far has had at least one additive conflict on a barrel (`systems/index.ts`, `entities/index.ts`, `components/index.ts`). The structured resolver handles these reliably. Alternative: restructure barrels to be append-only (e.g. one file per export) — but that's more refactor than win at this stage.
2. **gameStore.ts parallelism works.** When workers add to different sections of the same file, git's 3-way merge handles it. No structured resolver needed. Confirms the "add-only" worker discipline rule is effective.
3. **Cost scaling.** Wave 4 token use: #9=95k, #13=71k, #16=77k. Total ~243k. Similar to wave 2 despite all 3 being meatier implementation issues. Workers are getting more efficient at scoping.

## M1 progress at end of wave 4

- **Merged: 14 / 23** (#1-9, #11-13, #16, #18)
- **Paused: 9** (#10, #14, #15, #17, #19, #20, #21, #22, #23)

## Newly unblocked after wave 4

- **#10** (wave spawner) needs #3 ✓ + #9 ✓ → READY
- **#14** (building placement) needs #11 ✓ + #7 ✓ + #13 ✓ → READY
- **#17** (HUD) needs #4 ✓ + #13 ✓ + #16 ✓ → READY

Three ready for wave 5 — perfect batch.

---

# M1 Retro Metrics — Dry-run wave 5

**Started:** 2026-04-26T20:41:28Z
**Ended:** 2026-04-26T20:52:01Z
**Main SHA at start:** d1a6bf7
**Main SHA at end:** e2fb479
**Scope:** Wave 5 dry-run targeting #10 (wave spawner), #14 (building placement), #17 (HUD). Cross-system integration wave: spawner wires waves+AI+events, building wires walls+pathfinding+economy, HUD wires React to Zustand for live values.

## Per-issue

### #14 feat(building): grid wall placement
- **Worker timing:** plan 2m 4s, impl 1m 51s, validate 15s. Wall-clock ≈ 4m 10s.
- **Orchestrator merge:** ~3m. FAST-PATH (first to finish, base = main).
- **Plan vs actual files:** 4 created. Match.
- **Conflict:** none (fast-path).
- **Decisions made:** Synchronous BFS over `pathfinding.isWalkable` for path-critical "would-trap-fort" check (deterministic, revert-safe — avoided async findPath). Discriminated `PlaceResult` union (no throws).
- **Tests:** 158 → 170 (+12).

### #10 feat(waves): wave spawner + fort-core
- **Worker timing:** plan 1m 3s, impl 2m 35s, validate 13s. Wall-clock ≈ 5m 9s (includes `pnpm install --frozen-lockfile` step).
- **Orchestrator merge:** ~2m. SLOW-PATH (rebased onto 8a4d550). **Auto-resolved additive conflict** on `src/game/systems/index.ts` — main had #14's BuildingSystem exports, incoming had #10's WaveSystem exports. Concatenation worked cleanly.
- **Plan vs actual files:** 5 created. Match.
- **Conflict:** auto-resolved additive (systems/index.ts). `events.ts` also modified by #10 (added wave/run event types) but git auto-merged native (no conflict).
- **Decisions made:** Ctor-injection pattern matching #9/#13. `FortCoreLike` structural interface — decoupled from a concrete fort-core entity (deferred). `humansProvider` defaults to internal tracking but scenes can override.
- **Tests:** 170 → 182 (+12).

### #17 feat(ui): HUD organism + atoms + molecules
- **Worker timing:** plan 2m 2s, impl 2m 54s, validate 16s. Wall-clock ≈ 5m 12s.
- **Orchestrator merge:** ~2m. SLOW-PATH (rebased onto 6c31906). Clean rebase — no conflicts.
- **Plan vs actual files:** 16 created/modified. Atomic decomposition: 2 atoms (WaveBadge, SkullCounter), 2 molecules (HeroStatus, AbilityButton), 1 organism (HUD), gameStore HUD slice, 3 new string keys, 5 test files.
- **Conflict:** none on rebase.
- **Decisions made:** Added `triggerWaveStart`/`clearWaveStart` actions on store (rather than depending on #10's `wave:start` emitter directly) — single source of truth for ISE HAI banner that #10 can wire later.
- **Tests:** 182 → 214 (+32).

## Summary

- **Wall-clock:** 10m 33s (dispatch → final merge of #17). FASTEST WAVE YET despite biggest test count growth.
- **Issues merged:** 3 / 3 (100%).
- **Blocked:** 0.
- **Auto-resolved conflicts:** 1 (systems/index.ts — third production trigger of structured resolver).
- **Biggest time burn:** worker #17 (impl 2m 54s + 32 new tests). Justified — full atomic-design HUD + 16 files.
- **Plan/actual drift:** none — #17's 16 files all under issue scope.

## Notable observations

1. **Cross-system integration worked clean.** Three workers touching mostly different surfaces (game systems vs UI vs UI state) — no semantic conflicts. The "add-only to different sections" discipline plus structural-typing-over-concrete-deps pattern (per workers' `*Like` interfaces) is paying dividends.
2. **HUD's `triggerWaveStart` decision is good design.** Rather than coupling #17 to #10's emitter, the worker added a store action — both #10 and the eventual scene-runner can call it. Clean inversion.
3. **systems/index.ts is the predictable conflict point.** Third wave in a row with an additive conflict there. Auto-resolver is reliable but it's noise. Worth considering: split the barrel into per-system files (`./pathfinding.ts`, `./damage.ts`, etc.) so each new system adds its own file rather than appending to a shared one. Defer to milestone retro.
4. **Board state drift bug surfaced:** noticed during wave 5 termination that #16's row (from wave 4) was still marked `planning` despite being merged. Cause: stash-pop ordering during wave 4's #9 merge meant the #16 → merged update got committed at an in-progress state. Fixed retroactively in this wave 5 artifacts commit. Skill v4 candidate: explicit checkpoint that all in-flight rows are `merged` BEFORE the artifacts commit.

## M1 progress at end of wave 5

- **Merged: 17 / 23** (#1-10, #11-14, #16-18)
- **Paused: 6** (#15, #19, #20, #21, #22, #23)

## Newly unblocked after wave 5

- **#15** (walls damage states + repair) needs #8 ✓ + #13 ✓ + #14 ✓ → READY
- **#19** (build panel) needs #4 ✓ + #14 ✓ + #15 ← blocked on #15
- **#20** (win/lose screens) needs #4 ✓ + #10 ✓ → READY
- **#21** (mobile touch input) needs #6 ✓ + #14 ✓ → READY

Three ready: #15, #20, #21. Perfect batch cap 3 for wave 6. After wave 6, only #19, #22, #23 remain — and #19 unblocks once #15 lands. So wave 7 = #19, then wave 8 = #22, wave 9 = #23. M1 completion in 4 more waves at this pace.

---

# M1 Retro Metrics — Dry-run wave 6

**Started:** 2026-04-26T21:05:14Z
**Ended:** 2026-04-26T22:06:52Z
**Main SHA at start:** 54013de
**Main SHA at end:** d118b5d
**Scope:** Wave 6 dry-run targeting #15 (walls damage states + repair), #20 (win/lose screens), #21 (mobile touch input). Polish + first input-system wave.

## Per-issue

### #15 feat(walls): damage states + manual repair
- **Worker timing:** plan 17m 50s (anomalously high), impl 4m 37s, validate 9s. Wall-clock ≈ 24m 6s.
- **Orchestrator merge:** ~3m. FAST-PATH.
- **Plan vs actual files:** 9 modified. Match.
- **Conflict:** none (fast-path).
- **Decisions made:** Extended Breakable with `currentDamageState()` + `'destroyed'` event + `heal()`. One iteration: initial impl listened for `'damaged'` to emit destroyed, but `Damageable._dead` flips AFTER damaged fires; switched to `'died'` listener. `Map<string, Building>` replaced internal Set in BuildingSystem to support cell-based lookup for repair.
- **Tests:** 214 → 235 (+21).

### #20 feat(ui): win/lose screens
- **Worker timing:** plan 19m 48s (anomalously high), impl 4m 2s, validate 12s. Wall-clock ≈ 24m 14s.
- **Orchestrator merge:** ~2m. SLOW-PATH (rebased onto 9fcfe6d). Clean rebase — no overlap with #15.
- **Plan vs actual files:** 13 created/modified. Slightly higher than ideal — runSignal extension + App.tsx edit are scope-adjacent.
- **Conflict:** none.
- **Decisions made:** Hedk'nah Pile dedup via React StrictMode wrapper test (first impl tried unrealistic unmount/remount dedup). gameStore `runStatus` slice + actions; pages render conditionally on it.
- **Tests:** 235 → 261 (+26).

### #21 feat(input): mobile touch controls
- **Worker timing:** plan 2m 12s, impl 3m 20s, validate 22s. Wall-clock ≈ 5m 54s.
- **Orchestrator merge:** ~2m. SLOW-PATH (rebased onto 3cec8ac). Clean rebase — git auto-merged systems/index.ts at different positions vs #15's edits.
- **Plan vs actual files:** 8 created/modified.
- **Conflict:** none.
- **Decisions made:** Phaser-agnostic `InputSystem` accepting raw `PointerLike` events. Optional `CameraLike` adapter + optional `hitTest` callback. Gesture thresholds in `src/data/input/gestures.json` (validated by zod — added input registration to dataRegistry). Mouse fallback: left=tap, right=inspect, wheel=zoom.
- **Tests:** 261 → 279 (+18).

## Summary

- **Wall-clock:** 1h 1m 38s (dispatch → final merge of #21). Slowest wave so far.
- **Issues merged:** 3 / 3 (100%).
- **Blocked:** 0.
- **Auto-resolved conflicts:** 0 (structured resolver). Two git-native clean rebases.
- **Biggest time burn:** #15 and #20 worker plan phases (~17–19m each — anomalous; usually 2m).
- **Plan/actual drift:** #20 added +3 unplanned files (App.tsx, runSignal extension) — adjacent scope but worth a code-review note.

## Notable observations

1. **Two workers had long planning phases (17m, 19m).** Both for moderately complex issues with many integration points. Hypothesis: as the codebase grows, workers spend more time exploring before planning. Could improve by including more orchestrator-side "anchor points" hints in the prompt.
2. **Zero structured-resolver invocations this wave.** Workers' touched files were disjoint enough for git's 3-way merge. "Add to different sections" + structural typing patterns compound positively.
3. **#21 worker's data-driven gesture config is exemplary.** Thresholds in `gestures.json` rather than code constants — gold-standard data-driven discipline.
4. **validate:data files: 12** (was 11) — #21 added gestures.json.

## M1 progress at end of wave 6

- **Merged: 20 / 23** (#1-10, #11-18, #20, #21)
- **Paused: 3** (#19, #22, #23)

## Newly unblocked after wave 6

- **#19** (build panel) → READY (deps #4 ✓ + #14 ✓ + #15 ✓)
- #22 still needs everything; #23 needs #22.

Wave 7 = #19 only. Then #22, then #23. **M1 completion forecast: 3 more waves, ~30 min total.**

---

# M1 Retro Metrics — Dry-run wave 7

**Started:** 2026-04-26T22:10:30Z
**Ended:** 2026-04-26T22:23:29Z
**Main SHA at start:** 9b514e3
**Main SHA at end:** ac495ea
**Scope:** Wave 7 dry-run — solo issue #19 (build panel). Last UI piece before #22 integration smoke.

## Per-issue

### #19 feat(ui): build panel + selection state
- **Worker timing:** plan 8m 3s (moderate — large existing UI codebase to reference), impl 2m 24s, validate 8s. Wall-clock ≈ 10m 35s.
- **Orchestrator merge:** ~2m. FAST-PATH (solo wave — no contention).
- **Plan vs actual files:** 6 created/modified. Match.
- **Conflict:** none.
- **Decisions made:** Thin `selectedTile` / `selectedWall` slice on gameStore (additive) — keeps UI orthogonal to input-system wiring (#21). BuildPanel takes prop callbacks for confirm-build / confirm-repair — keeps the organism jsdom-testable.
- **Tests:** 279 → 296 (+17).

## Summary

- **Wall-clock:** 12m 59s (dispatch → final merge).
- **Issues merged:** 1 / 1 (100%).
- **Blocked:** 0.
- **Auto-resolved conflicts:** 0 (solo wave, fast-path).
- **Plan/actual drift:** none.

## Notable observations

1. **Solo waves are clean and fast.** No conflict surface, no rebase complications. ~13 min for an issue that built 2 React components + tests + store slice + string keys. This validates the orchestration pattern when ready-set has only one issue.
2. **Worker followed established patterns precisely.** Atomic decomposition (atom Button reused → molecule BuildSlot → organism BuildPanel). gameStore additive slice. Prop callbacks for testability. Pattern-following has paid off as the codebase has grown.
3. **#19 worker's plan phase 8m** — middle-ground (between wave 6's 17–19m anomaly and the typical 2m). Possibly the codebase is large enough now that plan phases settle around 5–10m for non-trivial UI work.

## M1 progress at end of wave 7

- **Merged: 21 / 23** (#1-#21)
- **Paused: 2** (#22, #23)

## Newly unblocked after wave 7

- **#22** (integration smoke test) → READY (deps: all #1–#21 ✓)
- #23 still waits on #22.

Wave 8 = #22 (solo, integration test). Wave 9 = #23 (tile-size lock chore). M1 done after wave 9.

---

# M1 Retro Metrics — Dry-run wave 8

**Started:** 2026-04-27T02:22:43Z
**Ended:** 2026-04-27T02:34:52Z
**Main SHA at start:** 76fb1b1
**Main SHA at end:** df41145
**Scope:** Wave 8 dry-run — solo issue #22 (integration smoke test). M1 GO/NO-GO gate.

## Per-issue

### #22 test(m1): integration smoke + grep guard
- **Worker timing:** plan 2m 4s, impl 6m 12s, validate 0s. Wall-clock ≈ 8m 16s.
- **Orchestrator merge:** ~3m. FAST-PATH (solo wave).
- **Plan vs actual files:** 4 created. Match.
- **Conflict:** none.
- **Decisions made:** Single shared `SimpleEventEmitter` bus pattern; tick-based loop; jsdom-safe (no Phaser imports). Grep guard whitelist tuned for `AI.ts` default aggro radius + `Input.ts` DOM pointer button code (both legitimate non-balance literals).
- **Tests:** 296 → 306 (+10).

## Smoke test outcome

**Conditional GO.** All four gates green; the 5-wave simulated run completes in well under the 5-minute sim cap on the very first wired pass. Grep guard caught zero balance violations across 8 system files.

### Soft blocker follow-ups (documented in `docs/plans/PLAN-m1-smoke.md`)
1. **WaveSystem default-emitter quirk:** `WaveSystem`'s `emitter` defaults to a fresh local emitter rather than requiring the caller's bus, which silently drops lifecycle events on first run until callers explicitly pass `emitter: bus`. Trap for future integrators. Suggested fix: make emitter required, OR document the default's gotcha prominently.
2. **AI WallLike adapter for optional Building.cell:** AI's `WallLike` shape requires a 4-line adapter on top of `Building` because `Building.cell` is optional. Suggested fix: tighten `Building.cell` (require non-optional) OR have AI accept the optional-cell variant directly.

Neither blocks M1. Both are appropriate to file as M2 follow-ups.

### Manual playtest deferral
Per orchestrator scope notes, browser-based playtest at desktop + mobile @ 375px + FPS verify with 100+ entities is **deferred to human review**. The worker explicitly cannot run a browser. Documented in findings doc.

## Summary

- **Wall-clock:** 12m 9s (dispatch → final merge).
- **Issues merged:** 1 / 1.
- **Blocked:** 0.
- **Auto-resolved conflicts:** 0 (solo, fast-path).
- **Plan/actual drift:** none.

## Notable observations

1. **Integration came together cleanly on first wiring.** This is the strongest signal yet that the workers' "structural typing + structural-resolver discipline + add-only barrels" pattern compounds positively. Eight independent system implementations, no rework needed at integration.
2. **Smoke test runtime is under sim cap.** Indicates the data-driven balance is reasonable — wave 5 is beatable per the issue spec.
3. **Two soft blockers found, none hard.** Surfacing these is exactly what the smoke test is for. Filing as M2 follow-ups is the right call.
4. **Worker strictly followed scope-discipline rules.** Did NOT call `gh issue create` (per orchestrator note); documented blockers in plan doc instead.

## M1 progress at end of wave 8

- **Merged: 22 / 23** (#1-#22)
- **Paused: 1** (#23)

## Newly unblocked after wave 8

- **#23** (tile-size lock chore) → READY (deps: #22 ✓)

Wave 9 = #23 only — final M1 issue.
