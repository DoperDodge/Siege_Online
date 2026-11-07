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
| 1 / 2 | Back to a weapon. (The other weapon's key is sent as Swap; the key of the weapon already out as the gadget's slot key and Swap together, so a detonator in hand is put away rather than swapped for the next charge: the review, M12.) |

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
| **Thermite** | 3 Exothermic Charges, [3 s] to place on any destructible surface, reinforced included, not hard walls or the mirror's glass; one at a time (Ulo: placed, then its detonator; no second until it's set off); detonator; [3 s] burn with sparks on both sides; a large hole through steel; a reinforced hatch whole; adjacent surfaces within [the radius] cut; 220 hp on the far side. |
| **Fuze** | 4 Cluster Charges, [2 s] to place, one at a time (Ulo: placed, then its detonator; no second until it's set off); soft surfaces at once, reinforced ones, the mirror and a deployable shield after 1.75 s (its tube can be shot then); [5] sub-grenades in a fan from left to right on the far side, each [4.2 m, lethal within 1.2 m]; at least one always comes out. The Ballistic Shield (§8). |
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
whatever the friendly fire rules (a drone is a gadget to it). **Changed (Ulo, D-150):** Thermite's and Fuze's charges
both go one at a time (`maxOut` 1) and nothing is set off by placing: with one waiting, Z gives only its detonator (or
puts it away) until it's set off or lost, so the order is always place, then detonator.

**As built (M6, Mute and Pulse, D-146):** Mute's Signal Disruptor is a placed operator item (on the floor, 3 s,
picked up again, fragile, electronic) with a `jammer` (`gadgets/jammers.ts`): while it stands and no EMP has it, it
jams the other side within 2.6 m, a sphere. Jamming is computed from the table and the pawns' states, so the
simulation predicts it: the detonator (`canDetonate`, the server's `detonatable` filter) skips a device inside one
and does nothing while its owner's body is inside one (by the body's nearest hitbox point); a drone inside one gets
no input from its driver (`MoveContext.droneJammed`), and its feed shows static there, a lighter static out to 4.875 m.
Fuses, tripwires, grenades, sights and the jammer's own side don't mind it, nor a device already set off. A
reinforced wall section's bar crushes what stands at its foot (within 0.35 m of a face, its box's centre under 0.4 m
up). Pulse's Cardiac Sensor is a `hold` item (`sensor`, `gadgets/sensor.ts`): out of slot 2 and ready, it lists the
other side's living bodies (downed too) within 10.5 m of his eye through anything, within a 120° fan of his facing;
an EMP on him empties it (his HUD keeps the last blips, frozen). Only his client draws them; a ping while it's up
marks the heartbeat nearest his crosshair (within 20°) for his team (a ping event with `heart`).

**As built (M7, Mira, D-147):** the Black Mirror (`mirror`, `gadgets/mirror.ts`) is placed (`reinforceable`) on a
reinforceable wall, from its steel's side if it's reinforced, at her head height over the floor on her side (standing
1.5 m, crouched 1.0 m; never prone), its entry in the middle of the wall's thickness facing her. Placed, it burns its
window (1.0 × 0.35 m) out of every layer, steel too (the room applies the cut), and the server adds its canister, a
fragile entry of its own on her side under the glass. The glass is a solid (a collider from the table, as the
deployable shield's), so bullets, blasts, bodies, sight and throws stop at it both ways; `sightPast` (scans, pings)
sees through it from her side while it's whole; a client draws it clear from her side and black from the other (two
one-sided sheets). Blasts don't touch the glass; a knife or Sledge's hammer shatters it (`GFlag.Hit`: opaque both
ways, still bulletproof); Fuze's Cluster Charge drills it as it drills a shield. The canister destroyed (any damage,
either team), the mirror is ejecting (`GFlag.Active`) and 4 s later ejected (`GFlag.Broken`: no glass, no collider,
an open hole in its frame). After any panel op on its wall the server checks the band 0.1 m wide round its window:
more than a fifth gone through every layer, the mirror falls, its canister with it. A wall with a mirror in it can't be
reinforced.

**As built (M8, Brava, D-148):** a Kludge drone is a drone pawn marked `kludge` (the roster lists them; it moves and
collides as a drone, drawn bigger and green); Brava's body carries `count` (2) besides her drones, from the action
phase, and Z throws one as the drone key throws a drone (her slot 2 item has a `drone` use: never in her hands). The
room runs a hack (`hacks`, `gadgets/hack.ts`) while she drives one and holds Fire: it starts on the other side's device
nearest her crosshair within 8° and 10 m that she can see (smoke and observation blockers hide; a blocker isn't hidden
by its own screen), not while the Kludge is jammed or EMP'd or has no hacks left (3); it runs 3 s while Fire is held
and the Kludge stays within range (it needn't see the device); then one hack is spent. Each gadget's data says what a
hack does (`hack`): `convert` flips its entry's team (Bulletproof Cameras, alarms, blockers, jammers: their rules all
go by team, so a converted jammer jams the defenders), `destroy` disables it at once and destroys it 2 s later without
its blast (a Nitro Cell); a default camera's bit goes in `matchRules.camsHacked` (sent with the match state); Skopós's
idle shell overheats, destroyed 8 s later unless she wakes it. Cameras now belong to a team (`camTeam`): defenders
watch theirs, attackers the ones they hacked (Observe with no drone out, or a lean past the end of their drone feeds),
and nobody fires a hacked camera's dart. A camera inside a jammer of the other side than its own has no feed, and a
jammer of the other side by either of Skopós's shells stops her swap.

**As built (M9, Dokkaebi, D-149):** her tablet is her slot 2 item (`jegeo`, a `hold` use as Pulse's sensor: no
shooting with it up); the room runs her charges (1 at the start, +1 every 25 s up to 5) and her uploads (`jegeo` in
net/room.ts). With it up and her view her own (on a camera or a drone Fire scans), Fire calls the spotted defender
nearest her crosshair within 25°, through anything: spotted by a scan or by a ping that meets him (the red ping, new
here), alive, not Skopós's idle shell, his phone whole, not called in the last 14 s, not inside a jammer of his side.
That spends a charge and his phone rings (an event). The upload runs 7 s over a constant connection that follows the
player (Skopós's swap keeps it): her tablet put away or her view on a feed, her going down, a jammer or an EMP (an
Impact EMP, a dart) on either of them, or his dismissal (Interact held 1.5 s) cut it, nothing done, his 14 s started.
Done: 40 explosive damage to him credited to her, a fire where he stood (5 s, 1.5 m, 5 every 0.5 s to anyone in it,
nobody's), and his controller's `phoneLost` (in its state) closes his cameras, and Skopós's shell camera and swap, for
the round; his jammers, sensor, mirrors and Nitro Cell aren't phone-run. An eliminated defender drops his phone
(Skopós's circuit board is the same), an entry (`dropped_phone`, `dropped`: never carried) on the floor where he fell
that any damage destroys. With no live target Fire hacks the oldest phone not yet hacked, from anywhere and through
jammers, each once, 2 a round: `matchRules.camsLent` (sent with the match state) gives the attackers the defenders'
cameras for 20 s, to watch only (no dart), and the defenders' observation blockers hide from them there as from
their drones. Fixed with it: a placing under way waits through a tick the server steps without its player's input (a
stall past the hold budget), as a panel hold does; it used to start again, so a 5 s mirror could never go in on a
connection (or a CI browser) that stalls every few seconds.

**As built (M10, Lesion and Skopós, D-151):** Lesion's Gu mine is his slot 2 item, thrown like a grenade (`settle`),
mechanical and fragile; it comes back over time (`regen`: 1 at a life's start, one more every 25 s, until `count` 8
have been given; `PawnState.regenMade` and `regenTicks`, predicted). At rest, an enemy body within 1 m of it (a downed
one too) sets it off (`GadgetServer.sting`, the server's): it's gone, and every enemy body within that metre and not
down is needled (`PawnState.needled`, its owner corrected): 3 damage, then 12 every 2 s (`bites`, credited to Lesion)
until he pulls it or goes down; a second needle deals its hit and a bite at once and restarts the timer. Needled, a
body can't sprint (predicted), plant or drop the defuser; Interact held 2 s standing pulls it (`DeployKind.Needle`, a
hold that lowers the weapon but lets him walk, before every other Interact action). A knife or the hammer on a mine
sets it off; a bullet or a blast destroys it; reinforcing over it crushes it; drones never set one off. Skopós's idle
shell gets a barrier (`shell_shield`, `dropped`, a solid, electronic) the room keeps in front of every living shell she
isn't in (`shellShields`: it goes up as she leaves a shell and comes down as she wakes it or it dies, and follows a
shell that's moved). Bullets stop at it; a blast or the hammer breaks it (`GFlag.Broken`: no collider) and a blast's
line goes through it to the shell (`Sim.blastMeets`); reinforcing beside it doesn't crush it. Its entry is the idle
shell's camera, after the Bulletproof Cameras in the defenders' list (`shellCams`, `shellCamAt`): the lens just in
front of the barrier at the crouched shell's eyes, the default camera's limits, off while an EMP has it; every client
lists it from the table (who's in which shell is each player's own), the defence watches it, and so do the attackers
on a hacked phone's lend (Skopós herself goes round to the shell's own view instead, from which she swaps: her list
leaves her barrier's camera out, D-155, intel/DESIGN.md §5). Her knife (`combat.meleeHole: large`) uses `destruction.meleeLarge`: a 0.6 m hole through
the studs, a barricade in one hit, a hatch in one. The idle shell starts beside her at the site's defender spawn.
Reshaped after Ulo's test (D-153): the barrier curved round the crouched shell (data `arc`: seven segments, 220° round
its front and sides). Held-up items (Pulse's sensor, Dokkaebi's tablet) come up to the face like a scope as they're
taken out. **The game's model (D-157, from its renders), replacing that wrap:** the barrier is built of box `parts`
(data, placed from its entry at the shell's centre: across, up from its bottom, forward; each turned `yawDeg` and
leaning back `pitchDeg`; gadgets/hits.ts `partBoxes` gives the same boxes to its colliders, ray tests and model): a
flat front of armour (two columns, two rows of panels, yellow seam stripes) with wings angled back 40°, up to the
crouched shell's chest; a canopy of tinted bulletproof glass at its head, the front pane leaning back 22°, a pane over
each wing and a roof over the head; sides and back open. Every part stops bullets, bodies and throws (the glass too:
drawn see-through); blasts and the hammer break the whole barrier. Its camera's lens is the data's `lensM` (the
crouched shell's eyes, just out past the glass). Skopós's own shells move through her own barriers (`MoveContext.passes`):
a shell she wakes stands up under its canopy, and one moved by a lab tool stands for a moment, which with the barrier
following it pushed it away for good.

## 8. The Ballistic Shield (Fuze)

The shield as a primary (data/weapons/ballistic_shield.json, research/weapons_notes.md §5): a shield hit shape in
front of the body (head and chest; legs exposed standing), no hip fire, ADS tilts it and fires the secondary [0.5 s
walking], Fire alone looks around (free look), a melee bash [0 hp since Y9S4 in our data] that knocks its target
down (D-156), suppression after [5 hits], guard break from blasts of 30 hp or more, melee and stuns, a Sledge swing
knocks him down (D-156), ×0.9 speed, off for placing gadgets and on ropes, kept on the back when away (covers the
back).

**From Ulo's reference renders (D-169; its shape and hold supersede D-157's, below):** a narrower top part (0.41 m
across, 0.37 m deep, `topWidthM`, `shoulderM`) round a 0.33 × 0.18 m viewport at eye height (its top `aboveEyeM` 0.21 m
over the eyes), stepping out at rounded shoulders to a 0.62 m body (`widthM`), every corner rounded (`cornerM` 5 cm),
flat across its middle and curving back round his sides (player/hitboxes.ts plateBend: its edges `curveM` 6 cm nearer),
two bolts low down. Held close (`frontM` 0.30 m), his hands crossed on its grips behind it (poseHitboxes' `hold`: the
arms end just behind the plate, in the hitboxes and the drawn body). Aiming swings it aside to his left (`ads`: 0.30 m
across, turned 22° back round his side about its middle, 0.10 m lower, eased over the aim) and his right hand comes out
with the pistol; leaning turns it whole by the spine's angle and carries it across so its window stays in front of the
eyes; crouched it's held `crouchRaiseM` higher and his shoulders hunch behind its top part. The outer two capsules end
at its shoulders.

**The game's model and the knockdown (D-156, D-157):** the plate is now the game's as its renders show it: rigid,
0.58 × 1.1 m (`heightM`), all but flat (`curveM` 0.02), its top corners cut (`chamferM`: the edge capsules stop short),
0.45 m ahead (in front of the hands), its top 0.13 m over the eyes: head and torso covered, the legs out under it
standing; aiming slides it down by up to 0.38 m, but never through the floor (crouched it rests on it and he aims over
its top). Drawn (client/src/render/shieldModel.ts) green with a dark rim, a viewport across its upper part at eye
level in a frame standing out of the plate, bolts across the handle mount and a dark inside. His bash on a body on its
feet knocks it down (`Sim.knockDown`, `PawnMode.Knocked`: shoved `knockdown.pushM` back onto its back, lying, up again;
no input meanwhile; player/movement.ts stepKnocked; its pose tipped back about its feet, player/hitboxes.ts knockTip);
on a raised plate it's still a guard break. Sledge's hammer on a raised plate knocks Fuze himself down; off his feet
(a rope, a ladder) it only knocks the shield aside. Knocked down, he has no shield up until he's up.

**Reworked after Ulo's test (D-153; its shape since superseded by D-157, above):** the plate was 0.75 m wide and curved round him (its edges 0.1 m nearer than its
middle, 0.42 m ahead), from 0.3 m up (0.05 m crouched) to 0.15 m over the eyes: seven capsules along the curve
(`shieldFrame`). It bends with the spine when he leans, as the upper body does. Aiming slides it down over the aim
time (`adsQ`; 0.37 m when fully aimed, its bottom stopping at the floor) instead of jumping; how far it has slid goes
to others in the remote record (flags bits 11–13, only with the shield up), so the rewind and every client agree. It
is drawn as a solid curved plate with a small window of bulletproof glass at eye height (client/src/render/
shieldModel.ts), the same mesh in his own first person, where he sees the world through the window; his pistol stays
behind it until it has slid far enough to aim over. Free look is the client's: Fire held with it up and not aiming
turns the view and not the body (the input keeps the body's facing, without Fire), and letting go turns the view
back. Prone, the plate on his back has no hitboxes. (The text below is M11's first build; where they differ, this
paragraph holds.)

**As built (M11, D-152; player/shield.ts):** the shield is a pickable primary (`ResolvedLoadout.shield`); its loadout
holds Fuze's secondary pistol in both slots (Swap does nothing), aimed in `pistolAdsS` (0.5 s walking, 0.55 s from a
sprint). Where its plate is, `PawnState.shieldAt`, is set at the end of every step from the state, so it's predicted
and replayed like the stance: up in front with the pistol in hand; on the back while a gadget or a detonator is out,
during a hold (a plant; a Gu needle pulled: Y5S1.1's rule that the shield comes off for that), on a rope or a ladder,
or prone; nowhere while knocked aside (`guard` ticks), down or dead. Others get it in the remote record (flags bits
9–10), so the lag-compensated history and every client have it where it was. Its hitboxes (`shieldHitboxes`, part
`shield`) are six vertical capsules across a 0.6 m plate 0.38 m ahead of the body, from 0.55 m up standing (0.15 m
crouched: the shins show standing) to 0.12 m over the eyes, or 0.2 m under them while aiming (the head shows); on the
back, hips to shoulders. A pellet stops at the first plate capsule it meets (no damage, nothing past it) and counts
toward its carrier's suppression (`suppress`: 5 hits suppress him, 20 at most, gone after 7 s without one; the server
counts, the client predicts the rest): no sprinting, the view's edges blurred. With it up the pistol fires only once
fully aimed (no hip fire), and he moves at ×0.9. A blast in front of a raised plate loses 66% (Y9S1.3); one of 30 hp
or more knocks it aside (`guard` for 1 s, ours), from either side; so do a knife on the raised plate (no damage) and
any stun that reaches him (blinded or ringing; an extinguisher's concussion too). A knife on a plate on his back just
stops there. Sledge's hammer on the plate knocks it down for 2.5 s (ours), him unhurt (Y10S2). His melee with it up is
a bash: no damage (Y9S4), the body it meets pushed straight back (6 m/s, ours) and its own shield knocked aside; with
no body in reach it's the knife (a barricade still takes 3). Sprinting with it up into a barricade worn below its hit
points breaks through; a fresh one stops him (Y11S1). A teammate's blow (a knife, the bash, the hammer) does nothing
with friendly fire off, as its damage wouldn't; blasts and stuns knock a shield aside whoever's they are. Left out:
free look (Fire alone does nothing), the cracked viewport, throwing or setting charges off from behind the shield (a
gadget or a detonator in hand puts it on his back), and the knockdown's fall (only the shield goes down).

## 9. Ingredients and the rest

- **Fire extinguishers** (Oregon's six markers): shot, knifed or in a blast, they burst into a smoke cloud [5 s] and
  concuss those close by [radius, seconds].
- **Gas pipes**: shot or in a blast, a flame jet [12 s] then an explosion then a ground fire, hurting both teams
  [all numbers]; fire destroys drones and gadgets it touches. Upright from the floor (Ulo's test, D-153): a 3 m box
  from the floor up, drawn to the ceiling, its entry 1.2 m up it where the jet comes out and the blast goes off.
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

**As built (M12):** zero todos: all 343 rows pass (`interactions/built.ts`, `m2.ts` … `m12.ts`). The last eleven were
Phase 7's observation tools seen through the CSV (the dart fired from a Bulletproof Camera with the gadget key, as a
player does; scans from a drone, the level's camera and a Bulletproof Camera; a bullet or a knife on a drone or the
level's camera). A lab room breaks the level's cameras on a shot only when a test turns its cameras on, as it already
turned them off for an EMP. The network check is the netsim's `--gadgets` run (tools/netsim): on the Gadget Lab, the
attackers' line (Sledge, Thermite, Fuze, Dokkaebi, Brava) faces the defenders' (Mute, Pulse, Lesion, Mira, Skopós), and
every few seconds each bot takes out its gadget or ability, holds Fire 2.5 s and presses it again, over 100 ms round
trip with jitter, stalls and drift; once the last snapshot has reached everyone, every client's gadget table must hash
as the server's, with no desync. Its 20 s run is a unit test.

**The review (M12, D-154)** changed these rules: every hammer blow goes to the room (the simulation charges the
level, panels and gadgets it meets, the room charges a body two charges in all and a drone or a shield's plate one,
from its rewound judgment); reinforcing crushes only that section's entries and the devices at its foot, not grenades
or clouds; Skopós's gadgets are one pool, in the shell she's in, moving with her on a swap; while Dokkaebi's call rings
on a player (`PawnState.ringing`, the server's, corrected) a fresh Interact press is the dismissal's alone; a
controller keeps the gadget entry of the camera it watches (`camEntry`), so its view stays on that camera as the
list's numbers shift; a teammate's bullets don't suppress Fuze with friendly fire off; the key of the weapon already
out, with a gadget in hand, is sent as the slot's key and Swap together, which the hands read as "put it away".

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
