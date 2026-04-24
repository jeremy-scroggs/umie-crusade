# Proposal — Autonomous parallel workflow for milestones

**Status:** Finalized design reflecting decisions locked in. Implementation follows separately.

## Goal

Run multiple issues within a milestone in tandem and autonomously — each worker plans, implements, and validates without approval gates — so a milestone completes in fewer calendar days with a single human hand on the wheel (the main Claude session). At the end of each milestone we retrospect on where time and tokens went and feed that into streamlining the next one.

## Non-goals

- Fully autonomous cross-milestone runs — a human decides when a milestone begins.
- Parallel merging — merges stay serial so conflicts surface one at a time.
- Cross-Claude-session continuity as a requirement — though cold-resume is cheap by design.

## Decisions locked in

- **Batch size cap:** 3 parallel workers at a time.
- **Retry cap:** 3 attempts per failing check (typecheck / lint / test / validate:data), then bail.
- **Auto-merge:** yes, with rollback. Merged feature branches retained for the milestone so `git reset --hard <sha>` can cleanly undo any merge.
- **Orchestrator location:** main Claude session, in the main checkout. Live progress visible; user can intervene but doesn't need to.
- **Skill + `CLAUDE.md` visibility:** both remain gitignored (private process). Worker subagents do **not** invoke `/skill` calls — the workflow is embedded verbatim in every worker prompt.

## Architecture

```
main session (orchestrator, in main checkout)
├── reads status board, computes ready-to-plan and ready-to-execute issues
├── spawns up to 3 workers in git worktrees (run_in_background)
│   └── each worker: research → plan → implement → gate → commit (on its own branch)
├── receives worker-done notifications
└── merges validated branches serially (rebase-on-divergence, bail on semantic conflict)
```

**Per-issue lifecycle:**

1. **Select.** Orchestrator picks the next `queued` issue whose deps are `merged`, up to the batch cap.
2. **Dispatch.** Spawns `Agent(subagent_type: "general-purpose", isolation: "worktree", run_in_background: true)`. The prompt embeds the full workflow — there is no reliance on `/skill`.
3. **Work.** Worker commits on `feat/<N>-<slug>`. Never pushes. Never merges. Ends in `validated` or `blocked`.
4. **Merge.** On each worker completion, orchestrator in the main checkout handles the serial merge (auto-rebase, structured conflict resolution, ff-only merge, push, retain branch).
5. **Iterate.** Orchestrator immediately dispatches the next now-unblocked issue.

## Worker prompt contract

The worker never sees project skills or `CLAUDE.md`. Every prompt spawned by the orchestrator embeds:

- **Project context:** canon rules extracted from `CLAUDE.md` — data-driven (all balance in `src/data/*.json`), atomic design for React, composition for Phaser, kebab-case assets, mobile-first, conventional commits.
- **Issue details:** `gh issue view <N>` output inlined so the worker doesn't need to re-fetch.
- **Workflow steps** in order: research → write plan doc → create branch → implement → run local gate → commit → update status board.
- **Autonomy rules and bail conditions** (below).
- **Metrics to report** on exit (below).

The orchestrator has a single prompt template; per-issue variation is small (number, title, deps-resolved context, current main SHA).

## Autonomy rules

- **Ambiguity in the issue:** choose the most conservative interpretation that avoids downstream constraints, document the decision + reasoning in the plan doc's `## Decisions` section, continue. Do not stop and ask.
- **Scope creep:** always defer. The issue's acceptance criteria bound the scope.
- **No `EnterPlanMode` / `ExitPlanMode`:** workers don't use plan mode at all. They write the plan file and proceed.
- **Commit message is generated:** template `<type>(<scope>): <short-description>, closes #<N>`. No confirmation.
- **New npm dependency:** NOT allowed mid-run. Bail with `blocked: needs-dep-<name>`.
- **Edit discipline on shared files:** workers may edit shared files (e.g. `src/data/schemas/index.ts` registry) but only via additive changes. Never re-order. Never delete other entries.

## Bail conditions

A worker exits cleanly marking `blocked: <reason>` in its status row when any of these hit:

- 3 consecutive failed attempts at the same check
- A new dependency would be required
- A required upstream data file referenced by the plan is missing
- Irreconcilable conflict between issue scope and existing code

Orchestrator treats `blocked` as a pause — the worktree and branch are retained; the issue is skipped; the user unblocks manually later.

## Auto-merge + conflict handling

When a worker finishes with `validated`, orchestrator in the main checkout:

1. `git fetch origin && git pull --ff-only origin main` — sync main.
2. `git checkout <feature-branch> && git rebase main`.
3. **Clean rebase** → checkout main, `git merge --ff-only <branch>`, run local gate, push. Record `merged` with SHA in the status board.
4. **Structured conflict** (both sides appending additively to a list/registry/barrel — detectable when each conflict hunk's `<<<<<<<` and `>>>>>>>` sides are both pure additions): concatenate both, continue rebase, proceed to merge.
5. **Semantic conflict** (anything else): mark `blocked: merge-conflict`, leave the branch untouched, continue to the next issue.
6. **Post-merge local-gate failure** (rare — rebase introduced a silent break): revert via `git reset --hard <last-known-good-sha>`, mark `blocked: post-merge-gate-failure`, surface to user. Retained per-milestone branches make the revert clean.

Force-push to main is never done automatically. The only time force-push to main happens is when the user explicitly authorizes a rollback.

## Rollback strategy

- Feature branches are **retained** through the milestone — not deleted at merge time.
- Orchestrator keeps a `merged:` list in the status board with SHAs.
- To revert: `git reset --hard <sha-before-bad-merge>`, user-confirmed force-push.
- At milestone end, after user ratifies, branches are bulk-deleted.

## Status board

Location: `docs/plans/status/M<N>.md` — one file per milestone.

```markdown
| # | Title | Phase | Branch | Plan doc | Depends on | Started | Ended | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | data(schemas) | merged | — | PLAN-01-zod-schemas.md | — | 2026-04-23 12:34 | 2026-04-23 14:10 | sha f25fdd6 |
| 2 | data(units) | executing | feat/2-units | PLAN-02-units.md | #1 | 2026-04-23 14:12 | — | — |
| 11 | data(buildings) | queued | — | — | #1 | — | — | — |
```

**Phases:** `queued → planning → planned → executing → validated → merged`, or `blocked: <reason>`.

**Edit discipline:** each worker edits only its own row; orchestrator edits merge-phase columns (`Ended`, `Notes`, phase flip to `merged`). Parallel single-row edits via `Edit` tool with row-unique `old_string` are safe.

## Retro metrics

Location: `docs/plans/retro/M<N>-metrics.md`. Appended per issue on completion.

For each issue:
- Timestamps per phase (planning, executing, validated, merged)
- Token usage per phase (if available from Claude Code runtime)
- Files-created-vs-plan delta — did the plan match reality?
- Conflict encountered: none / auto-resolved / blocked
- Bail reason, if any
- Test count before vs. after

At milestone end, orchestrator produces a retro summary: which phases burned the most tokens, which issues had the biggest plan-vs-reality drift, which bails were preventable. That feeds the next milestone's workflow tweaks.

## Safe stops

Every phase ends with a durable artifact. Fresh sessions resume by reading the status board and inspecting artifacts.

| Phase | Artifact | Resume signal |
|---|---|---|
| queued | row in status board | none — just pick up |
| planning | none yet | mid-research — restart worker clean |
| planned | `docs/plans/PLAN-NN-<slug>.md` | plan file exists |
| executing | commits on `feat/NN-<slug>` | branch exists + plan present |
| validated | same commits + row marked `validated` | local gate already verified |
| merged | SHA on main, row updated | commit trailer has `closes #N` |
| blocked | row: `blocked: <reason>` | human unblocks |

## Risks

- **Token cost.** 3 parallel × ~40–80k per issue ≈ 120–240k per wave. Typical milestone ≈ 2–3 waves. Hard orchestrator abort at a user-set milestone cap.
- **Auto-merge over-reach.** Structured-conflict auto-resolve is only safe for additive conflicts. Everything else blocks. Acceptable; surfaces to human.
- **Plan-vs-reality drift.** Without human plan review, a subtly wrong plan ships. The local gate catches build/test failures but not semantic bugs. The retrospective is how we learn — intentional tradeoff.
- **Status board races.** Workers only edit their own row; orchestrator only edits merge columns. No two workers ever hold the same row.
- **Worker infinite-loop risk on retries.** Capped at 3 per check; total worker wall-clock capped by the Agent tool's default timeout.

## Rollout

1. **Land this proposal** (current step).
2. **Build `/drive-milestone` skill.** Worker prompt template, orchestrator loop, auto-merge handler. Skill lives in `.claude/skills/drive-milestone/` (gitignored — local only).
3. **Dry-run on 2 M1 issues** — candidates: #2 (units) and #11 (buildings). Both data-only, both unblocked after #1, low merge-conflict surface. Verify status board, auto-merge, retro metrics.
4. **Full M1 run if dry-run clean.** Drive all remaining M1 issues.
5. **M1 retrospective.** Numbers + narrative. Adjust before M2.

## Out of scope

- CI-before-merge: we merge on local-gate green; CI is a backstop, not a gate.
- Cross-milestone session continuity.
- Automated acceptance-criteria checking beyond what `/validate` does today.
