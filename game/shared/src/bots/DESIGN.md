# Phase 9 design: Bot Training

Status: adopted 2026-11-07. Scope: PLAN.md §15 and §17 Phase 9, "Navmesh + destruction rebake, perception, team
planner, bot_strats.json for all 4 Oregon sites, all 12 operators playable by bots, difficulty levels, drills,
training feedback"; done when "Ulo can play a full solo match vs 5 Normal bots on attack and defense, and it feels
like Siege". Audio is Phase 11: bots hear placeholder events until then (§4).

Read with: PLAN.md §15, §18 (server tick ≤ 5 ms at 10 players including 9 bots), §19 (bot soak tests);
research/oregon/common_setups.md (every site's plan, §0.1 roster roles, §5 heuristics); match/DESIGN.md (formats,
phases, the director), intel/DESIGN.md (drones, cameras, pings, the comm wheel), gadgets/DESIGN.md (keys and gadgets);
DECISIONS D-122 (bot backfill waits for bots) and the Phase 9 entries (D-158 on).

Rules this design keeps: **bots play by the rules** — they send the same inputs a player's client sends, through the
same room code, and know only what their team could know (§4); never invent Siege facts (our numbers for bots are
ours, and the plan data marks what research tagged DER); the game stays playable after every milestone.

## 1. What a bot is

A bot is a **room member without a connection**. `Room.addBot(team, difficulty)` makes a member whose client sends
nothing and drops everything; it gets a body like anyone (the match spawns it), and a **brain** (`bots/bot.ts`).

- **Inputs.** Every tick, before the room takes its members' inputs, each bot's brain makes one `InputCmd` (yaw,
  pitch, forward, strafe, stance, lean, buttons) and queues it as a client's input would arrive: the next seq, the
  current epoch, the current tick as the newest snapshot it has, nothing drawn behind it. The room then applies it
  exactly as a player's: movement, gunplay, gadgets, deploys, the match's rules. A bot sees the present, so its shots
  are judged without rewind (no lag either way).
- **No prediction.** The server's state is the bot's state: the room never checks a bot's prediction or sends it a
  correction, and encodes no snapshots for it (§12: tick budget).
- **What it's told.** The events the room would send its client (hit confirmations, damage taken and from where,
  pings, spotted marks, callouts, blasts, alarms, stuns, the kill feed) are handed to its brain instead of encoded:
  the same information a player gets on screen.
- **In a match** it is a match player flagged `bot` with a difficulty: always ready, never the host, never counted
  as having left. It makes the choices a player makes through the director's own calls (ban vote, operator and
  loadout, site vote, spawn, the defuser), when a player would (§6).
- **Randomness** comes from the room's secret seed and the bot's id, so a test with the same seed plays the same.
- Names: `BOT` and a callsign from a list (data/bots/names.json).

## 2. Bot Training, backfill, offline

- **`data/modes/bot_training.json`**: a format whose `bots` block fills every empty slot of both teams when the host
  starts, up to the team sizes set (§15.1 setup options): **your side** (attack, defense, or alternate: `attack` and
  `defense` never swap sides, `alternate` swaps every round), **team sizes** 1–5 each, uneven allowed, **difficulty
  per team**, **site** (random or a fixed one: the bots' site vote follows it), **round count**, and **bot operator
  picks** (random, a fixed list, or "counter my pick": §7.4). Bans are off.
- **Lobby**: the host sees the bots in the team columns ("BOT Callsign · Normal"), can add or remove one per team
  and set each team's difficulty; Start fills the rest. A human joining takes a bot's slot (the bot leaves).
- **Backfill** (D-122) in the other formats but Ranked: a host toggle, "Fill empty slots with bots". At the start
  and at each round's planning, empty slots up to the format's team sizes get bots; a player who left mid-match keeps
  their slot (D-123) and a bot plays it until they come back.
- **Offline**: the page's offline room (a Web Worker, D-052) learns `CreateMatch`, so a whole Bot Training match runs
  in the browser with no server; online, the same room runs on the server with friends on either side.

## 3. Navigation (`bots/nav/`)

**A layered nav grid**, not a polygon navmesh (D-158): read from the physics world the simulation moves bodies in,
like the map generator's walk graph (tools/mapgen/walkgraph.ts, its head start), so it can't disagree with movement.

- **Cells** 0.25 m square over the level's bounds. Each collider bodies collide with (walls, slabs, stair ramps,
  rails, panels' movement boxes, props, gadget colliders) is rasterised into each column it covers as a solid span.
- **Nodes**: a span's walkable top with a crouching body's height above it and nothing within the body's radius (and
  the controller's skin) in that height above a step: measured exactly to each upright box's footprint (a 1.05 m door
  leaves a 0.41 m band of centres, more than a cell), conservatively for tilted boxes. Each node notes whether a
  standing body fits (else bots crouch through it).
- **Edges**: a node joins its 8 neighbours' nodes within a step (0.35 m), diagonals only where both sides join (no
  corner cutting). Computed when asked, from the heights, so rebuilding a chunk never leaves stale edges in another.
- **Links**, each with the input that takes it: **vault** (over a sill, a rail, a hole's lip; onto a ledge) found by
  running the movement code's own vault planner from candidate nodes facing vaultable boxes; **ladder** (up and down);
  **drop** (off a ledge, through a hatch or floor hole: one way, ≤ 3.4 m, the fall's damage in its cost); **rappel**
  (M5: up an outside wall to a roof or a window, through the rappel zones). Openings that something blocks get
  **virtual links** with the work they take: a barricade (melee it), a soft wall (punch, shoot or breach a hole), a
  reinforced wall or hatch (a hard breach): only plans that allow it use them (§6).
- **Search**: the grid is cut into **chunks** of 16 × 16 columns (4 m); each chunk's nodes split into **regions**
  (connected within the chunk). A* runs over regions (a few thousand), then over nodes inside the regions on that
  route (and their neighbours), then the path is pulled straight where a straight walk stays on nodes. Searches are
  budgeted per tick (a bot waits a tick or two for a long one).
- **Following** (`bots/nav/follow.ts`): yaw and forward/strafe toward the next point (the body can look one way and
  walk another), crouch on crouch-only nodes, each link's input at its start (face the sill and Vault; Interact at a
  ladder; walk off a drop), arrival radii, and stuck recovery (no progress for 1.5 s: step back, try a vault, search
  again).
- **Rebake**: a panel whose movement boxes change (a hole, a breach, a broken barricade, a reinforcement) or a gadget
  collider placed or gone marks the chunks under it; the room rebuilds them (spans, nodes, links, regions) within a
  per-tick budget. The server runs it in its tick; offline, the room already lives off the page's thread.
- Drones use the same grid with their own rules (no vaults or ladders; drone holes as extra links).

## 4. Perception (`bots/perceive.ts`)

What a bot knows of the other side comes from these, and nothing else (a test checks a bot never reacts to an enemy
it has no channel to):

- **Sight**, 16 times a second, staggered: an enemy body, drone or shell within the view cone (difficulty `fovDeg`)
  and range, its hitbox points (head, chest, pelvis, as posed: leans and stances count) tested with rays through the
  level, panels as they are (holes see through, soft wall cells don't), props, gadgets that block sight and smoke.
  Each visible point adds exposure; **detection** builds over time, faster for more exposure, nearer, centred,
  moving, and by difficulty (reaction time); once detected the bot knows where it is while it stays visible.
- **Hearing** (placeholders until Phase 11, D-158): gunshots (the shot events everyone gets; suppressed shorter),
  blasts, breaches and other destruction (panel ops), and footsteps worked out from enemies' speed (sprinting carries
  ~20 m, walking ~10 m, crouch-walking ~4 m, slow walk 0; another storey halves it). A sound gives a position with an
  error that shrinks with distance; difficulty `soundUse` scales how much bots trust it.
- **Team intel**: the team's pings and spotted marks (the events its client would get), Pulse's heartbeats, what a
  teammate on a camera or a drone sees (bots on cams and drones perceive through them as through their eyes), damage
  taken with its direction, and what teammates saw, shared on the team's board after a short delay (voice comms;
  difficulty `coordination` scales the delay and how much is shared).
- **Memory**: per enemy, the last known position, when, how (seen, heard, told) and how sure; it ages, and a bot
  reaching a remembered position and finding nothing clears it.

## 5. Decisions: utility AI (`bots/brain.ts`)

**Utility AI**, not behaviour trees (D-158): a bot's choices weigh many things at once (a visible enemy, the plan's
task, its health, the clock, a teammate down, a sound), and scoring them keeps the switching smooth and tunable per
difficulty in data, where a tree needs an interrupt for every case.

- **Two layers.** The **team planner** (§6) gives each bot a **task** (reinforce these walls, hold this angle, roam
  here, drone there, breach this wall, plant at this spot). The **bot** scores its behaviours 16 times a second and
  runs the best, keeping the current one unless another beats it by a margin.
- **Behaviours**: *task* (do the plan's job), *fight* (an enemy seen or very recently seen), *hunt* (go where an enemy
  was heard or pinged), *cover* (reload or heal out of sight; back off when outgunned), *revive* (a downed teammate,
  when it's safe), *finish* (a downed enemy), *objective* (plant, disable, pick up the defuser, hold the plant),
  *evade* (a grenade, fire, a claymore seen), *trade* (push where a teammate just died), *obey* (a human's order, §8).
- **Motor** (every tick): the aim controller (§7), the path follower, stance, lean and buttons with human timings
  (holds for deploys, presses for single shots).

## 6. Team planner and `data/maps/oregon/bot_strats.json`

One **commander** per side, server-side, with the same knowledge rules (its team's).

- **Planning**: defenders' bots vote for the site the format or the human chose (Bot Training's fixed site, else the
  plan's preference); attackers' bots choose a spawn per the site's plan (once they know the site; else spread);
  operators by the roster roles (common_setups §0.1, §7.4); the defuser to an attacker bot whose role isn't a breach.
- **Prep (defense)**: the site's **reinforcement list** spent top-down (the pool shared, D-015), **rotation and murder
  holes** made from their side, **barricades** on the plan's doors, each operator's **gadget spots**, then each bot to
  its role: **anchors** to hold spots in the site's rooms, **roamers** to their areas. Hold spots are found per room at
  prep start: nodes with cover whose sight lines reach the room's entries (doors, breachable walls, hatches) at a good
  distance, so they need no hand placing and follow the walls as they are.
- **Prep (attack)**: each bot drives a drone toward the site along the nav grid (drone rules), pings what it sees.
- **Action (attack)**: routes from the spawn per the plan, **hard breaches** (the plan's wall for Thermite, Hard
  Breach Charges for Striker or Fuze; anti-gadget first: Brava hacks and Impact EMPs on jammers), **soft breaches**
  (Sledge, breach charges, shotguns), vertical play (floors and hatches from above), clearing rooms with support
  covering, the **plant** (the carrier with cover, at the plan's spots or any valid one), post-plant holds.
- **Action (defense)**: anchors hold, roamers delay and fall back, rotations through the plan's holes when the attack
  commits, retake and disable after a plant.
- **Re-planning** on events: a breach done or failed, teammates dead, the site found, the plant, the clock.
- **The data**: per site, the research's YAML (common_setups §1–§4) turned into the level's ids (panels such as
  `SW-B-01`, hatches `H1`–`H6`, rooms, spawn groups) with the research's evidence tags kept; a test checks every id
  names something in level.json.

## 7. Combat (`bots/aim.ts`, `bots/fight.ts`)

- **Aim**: the bot picks a point (chest or head, `headshotBias` by distance), waits its **reaction time** after
  detection (longer in the periphery), then turns toward it no faster than `turnRateDeg` with an **aim error** drawn
  when it acquires the target that settles over `settleMs`, **tracks** a moving target with a lag, and **pulls down**
  `recoilControl` of its weapon's recoil.
- **Firing**: full auto close, bursts mid-range, taps far; aims down sights past a few metres; doesn't fire at what
  it can't hit (a friendly in the way, nothing in sight).
- **Peeking** by `peekStyle`: a wide swing (Recruit, Normal), or jiggles and lean peeks from cover (Hard, Elite);
  crouching and strafing in fights (Hard, Elite).
- **Wallbangs**: an enemy heard or pinged behind a soft wall, recently, gets sprayed through it (`soundUse`).
- **Reload** out of sight when low; **trade** a teammate's killer; **revive** downed teammates when no enemy is seen;
  **finish** downed enemies.

### 7.4 Operators (§15.3: every operator, their real loadouts)
| Operator | What the bot does |
|---|---|
| Sledge | Opens unreinforced hatches and floors from above and soft walls on the route; hammer for barricades |
| Thermite | Exothermic Charge on the plan's reinforced wall (or hatch) once no jammer is on it; detonates from cover |
| Striker | Hard Breach Charge + Impact EMP by default (common_setups §0.1); EMPs jammers by the breach |
| Fuze | Cluster Charges through walls and hatches into anchor rooms before the push; backup Hard Breach Charge |
| Brava | Kludge drone onto jammers by the hard breach, then cameras |
| Dokkaebi | Jegeo Payload on a detected anchor before the push; hacks cameras through phones |
| Mute | Signal Disruptors by the reinforced walls and hatches (after reinforcing), one on a drone path |
| Mira | Black Mirrors on the plan's walls, from the site side; anchors watching through them |
| Skopós | One shell in each site room; swaps to the one nearer the attack |
| Sentry | Barbed Wire + Deployable Shield by default, on the plan's spots |
| Pulse | Roams above or below the site, scans through the floor and pings what it finds |
| Lesion | Gu mines on stair bottoms, hatch drops and doors (the plan's spots) |
| Generic | Frags and stuns into rooms before entry, smokes for the plant, claymores on flanks; defenders' wire, shields, Nitro Cells (thrown at heard attackers), alarms, Bulletproof Cameras, Observation Blockers per the plan |

"Counter my pick" (Bot Training): the bots' side picks the roster's answer to the human's operator (Mute against
Thermite, Brava against Mute, …: a table in data/bots/picks.json, ours).

As built (M7, D-164): one motor, bots/use.ts, uses any gadget by the keys (place, throw or lob on a ballistic arc,
swing, hold, detonate from cover); the planners hand out the plan's device spots (defense, prep) and breaches (attack,
before the way in), and the brain adds reactions (Doing.Gadget): Nitro Cells, Lesion's mines in action, Pulse's
scans, Dokkaebi's payload, pre-entry frags, plant smokes, claymores, Skopós's swaps. Simplified: Skopós moves her idle
shell once in prep and swaps by need; Brava's Kludge hacks what it sees on its way to the breach, then she's back.

## 8. Orders from human teammates

The comm wheel gets bot orders (data/intel.json `callouts`): **Go here** and **Hold here** (your last ping's spot),
**Breach this** (the wall or hatch at your last ping), **Follow me**, **Regroup**. The nearest free bot teammate (or
all, for Regroup) does it until it's done, it fights, or a new order comes; the others carry on with the plan. Bots
also act on the existing callouts where they mean something ("Rotate", "Push", "Defuser", "Help").

## 9. Difficulty (`data/bots/difficulty.json`)

`recruit`, `normal`, `hard`, `elite`, each: `reactionMs`, `fovDeg`, `aimErrorDeg`, `settleMs`, `trackLag`,
`turnRateDeg`, `recoilControl`, `headshotBias`, `peekStyle`, `strafe`, `utilityUse`, `soundUse`, `coordination`,
`wallbang`, `prefire` (pre-aiming common angles). All ours, tuned by playing; no level sees through walls.

## 10. Drills (§15.1)

Each drill is a Bot Training preset (data/modes/drill_*.json, a `drill` block the director reads to set up rounds):

| Drill | Setup | Score |
|---|---|---|
| 1v1 aim duel | you and one bot spawn in a room facing a doorway, quick rounds, first to 5 | rounds won, time to kill |
| Retake | the defuser planted on a site; you (attack) hold it vs 1–3 defender bots retaking it, or (option) you defend and retake vs 1–3 attackers | rounds won, time |
| Site hold | you defend a site alone vs 5 attacker bots; prep included | rounds won, kills |
| Clear a floor | defender bots spread over one storey (no objective); you clear it | time, deaths |
| Drone and call | attacking, prep only with your drones; ping every defender you find | defenders found, time |
| Custom scenario | site, bot counts, start (prep, action, planted), bots' positions random or the plan's | rounds won |

The wording "solo retake vs 1–3 defenders after plant" names defenders as the opponents, so you attack (holding the
plant); the drill offers the other side too (D-158).

As built (M8, D-166): the `drill` block is in the format's match rules (start: prep, action or planted; objective;
prepOnly; the duel's doors; the clear's storey); the director places bodies from the nav grid (net/drills.ts) and the
bots placed by a drill hold there. Scores per drill come with M9's feedback.

## 11. Training feedback (§15.5)

- **Round report**, sent to each human at the round's end (a new message): where they died and who saw them first
  (the bots' perception logs who detected them first, when and from where), damage dealt and taken (by whom, how
  much), time to plant or disable, the utility they used, and the killer's view of the last seconds.
- **Killcam**: the client keeps the last 8 s of snapshots and replays them from the killer's eye (no new data on
  the wire); full replays are §16's.
- **Stats** per drill and per operator in the browser (localStorage, like the local rating): rounds, wins, kills,
  deaths, damage, times; a Training page shows them over time.

As built (M9, D-167): net/report.ts (the room's RoundReporter, the RoundReport message); the client's
labs/training.ts (the report panel, the stats) and the killcam in labs/common/lab.ts (6 s of snapshots kept); the
stats are on the Play page.

## 12. Performance and tests

- **Budget** (§18): the server tick ≤ 5 ms with 10 players of whom 9 bots. Bots think 16 times a second, staggered;
  sight rays only for enemies in the cone and range; path searches and rebakes budgeted per tick; no snapshots
  encoded for bots. A bench reports per-tick cost with 9 bots in a full round.
- **Tests**: bots join and leave (lobby, backfill, a human taking a slot); the nav reaches every room from every
  spawn, and a bot walks across storeys by stairs, the ladder, a window vault and a hatch drop; a new hole opens a new
  route (rebake); perception never reacts without a channel (an enemy behind a wall unseen and unheard is ignored;
  sprinting near is heard; leaning out is seen); duels by difficulty (Elite beats Recruit most of the time);
  defenders reinforce the plan's walls in prep; attackers breach and plant; every operator's ability is used by a bot;
  each drill sets up and scores; the round report's numbers.
- **Soak** (§19): headless 5v5 bot-vs-bot matches on every site, with netsim clients watching: no desyncs, no bot
  stuck more than 10 s, no crash. Short in CI, long by hand (`npm run soak`).
- **Browser**: a solo Bot Training match offline vs 5 bots, attack and defense rounds.

**As built (M10, D-168).**
- **Bench** (`npm run bench:bots`, tools/bench/bots.ts): a Bot Training room, one silent person and nine bots, two
  rounds; every room step timed by phase, with the bots' brains, the grid's rebuilds and the planners timed apart.
- **Where the time went, and what keeps it down**: a rebuilt chunk keeps the routes that don't cross it (each chunk
  notes the grid version it was rebuilt at; a route holds while none of its regions' chunks, nor its links' ends,
  were rebuilt since it was found); at most three new route searches a tick across the room (a bot asking past that
  waits a tick); vault probes cached per node and yaw until a change comes within 2.5 m of them; a room's hold
  spots scored once per level and room (the sight lines are hundreds of rays a room), warmed in the lobby when the
  room first makes its grid; a chunk's region pairs added to the search graph once; a defender's own-gadget jobs
  worked out for one bot a tick.
- **Soak** (tools/soak/soak.ts): a watching ClientSession joins as a player would; panel and gadget hashes are
  checked on every op it gets (a mismatch is a desync); a bot is stuck when its legs, driven this tick, have been
  walking (or failing) toward a goal more than 2 m off for 10 s without getting a metre on, on a task, an
  investigation or a revive. `npm run soak` plays every site (`--site`, `--rounds`, `--dump` for what's round a
  stuck bot); the unit run plays one round each on the Laundry and the Dorms.
- **Getting unstuck** (bots/nav/follow.ts), from what the soak found: stuck is the body not getting half a metre
  across the floor (whatever the waypoints); after 1.2 s it taps vault, after 2.4 s it searches again and wriggles
  (crouched, stepping either side of the way), after 4.8 s or five failed links it gives up. A drop it can't take
  (still on the lip after 1.5 s; crouched from 0.75 s, for a staircase over the lip), a vault that doesn't go in 4 s,
  a barricade not got through 4 s after it's down (10 s in all) come out of the grid for the round. A barricade's
  walk-through link is only made where a crouched body fits through standing on its sill (a window level with the
  floor isn't a doorway). A new goal while a link is under way waits for the link (a sound heard again would
  otherwise restart a barricade's knifing every few ticks). While the red walls are up a defender's routes stay in
  the building (the grid notes which nodes are inside the building zones; the region search leaves out regions with
  none inside, the node search nodes outside): without it, prep's shortcuts went out a window and over a roof, and
  the vault out never started. A hold spot it can't reach is held from where it is;
  a prep drone's body stays put. Stand spots are at the floor's height where there is one (not up on a table).

## 13. Milestones

| M | What | Playable after it |
|---|---|---|
| M1 | Bots in rooms: `addBot`, connectionless members (inputs queued each tick, no prediction, events to the brain), match players flagged bot (ready, picks, votes, spawns), Bot Training format and lobby controls, backfill, the offline room's matches; protocol bump | a Bot Training match offline with bots that stand their ground; rounds end on time |
| M2 | Navigation: the grid, links (vault, ladder, drop), region search, the path follower, rebake on destruction and gadgets; a nav overlay in the Oregon page | bots walk anywhere on Oregon, and through new holes |
| M3 | Perception and combat: sight, hearing placeholders, team intel, memory; aim model, firing, peeks, reload, trade, revive, finish; difficulty.json | bots fight; the 1v1 aim duel |
| M4 | Defense: prep (reinforce, holes, barricades, generic gadgets), hold spots, anchors and roamers, rotations, cameras, retake and disable | defending bots that set up and hold |
| M5 | Attack: drones in prep, spawns, routes, clearing, soft and hard breaches, vertical, rappel, the plant and post-plant | full bot-vs-bot rounds |
| M6 | Team planner and bot_strats.json for all four sites; orders from human teammates on the comm wheel | each site plays its plan |
| M7 | All twelve operators' abilities, Fuze's shield, the generic throwables | every operator |
| M8 | Bot Training setup (your side, sizes, difficulty, site, rounds, picks), the drills | every drill |
| M9 | Training feedback: round report, killcam, stats per drill and operator | feedback after each round |
| M10 | Gates: soak, tick budget, browser test, review, docs, report | a solo match vs 5 Normal bots on attack and defense |
