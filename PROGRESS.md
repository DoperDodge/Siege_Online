# PROGRESS.md

Status per phase (PLAN.md §17). Newest phase on top. Each phase lists what's done, how to test it,
known issues, and what's next.

---

## Phase 3 — Gunplay · 🚧 in progress (branch `claude/phase-3-gunplay`, draft PR #4)

**Done when (PLAN §17):** headshots and hit registration feel right at 100 ms.

Built in milestones; each one keeps the tests, both e2e scripts and the netsim green, and the game playable.

| Milestone | Status |
|---|---|
| M1 Weapon, gunplay, combat and lab-rules data | ✅ 40 weapon files + rule files, validated, CSV-agreement tests |
| M0 Hit-registration measurement harness | ⏳ next |
| M2 Damage maths and loadout resolution | ⏳ |
| M3 Weapon state in the simulation (fire, ammo, reload, swap, modes), protocol v2 | ⏳ |
| M4 Loadout pick online, data hash check | ⏳ |
| M5 ADS, recoil, spread | ⏳ |
| M6 Hit registration, damage, death | ⏳ |
| M7 DBNO and revive | ⏳ |
| M8 Melee | ⏳ |
| M9 Client presentation (viewmodel, HUD, hit markers) | ⏳ |
| M10 Range Lab (dummies) | ⏳ |
| M11 End-to-end tests, netsim gates, docs | ⏳ |

### What's done
- **Weapon data (M1, D-039):** `data/weapons/<id>.json` for all 40 roster weapons, generated once from
  `research/weapons.csv`. Damage and falloff, fire rate and modes, magazine and +1, total ammo, reload times
  (with the community-measured ammo-refill points), ADS time, attachments (including the per-operator ones:
  Dokkaebi's Mk 14 telescopic sight and muzzle brake, Brava's CAMRS grips, the 5.7 USG muzzle brake),
  extended-barrel damage, and the two official recoil facts (Mk 14 first-shot ×3.5, Reaper MK2 stages).
  `data/gunplay.json` holds class, sight, attachment and handling rules; `data/combat.json` damage zones,
  penetration, DBNO, revive and melee; `data/rules/lab.json` friendly-fire settings for lab rooms. Every
  invented value is in its file's `_unverified` list and in research/OPEN_QUESTIONS.md ("Placeholders added
  while building Phase 3", 32 questions). Nothing reads the data yet.
- **Checks:** schemas reject impossible weapons (damage rising with range, a barrel offered without its
  numbers, more than one shot per tick, and more), cross-file checks catch loadouts naming a missing weapon,
  and a test compares every number and UNVERIFIED mark with the CSV and the class rules
  (weapons_notes.md §4). The Ballistic Shield and GONNE-6 are in the data but can't be picked until Phase 8
  (D-054). 135 unit tests.

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
