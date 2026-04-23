# PLAN-M0 — Scaffold

> **Status:** Complete
> **Milestone:** M0
> **Goal:** Wire up the full tech stack, prove the Phaser-React-Zustand bridge works, establish CI, seed lore docs, and set up the Claude Code workflow so every future feature follows a repeatable process.

---

## 1. Scope

By the end of M0, the repo should:

- Build and run with `pnpm dev` — Phaser canvas renders a placeholder tilemap, React HUD overlay shows a gold counter that updates from Phaser events.
- Pass CI on every push: typecheck, lint, test, data-validate.
- Have MIT license, README, LORE.md, and CLAUDE.md in place.
- Have a `.claude/skills/` directory with reusable workflow skills (review, plan, execute, validate, commit, pr, review-pr, pr-feedback).
- Have GitHub issue templates for features and bugs.

**Out of scope for M0:** gameplay, pathfinding, touch controls, PWA, audio, hero creation, any real art assets.

---

## 2. Packages

### Production Dependencies

| Package | Version | Purpose |
|---|---|---|
| `phaser` | `^3.87` | Game engine |
| `react` | `^18.3` | UI overlay |
| `react-dom` | `^18.3` | React DOM renderer |
| `zustand` | `^5.0` | Shared state (Phaser + React) |
| `zod` | `^3.24` | Data schema validation |
| `easystarjs` | `^0.4` | A* pathfinding (installed now, used M1) |

### Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^5.7` | Language |
| `vite` | `^6.3` | Build tool |
| `@vitejs/plugin-react` | `^4.4` | React fast-refresh |
| `tailwindcss` | `^4.1` | Utility-first CSS |
| `@tailwindcss/vite` | `^4.1` | Tailwind Vite plugin |
| `vitest` | `^3.1` | Test runner |
| `@testing-library/react` | `^16.3` | React component tests |
| `jsdom` | `^26.1` | DOM env for Vitest |
| `eslint` | `^9.25` | Linting |
| `@eslint/js` | `^9.25` | ESLint core rules |
| `typescript-eslint` | `^8.31` | TS lint rules |
| `eslint-plugin-react-hooks` | `^5.2` | React hooks lint |
| `eslint-plugin-react-refresh` | `^0.4` | Fast-refresh lint |
| `@types/react` | `^18.3` | React type defs |
| `@types/react-dom` | `^18.3` | ReactDOM type defs |

---

## 3. File Tree

```
umie-crusade/
├── .gitignore
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── feature.yml              # Structured feature request template
│   │   └── bug.yml                  # Structured bug report template
│   └── workflows/
│       └── ci.yml                   # Typecheck + lint + test + data-validate
├── .claude/
│   └── skills/
│       ├── milestone/SKILL.md       # Analyze a milestone → create GitHub issues
│       ├── review/SKILL.md          # Phase 1: Review issue + research codebase
│       ├── plan/SKILL.md            # Phase 2: Design implementation plan
│       ├── execute/SKILL.md         # Phase 3: Build per approved plan
│       ├── validate/SKILL.md        # Phase 4: Verify against issue + plan
│       ├── commit/SKILL.md          # Phase 5: Conventional commit
│       └── pr/SKILL.md              # Phase 6: Create pull request
├── CLAUDE.md                        # Operating rules for Claude Code
├── LICENSE                          # MIT
├── README.md                        # Project overview + dev setup
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── eslint.config.js
├── index.html                       # Vite entry
├── public/
│   └── assets/
│       └── placeholder-tileset.png  # Colored-square 32x32 tileset
├── src/
│   ├── main.tsx                     # React entry — mounts App
│   ├── App.tsx                      # Mounts PhaserGame + GameLayout
│   ├── App.css                      # Tailwind imports
│   ├── vite-env.d.ts                # Vite client types
│   ├── game/
│   │   ├── config.ts                # Phaser GameConfig
│   │   ├── PhaserGame.tsx           # React component: mount/destroy Phaser
│   │   └── scenes/
│   │       ├── BootScene.ts         # Load placeholder assets
│   │       ├── PreloadScene.ts      # Load tilemap, validate schemas
│   │       └── GameScene.ts         # Render tilemap, emit gold events
│   ├── ui/
│   │   ├── atoms/
│   │   │   └── ResourcePill.tsx     # Icon + count display
│   │   ├── molecules/               # (empty — M1)
│   │   ├── organisms/
│   │   │   └── HUD.tsx              # Top bar with gold counter
│   │   ├── templates/
│   │   │   └── GameLayout.tsx       # Canvas + HUD overlay
│   │   └── pages/                   # (empty — M1)
│   ├── state/
│   │   ├── gameStore.ts             # Zustand: gold, wave
│   │   └── bridge.ts                # Phaser → Zustand helpers
│   ├── data/
│   │   ├── schemas/
│   │   │   └── unit.schema.ts       # Zod schema for unit definitions
│   │   ├── orcs/
│   │   │   └── mougg-grunt.json     # Placeholder orc definition
│   │   ├── strings/
│   │   │   └── en.json              # Minimal English strings
│   │   └── maps/
│   │       └── placeholder.json     # Hand-written Tiled-format tilemap
│   ├── lib/
│   │   └── constants.ts             # TILE_SIZE, VIRTUAL_WIDTH, VIRTUAL_HEIGHT
│   └── types/
│       └── index.ts                 # Shared TS types
├── tests/
│   ├── setup.ts                     # Vitest setup (jsdom, canvas mock)
│   ├── data/
│   │   └── schema-validation.test.ts
│   └── state/
│       └── gameStore.test.ts
└── docs/
    ├── PROJECT_PLAN.md              # (exists)
    ├── LORE.md                      # Seeded from §4
    └── plans/
        └── PLAN-M0-scaffold.md      # This file
```

---

## 4. Key Implementation Details

### 4.1 Phaser-React Bridge

`PhaserGame.tsx` is a React component that:
1. Creates a `<div ref>` container.
2. On mount, instantiates `new Phaser.Game(config)` with `parent: ref.current`.
3. On unmount, calls `game.destroy(true)`.
4. Exposes game instance via `forwardRef` or context if needed.

`bridge.ts` exports a `getGameStore()` function that Phaser scenes can call to read/write Zustand state without importing React. Pattern:

```ts
// bridge.ts
import { useGameStore } from './gameStore';
export const getGameStore = () => useGameStore.getState();
export const subscribeGameStore = useGameStore.subscribe;
```

GameScene calls `getGameStore().addGold(10)` on enemy kill. React HUD subscribes via `useGameStore(s => s.gold)`.

### 4.2 Placeholder Tilemap

A hand-written JSON file (`src/data/maps/placeholder.json`) conforming to the Tiled JSON format. 20 columns x 15 rows of 32x32 tiles. Three tile types: grass (green), dirt (brown), water (blue). No Tiled editor dependency for M0.

The placeholder tileset (`public/assets/placeholder-tileset.png`) is a 96x32 PNG with three 32x32 colored squares. Can be generated programmatically with a canvas script or drawn in any image editor.

### 4.3 Data Validation

`src/data/schemas/unit.schema.ts` exports a Zod schema matching the unit definition shape from §5.3 of the plan (minus `food` — dropped per review). The test `schema-validation.test.ts` globs `src/data/orcs/*.json` and `src/data/humans/*.json`, parses each against the schema, and asserts success. This runs in CI.

### 4.4 CI Workflow

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test -- --run
      - run: pnpm validate:data
```

### 4.5 package.json Scripts

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "typecheck": "tsc -b --noEmit",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "test": "vitest",
  "validate:data": "vitest run tests/data/"
}
```

---

## 5. Claude Code Workflow Setup

### 5.1 CLAUDE.md

Project-level guidance file covering:
- Project overview (one paragraph)
- Common commands table (dev, build, test, lint, typecheck, validate:data)
- Architecture summary (Phaser game layer, React UI layer, Zustand bridge, data layer)
- Code style (ESLint flat config, 2-space indent, single quotes, semicolons)
- Data-driven rule (all balance in JSON, validated by Zod, no magic numbers)
- Commit conventions (conventional commits, small and frequent)
- Asset conventions (kebab-case, namespaced)
- IP guardrails (no Ultima/UO references)
- Git rules (never force push, never commit to main without PR, never skip hooks)
- Mobile-first requirement

### 5.2 Skills (`.claude/skills/`)

Each skill follows a consistent structure: purpose, inputs, steps, rules, output format. This is a solo-dev workflow — no PR review or feedback skills needed.

**`milestone/SKILL.md`** — Milestone breakdown
- Input: milestone identifier (e.g., "M1") or section reference from PROJECT_PLAN.md
- Read the milestone definition from PROJECT_PLAN.md
- Break the milestone into discrete, implementable GitHub issues
- For each issue: title (conventional-commit-style prefix), description, acceptance criteria, data files affected, milestone label
- Determine dependency order — which issues block which (e.g., "data schemas" blocks "wave system")
- Output a numbered list of issues with `blocked-by: #N` references
- Create issues via `gh issue create` with milestone label and dependency notes in the body
- After creation, print a summary table: issue number, title, dependencies, estimated size (S/M/L)
- Do NOT start work — the output is a backlog ready for `/review`

**`review/SKILL.md`** — Phase 1
- Input: GitHub issue number
- Fetch issue with `gh issue view`
- Research relevant codebase areas using sub-agents
- Summarize: what the issue asks, files/patterns involved, risks, ambiguities
- Transition to plan phase

**`plan/SKILL.md`** — Phase 2
- Enter plan mode
- Explore codebase for context
- Design implementation approach
- Write plan with: numbered changes by file, data schema additions, test strategy, branch name
- Get user approval before exiting plan mode

**`execute/SKILL.md`** — Phase 3
- Input: approved plan (from plan phase or `docs/plans/PLAN-*.md`)
- Follow plan exactly; flag deviations
- Build data-first: JSON + schema → systems → UI → polish
- Use sub-agents for parallel independent work
- Do not commit or push — report what was done

**`validate/SKILL.md`** — Phase 4
- Re-read the original issue
- Review all changed files against the plan
- Check: no magic numbers escaped into code, mobile viewport verified, types pass, tests pass
- Run `pnpm lint` and `pnpm typecheck`
- Report: what passes, what needs fixing

**`commit/SKILL.md`** — Phase 5
- Verify staged changes match the plan
- Stage files by name (never `git add -A`)
- Draft conventional commit message: `<type>(<scope>): <description>`
- If linked to an issue: append `, closes #<N>`
- No body, no co-authored-by, no extra metadata
- Get user approval before committing

**`pr/SKILL.md`** — Phase 6
- Sync with base branch (main)
- Check all commits are pushed
- Draft PR title: `<type>(<scope>): <description> (#<issue>)`
- PR body: `## Summary` (bullets), `## Test plan` (checklist)
- Create PR with `gh pr create --base main`

### 5.3 GitHub Issue Templates

**`feature.yml`:**
- Title, milestone dropdown (M0-M4), description, acceptance criteria, data files affected, related plan doc

**`bug.yml`:**
- Title, severity dropdown, steps to reproduce, expected vs actual behavior, platform/browser, screenshot upload

---

## 6. README Structure

1. **Umie Crusade** — one-line tagline
2. Status badge (CI)
3. Screenshot placeholder (`<!-- TODO: add screenshot after M1 -->`)
4. **About** — 2-3 sentence description
5. **Tech Stack** — bullet list
6. **Getting Started** — clone, pnpm install, pnpm dev
7. **Scripts** — table of all npm scripts
8. **Project Structure** — abbreviated tree
9. **Workflow** — link to PROJECT_PLAN.md §8
10. **Lore** — link to LORE.md
11. **License** — MIT

---

## 7. LORE.md Structure

1. **Umie Crusade — Bloodrock Lore Bible**
2. **The Portal** — framing narrative from §1
3. **The Tra** — three gods table from §4.1 + prayer
4. **The Nine Urucku** — virtue table from §4.2 + scar economy explanation
5. **Bloodlines** — table of 7 bloodlines with roles
6. **Bloodrock Orcish** — glossary table from §4.4
7. **Battle Cries** — list from §4.4
8. **Hedk'nah — The Pile** — from §4.5 + creed
9. **The Umie Crusade** — enemy faction description + unit table from §4.6

---

## 8. Verification Criteria

M0 is done when:

- [ ] `pnpm dev` starts — Phaser canvas shows a colored-tile grid, React HUD shows "Gold: 0"
- [ ] Clicking a tile in the Phaser scene adds 10 gold — HUD updates reactively
- [ ] `pnpm build` produces a working static build
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm test` passes — gameStore tests + schema validation tests
- [ ] `pnpm validate:data` passes — mougg-grunt.json validates against Zod schema
- [ ] CI workflow runs successfully on push
- [ ] README renders correctly on GitHub
- [ ] LORE.md contains all §4 content (no UO IP references)
- [ ] CLAUDE.md is present with operating rules
- [ ] `.claude/skills/` contains all 7 skill files (milestone, review, plan, execute, validate, commit, pr)
- [ ] GitHub issue templates are present
- [ ] Mobile viewport (375px wide) — canvas scales, HUD is usable

---

## 9. Execution Order

Work will proceed in this order, with commits after each logical unit:

1. **Project init** — `pnpm init`, install all packages, configure vite/ts/eslint/tailwind
2. **CLAUDE.md + skills** — Claude workflow infrastructure
3. **Data layer** — constants, types, Zod schemas, placeholder JSON files
4. **State layer** — Zustand gameStore + bridge
5. **Phaser layer** — config, scenes (Boot → Preload → Game), PhaserGame component
6. **React UI layer** — ResourcePill, HUD, GameLayout, App
7. **Placeholder assets** — tileset PNG, tilemap JSON
8. **Tests** — setup, gameStore tests, schema validation tests
9. **CI** — GitHub Actions workflow
10. **Docs** — README, LORE.md, LICENSE
11. **GitHub templates** — issue templates
12. **Verify** — run all checks, test mobile viewport

Each step = 1-2 small commits.
