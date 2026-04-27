# Umie Crusade — Bloodrock Lore Bible

The Bloodrock material is the player-author's own creation. The full canon lives in [docs/war-tome.md](war-tome.md) (the *Klerg-Tome*); this document is a game-focused distillation of that canon. Where the two disagree, the war-tome wins.

The **Umie Crusade** faction is original to this game.

---

## The Portal — Where the Game Begins

Smugglers Den, present day. Klerggoth Zut'lug holds the stone. A Mojoka rite to Krull'nuk goes sideways. A green-tinged portal splits the air. A handful of orcs — whoever the player picks — stumble through and wake in an unknown land.

The locals don't speak orcish. They don't parley. They ride in banners of white and gold, call the orcs *demons*, and come in waves that never seem to end.

The orcs dig in. They build. They remember the creed:

> *Nub goth. Nub pulga. Hedk'nah.*

The pile will grow.

---

## The Duhkta — Three Principles

All orcish virtue flows from three foundations beneath the Nine Urucku.

| Principle | Meaning |
|---|---|
| **Clog** | Might Makes Right — the strong take, the weak serve or die |
| **Faugh** | Battle Cleverness — read the field, strike at the right moment |
| **Snarf** | Deception — lies and trickery as weapons no less worthy than steel |

In-game, the Duhkta are flavor and tonality — they shape how units act and how virtue tooltips read. They are not a separate progression system.

---

## The Tra — Three Orc Gods

The Tra are feared, fed, and shouted at. They are not loved. Most orcs hold their faith plainly: the Tra are real, the Tra are dangerous, the Tra do not need to be loved but must not be slighted. The Mojoka are the gods' avatars in the hai; to slight a Mojoka is to slight her god.

| God | Color | Domain | Offerings |
|---|---|---|---|
| **Krull'nuk** | Green | Mojo, poison, trickery — the portal god | Explosives, poisons, residue of cast mojo |
| **Krenbluk** | Red | Blood, birth, the hai itself | Horse flesh, horse fetuses |
| **Belok** | Black | The dead, necromancy, bones | Corpses, bones |

**Chant of all three:** *"Kwat da Tra!"* — invoked before charges and at boss waves.

---

## Units of the Hai

Each orc has a place. The hai endures because the place is kept. The roster is canonical: eleven core kinds of orc, plus two reserved for forts that earn them.

In-game, the player commands these units directly. Heroes are individual named orcs who fill one of these roles — a Brute hero, a Mojoka hero, a Kaptain hero, etc.

### Core Roster

| Unit | Role | Gameplay shape |
|---|---|---|
| **Snotling** | Runt, swarm | Tiny, fast, cheap, fragile; tunnels and messages; future assassin path |
| **Peon** | Laborer | Gathers chok and r'hee; rebuilds walls; no combat |
| **Gukka** | Crafter | Forges weapons, repairs walls, tends bone-fires |
| **Grunt** | Line warrior | The horde — most orcs are Grunts |
| **Skowt** | Scout-archer | Patient, ranged, fires *lursk'a* from cover |
| **Brute** | Heavy infantry | Huge, shielded, slow, breaks lines; **Bone Wall** is the elite tier |
| **Howl'r** | Beast-handler | Tames and rides wargs; commands beast packs |
| **Kaptain** | Squad-master | Buffs nearby Grunts; many per fort |
| **Klerggoth** | Warlord | One per fort; commanding presence; player-hero archetype |
| **Wierdling** | Untrained mage | Touched by mojo, unstable, scorned; pre-Mojoka |
| **Mojoka** | Disciplined mage | Avatar of the Tra; rare, powerful, frail |

### Optional Roster (campaign progression)

| Unit | Role |
|---|---|
| **Reaver** | Sea-raider; bludgelt across the salt |
| **Elder** | Voice of old klergs; keeper of the chant |

---

## Hero System

At the start of every run, the player:

1. **Picks a unit kind** they have unlocked (Brute, Mojoka, Kaptain, Klerggoth, etc.)
2. **Names that orc**
3. **Begins the run**

The hero is the player's own avatar in the field — one active at a time, more powerful than a line orc, with a unit-specific active ability. Heroes persist in a **Hero Roster** — a stable of named orcs the player can pick from each run.

The first heroes to ship are determined by milestone scope. Specific abilities live in [src/data/heroes/](../src/data/heroes/) and tune per milestone.

---

## The Nine Urucku — Orcish Virtues

Meta-progression. Each virtue grants a permanent modifier and unlocks a unit kind, a building, or a tactical option. Players earn scar points per run (scaled by wave reached, skulls taken, style challenges) and spend them to light up nodes.

| # | Urucku | Meaning | Tentative unlock |
|---|---|---|---|
| 1 | **Ogba** | Brutality | Brute (Bone Wall at upper tiers) |
| 2 | **Iggju** | Fighting Tactics | Kaptain |
| 3 | **Kihagh** | Bloodlust | Berserker Grunt variant |
| 4 | **Rokgagh** | Deceptive Tactics | Skowt |
| 5 | **Ghigneh** | Wargod Connection | Mojoka |
| 6 | **Buorca** | Teamwork / Selflessness | Gukka |
| 7 | **Aughhagh** | Deceit | (wave 25) — Howl'r + warg pack |
| 8 | **Gagru** | Deceptive Might | (wave 50) — Reaver |
| 9 | **Highat** | Sneakiness | (wave 75, hidden) — Snotling-assassin path |

The Urucku stand on their own — they are not "corruptions of" any other tradition. The unit-to-virtue mapping above is tentative and lands fully in plan phase.

---

## The Hedk'nah — The Pile

Skulls taken in every run feed **The Pile**, a persistent meta-counter. Cosmetic milestones only — no balance impact.

> *Nub goth. Nub pulga. Hedk'nah.*
>
> "No mercy. No fear. Skulls."

---

## The Umie Crusade — Enemy Faction

A religious military order of a human kingdom that views the portal-orcs as demons summoned from hell. Banners: white and gold. Tone: fanatical, organized, increasingly desperate.

The Crusade musters in **eight orders**, each tied to one of the umies' soft virtues. Each order behaves true to its virtue — and that is also its weakness.

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

## Bloodrock Orcish — Glossary

A working list. The fuller dictionary lives in [docs/war-tome.md](war-tome.md) §9.

### Battle and the hai

| Orcish | English |
|---|---|
| ISE HAI! | "One clan!" — rallying cry, wave-start |
| NOOOGRAH! | Charge cry, shouted into the umies' faces |
| Kwat da Tra! | "Four of three!" — all gods named at once |
| Klerg | War; a single conflict or siege |
| Klerggoth | Warlord; holder of the stone |
| Klomp | Formal challenge-fight by which orcs settle rank |
| Hai | Clan; the body of orcs that share a stone |
| Bludchok-hai | Bloodrock Clan |
| Pulga | Captive, prisoner |
| Lursk'a | Arrow, bowshot |
| Umie | Human; the soft enemy |
| Hedk'nah | Skull(s) |

### Resources

| Orcish | English |
|---|---|
| Bludgelt | Loot (the truest measure of a hai's strength) |
| Chok | Stone |
| R'hee | Wood |
| Fless | Meat |
| Mojo plak | Reagents |
| Lir'tyk | Hides |
| K'nabb'h | Bones |
| Krenbluk'a cha | Ale |

### Common verbs and particles

| Orcish | English |
|---|---|
| Clomp | Destroy, smash |
| Gug / guk | Good / is good |
| Nub | No, nothing |
| Jat | Now |
| Uk | Take |
| Gib | Give |
| Shu'uk | Gather |
| Mojo | Magic |
| Blud | Blood |

---

## Battle Cries (canonical strings)

- **"ISE HAI!"** — clan cry (wave-start)
- **"NOOOGRAH!"** — charge cry (orc charge into umies)
- **"KWAT DA TRA!"** — three-gods invocation (boss wave / hero ability)
- **"Bludchok-hai gug!"** — Bloodrock Clan is good (victory)
- **"Hedk'nah gug."** — "The skull is good" (kill confirmation)
- **"Umies! Klerg jat!"** — "Humans! War now!" (Skowt warning, wave incoming)
- **"Nub klomp Mojoka."** — "Do not strike a Mojoka" (Mojoka unit flavor)
- **"Nub goth. Nub pulga. Hedk'nah."** — "No mercy. No fear. Skulls." (the creed)
