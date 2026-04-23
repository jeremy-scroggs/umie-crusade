---
name: pr
description: Create a pull request for the current branch
user_invocable: true
---

# /pr — Create a pull request

## Purpose

Push the current branch and create a pull request against main.

## Steps

1. Run `git status` to verify working tree is clean (all changes committed).
2. Run `git log main..HEAD --oneline` to see all commits that will be in the PR.
3. Run `git diff main...HEAD` to see the full diff.
4. Check if the branch is pushed: `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null`
5. If not pushed, push with: `git push -u origin <branch-name>`
6. Draft the PR:
   - **Title:** `<type>(<scope>): <description> (#<issue>)` — under 70 chars
   - **Body:**
     ```markdown
     ## Summary
     - bullet points describing what this PR does

     ## Test plan
     - [ ] checklist of verification steps
     ```
7. Create the PR:
   ```
   gh pr create --base main --title "<title>" --body "<body>"
   ```
8. Print the PR URL.

## Rules

- Always verify the working tree is clean before creating a PR.
- Always push before creating the PR.
- Keep the PR title under 70 characters — use the body for details.
- The test plan should include specific verification steps, not just "run tests".
- If the PR closes an issue, include `Closes #<N>` in the summary.
- Do NOT add reviewers (solo project).
- Do NOT force push.
