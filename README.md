# Umie Crusade

A web-based, mobile-responsive, top-down pixel-art orc base/tower-defense hybrid.

[![CI](https://github.com/YOUR_USERNAME/umie-crusade/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/umie-crusade/actions/workflows/ci.yml)

<!-- TODO: add screenshot after M1 -->

## About

Command a small band of Bloodrock orcs who have fallen through a portal into a strange human kingdom. Build walls and towers, train defenders, unlock the Nine Urucku (orcish virtues) for permanent meta-progression, and survive as long as possible against the never-ending Umie Crusade.

*Nub goth. Nub pulga. Hedk'nah.*

## Tech Stack

- **Phaser 3** — 2D game engine (TypeScript)
- **React 18** — UI overlay (atomic design)
- **Vite** — build tool
- **Tailwind CSS v4** — styling
- **Zustand** — shared state (Phaser + React bridge)
- **Zod** — data schema validation
- **Vitest** — testing
- **pnpm** — package manager

## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/umie-crusade.git
cd umie-crusade
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Start dev server |
| `pnpm build` | Typecheck + production build |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | TypeScript compiler checks |
| `pnpm lint` | ESLint |
| `pnpm lint:fix` | ESLint with auto-fix |
| `pnpm test` | Run tests (watch mode) |
| `pnpm validate:data` | Validate JSON data against Zod schemas |

## Project Structure

```
src/
  game/       # Phaser: scenes, entities, systems
  ui/         # React: atoms, molecules, organisms, templates, pages
  state/      # Zustand stores + Phaser-React bridge
  data/       # JSON data files + Zod schemas (all balance lives here)
  lib/        # Pure utilities
  types/      # Shared TypeScript types
tests/        # Vitest tests
docs/         # Project plan, lore, architecture
```

## Workflow

This project follows a structured feature pipeline. See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) for full details.

## Lore

The Bloodrock Clan lore is the player-author's own creation. See [docs/LORE.md](docs/LORE.md) for the full lore bible.

## Built With

This project is co-authored with [Claude Code](https://claude.ai/claude-code) (Anthropic).

## License

[MIT](LICENSE)
