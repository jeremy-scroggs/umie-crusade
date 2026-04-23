---
name: validate
description: Validate implementation against the original issue and approved plan
user_invocable: true
---

# /validate — Verify the implementation

## Purpose

Check that the implementation matches the original issue requirements and the approved plan. Catch gaps before committing.

## Steps

1. Re-read the original issue: `gh issue view <number>`
2. Re-read the approved plan (from conversation context or `docs/plans/`).
3. Review all changed files: `git diff` and `git status`
4. Run automated checks:
   - `pnpm typecheck` — zero errors
   - `pnpm lint` — zero errors
   - `pnpm test -- --run` — all tests pass
   - `pnpm validate:data` — all data files valid
5. Check for gaps:
   - Does every acceptance criterion in the issue have a corresponding change?
   - Are there any magic numbers that escaped into code?
   - Were all files listed in the plan created/modified?
   - Are new tests written for new logic?
6. If UI was changed:
   - Verify on mobile viewport (375px wide)
   - Check touch interactions work
7. Report results:
   - **Passing:** list of checks that pass
   - **Issues found:** list of problems that need fixing
   - **Recommendation:** ready to commit, or needs fixes first

## Rules

- Do NOT make code changes during validation — only report findings.
- If issues are found, the user decides whether to fix now or defer.
- Be thorough: check every acceptance criterion individually.
- Always run the automated checks — don't skip any.
