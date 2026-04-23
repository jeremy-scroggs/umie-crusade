---
name: plan
description: Design an implementation plan for the current issue, get user approval
user_invocable: true
---

# /plan — Create an implementation plan

## Purpose

Design a detailed implementation plan for the issue under review. Get user approval before any code is written.

## Steps

1. Enter plan mode with the EnterPlanMode tool.
2. If not already done, explore the codebase with sub-agents to understand:
   - Existing patterns to follow
   - Files that need modification
   - Data schemas involved
   - Test patterns in use
3. Design the implementation approach:
   - **Branch name:** `<type>/<issue-number>-<short-description>` (e.g., `feat/12-pathfinding`)
   - **Numbered changes by file:** what to create, what to modify, in what order
   - **Data-first:** always list JSON/schema changes before system/UI changes
   - **Test strategy:** what tests to write, what to validate
   - **Risks:** what could go wrong, how to mitigate
4. Present the plan clearly. Include:
   - Ordered list of files to create/modify with descriptions of changes
   - Any new dependencies needed
   - Which existing tests need updating
   - Verification steps (what commands to run, what to check visually)
5. Wait for user approval.
6. Exit plan mode with ExitPlanMode tool once approved.

## Rules

- Do NOT write any code during planning.
- Do NOT skip user approval — the plan must be explicitly approved before moving to `/execute`.
- Keep plans focused on the current issue — don't scope-creep into adjacent work.
- If the plan reveals the issue should be split, recommend that to the user.
- Always include verification steps that prove the feature works.
- For UI work, always include a mobile viewport check in verification.
- Respect the data-driven rule: if balance numbers are involved, they go in JSON, not code.
