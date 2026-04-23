---
name: execute
description: Execute the approved implementation plan — build the feature
user_invocable: true
---

# /execute — Build per the approved plan

## Purpose

Implement the approved plan. Follow it exactly. Flag deviations.

## Steps

1. Confirm there is an approved plan (from `/plan` phase or a `docs/plans/PLAN-*.md` file).
2. Check out the correct branch: `git checkout -b <branch-name>` (or switch to it if it exists).
3. Follow the plan in order:
   - **Data first:** create/update JSON files and Zod schemas
   - **Systems:** implement game logic, state changes
   - **UI:** build React components, wire up to state
   - **Polish:** responsive checks, edge cases
4. Use sub-agents for parallel independent work where possible.
5. After all changes are made, report:
   - What was done (files created/modified)
   - Any deviations from the plan and why
   - What to verify next

## Rules

- Follow the approved plan exactly. If you need to deviate, explain why before proceeding.
- Build data-first: JSON + schema → systems → UI → polish.
- No magic numbers in code — all balance values in JSON under `src/data/`.
- No new npm packages without user approval.
- Do NOT commit or push — that's the `/commit` and `/pr` skills.
- Do NOT skip files listed in the plan.
- If you discover something unexpected, flag it rather than silently working around it.
- Keep the code simple. Don't over-engineer. Don't add features beyond what the issue asks.
