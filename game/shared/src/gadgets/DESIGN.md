# Operators and gadgets (Phase 8) — design

PLAN §11 and §17: every generic secondary gadget in both pools, then the twelve operators' abilities, Fuze's
Ballistic Shield and the Siege X ingredients. **Done when** every row of `research/interactions.csv` (343) has a
passing test. The facts come from `research/gadgets.md` (G§ below), `research/operators/*.md`,
`research/interactions_notes.md` (its §4 rules and §5 conflict resolutions are followed as written) and
`research/destruction.md`. Every number the research couldn't confirm is a placeholder in the data (its `_unverified`
list) and an open question (OPEN_QUESTIONS, "Placeholders added while building Phase 8").

Ids are the CSV's: `breach_charge`, `hard_breach_charge`, `claymore`, `frag`, `stun`, `smoke`, `impact_emp`,
`barbed_wire`, `deployable_shield`, `nitro_cell`, `impact_grenade`, `proximity_alarm`, `bulletproof_camera`,
`observation_blocker` (the operator files already use them); Lesion stands for the plan's "Legion" (D-011).

## 1. Data

- **`data/gadgets/<id>.json`**, one per generic gadget (PLAN §4), validated by a schema with a part per behaviour:
  `count`, `side`, `electronic`, how it's used (`throw` with a fuse rule, `place` with surfaces, reach and seconds),
  its `blast` (§5), `hp` and what destroys it, and its own numbers (a jammer's radius, a stun's ranges). The
  Bulletproof Camera keeps its numbers in `data/intel.json` (Phase 7); its gadget file holds only what's generic.
- **`data/gadgets.json`**: what all gadgets share — the throws (§4: speeds and angles for overhand, underhand and
  the Nitro Cell's heavy throw, the item's radius, bounce, friction, rest speed), equip and put-away times, the
  DSEG and jam rules' numbers that aren't one gadget's, and the ingredients (§9).
- **Operators** (`data/operators/*.json`): `ability.params` becomes a schema per ability id (Sledge's hammer,
  Thermite's charge, …) instead of loose numbers, so each is checked. Counts per loadout come from the gadget files
  (Sentry's and Striker's kits take the generic counts, sentry.md §3.2; Striker's 3 stuns are an open question).
- `data/destruction.json`'s `explosives` (the Destruction Lab's cut shapes, Phase 4) become the gadgets' panel
  cuts (§5); the lab's T/G keys use the real gadgets from M1.

## 2. In the hands

A body holds its weapon, its secondary gadget (slot 1) or its ability (slot 2). New predicted pawn fields: `hand`
(weapon, slot 1, slot 2), what's out within the slot (the device or its detonator), `gAct` and `gTicks` (taking it
out, placing, winding up a throw, a swing), the count left per slot, and an ability's refill timer and total made
(Lesion's mines, Dokkaebi's charges). Keys (ours; Siege's PC keys are an open question):

| Key | Does |
|---|---|
| 3 (`Btn.Gadget`) | Take out the secondary gadget; again, put it away. With a remote device waiting, the detonator comes out first, and another press swaps to a new device (when there's one left). |
| Z (`Btn.Ability`) | The same for the ability's item: Sledge's hammer, Thermite's and Fuze's charges, Mute's jammers, Mira's mirrors, Lesion's mines, Pulse's sensor, Dokkaebi's tablet, Brava's Kludge drones, Striker's and Sentry's second gadget. Skopós: the shell camera, as now. |
| Fire | A throwable: throw it overhand. A placeable: hold to place it where the outline shows (let go early: nothing; the body stands still meanwhile, like reinforcing). A detonator: set the oldest device off. The hammer: swing. The tablet: send the payload or hack a phone. |
| ADS | A throwable: lob it underhand. |
| Interact (hold) | Pick up your own jammer, alarm, wire, shield, mine or camera; pull a Gu needle; dismiss Dokkaebi's call. These come before reinforcing when both are offered. |
| 1 / 2 | Back to a weapon. |

Weapons are put away while a gadget is out (no firing; the weapon's equip time when it comes back). The Phase 7
Bulletproof Camera moves onto this: 3 takes it out, Fire held places it (it was a 1 s hold of 3; D-140). On a
camera, 3 still fires its dart (Fire scans, Phase 7). Others see what's in a body's hands (a new remote field, §11).

## 3. The gadget table

Everything placed, thrown or dropped is an entry in `sim.gadgets` (`gadgets/table.ts`), on the server and on every
client: `id`, `kind`, `owner` (controller), `team` (its allegiance: a hack flips it), position and facing, the
panel (and side) it's mounted on, `state` bits (armed, triggered, broken glass, opaque glass, DSEG'd until a tick,
hacked, jammed), its timers (fuse, drill, eject) and its flight (§4). The Bulletproof Cameras move here from
`MatchSimRules.bpCams` (M1), and the level's default cameras keep their own list (`camsBroken`, Phase 7) with a
hacked-by-attackers mask added for Brava.

- **Only the server changes it.** It sends what changed as ops (add, update, remove) with each snapshot and a hash
  of the whole table, like the walls' ops (Phase 4 M5); a client whose hash disagrees, or who joins, gets the whole
  table. A client applies ops when they arrive and predicts its own body against the table it has (a deployable
  shield's collider, barbed wire's slow), so a change it learns of late costs at most a correction, as walls do.
- **Mounted gadgets go with their surface:** a gadget on a panel is destroyed when the panel's cells under it go
  (a breach, a hammer, reinforcing a wall destroys what's on it and what stands too close: CSV `action.reinforce`).
- **Colliders:** the deployable shield, the Black Mirror's glass and Skopós's idle-shell barrier block bodies and
  drones (Rapier colliders in a new group, made and removed with the entry on both sides) and stop bullets.
- **Hits:** each kind has a hit shape (a box or a sphere). The room's shot judging (Phase 3) and the knife check the
  table along the ray as they check Bulletproof Cameras now (`bpCamsOnRay` becomes `gadgetsOnRay`): fragile ones
  break (1 hp, G§6), bulletproof ones stop the bullet (the camera's front, the shields, the mirror, the barrier).

## 4. Throws

A throw (Fire or ADS once the item is up, after a short windup) adds a flying entry with its launch tick, position
and velocity from data/gadgets.json. Server and clients step it with the same code (`gadgets/flight.ts`): gravity,
a ray each tick against the level, panels, props and gadget colliders (not bodies: they'd differ between machines),
then by kind: **bounce** (restitution, friction, at rest below a speed: frag, stun, smoke), **impact** (go off on
the first hit or after 20 m: impact grenade, Impact EMP), **stick** (Nitro Cell, proximity alarm) or **settle on
something flat** (Gu mines; a wall drops it, lesion.md). The server alone also checks bodies for impact grenades,
and its ops say where an item came to rest, stuck or went off, so drift never lasts. Fuses (G§3): frag 4 s, 2 s
after the first bounce; stun 3 s (placeholder), 2 s after the first bounce; smoke 3 s, 2 s after the first hit;
none can be cooked. A client draws a projectile at the same moment it draws its thrower (the path is kept by tick),
and its own throws at once.

## 5. Explosions

`gadgets/blast.ts`: one function computes what a blast does, and the room applies it (damage through the usual hurt
path with credit and friendly-fire rules, wall ops, table ops, drone deaths). A blast's data:

| Field | Meaning |
|---|---|
| `damage {max, fullM, zeroM}` | Full damage within `fullM`, falling linearly to 0 at `zeroM` (CSV/G§ values; Claymore 155 to 2 m then 0 at 6 m; Nitro 171 to 2 m, 0 at 6 m; Impact 40 within 2 m). |
| `near`, `far` | For charges on a wall: the placer's side and the far side differ (Breach Charge 50 hp within 1 m on the placer's side; Exothermic 220 on the far side to ~3.5 m, point blank only on Thermite's). |
| `arcDeg`, `behindM` | The Claymore: 180° in front, 1 m behind. |
| `destroyM` | Gadgets (any team), barricades and drones within it are destroyed. |
| `cut` | The panel cut: a charge's rectangle on its own panel; a grenade's disc on panels within `cutM`, its size shrinking with distance. Floors only ever get see-through holes (Phase 4); hatches take `hatchDamage`. |

**Occlusion** (RealBlast, research/destruction.md §5): a body is hurt by its hitbox point nearest the blast that a
line from the blast reaches without meeting the level's solid geometry, steel or something that blocks explosions
(the deployable shield, the mirror); each soft panel on the way lets `throughSoft` through (Nitro and grenades hurt
through drywall). The panel a charge is on neither stops nor dims its own blast (it's blowing a hole in it: a Hard
Breach Charge's 5 hp reaches the far side of steel). A Ballistic Shield in front takes 66 % (§8). Stun and smoke direct
hits do 5 hp. Tinnitus is the client's (within `concussM`).

**What it destroys** (M2): gadgets within `destroyM` that the same line reaches (the Claymore: only in its arc, for
gadgets and barricades too); a Bulletproof Camera's glass breaks instead (it stays in the feed list, broken, as a
default camera does). A remote device destroyed tells its owner (one fewer waiting on the detonator). One bullet or a
knife destroys a gadget whose data says `fragile` (charges, the Claymore, the Nitro Cell, the alarm and the blocker),
without a blast; nothing in flight can be shot.

## 6. Electronics: DSEG, jamming, hacking

Rules from interactions_notes.md §4, implemented once (`gadgets/electronics.ts`) and asked by every remote action:

- **DSEG** (Impact EMP 2 m / 9 s, the Bulletproof Camera's dart 0.75 m): enemy electronic gadgets in the radius are
  disabled until a tick (no feed, no trigger, no laser, no alarm, no jamming); a body in it gets `dseg` ticks: no
  optics (sights show static, no zoom), no observation tools (it's put off cameras and drones), no remote triggers.
  Reapplying refreshes it. Mechanical gadgets (wire, shields, impact grenades, the mirror, Gu) never mind it.
  Skopós's active shell takes only the "no observation tools" part (so no swap); her idle shell is disabled (no swap
  into it). Phase 7's jammed drone becomes this DSEG.
- **Jamming** (Mute, 2.6 m sphere, warning at 4.875 m): a remote action between a body and its device is blocked
  while either is within reach of an active jammer of the other team (a Breach, Exothermic or Cluster Charge's
  trigger, a Nitro Cell's, Dokkaebi's upload). Drones and Kludges inside lose control and show static; outside, from
  the warning radius, static only. Automated devices (Claymore, Hard Breach Charge, `mute_jams_hbc` false), grenades,
  optics and friendly devices aren't affected. A charge already triggered isn't stopped.
- **Hacking** (Brava, §7): a gadget's `team` flips (cameras: the feed goes to the attackers; an alarm then sounds for
  defenders; an observation blocker hides from defenders' cameras; a jammer jams defenders' devices, mostly
  placeholders), or it's destroyed after a delay (Nitro Cell; Skopós's idle shell overheats).

**As built (M3, `gadgets/electronics.ts`):** an EMP reaches through walls (ours). On a gadget it sets `GFlag.Off` until
`offEnd` (the server's tick; the simulation reads only the flag): no feed, laser, alarm or barrier, and the detonator
skips it (the oldest working device goes; none working, the press does nothing and nothing is counted). On a body or a
drone it's `PawnState.jammed` (ticks, predicted, wearing off in its own step), Phase 7's drone jam with a wider use:
the body loses its sights' zoom (static over them), cameras, drones, Skopós's shell camera and its detonator. Default
cameras get a bit in `matchRules.camsOff` (sent with the match state). The Bulletproof Camera's dart is this EMP at
its 0.75 m. Other M3 rules: a smoke grenade's entry stays after its fuse as a cloud (`GFlag.Active` for its seconds);
scans and pings stop at clouds (a Bulletproof Camera sees through) and at the other side's observation barrier (from
a drone or a camera); barbed wire's slow is predicted (MoveContext `slowOf`), its bite the server's (`Cause.Gadget`);
a deployable shield is a box collider the simulation keeps in step with the table (`G_GADGET`: bodies, drones,
bullets, blasts, throws and sight meet it; a stun's flash doesn't); a proximity alarm sounds while an enemy body is
within its radius (`GFlag.Active`; an `alarm` event as it starts and stops).

## 7. The operators

Each operator's ability is a module in `gadgets/abilities/`; its numbers are in its operator file.

| Operator | What gets built (research file; placeholders in brackets) |
|---|---|
| **Sledge** | The hammer: 25 charges, 0.8 s swing; within reach [1 m both skins, 2 m one] a rectangular hole one swing makes crouch-and-vault sized and two make standing sized [sizes], barricades and unreinforced hatches go in one; reinforced and hard surfaces don't, the swing still costs [1 per swing]. Gadgets in front break as to an explosion; a body takes [a kill, 2 charges]; a shield is knocked down. Works on a rope. |
| **Thermite** | 3 Exothermic Charges, [3 s] to place on any destructible surface, reinforced included, not hard walls or the mirror's glass; detonator; [3 s] burn with sparks on both sides; a large hole through steel; a reinforced hatch whole; adjacent surfaces within [the radius] cut; 220 hp on the far side. |
| **Fuze** | 4 Cluster Charges, [2 s] to place, one at a time (a second sets the first off); soft surfaces at once, reinforced ones, the mirror and a deployable shield after 1.75 s (its tube can be shot then); [5] sub-grenades in a fan from left to right on the far side, each [4.2 m, lethal within 1.2 m]; at least one always comes out. The Ballistic Shield (§8). |
| **Striker / Sentry** | Two different gadgets from their side's pool: the first in slot 1, the second on the ability key; counts as generic. The loadout pick (§11) offers the 21 pairs. |
| **Mute** | 4 Signal Disruptors, placed on the floor [3 s], jam (§6), picked up again, 1 hp, electronic; shown radius for 2.5 s after placing. |
| **Pulse** | The sensor: out on Z (no shooting while up), attackers' heartbeats within 10.5 m [in a forward fan] through walls as blips only he sees; a ping while it's up marks a heartbeat for the team [placeholder]; frozen by DSEG. |
| **Mira** | 2 Black Mirrors: [5 s] at a reinforceable wall, standing or crouched height, from the steel's side if reinforced; cuts a window [1.0 × 0.35 m] through every layer and fills it with glass seen through from the placer's side only, bulletproof and blast-proof both ways; a knife hit shatters it (opaque both ways); its canister (placer's side) once destroyed ejects the glass [4 s] later (an open hole); gone with its wall; that wall can't be reinforced afterwards. |
| **Lesion** | Gu mines: 1 at the start, +1 every 25 s up to 8 made; thrown, they settle on flat surfaces; an attacker within 1 m is needled: 3 hp, then 12 every 2 s until he pulls it [2 s hold, standing] or is downed; no sprint; a second needle resets the timer with its hit and one tick; visible to all; picked up again. |
| **Brava** | 2 Kludge drones (drone pawns, bigger, [their own speed]) besides her 2 drones: Fire on one hacks a device in view within [10 m] for [3 s] (it must stay in range; no sight needed once started); [3] hacks each; result per kind (§6, brava.md §4); jammed like drones. |
| **Dokkaebi** | The tablet: an identified defender (spotted by a scan, Phase 7) gets the Jegeo Payload: 1 charge at the start, +1 every 25 s up to 5; a 7 s upload broken by a jammer on him, an EMP on him, her death or his dismissal [1.5 s hold of F]; then his phone explodes: 40 hp, a fire for 5 s [its damage and size], no observation tools for him for the round (Skopós: no swap); 14 s before the same target again. A dead defender's phone (Skopós's circuit board) hacked from anywhere gives the attackers his team's cameras for 20 s [2 a round]. |
| **Skopós** | Swapping is built (Phase 1, D-139). New: the idle shell's barrier (bulletproof, blast-breakable, a head-height window that shatters), the idle shell as a defenders' camera (in their feed list), Brava's overheat [8 s] with a warning (swapping in cancels it), EMP rules (§6), Jegeo blocks swaps, a destroyed shell drops a circuit board, a site spawn for the idle shell in prep [Oregon spots]. |

**As built (M4, Sledge):** an operator's own item is a gadget file like the generics, marked with its `operator`
(their `ability.id`), never in a pool; a loadout carries it in slot 2 (Z). Its numbers are in that file rather than
the operator's (D-144). The hammer is `breaching_hammer.json` with a `swing` use: Fire held swings it, 0.8 s a swing,
the blow landing `hitS` in; the simulation spends a charge when the blow meets anything within reach (the level, a
panel's material, a gadget, a body), the room judges what (`judgeSwing`: bodies as the swinger saw them first, a kill
costing a second charge; then an enemy gadget or an ingredient, as a blast would take it; then the first panel,
`gadgets/hammer.ts`). It works on a rope.

**As built (M5, Thermite and Fuze, D-145):** both charges are operator items placed like the Breach Charge, on any
breakable surface (`soft` and `steel`; Fuze's also on a deployable shield's face, `shield`; Thermite's on a wall
stands on the floor below where you look, `toFloor`, so its hole starts at the floor), set off by the detonator
(electronic: DSEG stops the press). The detonator now calls `GadgetServer.detonated`: a gadget with `burnS`
(Thermite's) starts burning (`GFlag.Active`, sparks drawn on both sides of its surface) and goes off when its fuse
runs out; nothing but its destruction stops it then, and a set-off device is no longer waiting (the detonator skips
it, and destroying it tells nobody). Its blast cuts 1.5 × 2.0 m through every layer and steel (a reinforced hatch
whole), and with `cutM` also the panels within 1 m of it (its "adjacent" surfaces); 220 on the far side, its own
side's curve now also for a charge lying on a floor (up is its placer's side). Fuze's (`cluster`, `gadgets/cluster.ts`)
drills: at once through a soft surface, `drillS` (1.75 s) through steel or a shield (whose glass shatters); then its
tube is through (its hole cut, a 0.5 m disc; a hatch keeps its hp) and its grenades leave the tube's end one every
0.35 s across a 100° fan from its placer's left to right, each a thrown entry of its own kind (`cluster_grenade.json`,
bouncing with a 1 s fuse, its blast credited to the Cluster Charge); after the last it falls. While set off its tube
sticks out of the far side (`tubeM`): bullets and blasts meet it there, and destroyed then it has let one grenade out
first. One at a time (`maxOut` 1): the hands never count more than one waiting, and the server sets the older one
off as the detonator would (or lets it fall if an EMP would stop that). A blast now destroys drones of either side
whatever the friendly fire rules (a drone is a gadget to it).

## 8. The Ballistic Shield (Fuze)

The shield as a primary (data/weapons/ballistic_shield.json, research/weapons_notes.md §5): a shield hit shape in
front of the body (head and chest; legs exposed standing), no hip fire, ADS tilts it and fires the secondary [0.5 s
walking], Fire alone looks around (free look), a melee bash [0 hp since Y9S4 in our data] with pushback, suppression
after [5 hits], guard break from blasts of 30 hp or more, melee and stuns, a Sledge swing knocks it down, ×0.9 speed,
off for placing gadgets and on ropes, kept on the back when away (covers the back).

## 9. Ingredients and the rest

- **Fire extinguishers** (Oregon's six markers): shot, knifed or in a blast, they burst into a smoke cloud [5 s] and
  concuss those close by [radius, seconds].
- **Gas pipes**: shot or in a blast, a flame jet [12 s] then an explosion then a ground fire, hurting both teams
  [all numbers]; fire destroys drones and gadgets it touches.
- **Metal detectors** aren't on Oregon; the Gadget Lab has one (an alarm when an attacker walks through).
- **Phones**: an eliminated defender drops one (§7); any damage destroys it.

**As built (M3):** the level's ingredients are gadget-table entries owned by nobody, put there as a room starts, at
each round's prep and by the lab's Clear gadgets (their numbers: data/gadgets.json `ingredients`). Set off, an
extinguisher is `Active` (its cloud) then `Broken` (spent); a gas pipe is `Active` (its jet), then `Active | Hit`
(its blast went off; the fire under it), then `Broken`. A metal detector sounds while any body is in its frame, an EMP
turns it off, a bullet, a knife or a blast destroys it. A stun's flash and an extinguisher's concussion are told only
to the bodies they reach (`stunned`).

## 10. Interaction tests

`game/shared/test/interactions/`: a harness runs a server room on the Gadget Lab level (§11) with both teams, puts
gadgets and bodies where a test says, presses keys or calls the room's actions, and reads the result. Each CSV row
has one registered test named after it (`source > target: result`; UNVERIFIED rows say so and test our
placeholder). A coverage test reads `research/interactions.csv` and fails on a row with no test or a test with no
row; rows a later milestone builds are `it.todo` until then, and the phase is done at zero.

## 11. Wire and client

- **Protocol 15:** the new pawn fields (exact in corrections); a remote field for what's in the hands; gadget ops
  and the table's hash with the snapshot, the whole table on joining; events for blasts, alarms, a Jegeo call and
  hacks. A remote record's aux bits gain "sensor up" and "needled".
- **Client:** a model per gadget (procedural: boxes, cylinders, lights in the team's colour), the item in hand
  (first person and on others), the placing outline and bar, throws, blasts (fx bus), smoke (sprites; the
  Bulletproof Camera sees through), the stun's white-out and ringing, static near jammers and on DSEG'd feeds and
  sights, Pulse's blips, the mirror's two-sided glass, Gu's blur, the hammer and the shield, the Kludge's and the
  tablet's screens, the HUD's counts per slot and detonator prompt.
- **The loadout pick:** the operator select's loadout gets the gadget choice (one of the operator's, or two
  different from the kit), in the match's planning screen and in the labs.
- **The Gadget Lab** (`/labs/gadget_lab.html`, offline and online; PLAN §11): the Destruction Lab's walls with
  dummies of both teams, any operator and loadout, both sides' gadgets, lab rules (refill on demand, reset walls and
  gadgets), a metal detector. Each operator's checks for Ulo run there.

## 12. Milestones

| M | What | Playable after it |
|---|---|---|
| M1 | The framework: gadget data and schemas, the hands and keys, the gadget table with ops and hash (protocol 15), throws, placing, detonators, picking up; the Bulletproof Camera moved onto it; the Gadget Lab; the interactions harness and coverage test | taking out, placing and throwing gadgets |
| M2 | Blasts and the lethal generics: frag, impact grenade, Breach and Hard Breach Charges, Nitro Cell, Claymore | every explosive |
| M3 | The other generics: stun, smoke, Impact EMP (DSEG), barbed wire, deployable shield, proximity alarm, observation blocker; pinging gadgets; ingredients | both generic pools |
| M4 | Sledge; Striker and Sentry; the loadout's gadget pick | first three operators |
| M5 | Thermite; Fuze's Cluster Charge | hard breaching |
| M6 | Mute; Pulse | jammers and heartbeats |
| M7 | Mira | Black Mirrors |
| M8 | Brava | hacking |
| M9 | Dokkaebi | Jegeo and phones |
| M10 | Skopós's remaining rules; Lesion | every ability |
| M11 | The Ballistic Shield | Fuze complete |
| M12 | Every CSV row passing; netsim with gadgets; browser tests; review; docs; report | "Every row in interactions.csv has a passing test" |
