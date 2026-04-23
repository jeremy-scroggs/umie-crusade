---
name: milestone
description: Analyze a milestone from PROJECT_PLAN.md and create ordered GitHub issues
user_invocable: true
---

# /milestone — Break a milestone into GitHub issues

## Purpose

Read a milestone section from `docs/PROJECT_PLAN.md`, decompose it into discrete, implementable GitHub issues with dependency ordering, and create them via the `gh` CLI. This produces a ready-to-work backlog.

## Input

The user provides a milestone identifier (e.g., "M1", "M2") or a section reference.

## Steps

1. Read `docs/PROJECT_PLAN.md` and locate the milestone section.
2. Read any existing issues for this milestone: `gh issue list --milestone <milestone> --state all`
3. Break the milestone into discrete, implementable work items. Each issue should be:
   - Small enough to complete in one session (S = ~1hr, M = ~2-3hrs, L = ~half day)
   - Self-contained with clear acceptance criteria
   - Ordered by dependency (schemas before systems, systems before UI)
4. For each issue, determine:
   - **Title:** conventional-commit-style prefix (e.g., `feat(pathfinding): implement A* grid with easystarjs`)
   - **Description:** what needs to be built, which files are affected, acceptance criteria
   - **Data files affected:** which JSON schemas or data files need creation/modification
   - **Blocked by:** which other issues in this milestone must be completed first
   - **Size estimate:** S / M / L
5. Present the full issue list to the user for approval before creating anything.
6. After approval, create a GitHub milestone if it doesn't exist:
   ```
   gh api repos/{owner}/{repo}/milestones --method POST -f title="M1 — Vertical Slice" -f state="open"
   ```
7. Create each issue via `gh issue create` with:
   - Title
   - Body (description + acceptance criteria + dependencies + size)
   - Milestone label
   - Labels: `size:S`, `size:M`, or `size:L`
8. Print a summary table: issue number | title | blocked-by | size

## Rules

- Do NOT start any implementation work — this skill only produces a backlog.
- Do NOT create duplicate issues — check existing issues first.
- Respect the data-driven rule: if a feature needs balance numbers, the data schema/JSON issue comes first.
- Include a "smoke test" or "integration verify" issue at the end of each milestone if appropriate.
- Keep issue titles under 80 characters.
- Always include `## Acceptance Criteria` as a checklist in the issue body.
- Always include `## Dependencies` listing blocked-by issue titles (numbers added after creation).

## Output Format

```
## Milestone M1 — Vertical Slice (N issues)

| # | Title | Blocked by | Size |
|---|---|---|---|
| 1 | data(units): define orc and human unit schemas | — | S |
| 2 | feat(pathfinding): implement A* grid with easystarjs | #1 | M |
| ... | ... | ... | ... |

Create these issues? (y/n)
```
