# Project Redmond R3: eight new operators

Ulo asked for eight more operators in roles he named (a remote breacher, an EMP thrower, an electronics scout, a
full-body shield; electrified defences, a shield with a stun prod, a door trapper, a medic). They are our own people:
our names, looks and models. Each keeps the role Ulo asked for, and its device works his way, tweaked from the
operator it's modelled on (D-188: his calls after the first plan, D-187, followed those operators' gadgets too closely).

Each ability is built on Phase 8's framework (gadgets/DESIGN.md): its own gadget file in data/gadgets (an operator item
in slot 2, the Z key), a module in `gadgets/` where it needs one, the hands and the wire as for the other items, the
bots' use (bots/DESIGN.md §7.4), its model and first-person view (render/), and tests.

## 1. The roster

| | Name | Role | Health / speed | Primaries | Secondaries | Generics (one of) | Ability |
|---|---|---|---|---|---|---|---|
| A | **Rivet** | remote breacher | 2 / 2 | `ump45`, `commando_9` | `p229`, `usp40` | `stun`, `claymore`, `breach_charge` | **Stud Driver** |
| A | **Ohm** | EMP | 2 / 2 | `ak_12`, `m870` | `gsh_18`, `pmm` | `frag`, `smoke`, `breach_charge` | **Brownout Pistol** |
| A | **Dowser** | electronics scout | 1 / 3 | `l85a2`, `t_5_smg` | `c75_auto`, `p226_mk_25` | `smoke`, `claymore`, `breach_charge` | **Divining Coil** |
| A | **Hull** | full-body shield | 3 / 1 | the **Hull Plate** | `p229`, `5_7_usg` | `smoke`, `impact_emp`, `hard_breach_charge` | the Hull Plate's brace |
| D | **Shunt** | anti hard breach | 2 / 2 | `mp5k`, `m1014` | `p226_mk_25`, `q_929` | `barbed_wire`, `nitro_cell` | **Arc Packs** |
| D | **Bailiff** | shield and prod | 3 / 1 | the **Bailiff Shield** | `smg_11`, `p229` | `barbed_wire`, `impact_grenade` | the shield's prod, set down |
| D | **Latch** | door trapper | 2 / 2 | `vector_45_acp`, `six12_sd` | `c75_auto`, `smg_12` | `nitro_cell`, `proximity_alarm` | **Snare Latches** |
| D | **Tonic** | medic | 3 / 1 | `ump45`, `m590a1` | `p229`, `usp40` | `bulletproof_camera`, `barbed_wire` | **Second Wind** |

## 2. The abilities

**Ohm: the Brownout Pistol** (Ulo's design; built, §6). A big-slide pistol with seven single-round magazines: Fire
shoots a round, then the magazine's changed in 1.9 s (the 5.7 USG's magazine change: the empty one out of the grip, the
next in). A round flies straight from the eye (judged as a bullet, rewound) and stops at the first wall, floor, prop,
body or shield within 40 m; it bursts just short of it: every defenders' electronic device and body within 1.5 m (a
sphere, through walls and floors) is off and jammed for 10 s. Past its range it's spent. Aimed (ADS) he looks through
its curved sight as through a red dot (no magnification, nothing over the rest of the view): its lens tints what's
behind it blue, and in the lens a blue dot sits on every device of theirs a round could turn off (within its range,
through anything), round a thin blue ring of a reticle. A dot, never the device's outline: outlines are Dowser's.

**Tonic: Second Wind** (the medic's updated version, Ulo's pick). Every operator on Tonic's team wears a patch from the
round's start. His wrist monitor (slot 2, held up like a tablet) lists his teammates and himself with their health; the
wheel moves his pick and Fire sets the picked one's patch off, from anywhere: on a teammate on his feet it heals 45 over
6 s (up to his most); on a downed teammate it stops his bleeding and gets him up 2.5 s later with 25. Only one
teammate's patch at a time: while one is working no other teammate's can start. His own is apart from that: he can set
it off any time, a teammate's working or not, and when he's down the ability key sets it off and gets him up. Five
patches a round in all. Electronic: an EMP on Tonic stops the monitor; one on a patched body stops its patch.

**Bailiff: the Bailiff Shield.** A full-height shield (1.7 m) with a prod at its edge: Fire, shield up, discharges the
prod in a 4 m cone of 15°: an attacker hit takes 4 a hit and is slowed (0.6× speed, no sprint, no vault) for 1.2 s, 3
hits a second while Fire is held, 8 s of charge that refills at 1 s a second after 1 s off it. Shield up: walk only
(0.7× speed). The ability key sets it down (0.6 s) as standing cover where she faces, its viewport and all, and she
draws her sidearm; Interact held 0.8 s picks it up again (a shield set down doesn't prod). An EMP reaching the shield
while she holds it shocks her: she's stunned for 1.5 s (can't move or fire, her view jolts and flashes) and the prod is
off for the EMP's time. Explosions knock its holder back; the prod is electronic.

**Shunt: Arc Packs** (anti hard breach; tricking works). 4 a round, put down on the floor (0.8 s) within 0.4 m of a
reinforced wall section, a barricade, a deployable shield or barbed wire: the pack is live at once, electrifying what it
touches (a reinforced wall: its whole section), sparking and humming while it is. Any attacker device on a live surface
is burnt out within 0.5 s: one placed or stuck on it while it's live, **and one already on it when a pack goes live**
(a Breach or Heavy Breach Charge, a Burn Frame, a Hailstone Drill, Rivet's studs, a claymore against it). So a defender
can pull the pack (Interact held 0.5 s), let the wall go quiet, and put the pack back once the attacker's charge is on
it. A device already set off (burning, drilling) isn't stopped. A body touching it with the knife or a shove takes 10
and is pushed back; a drone touching it is jammed for 2 s. Electronic (an EMP turns it off for its seconds), 25 hp.

**Latch: Snare Latches** (a trapper that does damage). 4 a round. Placed on a door's or window's frame (1.2 s, either
side), it arms after 1.5 s and stretches a thin wire across the opening at shin height (a window's: along its sill);
the first attacker body through it springs it: the latch snaps shut on his leg, 35 at once and then 5 a second (no
sprint, 0.7× speed) until he pulls it off (Interact held 1.5 s) or goes down; the snap is loud. Drones pass under it.
Mechanical: no EMP stops it and neither Ohm's scope nor Dowser's coil shows it; one bullet into the latch breaks it.
Picked up again before it's sprung.

**Rivet: the Stud Driver** (hard breaches in three shapes, Ulo's design). A compact launcher (slot 2). Fire lays a
salvo of explosive studs on the surface the aim meets, out to 25 m, in the pattern chosen with the reload key while it's
out: **Ring** (a circle), **Spine** (a vertical line) or **Cross** (an X). Up to 3 salvos a round wait on their
surfaces; the detonator sets them all off together, and each cuts its shape through every layer (soft or reinforced; a
hatch goes whole): the Ring a round hole 1.0 m across, the Spine a slot 0.7 m wide and 1.9 m tall, the Cross a hole 1.2 m
across along its two arms. Every shape is a hole a body vaults (or walks) through: a salvo is laid with its bottom edge
low enough for that. A remote device: a Damper in reach (or an EMP on Rivet) stops the set-off; a live Arc Pack burns
out a salvo on its surface; one bullet into a salvo destroys it.

**Dowser: the Divining Coil.** A hold item: out of slot 2 and up, it shows the other side's electronic devices
(gadgets marked `electronic`, the level's cameras, Arc Packs, Dampers, drones) within 18 m in a 100° fan, through
anything, as outlines only Dowser sees; a ping while it's up marks the device nearest his crosshair (within 20°) for his
team. No weapon while it's up; walking speed unchanged. An EMP on him empties it.

**Hull: the Hull Plate.** A primary shield taller (1.55 m) and wider (0.70 m) than the Ballistic Shield, with the sidearm
alongside it unbraced (fire from the hip only). The ability key braces it: over 0.4 s two side wings and a top flap fold
out and the plate covers a standing body front edge to edge, head to feet (the viewport stays); braced: walk only (0.55×
speed), no sprint, no weapon, the knife becomes a shove. Unbracing takes 0.3 s. Every explosive's blast on its front
side is stopped by it (the body behind takes the blast's behind-a-wall fraction).

## 3. Interactions (each gets a test)

- Ohm's rounds turn off Arc Packs, Dampers, the level's cameras, Armoured Cameras and the Bailiff Shield's prod (and
  shock Bailiff if she's holding it) in reach; Rivet's salvos, Latch's snares and the attackers' own devices aren't
  touched. His scope dots exactly those an EMP would reach.
- Arc Packs burn out Breach and Heavy Breach Charges, Burn Frames, Hailstone Drills and Rivet's salvos on their surface,
  placed before or after the pack goes live; not one already set off.
- Dampers jam Rivet's set-off within reach (a salvo in reach doesn't go; the others do).
- Dowser's coil shows Arc Packs, Dampers, the level's cameras, Armoured Cameras and Twain's idle frame; not Latch's snares.
- Latch's snare ignores drones; Hull braced springs it.
- Tonic's patch on a downed teammate being revived by hand gets him up at the sooner of the two.

## 4. Looks (data/presentation/operator_looks.json)

Rivet: slate overalls, an orange hood up under a welder's flip-up visor, tool pouches. Ohm (built): dark blue work jacket
with copper trim, a grey wool beanie, a battery pack on the back. Dowser: field green, a wide-brimmed hat, a slim pack
with an aerial. Hull: heavy grey plate carrier and helmet with a face guard. Shunt: yellow-black hi-vis tabard over
navy, an electrician's cap. Bailiff: black with white piping, a peaked helmet. Latch: rust brown, a balaclava and
goggles. Tonic: white and teal, a soft cap, a sling bag with a teal plus of our own (not a red cross).

## 5. Milestones

| | What | Done when |
|---|---|---|
| R3 M5 | Ohm's Brownout Pistol | ✅ fire and reload, the burst, the scope's dots; bots shoot the devices behind a hard breach |
| R3 M2 | Tonic's Second Wind | ✅ heal over time, revive, one at a time, his own apart, down and up; bots patch the hurt and the downed |
| R3 M4 | Shunt's Arc Packs | electrifying, burning out before and after, tricking, the shock, EMP; bots on the plan's walls |
| R3 M3 | Latch's Snare Latches | placing, arming, the snare, the pull, drones under; bots trap the site's doors |
| R3 M8 | Bailiff's shield; Hull's plate | the prod's stun and slow, setting it down, the EMP shock; braced cover, blasts stopped; bots carry them |
| R3 M7 | Rivet's Stud Driver | three shapes, vaultable holes through steel, Dampers and packs; bots breach with it |
| R3 M6 | Dowser's Divining Coil | the fan, the outlines, the ping; bots ping devices for their team |
| R3 M9 | Models, first person, HUD for all eight; the interactions (§3); soak; browser tests; review; docs | every check green |

## 6. As built

| | Operator | Done | Notes |
|---|---|---|---|
| R3 M5 | **Ohm** | ✅ | data/operators/ohm.json, data/gadgets/brownout_pistol.json (`use.kind: "shoot"`: `reloadS`, `rangeM`; its `emp`). The hands (gadgets/hands.ts): Fire shoots (a `gshot` event), `GadgetAct.Shoot` while the magazine's changed, put away after the last. The room judges a round as a bullet that goes into no wall (net/room.ts `judgeGadgetShot`, tracePellets with no penetration) and sets its EMP off there (`dseg`); everyone gets a `gshot` event (the streak, the burst). Offline the page stops it at the level (electronics.ts `roundStop`). In first person it's a gun (Ulo's fixes): the gun kit's big-slide pistol, variant `ohm` (coil shroud, emitter) with the curved `emp` sight whose lens is see-through blue (render/gunKit.ts; gun_kit.json `brownout_pistol`), posed by the guns' own code (viewmodel.ts `poseGadgetGun`, `placeGun`): aimed over a pistol's 0.24 s, kicked by a round, the magazine changed by the left hand over the reload. What the sight shows: electronics.ts `empTargets`, the page's dots and ring clipped to the lens (lab.ts `updateOhmScope`, viewmodel.ts `lensScreen`). Bots: the attack planner's job for an Ohm bot, its rounds at what the scope marks behind the first hard breach wall (bots/use.ts `shotMarks`). Look: `battery` on the back (render/bodyModel.ts); the pistol's model in render/gadgetShapes.ts. Tests: test/ohm.test.ts. (The first build's Brownout Pucks, e46a18e, are gone.) |
| R3 M2 | **Tonic** | ✅ | data/operators/tonic.json, data/gadgets/second_wind.json (a `hold` item with `patch`: heal 45 over 6 s, up after 2.5 s with 25; 5 a round). The patch works in the body's own step (gadgets/patch.ts; PawnState `healLeft`, `healTicks`, `patchTicks`), so the patched player's client predicts it after one correction; down, a patch stops the bleeding (player/movement.ts) and gets the body up as a revive does. The room (net/room.ts `patches`): Fire with the monitor up sets off the pick (the tablet's pick message, `{ kind: "patch" }`) or Auto (`autoPatch`: a downed teammate nearest to bleeding out, the most hurt by share, himself); one teammate's at a time, his own apart; down, his ability key; an EMP on him stops the monitor, one on a patched body stops its patch (`dseg`); twice a second his client hears his team (`vitals` event). The page: his monitor's list on the tablet's panel, the wheel moving his pick (lab.ts `monitorList`); a patched player's health bar turns teal. Bots: a reaction (his monitor up and Fire on Auto) when a teammate's down or badly hurt, or he is; down, the ability key (bots/bot.ts). Look: white and teal, a cap, a sling bag with a teal plus (`medbag`). Tests: test/tonic.test.ts. |
