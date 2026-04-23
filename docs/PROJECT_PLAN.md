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
| Hero system | **Player-picked bloodline + custom name** at run start. Every player gets their own orc. |
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

Thematically the game draws directly on the Bloodrock Clan canon — its gods, language, virtues, bloodlines, and characters — all of which are the player-author's own creations. See §4 for the lore pack.

**Core loop:** Survive wave → loot & gather → build/upgrade/train → reposition → next wave.

**Framing narrative (flavor only — not required to follow):**
A Mojoka ritual to Krull'nuk went sideways. A green-tinged portal split the air. A handful of orcs — whoever the player picks — stumbled through it and woke in an unknown land. The locals don't speak orcish. They don't parley. They ride in banners of white and gold, call the orcs *demons*, and come in waves that never seem to end. The orcs dig in. They build. They remember the creed: *Nub goth. Nub pulga. Hedk'nah.* The pile will grow.

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
| CI | **GitHub Actions** | Typecheck, lint, test, data-validate on every PR |
| Hosting | **Vercel** or **Netlify** (static) | Free tier fine for MVP |

**Deliberate "not yet":** no backend/DB, no ECS library, no Electron/Capacitor wrapper, no multiplayer, no analytics.

---

## 4. Lore Pack (canonical — use directly)

All Bloodrock material belongs to the player-author. The **Umie Crusade** faction is original to this game (not UO IP).

### 4.1 The Tra — the three orc gods

| God | Sphere | Domain |
|---|---|---|
| **Krull'nuk** | 🟢 Green | Magic, chaos, guile — the portal god |
| **Krenbluk** | 🔴 Red | Blood, fury, destruction |
| **Belok** | ⚫ Black | Souls, the taken dead |

**Prayer to the Tra:** *"Krull'nuk, gib mojo! Krenbluk, gib blud! Belok, uk z'haa'l'a umies!"*

### 4.2 The Nine Urucku — orcish virtues (meta-progression tree)

Each virtue offers a permanent modifier + unlocks one unit/building.

| # | Urucku | Meaning | Founder (lore) | Bloodline | Unlock |
|---|---|---|---|---|---|
| 1 | **Ogba** | Brutality | Ur'Runklug | Mougg'r (mace) | Scar-point spend |
| 2 | **Iggju** | Fighting Tactics | K'tar | Thu'gub'r (spear) | Scar-point spend |
| 3 | **Kihagh** | Bloodlust | Zhud'uuk | Ggrultuk'r (axe) | Scar-point spend |
| 4 | **Rokgagh** | Deceptive Tactics | Wug'uk | Geeptiis'r (sword) | Scar-point spend |
| 5 | **Ghigneh** | Wargod Connection | Tu'grrt | Mojoka (mages) | Scar-point spend |
| 6 | **Buorca** | Teamwork / Selflessness | Chok'ka | Gukka (crafters) | Scar-point spend |
| 7 | **Aughhagh** | Deceit | — | — | **Wave 25 reached** |
| 8 | **Gagru** | Deceptive Might | — | — | **Wave 50 reached** |
| 9 | **Highat** | Sneakiness | (secret) | Sneek-R (stealth) | **Wave 75 reached, hidden ritual** |

**Scars:** players earn scar points per run, scaled by wave reached, skulls taken, and style challenges. Spend scars to light up Urucku nodes. Mirrors the clan's real-world scar economy (rituals = 2, tasks = 1).

**IP note:** the clan's canon frames Urucku as "corruptions of" Britannian virtues. That mapping is dropped for the public repo. The Urucku stand on their own.

### 4.3 Hero system — player-picked, player-named

At the start of every new run, the player sees a hero-creation screen:

1. **Pick a bloodline** (orc class) from the roster they've unlocked
2. **Enter a name** for this orc (persists to meta-save; reusable across runs)
3. **Begin the run**

The hero is the player's own avatar in the field — one active at a time (Kingdom Rush pattern), more powerful than a line orc, with a bloodline-specific active ability. Heroes persist in a **Hero Roster** — players can keep a stable of named orcs and pick a different one each run.

| Bloodline | Hero role | Active ability (working) |
|---|---|---|
| Mougg'r | Tank / Stun | **Clomp'uk** — slam attack, AoE stun in a short radius |
| Thu'gub'r | Reach melee | **Kigg Throw** — hurl a spear that pierces a line of enemies |
| Ggrultuk'r | Berserker | **Kihagh Rage** — 10s of 2× attack speed, takes 50% more damage |
| Geeptiis'r | Skirmisher | **Rokgagh Strike** — teleport behind the lowest-HP target and crit |
| Mojoka | Caster | **Tra Spheres** — AoE that deals magic / blood / soul damage in sequence |
| Gukka | Builder-warrior | **Doomforge** — instantly repair all walls in a radius, damage adjacent enemies |
| Sneek-R | Assassin (locked by Highat) | **Ru'eeg'a** — become invisible, next attack is a guaranteed crit |

**Tu'grrt** (the player-author's own orc) is not baked into the game as "the hero." He's an example preset players can pick, and the first "tutorial hero" shown on the creation screen as a suggested starter — but any player will name their own Mojoka whatever they want.

**M1 scope note:** M1 ships with **one bloodline + one default hero** (Mougg'r grunt — the roster expands at M2/M3). The hero-creation UI scaffold can still land in M1 with a single option.

### 4.4 Bloodrock orcish (UI and combat flavor)

| Orcish | English |
|---|---|
| umies | humans |
| klerg | war, battle |
| clomp | destroy, smash |
| blud | blood |
| hedk'nah | skull(s) |
| mojo | magic |
| gug / guk | good / is good |
| nub | no, nothing |
| jat | now |
| uk | take |
| gib | give |
| shu'uk | gather |
| bludgelt | loot |
| bludchok-hai | Bloodrock Clan |

**Battle cries:**
- *"Bludchok-hai gug!"* — Bloodrock Clan is good! (title / victory)
- *"ISE HAI!"* — clan cry (wave-start)
- *"KWAT DA TRA!"* — three-gods invocation (boss / hero ability)
- *"Hedk'nah gug."* — "The skull is good" (kill confirmation flavor)

### 4.5 Hedk'nah — scoring/prestige layer

Former war chiefs who count their worth in heads. In-game: skulls taken in every run feed **The Pile**, a persistent meta-counter. Cosmetic milestones only (no balance impact — keeps it honest). Creed: *"Nub goth. Nub pulga. Hedk'nah."*

### 4.6 The Umie Crusade — human faction (game-original)

A religious military order of a human kingdom that views the portal-orcs as demons summoned from hell. Banners: white and gold. Tone: fanatical, organized, increasingly desperate. Leader names invented per boss wave — never reused from UO/Britannia.

| Unit | Role |
|---|---|
| Peasant Levy | Fodder, fast, low HP |
| Militia | Shielded, medium HP |
| Crossbowman | Ranged, fragile — priority target |
| Knight | Armored, slow, high HP |
| Priest | Heals others — kill first |
| Inquisitor | Anti-magic, silences Mojoka auras |
| Siege Ram | Breaches walls — must intercept early |
| Grand Paladin (boss, every 10 waves) | High HP, physical resist, named |

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
│   │   ├── orcs/                # mougg-grunt.json, mojoka-base.json, ...
│   │   ├── buildings/           # wall-wood.json, wall-stone.json, ballista.json, ...
│   │   ├── humans/              # peasant-levy.json, knight.json, grand-paladin.json, ...
│   │   ├── waves/               # generator configs + named set-pieces
│   │   ├── urucku/              # 9 virtue nodes (modifiers + unlocks)
│   │   ├── heroes/              # hero-ability definitions per bloodline
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

**Example `mougg-grunt.json`:**
```json
{
  "id": "mougg-grunt",
  "name": "Scrag",
  "bloodline": "mougg-r",
  "category": "melee",
  "stats": { "hp": 80, "dps": 12, "speed": 60, "armor": 2 },
  "cost": { "gold": 25, "food": 1, "trainTime": 4 },
  "respawnCost": { "gold": 15, "time": 10 },
  "sprite": "orcs/mougg-grunt.png",
  "animations": ["idle", "walk", "attack", "death"],
  "abilities": ["stun"],
  "unlockRequirement": null,
  "flavor": "Mougg klerg! Clomp jat!"
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
Two core resources: **gold** (from kills, used for training/respawn/building/repair) and **wood/stone** (gathered between waves by Gukka units, used for walls and towers). A rare **souls** currency unlocks with Ghigneh (powers Mojoka hero abilities). No fourth resource unless design demands.

### 6.2 Progression
- **In-run tech tree:** gated by wave number and spend. Resets each run.
- **Meta: Nine Urucku:** persistent across runs. Scar points per run → spend on Urucku nodes. Each virtue: one passive modifier + one unit/building unlock. Aughhagh/Gagru/Highat gated behind wave milestones (25 / 50 / 75).
- **Hedk'nah Pile:** persistent skull counter. Cosmetic milestones only.
- **Hero Roster:** persistent list of named orcs the player has created. Future: heroes could accrue stats/scars of their own (out of scope for MVP).
- **Endless mode:** waves scale indefinitely. Scoring = wave reached + style points (no-walls, Mojoka-only, silent run, etc.).

### 6.3 Wave generator
Generator composes waves from **patterns** defined in JSON: `siege_push`, `priest_column`, `skirmish_harass`, `paladin_advance`. Composition curves, intensity multipliers, rarity rules drive output. Every 10th wave is a hand-authored boss wave with a named Grand Paladin.

### 6.4 Death, respawn, and repair
- **Orc death:** unit returns to Barracks after a delay; gold cost to respawn (per §5.3 example, 15g / 10s for a grunt). Tune per bloodline.
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
- 3 orc sprites — Mougg'r grunt, Ggrultuk'r berserker, Mojoka (hero template) — 4 or 8 directions, animations: idle, walk, attack, death
- 3 human sprites — Peasant Levy, Knight, Priest (same animations)
- Wall (wood), wall (stone) — each with 3 damage states (pristine / cracked / crumbling), gate, watchtower, ballista (static or 2-frame firing)
- 1 UI theme sheet — button, panel border, icon set for resources, pixel font
- Umie Crusade banner (for UI flourish)

### 7.3 Format and tooling
- PNG with transparency, power-of-two atlas dimensions where feasible
- **TexturePacker** (free tier) or `free-tex-packer-core` for atlases
- **Tiled** for maps — artist delivers `.tmx`; Vite plugin imports JSON
- Filename convention: **kebab-case** everywhere, namespaced (`orcs/mougg-grunt.png`)

---

## 8. Workflow Alignment

Per-feature application of the review → plan → execute → commit → validate → harden → pr skills:

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

**M1 — Vertical slice**
- One map, one orc bloodline (Mougg'r grunt + Mougg'r hero), one human (Peasant Levy), one wall type (wood), one tower (ballista)
- **Hero-creation scaffold** — pick Mougg'r (only option), name your orc, begin run
- Humans spawn, path to fort core via `easystarjs`, orc defenders intercept, damage resolves
- Gold drops from kills; place walls; dead orcs respawn for gold
- Walls take damage; manual repair (Gukka comes at M2)
- 5 hand-authored waves, then "You Win" screen
- Mobile playable (touch controls work)
- **Go/no-go gate: if the slice isn't fun, stop and iterate before adding breadth.**

**M2 — Breadth**
- 3 orc bloodlines selectable (Mougg'r, Ggrultuk'r, Mojoka) — full hero-creation UI
- 4–5 human types (Peasant, Militia, Crossbowman, Knight, Priest)
- 4–5 building types (wall-wood, wall-stone, gate, watchtower, ballista, spike trap)
- Gukka builder unit with auto-repair
- Wave generator replaces hand-authored waves
- localStorage meta save: highest wave, gold lifetime, Hedk'nah Pile, hero roster
- Pause, speed-up (1× / 2× / 4×)

**M3 — Progression, identity, and audio**
- Nine Urucku tree — 3 virtues fully unlockable (Ogba, Kihagh, Ghigneh), others scaffolded
- Wave milestones trigger Aughhagh/Gagru/Highat unlocks
- All 7 bloodlines selectable as heroes with their active abilities
- Boss wave every 10 with named Grand Paladin
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

1. **Hero ability tuning** — the abilities in §4.3 are working names and effects. Each needs concrete numbers (damage, duration, cooldown) during the relevant milestone's Plan phase.
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
