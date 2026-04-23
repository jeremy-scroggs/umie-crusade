---
name: commit
description: Create a conventional commit for the current changes
user_invocable: true
---

# /commit — Create a conventional commit

## Purpose

Stage and commit changes with a properly formatted conventional commit message.

## Steps

1. Run `git status` to see all changed/untracked files.
2. Run `git diff` to review changes.
3. Verify that changes match the work done in `/execute`.
4. Stage files by name — never use `git add -A` or `git add .`.
   - Do NOT stage files that contain secrets (.env, credentials, etc.)
   - Do NOT stage unrelated changes
5. Draft a commit message following the format:
   ```
   <type>(<scope>): <description>
   ```
   - Types: `feat`, `fix`, `refactor`, `data`, `lore`, `art`, `docs`, `test`, `chore`
   - Scope: the area of code (e.g., `pathfinding`, `hud`, `units`, `schemas`)
   - Description: imperative mood, lowercase, no period, under 72 chars
   - If linked to an issue: append `, closes #<N>`
6. Present the commit message to the user for approval.
7. After approval, create the commit.
8. Run `git status` to verify the commit succeeded.

## Rules

- Always get user approval on the commit message before committing.
- Never use `git add -A` or `git add .` — stage files individually.
- Never amend a previous commit unless the user explicitly asks.
- Never skip hooks (`--no-verify`).
- Keep messages concise — one line, no body, no co-authored-by.
- If there are multiple logical changes, suggest splitting into multiple commits.

## Examples

```
feat(pathfinding): implement A* grid with easystarjs, closes #12
data(units): add mougg-grunt and peasant-levy definitions
fix(hud): correct gold counter not updating on enemy kill
refactor(scenes): extract tilemap loading into PreloadScene
test(gameStore): add unit tests for gold and wave actions
```
