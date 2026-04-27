# Umie Crusade — Project Plan

> **Working title.** Hand this to Claude Code as `docs/PROJECT_PLAN.md` in the project root. This is the **Plan** input; per-feature plans will elaborate each section before **Execute** begins.

---

## 0. Decisions Locked In

| Decision | Choice |
|---|---|
| Working title | **Umie Crusade** (double-meaning: the human faction *is* the Umie Crusade) |
| Map/gameplay pillar | **Variant C — Hybrid** (breachable fort + open flanks; player shapes lanes via wall placement) |
| Repository visibility | **Public** on GitHub |
| License | **MIT** |
| UI paradigm | **Atomic design** for the React UI overlay. Game entities use composition inside Phaser. |
| Tile size | **Deferred** — prototype at 32×32, lock by end of M1. Code is tile-size-agnostic. |
| Hero system | **Player-picked unit kind + custom name** at run start. Every player gets their own orc. |
| Unclaimed Urucku (Aughhagh, Gagru) | **Unlock at wave milestones in-game**, independent of UO world |
| Orc death | **Respawn at Barracks with gold cost** |
| Walls | **Take damage; gold-cost repair.** Drives the Gukka builder role. |
| Art filename convention | **kebab-case**, namespaced by category |
| Audio | **M3+** — ambient track, wave cries, weapon sounds, stings. CC0 sources. |
| Localization | **Strings-in-JSON from day one**, English-only at launch |
| Analytics | **None in MVP.** If ever added, self-hosted Plausible/PostHog, no PII |

---

## 1. Vision

A web-based, mobile-responsive, top-down pixel-art base/tower defense hybrid. The player commands a small band of Bloodrock orcs who have **fallen through a portal** into a strange human kingdom whose zealots are hunting them to extinction. Build walls and towers, train defenders, unlock the **Nine Urucku** (the orcish virtues) for permanent meta-progression, and survive as long as possible against the never-ending **Umie Crusade**.

Thematically the game draws directly on the Bloodrock Clan canon — its gods, language, virtues, units, and characters — all of which are the player-author's own creations. See [docs/LORE.md](LORE.md) for the game-focused distillation and [docs/war-tome.md](war-tome.md) for the full canon.

**Core loop:** Survive wave → loot & gather → build/upgrade/train → reposition → next wave.

**Framing narrative (flavor only — not required to follow):**
Smugglers Den, present day. Klerggoth Zut'lug holds the stone. A Mojoka rite to Krull'nuk goes sideways. A green-tinged portal splits the air. A handful of orcs — whoever the player picks — stumble through it and wake in an unknown land. The locals don't speak orcish. They don't parley. They ride in banners of white and gold, call the orcs *demons*, and come in waves that never seem to end. The orcs dig in. They build. They remember the creed: *Nub goth. Nub pulga. Hedk'nah.* The pile will grow.

---

## 2. Design Pillar: Variant C (Hybrid Defense)

Classic tower defense uses fixed enemy paths. Pure base defense uses open maps with free-form enemy pathing. The hybrid sits between:

- **Fort core** at roughly the center-east of the map (cliff/coast to the east — fewer approach lanes). Losing it ends the run.
- **Breachable walls and gates** — humans will path around, smash through, or siege over. Walls take damage; Gukka builders repair for gold.
- **Open flanks** where the player decides whether to wall off, leave open as a kill-lane, or set with traps.
- **Grid-based placement** (32×32 cells regardless of final art size) with **A* pathfinding** (`easystarjs`) recomputed when walls are built/destroyed.
- **Static defenses** (ballistae, spike traps, shaman totems) + **mobile defenders** (orc squads that can be ordered to garrison, patrol, or sally).

Reference feel: **Orcs Must Die!** meets **Dungeon Warfare** meets **Kingdom Rush Vengeance**.

---

## 3. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Game engine | **Phaser 3** (TypeScript) | Most mature 2D web engine; built-in physics, tilemaps, touch input, audio, particles |
| UI overlay | **React 18** + TypeScript | Atomic design for HUD, menus, build panels, shop, Urucku tree |
| Build tool | **Vite** | Fast HMR, first-class TS, tiny bundles |
| Styling | **Tailwind CSS** + CSS variables | Utility-first; variables enable theme/mood swaps |
| Shared state | **Zustand** | Tiny store that works in Phaser scenes and React components |
| Entity model | Phaser events + composition | Don't over-engineer with an ECS library unless profiling demands it |
| Map format | **Tiled** (`.tmx` → JSON) | Industry standard; Phaser loads natively |
| Pathfinding | **easystarjs** (grid A*) | Mature, MIT, recomputable — fits breachable walls |
| Data files | **JSON** in `/src/data/` validated by **Zod** in dev | All balance, unit defs, wave specs, Urucku tree, strings |
| Persistence | `localStorage` MVP → server optional later | Saves, settings, run history, hero roster |
| Testing | **Vitest** + Testing Library + unit tests for game logic | Data-driven systems easy to test in isolation |
| PWA | Vite PWA plugin (Workbox) | Installable on mobile; offline after first load |
| Package manager | **pnpm** | Faster than npm, clean lockfile |
| CI | **GitHub Actions** | Typecheck, lint, test, data-validate on every push |
| Hosting | **Vercel** or **Netlify** (static) | Free tier fine for MVP |

**Deliberate "not yet":** no backend/DB, no ECS library, no Electron/Capacitor wrapper, no multiplayer, no analytics.

---

## 4. Lore Pack

All Bloodrock material belongs to the player-author. The **Umie Crusade** faction is original to this game (not UO IP).

The full lore lives in two documents:

- **[docs/LORE.md](LORE.md)** — game-focused distillation (Tra, Duhkta, units, Urucku, Umie Orders, glossary, battle cries). This is what the implementation reads against.
- **[docs/war-tome.md](war-tome.md)** — the full canonical *Klerg-Tome*. Where the two disagree, the war-tome wins.

### 4.1 Highlights for the implementation

- **The Tra** (Krull'nuk / Krenbluk / Belok): three orc gods, feared not loved. Mojoka are their avatars in the hai.
- **The Duhkta** (Clog / Faugh / Snarf): three principles beneath the Nine Urucku — flavor only, not a system.
- **Nine Urucku**: meta-progression. Each virtue grants a passive modifier and unlocks one unit kind, building, or tactical option. Aughhagh / Gagru / Highat are wave-gated (25 / 50 / 75).
- **Unit roster**: 11 core kinds of orc (Snotling, Peon, Gukka, Grunt, Skowt, Brute, Howl'r, Kaptain, Klerggoth, Wierdling, Mojoka) plus 2 optional (Reaver, Elder). No bloodlines — the unit kind *is* the class.
- **Hero system**: player picks a unit kind they've unlocked, names that orc, starts the run. One active hero at a time (Kingdom Rush pattern), more powerful than a line unit, with a kind-specific active ability. Heroes persist in a Hero Roster across runs.
- **Hedk'nah Pile**: persistent skull counter, cosmetic milestones only.
- **IP carve-outs**: no Britannian virtue mapping, no UO place names, no Shadowlord names. The Urucku stand on their own.

### 4.2 The Umie Crusade — human faction (game-original)

A religious military order of a human kingdom that views the portal-orcs as demons summoned from hell. Banners: white and gold. Tone: fanatical, organized, increasingly desperate. Leader names invented per boss wave — never reused from UO/Britannia.

The Crusade musters in **eight orders**, each tied to one of the umies' soft virtues. Each order behaves true to its virtue — and that is also its weakness, for an orc who knows his Urucku knows where to strike.

| Order | Virtue | Behavior in battle |
|---|---|---|
| **Order of Honor** | Honor | Charges the front gate; refuses traps and ambush |
| **Rangers of Justice** | Justice | Open-field rank-and-file archery |
| **Paladins of Compassion** | Compassion | Will not leave their wounded; healers in train |
| **Mage Tower** | Spirituality | Slow advance; long, interruptible rites |
| **Knights of Valor** | Valor | Charge until they die; high HP, no retreat |
| **Inquisitors of Honesty** | Honesty | Anti-magic, deceptive — silence Mojoka |
| **Disciples of Sacrifice** | Sacrifice | Spend their own bodies to wound the hai |
| **Monks of Humility** | Humility | No armor; unarmed melee swarm |

Plus, outside the orders:

- **Peasant Levy** — fodder, no order, low HP
- **Siege Ram** — siege equipment, breaches walls
- **Grand Paladin** — boss every 10 waves, named per encounter, leads one of the orders

---

## 5. Architecture

### 5.1 Repo structure

```
umie-crusade/
├── public/
├── src/
│   ├── game/                    # Phaser layer
│   │   ├── scenes/              # Boot, Preload, MainMenu, HeroCreate, Game, UIOverlay, GameOver
│   │   ├── entities/            # Orc, Human, Building, Projectile (composition)
│   │   ├── systems/             # Wave, Economy, Pathfinding, Damage, AI, Save
│   │   ├── components/          # Damageable, Targetable, Upgradeable, Breakable
│   │   └── config/              # Phaser game & physics config
│   ├── ui/                      # React (atomic)
│   │   ├── atoms/               # Button, Icon, Badge, ResourcePill, Tooltip
│   │   ├── molecules/           # UnitCard, BuildSlot, WaveIndicator, VirtueNode, HeroRosterCard
│   │   ├── organisms/           # HUD, BuildPanel, UruckuTree, WaveTimeline, HeroCreateForm
│   │   ├── templates/           # GameLayout, MenuLayout
│   │   └── pages/               # MainMenu, HeroCreate, Settings, RunSummary
│   ├── state/
│   │   ├── gameStore.ts         # Gold, lives, wave, selected entity (per-run)
│   │   ├── metaStore.ts         # Urucku unlocks, Hedk'nah pile, hero roster, settings
│   │   └── bridge.ts            # Phaser ↔ React sync helpers
│   ├── data/                    # ALL balance data — never hardcode
│   │   ├── orcs/                # grunt.json, brute.json, skowt.json, mojoka.json, ...
│   │   ├── buildings/           # wall-wood.json, wall-stone.json, ballista.json, ...
│   │   ├── humans/              # peasant-levy.json, knight.json, grand-paladin.json, ...
│   │   ├── waves/               # generator configs + named set-pieces
│   │   ├── urucku/              # 9 virtue nodes (modifiers + unlocks)
│   │   ├── heroes/              # hero-ability definitions per unit kind
│   │   ├── maps/                # Tiled JSON exports
│   │   └── strings/             # en.json (i18n-ready)
│   ├── lib/                     # Pure utilities (math, rng, formulas)
│   └── types/                   # Shared TS types
├── tests/
├── docs/                        # PROJECT_PLAN.md, ARCHITECTURE.md, BALANCE.md, LORE.md
└── tools/                       # Dev scripts (wave balancer, data validator, asset manifest)
```

### 5.2 Phaser ↔ React bridge

```
 ┌──────────────────────────────────────────┐
 │  DOM (React — atomic)                    │
 │  HUD · Build Panel · Urucku Tree · Menus │
 └────────────┬──────────────▲──────────────┘
              │ actions      │ selectors
              ▼              │
 ┌──────────────────────────────────────────┐
 │  Zustand stores (gameStore, metaStore)   │
 └────────────▲──────────────┬──────────────┘
              │ updates      │ subscriptions
              │              ▼
 ┌──────────────────────────────────────────┐
 │  <canvas> (Phaser)                       │
 │  Scenes · Systems · Entities             │
 └──────────────────────────────────────────┘
```

Game-internal events (projectile collisions, AI transitions) stay inside Phaser. Only gameplay-relevant state crosses into Zustand.

### 5.3 Data-driven design (non-negotiable)

Every balance number lives in `/src/data/`. Systems read definitions at runtime. Adding a new orc type = drop a JSON file + sprite sheet + register the id. Schemas validated on boot with Zod in dev mode; validator runs in CI.

**Example `grunt.json` (target shape — see follow-up rename issue for current state):**
```json
{
  "id": "grunt",
  "name": "Scrag",
  "kind": "grunt",
  "category": "melee",
  "faction": "orc",
  "stats": { "hp": 80, "dps": 12, "speed": 60, "armor": 2 },
  "cost": { "bludgelt": 25, "trainTime": 4 },
  "respawnCost": { "bludgelt": 15, "time": 10 },
  "sprite": "orcs/grunt.png",
  "animations": ["idle", "walk", "attack", "death"],
  "abilities": ["stun"],
  "unlockRequirement": null,
  "flavor": "Nooograh! Clomp jat!"
}
```

### 5.4 Responsive + mobile

- Phaser canvas uses `Scale.FIT` with a virtual resolution of 1280×720.
- UI overlay is DOM; Tailwind breakpoints handle layout.
- **Touch-first controls:** tap to select, long-press to inspect, drag to pan, pinch to zoom. Design touch affordances before keyboard/mouse.
- Test on real iOS Safari and Android Chrome early.

---

## 6. Game Systems

### 6.1 Economy
Two core resources, named in orcish in the UI:

- **Bludgelt** (loot) — taken from umie kills; used for training, respawn, building, and repair. The truest measure of a hai's strength.
- **Chok / R'hee** (stone / wood) — gathered between waves by Peons and Gukka, used for walls and towers.

A rare **mojo plak** (reagent) currency unlocks with Ghigneh and powers Mojoka hero abilities. No fourth resource unless design demands.

The full orcish resource lexicon (chok, r'hee, fless, bludgelt, mojo plak, lir'tyk, k'nabb'h, krenbluk'a cha) is in [docs/LORE.md](LORE.md). Most are flavor — only the four above are ever surfaced as gameplay-tracked resources.

### 6.2 Progression
- **In-run tech tree:** gated by wave number and spend. Resets each run.
- **Meta: Nine Urucku:** persistent across runs. Scar points per run → spend on Urucku nodes. Each virtue: one passive modifier + one unit/building unlock. Aughhagh/Gagru/Highat gated behind wave milestones (25 / 50 / 75).
- **Hedk'nah Pile:** persistent skull counter. Cosmetic milestones only.
- **Hero Roster:** persistent list of named orcs the player has created. Future: heroes could accrue stats/scars of their own (out of scope for MVP).
- **Endless mode:** waves scale indefinitely. Scoring = wave reached + style points (no-walls, Mojoka-only, silent run, etc.).

### 6.3 Wave generator
Generator composes waves from **patterns** defined in JSON: `siege_push`, `priest_column`, `skirmish_harass`, `paladin_advance`. Composition curves, intensity multipliers, rarity rules drive output. Every 10th wave is a hand-authored boss wave with a named Grand Paladin.

### 6.4 Death, respawn, and repair
- **Orc death:** unit returns to Barracks after a delay; bludgelt cost to respawn (per §5.3 example, 15 bludgelt / 10s for a grunt). Tune per unit kind.
- **Hero death:** longer delay, higher gold cost. Losing the hero is a significant setback but not run-ending.
- **Wall damage:** walls have HP; humans attack them when pathing is blocked. Destroyed walls force a full A* recompute. Gukka builders auto-repair if gold is available and they're idle — manual override possible.

### 6.5 Map
One fort at center-east (cliff/coast to the east limits approach angles). Humans spawn from up to three edges (N/S/W). Terrain: grass, dirt, stone path, forest (blocks sight), water (impassable), fort core (game-over condition).

---

## 7. Art Pipeline

### 7.1 Tile size — the deferred decision

Grid logic is tile-size-agnostic. `TILE_SIZE` is one config value. Prototype with **placeholder 32×32** art. Have the artist draw one "test tile + test orc" at each candidate size (16 and 32). Lock by end of M1. Code won't care.

### 7.2 Art requests for minimum viable slice (M1 → M2)

- 1 tileset — grass, dirt, stone path, forest, water, fort-core (one variant each + a few decorative tiles)
- 3 orc sprites — Grunt, Brute (hero template), Mojoka — 4 or 8 directions, animations: idle, walk, attack, death
- 3 human sprites — Peasant Levy, Knight, Priest (same animations)
- Wall (wood), wall (stone) — each with 3 damage states (pristine / cracked / crumbling), gate, watchtower, ballista (static or 2-frame firing)
- 1 UI theme sheet — button, panel border, icon set for resources, pixel font
- Umie Crusade banner (for UI flourish)

### 7.3 Format and tooling
- PNG with transparency, power-of-two atlas dimensions where feasible
- **TexturePacker** (free tier) or `free-tex-packer-core` for atlases
- **Tiled** for maps — artist delivers `.tmx`; Vite plugin imports JSON
- Filename convention: **kebab-case** everywhere, namespaced (`orcs/grunt.png`, `orcs/brute.png`)

---

## 8. Workflow Alignment

Per-feature application of the review → plan → execute → commit → validate → harden → merge skills:

| Phase | Output |
|---|---|
| **Review** | Read relevant plan section + existing code; list open questions; confirm scope. |
| **Plan** | Elaborate: data schema additions, new files, affected systems, test strategy. Output `docs/plans/PLAN-<feature>.md`. |
| **Execute** | Build data-first (JSON + schema) → systems → UI binding → polish. Small commits. |
| **Commit** | Conventional commits (`feat:`, `fix:`, `refactor:`, `data:`, `lore:`, `art:`). |
| **Validate** | Vitest + playtest on desktop + mobile emulator. Verify no balance numbers escaped into code. |
| **Harden** | Edge cases, error handling, perf check (60fps at 100+ entities), a11y sweep. |
| **PR** | PR description references phase outputs; include before/after GIF for visible changes. |

---

## 9. Milestones

**M0 — Scaffold**
- Vite + Phaser 3 + React + TS + Tailwind + Zustand wired up
- Canvas renders a Tiled tilemap with placeholder art
- React HUD overlay shows a gold counter that updates from a Phaser event
- CI: typecheck, lint, test, data-validate
- MIT license, README, LORE.md seeded from §4

**M1 — Vertical slice (shipped)**
- One map, one orc unit (Grunt) + one hero (Brute), one human (Peasant Levy), one wall type (wood), one tower (ballista)
- **Hero-creation scaffold** — pick Brute (only option), name your orc, begin run
- Humans spawn, path to fort core via `easystarjs`, orc defenders intercept, damage resolves
- Bludgelt drops from kills; place walls; dead orcs respawn for bludgelt
- Walls take damage; manual repair (Gukka comes at M2)
- 5 hand-authored waves, then "You Win" screen
- Mobile playable (touch controls work)
- **Go/no-go gate: if the slice isn't fun, stop and iterate before adding breadth.**

**M2 — Breadth**
- 3 orc hero unit kinds selectable (Brute, Mojoka, Skowt or Gukka) — full hero-creation UI
- 4–5 human types from the eight Umie Orders (Peasant Levy, Order of Honor, Rangers of Justice, Knights of Valor, Paladins of Compassion)
- 4–5 building types (wall-wood, wall-stone, gate, watchtower, ballista, spike trap)
- Gukka builder unit with auto-repair; Peon gatherer unit
- Wave generator replaces hand-authored waves
- localStorage meta save: highest wave, lifetime bludgelt, Hedk'nah Pile, hero roster
- Pause, speed-up (1× / 2× / 4×)

**M3 — Progression, identity, and audio**
- Nine Urucku tree — 3 virtues fully unlockable (Ogba, Kihagh, Ghigneh), others scaffolded
- Wave milestones trigger Aughhagh/Gagru/Highat unlocks
- All 7 hero unit kinds (Brute, Skowt, Mojoka, Gukka, Howl'r, Kaptain, Klerggoth) selectable with their active abilities
- Boss wave every 10 with named Grand Paladin from one of the eight orders
- Bloodrock orcish UI strings (battle cries on wave start, flavor in tooltips)
- Audio pass: ambient track, wave-start cry, weapon sounds, victory/defeat stings (CC0 sources)

**M4 — Polish & launch**
- Full art pass with artist
- PWA install, offline play
- Accessibility pass (color-blind-safe palette, scalable UI, keyboard fallback)
- Playtest with 5+ clan members, iterate balance
- Deploy to Vercel/Netlify static hosting

---

## 10. Remaining Open Questions

Most big decisions are locked. These get resolved in per-feature Plan phases:

1. **Hero ability tuning** — hero abilities per unit kind (Brute / Skowt / Mojoka / Gukka / Howl'r / Kaptain / Klerggoth) need concrete numbers (damage, duration, cooldown) during the relevant milestone's Plan phase. See [docs/LORE.md](LORE.md) for unit roster.
2. **Portal intro** — cutscene, scrolling text, or flavor-only on title screen? Recommend flavor-only for M1, short scrolling text for M3.
3. **Hero persistence depth** — do heroes accrue stats/scars across runs, or just names? Recommend names-only for MVP; re-evaluate after M3 playtests.
4. **Grand Paladin names and visual differentiation** — needs a list of named bosses during M3 Plan phase.
5. **Style challenge list** — which style runs give bonus scars (no-walls, Mojoka-only, silent, speed-run, etc.)? Define in M3 Plan.
6. **Clan member playtesters** — who in Bloodrock gets early access for M4?

---

## 11. Non-goals (to protect scope)

- No multiplayer in MVP
- No procedural map generation in MVP
- No monetization (ads, IAP)
- No 3D
- No blockchain / NFT / real-money economy — ever
- No generative AI content at runtime
- No mapping of Urucku to Ultima Britannian virtues in-game (IP)
- No UO place names in-game (IP) — game's setting is its own fictional world
- No Shadowlord names from Ultima (IP) — if dark gods appear, invent new ones or use the Tra
