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
