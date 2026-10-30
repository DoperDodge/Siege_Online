# Phase 6 design: match flow and lobby

Status: adopted 2026-10-29. Scope: PLAN.md §17 Phase 6, "All formats, any team size 1–5 uneven, operator select,
prep/action, plant/defuse, rounds, side swap, bans, scoreboard"; done when "Full 1v1 and 2v3 matches playable start
to finish".

Read with: PLAN.md §5, §6, §14, §19; research/round_flow.md (every rule and number below comes from it unless it says
otherwise), research/core_mechanics.md §10 (DBNO) and §11 (friendly fire), research/intel.md §2.4 (objective
discovery), research/oregon/common_setups.md (Quick Match pre-setups); DECISIONS D-014, D-015, D-017 and the Phase 6
entries (D-118 on).

Rules this design keeps: never invent Siege facts (every placeholder is marked UNVERIFIED in its data file's
`_unverified` list and in research/OPEN_QUESTIONS.md); the server decides everything (clients send only inputs and
choices); the game stays playable after every milestone.

## 1. What a match is

A **match room** is a room on Oregon that runs a **format**: a preset from `data/modes/` (Quick Match, Unranked,
Ranked, 1v1, Custom, Practice), plus the host's changes. Lab rooms (the four lab pages) stay exactly as they are:
no lobby, no rounds, bodies on demand.

Two **match teams**, Blue (0) and Orange (1), 0–5 players each, uneven allowed. Each round one team attacks and the
other defends. The simulation keeps `pawn.team` as the **side** (attackers 0, defenders 1): friendly fire, revive,
reinforcing and rappel all ask "same side?", and inside a round side and match team are the same split. The room
keeps each member's match team.

## 2. A round, phase by phase

| # | Phase | Length (Ranked) | Bodies | What happens |
|---|---|---|---|---|
| 0 | `lobby` | until the host starts | none | teams, ready, host settings |
| 1 | `ban` | 15 s | none | each team votes to ban one operator of the side it is **not** playing (§5) |
| 2 | `planning` | 30 s UNVERIFIED | none | defenders vote for a site, attackers pick a spawn, everyone picks an operator and loadout, an attacker takes the defuser |
| 3 | `prep` | 45 s | defenders | defenders at the site reinforce and barricade; red walls keep them inside; attackers wait at their spawn's camera and may still change operator, loadout and spawn |
| 4 | `action` | 180 s | everyone | attackers spawn at their spawns; runouts are detected; plant |
| 5 | `postPlant` | 45 s fuse | everyone | the defuser counts down; defenders disable it |
| 6 | `roundEnd` | 6 s | as they were | result banner, then the next round or the match end |
| 7 | `matchEnd` | until the host goes back to the lobby | none | scoreboard, MVP, local ranked rating |

Siege runs ban → site and spawn → operator pick on the planning screens; whether Siege X shows them as one screen
or several, with their own timers, is UNVERIFIED (research §1). We show **one planning screen** with one timer
(D-118). Our phase lengths come from the preset; the Ranked operator-pick time (30 s) and our round-end banner (6 s,
no replay) are placeholders.

The timer that matters is always in the match state as server ticks (`phaseEndTick`), so every client counts down
the same clock.

## 3. Formats (data/modes/*.json)

Every format is one JSON file with a `match` block (the lab preset has none). The host may change any setting in
Custom; the other formats are fixed except the PLAN §6.2 host toggles (bans 0–2 in Ranked and Unranked, reinforcement
scaling). Values from research/round_flow.md §2–§3 and §14:

| Setting | Quick Match | Unranked | Ranked | 1v1 | Custom (starts as Unranked) | Practice |
|---|---|---|---|---|---|---|
| Team size | 1–5 | 1–5 | 1–5 | 1 | 1–5 | 0–5 (one side may be empty) |
| Regulation rounds / win at | 4 / 3 | 6 / 4 | 6 / 4 | 6 / 4 | any | ∞ |
| Sides swap every | 2 rounds | 3 rounds | 3 rounds | 3 rounds (UNVERIFIED, D-121) | any | 1 round |
| Overtime | at 2–2: 1 round, first to 3 | at 3–3: up to 3 rounds, first to 5, swap every round | same | at 3–3: 1 round | any | — |
| Bans | none | 1 per side per half (host 0–2) | same | none | any | none |
| Site | random, defenders know it, attackers see it as the round starts | defenders vote | defenders vote | the defender picks; revealed as the round starts | any | any |
| Operator pick | 20 s, 15 s when the sides didn't swap | 30 s UNVERIFIED | same | 30 s UNVERIFIED | any | 30 s |
| Prep / action | 45 / 180 | 45 / 180 | 45 / 180 | 15 / 180 (action UNVERIFIED) | any | any |
| Plant / fuse / disable | 7 / 45 / 7 | same | same | same (UNVERIFIED) | any | same |
| Attackers | 10 s safeguard; red walls stay up 10 s into action | — | — | attrition: a round's winner can't pick the operator they won it with | — | — |
| Reinforcements | scaled (6/6/6/8/10), plus pre-setups (§9) | scaled | scaled | 6 | any | scaled, or infinite |
| Stats | local | local | local rating | local | none | none |

Scaled reinforcements are D-015's `max(6, round(10 × defenders / 5))`; the host can switch to Siege's 10.

Overtime sides: Siege swaps after every overtime round (Ranked); which side each team plays in the first overtime
round is UNVERIFIED (research open question). We swap going into overtime too, so overtime simply alternates (D-121).

Bot Training and bot backfill need bots (Phase 9); the toggle arrives with them (D-122). There is one map, so no map
ban.

## 4. Lobby

- The creator is the host. If the host leaves, the longest-connected member becomes host.
- Joiners go to the smaller team (Blue on a tie). Players pick a team themselves while the team has room (5).
- Each player readies up. The host can move a player to the other team, swap the teams, kick, change settings
  (Custom: every setting; the others: the PLAN toggles) and start once everyone is ready and the format's team sizes
  hold: both teams 1–5 (1v1: exactly 1 each), Practice also 0 on one side.
- The first attacking team is drawn at random from the room's seed (Custom: the host may choose).
- Match rooms are listed in the server's room list (format, players, phase; no names) unless the host makes the room
  private. Joining needs the code either way.
- After the match the host can send everyone back to the lobby with the same teams.

## 5. Bans, operators and loadouts

- **Votes** (research §6): each player votes for one operator of the other side; votes can change until the timer
  ends; the team's ban is the majority vote, ties broken at random (room seed), no votes = no ban. An operator
  already banned can't be voted.
- **Our cap** (PLAN §6.2, D-014, D-119): bans stack one per round up to `bans.maxPerSide` (default 1, host 0–2), reset at
  the side swap, and are re-applied in overtime, so with the default there is one ban phase per half (rounds 1 and
  4 in Ranked). A ban phase is skipped once the stack is full. A ban that would leave a side with fewer operators
  than the players who will play it is not counted (the cap never lets it happen at 1 per side; at 2 it matters for
  5-player teams).
- **Operators**: one per player per team (research §6, uniqueness); not banned; in 1v1, not the operator the player
  won the previous round with. The first to lock an operator gets it. Anyone who hasn't picked when the timer ends
  keeps last round's operator if still allowed, else gets the first allowed one in roster order (Siege auto-picks
  from personal stats; we have none).
- **Loadouts**: the existing PickLoadout message and resolution (D-042), now recorded as the round's choice. Each
  operator's weapons and attachments are kept in the browser, set on the Play page, the planning screen or a lab, and
  picking an operator sends yours (D-126).
- **Repick in prep**: attackers may change operator, loadout and spawn until action starts [Y7S1]; defenders are
  locked once they spawn.

## 6. Bodies, spawns and confinement

- **Planning / ban / lobby / match end:** nobody has a body. Clients show a camera over the map (§11).
- **Prep start:** every body is removed, the panels go back to the level as built with fresh pools (and the
  pre-setups in Quick Match), and defenders spawn at the chosen site's defender spawns (5 per site in level.json), in
  slot order.
- **Action start:** attackers spawn at their spawn group's points (5 per insertion point), in the order they chose
  it. Their pick at that moment is what they carry.
- **Red walls (prep):** a defender can't leave the building (research §8). The simulation does it: while red walls are
  up, a defender's move that would put its feet outside the building zones (level.json `building` zones) is undone
  and the move stops; vaults and climbs that would end outside don't start. Clients predict it (it lives in the
  simulation's match rules, sent like deploy rules). Thrown gadgets come with gadgets (Phase 8).
- **Runouts (action):** a defender whose feet stay outside the building zones for `runoutGraceS` (1 s) is Detected:
  every attacker sees a live marker on them until they are back inside or dead (research §8; the marker is our
  drawing).
- **Spawn safeguard (Quick Match):** attackers take no damage from bullets or the knife for the first 10 s of action,
  each until they first enter the building (D-129; a fall still hurts).
- **Out of the map:** in a match a body below the kill plane dies (labs keep putting it back at spawn).
- **Leaving mid-match:** the body dies (the kill feed says "left"); the slot is kept, so a player who rejoins with the
  room code gets it back at the next round (reconnect proper, with the body kept, is a Phase 6 stretch, D-123). A
  team with nobody connected at the start of a round forfeits the match (not in Practice).

## 7. Damage rules in a match

- Friendly fire: off in prep, on in action; reverse friendly fire on with a 100-friendly-HP threshold (research §11;
  the threshold is the existing UNVERIFIED placeholder). Custom and Practice have the toggles.
- The last body of a side still up that goes down dies at once (core_mechanics §10.1, `lastAliveDies`), except an
  attacker after the defuser is planted.
- A side is **eliminated** when none of its players' active bodies is up (alive and not down); with the rule above
  that happens the moment its last body goes down or dies. Skopós is eliminated when her active shell dies; her idle
  shell doesn't count (research/operators/skopos.md).

## 8. The defuser (D-120)

State (in the match, and mirrored into each client's simulation): who carries it, or where it lies dropped, or where
it is planted and when; the site; whether the attackers have found the site.

- **Carrier:** any attacker can take it on the planning screen (and hand it back) until action starts; if nobody
  has, it goes to the first attacker in slot order (Siege gives it to the operator with the highest defuser
  priority; we have no priority data, UNVERIFIED). An attacker idle all prep drops it at action start [Y4S3]: we
  skip this one until players have bodies in prep (drones, Phase 7).
- **Drop:** the Drop defuser key (G, our default) drops it at the carrier's feet; it also drops where the carrier
  goes down or dies.
- **Pick up:** within 1 m, press Use (F); no need to look at it (research §5). Attackers only.
- **Plant:** carrying it inside one of the site's two rooms, at least `plantMarginM` (0.5 m) from the room's edges
  and on the room's storey, hold Use for 7 s; the body holds still meanwhile, crouched (D-126). A plant started before the action
  timer runs out may finish after it (research §2).
- **Disable:** a defender within reach of the planted defuser holds Use for 7 s; it must finish before the fuse runs
  out.
- Plant and disable are holds like reinforcing: the progress is on the body (`deployKind` Plant / Disable,
  `deployTicks`), predicted by its client, and the completion is a simulation event the room acts on.
- Defenders can't see the carrier or a dropped defuser through walls; attackers always see where it is (a marker).
  What exactly Siege shows each side is UNVERIFIED; this is our minimum.
- Prompt priority on Use: revive, then plant / disable / pick up, then reinforce and barricade, then the ladder.

**Finding the site** (Ranked, Unranked, Custom with that setting): attackers know the four possible sites; the
chosen one is revealed to all attackers when an attacker's body has the eye on one of its bombs (line of sight,
within 45° of the view and 25 m: placeholders until drones in Phase 7). Quick Match and 1v1 reveal it when the round
starts (prep), our reading of Siege's "at round start" (D-121).

## 9. Quick Match pre-setups

Siege pre-places reinforcements and rotation holes per site in Quick Match ("2 designed sets per bombsite", reduced
in Y10S2); the sets themselves are not published (UNVERIFIED). Ours come from research/oregon/common_setups.md: the
site's two top-priority reinforcements and its rotation holes, applied at prep start on top of the pool. Marked DER
(our derivation) in the data.

As built (D-128): each site's `preSetup` in layout.json, checked and compiled into level.json by the map generator,
names the panels (a wall with the room its steel faces, or a hatch, reinforced from its top) and the holes (`vault` or
`crouch`, sized in data/destruction.json `rotationHoles`). match/preSetup.ts turns them into panel ops; the room
applies and sends them like any other, so every client has them.

## 10. Wire (protocol 11)

Client → server:
- `CreateMatch { format }`: a new match room on Oregon, in its lobby, with the sender as host.
- `ListRooms` → `RoomList [{ code, format, players, phase }]` (listed rooms only).
- `LobbyAction`: team, ready, your local rating (Ranked); host only: move, swap teams, kick, settings, start, back to
  lobby, private, end (Practice).
- `MatchAction`: ban vote, site vote, spawn, take / give back the defuser. Operator and loadout ride the existing
  `PickLoadout`.
- New input buttons: `Btn.Drop` (drop the defuser). Plant, disable and pick up are Use (`Btn.Interact`).

Server → client:
- `MatchState`: the whole match as this player may see it, sent when it changes (at most a few times a second) and on
  joining: format and settings, phase and its end tick, round, score, which team attacks, each member (id, name,
  team, ready, host, connected, operator and loadout pick, spawn choice, alive, kills/deaths/assists), the bans,
  this player's team's votes, the site (attackers: only once revealed), the defuser (carrier visible to attackers
  only), detected runouts (attackers only), each round's winner and how, and the match result. M5 (protocol 12):
  each player's attrition lock (to their team), whether they are safeguarded and until when, and the new ratings at a
  Ranked match's end.
- `matchRules` event: what the simulation needs to predict (red walls on, defuser state for plant/disable), like
  `deployRules`.

A phase change that changes bodies (spawns, red walls coming down) forces a correction, so it never counts as a
misprediction.

## 11. Client

- **Play page** (`/play.html`, linked from the home page; `game/client/src/play/`): name, create a match (pick the
  format), join by code, the room list (refreshed every 3 s). It sends you to the match page
  (`labs/match.html?format=…` creates, `?room=CODE` joins), which runs the existing game client
  (labs/common/lab.ts) with a `match` option: no lab tools, Go to, free camera, storey views, third person or
  hitboxes; the screens and HUD below are `labs/matchFeatures.ts`.
- **No body** (D-125): lab.ts runs without a body (a stand-in controller with no pawns until the server spawns one).
  The page picks the camera: circling the building on the lobby, ban and planning screens and at the end; for an
  attacker in prep, their spawn's first point with mouse look; after a death, 3 s on your own body, then a living
  teammate's eyes (click for the next; full spectating is Phase 7).
- **Lobby screen:** two team columns (ready, host star, left), Join a team, Ready, the host's move, kick, swap
  teams and start, the format, the bans and reinforcement toggles, Custom's rounds and timers, private, the room
  code and invite link.
- **Ban and planning screens:** the operator grid (banned and taken greyed out), the weapons, the site vote
  (defenders) or the spawn (attackers) as buttons, the defuser button, the team's picks, the timer. Attackers keep it
  through prep, over their spawn's view.
- **HUD:** the score with each team's side this round, the phase and its clock (the fuse once planted, red in its
  last 10 s), the round and overtime; a line each for the site, the defuser (carrier, dropped, planted), Detected
  run-outs, the pool in prep and the red walls; plant and disable progress on the deploy gauge; the defuser, its
  carrier and Detected defenders marked in the world.
- **Tab scoreboard:** both teams, operator, K/A/D, alive, dead or left; your ping.
- **Round banner and match summary:** who won the round and how (research §4's icons, drawn our way: in words), the
  next round's sides on the top bar; at the end the score, each round's result, the players' K/A/D and the MVP, and
  the host's Back to the lobby; in Ranked each player's rating change.
- **M5 (D-129–D-131):** Ranked shows each player's tier and rating in the lobby; the planning screen greys out the
  operator attrition locks; the HUD counts down the attacker safeguard; a Custom or Practice host sets every rule in
  the lobby; a Practice host ends the match from the planning screen or the pause menu.

## 12. Ranked rating

There are no accounts, so the rating lives in each browser (localStorage) and is labelled "local ranked" (PLAN §6.2
says "on the host"; in a browser game the host is a tab, D-124). The client sends its rating when it joins a Ranked
room (clamped); at the match end the server computes Elo for each player (K = 32, team average vs team average, our
choice) and sends the new rating back. Rank icons are our own (simple shapes, our tier names).

As built (D-130): the rating goes in from the lobby, or once from a player who joins a match under way; those who
played a round are rated (leavers too); the new rating is the player's back in the lobby. Tiers:
data/presentation/ranks.json.

MVP: most kills, then most assists, then fewest deaths (our rule; Siege's MVP is by score points, which we don't
model).

## 13. Tests

- Pure (`game/shared/test/match*.test.ts`): every preset validates; side schedules (QM, Ranked, 1v1, overtime);
  match end and overtime triggers; ban votes, caps and resets; operator availability (uniqueness, bans, attrition,
  never fewer than the players); pick timer 20 / 15; pool scaling; the nine win conditions of research §4.
- Room (in process): full 1v1 and 2v3 matches driven through the room's real messages: lobby, start, picks,
  prep with defenders at the site and red walls, action, rounds won by elimination, time, plant + fuse and disable,
  side swap, overtime, match end; Practice with an empty side.
- netsim `--match`: ten clients through a 10-round match, no desyncs (PLAN §19).
- Browser (e2e): a 1v1 and a 2v3 match with short Custom timers, through the Play page, lobby, planning, rounds and
  the match summary.

## 14. Milestones

| M | What | Playable after it |
|---|---|---|
| M1 | Format presets + schema; pure match logic (`match/rules.ts`, `match/flow.ts`, `match/outcome.ts`) with tests | (logic only; nothing changes in the game) |
| M2 | Match rooms on the server: lobby, round lifecycle with bodies, spawns, red walls, runouts, kill plane, damage rules, elimination and time wins; protocol 11; server lobby | a match plays from a script and the netsim |
| M3 | The defuser: carry, drop, pick up, plant, disable, fuse, every win condition | rounds can end every way |
| M4 | Client: Play page, bodyless cameras, lobby, ban and planning overlay, HUD, scoreboard, round and match summaries | a full match in browsers |
| M5 | Format details: Quick Match (random site, safeguard, red-wall extension, pre-setups, 20/15 s), Ranked rating, 1v1 attrition, Custom settings, Practice | every format |
| M6 | Gates: netsim `--match`, e2e 1v1 and 2v3, docs, review, report | "Full 1v1 and 2v3 matches playable start to finish" |
