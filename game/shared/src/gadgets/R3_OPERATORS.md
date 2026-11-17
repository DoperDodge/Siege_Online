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

**Bailiff: the Bailiff Shield** (built, §6; Ulo's fixes after his test). A full-height shield held with her sidearm, as
Fuze's is (the sidearm fires aimed only): from the floor to over her head, wide, wrapping back round her sides and bent
back over her at its top, so none of her shows past it, feet included. A prod at its edge: shield up and not aimed, a
click of Fire switches it on (another click, aiming, or its charge running out switch it off): on, it jolts the
nearest attacker within 4 m and 10° of her view (in sight) every third of a second: 4 a jolt, and slowed (0.6× speed,
no sprint, no vault) for 1.2 s; 8 s of charge that refills a second a second once it's been off a second. Shield up:
0.7× speed. Her ability key takes out its set-down; Fire held 0.6 s puts the shield down on the floor where she faces as
standing cover (solid, its viewport and all), and she has her sidearm alone; Interact held picks it up again. Set down,
her ability key switches the shield's own shock on and off: on, it jolts the nearest attacker in front of it (4 m,
35° either side) the same way, on a charge of its own; an EMP switches it off. An EMP reaching her while she holds the
shield up shocks her: 1.5 s she can't move or use her hands (her view flashes), and the prod's off for the EMP's time.

**Shunt: Arc Packs** (anti hard breach; tricking works; built, §6). 4 a round, put down on the floor (0.8 s) within 0.4
m of a reinforced wall section or a standing barricade (aimed at the floor up to a metre short of one, it goes against
its foot, its prongs in): the pack is live at once, electrifying it (a reinforced wall:
its whole section) and any deployable shield or barbed wire of his side's in its reach, flickering and crackling on
both sides while it is. Any attacker device on a live surface can't be set off by its detonator and is burnt out 0.5 s
after it's first found there: one placed on it while it's live, **and one already on it when a pack goes live** (a
Breach or Heavy Breach Charge, a Burn Frame, a Hailstone Drill, Rivet's salvos). So a defender can pull the pack
(Interact held, as any device is taken back), let the wall go quiet, and put the pack back once the attacker's charge is
on it, before he sets it off. A device already set off (burning, drilling) isn't stopped. An attacker's knife (or a
shove) on a live surface takes 10 and throws him back, and does nothing to it; an attacker's drone by a pack is jammed
for 2 s. Electronic (an EMP turns it off for its seconds); one bullet destroys it.

**Latch: Snare Latches** (a trapper that does damage; built, §6). 4 a round. Placed on a door's or window's frame
(1.2 s, either side: aimed anywhere at the opening, it goes on the jamb nearer the aim), it arms after 1.5 s and
stretches a thin wire across the opening at shin height (a window's: along its sill); the first attacker on his feet
through it springs it: the latch snaps shut on his leg, 35 at once and then 5 a second (no sprint, 0.7× speed) until he
pulls it off (Interact held 1.5 s, standing still) or goes down; the snap is loud (the defenders see where he is for 3
s). Drones pass under it; defenders walk through it. Mechanical: no EMP stops it and neither Ohm's scope nor Dowser's
coil shows it; one bullet into the latch breaks it. Picked up again before it's sprung.

**Rivet: the Stud Driver** (hard breaches in three shapes, Ulo's design; built, §6). A compact launcher with a drum
(slot 2). Fire lays a salvo of explosive studs on the breakable surface the aim meets (a wall, a floor, a hatch; soft or
reinforced) out to 25 m, the next 0.7 s later, in the pattern the reload key picks while it's out: **Ring** (a circle),
**Spine** (a vertical line) or **Cross** (an X). Each cuts its shape through every layer, steel too (a hatch goes
whole): the Ring a round hole 1.4 m across, the Spine a slot 0.8 m wide and 2 m tall, the Cross two arms 0.6 m wide
corner to corner of a 1.5 m square over a round middle 1.2 m across. **Every shape is a hole a body gets through**: on
a wall a salvo goes where the aim meets it across the wall, at the height that puts its hole's bottom a ledge over the
floor whatever height he aims at: the Ring's and the Cross's 0.45 m (a body vaults through, a little off the middle too:
the Cross's round middle is there for that), the Spine's at the floor (a body walks through). Up to 3 salvos a round,
all of them waiting at once; with the driver out and one waiting, the ability key gives the detonator, which sets off
every one together. Mechanical studs and a wireless detonator: a Damper in reach of a salvo keeps that one from going
(it waits), an EMP on Rivet stops the press; a live Arc Pack burns out a salvo on its surface; a bullet into one of its
studs destroys it (its middle is empty).

**Dowser: the Divining Coil** (built, §6). A hold item: out of slot 2 and up (a flat brass search coil on a short
handle, held out ahead), it shows the other side's electronic devices (their gadgets marked `electronic`: Arc Packs,
Dampers, armoured cameras, alarms, Nitro Cells...; the level's cameras; drones; Twain's idle frame) within 18 m in a 100°
fan, through anything, as amber outlines only Dowser sees; never a mechanical one (Latch's snares, barbed wire). A ping
while it's up marks the device nearest his crosshair (within 20°) for his team. No weapon while it's up; walking speed
unchanged. An EMP on him empties it.

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

Rivet (built): slate overalls, an orange hood under a dark visor, a drum of spare studs and a tool pouch on his back. Ohm (built): dark blue work jacket
with copper trim, a grey wool beanie, a battery pack on the back. Dowser (built): field green, a wide-brimmed hat, a slim pack
with a whip aerial. Hull: heavy grey plate carrier and helmet with a face guard. Shunt: yellow-black hi-vis tabard over
navy, an electrician's cap. Bailiff: black with white piping, a peaked helmet. Latch: rust brown, a balaclava and
goggles. Tonic: white and teal, a soft cap, a sling bag with a teal plus of our own (not a red cross).

## 5. Milestones

| | What | Done when |
|---|---|---|
| R3 M5 | Ohm's Brownout Pistol | ✅ fire and reload, the burst, the scope's dots; bots shoot the devices behind a hard breach |
| R3 M2 | Tonic's Second Wind | ✅ heal over time, revive, one at a time, his own apart, down and up; bots patch the hurt and the downed |
| R3 M4 | Shunt's Arc Packs | ✅ electrifying, burning out before and after, tricking, the shock, EMP; bots on the plan's walls |
| R3 M3 | Latch's Snare Latches | ✅ placing, arming, the snare, the pull, drones under; bots trap the site's doors |
| R3 M8 | Bailiff's shield; Hull's plate | ✅ (Bailiff) the prod's stun and slow, setting it down, the EMP shock; braced cover, blasts stopped; bots carry them |
| R3 M7 | Rivet's Stud Driver | ✅ three shapes, holes a body gets through, through steel, Dampers and packs; bots breach with it |
| R3 M6 | Dowser's Divining Coil | ✅ the fan, the outlines, the ping; bots ping devices for their team |
| R3 M9 | Models, first person, HUD for all eight; the interactions (§3); soak; browser tests; review; docs | every check green |

## 6. As built

| | Operator | Done | Notes |
|---|---|---|---|
| R3 M5 | **Ohm** | ✅ | data/operators/ohm.json, data/gadgets/brownout_pistol.json (`use.kind: "shoot"`: `reloadS`, `rangeM`; its `emp`). The hands (gadgets/hands.ts): Fire shoots (a `gshot` event), `GadgetAct.Shoot` while the magazine's changed, put away after the last. The room judges a round as a bullet that goes into no wall (net/room.ts `judgeGadgetShot`, tracePellets with no penetration) and sets its EMP off there (`dseg`); everyone gets a `gshot` event (the streak, the burst). Offline the page stops it at the level (electronics.ts `roundStop`). In first person it's a gun (Ulo's fixes): the gun kit's big-slide pistol, variant `ohm` (coil shroud, emitter) with the curved `emp` sight whose lens is see-through blue (render/gunKit.ts; gun_kit.json `brownout_pistol`), posed by the guns' own code (viewmodel.ts `poseGadgetGun`, `placeGun`): aimed over a pistol's 0.24 s, kicked by a round, the magazine changed by the left hand over the reload. What the sight shows: electronics.ts `empTargets`, the page's dots and ring clipped to the lens (lab.ts `updateOhmScope`, viewmodel.ts `lensScreen`). Bots: the attack planner's job for an Ohm bot, its rounds at what the scope marks behind the first hard breach wall (bots/use.ts `shotMarks`). Look: `battery` on the back (render/bodyModel.ts); the pistol's model in render/gadgetShapes.ts. Tests: test/ohm.test.ts. (The first build's Brownout Pucks, e46a18e, are gone.) |
| R3 M2 | **Tonic** | ✅ | data/operators/tonic.json, data/gadgets/second_wind.json (a `hold` item with `patch`: heal 45 over 6 s, up after 2.5 s with 25; 5 a round). The patch works in the body's own step (gadgets/patch.ts; PawnState `healLeft`, `healTicks`, `patchTicks`), so the patched player's client predicts it after one correction; down, a patch stops the bleeding (player/movement.ts) and gets the body up as a revive does. The room (net/room.ts `patches`): Fire with the monitor up sets off the pick (the tablet's pick message, `{ kind: "patch" }`) or Auto (`autoPatch`: a downed teammate nearest to bleeding out, the most hurt by share, himself); one teammate's at a time, his own apart; down, his ability key; an EMP on him stops the monitor, one on a patched body stops its patch (`dseg`); twice a second his client hears his team (`vitals` event). The page: his monitor's list on the tablet's panel, the wheel moving his pick (lab.ts `monitorList`); a patched player's health bar turns teal. Bots: a reaction (his monitor up and Fire on Auto) when a teammate's down or badly hurt, or he is; down, the ability key (bots/bot.ts). Look: white and teal, a cap, a sling bag with a teal plus (`medbag`). Tests: test/tonic.test.ts. |
| R3 M4 | **Shunt** | ✅ | data/operators/shunt.json, data/gadgets/arc_pack.json (a floor-placed item with `arc`: `reachM` 0.4, `snapM` 1.0, `burnS` 0.5, `shock` 10, `pushMps` 6, `droneJamS` 2; 4 a round; picked up as any device is). Placed on the floor within `snapM` (1 m) of such a face, it goes against its foot facing it (gadgets/arcs.ts `packSnap`, called by gadgets/place.ts: the same for the placer's prediction and the server), unless something's in the way along the floor. What a pack makes live is worked out from the table and the panels alone (gadgets/arcs.ts `liveSurfaces`: a pack on the floor, not off, not broken; the panels whose face is within reach of it, reinforced walls and standing barricades; its side's wire and shields), so the server and every client agree with nothing new on the wire. The server (gadgets/serve.ts `arcs`) times each attacker device it finds on a live surface from the tick it's first found (placed there while live, or there already when a pack went live: tricking) and burns it out `burnS` later (an `emp` event at it for everyone), unless it's been set off (Active); it jams attacker drones within 0.6 m of a pack. A device on a live surface can't be set off (sim.ts `canDetonate`, serve.ts `detonate`: the same check, so the attacker's client predicts the dead press). The room (net/room.ts `shock`): an attacker's knife on a live surface or electrified device hurts him (Cause.Gadget, the pack's owner credited), throws him back and corrects his client; it does nothing to what he hit. The page (render/gadgetModels.ts `showArcs`): a flickering sheet on both faces of each live panel and jagged arcs across it and over each live shield or wire, new every 70 ms. Bots (bots/plan.ts): his packs at the foot of the plan's reinforced walls on the side it reinforces them from, once each is reinforced. Look: steel blue, a hi-vis vest, cap, safety glasses, a cable reel (`reel`) on his back; the pack's model in render/gadgetShapes.ts. Tests: test/shunt.test.ts. |
| R3 M3 | **Latch** | ✅ | data/operators/latch.json, data/gadgets/snare_latch.json (a place item `on: ["frame"]` with a `tripwire` and `snare`: 35, then 5 every 1 s, 0.7× speed, 1.5 s to pull, the defenders shown him 3 s; 4 a round). Placing (gadgets/place.ts `frameSpot`): the view's end within a door's or window's opening (a barricade or glass panel's box, grown a little) puts it on the jamb nearer the aim, on the placer's side, at shin height over a door's foot or just over a window's sill, facing across. Its wire runs to the far jamb (gadgets/snare.ts `wireLength`: the frame's width from it, or what stops sight first), the same for the server and the page. The server (gadgets/serve.ts `snap`, `snared`): armed, the first enemy body on its feet across the wire springs it: the body's `snared` (PawnState, a flag on the wire) set and its owner corrected, the hit, then a bite every `everyS`; the latch's entry goes with him at his foot until it's off (pulled, down, dead, broken), then it's gone. The body's own step (sim.ts): slowed by `speedMul` (no sprint, as in barbed wire), and Interact held `pullS` pulls it off (`DeployKind.Snare`, held still). The room tells the latch's side where he is (a `spotted` for `spotS`). The page: the wire as a thin grey line once it's armed, the latch on the leg, the snared line and the pull's gauge (ui/downed.ts), the pull's pose (bodyPose.ts). Bots (bots/plan.ts): his latches on the site's doors, from the site's side; a snared bot out of a fight pulls it off (bots/bot.ts). Look: rust brown, a hood and goggles, a satchel with spare latches (`traps`); the latch's model in render/gadgetShapes.ts. Tests: test/latch.test.ts. |
| R3 M6 | **Dowser** | ✅ | data/operators/dowser.json, data/gadgets/divining_coil.json (a `hold` item with `coil`: 18 m, a 100° fan, a 20° ping; electronic). What it shows (gadgets/coil.ts `coilUp`, `coilMarks`): the table's entries of the other side's whose data is `electronic` (not flying, not broken), the level's cameras (the defenders': unbroken, not hacked), the other side's drones and Twain's idle frame, within its range of his eye and its fan of his facing, nearest first; none while an EMP has him. The same on his client and the server, so nothing new on the wire. The ping (sim.ts `ping`): with it up, the mark nearest his crosshair within its 20° is pinged for his team, its kind with it (as a ping on a gadget is). The page (lab.ts `updateCoilOutlines`): each mark's box outlined in amber over everything, breathing, at least a hand across; on the gadget line how many it reads (NO SIGNAL under an EMP) and the ping key. In first person the coil is held out ahead in the right hand (viewmodel.ts; no screen of a tablet's). Bots (bots/bot.ts): out of a fight on his way in, the coil up for 4 s every 10 to 15 s, a ping on each device it shows not yet marked this round. Look: field green, a wide-brimmed hat, a slim pack with a whip aerial (`aerial`); the coil's model in render/gadgetShapes.ts. Tests: test/dowser.test.ts. |
| R3 M7 | **Rivet** | ✅ | data/operators/rivet.json, data/gadgets/stud_driver.json (`use.kind: "launch"`: `on` soft and steel, `reachM` 25, `cycleS` 0.7; `driver.lays`: the three salvos; 3 a round, all 3 may wait) and its salvos, data/gadgets/stud_ring.json, stud_spine.json, stud_cross.json (each a remote place item never carried, with a `salvo.ledgeM` and a small blast whose `cut` is its shape: data/destruction.json `explosives`, a new `cross` shape cut as a disc and two thick segments, a new `line` cut shape on the wire). The hands (gadgets/hands.ts): the reload key picks the salvo (PawnState `pattern`, on the wire); Fire lays it (a `place` event of the salvo's kind: the room puts it in the table as any placed device), the driver staying out for the next until none's left or all may wait, then the detonator; the ability key goes between the driver and its detonator; the detonator sets off every salvo of his that can go (`detonate` for the driver: gadgets/studs.ts `salvosOut`, each one not in a Damper's reach nor on a live surface; all marked set off before any goes, so one's blast reaching another doesn't count it lost). Where it goes (gadgets/place.ts `salvoSpot`): on a wall at the height that puts its hole's bottom (studs.ts `holeBelow`) its ledge over the higher of the floors either side, if the same wall is there; flat on a floor or hatch. A salvo is its studs (studs.ts `studPoints`, `studBoxes`: what a bullet has to meet; the hits' `partBoxes`). Bots (bots/plan.ts `hardBreachTasks`, bots/use.ts `launch`): a Spine on the plan's hard breach wall from 1.2 m off (a salvo on a hatch from above), set off from cover; Millrace's plans name Rivet with Thermite. The page: the driver in first person is the gun kit's hand cannon, variant `rivet` (an orange muzzle band, a drum that's its magazine, no hammer: render/gunKit.ts), posed as Ohm's pistol is (aimed down its irons); the studs where Fire would lay them as green dots (lab.ts `salvoMarksFor`); the salvo picked on the gadget line; the salvos' studs (render/gadgetShapes.ts). Look: slate, an orange hood and a dark visor, a drum of studs on his back (`studs`). Tests: test/rivet.test.ts. |
| R3 M8 | **Bailiff** | ✅ | data/operators/bailiff.json, data/weapons/bailiff_shield.json (a shield with a `prod`: 4 m, 10°, 4 a jolt every 0.33 s, slowed ×0.6 for 1.2 s, 8 s of charge, a second's wait to refill, a 1.5 s shock; `_ours`: no research row), data/gadgets/bailiff_post.json (her ability: the shield set down, a solid floor item, `setsDownShield`). The prod runs in the body's own step (player/prod.ts `stepProd`: PawnState `prodOn`, switched by a click of Fire, `prodUsed`, `prodNext`, `prodIdle`), so it's predicted; each jolt is a `prod` event the room judges as her client saw everyone (net/room.ts `judgeProd`, `prodTarget`: the nearest body of the other side in reach and cone, in sight): hurt, `slowed` set, its player corrected, a spark for everyone. Slowed (PawnState `slowed`, counted down by the body's own step): the speed × `slowMul` (sim.ts slowOf: no sprint), no vault. Set down: while the item's out her shield isn't on her (player/shield.ts, ResolvedLoadout `shieldDown`); her ability key then sends a `postToggle` and the gadget server switches the set-down shield's shock (its entry's Active flag; gadgets/serve.ts `postShocks`: its own charge, the prod's numbers with `postHalfDeg`, jolts from its top straight out of its face; an EMP switches it off). The plate's shape: `topWrap` bends its top back over her (player/hitboxes.ts `topBend`, the same for its hitboxes and its model, which is cut in rows across the band). The EMP shock: the room's `dseg` on her with the shield up sets `shocked` (no moving, no hands: player/movement.ts zeroes her input) and tells her client (a concussion's flash); the prod's off while she's `jammed`. The page: her plate dark slate, the prod's charge on the shield line (no free look: Fire is the prod), JOLTED for the slowed, the set-down's model (render/gadgetShapes.ts). Bots: a Bailiff bot with an enemy in reach holds the prod on, stepping in (bots/bot.ts fight). Look: black with white piping, a helmet and face shield. Tests: test/bailiff.test.ts. |
