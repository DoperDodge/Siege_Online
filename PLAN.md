# PLAN.md — Project REDMOND
### A multiplayer tactical-breach shooter modeled on Rainbow Six Siege, played on a full recreation of Oregon

> **Audience:** Claude Opus 5.5 running in Claude Code.
> **Owner:** Ulo (DoperDodge). Intermediate programmer, Windows 11, plays Siege.
> **Target machine:** RTX 3070 Ti (8 GB VRAM), i5-12600K, 32 GB RAM.
> **Plan written:** 2026-09-29 (live Siege season at time of writing: Y11S3 "Operation Split Fire").

---

## 0. Prime directives (read these first, follow them always)

1. **Research before you build.** Phase 0 (below) is mandatory. You must deeply research Rainbow Six Siege's current mechanics, the 12 operators, their weapons/gadgets, and the Oregon map *before* writing gameplay code. Write what you learn to `research/` with source URLs. Use subagents to research in parallel.
2. **Never invent Siege facts.** If you can't verify a value (damage, timer, gadget count, room name), mark it `UNVERIFIED` in the data file, use a sensible placeholder, and list it in `research/OPEN_QUESTIONS.md`. Ask Ulo when he can answer (he plays the game).
3. **The baseline data in this plan may be outdated.** Siege changes every season. Treat every number and loadout below as a starting point to verify against the *current* official sources (Ubisoft operator pages, latest Designer's Notes and patch notes). When sources disagree, official Ubisoft > Liquipedia > Fandom wiki > siege.gg > everything else. Record the season you verified against.
4. **Data-driven everything.** Operators, weapons, gadgets, surfaces, timers, and mode rules live in data files (`data/*.json` or Godot `.tres`), never hardcoded. Balancing should never require touching code.
5. **Server is the source of truth.** Every gameplay-relevant state (health, destruction, gadgets, round state) is decided by the server.
6. **Playable at every milestone.** Each phase ends with something Ulo can launch and test. Keep `PROGRESS.md` updated and tell him exactly how to test each milestone.
7. **Log decisions.** Any architectural choice or deviation from this plan goes in `DECISIONS.md` with a one-line reason.
8. **Commit often.** One logical change per commit, conventional commit messages, push to GitHub (`github.com/DoperDodge`). Use Git LFS for binary assets.

---

## 1. Scope summary

- 6v6-capable (up to **5v5 players** per match, like Siege — the "6 attackers / 6 defenders" is the operator roster per side).
- One map: **Oregon**, recreated as completely and accurately as possible (current live layout).
- Core objective: **Bomb** (Oregon's 4 bomb-site pairs). Secure Area / Hostage are stretch goals.
- Lobby formats: **1v1**, **Quick Match**, **Unranked**, **Ranked**, **Bot Training**, plus **Custom** and **Practice** (additions). (Quick Match added by Ulo 2026-09-29.) Every format must work with **any team size from 1 to 5**, including uneven teams (e.g., 2v3).
- Full Siege movement: walk, sprint, crouch, **prone**, **lean/tilt** (in all stances where Siege allows it), vaulting, rappelling, ladders.
- Full Siege intel layer: **drones** (attackers), **cameras** (defenders, including Oregon's default cams), pinging, spectating.
- Full Siege destruction: **soft walls, hard walls, reinforced walls, floors/ceilings, hatches, barricades**, bullet penetration, melee punching, explosives, hard breaching.
- 12 operators, each with their real primaries, secondaries, secondary-gadget options, and unique ability:
  - **Attackers:** Brava, Fuze, Thermite, Striker, Dokkaebi, Sledge
  - **Defenders:** Sentry, Skopós, Mira, Legion, Pulse, Mute
- **Bot Training mode**: play solo or with friends against (and alongside) AI bots that use real operators, gadgets, and Siege tactics (see §15).
- Good-looking 3D models (see §12 for the honest asset strategy).

### 1.1 IP / legal guardrails
This is a **private, non-commercial fan project**. Do not rip, extract, or decompile any assets (models, textures, audio, map files) from Siege's game files, and don't scrape Ubisoft artwork into the build. All art/audio must be original, procedurally generated, or from properly licensed sources (CC0 / CC-BY with credits in `ASSET_SOURCES.md`). Don't set up any public distribution (no Steam/itch release) without Ulo explicitly deciding that later — if he ever does, operators, names, and the map would need to be replaced with originals.

---

## 2. Phase 0 — Deep research protocol (MANDATORY, do this first)

Spin up parallel research subagents. Each produces a markdown file in `research/` with a sources list at the bottom. Nothing in Phase 1+ starts until these exist and Ulo has skimmed `research/SUMMARY.md`.

### 2.1 Research tasks and output files

| File | What must be in it |
|---|---|
| `research/core_mechanics.md` | Movement speeds per speed rating (walk/sprint/crouch/prone, m/s), stance hitbox heights, lean rules (which stances, toggle vs hold, lean angle), vault rules, rappel rules including the **Siege X** rappel upgrade (horizontal sprint on rappel, going around corners, inverted rappel, breaking windows), ladder rules, fall damage, health per armor/health rating, DBNO (down-but-not-out) rules (HP, bleed-out time, crawl speed, revive time, self-revive rules), headshot rules, limb multipliers, friendly-fire rules (current reverse-FF behavior), melee damage, noise/footstep system, ADS rules, sprint-to-fire delay. |
| `research/destruction.md` | Every surface class and what can damage it: soft walls, hard walls, reinforced walls, floors/ceilings (soft vs hard), hatches (open, reinforced), door and window barricades, windows/glass, destructible props. Bullet penetration rules by weapon class/caliber. Hole sizes from bullets, shotguns, melee, impact grenades, nitro cells, breach charges, Sledge's hammer, hard breach tools. Reinforcement rules (team pool size, time to reinforce, what blocks reinforcing, can a reinforcement be placed on an already-damaged wall, bottom-gap behavior, how reinforced walls break). Wooden beams/frames that remain after breaching. **Siege X "destructible ingredients"**: gas pipes, fire extinguishers, metal detectors — exact behavior. |
| `research/round_flow.md` | Current timers (operator select, prep phase, action phase, plant time, defuser countdown, disable time), win conditions, overtime rules, side swap, attacker spawn selection, defender site selection, defender spawn-peek / out-of-bounds detection rules, round-end rules, **Pick & Ban** flow, ranked/unranked/quick match format differences (rounds to win, overtime), drone count per attacker, drone jump/cooldown, camera count and behavior. |
| `research/intel.md` | Drone movement stats, jump, health, marking/pinging rules (duration, who sees it), default camera behavior (rotation limits, zoom, destruction, can they be ping-shot), spectator rules, the comm/ping wheel (Siege X), what the "observation" tools reveal, audio intel. |
| `research/operators/<name>.md` (×12) | Per operator: side, speed/health rating, all primaries, all secondaries, all secondary-gadget options, unique ability with exact counts/timers/radii/HP, every interaction with the other 11 operators' gadgets (who counters whom, who can destroy/hack/jam what), change history for the last 4 seasons (so you know whether a guide is outdated). |
| `research/weapons.csv` | Every weapon used by the 12 operators: class, damage, fire rate (RPM), magazine, max ammo, reload (tactical/empty), ADS time, damage drop-off ranges, penetration class, fire modes, available sights/barrels/grips/under-barrel, capacity rules (+1 chambered). Also the Ballistic Shield. |
| `research/gadgets.md` | Every generic secondary gadget in the attacker and defender pools (Breach Charge, Hard Breach Charge, Claymore, Frag, Stun, Smoke, Impact EMP, Barbed Wire, Deployable Shield, Nitro Cell, Impact Grenade, Proximity Alarm, Bulletproof Camera, Observation Blocker, and any added since): count, damage, radius, HP, fuse, placement rules. Needed because Striker and Sentry can take any two. |
| `research/oregon/` | See §2.2. |
| `research/interactions.csv` | A matrix of **every gadget × every gadget** among our 12 operators + generic gadgets: `source, target, result, notes, source_url`. |
| `research/OPEN_QUESTIONS.md` | Anything you could not verify. |
| `research/SUMMARY.md` | One-page digest + the season the data was verified against. |

### 2.2 Oregon research (most important, hardest part)

Output: `research/oregon/`

1. **Determine the correct version.** Oregon was reworked in Y5S1 (Operation Void Edge). Siege X has been "modernizing" classic maps and there are reports Oregon may have left the ranked rotation in 2026 — find out whether a Siege X–era modernized Oregon exists and what changed (added destructible ingredients, visual changes, layout tweaks). **Build the most recent live layout.** If the modernized version is poorly documented, build the Y5S1 rework and note it.
2. **Collect references:** official blueprint/floor-plan images, callout maps (Liquipedia, Fandom wiki, community callout sites), and any written room-by-room descriptions. Download reference images into `research/oregon/refs/` (personal reference only; never ship them).
3. **Ulo's screenshots.** Ask Ulo to drop screenshots into `research/oregon/refs/ulo/`. The highest-value shots: each floor's blueprint in the drone/prep-phase view, each bomb site from multiple corners, every hatch, every default camera view, each spawn, and the exterior from the roof. He can take these in a Custom Game / Local match. Give him a checklist file `research/oregon/SCREENSHOT_CHECKLIST.md`.
4. **Produce `research/oregon/layout_notes.md`**: every floor (Basement, 1F, 2F, Big Tower top/3F, Roof, Exterior), every room with its callout name, approximate dimensions, connections (doors, windows, stairs, ladders, hatches, soft-wall adjacencies).
5. **Bomb sites** (verify — commonly listed as): **B Laundry / Supply**, **1F Kitchen / Dining Hall**, **1F Meeting Hall / Kitchen**, **2F Kids' Dorms / Dorms Main Hall**.
6. **Callouts to verify and expand** (partial starter list — do not trust blindly): Laundry, Supply, Laundry Stairs (B); Meeting Hall, Kitchen, Dining Hall, Lobby, Big Tower, Small Tower (1F); Kids' Dorms, Dorms Main Hall, Master Bedroom, Armory, Attic (2F); Big Tower top; Construction Site, Junkyard, Street, and the other exterior areas; attacker spawn names; rappel/roof access.
7. **Surface tagging:** for every wall segment, floor section, and ceiling section, record its type: `SOFT`, `HARD`, `REINFORCEABLE`, `HATCH`, `DOOR`, `WINDOW`. Remember **not all walls are soft**; getting the soft/hard map right is what makes this "Oregon" and not a generic farmhouse. If unsure about a specific wall, mark it `UNVERIFIED` and list it for Ulo.
8. **Common setups per bomb site** → `research/oregon/common_setups.md`: typical reinforcement lists, hatch usage, gadget spots, anchor/roam positions, attacker breach points, plant spots, and common rotates. Bots use this (§15).
9. **Default cameras** (positions, facing), **destructible ingredient locations** (if the live version has them), **ladders**, **stairs**, **vault points**, **rappel anchor zones**, **out-of-bounds/spawn-peek zones**.

---

## 3. Tech stack

| Area | Choice | Why |
|---|---|---|
| Engine | **Godot 4.x (latest stable — check at start)**, .NET/C# build | Scenes and resources are text files Claude Code can read and edit directly; fast headless mode for automated tests; free; runs great on the target GPU. Unreal would look better out of the box but its Blueprint/asset files are binary and hard for an AI to author reliably. |
| Language | **C# (.NET 8+)** for all core systems; GDScript only for tiny editor tools | Performance for netcode, destruction grids, lag compensation. |
| Physics | Jolt (Godot's built-in Jolt integration) | Stable character/rigidbody behavior. |
| Networking | ENet via `ENetConnection` / `ENetMultiplayerPeer`, **custom snapshot protocol** (not `MultiplayerSynchronizer` for gameplay-critical state) | Competitive shooters need prediction, reconciliation, lag compensation, and bandwidth control that the high-level sync nodes don't provide. |
| Assets | **Blender 4.x run headless** (`blender -b -P script.py`) for procedural models + export to glTF | Lets Claude Code author and regenerate geometry from scripts. |
| Tests | GdUnit4 (C#) + custom headless simulation harness | |
| Source control | Git + Git LFS (`*.glb, *.png, *.wav, *.ogg, *.exr`) | |

Before locking this in, spend a short spike (≤ 1 session) confirming Godot's current version supports everything in §5–§7 (C# export for Windows, headless server export, Jolt). Record the result in `DECISIONS.md`.

---

## 4. Repository layout

```
redmond/
  PLAN.md  PROGRESS.md  DECISIONS.md  ASSET_SOURCES.md  README.md
  research/                  # Phase 0 output (never shipped)
  data/
    operators/*.json         # one per operator
    weapons/*.json
    gadgets/*.json
    surfaces.json            # material/penetration table
    modes/*.json             # 1v1, quick_match, unranked, ranked, custom, practice, bot_training
    maps/oregon/layout.json  # authoritative map description (see §9)
  game/                      # Godot project root
    src/
      Core/ Net/ Player/ Weapons/ Destruction/ Gadgets/ Operators/
      Intel/ (drones, cams, pings)  Match/ (rounds, modes, lobby)
      UI/ Audio/ Bots/ Debug/
    scenes/
      maps/oregon/  test/ (movement_lab, destruction_lab, gadget_lab, net_lab)
      ui/  operators/  weapons/
    assets/ (models, textures, audio, anims)
  tools/
    blender/                 # procedural asset scripts
    mapgen/                  # layout.json -> Godot scene generator
    netsim/                  # headless multi-client test harness
  builds/                    # gitignored
```

---

## 5. Networking architecture

- **Topology:** Listen server (host plays) by default; **dedicated headless server** build for better fairness. Both use the same server code.
- **Tick rate:** 64 Hz server simulation; client renders at uncapped FPS with interpolation.
- **Client-side prediction** for local movement, stance changes, lean, and firing feedback; **server reconciliation** by replaying unacknowledged inputs.
- **Entity interpolation** for remote players (~100 ms buffer, adaptive).
- **Lag compensation:** server keeps ~1 s of hitbox history per player; on a shot it rewinds hitboxes to the shooter's view time (cap ~200 ms), including **stance and lean** poses (leaning changes the hitbox — it must be rewound too). Destruction state at the rewound time must also be respected for wallbangs (see §8.6).
- **Input packets:** sent every tick with the last 3 inputs for redundancy.
- **Snapshots:** delta-compressed against last acked snapshot; interest management by rough visibility/hearing range.
- **Destruction sync:** reliable, ordered event stream (§8.6). Late joiners/reconnects get a compressed full destruction snapshot.
- **Reconnect** mid-match (Siege lets you rejoin) — stretch goal for Phase 6, required by Phase 11.
- **Playing with friends over the internet:** document three options in README: port-forward UDP, **Tailscale/ZeroTier** virtual LAN (easiest), or a rented VPS for the dedicated server. (Note: many PaaS hosts only proxy TCP, so ENet/UDP won't work on them.)
- **Anti-cheat (basic):** server validates movement speed, fire rate, ammo, gadget counts, line-of-fire; clients never send "I hit X", only inputs + view angles + timestamps.
- **Lobby discovery:** LAN broadcast + direct IP + join code (encodes IP:port).

---

## 6. Match, lobby, and mode system

### 6.1 Lobby
- Host creates a lobby → picks **format**, map (Oregon), objective (Bomb), and advanced settings.
- Players join, pick team (Blue/Orange), ready up. Host can move/kick players, swap teams, start.
- **Any team size from 1 to 5, uneven allowed.** An empty team is only allowed in Practice. In Bot Training, bots fill every empty slot.
- Everything a format sets is just a preset of `data/modes/*.json`; the host can clone a preset into Custom.

### 6.2 Formats (all formats run the same game — they're rule presets)

| Setting | 1v1 | Quick Match | Unranked | Ranked | Custom | Practice | Bot Training |
|---|---|---|---|---|---|---|---|
| Players per team | 1 | 1–5 | 1–5 | 1–5 | 1–5 | 1–5 (0 allowed on one side) | 1–5 humans + bots fill to chosen size (e.g., 1 human vs 5 bots, or 2 humans + 3 bots vs 5 bots) |
| Rounds to win | match current Siege 1v1-style arcade if it exists, else first to 4 | match current Siege Quick Match (research: 4 rounds, first to 3, swap after round 2, 1 sudden-death OT round at 2–2) | match current Siege Unranked (research) | match current Siege Ranked incl. overtime (research) | any | ∞ | any (default Unranked rules) |
| Pick & Ban | off | off (as in Siege) | **on** — same as Ranked (Siege Unranked = Ranked minus map ban) | **on** (scaled — see below) | toggle | off | off (toggle) |
| Site selection | — | **random, revealed to attackers at round start** (as in Siege) | defenders pick | defenders pick | any | any | any |
| Prep / action time | research, default shorter for 1v1 | Siege Quick Match values (research: op pick 20 s, prep 45 s, action 180 s) | Siege values | Siege values | any | any | Siege values (adjustable) |
| Reinforcement pool | scaled (see below) | scaled, **plus Siege-style pre-setups** (pre-placed reinforcements and rotation holes per site, from `common_setups.md`) | scaled | scaled | any | infinite toggle | scaled |
| Other | — | 10 s attacker spawn safeguard; drop-in/out allowed (research) | — | — | — | — | — |
| Stats tracked | local | local | local | local MMR | none | none | local training stats (separate from ranked) |
| Friendly fire | Siege's current rules | same | same | same | toggle | off | toggle |

> Quick Match column and Unranked Pick & Ban **on** added 2026-09-29 by Ulo's decision (DECISIONS.md D-014, D-017). Siege's 3v3 Arcade was considered and **not** wanted.

**Scaling for small teams (host toggle, default ON):** Siege's reinforcement pool and similar team-wide resources assume 5 defenders. Default scaling: `pool = round(Siege_pool × defenders / 5)`, minimum 2. The host can switch to "Full Siege values" regardless of team size.

**Pick & Ban with small rosters:** only 6 operators per side exist, so Ranked and Unranked ban **1 operator per side** by default (host-configurable 0–2). Never allow bans that leave a side with fewer operators than players.

**Bots in other formats:** host toggle to backfill empty slots with bots in Quick Match, Unranked, Custom, and Practice. **Never in Ranked.**

**Operator uniqueness:** an operator can be picked by only one player per team, same as Siege.

**Ranked MMR:** there's no central server, so store a simple Elo/Glicko per player profile locally on the host and sync to clients after the match. Label it clearly as "local ranked." Show rank icons of your own design.

### 6.3 Round flow (use researched values; these are the phases)
1. Operator select + loadout (primary, attachments, secondary, gadget) — timer.
2. Attackers choose spawn; defenders' site is set by format rules (Ranked: defenders pick site; Unranked: research).
3. **Prep phase:** defenders reinforce, barricade, place gadgets; attackers drone from spawn. Attackers can't enter the building. Defender spawn-peek rules apply once action starts.
4. **Action phase:** full gameplay. Out-of-bounds detection for defenders who leave the building (research the current timer and reveal behavior).
5. **Plant/defuse:** plant channel, defuser countdown, disable channel. Round ends on elimination, timer expiry, defuser detonation, or disable.
6. Round end → brief summary → side swap per rules → next round.
7. Match end → scoreboard, MVP, stats, MMR update.

---

## 7. Player controller

All values from `research/core_mechanics.md`, stored in `data/`.

- **Stances:** stand, crouch, prone. Toggle and hold modes (separate bindings). Transition times and hitbox heights researched. Prone limits turn speed and aim arc exactly like Siege.
- **Lean/tilt:** left/right, toggle or hold, works while standing and crouching (and prone if Siege allows it — research). Implement as camera + weapon offset *and* a server-side hitbox pose change. Leaning must be visible to other players in third person (upper-body bend via procedural spine IK layered over the locomotion animation).
- **Speed rating 1/2/3** drives walk/sprint/crouch speeds; health rating drives max HP.
- **Sprint:** can't fire while sprinting; sprint-to-fire delay researched.
- **Vaulting** over low obstacles and through broken/open windows (not barricaded ones).
- **Rappel** (attackers): attach at roof edges/exterior walls, climb/descend, inverted rappel, peek/fire through windows, crash through windows, **Siege X upgrades** (horizontal sprint, around-corner movement).
- **Ladders** (Oregon's big tower), stairs, fall damage.
- **Melee:** punch that also makes holes in soft surfaces and breaks barricades (hole size per research).
- **DBNO:** downed state, crawling, bleed-out, revive by teammate, can still ping; finishing blows.
- **Footsteps and noise:** material-based footsteps, crouch walking quieter, sprint louder. Audio is core intel in Siege — treat it as gameplay, not polish (§13).
- **Camera:** configurable FOV (Siege-style vertical/horizontal), ADS sensitivity multipliers per magnification, raw input.

**Test scene:** `scenes/test/movement_lab.tscn` — stairs, ladders, vault boxes, windows, lean-target posts, a hitbox visualizer toggle (F3).

---

## 8. Destruction system (the heart of the game)

### 8.1 Surface classes
| Class | Examples | Bullets | Melee | Explosives | Hard breach |
|---|---|---|---|---|---|
| `SOFT_WALL` | drywall/wood interior walls | penetrate + make small holes | holes | breach | — |
| `REINFORCEABLE` (unreinforced) | soft wall eligible for reinforcement | same as soft | same | same | — |
| `REINFORCED_WALL` | steel-reinforced | no | no | no (only specific tools) | yes (Thermite, Hard Breach Charge, others per research) |
| `HARD_WALL` | concrete/brick, load-bearing | no | no | no | no |
| `SOFT_FLOOR` / `SOFT_CEILING` | wooden floors | penetrate + holes | holes (from above/below per rules) | breach | — |
| `HARD_FLOOR` | concrete | no | no | no | no |
| `HATCH` | floor trapdoor | per rules | yes | yes | reinforced: hard breach only |
| `BARRICADE` | wooden door/window barricade | holes | break | break | — |
| `WINDOW` | glass | shatters | shatters | shatters | — |
| `PROP` | furniture, shelves, tables | per research | per research | yes | — |
| `INGREDIENT` | gas pipe, extinguisher, metal detector | trigger behavior | per research | trigger | — |

Every property above (and anything research adds) lives in `data/surfaces.json` — the table is a default, not truth.

### 8.2 Panel representation
- Each destructible panel is a **cell grid** (start at 5 cm cells; tune for perf) with a layer stack: front skin, core (studs/joists as **indestructible-by-small-arms beam cells**, like Siege's wooden frames), back skin.
- Bullets remove a small cell cluster sized by caliber; shotguns remove a spread of clusters; melee removes a bigger shaped cluster; explosives remove a large region leaving beams and a ragged edge.
- **Rendering:** regenerate the panel mesh from the grid (marching squares on the cell mask for the skin, extruded to thickness; beams as separate meshes that can break under explosive thresholds). Bullet holes that don't fully clear a cell use decals + a "perforated" flag that still lets light/sight through a tiny aperture.
- Debris is client-side cosmetic only (particles + a few short-lived rigidbody chunks, pooled).
- Rebuild meshes on a worker thread; budget ≤ 1 ms/frame main-thread cost.

### 8.3 Reinforcement
- Defenders hold interact on a reinforceable wall or hatch → channel (researched time) → steel panels deploy with animation and sound.
- Team pool (scaled per §6.2). Rules from research: can't reinforce if blocked by player/gadget, damaged wall behavior, gap at bottom, etc.
- Reinforced walls can host Mira's Black Mirror (verify), Thermite charges, Hard Breach Charges, Fuze cluster charges (verify behavior).

### 8.4 Barricades
- Doors and windows can be barricaded by defenders (researched time). Wooden, breakable by melee (3 hits?), bullets (holes), explosives. Attackers can see and shoot through holes. Rappel window crash rules apply.

### 8.5 Bullet penetration
- Hitscan with penetration: each ray walks through surfaces, subtracting a penetration budget per material thickness (from `surfaces.json` + the weapon's penetration class); damage multiplier after each surface. Hard walls and reinforced walls stop everything.
- Shots through soft surfaces **modify the grid** (create holes) along the way.
- Wallbang hits use the same lag-compensated rewind.

### 8.6 Networked destruction
- Destruction is **server-authoritative and deterministic**: each panel has a stable ID from the map generator; the server emits events `{panelId, op, shape, params, seq}`; clients apply identically.
- Late-join / reconnect: server sends RLE-compressed cell masks for all modified panels.
- Server keeps a short history of panel masks so lag-compensated shots test against the geometry the shooter actually saw (within the rewind window).

**Test scene:** `scenes/test/destruction_lab.tscn` — one of every surface class, a weapon rack with every gun, every explosive, a reinforce station, and an "Oregon wall sample" row that uses the same wall configs as the map.

---

## 9. Oregon map build

### 9.1 Pipeline (layout-as-data)
1. Write `data/maps/oregon/layout.json` from `research/oregon/`: floors, rooms, wall segments (start/end, height, thickness, **surface class**), openings (doors, windows, with barricade flag), floor/ceiling sections (soft/hard), hatches, stairs, ladders, rappel zones, spawn points, bomb site objects, default cameras, destructible ingredients, out-of-bounds volumes, callout names per room.
2. `tools/mapgen/` generates a Godot scene: **greybox** first (colored by surface class — debug view toggles this in-game too: soft = yellow, hard = gray, reinforceable = blue, hatch = green).
3. Validate: overlay generated top-down floor plans against reference blueprints (render orthographic PNGs of each floor and put them side by side in `research/oregon/compare/`). Ulo reviews these.
4. Walk-through milestone: Ulo plays the greybox and lists every mismatch he notices. Iterate.
5. **Art pass** (§12): swap greybox for modular architecture kit, props, lighting, exterior.

### 9.2 Required completeness
- All floors including basement, both towers, attic, roof, full exterior with all attacker spawns and the outdoor areas between spawn and the building.
- Every door, window, hatch, stairwell, ladder, and soft-wall adjacency that exists in the live map.
- All four bomb site pairs with bomb objects and defuser plant zones.
- Default cameras at their real positions.
- Rappel on all exterior walls where Siege allows it.
- Lighting that matches Oregon's mood (daytime compound, dim interior, basement darker).

---

## 10. Intel systems

- **Drones:** 2 per attacker (verify). Driveable, jump (with cooldown), small hitbox, shootable, marks/pings enemies, deployable during prep from spawn and during action. Drone view UI with static effect near jammers. Drones can pass through drone holes / gaps / broken surfaces.
- **Default cameras:** fixed positions, limited yaw/pitch, zoom, destroyable by attackers, visible "glint"/indicator rules per research.
- **Bulletproof Camera** (generic defender gadget; Sentry can take it).
- **Camera/drone cycling UI:** switch between all available feeds, show which are destroyed/jammed.
- **Pinging:** marks enemies/gadgets for the team for a researched duration; **ping/comm wheel** like Siege X.
- **Spectating when dead:** defenders can still use cameras; attackers can still use surviving drones (research exact rules). Spectate teammates otherwise.

---

## 11. Operators

**Every entry below is a baseline to verify (§0.3).** Implement generic systems first (weapons, secondary gadgets, drones, cams, reinforcement), then add operators one at a time, each with a test in `scenes/test/gadget_lab.tscn`. Each operator's JSON lists loadout options by ID; the loadout screen reads from that.

### 11.1 Attackers

**Brava** — Unique: **Kludge Drone** (hacks and takes control of defender electronic gadgets). Baseline loadout: PARA-308 or CAMRS; USP40 or Super Shorty; Claymore or Smoke Grenade. *Research exactly which of Mute's, Pulse's, Mira's, Skopós', Legion's, and Sentry's gadgets can be hacked and what the hack does to each.*

**Fuze** — Unique: **Cluster Charge** (deployed on surfaces, including reinforced walls/barricades/hatches per research; drills through and releases grenades on the far side). Baseline loadout: AK-12, 6P41 LMG, or **Ballistic Shield**; PMM or GSh-18; secondary gadgets per research. *Choosing the shield means you must implement shield mechanics: shield in front, hip-fire secondary, melee bash, shield hit reactions, deployment/stowing, shield-specific camera.*

**Thermite** — Unique: **Exothermic Charge** (large hard breach on reinforced walls/hatches). Baseline loadout: 556XI or M1014; 5.7 USG or M45 MEUSOC; Smoke or Stun Grenade (verify). *Research deploy/detonation timing and what counters it (among our defenders: Mute's jammers? verify).*

**Striker** — Unique: **Gadget Kit** — equips **any two different attacker secondary gadgets** instead of gadget + ability. Baseline loadout (from New Blood, verify for Siege X changes): M4 or M249; 5.7 USG or ITA12S.

**Dokkaebi** — Unique: **Jegeo Payload** (Dokkaebi was **remastered in Y11S2**; older guides describing "Logic Bomb" + hacking dead defenders' phones for cams are **outdated** — research the remaster). As of Y11S3: the upload requires a **continuous connection** between her tablet and the target's phone, interrupting the connection cancels it, the tablet stays active/detectable during upload, and Mute's Signal Disruptors interrupt it. Y11S3 also replaced her EMP Impact Grenades with **Breach Charges**. Baseline weapons to verify: Mk 14 EBR (56 dmg in Y11S3), SMG-12 (nerfed to 16 dmg, 22-round mag, 111 max ammo in Y11S3), plus any others the current operator page lists.

**Sledge** — Unique: **Tactical Breaching Hammer** (soft walls, floors, hatches, barricades — not reinforced). Baseline loadout: L85A2 or M590A1; P226 Mk 25 (his SMG-11 was removed in Y6S3); Frag or Stun Grenade (verify any additions).

### 11.2 Defenders

**Sentry** — Unique: **Gadget Kit** — **any two different defender secondary gadgets**. Baseline loadout: Commando 9 or M870; C75 Auto or Super Shorty.

**Skopós** — Unique: **V10 Pantheon Shells "Talos" and "Colossus"** — two robot bodies; she controls one at a time and swaps between them with the gadget key. The inactive shell stays in the world as a gadget with a camera (and protective element — research). Destroying the **inactive** shell does not eliminate her; destroying the **active** one does. Each shell has its own weapon ammo pool; secondary gadgets are shared. Baseline loadout: PCX-33; P229; Impact Grenades or Proximity Alarms. *Implementation note: this is effectively two pawns per player — design the player/pawn separation early (Phase 1) so this isn't a rewrite later. Research how Brava, Dokkaebi, and other gadgets interact with shells.*

**Mira** — Unique: **Black Mirror** (one-way bulletproof window installed in a wall; defender-side canister can be shot to eject the glass). Baseline loadout: Vector .45 ACP or ITA12L; USP40 or ITA12S; Nitro Cell or Proximity Alarm (verify). *Research visibility from each side, placement rules (soft vs reinforced), HP, and the canister behavior. Rendering: see-through from defender side, degraded/tinted per research from attacker side — implement with a two-sided shader.*

**Legion** — **Unknown to the plan author. Research fully before implementing — do not guess.** Get season introduced, ability, loadout, and interactions from the official operator page.

**Pulse** — Unique: **heartbeat / cardiac sensor** (detects living enemies' heartbeats through walls and floors within a range; shares info per current rules). Baseline loadout to verify: UMP45 or M1014; 5.7 USG or M45 MEUSOC; secondary gadgets per research. *Research any Siege X changes to how his sensor works.*

**Mute** — Unique: **Signal Disruptors** (jam drones, remote-detonated breach charges, and other electronics in a radius; as of Y11S3 they also interrupt Dokkaebi's Jegeo Payload). Baseline loadout to verify: MP5K or M590A1; P226 Mk 25 or SMG-11; Nitro Cell or Bulletproof Camera.

### 11.3 Generic secondary gadgets
Implement every attacker and defender gadget in the current pools (see `research/gadgets.md`) — not just the ones our 12 operators carry by default — because Striker and Sentry can take any two. Stats from research (e.g., Claymore damage was raised to 155 in Y11S3).

---

## 12. Art, models, and animation

### 12.1 Honest asset strategy
Claude Code can generate clean, good-looking **architecture, props, gadgets, and hard-surface weapons** with Blender scripts + PBR textures. It cannot produce AAA character models on its own. So:

| Asset type | Source |
|---|---|
| Map architecture, walls (with the cell-grid-compatible layering), floors, stairs, towers, exterior buildings, fences, vehicles, junk | Procedural Blender scripts (`tools/blender/`) + CC0 PBR materials (Poly Haven, ambientCG) |
| Furniture/props | Blender scripts; CC0 packs (Kenney, Quaternius, Poly Haven models) |
| Weapons | Parametric Blender weapon kit (receiver, barrel, handguard, stock, mag, optic mounts, attachments as separate meshes so attachments work). Optionally Ulo can drop in licensed models (Sketchfab CC-BY with credit) into `assets/overrides/` — the importer prefers overrides. |
| Gadgets & drones | Blender scripts |
| Operator bodies + animations | Rigged humanoid base (Mixamo characters or MPFB/MakeHuman CC0 body) + procedurally modeled tactical gear (vests, helmets, pouches, visors) per operator, with distinct silhouettes and colors. **Mixamo animations** for locomotion/stances. |
| First-person arms + weapon anims | Procedural (IK-driven reload/ADS/inspect using keyframes authored in Blender scripts), since viewmodel anims are specific |

**Manual steps Ulo must do** (put these in `README.md`, with exact file names and settings): download listed Mixamo characters/animations as FBX (Claude Code can't log in to Mixamo), put them in `assets/incoming/mixamo/`; the import tool retargets them to the project skeleton.

Optional: AI 3D generators can make decent props/gadgets as GLB; if Ulo supplies any, run them through a cleanup script (decimate, fix normals, rescale, generate LODs, repack textures).

### 12.2 Quality bar & budgets (8 GB VRAM target)
- Stylized-realistic PBR, consistent texel density (~512 px/m environment, 1024 px/m hero weapons in first person).
- Characters: ≤ 40k tris LOD0, 3 LODs. Weapons (1P): ≤ 25k tris. Props: LODs + occlusion culling.
- Texture memory budget: ≤ 3 GB total loaded for Oregon at High.
- Lighting: baked GI (LightmapGI) for static geometry + dynamic lights for gadgets/explosions; **destruction must not break lighting** — use probe-based fill so holes in walls let light through plausibly.

### 12.3 Animation requirements
Third-person: idle/walk/sprint/crouch/prone locomotion (8-way), stance transitions, lean (procedural spine), rappel set, vault, ladder, DBNO crawl, revive, reinforce, barricade, plant/defuse, gadget throw/place, melee, shield set (Fuze), death ragdoll. First-person: per-weapon idle/ADS/fire/reload (tac + empty)/sprint/equip/melee, gadget use per operator.

---

## 13. Audio (gameplay-critical)
- Footsteps per surface material and stance; volume/range by movement type.
- **Propagation/occlusion:** sound paths through open doors, holes, and destroyed surfaces must be louder than through intact walls — use raycast occlusion + a room/portal graph that updates when surfaces are destroyed (mirror the spirit of Siege X's audio overhaul: players should hear roughly *where* and *in what room* enemies are).
- Distinct cues: reinforcement, barricade break, drone motor, jammer hum, each gadget, reload, lean rustle, rappel.
- Sources: CC0 (Freesound CC0, Sonniss GDC bundles) and procedural synthesis; credits in `ASSET_SOURCES.md`.
- Optional voice chat (Phase 11+): team + all-chat, Opus codec, push-to-talk.

---

## 14. UI / UX
- Main menu, Play (host/join/LAN list/join code), **Bot Training**, Settings, Practice.
- Lobby screen with format presets and advanced options.
- Operator select with loadout builder (weapon, attachments, secondary, gadget) and ban phase UI.
- HUD: health, ammo, gadget counts, ability, round timer, team portraits, kill feed, ping markers, objective/site markers, plant/defuse progress, reinforcement pool counter.
- Drone/cam UI, spectator UI, scoreboard (Tab), round summary, match summary.
- Settings: sensitivity (hip + per-magnification ADS), FOV, keybinds (**separate toggle/hold options for lean, crouch, prone, ADS**), graphics presets, audio, colorblind options.

---

## 15. Bot Training mode

A lobby format where bots fill every empty slot on both teams. Works offline (solo, no network needed) and online (friends co-op vs bots, or humans on both sides with bots filling gaps).

### 15.1 Setup options
- Your side (attack / defense / alternate each round), team sizes (1–5 each side, uneven allowed), bot difficulty per team, site choice (random or fixed), round count, and bot operator picks (random, fixed, or "counter my pick").
- **Drills** (preset scenarios): 1v1 aim duel, solo retake vs 1–3 defenders after plant, solo site hold vs 5 attackers, clear-a-floor, drone-and-call practice, and "custom scenario" (choose site, bot count, starting positions, round state).

### 15.2 Difficulty levels
`Recruit`, `Normal`, `Hard`, `Elite`, all tunable in `data/bots/difficulty.json`: reaction time, aim error and tracking, recoil control, headshot bias, peek style (wide swing vs jiggle/lean peek), how often they use utility, how well they use sound, how much they coordinate. **No cheating at any level:** bots only know what their team could legitimately know.

### 15.3 What bots must be able to do
- **Play every operator** with their real loadouts and use their ability correctly (Thermite breaches reinforced walls, Mute jams breach points and drone paths, Mira places windows on good spots, Pulse scans floors, Skopós swaps shells, Striker/Sentry pick sensible gadget pairs, etc.).
- **Defenders:** reinforce walls and hatches, barricade, place gadgets, pick anchor/roam roles, rotate, punch/shoot rotate holes and murder holes.
- **Attackers:** drone during prep, pick a spawn, clear roamers, breach soft and reinforced walls, go vertical through floors/hatches, rappel, plant, and hold the defuser.
- **Movement & gunfights:** lean peeks, crouch/prone, pre-aim common angles, wallbang soft walls at heard/pinged positions, trade kills, reload behind cover, DBNO revives.
- **Intel:** use cameras and drones, ping enemies for teammates, react to pings from human teammates, listen to footsteps and destruction through the audio propagation system (§13).
- **React to destruction:** navigation updates when walls, floors, and hatches are opened or reinforced.

### 15.4 Architecture
- Runs **server-side** on the host. Bots produce the same `InputCommand`s as human players, so netcode, lag compensation, anti-cheat validation, and replays work unchanged.
- **Team planner** ("commander") per side picks a strategy for the round from `data/maps/oregon/bot_strats.json` (built from `research/oregon/common_setups.md`): reinforcement list, gadget spots, anchor/roam roles, breach points, plant spots, rotates.
- **Individual bots:** utility AI or behavior trees (document the choice in `DECISIONS.md`) for moment-to-moment decisions.
- **Perception:** vision cones respecting stance, lean, smoke, and lighting; hearing from the audio system; shared team intel (cams, drones, pings).
- **Navigation:** navmesh with nav links for vaults, ladders, stairs, hatches, and rappel; regions rebake locally when a surface changes (budgeted, off main thread).
- **Human teammates:** bots follow simple commands via the ping/comm wheel ("hold here", "breach this", "go here").

### 15.5 Training feedback
After each round: where you died and who saw you first, damage dealt/taken, time to plant/defuse, utility you used, and a quick killcam. Stats saved per drill and per operator so Ulo can track improvement.

### 15.6 Bots as a test tool
Bot-vs-bot matches double as automated **soak tests** for netcode, destruction determinism, and performance (§19).

---

## 16. Good additions (included in scope)
1. **Practice mode / firing range** with infinite gadgets, target dummies with hitbox display, and a wall-type sampler.
2. **Debug overlays** (F-keys): surface class colors, hitboxes, net stats (ping, loss, snapshot size), audio occlusion rays, lag-comp rewind visualization.
3. **Killcam and round replays** from the server's input/event log (cheap once the netcode is event-based).
4. **Bot Training mode** — now a full required feature, see §15.
5. **Spectator/caster mode** (free cam + player POV + map overview).
6. **Ping/comm wheel** and quick-callouts using Oregon's callout names in the HUD.
7. **Local stats** per operator (K/D, win rate, plant rate) with a match history screen.
8. **Map overview / blueprint view** during prep (like Siege's floor-plan view).
9. **Network condition simulator** (latency/jitter/loss sliders) for testing hit-reg.
10. **Crash-safe matches:** host persists match state each round so a crash can resume.

---

## 17. Milestones (each ends playable; update PROGRESS.md with "how to test")

| Phase | Deliverable | Done when |
|---|---|---|
| **0** Research | `research/` complete, SUMMARY.md, OPEN_QUESTIONS.md, screenshot checklist sent to Ulo | Ulo skims and answers open questions he can |
| **1** Skeleton + movement | Godot C# project, player/pawn separation (Skopós-ready), stand/crouch/prone, lean (toggle/hold), sprint, vault, ladders; movement_lab | Feels like Siege movement to Ulo, offline |
| **2** Netcode core | Host/join, prediction, reconciliation, interpolation, lag-comp framework, netsim harness with 10 headless clients | Two PCs play smoothly at 100 ms simulated latency |
| **3** Gunplay | Weapon data system, recoil, ADS, attachments, hit reg with rewind incl. lean/stance hitboxes, DBNO, revive | Headshots/wallbang-free hit-reg feels right at 100 ms |
| **4** Destruction v1 | Soft walls, floors, barricades, reinforcement, hatches, penetration, networked destruction + late join; destruction_lab | Wallbangs, punch holes, reinforcing all synced across clients |
| **5** Oregon greybox | layout.json + generator + full greybox with correct surface tagging, sites, spawns, cams | Ulo walks it and signs off on layout accuracy |
| **6** Match flow + lobby | All formats, any team size 1–5 uneven, operator select, prep/action, plant/defuse, rounds, side swap, bans, scoreboard | Full 1v1 and 2v3 matches playable start to finish |
| **7** Intel | Drones, default cams, BP cam, pinging, spectating, comm wheel | Prep-phase droning + cam watching work online |
| **8** Operators | Generic gadget pools, then the 12 operators one by one (suggested order: Sledge, Thermite, Striker, Sentry, Mute, Pulse, Mira, Fuze (+shield), Brava, Dokkaebi, Skopós, Legion), each with interaction tests | Every row in interactions.csv has a passing test |
| **9** Bot Training (uses placeholder audio events until Phase 11) | Navmesh + destruction rebake, perception, team planner, bot_strats.json for all 4 Oregon sites, all 12 operators playable by bots, difficulty levels, drills, training feedback | Ulo can play a full solo match vs 5 Normal bots on attack and defense, and it feels like Siege |
| **10** Art pass | Architecture kit, props, lighting, weapons, gadgets, operator models, 1P/3P anims | Oregon looks finished at 1080p High, ≥ 120 FPS on target PC |
| **11** Audio | Materials, propagation/occlusion, all cues | Ulo can locate an enemy by sound through a floor |
| **12** Polish | Practice mode, killcam, settings, perf pass, reconnect, voice (stretch), packaged Windows build + dedicated server build | 5v5 over Tailscale for a full match with no desyncs |

---

## 18. Performance targets
- 1080p High: **≥ 120 FPS** average, ≥ 90 FPS 1% lows on RTX 3070 Ti / i5-12600K, during heavy destruction.
- Server tick ≤ 5 ms at 10 players on the same machine as a client, **including 9 bots** in Bot Training.
- Bandwidth ≤ 64 kbps down per client typical, ≤ 256 kbps peak during mass destruction.
- VRAM ≤ 6 GB at High.
- Load Oregon in ≤ 15 s from SSD.

---

## 19. Testing
- **Unit tests** (GdUnit4): damage math, penetration, surface rules, gadget interactions, round state machine, mode presets with odd team sizes.
- **Determinism tests:** apply the same destruction event log on two headless instances → identical cell masks (hash compare).
- **Netsim:** headless clients with scripted inputs + injected latency/loss; assert no desyncs over a 10-round match.
- **Bot soak tests:** nightly headless 5v5 bot-vs-bot matches on every site; assert no desyncs, no stuck bots > 10 s, no crashes.
- **Interaction tests:** one scripted test per row of `research/interactions.csv`.
- **Perf captures:** automated fly-through of Oregon + scripted mass destruction; fail CI if frame time budget exceeded.

---

## 20. Working agreement with Ulo
- He prefers **direct, concise** communication — short status updates, lead with what changed and how to test it.
- Ask **one clear question at a time** when blocked; batch non-blocking questions into `research/OPEN_QUESTIONS.md`.
- At the end of each phase, give him: what's done, how to launch/test (exact commands), known issues, next phase.
- Never silently drop a feature from this plan; if something must be cut or deferred, write it in `DECISIONS.md` and tell him.
