# PROGRESS.md

Status per phase (PLAN.md §17). Newest phase on top. Each phase lists what's done, how to test it,
known issues, and what's next.

---

## Phase 4 — Destruction v1 · 🚧 in progress (branch `claude/phase-4-destruction`)

**Done when (PLAN §17):** wallbangs, punch holes and reinforcing are all synced across clients.

Built in milestones; each keeps the tests, the browser tests and the netsim green, and the game playable.

| Milestone | Status |
|---|---|
| M1 Destruction data (constructions, bullet tiers, tools, reinforcement, barricades, hatches) | ✅ data/destruction.json, validated; 8 new open questions |
| M2 Panel model: a cell grid per surface (skins, studs, steel), holes, falling pieces | ✅ pure model + 13 tests (D-062) |
| M3 Panels in the simulation (movement through holes) and on screen | ✅ intact panels collide exactly as before; breaches let bodies through; rays see holes; drawn from cells (D-064) |
| M4 Bullets and the knife through panels (wallbangs, holes, rewound holes) | ✅ on the server: wallbangs at 70 %, holes, studs, steel, two-wall limit, knife holes, panels as the shooter had them (D-065) |
| M5 Destruction over the network, and for players who join late | ✅ ops to everyone each tick with a hash check; full state on joining; netsim and browser test agree (D-066) |
| M6 Reinforcement, barricades and hatches | ✅ hold F to reinforce (4.5 s, team pool, from your side, hatches from above), barricade (2 s) or pry one off (1 s); Destruction Lab level (D-067) |
| M7 Destruction Lab (explosive tools, every surface, Oregon wall samples) | ⏳ |
| M8 Browser and netsim tests, docs | ⏳ |

### What's done
- **Destruction data (M1):** `data/destruction.json` holds the rules. Every destructible surface is a panel
  built from a *construction*: two skins and a core (wooden studs in walls, metal joists in floors, beams in
  hatches) on a grid of 5 cm cells, plus door and window barricades and glass. Bullets follow each weapon's
  destruction tier (from its weapon file, or its class where the file has none; the XK23's "medium" is the
  official one): hole size, whether it cuts studs (buckshot only within 5 m), and how much it wears down a
  hatch or barricade (a DMR opens a hatch in 9 shots, a slug in 3, two buckshot blasts; a barricade takes 3
  knife hits or about 20 rifle bullets). Wallbangs lose 30 % per wall, through at most 2. The knife punches a
  25 cm hole. The Destruction Lab's explosives (Breach Charge, Impact and Frag Grenades, Nitro Cell, Exothermic
  and Hard Breach Charges) cut their shapes; only the last two cut steel. Reinforcing takes 4.5 s from a team
  pool of 10 (lab rooms let both sides reinforce and barricade); a reinforced hatch has a 1,000,000 HP pool.
  Everything not verified is listed in research/OPEN_QUESTIONS.md ("Placeholders added while building Phase
  4", 8 questions). The movement lab's floor hatch sample is now thick enough to be a real panel.
- **The panel model (M2, D-062):** each destructible surface is a grid of 5 cm cells in layers (two skins, a core
  of studs, joists or beams, and steel once reinforced). A bullet removes the cells within its hole's radius
  (always the one it hit), the knife a 25 cm disc, a breach a rectangle; whatever nothing holds then falls (a
  piece of skin cut free of the frame and the studs, a stud cut at both ends, a reinforcement cut along a full
  line at the top and the bottom). Hatches, barricades and glass break whole once worn down; a reinforced
  hatch takes only hard damage. Bodies collide with 10 cm cells, so bullet holes never open a gap, only a real
  breach does; floors never open. A panel's state is run-length coded (about 1–2 KB for a wall shot to pieces)
  and hashed, for players who join later and to check clients agree.
- **Panels in the game (M3, D-064):** the labs' destructible surfaces are now panels. Bodies collide with a
  panel's solid 10 cm cells (an intact wall is exactly the box it was), so an opening a body fits through lets
  it walk through; a soft floor never opens; a broken hatch drops whoever stands on it. Bullets, the knife's
  reach, laser dots and bullet marks see every hole. Panels are drawn from their cells (skins in the surface's
  colour, wooden or metal studs, steel plates on the side they went up from) and redrawn when they change.
  Nothing in the game damages them yet: bullets and the knife start making holes in M4.
- **Wallbangs and holes (M4, D-065):** on the server, a bullet now goes through what it can break, making a hole
  in every layer it passes, and stops at steel, metal supports and studs its gun can't cut (buckshot cuts them
  within 5 m). A body behind a wall takes 70 % per wall; a bullet goes through at most two walls. Hatches,
  barricades and glass wear down per bullet (a DMR opens a hatch in 9 shots spread over it; ten knife hits
  do it too). The knife punches a 25 cm hole through both skins of a wall. Shots are judged against the walls
  as the shooter's screen had them. Players see the holes from M5 (until then only the server has them).
- **Holes for everyone (M5, D-066):** each tick's holes go to every player (a few bytes each) with a checksum
  of all the walls; a player whose walls ever disagree gets them again, and one who joins mid-game gets them
  all at once. Broken pieces throw a few chunks of debris. Tested in the netsim (ten bots fighting across the
  sample walls: every client ends with the server's walls, 33–38 kbps each) and in a browser test
  (`tools/e2e/online-walls.mjs`: a wallbang hit at +100 ms, a sprayed and knifed wall, a watcher and a late
  joiner with exactly the server's walls).
- **Reinforcing, barricades and hatches (M6, D-067):** hold F at a wall section for 4.5 s to put steel up on
  your side (one of the team's 10 reinforcements; a hatch only from above); hold F for 2 s to barricade an
  empty door or window, or 1 s to pry a barricade off. You stand still meanwhile, and the bar shows the time
  left. Defenders only, except in lab rooms. Three knife hits break a barricade; a broken hatch drops whoever
  stands on it. The new Destruction Lab level has every kind of wall, door, window, hatch and floor (its
  page comes in M7).

---

## Phase 3 — Gunplay · ✅ complete (merged, PR #4; Ulo tested it at +100 ms on 2026-10-08: headshots land)

**Done when (PLAN §17):** headshots and hit registration feel right at 100 ms.

Built in milestones; each one keeps the tests, both e2e scripts and the netsim green, and the game playable.

| Milestone | Status |
|---|---|
| M1 Weapon, gunplay, combat and lab-rules data | ✅ 40 weapon files + rule files, validated, CSV-agreement tests |
| M0 Hit-registration measurement harness | ✅ server agrees with every shot as drawn (netsim); rewind cap 250 ms (D-045, your call) |
| M2 Damage maths and loadout resolution | ✅ pure functions + tests (the simulation uses them from M3, the server's damage from M6) |
| M3 Weapon state in the simulation (fire, ammo, reload, swap, modes) | ✅ predicted exactly online; ammo HUD; Fire/R/1/2/wheel/B |
| M4 Loadout pick online, data hash check | ✅ pause-menu loadouts (offline and online), stale tabs told to refresh |
| M5 ADS, recoil, spread | ✅ recoil predicted exactly online; server-only spread; zoom and spread crosshair |
| M6 Hit registration, damage, death | ✅ every pellet judged on the server; kills, hit markers, kill feed; no new mispredictions |
| M7 DBNO and revive | ✅ down, crawl and bleed; hold F for 4 s to revive; predicted with no mispredictions |
| M8 Melee | ✅ V swings the knife: kills standing or downed, judged with lag compensation |
| M9 Client presentation (viewmodel, HUD, hit markers) | ✅ a gun in your hands, sights, flashes, tracers and bullet marks; ADS sensitivity per zoom |
| M10 Range Lab (dummies) | ✅ targets out to 50 m, offline in its own room or online; F2 overlay, damage against the data |
| M11 End-to-end tests, netsim gates, docs | ✅ a fight in the netsim, two Range Lab browser tests, hit-reg gates (D-060) |

### What's done
- **Weapon data (M1, D-039):** `data/weapons/<id>.json` for all 40 roster weapons, generated once from
  `research/weapons.csv`. Damage and falloff, fire rate and modes, magazine and +1, total ammo, reload times
  (with the community-measured ammo-refill points), ADS time, attachments (including the per-operator ones:
  Dokkaebi's Mk 14 telescopic sight and muzzle brake, Brava's CAMRS grips, the 5.7 USG muzzle brake),
  extended-barrel damage, and the two official recoil facts (Mk 14 first-shot ×3.5, Reaper MK2 stages).
  `data/gunplay.json` holds class, sight, attachment and handling rules; `data/combat.json` damage zones,
  penetration, DBNO, revive and melee; `data/modes/lab.json` the lab mode preset (friendly-fire settings). Every
  invented value is in its file's `_unverified` list and in research/OPEN_QUESTIONS.md ("Placeholders added
  while building Phase 3", 34 questions).
- **Checks:** schemas reject impossible weapons (damage rising with range, a barrel offered without its
  numbers, more than one shot per tick, and more), cross-file checks catch loadouts naming a missing weapon,
  and a test compares every number and UNVERIFIED mark with the CSV and the class rules
  (weapons_notes.md §4). The Ballistic Shield and GONNE-6 are in the data but can't be picked until Phase 8
  (D-054).
- **Loadouts and damage maths (M2):** a loadout pick (operator, two weapons with sight, barrel, grip and laser,
  gadgets) is checked against the data (who can carry what, per-operator attachments, the shield and GONNE-6
  not pickable yet) and an invalid one quietly becomes the default loadout. It resolves into the numbers the
  simulation will use, all in 64 Hz ticks: ADS time with sight and laser bonuses, reload times with the angled
  grip, refill points (estimated from similar guns where nobody measured them), swap time, move speed, recoil
  with barrels and grips, extended-barrel damage. Damage: falloff by distance, head/neck/limb zones, buckshot
  pellets ×1.5 to the head, Skopós's idle-shell headshot rule, and limb penetration (none / simple / full).
- **Hit-registration harness (M0, D-045):** a shot now claims the frame that was on screen when you clicked,
  and the server rewinds using only the snapshots that client actually received. `npm run netsim -- --hitreg`
  runs a still shooter aiming at the heads it draws while four targets strafe, sprint, spam lean and crouch,
  crawl and vault, at 100 ms round trip: the server agrees with every shot (also with 10 ms jitter); with
  rewinding switched off, only 9 % hit the head. 11 % of shots needed more than 200 ms of rewind, so the cap
  is now 250 ms. The online lab's pause menu also simulates jitter and packet loss now (or
  `?lag=100&jitter=20&loss=1`, PLAN §16.9).
- **Weapons in the simulation (M3, D-040, D-055):** every operator now carries their real primary and
  secondary (picking another loadout came with M4). Hold the left mouse to fire (automatic weapons
  keep firing at their real rate; semi-auto ones fire per click), **R** reloads (tactical gives 31, empty 30
  on a 30-round rifle; interrupting after the magazine is out leaves just the chambered round), **1 / 2 / the
  wheel** switch weapons (0.6 s placeholder), **B** cycles fire modes where the gun has them. Sprinting
  cancels a reload, and a shot from a sprint waits out the 0.25 s sprint exit. Skopós's two shells each keep
  their own ammo. The HUD shows weapon, rounds and fire mode, with a placeholder muzzle flash. Online, all of
  it is predicted: the netsim's bots fire, reload and swap at 100 ms with jitter and stalls and get exactly one
  correction each (the join).
- **Loadouts (M4, D-042):** the pause menu has a Loadout section: each weapon your operator carries, with
  the sights, barrels, grips and laser it can take (per operator too: only Dokkaebi's Mk 14 gets the telescopic
  sight, only Thermite's and Pulse's 5.7 USG the muzzle brake). Under each weapon are the numbers the game
  uses (damage, fire rate, magazine, ADS and reload times with your attachments, speed), with a **?** on any
  that is still a placeholder. The Ballistic Shield and the GONNE-6 are listed but greyed out until Phase 8.
  Online, the server spawns the new body and everyone sees what you carry; the team switch lives there too.
  The loadout is part of the link, e.g. `?op=brava&primary=para_308.magnified..angled`. A browser tab left
  open across an update is now told to refresh (the game data is checked when you connect).
- **Aiming, recoil and spread (M5, D-041):** hold the right mouse to aim: the sights come up over the
  weapon's ADS time (faster with a laser or a better sight, 10 % slower straight out of a sprint), and a
  magnified sight zooms in. Long drops (over 1 m, placeholder) take the sights down. Spraying kicks the view up
  and sideways in stages by bullet (the Reaper MK2's official stages at bullets 3, 10 and 25), never past
  the pitch limit, and lying against a wall the sideways kick can't swing your body into it. Hip-fire spreads
  bullets inside a cone that four ticks around the dot show; aiming down sights closes it (to nothing for
  bullets, to a tighter cone for buckshot) and moving widens buckshot. Online, recoil is predicted exactly (no
  corrections) and only the server knows where each pellet goes. All numbers are placeholders.
- **Damage and death (M6, D-043, D-044, D-046, D-051):** shots now hurt. The server judges every pellet
  against everyone as the shooter saw them, then applies the tick's damage in a fixed order: bullet and slug
  headshots kill, buckshot does ×1.5 per pellet to the head, limbs take less, and rifles' penetration follows
  the weapon. Two players who shoot each other in the same tick both die; the dead can't fire; friendly fire
  is on in lab rooms. You get a hit marker (red on a kill) with the damage and the zone, a red edge and an arc
  pointing where damage came from, and a kill feed top right; dying shows who killed you and with what.
  Other players' shots show a muzzle flash and tracers when they happen on your screen. Skopós's idle shell
  can be destroyed without eliminating her (she just can't swap any more). Bullets go through the invisible
  ramp over the stairs but stop at walls. The pause menu has **Refill ammo** and **Take 30 damage**. Online,
  a hit costs the victim one correction from the server and never a misprediction: the netsim's spread-out
  bots shoot and kill each other with 0 mispredictions, and its hit-registration run confirms every shot's
  damage exactly as the shooter's own view predicts it (kills included).
- **Down but not out (M7, D-048, D-049):** at 0 HP you go down instead of dying (not on a headshot, the knife,
  a fall, a second down or a shot more than 20 past 0, and never as Skopós). Down, the view darkens and blurs,
  you lie down (crouched where there's no room), crawl slowly and bleed out of a 20 HP pool in 60 s, or 30 s
  while crawling; the HUD shows the pool. A teammate holds **F** beside you, facing you, for 4 s to pick you
  up with 20 HP (a gauge shows their progress; you stop bleeding meanwhile). Whoever downed you gets the kill
  if you die. **Down me** in the pause menu tries it alone. Online it is all predicted: the browser test
  downs and revives a player with every correction coming from the server and none from a misprediction.
- **The knife (M8, D-050):** **V** (or the Knife button on touch) swings; it lands 0.2 s later and kills anyone
  standing or down within reach in front of you, judged by the server against what you saw (at 100 ms round
  trip a test knifes a sprinting target where the attacker saw it, and misses it with rewinding off). It ends a
  sprint, cancels a reload and holds fire.
- **What you see (M9, D-055, D-059):** a placeholder gun in your hands, built from boxes for each weapon type
  with the sight, barrel, grip and laser you picked; it bobs as you walk, lowers when you sprint, comes up on
  a swap, dips for a reload (the magazine comes out) and kicks when you fire, and the knife swipes across. Down
  the sights you look through the sight: a red dot or a cross on the non-magnifying sights, a scope view on
  2.5× and 3.5×, with the zoom from M5. Muzzle flashes light the room, tracers and bullet marks show where shots
  went (nothing from others with a suppressor), lasers put a red dot on the walls, and you see your own
  shadow. The pause menu sets ADS sensitivity separately for 1×, 2.5× and 3.5× sights (your old single setting
  carries over). The HUD pieces are now separate modules the Range Lab will reuse.
- **The Range Lab (M10, D-052):** Home page → *Range Lab*. A shooting range with 18 targets: a dummy every 5
  to 10 m down a 50 m lane (posts at 13, 18 and 28 m, where falloff starts and ends for many guns), a row
  standing, crouched, prone and leaning, one strafing back and forth, one leaning out from behind a post, one
  through a doorway, a downed teammate on a revive pad, and one behind a soft wall (bullets stop there until
  Phase 4). Dummies come back 3 s after they die; *Reset dummies* (pause menu) brings them all back. A panel on
  the left reads out your last shot: who and where you hit, at what range, the damage the server dealt and what
  the weapon data says for that range and body part (at 40 m a rifle's 28 is the data's 28). Damage numbers
  float over whoever you hit. **F2** shows what the server judged: every pellet as it drew them, the target
  where the server had it (green) and where you saw it (blue). Offline the page runs a room of its own (no
  server; the latency settings still work); `?online` plays it with friends on the server.
- **Shared lab code:** both labs are now one page (`labs/common/lab.ts`) with their own level, go-to spots, help
  and extras. Dead bodies are drawn lying on the floor under them (they were left standing, or in mid-air).
- **Sights you can see through:** aiming down iron sights now looks through a rear notch at the front post (the
  first version's solid rear sight covered the middle of the screen), a red dot through an open frame, and a
  scope through an open tube.
- **A first-shot stall, found and fixed:** the first shot used to compile its effects' shaders mid-frame,
  which froze software-rendered pages for ~300 ms and delayed that shot's input past the 250 ms rewind cap,
  so the browser test's moving-target shot missed. Every effect shader is now drawn once at load, and the
  effects are pooled (they never allocate during a fight).
- **Frame rate (software rendering, so CPU-bound; real GPUs are measured on your PC, PLAN §18):** the Movement
  Lab at 1280×720 draws 13.5 fps against 15.7 before M9 (the gun pass costs about 1 fps, the flash light
  0.5); the two online test pages at 480×270 sharing one CPU draw 13 fps each.
- **Movement fix (D-057):** sprinting diagonally into a wall could, rarely, drop you 0.29 m into the floor in
  one tick. Fixed, with a regression test.
- **Checks for "done when" (M11, D-060):**
  - **A fight in the netsim** (`npm run netsim -- --combat`): two teams of five, 8 m apart at 100 ms round trip,
    spray at each other in bursts, knife up close, revive downed teammates and respawn a second after dying. In
    30 s: 24 downs, 3 revives started, 72 kills (31 with the knife), no desyncs (the two bots who end it
    pressed together get a few sub-millimetre corrections at rest, D-033 addendum), 33–38 kbps down per
    player, server tick 3 ms at p99 (budget 5). It runs in the unit tests for 20 s.
  - **Hit registration** (`--hitreg`, also in the unit tests) now also requires that every head the shooter hits
    on screen is a headshot on the server: 69 of 69, with and without 10 ms of jitter.
  - **A stall while spraying:** a 300 ms network stall while holding Fire costs no misprediction.
  - **Browser test of the Range Lab offline** (`tools/e2e/range-lab.mjs`): its own room with every dummy; a
    headshot kills; torso damage at 10 m and at 40 m (falloff) is exactly the data's 47 and 28; a leg takes
    less; a downed dummy can be finished; a tactical reload gives 31 (30 + 1 in the chamber) and an empty one 30;
    fire modes and weapon swaps work; a headshot while leaning leaves from the leaned eye; a 2.5× sight narrows
    the view to 31.3°.
  - **Browser test of the Range Lab online** (`tools/e2e/online-range.mjs`, two pages at +100 ms): a still
    dummy's head kills; on the strafing dummy, a click claims the frame on screen, the server never rewinds
    further back than that, and the target where the server rewound it is exactly where the shooter's page
    draws that moment (0.00 cm apart); the damage arc points at the attacker (−90° expected, −90° shown); A
    downs B, both kill feeds say so and B sees the down screen; A revives B with 20 HP; no mispredictions.
- **Review (D-061):** three reviewers read all of Phase 3 and found 20 problems; 19 are fixed, each with a
  test where one can be written. The worst two were on the page: changing your loadout with the pause menu
  open froze it, and joining a room while someone was shooting could hang on "Connecting…". In the game: a
  reviver who stalled (or Skopós opening her camera) froze the revive and stopped the downed body bleeding; a
  downed player trickling inputs could slow their bleed-out; a weapon key pressed while down fired after the
  revive. One is left for later (below).
- **Low graphics:** add `lowgfx` to the address (`range_lab.html?lowgfx`, or `?online&lowgfx`) to turn off
  shadows and anti-aliasing on a slow device; it doubles the frame rate of the software-rendered test pages.
- **Two page bugs the new browser test found:** a page that took seconds to start (the second page joining a
  busy room) got a first frame stamped from before its start, which stopped its clock for as long as the
  start-up took (no input reached the server, then its own 5 s silence check disconnected it). Time no longer
  runs backwards, and the silence check doesn't count time the page itself was too busy to read messages.
- 286 unit tests (33 of them for the page: settings, controls, HUD maths, guns and effects, the offline room).

### How to test (needs Node 22.12+)
```
npm install
npm run build
npm start
```
1. **Offline:** open http://localhost:8080 → **Range Lab**. Shoot the dummies down the lane and check the
   panel on the left (the damage dealt against what the data says at that range). **F2** shows where the
   server had the target (green) against where you saw it (blue). `Esc` → *Loadout* swaps guns and
   attachments; the *Downed teammate* on the revive pad takes a hold of **F**; **V** is the knife.
2. **Online at 100 ms:** **Range Lab online** (or **Movement Lab online**) → *Create a room*; `Esc` → *Copy
   invite link* and open it in a second window (or on a second PC, as in Phase 2). In both pause menus set
   **Simulated extra latency → +100 ms round trip**. Shoot the strafing dummy and each other, down and revive
   each other, try the knife. On a slow device (a tablet), add `&lowgfx` to the address.
3. **Over the internet:** your Railway link redeploys from `main` once this phase is merged. While the server
   is in Singapore, a US round trip (230–250 ms) plus the drawing delay is past the 250 ms rewind cap, so
   moving targets will be hard to hit; switch the region to US West or US East first (Settings → Deploy →
   Regions, keep 1 instance).

The automated checks: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (all four browser
tests), and `npm run netsim -- --hitreg` / `-- --combat` / `-- --spread`.

Things to judge, at +100 ms:
- Headshots on the strafing dummy and on another player: do they land where your screen says they should?
- Does the F2 overlay's green box sit where you saw the target (blue) when you clicked?
- Recoil, aiming down sights (the sight pictures and zoom) and the HUD: do they feel like Siege?
- Going down, crawling, bleeding out and reviving; the knife.

### Known issues
- **Every wall stops bullets** in Phase 3, soft walls included (the *Behind the wall* dummy can't be shot yet):
  wallbangs come with destruction in Phase 4 (D-046).
- All numbers beyond the official ones are placeholders, each listed in research/OPEN_QUESTIONS.md (Phase 3
  placeholders, 34 questions); the guns and bodies are placeholder boxes and capsules.
- The rewind cap is 250 ms (D-045, your call): beyond about 150 ms of ping, or below about 30 fps (when other
  players are drawn up to 150 ms in the past, D-032), some shots at moving targets are judged against a later
  moment than the one you saw.
- A body standing still pressed against others can get a correction now and then (sub-millimetre, faded out;
  D-033 addendum).
- A reviver who lets go and holds **F** again within about a round trip gets one small correction (D-061).
- The dummies don't shoot back; the Ballistic Shield and GONNE-6 can't be picked until Phase 8 (D-054), nor
  Skopós's idle-shell barrier (D-058).
- Frame rate is measured with software rendering only (5–15 fps for two test pages sharing a CPU); real GPUs are
  measured on your PC (PLAN §18).

### Next: Phase 4 — Destruction v1
Soft walls, floors, barricades, reinforcement, hatches, bullet penetration, networked destruction with late
join, and a destruction_lab page. **Done when:** wallbangs, punch holes and reinforcing are all synced across
clients.

---

## Phase 2 — Netcode core · ✅ merged and live on Railway (2026-10-01); waiting for your two-PC test

**Done when (PLAN §17):** two PCs play smoothly at 100 ms simulated latency. Before sign-off PLAN §3 also
asks for a real Railway deploy (latency from your location, WebSocket stability).

### What's done
- **Game server** (`game/server`): match rooms over a WebSocket at `/ws`, on the same port as the page.
  - Create a room, or join one with its 5-character code (no look-alike characters).
  - Limits: 10 players a room, rate limits per connection and per address (against one script taking every
    room or guessing codes), and bad messages disconnect.
  - When Railway restarts the server, players are told it's restarting.
  - `/stats` shows rooms, players and tick time. Decisions D-034 and D-036.
- **Server authority with client prediction** (D-029, D-030):
  - The server runs the same shared simulation at 64 Hz.
  - Your page predicts your own movement, so it responds instantly, and only gets corrected when the server
    disagrees.
  - Other players are drawn smoothly between server snapshots, a little in the past (D-032).
  - Your clock adjusts itself so your inputs reach the server just in time.
  - If your inputs are late, the server holds your body still (up to 250 ms) instead of guessing.
- **Lag compensation framework** (D-031): a shot rides on your input, and the server rewinds everyone else to
  what you were seeing when you fired, up to 200 ms. Phase 2 has a test shot (left click); weapons use it from
  Phase 3.
- **Players block each other** (D-033). Small corrections when you bump into someone fade out over 0.1 s.
- **Online Movement Lab** (D-035):
  - Home page → *Movement Lab online*: create a room; the address bar is the invite link.
  - Other players are orange with name tags.
  - Pause menu: simulated extra latency, invite link, leave.
  - Net stats line under the fps: ping, interpolation delay, corrections, kbps.
- **netsim harness** (`npm run netsim`, PLAN §19): 10 headless clients over a simulated network (100 ms round
  trip, jitter, TCP stalls, clock drift). Results for 30 s:
  - Desyncs: none. Dropped inputs: none.
  - Bandwidth per player: about 14–17 kbps down and 13 kbps up.
  - Server tick: 0.7 ms on average, 2.3 ms at p99. The budget is 5 ms.
  - Corrections: about one per player in 30 s when spread out (the spawn), and about 1.5 per second when
    constantly bumping into each other.
- **Tests:**
  - 127 unit tests, including the protocol, snapshots, lag compensation, player collision, the lobby and its
    limits, room behaviour (respawn, operator picks, stalls, shots, resyncs), and the netsim as a regression test.
  - Two headless-browser tests. The new one runs two browsers at +100 ms: they join by code, see each other
    move, one hits the other mid-stride with a test shot, one respawns, then one leaves and the server restarts.
- **Review:** one reviewer read all the Phase 2 changes and found 12 problems, including one that let anyone
  crash the server and one that froze the online lab on respawn. All 12 were fixed. A second round (verifiers on
  each fix, fresh reviewers on the fix commits, a skeptic on every new claim) found 13 more gaps, all fixed. The
  biggest was a physics-library quirk that briefly hid the floor after a player left or respawned (D-037). Each
  fix has a test that fails without it where one could be written.

### How to test (needs Node 22.12+)
```
npm install
npm run build
npm start
```
1. **One PC, two windows:** open http://localhost:8080 → **Movement Lab online** → *Create a room*. Press
   `Esc` → *Copy invite link* and open it in a second browser window (or a private window, to use another
   name). In both pause menus set **Simulated extra latency → +100 ms round trip**.
2. **Two PCs on the same network:** on the second PC open `http://<first PC's IP>:8080` and join with the
   code. Windows asks whether Node may use the network the first time; allow private networks. (`ipconfig`
   shows the IP, usually 192.168.x.x.)
3. **Over the internet:** open your Railway link (the `@redmond/server` service's domain) on both PCs, or
   send it to a friend. Railway redeploys automatically whenever `main` changes.

Things to judge, at +100 ms:
- Does your own movement feel as responsive as offline?
- Does the other player move smoothly (no stutter or teleporting)?
- Bump into each other: is it acceptable?
- Left-click at the other player while they strafe. The red line is your shot. The green outline is where the
  server judged them to be. Does that match where you saw them?

### Known issues
- Below ~30 fps, other players are drawn up to 150 ms in the past instead of ~65 ms (D-032).
- Bumping into another player causes small corrections (smoothed). Standing on someone's head slides you off;
  whether Siege lets you stand there is an open question (research/OPEN_QUESTIONS.md, Phase 2 placeholders).
- Rarely, a 0.1 mm disagreement at wall corners causes a correction (absorbed, invisible).
- **Deployed** on Railway as one service (settings in `.railway/railway.ts`, D-036). Two test clients on the live
  server: join by code, no corrections while walking, no resyncs, server tick 0.5 ms. The server currently runs
  in **Singapore**: about 230–250 ms round trip from a US test machine. For US players, switch the region to US
  West or US East (Settings → Deploy → Regions, keep 1 instance).

### Next: Phase 3 — Gunplay
The weapon data system, recoil, ADS, attachments, hit registration on the rewind framework (with lean and stance
hitboxes), DBNO and revive, plus melee (deferred from Phase 1, D-024). **Done when:** headshots and hit
registration feel right at 100 ms.

---

## Phase 1 — Skeleton + movement · ✅ complete (Ulo tested it on 2026-09-30: "all looking good")

**Done when (PLAN §17):** it feels like Siege movement to you, offline.

### What's done
- **npm workspace** (PLAN §4): `game/shared` (simulation used by both browser and server), `game/client` (Vite +
  Three.js), `game/server` (serves the built client; Railway-ready).
- **Data-driven movement** in `data/movement.json`: per-rating walk and sprint speeds, crouch, prone, ADS and
  slow-walk speeds, stance heights and transition times, lean, vault, ladder, fall damage. Health comes from
  `data/operators/*.json` (all 12 operators). Placeholders are listed in `_unverified`.
- **Movement:**
  - Stances: stand, crouch and prone with timed transitions; you can't stand or crouch without headroom.
  - Prone: turn speed and aim arc are limited, and you can't go prone or turn where your body wouldn't fit.
    The lying body follows the ground (ramps and stairs in any direction) and stops at walls, so the camera
    and hitboxes never end up inside them.
  - Lean: toggle or hold, in any stance, with camera roll; your head stops at walls.
  - Sprint: forward only, not while aiming, cancels lean, and stands you up.
  - Vaulting/mantling: over, onto, and through open windows; tagged objects only. Works standing still — a
    "Space to mantle" prompt shows whenever you face something you can mantle (your feedback).
  - Ladders: climb, slide down (hold or toggle crouch), dismount at the top, let go. Grab them standing.
  - Stairs and ramps: speed holds on slopes, and 55° is too steep.
  - Fall damage.
- **Player/pawn separation:** Skopós owns two shells. `Z` opens the other shell's camera; `F` there transfers
  (1.3 s + 1.3 s, then 0.5 s cooldown), per your feedback. The idle shell stays crouched.
- **Hitboxes** follow stance and lean (F3 shows them). They're ready for lag compensation in Phase 2/3.
- **Movement Lab** page:
  - Views: first person and third person (F4).
  - Settings: sensitivity, ADS sensitivity, vertical FOV with its horizontal equivalent, raw input, invert Y,
    and separate toggle/hold modes for crouch, prone, lean and ADS.
  - Tools: operator picker, "Go to" menu, HUD, help (F1).
  - Touch controls for tablets.
- **Tests:**
  - 71 unit tests, including a determinism test: two independent simulations fed the same inputs end identical.
  - A headless-browser test that plays through every mechanic.
  - CI on every PR.

### How to test (on your PC, needs Node 22.12+)
```
npm install
npm run build
npm start
```
Then open http://localhost:8080 → **Movement Lab**. Click to lock the mouse; `Esc` pauses (settings, operator,
"Go to" menu). `F1` lists the keys and what to try. Things to judge:
1. Walk and sprint speeds for a 1-, 2- and 3-speed operator (Fuze, Sledge, Brava). Do they *feel* like Siege?
2. Crouch and prone transition times; the lean amount and speed.
3. Vault heights and timing (vault course, window); ladder speed; the 3 m and 6.5 m drops.
4. Anything that feels floaty, sticky, or wrong — tell me and I'll tune `data/movement.json`.

For development there's also `npm run dev` (hot reload at http://localhost:5173/labs/movement_lab.html).

### Known issues
- The numbers are placeholders from research until you measure them (research/OPEN_QUESTIONS.md, core mechanics).
- Simplifications and deferrals are listed in DECISIONS D-023 and D-024 (e.g. rappel moves to Phase 5, melee to
  Phase 3). Prone, you can't crawl off a drop taller than a step or climb a curb head-first yet (D-023a).
- Nothing is on Railway yet, so it can't be opened from an iPad until Phase 2 deploys it.

### Next: Phase 2 — Netcode core
WebSocket match rooms on the Node server, room codes, client prediction + server reconciliation (the shared
simulation is already deterministic), interpolation of other players, the lag-compensation framework, a headless
multi-client test harness, and the first Railway deploy.

---

## Phase 0 — Research · ✅ complete, ⏳ waiting for your SUMMARY skim (2026-09-29)

**Done when (PLAN §17):** `research/` complete, SUMMARY.md, OPEN_QUESTIONS.md, screenshot checklist
sent → you skim it and answer the open questions you can.

### What's done
- **All research files from PLAN §2.1/§2.2**, verified against **Y11S3 incl. Y11S3.1**:
  - `research/core_mechanics.md`, `destruction.md`, `round_flow.md`, `intel.md`, `gadgets.md`
  - `research/operators/*.md` — all 12 (Lesion confirmed as "Legion")
  - `research/weapons.csv` (40 rows) + `weapons_notes.md`
  - `research/interactions.csv` (343 rows) + `interactions_notes.md`
  - `research/oregon/`: `version.md`, `layout_notes.md`, `surfaces.md`, `map_features.md`,
    `common_setups.md`, `SCREENSHOT_CHECKLIST.md`, `refs/SOURCES.md`
  - `research/SUMMARY.md` (one-page digest) and `research/OPEN_QUESTIONS.md` (259 questions; top 3 answered)
- **Stack switched to the browser** (your call): TypeScript + Three.js + Rapier + a Node WebSocket server on
  Railway. PLAN.md §3/§4/§5/§18 rewritten. The desktop Godot spike was retired.
- **§3 tech spike for the web stack: passed** (`tools/spike/web_stack/`, DECISIONS D-020). Browser prediction
  matches the server bit-for-bit, and the server tick is 0.54 ms p99 with 10 players (budget 5 ms).
- **Your decisions applied:** browser + Railway (D-019), Lesion (D-011), reinforcements `max(6, …)` (D-015),
  Pick & Ban in Unranked (D-014), Quick Match format, no 3v3 (D-017).

### How to test / review
1. **Run the spike** (2 minutes, needs Node 22+):
   ```
   cd tools/spike/web_stack
   npm install
   npm run build
   npm start
   ```
   Open http://localhost:8080 in Chrome/Edge (WASD + drag mouse). Open a second tab to see a second player.
   The HUD's "max prediction error" should stay at 0.
2. Skim **`research/SUMMARY.md`** (one page).
3. When you have time: the rest of `research/OPEN_QUESTIONS.md` (reply in chat, or write `> Ulo: …`
   under a question) and the **30-minute minimum screenshot set** in `research/oregon/SCREENSHOT_CHECKLIST.md`.
   The repo is **public**; consider making it private before adding screenshots.

### Known issues
- **Weakest data:** movement speeds, stance heights, hole sizes, drone and camera numbers, and camera facings.
  Ubisoft doesn't publish these, so they're `UNVERIFIED` placeholders until you measure them in-game.
- `oregon/common_setups.md` (what the bots will use) is mostly inferred (tagged `DER`).
- Nothing is deployed to Railway yet. That's Phase 2, and I'll confirm with you before creating anything in
  your Railway account.
- Several agents' web requests briefly carried your GitHub handle (and once your email) in a User-Agent header.
  This was caught and forbidden; nothing personal is in the repo.

### Next: Phase 1 — Skeleton + movement
TypeScript workspace (`game/shared`, `game/server`, `game/client`), data loaders for `data/*.json`,
player/pawn separation (Skopós-ready), stand/crouch/prone, lean (toggle/hold), sprint, vault, ladders,
and a `movement_lab` test page. **Done when:** it feels like Siege movement to you, offline in the browser.
