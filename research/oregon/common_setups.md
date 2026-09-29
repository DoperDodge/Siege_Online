# Oregon — Common Setups per Bomb Site (input for `bot_strats.json`, PLAN §15.4)
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: **medium** for geometry: which walls are breakable, where the hatches go, which doors and stairs lead into each site. All of that comes from the official blueprints and Ubisoft's rework notes. **Low** for "what players commonly do". I found no trustworthy post-2020 setup guide I could reach (YouTube and Reddit were blocked; the reachable 2025–26 guides are low-quality SEO pages; the Steam and siege.gg guides predate the 2020 rework). So most reinforcement, gadget and plan choices below are **derived** from the geometry plus standard Siege practice, and are tagged `DER`. Ulo should review them (see Open questions). Bomb markers, default cameras and ingredients per site come from the r6calls vector map (July 2026, `R6C`), with **medium** confidence.

How to read this file:
- Every item has an `ev:` (evidence) tag: `BP` = official blueprint geometry; `OFF` = official Ubisoft text; `COMM` = community guide (named); `R6C` = r6calls.com Oregon vector map (rev 5, 2026-07-25; bomb *markers* are icon anchors, not exact bomb-object positions); `PRE` = pre-rework guide (context only); `DER` = derived by me (**UNVERIFIED** as "common practice").
- Wall IDs are `W_<floor>_<roomA>__<roomB>` and point at the **yellow "breakable wall"** segments of the official blueprint. `px` = blueprint pixel coordinates in the 1600×900 frame described in `map_features.md` §0.2. Hatch IDs H1–H6 and stair IDs S1–S5 match `map_features.md`.
- "Breakable" means the blueprint's *Breakable walls* legend (soft/reinforceable). Whether each one is reinforceable, and how many reinforcement panels it takes, is **UNVERIFIED**. `layout_notes.md` and `research/destruction.md` own that. Bots should reinforce "the full wall" and let the map data decide the panel count.
- The team reinforcement pool size and reinforcement rules: `research/destruction.md`. The priority lists below are **ordered**, so bots should spend the pool top-down and stop when it runs out.

---

## 0. Map-wide facts that shape every setup
| Fact | ev |
|---|---|
| **No 1F floor is destructible.** The basement can only be reached vertically through hatches **H1** (Meeting Hall → Electric Room), **H2** (Security → Freezer), **H3** (Lobby → Laundry Storage) | BP |
| **Most 2F floors are destructible** (Kids', Dorm Main Hall, Game Room, Walk-In, Trophy, Master, Armory Corridor, Armory). So 1F rooms under them are exposed to vertical play from 2F. The **Kitchen ceiling = Kids' floor** (plus hatch **H4**) | BP |
| The main **Attic** floor is *not* destructible, only hatch **H5** (into Meeting Hall). **Dining Hall** has a flat roof above it, not a 2F room, so there's no vertical onto Dining | BP |
| Basement has exactly 3 interior staircases (Back/Tower Stairs S1, Freezer/White Stairs S2, Laundry/Main Stairs S3) plus the outside **Bunker stairs** S5 | OFF, BP |
| Attackers spawn at **A Junkyard** (west), **B Street** (south), **C Construction Site** (north-east). The drone spawns on the side of the first chosen spawn | LQ, OFF |
| Hatches are one-way for our roster (no Oryx) | — |
| **8 default cameras** (3 EXT, B Freezer, 1F Rear Stage / Lobby / Shower Corridor, 2F Armory Corridor), **7 fire extinguishers**, **2 gas pipes** (1F by Main Stairs/Garage, 2F Attic), **no metal detectors** | R6C (see `map_features.md` §2–3) |

### 0.1 Roster roles on Oregon (for the team planner) — ev: operator research files + DER
| Operator | Side | Default role here | Key tools (details in `research/operators/<name>.md`) |
|---|---|---|---|
| Thermite | ATK | **Primary hard breacher** | 3 Exothermic Charges (one opens a reinforced hatch); Smoke or Stun |
| Striker | ATK | **Secondary hard breacher / flex** | Any 2 different attacker gadgets. Default here: **Hard Breach Charge + Impact EMP** (EMP disables Mute jammers). Alt: Claymore for flank watch |
| Fuze | ATK | **Anti-anchor utility clear** | 4 Cluster Charges (soft walls, hatches, floors, and reinforced surfaces with a 1.75 s delay, plus Black Mirror). Gadget: **Hard Breach Charge** as backup hard breach, else Breach Charge |
| Brava | ATK | **Anti-gadget** | Kludge Drone hacks **Mute jammers** (frees Thermite), BP cameras and Observation Blockers. It **cannot** hack Black Mirror, Gu or Pulse's sensor. Claymore on flanks |
| Sledge | ATK | **Soft breach / vertical** | Hammer (25 uses; unreinforced walls, floors, hatches); Impact EMP or Frag |
| Dokkaebi | ATK | **Intel / anti-roam** | Jegeo Payload (Y11S2 remaster) on identified defenders; hacks cameras through dead defenders' phones; Breach Charge or Smoke |
| Mute | DEF | **Anchor: anti-breach / anti-drone** | 4 Signal Disruptors (2.6 m sphere) stop Thermite, Fuze and charge triggers. Place them **after** reinforcing (a jammer too close to a wall that is then reinforced is destroyed) |
| Mira | DEF | **Anchor: intel window** | 2 Black Mirrors, only on reinforceable walls. On a reinforced wall, place from the defender side. Nitro Cell or Proximity Alarm |
| Skopós | DEF | **Anchor: two positions** | 2 V10 shells: park one in each bomb room and swap to wherever attackers commit |
| Sentry | DEF | **Support** | Any 2 different defender gadgets. Default: **Barbed Wire + Deployable Shield** (alt: Bulletproof Camera, Observation Blocker) |
| Pulse | DEF | **Roam: intel and vertical** | HB-5 (10.5 m through floors), Nitro Cell. Scans the floor above or below the site |
| Lesion (provisional "Legion") | DEF | **Roam: delay** | Gu mines on stair bottoms, hatch drop points and entry doors |

Default defender split (DER): **3 anchors (Mira, Mute, Skopós) + 2 roamers (Lesion, Pulse)**, with Sentry swapping in for any of them. Default attacker five (DER): **Thermite, Brava, Sledge, Fuze, Striker** (swap Dokkaebi for Fuze on sites with many roamers).

---

## 1. Site "B Laundry / B Supply" (Liquipedia site 4)

```yaml
site_id: B_laundry_supply
bomb_rooms:
  - {room: B_laundry_room, bp_px_bbox: [796,524,941,587], r6calls_marker: {letter: 4A, bp_px: [803,577], note: "SW part, by the Freezer wall and the Basement Hall door"}}
  - {room: B_supply_room, bp_px_bbox: [844,394,930,515], includes: B_supply_closet [842,483,887,514], r6calls_marker: {letter: 4B, bp_px: [888,449], note: "room centre"}}
adjacent_rooms: [B_basement_hall (W of Supply/N of Laundry), B_freezer (W), B_boiler_room (N),
                 B_electric_room (NE, door into Supply), B_blue_bunker (E), B_laundry_storage (S),
                 B_laundry_stairs (SE), B_back_stairs (N, into Boiler)]           # ev: BP + R6T polygons
doors_into_site:                                                                  # ev: BP (door symbols)
  - {between: [B_supply_room, B_basement_hall], px: [838,439]}
  - {between: [B_supply_room, B_electric_room], px: [905,386]}
  - {between: [B_supply_room, B_supply_closet], px: [892,497]}
  - {between: [B_laundry_room, B_basement_hall], px: [807,519]}
  - {between: [B_laundry_room, B_laundry_storage], px: [867,592]}
  - {between: [B_laundry_room, B_laundry_stairs], note: "open stair end at the SE corner — UNVERIFIED"}
ring_access: {basement_hall: [door from Boiler (807,389), door from Freezer (790,445)],
              boiler: [S1 Back Stairs, door from Blue Bunker (~934,316)],
              blue_bunker: [S5 outside stairs, east door (1014,369)],
              freezer: [S2 Freezer Stairs, hatch H2], electric: [hatch H1], laundry_storage: [hatch H3, S3 door]}
breakable_walls:                                                                   # ev: BP yellow dashes
  W_B_laundry__freezer:      {px: [789,524,789,579], note: "whole west wall of Laundry, no door"}
  W_B_supply__blue_bunker:   {px: [934,441,934,481]}
  W_B_supply__boiler:        {px: [841,389,866,389]}
  W_B_electric__boiler:      {px: [884,346,931,346]}
  W_B_electric__blue_bunker: {px: [934,346,934,384]}
  W_B_supplycloset__laundry: {px: [841,519,889,519], internal: true}
  W_B_supply__laundry:       {px: [901,519,926,519], internal: true}
default_cams_and_ingredients:     # ev: R6C (r6calls, July 2026; single source) — see map_features.md §2-3
  cameras: [CAM4 B Freezer, CAM6 1F Lobby (over H3/Main Stairs), CAM5 1F Rear Stage (top of Back Stairs)]
  fire_extinguishers: [ING1 B Basement Hall (between the Supply and Laundry doors), ING2 B Freezer north arm]
  gas_pipes: []
  bot_use: "DEF: shoot ING1/ING2 to smoke and concuss attackers entering Basement Hall / Freezer. ATK: pre-shoot them from a distance or avoid standing next to them"   # DER
defense:
  reinforce_priority:            # ev: DER for all. Spend top-down
    1: {id: W_B_laundry__freezer,      why: "stops Freezer hard breach / sightline (attackers via S2 + H2)"}
    2: {id: W_B_supply__blue_bunker,   why: "stops Bunker hard breach (attackers via S5 from Construction Site)"}
    3: {id: H3, why: "Lobby hatch drops next to the Laundry door; deny vertical + sightline"}
    4: {id: H1, why: "Meeting Hall hatch drops into Electric, which has a door into Supply"}
    5: {id: W_B_supply__boiler,        why: "Boiler is reached from Back Stairs (Big Tower) and Bunker"}
    6: {id: W_B_electric__blue_bunker, why: "keeps Electric (door to Supply) sealed from Bunker"}
    7: {id: W_B_electric__boiler,      why: "same, from Boiler"}
    8: {id: H2, why: "optional; only if a defender holds Freezer"}
  leave_soft: [W_B_supplycloset__laundry, W_B_supply__laundry]   # DER: open for rotation and crossfire
  rotation_holes:  [{wall: W_B_supplycloset__laundry, size: vault/crouch}, {wall: W_B_supply__laundry, size: crouch}]  # DER
  murder_holes:    [{wall: W_B_supplycloset__laundry, watches: "Laundry plant area"}]  # DER
  barricades:      [Supply-Basement Hall door, Laundry-Basement Hall door, Laundry-Laundry Storage door, Supply-Electric door]  # DER
  gadgets:        # DER unless noted
    mira:   [{wall: W_B_laundry__freezer, side: laundry, watches: Freezer},
             {wall: W_B_supply__blue_bunker, side: supply, watches: Blue Bunker}]   # COMM(lootbar, R6 Mobile, low trust): "two windows overlooking laundry and freezer points"
    mute:   [{near: W_B_laundry__freezer}, {near: W_B_supply__blue_bunker}, {near: H3, room: B_laundry_storage}, {drone_line: "Freezer→Basement Hall door"}]
    lesion: [bottom of S2 Freezer Stairs, Freezer under H2, Boiler at S1 bottom, Blue Bunker at S5 bottom, Laundry Storage under H3, Laundry Stairs]
    sentry: {barbed_wire: [S2 bottom, S3 bottom], deployable_shield: "Laundry, covering the Laundry Storage door and the stairs"}
    skopos: {talos: "Supply, watching the Electric and Basement Hall doors", colossus: "Laundry, watching Laundry Storage / Laundry Stairs"}
    pulse:  "roam 1F above site (Security / White Hall / Lobby / Meeting); scan down for planters; Nitro Cell down an opened hatch"
  anchors: [Laundry (Mira or Mute), Supply (Skopós or Mute)]
  roam:    [1F Security + White Hall (top of S2), 1F Lobby + Garage (top of S3, over H3), Big Tower 1F/Rear Stage (top of S1)]
  rotates: ["Laundry <-> Supply via Basement Hall doors or the soft internal walls",
            "Laundry -> Laundry Stairs -> 1F Lobby", "Supply/Boiler -> Back Stairs -> Big Tower",
            "Freezer -> Freezer Stairs -> 1F White Hall"]
attack:
  spawns: {C_construction_site: [Blue Bunker via S5, Big Tower -> S1 -> Boiler, Meeting Hall -> H1],
           A_junkyard: [Small Tower or south doors -> White Hall -> S2 -> Freezer, Security -> H2],
           B_street: [Main Entrance -> Lobby -> H3, Lobby -> S3 Laundry Stairs]}
  hard_breach: [{target: W_B_laundry__freezer, from: B_freezer, op: Thermite},
                {target: W_B_supply__blue_bunker, from: B_blue_bunker, op: "Thermite (2nd charge) or Striker/Fuze Hard Breach Charge"},
                {target: "H3 / H1 if reinforced", from: "1F Lobby / 1F Meeting Hall", op: "Thermite charge or Hard Breach Charge"}]
  soft_breach: [{op: Sledge, targets: "unreinforced H1/H2/H3; W_B_electric__* / W_B_supply__boiler if left soft"},
                {op: Fuze, targets: "Cluster Charge through H3 (Laundry Storage), H1 (Electric) or through W_B_laundry__freezer to clear the Laundry anchor"}]
  anti_gadget: [{op: Brava, target: "Mute jammers on the two hard-breach walls, before Thermite detonates"},
                {op: Striker, target: "Impact EMP on jammers"}]
  intel: [{op: Dokkaebi, use: "Jegeo Payload on a spotted anchor to force a reset or move during the breach"}]
  plant_spots: [{room: B_laundry_room, from: "Freezer breach or Laundry Storage door", pos: UNVERIFIED},
                {room: B_supply_room, from: "Bunker breach or Electric door", pos: UNVERIFIED}]
  post_plant: ["hold through the W_B_laundry__freezer opening from Freezer",
               "hold through the W_B_supply__blue_bunker opening from Bunker",
               "watch Laundry Storage from 1F through opened H3"]      # DER
  flank_watch: [S2 top (1F White Hall), S3 top (1F Lobby), S1 (Big Tower)]  # DER
```

---

## 2. Site "1F Kitchen / 1F Dining Hall" (Liquipedia site 2)

```yaml
site_id: 1F_kitchen_dining
bomb_rooms:
  - {room: 1F_kitchen, bp_px_bbox: [643,441,788,528], r6calls_marker: {letter: 2B, bp_px: [718,470], note: "centre-east (same bomb as 3B)"}}
  - {room: 1F_dining_hall, bp_px_bbox: [498,428,627,526], r6calls_marker: {letter: 2A, bp_px: [569,438], note: "north-centre"}}
adjacent_rooms: [1F_small_tower (W of Dining), 1F_showers (S of Dining), 1F_shower_corridor (S/E strip),
                 1F_security (S of Kitchen), 1F_security_hall_white_hall, 1F_kitchen_corridor (NE),
                 1F_meeting_hall (E), 2F_kids_dorms (above Kitchen)]                   # ev: BP + R6T
doors_into_site:                                                                        # ev: BP
  - {between: [1F_kitchen, 1F_dining_hall], px: [634,456], internal: true}
  - {between: [1F_kitchen, 1F_kitchen_corridor], px: [776,433]}
  - {between: [1F_dining_hall, 1F_small_tower], px: [489,440], note: "new in Y5S1 (OFF)"}
  - {between: [1F_dining_hall, 1F_shower_corridor_east_strip], px: [611,535]}
removed_in_y5s1: ["Kitchen <-> Security Corridor door", "Dining Hall exterior door"]   # ev: OFF
vertical: {kitchen_ceiling: "Kids' floor, destructible + hatch H4 (655,490)", dining_ceiling: "flat roof, not destructible"}  # ev: BP
breakable_walls:                                                                         # ev: BP
  W_1F_kitchen__meeting:      {px: [795,480,795,512]}
  W_1F_kitchen__security_w:   {px: [638,534,678,534]}
  W_1F_kitchen__security_e:   {px: [733,534,755,534]}
  W_1F_dining__small_tower:   {px: [491,482,491,525]}
  W_1F_dining__showers:       {px: [553,534,595,534]}
  W_1F_kitchen__dining:       {px: [634,475,634,492], internal: true}
default_cams_and_ingredients:     # ev: R6C
  cameras: [CAM7 1F Shower Corridor (south approach to Dining/Showers), CAM1 EXT Junkyard/Bus (Small Tower side), CAM5 1F Rear Stage]
  fire_extinguishers: [ING3 1F Security Corridor, ING4 1F Kitchen Corridor]
  gas_pipes: []
  bot_use: "DEF: ING4 smokes the Kitchen Corridor push from Big Tower; ING3 the White Hall / Security push"   # DER
defense:
  reinforce_priority:     # ev: DER
    1: {id: W_1F_kitchen__meeting,    why: "attackers who take Meeting Hall (from Big Tower / Split) breach into Kitchen"}
    2: {id: W_1F_dining__small_tower, why: "Junkyard attackers take Small Tower and breach Dining"}
    3: {id: W_1F_kitchen__security_w, why: "attackers from White Hall / Security"}
    4: {id: W_1F_kitchen__security_e, why: "same"}
    5: {id: H4, why: "Kids' hatch drops into Kitchen"}
    6: {id: W_1F_dining__showers,     why: "attackers from Showers / south doors"}
  leave_soft: [W_1F_kitchen__dining]                  # DER: rotation between the bomb rooms
  cannot_reinforce: "Kitchen ceiling (Kids' floor) -> needs a 2F roamer to stop vertical play"  # BP + DER
  rotation_holes: [{wall: W_1F_kitchen__dining, size: vault}]                              # DER
  barricades: [Kitchen-Kitchen Corridor door, Dining-Small Tower door, Dining SE door]      # DER
  gadgets:        # DER
    mira:   [{wall: W_1F_kitchen__meeting, side: kitchen, watches: Meeting Hall},
             {wall: W_1F_dining__small_tower, side: dining, watches: Small Tower}]
    mute:   [{near: W_1F_dining__small_tower}, {near: W_1F_kitchen__meeting}, {near: W_1F_kitchen__security_w}, {drone_line: Kitchen Corridor}]
    lesion: [Kitchen Corridor (both doors), Small Tower 1F door, Dining SE door strip, White Hall]
    sentry: {barbed_wire: [Kitchen Corridor], deployable_shield: "Dining, covering the Small Tower door and the SE door"}
    skopos: {talos: "Kitchen, watching the Kitchen Corridor door", colossus: "Dining, watching the Small Tower and SE doors"}
    pulse:  "2F Kids' / Dorms above Kitchen: scan down, stop Sledge floor-breaking over Kitchen"
  anchors: [Kitchen, Dining]
  roam:    [2F Kids' Dorms (anti-vertical), 2F Small Tower (flanks Dining roof / Junkyard), Big Tower / Kitchen Corridor, 1F Showers / White Hall]
  rotates: ["Kitchen <-> Dining via door or soft wall", "Kitchen -> Kitchen Corridor -> Big Tower",
            "Dining -> Small Tower -> 2F", "White Hall -> White Stairs -> 2F Dorms"]
attack:
  spawns: {A_junkyard: [Small Tower -> Dining], B_street: [south doors -> White Hall -> Security / Showers],
           C_construction_site: [Big Tower -> Kitchen Corridor -> Kitchen, Meeting Hall -> Kitchen wall]}
  hard_breach: [{target: W_1F_dining__small_tower, from: 1F_small_tower, op: Thermite},
                {target: "W_1F_kitchen__security_w/e", from: 1F_security, op: "Striker/Fuze Hard Breach Charge or Thermite"},
                {target: W_1F_kitchen__meeting, from: 1F_meeting_hall, op: Thermite}]
  soft_breach: [{op: Sledge, targets: "2F Kids' floor over Kitchen; H4 if unreinforced; W_1F_dining__showers if soft"},
                {op: Fuze, targets: "Cluster Charge through the Kitchen/Dining walls or down from Kids' floor"}]
  anti_gadget: [{op: Brava, target: "jammers on the breach walls, BP cameras"}]
  intel: [{op: Dokkaebi, use: "flush 2F roamers above Kitchen"}]
  plant_spots: [{room: 1F_kitchen, from: "Kitchen Corridor door or the Kids' vertical", pos: UNVERIFIED},
                {room: 1F_dining_hall, from: "Small Tower breach or SE door", pos: UNVERIFIED}]
  post_plant: ["2F Kids' holes looking down into Kitchen", "Small Tower through the breach", "Kitchen Corridor"]  # DER
  flank_watch: [White Stairs, Kitchen Corridor exterior door (760,407), Small Tower 2F]  # DER
```
Community note, low trust (R6 Mobile guide): "The ceiling in the Kitchen consists entirely of soft, destructible material … a direct hatch drop … from the Kids' Dorms above. 3 out of the 4 walls in the kitchen are also soft walls." This matches the blueprint (W, S, E walls breakable; the north wall is exterior).

---

## 3. Site "1F Meeting Hall / 1F Kitchen" (Liquipedia site 3; replaced the old Tower site in Y5S1)

```yaml
site_id: 1F_meeting_kitchen
bomb_rooms:
  - {room: 1F_meeting_hall, bp_px_bbox: [801,321,942,528], contains: 1F_split (829-908, 498-530), r6calls_marker: {letter: 3A, bp_px: [836,371], note: "NW part, near the Kitchen Corridor door and the Stage"}}
  - {room: 1F_kitchen, bp_px_bbox: [643,441,788,528], r6calls_marker: {letter: 3B, bp_px: [718,486], note: "same bomb as 2B"}}
adjacent_rooms: [1F_rear_stage_T1 (N, Big Tower ground floor), 1F_kitchen_corridor (NW), 1F_security (S of Kitchen),
                 1F_security_hall_white_hall (S), 1F_lobby (SE), 1F_dining_hall (W of Kitchen),
                 2F_attic (above Meeting, hatch H5 only), 2F_kids_dorms (above Kitchen), B_electric_room (below, H1)]
doors_into_site:                                                                   # ev: BP
  - {between: [1F_meeting_hall, 1F_kitchen_corridor], px: [850,328]}
  - {between: [1F_kitchen, 1F_kitchen_corridor], px: [776,433]}
  - {between: [1F_split, 1F_white_hall_or_lobby_entrance], px: [866,535]}
  - {between: [1F_kitchen, 1F_dining_hall], px: [634,456]}
  - {windows: "Meeting Hall east wall ~(944,377) and ~(944,475)", ev: BP}
kitchen_corridor_other_doors: [{to: 1F_rear_stage_T1, px: [779,315]}, {to: EXT_farmlands, px: [760,407]}]   # ev: BP
hatches: {H5: "2F Attic -> Meeting Hall (ceiling)", H1: "Meeting Hall floor -> B Electric", H4: "2F Kids' -> Kitchen (ceiling)"}
breakable_walls:                                                                   # ev: BP
  W_1F_rear_stage__meeting:     {px: [853,314,883,314]}
  W_1F_meeting_sw__white_hall:  {px: [800,534,820,534]}
  W_1F_meeting_se__lobby:       {px: [923,534,943,534]}
  W_1F_kitchen__security_w:     {px: [638,534,678,534]}
  W_1F_kitchen__security_e:     {px: [733,534,755,534]}
  W_1F_kitchen__dining:         {px: [634,475,634,492]}
  W_1F_kitchen__meeting:        {px: [795,480,795,512], internal: true}
default_cams_and_ingredients:     # ev: R6C
  cameras: [CAM5 1F Rear Stage (Big Tower side), CAM6 1F Lobby (Split / Lobby approach), CAM3 EXT Construction]
  fire_extinguishers: [ING4 1F Kitchen Corridor, ING5 1F Lobby hall south of Split, ING3 1F Security Corridor]
  gas_pipes: [ING8 by Main Stairs / Garage SW corner]
  bot_use: "DEF: ING5 smokes the Split/Lobby approach; ING8 can flame-block the Main Stairs/Lobby-Garage path for 15 s"   # DER
defense:
  reinforce_priority:      # ev: DER
    1: {id: W_1F_rear_stage__meeting, why: "Big Tower (Construction Site) attackers hard-breach into Meeting"}
    2: {id: H5, why: "Attic hatch drops straight into Meeting"}
    3: {id: W_1F_kitchen__security_w, why: "White Hall / Security push on Kitchen"}
    4: {id: W_1F_kitchen__security_e, why: "same"}
    5: {id: W_1F_meeting_se__lobby,   why: "Street attackers via Lobby"}
    6: {id: W_1F_meeting_sw__white_hall, why: "same, via White Hall"}
    7: {id: H4, why: "Kids' hatch into Kitchen"}
    8: {id: W_1F_kitchen__dining, why: "only if Dining is expected to fall (Junkyard attack)"}
  leave_soft: [W_1F_kitchen__meeting]     # DER: rotation / crossfire between the bomb rooms
  optional: {H1: "floor hatch to Electric: reinforce only if attackers are expected underneath (rare)"}   # DER
  cannot_reinforce: "Kitchen ceiling (Kids' floor)"   # BP
  barricades: [Kitchen Corridor doors, Split doors, Kitchen-Dining door]  # DER
  gadgets:        # DER (Mira watching Rear Stage from Meeting is also a PRE idea for the old Tower site)
    mira:   [{wall: W_1F_rear_stage__meeting, side: meeting, watches: "Rear Stage + Tower Stairs"},
             {wall: W_1F_kitchen__security_w, side: kitchen, watches: Security}]
    mute:   [{near: W_1F_rear_stage__meeting}, {near: W_1F_kitchen__security_w}, {near: W_1F_meeting_se__lobby}, {drone_line: Kitchen Corridor}]
    lesion: [Kitchen Corridor (Rear Stage door and exterior door), Split south door, Big Tower Tower Stairs, Attic near H5]
    sentry: {barbed_wire: [Kitchen Corridor], deployable_shield: "Meeting Hall, facing Split and the east windows"}
    skopos: {talos: "Meeting Hall, watching the Split doors and the NW Kitchen Corridor door", colossus: "Kitchen, watching the Kitchen Corridor and Dining doors"}
    pulse:  "2F Attic / Kids': scan down and deny vertical over Kitchen and Meeting"
  anchors: [Meeting Hall, Kitchen]
  roam:    [Big Tower 1F/2F + Attic (Construction side), 2F Kids' (anti-vertical), Lobby / Garage (Street side), Dining / Small Tower (Junkyard side)]
  rotates: ["Meeting <-> Kitchen through the soft wall or Kitchen Corridor", "Meeting -> Split -> Lobby",
            "Kitchen Corridor -> Rear Stage -> Tower Stairs (up to Attic / down to Boiler)"]
attack:
  spawns: {C_construction_site: [Rear Stage (Big Tower 1F east door (955,252)) -> Meeting wall, Kitchen Corridor, Meeting east windows],
           B_street: [Main Entrance -> Lobby -> Split / Meeting SE wall, White Hall -> Security -> Kitchen],
           A_junkyard: [Small Tower -> Dining -> Kitchen]}
  hard_breach: [{target: W_1F_rear_stage__meeting, from: 1F_rear_stage_T1, op: Thermite},
                {target: "W_1F_kitchen__security_w/e", from: 1F_security, op: "Striker/Fuze Hard Breach Charge"},
                {target: "H5 if reinforced", from: 2F_attic, op: "Thermite charge"}]
  soft_breach: [{op: Sledge, targets: "H5 from Attic; Kids' floor over Kitchen; Meeting corner walls if soft"},
                {op: Fuze, targets: "Cluster Charge down H5 or through the Rear Stage wall into Meeting"}]
  anti_gadget: [{op: Brava, target: "jammer on the Rear Stage wall"}]
  intel: [{op: Dokkaebi, use: "punish Big Tower / Attic roamers"}]
  plant_spots: [{room: 1F_meeting_hall, from: "Rear Stage breach, Split or Kitchen Corridor", pos: UNVERIFIED},
                {room: 1F_kitchen, from: "Dining or Kitchen Corridor", pos: UNVERIFIED}]
  post_plant: ["Attic through H5", "Rear Stage through the breach", "Kitchen Corridor", "Kids' holes over Kitchen"]   # DER
  flank_watch: [Tower Stairs (S1), White Stairs (S2), Main Stairs (S3)]  # DER
```

---

## 4. Site "2F Kids' Dorms / 2F Dorms Main Hall" (Liquipedia site 1)

```yaml
site_id: 2F_kids_dorms
bomb_rooms:
  - {room: 2F_kids_dorms, bp_px_bbox: [649,447,777,526], r6calls_marker: {letter: 1B, bp_px: [761,485], note: "east part, by the Kids'-Attic wall"}}
  - {room: 2F_dorm_main_hall, bp_px_bbox: [648,504,855,624], note: "L-shaped; includes the NE sub-room ('Middle' on r6calls) south of the Attic", r6calls_marker: {letter: 1A, bp_px: [702,613], note: "south-west part, near the White Stairs door"}}
adjacent_rooms: [2F_attic (N/NE; connector to Big Tower), 2F_trophy_room (E), 2F_game_room (S-centre, opening into Dorm),
                 2F_walk_in (S), 2F_master_bedroom (SE), 2F_white_stairs (SW, S2), 1F_kitchen (below Kids', H4),
                 EXT dining flat roof R5 and dorms roof R3 (W)]
doors_and_openings:                                                                    # ev: BP
  - {between: [2F_kids_dorms, 2F_dorm_main_hall], px: [744,532], internal: true}
  - {between: [2F_dorm_main_hall, 2F_white_stairs], px: [744,631]}
  - {between: [2F_dorm_main_hall_ne, 2F_attic], px: [803,496], ev: "OFF: Attic 'opening into Dorm Main Hall with a doorway'"}
  - {between: [2F_dorm_main_hall_ne, 2F_trophy_room], px: [860,516]}
  - {between: [2F_dorm_main_hall, 2F_game_room], note: "wide opening in Game Room north wall ~ (792-832, 572)"}
  - {exterior: "Kids' north opening ~(744,440)", type: "window? UNVERIFIED"}
  - {exterior: "Dorm Main Hall west opening ~(641,549) = 'Big Window' candidate", ev: "OFF: large central window repositioned in Y5S1"}
hatches: {H4: "Kids' floor -> 1F Kitchen", H5: "Attic -> 1F Meeting Hall (not in site)"}
floors: "Kids', Dorm Main Hall, Game Room, Walk-In, Trophy, Master are destructible (from below too)"   # ev: BP
breakable_walls:                                                                         # ev: BP
  W_2F_kids__attic:          {px: [784,444,784,488]}
  W_2F_attic__trophy:        {px: [864,496,912,496]}
  W_2F_dorm__game_room:      {px: [769,603,769,628]}
  W_2F_game_room__walk_in:   {px: [812,632,855,632]}
  W_2F_big_tower__attic:     {px: [867,313,910,313], note: "far end of the Attic connector"}
  W_2F_kids__dorm:           {px: [662,532,714,532], internal: true}
  W_2F_master__armory_corr:  {px: [930,575,930,610]}
  W_2F_armory_corr__armory:  {px: [962,543,962,581]}
default_cams_and_ingredients:     # ev: R6C
  cameras: [CAM8 2F Armory Corridor (Master/Trophy side), CAM5 1F Rear Stage (Big Tower route), CAM1 EXT Junkyard/Bus (west windows)]
  fire_extinguishers: [ING7 2F Low Attic (Attic entry into site), ING6 2F Trophy Room]
  gas_pipes: [ING9 2F Attic north connector]
  bot_use: "DEF: shoot ING9 when attackers push Big Tower -> Attic (15 s flame wall, then ~3 s ground fire); ING7 smokes/concusses at the Attic doorway. ATK: pre-shoot ING9 from Big Tower before committing to Attic"   # DER + SGG behaviour
defense:
  reinforce_priority:        # ev: DER
    1: {id: W_2F_kids__attic,        why: "Attic is the attackers' main staging room (Big Tower side); hard-breach target into Kids'"}
    2: {id: W_2F_game_room__walk_in, why: "keeps the Game Room (open to Dorm) safe from Master / Walk-In attackers"}
    3: {id: H4, why: "stops attackers in Kitchen opening the site floor hatch for sightlines"}
    4: {id: W_2F_attic__trophy,      why: "slows Attic -> Trophy -> Dorm NE door flanks"}
    5: {id: W_2F_big_tower__attic,   why: "optional: delays the Big Tower -> Attic push (only with pool to spare)"}
  leave_soft: [W_2F_kids__dorm, W_2F_dorm__game_room]      # DER
  rotation_holes: [{wall: W_2F_kids__dorm, size: vault}]    # DER
  cannot_reinforce: "site floors; both rooms are exposed to shots from 1F Kitchen / Dining area below Kids' / Dorm"  # BP + DER
  barricades: [White Stairs door, Attic doorway into Dorm, Trophy door, west windows]  # DER
  gadgets:        # DER. PRE (2018 Steam guide, pre-rework) had Miras in Kids' watching Dorm Main Hall and the top of the dorm stairs
    mira:   [{wall: W_2F_kids__attic, side: kids, watches: Attic},
             {wall: W_2F_game_room__walk_in, side: game_room, watches: "Walk-In / Master"}]
    mute:   [{near: W_2F_kids__attic}, {near: W_2F_game_room__walk_in}, {near: "west window (anti-drone)"}, {drone_line: "White Stairs door"}]
    lesion: [White Stairs (top and bottom), Attic doorway, Trophy door, landing spots under the west windows, Attic connector]
    sentry: {barbed_wire: [White Stairs, Attic doorway], deployable_shield: "Dorm Main Hall facing the west window"}
    skopos: {talos: "Kids', watching the Attic wall and the north opening", colossus: "Dorm Main Hall, watching the White Stairs door and the west window"}
    pulse:  "1F Kitchen / Dining / White Hall below site: scan up; or Big Tower / Attic roam"
  anchors: [Kids', Dorm Main Hall]
  roam:    [Big Tower 2F + Attic (Construction side), 2F Small Tower (Junkyard / Dining-roof side), Armory / Master (Street side), 1F under site (anti-vertical from below)]
  rotates: ["Kids' <-> Dorm via door or soft wall", "Dorm -> White Stairs -> 1F White Hall / B Freezer",
            "Dorm NE -> Trophy -> Armory Corridor -> Main Stairs", "Kids' -> H4 drop -> 1F Kitchen (one-way)"]
attack:
  spawns: {C_construction_site: [Big Tower -> Tower Stairs -> Big Tower 2F -> Attic -> Kids' wall / Dorm NE doorway],
           A_junkyard: [Small Tower -> 2F -> Dining flat roof (R5) -> Dorm west window; rappel from R3 on the west face],
           B_street: [Main Entrance -> Main Stairs -> Armory Corridor -> Trophy / Master -> Walk-In -> Game Room; White Hall -> White Stairs]}
  hard_breach: [{target: W_2F_kids__attic, from: 2F_attic, op: Thermite},
                {target: W_2F_game_room__walk_in, from: 2F_walk_in, op: "Striker or Fuze Hard Breach Charge"},
                {target: "H4 if reinforced", from: "not practical from below", op: "none"}]
  soft_breach: [{op: Sledge, targets: "W_2F_attic__trophy, W_2F_big_tower__attic, the Kids'/Dorm walls if left soft"},
                {op: Fuze, targets: "Cluster Charge through W_2F_kids__attic (reinforced ok) or through the Walk-In wall"}]
  vertical_from_below: "1F players can shoot up through Kids'/Dorm floors to deny anchors (destructible floors; exact tools UNVERIFIED)"   # DER
  anti_gadget: [{op: Brava, target: "jammers on W_2F_kids__attic; BP cams"}]
  intel: [{op: Dokkaebi, use: "flush the Big Tower / Attic roamers first"}]
  plant_spots: [{room: 2F_kids_dorms, from: "Attic breach", pos: UNVERIFIED},
                {room: 2F_dorm_main_hall, from: "west window, White Stairs door or Game Room", pos: UNVERIFIED}]
  post_plant: ["Attic through the Kids' breach", "Dining roof / west window", "Walk-In / Game Room"]   # DER
  flank_watch: [White Stairs (S2), Main Stairs (S3), Small Tower 2F]   # DER
```
Community notes (low trust, stated only as "consider" ideas): a 2025 Lemon8 5-stack post suggests reinforcing the Attic hatch when playing Kids' and putting a shield "near the window facing the EXT Bus Yard". The same post names Master Bedroom as a bomb site, which is wrong, so I used neither.

---

## 5. Global bot heuristics derived from the above (ev: DER)
- **Prep order (defense):** (1) reinforce top-down from `reinforce_priority`; (2) then Mute jammers and Mira mirrors on those walls; (3) Lesion, Sentry and Skopós placements; (4) open rotation holes in `leave_soft` walls; (5) barricades are already up by default (generic).
- **Prep order (attack):** drone the site to find out which `reinforce_priority` walls are actually reinforced and where jammers or mirrors are. Choose the spawn whose approach list reaches the **reinforced wall Thermite will hit** (B site: Freezer or Bunker; 1F sites: Small Tower, Rear Stage or Security; 2F: Attic).
- **Hard-breach sequence:** Brava or Striker EMP clears the jammer → Thermite plants → Sledge/Fuze pressure a second, soft angle (hatch or floor) at the same time → plant from the breach side.
- **Vertical rule:** from 2F onto 1F it's floors plus hatches. From 1F onto the basement it's **hatches only**. There's no vertical onto the basement from outside, and none onto Dining.
- **Roam timing:** roamers fall back to site before about the last 60 s of the action phase (UNVERIFIED as a community norm; tune it in `difficulty.json`).

---

## Open questions
(Ulo: answer in any format. "yes/no + a screenshot" is ideal. File names are in `SCREENSHOT_CHECKLIST.md`.)
- **SQ1:** For each site, which walls and hatches does your team usually reinforce? Is my priority list in each YAML close? The main doubts are B (Laundry–Freezer wall + Supply–Bunker wall + the Lobby and Meeting hatches?) and 2F (Kids'–Attic wall + Game Room–Walk-In?).
- **SQ2:** Are all the yellow "breakable" walls listed here actually **reinforceable**? Are the **exterior** walls of Oregon hard? The blueprint only marks the Garage south exterior wall as breakable.
- **SQ3:** Where exactly is each **bomb object** (7 rooms; Kitchen is shared by two sites)? The r6calls markers suggest: Laundry SW part, Supply centre, Dining north-centre, Kitchen centre-east, Meeting NW part, Kids' east part, Dorm Main Hall SW part. Screenshot each bomb from 2 angles. Also, what are the in-game A/B letters?
- **SQ4:** Standard Mira window spots on live Oregon (which wall, facing where) for Laundry/Supply and Kids'/Dorms.
- **SQ5:** Which spawn and entry do attackers usually take for each site? E.g., is basement usually "Freezer + Bunker"? Is 2F usually "Attic + west window"?
- **SQ6:** Common post-plant spots and default plant spots per bomb.
- **SQ7:** Does anyone reinforce the Meeting Hall floor hatch (H1) or the Kids' hatch (H4) on the 1F sites?
- **SQ8:** Is the Kids' north opening (~(744,440)) a window attackers use (from the Meeting Hall roof)?
- **SQ9:** Are there standard rotation holes (e.g., Laundry ↔ Supply Closet, Kids' ↔ Dorm) that everyone opens?
- **SQ10:** Where do the Siege X gas pipes and extinguishers change setups (e.g., a gas pipe next to a site door that defenders shoot in prep)?

## Sources
- https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints/r6-maps-oregon-blueprints.zip — official blueprints (breakable walls, hatches, destructible floors, doors). Analysed in scratch only
- https://www.r6trainer.com/oregon/ — PC callout room polygons over the blueprint crops (rework, 2020-03-19)
- https://r6calls.com/img/maps/oregon.svg — r6calls vector map (rev 5, last-modified 2026-07-25): bomb markers with A/B letters, default cameras, fire extinguishers, gas pipes (converted to blueprint px; details in `map_features.md` §2–3)
- https://siege.gg/news/destructible-ingredients-to-change-the-game-in-siege-x — gas pipe (15 s flame, ~3 s ground fire) and extinguisher (smoke + concussion) behaviour used in `bot_use` notes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/voidedge — rework changes (Kitchen Corridor, Freezer, removed doors, Attic doorway, ladder removal, site replacement)
- https://news.ubisoft.com/en-us/article/7jpjTlTV0IuZAhvGXnYgDW/rainbow-six-siege-operation-void-edge-operator-and-map-guide — rework summary
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — Y11S1 modernization (ingredients, lighting; no layout change announced)
- https://liquipedia.net/rainbowsix/Oregon — site numbering and pairs, attacker spawns
- https://rainbowsix.fandom.com/wiki/Oregon — site lists, 6 hatches
- `research/operators/*.md` (this repo, parallel agents) — gadget names, counts and interactions (Thermite 3 charges; Mute 4 jammers at 2.6 m, placed after reinforcing; Mira 2 mirrors on reinforceable walls only; Fuze Hard Breach option; Brava cannot hack Black Mirror/Gu/HB-5; Dokkaebi Jegeo Payload; Sledge 25 hammer uses, no effect on reinforced surfaces)
- https://steamcommunity.com/sharedfiles/filedetails/?id=1517322988 — 2018 Mira spots (**pre-rework**, context only)
- https://www.lootbar.com/blog/en/rainbow-six-mobile-mastering-the-map-oregon.html — R6 Mobile guide (low trust): Kitchen ceiling and walls soft; basement Mira windows over Laundry and Freezer
- https://www.lemon8-app.com/@schizosiege/7550474920049558029 — 2025 community post (low trust; contains errors), noted and not used
- https://alviran.net/blog/r6-oregon-callouts-guide-2026/ — 2026 SEO guide (low trust): callout aliases (Freezer, Bunker, Pillar, Attic, White) and generic "layer Freezer + Bunker + hatch" advice
