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
