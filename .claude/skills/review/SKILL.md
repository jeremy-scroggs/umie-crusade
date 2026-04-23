---
name: review
description: Review a GitHub issue — research codebase, summarize scope, prepare for planning
user_invocable: true
---

# /review — Review a GitHub issue

## Purpose

Understand what a GitHub issue asks, research the relevant codebase areas, and summarize findings so the next step (planning) starts from solid ground.

## Input

The user provides a GitHub issue number.

## Steps

1. Fetch the issue: `gh issue view <number>`
2. Read the issue description, acceptance criteria, and dependencies thoroughly.
3. Check if dependencies are resolved: `gh issue view <dep-number> --json state`
4. Use sub-agents (subagent_type: Explore) to research relevant codebase areas:
   - Find existing files that will be modified
   - Find patterns to follow (how similar features were implemented)
   - Identify data schemas that need updating
   - Check for related tests
5. Summarize findings:
   - **What the issue asks** — one paragraph
   - **Files and patterns involved** — list of files to create/modify
   - **Data files affected** — JSON schemas and data files
   - **Risks and edge cases** — what could go wrong
   - **Ambiguities** — anything unclear that needs user input
6. Present summary and ask: "Ready to move to `/plan`?"

## Rules

- Do NOT write any code during review — research only.
- Do NOT skip dependency checks — if a blocking issue is still open, flag it.
- If the issue is ambiguous, ask the user for clarification before proceeding.
- Read `docs/PROJECT_PLAN.md` for context on how this issue fits into the bigger picture.
- Check `docs/plans/` for any existing plan documents related to this work.
