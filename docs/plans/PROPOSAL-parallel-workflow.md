# Proposal — Parallel issue workflow for M1

**Status:** Draft for user review. No code changes yet.

## Goal

Run multiple Milestone issues in tandem — plan several at once, execute several at once, merge serially — so a milestone completes in fewer calendar days without losing the per-issue gate model. Each phase must produce a durable artifact so any agent (including a fresh session) can resume cold.

## Non-goals

- Fully autonomous "finish M1 while you sleep" — deferred until the batch flow feels trustworthy.
- Auto-merge on green — merge stays a human-initiated `/merge` call.
- Parallel merging — merges remain serial so conflicts surface one at a time.

## Architecture

```
       ┌── plan agent (worktree #1, issue #N1) ─┐
user ──┼── plan agent (worktree #2, issue #N2) ─┼── plan docs → batch review
       └── plan agent (worktree #3, issue #N3) ─┘

       ┌── execute agent (worktree #1) ─┐
user ──┼── execute agent (worktree #2) ─┼── commits on branches → serial /merge
       └── execute agent (worktree #3) ─┘
```

### Isolation

Each parallel agent runs with the `Agent` tool's `isolation: "worktree"` option. That gives it:
- A temporary `git worktree` on a fresh branch
- Its own copy of `node_modules` would be wasteful — the worktree shares the repo's node_modules, which is fine as long as agents don't `pnpm install` in parallel (they won't, unless the plan adds a dep)

### Status board

Single source of truth: `docs/plans/M1-STATUS.md`. One-line-per-issue table:

```markdown
| # | Title | Phase | Branch | Plan doc | Depends on |
|---|---|---|---|---|---|
| 1 | data(schemas) | merged | — | PLAN-01-zod-schemas.md | — |
| 2 | data(units) | planned | feat/2-units (worktree) | PLAN-02-units.md | #1 |
| 3 | data(waves) | planning | — | — | #1 |
```

**Phases:** `queued → planning → planned → executing → validated → merged` (or `blocked`).

Every agent:
1. Reads this file on start to know its context.
2. Updates its own row when transitioning phases.
3. Never edits another issue's row.

### Dependency resolution

Agents pick work only when all its `Depends on` issues are `merged`. The driver skill computes "ready to plan / ready to execute" sets from the status board. For M1 the DAG is in the issue bodies' `Dependencies` section; I'll extract it once into the status board and keep it static.

## New / changed skills

### New: `/batch-plan <issue...>`
Driver that takes N issue numbers, spawns N parallel `Agent(subagent_type: general-purpose, isolation: "worktree")` instances. Each one:
1. Runs `/review` internally (reads issue + explores).
2. Runs `/plan` in auto mode (see below) — writes `docs/plans/PLAN-NN-<slug>.md` to the main repo's worktree.
3. Updates its row in `M1-STATUS.md` to `planned`.
4. Exits.

Driver then prints a summary: N plan docs written, paths listed. User reviews all at once, edits plans directly if needed, signals approval.

### New: `/batch-execute <issue...>`
Takes N issue numbers that are `planned`, spawns N parallel execute agents. Each one:
1. Reads its plan doc.
2. Creates branch `feat/NN-<slug>` inside its worktree.
3. Runs `/execute` + `/validate` + `/commit` in auto mode.
4. Updates row to `validated`.
5. Exits without pushing or merging.

Driver prints summary: which branches are ready to merge, in what dep order. User runs `/merge` on each in order.

### Changed: `/plan --auto`
- Current: interactive, blocks on `ExitPlanMode`.
- Auto mode: writes the plan file and exits without calling `ExitPlanMode`. Does not execute code. Meant only for use from a batch driver.
- Interactive `/plan` unchanged for solo use.

### Changed: `/commit --auto`
- Current: asks for message approval.
- Auto mode: generates message from conventional-commit prefix + plan title + `closes #N`, commits without asking.
- Interactive unchanged.

### Unchanged: `/merge`
Stays serial, stays user-invoked. Each call merges one branch; conflicts get manual resolution. The parallel flow ends at "branches ready" — the serial bottleneck is intentional.

## Safe stops

"Safe stop" == every phase produces one of these artifacts:

| Phase | Artifact | Resume signal |
|---|---|---|
| queued | row in `M1-STATUS.md` | none — just pick it up |
| planning | none yet | agent bailed mid-review — restart fresh |
| planned | `docs/plans/PLAN-NN-<slug>.md` | plan doc exists |
| executing | commits on `feat/NN-<slug>` | branch exists, plan doc present |
| validated | same commits + status row says `validated` | branch exists, green gate already verified |
| merged | SHA on main | commit message has `closes #N` |

An agent that crashes or times out mid-phase writes `blocked: <reason>` in its status row and exits. The driver (or the user) inspects, decides whether to restart fresh or abandon the branch.

Worktrees from bailed agents that made no commits are auto-cleaned by the `Agent` tool. Worktrees with commits are kept; the branch is visible in `git branch -a` and can be picked up by `/merge`.

## Rollout

Four steps, each shippable on its own:

1. **Status board schema + hand-maintained.** Add `docs/plans/M1-STATUS.md` with all 23 rows, dep graph pre-filled. I update it manually for now. **Value:** durable progress view before any automation.

2. **Auto modes for `/plan` and `/commit`.** Add `--auto` flags with the behavior above. **Value:** lets a single agent run end-to-end on an issue with no interactive prompts, which is a prerequisite for batching.

3. **`/batch-plan`.** Parallelize only the planning phase first. This is the safer half — plans are text, not code. User still approves each one. **Value:** test worktree isolation + cross-agent status-board coordination on low-risk output.

4. **`/batch-execute`.** Parallelize execution. Higher risk (conflicts, shared file edits across worktrees) — gate this on step 3 working well.

## Risks & open questions

- **Cost.** N parallel agents = roughly Nx tokens vs. serial. A typical issue's /review+/plan+/execute+/validate is maybe 40k–80k tokens. A batch of 5 M1 issues ≈ 200k–400k. Worth it for calendar-time savings but not free — worth a hard batch-size cap (start at 3).
- **File conflicts across worktrees.** Different issues editing the same file (e.g. `src/types/index.ts`, `src/data/schemas/index.ts`) won't conflict at execute time but will at merge time. Mitigation: merge in dep order; if later branches touch earlier-merged files, rebase first. Already handled by `/merge`.
- **Shared-node_modules write contention.** If an agent runs `pnpm install` mid-execute, it races. Mitigation: rule — agents must not install deps without user approval (already in `/execute`). Keep it.
- **Status board races.** Two agents writing `M1-STATUS.md` at once. Mitigation: each agent edits only its own row via `Edit` tool with a unique `old_string`; parallel single-line edits on different rows are safe.
- **Plan-approval bottleneck.** User reviewing 5 plans at once is still a batch of work. If plans are uniform (e.g. four "data-only" issues with tiny schemas), they review fast. If they're divergent, the gate is still the gate.
- **Fresh-session resume.** A new Claude session starting the batch driver must pick up mid-M1 gracefully. The status board is the contract. Worth a small test: abandon mid-batch, restart, confirm driver recomputes `ready-to-execute` correctly from the board + branches on disk.

## Decision points for the user

Before I build this, worth settling:

1. **Batch size cap.** Start at 3 parallel? 5? Set in the driver skill.
2. **Plan approval UX.** Review all plans in-editor then tell me "approved", or do I emit an approval-checklist and you tick them off one by one?
3. **Should `/batch-execute` gate on all plans being approved, or let me execute plan-N as soon as plan-N is approved (true pipelining)?** Pipelining is strictly better throughput but harder to reason about.
4. **Board location.** `docs/plans/M1-STATUS.md` versus a `.claude/status.md` (out of repo tree). Pros of in-repo: survives git history, visible in PRs, durable. Cons: noise in diffs. My default: in-repo.
5. **When does this proposal itself get implemented?** After M1-0001 (schemas) lands on main, which is literally the next `/merge`. Or earlier?

## Next step if approved

Land this doc on main (or as a branch), then open a GitHub issue `chore(workflow): implement parallel issue workflow` tracking the 4-step rollout. Step 1 (status board) is maybe 20 minutes of work; step 2 is a few hours; steps 3 and 4 are a half-day each.
