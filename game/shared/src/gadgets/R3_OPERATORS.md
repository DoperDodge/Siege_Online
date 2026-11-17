# Project Redmond R3: eight operators of our own

Ulo asked for eight more operators in roles he named (a remote breacher, an EMP thrower, an electronics scout, a
full-body shield; electrified defences, a shield with a stun prod, a door trapper, a medic). They are our own people with
our own names, looks and devices: the roles are the genre's (the old game had people in them), the names, the designs,
the numbers and the details are ours (D-183's rule: nothing named, drawn or numbered after the old game).

Each ability is built on Phase 8's framework (gadgets/DESIGN.md): its own gadget file in data/gadgets (an operator item
in slot 2, the Z key), a module in `gadgets/` where it needs one, the hands and the wire as for the other items, the
bots' use (bots/DESIGN.md §7.4), its model and first-person view (render/), and interaction tests.

## 1. The roster

| | Name | Role | Health / speed | Primaries | Secondaries | Generics (2 of) | Ability |
|---|---|---|---|---|---|---|---|
| A | **Rivet** | remote breacher | 2 / 2 | `ump45`, `commando_9` | `p229`, `usp40` | `stun`, `claymore`, `breach_charge` | **Stud Driver** |
| A | **Ohm** | EMP | 2 / 2 | `ak_12`, `m870` | `gsh_18`, `pmm` | `frag`, `smoke`, `breach_charge` | **Brownout Pucks** |
| A | **Dowser** | electronics scout | 1 / 3 | `l85a2`, `t_5_smg` | `c75_auto`, `p226_mk_25` | `smoke`, `claymore`, `breach_charge` | **Divining Coil** |
| A | **Hull** | full-body shield | 3 / 1 | the **Hull Plate** | `p229`, `5_7_usg` | `smoke`, `impact_emp`, `hard_breach_charge` | the Hull Plate's brace |
| D | **Shunt** | electrified walls | 2 / 2 | `mp5k`, `m1014` | `p226_mk_25`, `q_929` | `barbed_wire`, `nitro_cell` | **Arc Packs** |
| D | **Bailiff** | shield and prod | 3 / 1 | the **Bailiff Shield** | `smg_11`, `p229` | `barbed_wire`, `impact_grenade` | the Bailiff Shield's prod |
| D | **Latch** | door trapper | 2 / 2 | `vector_45_acp`, `six12_sd` | `c75_auto`, `smg_12` | `nitro_cell`, `proximity_alarm` | **Trip Latches** |
| D | **Tonic** | medic | 3 / 1 | `ump45`, `m590a1` | `p229`, `usp40` | `bulletproof_camera`, `barbed_wire` | **Tonic's Dart Gun** |

## 2. The abilities

**Rivet: the Stud Driver.** A compact launcher (slot 2): Fire shoots an explosive stud, fast and nearly flat, that
sticks in what it meets out to 30 m: any surface; a body or a drone takes 2 and it falls. 12 studs a round, 3 a second
at most. The ability key with studs stuck sets them all off together (a remote device: a Damper in reach or an EMP on
Rivet stops the press; a stud on an electrified surface is burnt out within 0.5 s; each stud is 1 hp). A stud blows a
0.45 m hole through a soft wall's skins, a barricade or a soft floor, and 15 hp to a body within 1 m. On steel: studs
set off together within 0.6 m of each other, three or more, melt a 0.75 m hole through every layer at their middle (a
hatch: four make it go whole); fewer do nothing to steel. Studs keep sticking where they hit until set off or shot.

**Ohm: Brownout Pucks.** 3 a round, thrown low (they skid along the floor instead of bouncing: friction high,
restitution low). 1.5 s after it stops it pulses once: every defenders' electronic device within 4.5 m (through walls
and floors, a sphere) is off for 12 s (gadgets/DESIGN.md §6's EMP, longer and wider than the Impact EMP's), drones
included; an Arc Pack, a Trip Latch, a camera or a Damper hit counts as off from the pulse. 1 hp before it pulses.

**Dowser: the Divining Coil.** A hold item like Murmur's sensor: out of slot 2 and up, it shows the other side's
electronic devices (gadgets marked `electronic`, the level's cameras, Bulletproof Cameras, Arc Packs, Trip Latches,
Dampers, drones) within 18 m in a 100° fan, through anything, as outlines only Dowser sees; a ping while it's up marks
the device nearest his crosshair (within 20°) for his team. No weapon while it's up; walking speed unchanged. An EMP on
him empties it (as the sensor).

**Hull: the Hull Plate.** A primary like Hail's Ballistic Shield (gadgets/DESIGN.md §8) but taller (1.55 m) and wider
(0.70 m), with the sidearm alongside it unbraced (fire from the hip only). The ability key braces it: over 0.4 s two
side wings and a top flap fold out, the plate covers a standing body front edge to edge, head to feet (the viewport
stays); braced: walk only (0.55× speed), no sprint, no weapon, the knife becomes a shove. Unbracing takes 0.3 s. Every
explosive's blast on its front side is stopped by it (the body behind takes the blast's behind-a-wall fraction).

**Shunt: Arc Packs.** 4 a round, placed on the floor (2 s) within 0.3 m of a reinforced wall section, a barricade, a
deployable shield or barbed wire: the pack electrifies what it touches (a reinforced wall: its whole section; a
barricade: itself; wire and shields: themselves), arcing every 1 s. While live: an attacker's device placed on or
stuck in it is burnt out within 0.5 s (Breach and Hard Breach Charges, Burn Frames, Hailstone Drills, Studs, Claymores
against it); a body touching it with the knife or a shove takes 12 and is pushed back; a drone touching it is jammed
for 2 s. Electronic (an EMP turns it off for its seconds; Patch's Crossover Drone can hack it off), 25 hp, picked up
again.

**Bailiff: the Bailiff Shield.** A full-height shield (1.7 m) with a prod mounted at its edge: Fire, shield up, discharges
the prod in a 4 m cone of 15°: an attacker hit takes 4 a hit and is slowed (0.6× speed, no sprint, no vault) for 1.2 s,
3 hits a second while Fire is held, 8 s of charge that refills at 1 s a second after 1 s off it. Shield up: walk only
(0.7× speed); the secondary lowers it (0.4 s). Explosions knock its holder back; the prod is electronic (an EMP stops it).

**Latch: Trip Latches.** 5 a round. Placed on a door's or window's frame (1.2 s, either side), it arms after 1.5 s and
stretches a faint beam across the opening at shin height; the first attacker body through it sets it off: 65 to that
body (to a body within 0.5 m of the beam, 30), the latch gone. Drones and bodies crouched under 0.5 m don't trip it.
Electronic (EMP: off; Dowser sees it), 1 hp, picked up again before it's armed.

**Tonic: the Dart Gun.** 4 darts a round in slot 2. Fire shoots a dart (fast, falls a little) that sticks in what it hits:
a teammate takes +40 hp, past 100 to 125 at most (the extra drains at 2 hp a second); a downed teammate gets up with
40; an enemy takes 6 and nothing else. Aimed at his own feet (pitch below −60°) Fire jabs himself (+40). Not electronic.

## 3. Interactions (each gets a test, as Phase 8's did)

- Ohm's pulse turns off Arc Packs, Trip Latches, Dampers, cameras, Bulletproof Cameras, the Bailiff Shield's prod and
  Murmur's sensor in reach; Rivet's studs and the attackers' own devices aren't touched.
- Arc Packs burn out Studs, Breach and Hard Breach Charges, Burn Frames and Hailstone Drills on their surface; Cleave's
  Maul on a live surface: the swing is spent and the swinger takes 12; Kiln's Burn Frame placed beside an off pack
  burns as usual.
- Dampers jam Rivet's set-off within reach (a stud in reach doesn't go; the others do).
- Dowser's coil shows Arc Packs, Trip Latches, Dampers, the level's cameras, Bulletproof Cameras and Twain's idle frame (a camera to her side).
- Latch's beam ignores drones and Patch's Crossover Drones; Hull braced trips it (and takes the blast on his plate if it
  faces it).
- Tonic's dart heals a body standing behind Hull's or Bailiff's shield only round its edge (the shield stops darts).

## 4. Looks (data/presentation/operator_looks.json)

Rivet: slate overalls, an orange hood up under a welder's flip-up visor (new `visor` head), tool pouches. Ohm: dark
blue work jacket with copper trim, a wool beanie, a battery pack on the back. Dowser: field green, a wide-brimmed hat
(the `brim` head), a slim pack with an aerial. Hull: heavy grey plate carrier and helmet with a face guard (new `guard`
head). Shunt: yellow-black hi-vis tabard over navy, an electrician's cap (new `cap` head). Bailiff: black with white
piping, a peaked helmet. Latch: rust brown, a balaclava and goggles. Tonic: white and teal, a soft cap, a sling bag with
a cross of our own (a teal plus, not a red cross).

## 5. Milestones

| | What | Done when |
|---|---|---|
| R3 M1 | This plan; the eight operator files, their ability gadget files, looks; pickable with their generics | the loadout tests pass with 20 operators; the pick screen lists them |
| R3 M2 | Tonic's Dart Gun | heal, overheal and decay, revive at range, self-jab, enemy hit; bots heal a hurt or downed teammate |
| R3 M3 | Latch's Trip Latches | placing on frames, arming, the beam, tripping, drones and crouch under, EMP, pickup; bots trap the site's doors |
| R3 M4 | Shunt's Arc Packs | electrifying walls, barricades, wire, shields; burning out devices; the shock; EMP and hack; bots on the plan's walls |
| R3 M5 | Ohm's Brownout Pucks | the skid, the pulse, every device off for 12 s; bots before a hard breach |
| R3 M6 | Dowser's Divining Coil | the fan, the outlines, the ping; bots ping devices for their team |
| R3 M7 | Rivet's Stud Driver | studs stuck, set off together, holes in soft and the cluster through steel; burnt out by packs; bots breach with it |
| R3 M8 | Hull's Hull Plate and Bailiff's Shield | braced cover, blasts stopped, the prod's slow; bots carry them |
| R3 M9 | Models, first person, HUD for all eight; the interaction tests (§3); soak; browser tests; review; docs | every check green |
