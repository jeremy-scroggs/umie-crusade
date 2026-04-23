# Umie Crusade — Claude Code Guide

A web-based, mobile-responsive, top-down pixel-art orc base/tower-defense hybrid. The player commands Bloodrock orcs defending against the Umie Crusade (human zealots).

## Commands

| Script | Purpose |
|---|---|
| `pnpm dev` | Start Vite dev server (port 3000) |
| `pnpm build` | Typecheck + production build |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | Run TypeScript compiler checks |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Run ESLint with auto-fix |
| `pnpm test` | Run Vitest (watch mode) |
| `pnpm validate:data` | Validate all JSON data files against Zod schemas |

## Architecture

- **Phaser 3** — game engine, canvas rendering, scenes, entities, systems
- **React 18** — DOM UI overlay (HUD, menus, build panels) using atomic design
- **Zustand** — shared state bridge between Phaser and React
- **Data layer** — all balance numbers, unit defs, wave specs in JSON under `src/data/`, validated by Zod
- **Tiled** — map format (JSON exports in `src/data/maps/`)

### Key directories

```
src/game/         # Phaser: scenes, entities, systems, components, config
src/ui/           # React: atoms, molecules, organisms, templates, pages
src/state/        # Zustand stores + Phaser↔React bridge
src/data/         # JSON data files + Zod schemas
src/lib/          # Pure utilities
src/types/        # Shared TypeScript types
tests/            # Vitest tests
docs/             # Project plan, lore, architecture docs
docs/plans/       # Per-feature implementation plans
```

## Rules

### Data-driven (non-negotiable)
All balance numbers, stats, wave compositions, and unit definitions live in JSON under `src/data/`. Systems read definitions at runtime. Never hardcode a magic number. If you catch yourself writing one, stop and move it to data.

### Atomic design (React only)
The React UI overlay follows atomic design: atoms → molecules → organisms → templates → pages. Phaser game entities use composition (Damageable, Targetable, etc.) — do NOT force atomic design onto sprites.

### Code style
- ESLint flat config with typescript-eslint
- 2-space indent
- Single quotes
- Semicolons required
- TypeScript strict mode

### Commit conventions
Conventional commits: `feat:`, `fix:`, `refactor:`, `data:`, `lore:`, `art:`, `docs:`, `test:`, `chore:`. Small commits, frequent pushes. When linked to an issue: `<type>(<scope>): <description>, closes #<N>`.

### Asset naming
Kebab-case, namespaced by category: `orcs/mougg-grunt.png`, `buildings/wall-wood.png`.

### Mobile-first
Touch-first design. Any new UI must be verified on a mobile viewport (375px wide) before being considered done. Phaser canvas uses `Scale.FIT` at 1280x720 virtual resolution.

### IP guardrails
The Bloodrock Clan lore (gods, virtues, language, bloodlines) is the player-author's own creation — use freely. **Off-limits:** Ultima/UO IP — no Britannian virtues, no Shadowlord names, no UO place names. The Umie Crusade faction is game-original.

### Git rules
- Never force push
- Never commit directly to main without a PR (unless scaffold/bootstrap)
- Never skip hooks (`--no-verify`)
- Stage files by name, never `git add -A`
- Always create NEW commits, never amend unless explicitly asked

## Workflow

Every feature follows this pipeline. Use the corresponding `/skill` slash command:

1. `/milestone` — Break a milestone into ordered GitHub issues
2. `/review <issue#>` — Research the issue and relevant code
3. `/plan` — Design the implementation, get approval
4. `/execute` — Build per the approved plan
5. `/validate` — Verify against issue and plan
6. `/commit` — Create a conventional commit
7. `/pr` — Create a pull request
