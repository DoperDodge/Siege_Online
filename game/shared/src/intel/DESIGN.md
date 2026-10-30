# Intel (Phase 7) — design

PLAN §10 and §17: drones, default cameras, the Bulletproof Camera, the feed list, pinging and the comm wheel,
spectating when dead. **Done when** prep-phase droning and watching the cameras work online. The facts come from
`research/intel.md` (I:line below), `research/round_flow.md` and `research/oregon/map_features.md`; every number the
research couldn't confirm is a placeholder in `data/intel.json` (its `_unverified` list) and an open question
(OPEN_QUESTIONS, "Intel"). Gadgets that counter intel (Mute's jammer, Mira, Dokkaebi, Brava's Kludge drone, Pulse)
come with their operators in Phase 8; this phase leaves room for them (a feed can be jammed or hacked).

## 1. Data (`data/intel.json`)

| Key | Value | Source |
|---|---|---|
| `drone.perAttacker` | 2 (both can be out) | I:21-22, verified |
| `drone.hp` | any damage destroys it, a fall doesn't | I:24, verified |
| `drone.jumpCooldownS` | 3 | I:26, verified (Fandom) |
| `drone.jumpHeightM` | 1.0 | I:27, placeholder |
| `drone.speedMps` | 4.0, strafing at full speed | I:30-31, speed a placeholder |
| `drone.boost` | ×1.5 for 2 s, 10 s to recharge | I:32, exists (Y9S3), numbers placeholders |
| `drone.sizeM` | 0.22 wide × 0.12 tall × 0.18 long | I:33, placeholder |
| `drone.fovDeg` | 90, no zoom | I:79-80, placeholders |
| `camera.yawHalfRangeDeg`, `pitchMinDeg`, `pitchMaxDeg` | ±60, −60…+10 | I:159-162, placeholders |
| `camera.turnDegPerS`, `fovDeg` | 60, 70, no zoom | I:159-162, placeholders |
| `scan` | hold 1 s, 10° from the crosshair | I:115-122, cone a placeholder |
| `ping` | 5 s each kind, 1 yellow ping each, 0.5 s apart | I:109-110, placeholders |
| `bulletproofCamera` | 1 per carrier, dart 0.75 m, outdoors 10 s | I:198-206, dart recharge and disable time placeholders |

## 2. Drones

**What a drone is.** A pawn (`Pawn.kind` Drone) of its attacker's controller, next to the body: it is predicted by
its owner's client like the body (driving at 100 ms must feel like walking), sent in snapshots like any pawn, and
shot through the same lag-compensated hit registration. A drone is a box (`drone.sizeM`) moved by the same Rapier
character controller as bodies, on its own collision group: it collides with the level, panels and props but not
with bodies (our simplification, flagged). Its state is a `PawnState` (position, velocity, facing, grounded, mode)
plus its jump cooldown and boost.

**Two per attacker, made once per round.** When an attacker's round starts (prep), their controller gets both drones:
drone 1 out at their spawn (I:42, verified: "the player starts in drone #1, which spawns on the side of the first
chosen spawn"), drone 2 held (mode Held: no collider, not drawn, not shootable). Throwing, driving, leaving and
picking up are then state changes the simulation makes and the owner's client predicts; the pawn list only changes
when the round does. In prep the attacker has no body: the controller's possessed pawn is drone 1. At action start
the body stands at the chosen spawn and drone 1 stays where it was parked (I:45, verified).

**Controls (our keys, flagged; Siege's own PC keys are an open question):**
- **Observe (5):** in the body with a drone held, throw it (it lands about a metre ahead, rolling) and drive it; with
  none held, drive the last one out; in a drone, back to the body (the drone stays put). Downed: nothing (I:234,
  placeholder).
- **Driving:** W/A/S/D at full speed in every direction (I:31), the mouse turns and tilts the view, Space jumps (once
  per `jumpCooldownS`), Shift boosts while the boost lasts. Lean left / right (Q / E) goes to the previous / next of
  your drones out (the feed list, §5, adds teammates' and the cameras).
- **Pick up (F):** in the body, next to one of your own drones (within 1 m, our placeholder): back in hand. Only its
  owner picks it up (I:46, verified).
- **Dead:** an attacker whose body died keeps driving the drones they have out (I:231, verified); Observe enters them.

**Damage.** Any damage destroys a drone (bullets, the knife, explosions), not a fall; it isn't a player's death (no
kill feed line, no down), and defenders see how many drones they've destroyed (I:51, verified). Its wreck stays
until the round ends (ours). A drone below the kill plane is destroyed.

**Where a drone goes.** Through doorways, under door barricades, through drone holes and through any hole as big as
it is (I:56-59): Oregon's drone holes are 0.4 × 0.2 m slots in the walls (layout P13), and a door barricade's bottom
gap opens whole 10 cm rows for movement, rounded up so a drone fits under it (data `bottomGapM` 0.15).

**What a drone sees.** Its camera sits at the box's front, `fovDeg` wide. A drone with a bomb in view finds the site
(I:144: drones detect the objective; match/DESIGN.md §8's sight rule, from the drone's eye). Drones see no better than
bodies (no thermal, I:88).

## 3. Default cameras

The level's cameras (level.json `cameras`: id, position, facing, room; Oregon has 8 from research/oregon/
map_features.md, their walls and facings placeholders). Each is a small box on its wall or post with 1 HP: any shot
breaks it
(I:156), for the rest of the round. Defenders view them any time (prep and action, alive or dead; not downed); each
viewer turns their own view within the camera's limits (`yawHalfRangeDeg` around its facing, `pitchMinDeg`…
`pitchMaxDeg`) at `turnDegPerS`. **Deviation (flagged):** in Siege a camera has one facing that its viewers share;
ours is per viewer, so two defenders on one camera don't fight over it and each view is predicted. Which cameras are
broken is room state sent to everyone (like the walls), so attackers see them broken and defenders can't open them.
A camera being watched shows a red light to attackers (Y6S4: viewer-relative colours; whether a passive viewer
lights it is an open question).

## 4. Bulletproof Camera

A defender gadget (data: `bulletproof_camera` in Mute's, Lesion's and Sentry's gadgets; count 1, I:198). Hold the
gadget key at a wall or the floor within reach to place it (the research disagrees on thrown or placed: I:199 vs
gadgets.md §4.6; we place it). Its front is bulletproof, its sides and back break to one bullet; explosions (and
Sledge's hammer, Phase 8) destroy it, and a melee hit breaks only its glass: no view, still sound (I:200-201). Its
view is thermal (bodies stand out, through smoke). It turns like a default camera. Its EMP dart (any defender viewing
it): a 0.75 m burst that disables drones
(and later gadgets) for a while (placeholder), recharging (placeholder). Outdoors it loses its signal after 10 s.
Reinforcing the wall it sits on breaks it (CSV:337). It joins the defenders' feed list.

## 5. The feed list

Attackers: their own drones out (drivable), then teammates' drones (view only: turn the view, no driving, I:49).
Defenders: the default cameras, then Bulletproof Cameras. Q / E go round the list; broken feeds are shown crossed out
and skipped; a feed you can't drive is greyed (I:49 tint). Esc / Observe closes it. Each feed's icon sits in a row at
the top of the view.

## 6. Pings, scans and the comm wheel

- **Ping (T, ours; Siege uses Z, our ability key):** a yellow ping where you aim, from the body, a drone or a camera,
  seen by your team only, through walls and at the screen's edge when off screen, numbered per player, for 5 s; one
  each at a time (I:98-110). Pinging an enemy's gadget or a camera marks it with its icon.
- **Scan:** hold Fire (our key) for 1 s on a drone or camera with an enemy within 10° of the crosshair and in sight:
  they get a red ping for your team for 5 s and are told they've been spotted (I:115-122).
- **Danger:** a double-tap of ping (I:100).
- **Comm wheel:** hold ping: a radial of callouts (Breach, Area Clear, Help, Danger, Thanks, and our Defuser, Rotate,
  Push: I:128-129, the list beyond the five a placeholder), sent to your team as a line in the feed.
- Pings are inputs to the room (a message), not simulation state; the room checks the line of sight for scans.

## 7. Spectating when dead

Dead defenders: the cameras (§3) and pinging from them; dead attackers: their drones out (driving) and teammates'
drones; both: following a living teammate's eyes, as in Phase 6 (I:230-231, verified). Downed players can't use
drones or cameras (placeholder, I:234). The killcam stays out (research: 5 s, unverified; PLAN §16.3 later).

## 8. Wire (protocol 13)

- Roster entries list each player's drones next to their bodies (a pawn's kind comes from the roster).
- A correction carries up to four pawns (a body and two drones; Skopós's two shells).
- Pawn state: mode Held; the drone's jump cooldown and boost ticks; the controller's driven drone and camera view.
- Cameras: broken flags (a room message on change and on join); pings and callouts (a team message).

## 9. Client

The view follows what you're driving or watching (a drone's eye, low and wide; a camera's lens). The drone HUD: the
feed row, drones held, jump and boost meters. Drones are drawn as greybox boxes with wheels; cameras as boxes with a
lens and their light. Keys in Settings. Drone and camera audio come with Phase 11.

## 10. Tests

- Simulation: a drone drives, strafes, jumps (cooldown), boosts, falls without damage, fits through Oregon's drone
  holes and under a door barricade, not through a wall; thrown, left, entered and picked up; prediction matches the
  server (a client predicting a drive sees no corrections).
- Room (through the real messages): prep starts attackers in drone 1 at their spawn; action puts the body at the spawn
  with drone 1 where it was; a shot destroys a drone (no death in the match); a dead attacker drives a drone; cameras
  broken by a shot, viewed within limits, closed to attackers; pings reach the team only.
- Netsim: prep droning online (attackers drive drones through prep, no desyncs).
- Browser: an attacker drives a drone in prep; a defender watches a camera and sees it; a ping shows for a teammate.

## 11. Milestones

| M | What | Playable after it |
|---|---|---|
| M1 | Drones in the simulation and rooms: data, the drone pawn (drive, jump, boost, holes), throw / drive / leave / pick up, prep in drone 1, shots destroy drones; protocol 13 | droning in the netsim and tests |
| M2 | Drones in the browser: the drone view and HUD, drawing drones, keys; dead attackers drive their drones; browser test of prep droning | prep droning online |
| M3 | Default cameras: viewing within limits, shooting them, broken state, dead defenders on cameras; browser test | cam watching online |
| M4 | Pings, scans and the comm wheel | intel shared with the team |
| M5 | Bulletproof Camera and its EMP dart | every Phase 7 tool |
| M6 | The feed list across everything, spectating; checks (netsim, browser), docs, review, report | "Prep-phase droning + cam watching work online" |
