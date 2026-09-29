# Oregon — Map Features (spawns, cameras, ingredients, hatches, stairs, ladders, vaults, rappel, OOB, entries, lighting)
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: **medium-high** for hatches, stairs, ladder, spawns and site list (official blueprints + official Y5S1 rework notes + Liquipedia + R6 Trainer callouts + the r6calls vector map all agree). **Medium** for default-camera and destructible-ingredient *positions*: one community source (r6calls.com vector map, revision 5, last modified 2026-07-25, which already includes the Y11S1 ingredients) with no second source. **Low** for camera facing, vault/rappel specifics and spawn-peek spots. Ulo's screenshots should confirm these (see `SCREENSHOT_CHECKLIST.md`).

Scope: PLAN.md §2.2 item 9 and §9.2. Room geometry, wall surface types and the full door/window list belong to `layout_notes.md` (another agent). This file uses the same callout names and adds the features. Where the two files disagree, check the blueprint overlay method in §0.3.

Evidence tags used below:
- `[OFF]` official Ubisoft text (season page, news, patch notes)
- `[BP]` official Ubisoft blueprint images (downloaded to scratch only, analysed by overlay; see §0.3)
- `[LQ]` Liquipedia, `[FD]` Fandom, `[SGG]` siege.gg, `[R6T]` R6 Trainer room finder (callouts, updated for the rework on 2020-03-19)
- `[R6M]` Game8 R6 Mobile callout map (same reworked layout, **different callout names**; use only as a cross-check)
- `[R6C]` r6calls.com Oregon vector map (`https://r6calls.com/img/maps/oregon.svg`, map revision 5, file last-modified **2026-07-25**). Community-made, with per-floor layers for cameras, fire extinguishers, gas pipes, ladders, drone tunnels, hatches, bomb/secure/hostage markers, insertion points and labels. It already contains the Y11S1 ingredients, so it reflects the modernized map. The layout agent downloaded it; I converted its coordinates to blueprint px with the layout agent's published fit (`layout_notes.md` §0: `u = SVG_root − (617.588, 259.121)`, `px_x ≈ 2.019·u_x + 361.9`, `px_y ≈ 2.014·u_y + 115.7`). The conversion reproduces all 6 hatch positions within ~8 px.
- `[PRE]` pre-rework data (r6maps.com v2.4.1 data, 2019). Kept only as a baseline. **Do not build from it.**
- `[DER]` my inference from geometry plus general Siege rules. Treat as UNVERIFIED until Ulo confirms.

---

## 0. Version, reference frame, naming

### 0.1 Which Oregon
| Item | Value | Evidence |
|---|---|---|
| Layout | Y5S1 "Void Edge" rework (live 2020-03-10) | `[LQ]` reworkdate 2020-03-10; `[OFF]` Void Edge season page |
| Siege X modernization | **Y11S1 "Silent Hunt" (March 2026)**: "modernized touches to Coastline, Villa, and Oregon, bringing updated graphics and lighting to these maps alongside **new destructible ingredients** and an overall health pass." No layout change is announced. | `[OFF]` Silent Hunt season page; `[FD]` Patch 11.1.0 |
| Official map page | "Map reworked: March 2026"; playlists listed: Ranked, Quick Match, Unranked, Team Deathmatch | `[OFF]` map page |
| Ranked status | Silent Hunt notes: "Midway through the season, Coastline, Villa, **Oregon**, and Emerald Plains will be replaced by Skyscraper, Theme Park, Stadium Bravo, and Favela." The map page may be stale. This doesn't matter for us, and Custom Game should still offer Oregon (UNVERIFIED). | `[OFF]` |
| Official blueprints | The zip on the map page (server `last-modified` 2026-07-08) still contains the **2020-02-18** rework images. This fits "no layout change" in Y11S1. Those images are the geometry ground truth used here. | `[BP]` |

### 0.2 Reference frame (for `layout.json`)
- Images: `r6-maps-oregon-blueprint-{1..5}.jpg`, **1600×900 px**, one fixed camera for every floor: `1` = Basement, `2` = 1F (ground), `3` = 2F, `4` = roof level with the Big Tower top room, `5` = full roof. Download from `https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints/r6-maps-oregon-blueprints.zip` into a scratch folder, never into the repo.
- **North = up** in these images `[DER]`. Evidence: Ubisoft says Freezer Stairs connect the basement "to the west side of the map" and the Freezer is at the left. A pre-rework guide calls the Dorms' big window the "West double window", and the Dorms windows face left.
- All `(x, y)` below are **blueprint pixels** in this frame. The px→metre scale is **UNVERIFIED**; the layout agent should calibrate it, e.g., from a door width Ulo measures.
- Blueprint legend `[BP]`: "Breakable walls" (yellow dashes), "Breakable floor traps" (yellow checker = **hatches**), "Line of sight walls" (red dashes), "Line of sight floor" (red hatching = **destructible floor**). Ubisoft's own Rank Up video confirms that the blueprints show "where the soft walls are, the hatches and what part of the floor is destructible" `[FD]` (transcript of the official Rank Up video).

### 0.3 How positions were derived
The R6 Trainer room finder (`r6trainer.com/oregon/`) has clickable room polygons over **exact crops** of the official blueprints. I registered each crop against the full blueprint by normalized cross-correlation (score ≥ 0.998, scale 1.00). The offsets are B `(+344,+179)`, 1F `(+333,+180)`, 2F `(+330,+168)`. Each hatch square was then tested against the room polygons of its own floor and the floor below. The bounding boxes in §5 come from this method.

### 0.4 Callout crosswalk (the same room in each source)
| PC callout (R6 Trainer / Ubisoft) | R6 Mobile (Game8) | Pre-rework (r6maps) | Notes |
|---|---|---|---|
| Rear Stage (aka T1) | Tower Entrance | Rear Stage | Big Tower ground floor |
| Big Tower (aka T2) | Tower | Watch Tower | Big Tower 2F |
| Tower Stairs (1F/2F), **Back Stairs** (B) | Tower Stairs | Tower Stairs | same stairwell on 3 floors |
| Kitchen Corridor | Kitchen Hallway | — (new in Y5S1) | `[OFF]` "Big Tower now also connects directly to Kitchen … thanks to the Kitchen Corridor" |
| Split | Meeting Hall Lobby | Meeting Hall Entrance | small room at the south end of Meeting Hall |
| Security | CCTV | (Pantry? UNVERIFIED) | holds the 1F→Freezer hatch |
| Security Hall aka White Hall / **Security Corridor** | CCTV Hallway | Bathroom Corridor | `[OFF]` "Bathroom Corridor (now called Security Corridor)" |
| White Stairs (1F/2F), Freezer Stairs (B) | West/Freezer Stairs (1F), West Stairs (2F), Freezer Stairs (B) | Dorm Stairs | one stairwell, 3 floors (§5) |
| Main Stairs (1F/2F), Laundry Stairs (B) | East/Laundry Stairs (1F), East Stairs (2F), Laundry Stairs (B) | Main Stairs + Laundry Stairs | §5 |
| Small Tower 1F | Workshop Entrance | Office | `[OFF]` "small office tower has been expanded on both levels" |
| Small Tower 2F, Small Tower Office | Workshop Balcony, Workshop Office | Office Storage | `[FD]` Patch 5.2.1 names "1F Small Tower Office", so the office may exist on both floors (UNVERIFIED) |
| Dorm Main Hall (aka Dorm Hall / Bunks) | Main Dorms | Dorm Main Hall | bomb site |
| Kids' Dorms | Kids' Dorms | Kids Dorm | bomb site |
| Game Room | Game Room | Small Dorms | |
| Walk-In (aka Master Closet) | Closet | Walk-in | |
| Blue Bunker (aka Construction) | Bunker Entrance | Bunker / Bunker Entrance | basement room with outside stairs |
| Basement Hall | Basement Hallway | Basement Corridor | |
| Electric Room | Electrial [sic] Room | Electric Room | |

r6calls labels `[R6C]` (community, 2026). **B:** Tower Stairs, Boiler?, Electric, Blue / Bunker, Supply, Closet, **Pillar**, Basement Corridor, Laundry, Storage, Laundry Stairs, Freezer, Freezer Stairs. **1F:** Tower, Tower Stairs, **Stage**, Kitchen Corridor, Meeting, Split, Kitchen, Dining, Small Tower, **Small Stairs**, Showers, Shower Corridor, Security, Security Corridor, White Stairs, Classroom, Lobby, Garage, **Armory Stairs**. **2F:** Tower, Tower Stairs, Attic, **Low Attic**, Kids, Dorm, **Middle**, **Gaming**, Walk In, Master, Trophy, Armory Corridor, Armory, Armory Stairs, White Stairs, Small Tower, Office, Small Stairs, **Balcony**. **3F:** **Cat Walk**. `layout_notes.md` owns the final room list.

Community short names seen in 2026 guides (low-trust SEO source): "Freezer", "Bunker", "Pillar" (basement), "Trophy", "Master", "White", "Big Window". Keep them as aliases only.

---

## 1. Attacker spawns (3) and defender spawns (4)

| id | Name | Where (blueprint frame) | Main approaches from here `[DER]` | Evidence |
|---|---|---|---|---|
| A | **Junkyard** (EXT Junkyard) | West / south-west. Trailers, junk piles and fenced yard roughly x 0–330, y 450–900. Next to the **Bus Yard** (yellow school bus ≈ (550,750)). | Small Tower (1F door, 2F windows), Dining roof (flat roof west of the Dorms), Dorms west windows, south doors of Shower Corridor and White Hall, Freezer via White Stairs | `[LQ]` A - Junkyard; `[PRE]` same |
| B | **Street** | South edge: the road along the bottom of the image, south/south-east of Main Entrance and Garage (parked vans ≈ x 860–1100, y 700–800) | Main Entrance → Lobby, Garage, Classroom, Master/Balcony from rappel, Main/Laundry Stairs | `[LQ]` B - Street; `[PRE]` |
| C | **Construction Site** | North-east: half-built timber house and yellow excavator ≈ x 1050–1430, y 100–350 | Big Tower (Rear Stage east door), Blue Bunker (outside basement stairs), Meeting Hall east windows, Garage north door, Armory from rappel | `[LQ]` C - Construction Site; `[PRE]` |

- Spawn insertion points `[R6C]` (blueprint px; B lies **below the bottom edge** of the 1600×900 image): **A (79, 732)**, **B (942, 963)**, **C (1303, 109)**. r6calls also uses A = Junkyard, B = Street, C = Construction.
- Drone spawn: "your drone will now always spawn on the same side of the building as the one you first chose your operator to spawn from" `[OFF]` (Void Edge). You can still change spawn after prep.
- Exterior callouts. Current `[R6C]`: **Junkyard, Bus, Garden, Shooting Range, Construction, Parking, Main Entrance, Street**. Pre-rework `[PRE]` used "Bus Yard" and "Farmlands" (= r6calls "Garden", the north-west vegetable plots and greenhouse). Official names from patch notes: "EXT Construction Site", "EXT Dorms Roof" `[FD]` Patch 11.1.1.
- Roof callouts `[R6C]`: Tower Roof, Attic Roof, Meeting Roof, Kids Roof, Dorms Roof, Master Roof, Armory Roof, Small Tower Roof, Dining Roof, plus the 2F **Balcony**. The Big Tower top room is labelled **"Cat Walk"**.
- Defender spawn = the chosen bomb-site pair. Sites (confirmed by `[LQ]`, `[FD]`, `[SGG]`; plan list is correct):
  1. 2F Kids' Dorms / 2F Dorms Main Hall
  2. 1F Kitchen / 1F Dining Hall
  3. 1F Meeting Hall / 1F Kitchen
  4. B Laundry Room / B Supply Room
  `[OFF]` "the Tower bomb site has been replaced with the new Meeting Hall and Kitchen alternative" (the pre-rework site was 1F Rear Stage / 2F Watch Tower).

---

## 2. Default (security) cameras — **8** per r6calls (July 2026); facing UNVERIFIED

Primary source: the r6calls `cam` layers `[R6C]`, converted to blueprint px and matched to the R6 Trainer room polygons. This list fits the pre-rework list plus the rework's changes: the new Freezer area gained a camera, and the old "Dining Hall Corridor" camera now sits in "Shower Corridor". That fit supports it, but it's still a **single community source**. Mounting height and facing aren't in the data.

| id | Floor | Room (PC callout) | Blueprint px (icon centre) | Placement note `[R6C]` | Pre-rework equivalent `[PRE]` | Conf. |
|---|---|---|---|---|---|---|
| CAM1 | EXT | **Junkyard / Bus** side (west–south-west, off the Small Tower corner) | (275, 636) | Exterior, west of Small Tower's south end | EXT Junkyard | medium |
| CAM2 | EXT | **Parking / Street** side (south-east, beyond Garage) | (1101, 663) | Exterior, south-east of Garage | EXT Parking | medium |
| CAM3 | EXT | **Construction** (north-east) | (1032, 90) | Exterior, north-east yard | EXT Construction Site | medium |
| CAM4 | B | **Freezer** (west part) | (685, 532) | Watches the Freezer room | — (Freezer is new in Y5S1) | medium |
| CAM5 | 1F | **Rear Stage (T1)**, east end | (943, 302) | Big Tower ground floor | 1F Rear Stage | medium |
| CAM6 | 1F | **Lobby**, north edge of the east–west hall | (890, 544) | Near the Split door / Main Stairs | 1F Lobby | medium |
| CAM7 | 1F | **Shower Corridor**, south end (near the south exterior door and White Stairs) | (621, 650) | South-west corridor | 1F Dining Hall Corridor (renamed/moved) | medium |
| CAM8 | 2F | **Armory Corridor**, north end | (950, 508) | Looks down the corridor (south) toward Main/Armory Stairs `[PRE]` facing | 2F Armory Corridor | medium |

- Count: **8** `[R6C]` (pre-rework: 7 `[PRE]`, a Twinfinite snippet agrees with the 7). Ulo confirms (Q1).
- Facing `[DER]`/`[PRE]`: CAM8 south along Armory Corridor. CAM6 east–west across the Lobby hall. CAM5 west along Rear Stage. EXT cams along the adjacent façades. CAM4 and CAM7 facing is **UNVERIFIED**.
- Camera behaviour (rotation, zoom, destruction, ping) belongs to `research/intel.md` and `research/round_flow.md`.
- Greybox rule: wall- or ceiling-corner-mounted at ceiling height, tagged `verified: "r6calls_only"` until Ulo's `CAM_*` shots arrive.

---

## 3. Siege X destructible ingredients on Oregon

| Item | Value | Evidence |
|---|---|---|
| Present on live Oregon? | **Yes.** Y11S1 added "new destructible ingredients" to modernized Oregon | `[OFF]` Silent Hunt |
| Types on Oregon | **Gas pipes and fire extinguishers.** r6calls has separate layers for them on Oregon `[R6C]`. A community video titled "EVERY NEW Gas Pipe & Extinguisher Spot in Y11S1" covers the Y11S1 modernized maps; its content couldn't be fetched | `[R6C]`; YouTube title (dvZjsEc4XEg) |
| Metal detectors | **None.** r6calls defines a metal-detector layer type (`md`) but Oregon has no such layer `[R6C]`. siege.gg (updated Feb 2026) puts metal detectors on Bank and Border only | `[R6C]`, `[SGG]` |
| Count | **7 fire extinguishers + 2 gas pipes** `[R6C]` | medium (single source) |
| Behaviour (summary; `research/destruction.md` owns it) | **Gas pipe:** a shot releases a horizontal flame jet for **15 s**, then the pipe explodes and fire covers the area for **~3 s** `[SGG]`. **Fire extinguisher:** when shot it releases a smoke cloud and briefly **concusses** anyone close `[SGG]`. Both sides may pre-destroy them in prep `[SGG]` | `[SGG]` |

Locations `[R6C]` (icon positions, blueprint px; mounting wall and height UNVERIFIED). `layout_notes.md` lists the same items in its room table, in u-coordinates.

| id | Type | Floor | Room (PC callout) | Blueprint px | Tactical note `[DER]` |
|---|---|---|---|---|---|
| ING1 | fire extinguisher | B | **Basement Hall / Basement Corridor**, south part (between the Supply and Laundry doors) | (830, 481) | Smoke/concussion right at both basement-site doors |
| ING2 | fire extinguisher | B | **Freezer**, north arm (dark passage to Basement Hall) | (784, 512) | On the Freezer → Basement Hall route; next to the Laundry–Freezer wall |
| ING3 | fire extinguisher | 1F | **Security Corridor** (north wall, near the Security door) | (670, 589) | Over the White Stairs / Security approach |
| ING4 | fire extinguisher | 1F | **Kitchen Corridor** | (789, 376) | Big Tower ↔ Kitchen/Meeting route |
| ING5 | fire extinguisher | 1F | **Lobby hall / White Hall** junction (south of Split, near the Meeting SE corner) | (850, 541) | Lobby approach to Meeting and Kitchen |
| ING6 | fire extinguisher | 2F | **Trophy Room**, NE corner (top of Armory Corridor) | (920, 505) | Master/Armory side of the Dorms site |
| ING7 | fire extinguisher | 2F | **Low Attic** (the wide part of the Attic, beside Kids'/Dorm NE) | (853, 491) | On the Attic entry into the Dorms site |
| ING8 | **gas pipe** | 1F | **Main Stairs / Garage SW corner**. `layout_notes.md` reads it as "just outside the SW corner of Garage" | (940, 655) | Can flame-block the Main Stairs / Lobby-to-Garage path |
| ING9 | **gas pipe** | 2F | **Attic** (north connector, east wall) | (903, 411) | Can flame-block the Big Tower → Attic push on the Dorms site |

Data per instance: `{id, type, floor, room, bp_px, wall: UNVERIFIED, height_m: UNVERIFIED, verified: "r6calls_only"}`.

---

## 4. Hatches — **6 total** (matches `[FD]` "6 Hatches")

Hatch = "Breakable floor trap" square on the blueprint of the **upper** floor `[BP]`. "Lands in" = the room polygon on the floor below that contains that point (method §0.3).

| id | Opened from (upper floor, room) | Lands in (lower floor, room) | Blueprint px (centre) | Notes | Conf. |
|---|---|---|---|---|---|
| H1 | **1F Meeting Hall** (north part, just south of the Rear Stage wall) | **B Electric Room** | (893, 372) | Electric Room opens into Supply by a door (§5.2 of `common_setups.md`). Pre-rework Meeting Hall had **2** basement hatches; rework has **1** (player.one) | high |
| H2 | **1F Security** (east end) | **B Freezer** (east end, beside the Laundry–Freezer wall) | (742, 566) | Vertical route into Freezer. Its drop point is right next to the Laundry west wall | high |
| H3 | **1F Lobby** (between Classroom and Main Stairs) | **B Laundry Storage** (north-east corner) | (891, 615) | The rework's "Laundry hatch", "shifted to a less central location" (PC Gamer). r6calls' basement ceiling-hatch layer puts it in Laundry Storage too `[R6C]`. It sits close to the Laundry Stairs boundary, so a screenshot is still worthwhile (Q3) | medium-high |
| H4 | **2F Kids' Dorms** (west side) | **1F Kitchen** (west end) | (655, 490) | Kitchen ceiling under Kids' is also destructible floor (§9) | high |
| H5 | **2F Attic** (narrow north connector toward Big Tower) | **1F Meeting Hall** (north part) | (873, 383) | Sits almost directly above H1 (~20 px), so Attic → Meeting → Electric is one vertical column | high |
| H6 | **2F Armory** (south-east corner) | **1F Garage** | (1015, 610) | | high |

- Cross-check `[R6C]`: r6calls' floor/ceiling hatch layers give the same 6 hatches with the same upper/lower rooms. Its centres in blueprint px: H1 (895,373), H2 (746,567), H3 (893,615), H4 (653,489), H5 (867,383), H6 (1014,609).
- **No roof hatches** (no floor-trap squares on the roof blueprints) `[BP]`.
- Hatch HP, reinforcement and hole size: `research/destruction.md`. (Thermite's research says one Exothermic Charge opens a reinforced hatch; see `research/operators/thermite.md`.)
- Roster note: no roster operator can climb up through hatches (Oryx isn't on the roster). Hatches are **one-way drops** plus sightlines.

---

## 5. Stairs (every staircase)

| id | Name(s) | Connects | Blueprint px bbox per floor | Evidence | Conf. |
|---|---|---|---|---|---|
| S1 | **Tower Stairs** (1F/2F) = **Back Stairs** (B) | **B** (comes out at the north side of Boiler Room) ↔ **1F** Big Tower ground floor (Rear Stage/T1) ↔ **2F** Big Tower (T2) | B x838–887 y223–295; 1F x854–896 y222–271; 2F x866–906 y220–270 | `[R6T]` room polygons on all 3 floors at one footprint; `[R6M]` "Tower Stairs" on B and 1F; stair treads visible on the 2F blueprint | high |
| S2 | **White Stairs** (1F/2F; a.k.a. Dorm/West Stairs) → **Freezer Stairs** (B) | **2F** Dorm Main Hall (south-west) ↔ **1F** White Stairs, off Security Hall/White Hall (south-west) ↔ **B** Freezer Stairs → **Freezer** | 2F x649–756 y637–667; 1F x670–746 y629–649; B x644–713 y618–648 | `[OFF]` "the kids' dorm stairs now extending down one level and connecting through a new freezer section to the old basement"; `[OFF]` "Freezer … leads to the first floor with the Freezer Stairs" | high |
| S3 | **Main Stairs** (1F/2F; a.k.a. East Stairs; r6calls: **"Armory Stairs"**) → **Laundry Stairs** (B) | **2F** east, beside Armory Corridor/Master Bedroom ↔ **1F** east side of Lobby, beside Garage ↔ **B** Laundry Stairs → Laundry Room / Laundry Storage | 2F x936–956 y604–674; 1F x922–941 y580–665; B x908–931 y575–670 | `[R6T]` + `[R6M]` ("East/Laundry Stairs") + `[R6C]`. Whether the basement flight is the same continuous stairwell as the 1F↔2F flight is **UNVERIFIED** (pre-rework they were two separate stairs next to each other) | medium |
| S4 | **Small Tower stairs** (r6calls: **"Small Stairs"**) | **1F** Small Tower ↔ **2F** Small Tower | inside x378–484, y426–624 (a U-shaped stairwell cut-out is visible on 2F ≈ (395–445, 500–530)) | `[BP]` geometry; `[R6C]` labels "Small Stairs" on both 1F and 2F at the NE corner of Small Tower | medium |
| S5 | **Bunker stairs** (outside) | **EXT** (east side, Construction Site/Parking) ↔ **B Blue Bunker** | dark stairwell ≈ (945–1000, 385–445) inside Blue Bunker; exterior door on its east wall ≈ (1014, 369) | `[BP]`, `[R6M]` "Bunker Entrance", `[PRE]` "Bunker Entrance" | medium |

- Basement access summary: **3 interior staircases** (S1, S2, S3), confirmed by `[OFF]`/player.one ("the bottom floor has three staircases instead of two"). Plus S5 from outside, plus hatches H1–H3.
- 1F↔2F: S1, S2, S3, (S4), plus drops through H4/H5/H6 and destructible 2F floors.

---

## 6. Ladders

| id | Connects | Position | Evidence | Conf. |
|---|---|---|---|---|
| L1 | **2F Big Tower (T2) ↔ Big Tower top** ("Cat Walk" `[R6C]`; roof-level room, the map's highest point) | Inside Big Tower 2F's east room, at the north edge of the open well: r6calls ladder icon ≈ **(936–943, 239–247)** px `[R6C]` (my blueprint guess was (935, 232)). It's the only ladder in r6calls' ladder layers | `[FD]`/`[SGG]` "big tower … ladder stairs that lead to the highest point on the map"; `[R6C]`; `[PRE]` ladder 2F↔roof at Big Tower | high (exists), medium (spot) |
| — | ~~Attic ↔ Meeting Hall~~ | **Removed in Y5S1** | `[OFF]` "Attic … losing its ladder down to Meeting Hall" | high |

- Exterior ladders: none. There are none in r6calls' ladder layers `[R6C]`, and none are known elsewhere.
- Tower-top room: the floor is marked **destructible** ("line of sight floor"). It has openings on the north, west and south outer walls `[BP]`, likely windows.

### 6.1 Drone tunnels (small holes drones can pass; useful for bot droning) `[R6C]`
Icon positions in blueprint px, with the nearest rooms (which wall each one sits in is for `layout_notes.md` to confirm):
| Floor | px | Between (approx.) |
|---|---|---|
| B | (734–740, 658–670) | Freezer Stairs, south end. An up/down icon marks the **same spot on 1F**, so this is probably a vertical drone passage beside the White/Freezer stairs (UNVERIFIED) |
| B | (792, 499) | Freezer north arm ↔ Basement Hall |
| B | (839, 489) | Basement Hall ↔ Supply Closet / Supply |
| B | (942, 501) | Supply ↔ Blue Bunker (east wall) |
| 1F | (815, 360) | Kitchen Corridor ↔ Meeting Hall |
| 1F | (798, 449) | Kitchen Corridor ↔ Kitchen/Meeting |
| 1F | (782, 534) | Kitchen ↔ Security / White Hall |
| 1F | (625, 665) | Shower Corridor, south exterior wall |
| 1F | (457, 459) | Small Tower, north side |
| 2F | (864, 345) | Attic connector, north (Big Tower side) |
| 2F | (862, 578) | Game Room ↔ Master / Trophy |

---

## 7. Vault points

Generic vault rules (heights, speed, windows after the barricade breaks) live in `research/core_mechanics.md`. Oregon-specific items:

| Where | What | Evidence |
|---|---|---|
| Every window, once its barricade is gone | vaultable (generic Siege rule) | `research/core_mechanics.md` |
| EXT Construction Site | **metal fence is vaultable** (Y5S1.1 fixed players getting stuck after vaulting it) | `[FD]` Patch 5.1.1 |
| EXT construction area | **generator:** players could climb it for "an advantageous line of sight". Fixed in Y11S1.3, so treat it as **not climbable** | `[FD]` Patch 11.1.3 |
| EXT Construction Site | excavator: clipping fixed (Y5S1.2). Treat as solid, not climbable | `[FD]` Patch 5.1.2 |
| "some areas of Oregon" | "Inconsistent vaulting and vault issues" fixed in Y5S1.1 (no list) | `[FD]` Patch 5.1.1 |
| Bunk beds (Kids'/Dorms) | not vaultable (a deployable-shield exploit to vault onto them was fixed) | `[FD]` Patch 5.0 (2016-11-17, Red Crow), **pre-rework** |
| Tables, counters, crates, low walls, sandbags | UNVERIFIED per object. Use the generic ≤ waist-height rule | — |

---

## 8. Rappel anchor zones and roof access

Generic rappel rules, including Siege X changes (horizontal sprint on the rope, going around corners, inverted rappel, breaking windows): `research/core_mechanics.md`. Treat every roof edge as a rappel anchor over the exterior wall below it, unless Ulo reports a wall where rappel is refused (Q9).

| id | Roof / anchor zone | Blueprint px (approx.) | Walls you can rappel down / windows reached `[DER]` | Evidence |
|---|---|---|---|---|
| R1 | Big Tower roof and tower-top room | x 865–1000, y 195–320 | Big Tower 1F/2F/top windows (north, east, west) | `[BP]` roof images |
| R2 | Meeting Hall roof (green, gabled) | x 755–920, y 265–430 | Kitchen Corridor west wall, Kids' north window (≈ (745, 438), UNVERIFIED if it's a window) | `[BP]` |
| R3 | Main Dorms roof (brown shingles over the 2F block) | x 635–1070, y 430–715 | Kids' / Dorm Main Hall west windows ("Big Window"), Master/Walk-In south, Armory east | `[BP]` |
| R4 | Small Tower roof (shingles and solar panels) | x 360–570, y 470–590 | Small Tower 1F/2F walls and windows | `[BP]` |
| R5 | **Dining Hall flat roof** (concrete, walkable at 2F level; pre-rework callout "Dining Hall Roof") | x 450–635, y 410–665 | Lies between Small Tower 2F and the Dorms west wall. Standing platform for Dorms/Kids west-window entries | `[BP]`, `[PRE]` |
| R6 | Garage roof / Balcony (south-east, 2F level) | ≈ x 950–1070, y 640–715 | Master/Balcony, Garage | `[PRE]` "Garage Roof", "Balcony" |
| R7 | Corrugated strip east of the Attic | x 918–962, y 320–490 | Attic east side. The 2F blueprint shows an opening from Big Tower 2F onto this strip ≈ (943, 313) (UNVERIFIED) | `[BP]` |

- r6calls roof names `[R6C]` (use these as callouts): R1 = **Tower Roof** (+ "Cat Walk" = tower top room), R2 = **Meeting Roof**, R3 = **Kids Roof / Dorms Roof / Master Roof / Armory Roof** (split by the rooms below), R4 = **Small Tower Roof**, R5 = **Dining Roof**, R6 = **Balcony** (2F), R7 = **Attic Roof**.
- Roof access for attackers: rappel up any exterior wall (generic), or reach R5 at 2F level from Small Tower 2F / the Dorms windows. No exterior ladders are known.
- "EXT Dorms Roof" is an official location name (`[FD]` Patch 11.1.1: Solid Snake's radar could see 2F "from EXT Dorms Roof").

---

## 9. Vertical-play surfaces (summary for bots)

`[BP]` "line of sight floor" = destructible floor:
- **2F floors are destructible over most of the 2F block:** Kids' Dorms, Dorm Main Hall, Game Room, Walk-In, Trophy Room, Master Bedroom, Armory Corridor, Armory, White Stairs landing, Small Tower 2F and Office, and a small patch at the Big Tower end of the Attic connector. So **the Kitchen ceiling (under Kids') can be opened from above**, and Garage/Lobby/Classroom/Meeting-south ceilings are exposed from 2F.
- **The main Attic floor is not marked destructible** (only the hatch H5 and the tower-end patch). So the Meeting Hall ceiling is mostly hard.
- **No 1F floor is marked destructible.** Basement ceilings can only be opened through hatches H1–H3. This makes the basement site "hatch-and-stairs only" for vertical play.
- Tower-top floor: destructible.

---

## 10. Out-of-bounds / spawn-peek zones (defenders)

The generic rule (a defender outside the building is revealed after N seconds) belongs to `research/round_flow.md`. Oregon-specific data is **UNVERIFIED**:

| Candidate spawn-peek / run-out | Faces spawn | Notes `[DER]` |
|---|---|---|
| Big Tower windows (1F/2F) and **tower-top room** | C Construction Site | Highest vantage on the map. Whether standing in the tower top counts as "outside" is UNVERIFIED (it's an enclosed room on the blueprint) |
| Meeting Hall east windows, Garage north door | C / Parking | |
| Small Tower 1F door, 2F windows | A Junkyard / Bus Yard | Pre-rework pro play had a run-out from the small tower window (siege.gg story about Acez) |
| Dorm Main Hall / Kids' west windows | A (Bus Yard side) | |
| Master / Balcony, Main Entrance, Classroom | B Street | |
| Kitchen Corridor west exterior door ≈ (760, 407) | Farmlands (north-west) | Run-out route to flank Junkyard/Construction approaches (UNVERIFIED) |
| Blue Bunker outside stairs / east door | C Construction Site | Basement run-out |

For the game: build per-spawn **peek volumes** (window cones) plus a **building boundary volume**. The boundary = the union of all 1F/2F/B room polygons in §0.3, plus the Big Tower top room. Roofs R2–R7 are **outside**.

---

## 11. Windows and doors commonly used as entries

Only the first four rows have direct evidence. The rest are geometry-based candidates `[DER]` for Ulo to confirm (Q10).

| Entry | Floor → room | Evidence |
|---|---|---|
| Dorms "large central window" (the Big Window). **Repositioned in Y5S1** | 2F Dorm Main Hall / Kids' side, west façade (from R3/R5) | `[OFF]`/news: "The dorms have been revamped and the large central window has been repositioned" |
| New **exterior 2F window in the expanded Attic** | 2F Attic | `[OFF]` "a redesigned floorplan near the master bedroom and a new exterior second-floor window" |
| Main Entrance (barricaded door) | 1F Lobby, south, from Street | `[FD]` Patch 5.4.2 ("Main Entrance Barricade") |
| ~~Dining Hall exterior door~~ | **Removed in Y5S1** (replaced by a Small Tower ↔ Dining door ≈ (488, 437)) | `[OFF]` |
| Small Tower 1F west door ≈ (372, 595) and 2F windows | from Junkyard | `[BP]` |
| Shower Corridor south door ≈ (515, 664); White Hall south door ≈ (648, 664) | from Bus Yard / Street west | `[BP]` |
| Kitchen Corridor west door ≈ (760, 407) | from Farmlands (north-west) | `[BP]` |
| Rear Stage (Big Tower 1F) east door ≈ (955, 252) | from Construction Site | `[BP]` |
| Meeting Hall east windows ≈ (944, 377), (944, 475) | from Construction/Parking | `[BP]` |
| Garage north door ≈ (998, 525), east door ≈ (1035, 580) | from Parking/Street | `[BP]` |
| Armory east windows, Master/Balcony south (rappel) | 2F from R3/R6 | `[BP]` |
| Blue Bunker east door (bottom of outside stairs) ≈ (1014, 369) | B, from Construction Site | `[BP]` |

(`layout_notes.md` is the authority for which of these symbols are doors and which are windows.)

---

## 12. Lighting mood notes (art pass, PLAN §9.2 / §12)

| Aspect | Note | Evidence |
|---|---|---|
| Time of day | **Daytime only** since Y4S2 Phantom Sight (release had day and night variants) | `[LQ]` infobox |
| Siege X change | Y11S1 "updated graphics and lighting" | `[OFF]` |
| Sun | Blueprint renders show **low sun with long shadows toward the upper-left**. That's roughly a sun in the SE (late-morning or late-afternoon feel). Warm, slightly hazy daylight | `[BP]` visual |
| Exterior palette | Dry brown dirt, patchy green grass, weathered corrugated metal, rusty and green roofs, blue tarps, yellow school bus, yellow excavator | `[BP]` |
| Interior | "rustic, eclectic and lived-in"; "dark colors … lots of opportunities for defenders to roam and hide in corners" | `[OFF]` map description; `[FD]` overview |
| Dim pockets | Real dark corners exist: Ubisoft fixed "1F Small Tower Office … hard to see operators when prone in a dark corner" (Y5S2.1). Keep dark corners but never make them unreadable | `[FD]` Patch 5.2.1 |
| Signature rooms | Kitchen: black-and-white checker floor. Meeting Hall: stage and pews. Supply: red floor. Boiler and Blue Bunker: blue tarps. Kids': bunk beds. Big Tower top: sunlit open well | `[BP]` visual |
| Basement | **Darkest floor.** Pools of warm light from bare ceiling bulbs (bright circles in Basement Hall and Supply on the blueprint). No natural light except at the Bunker stairwell and the stair shafts | `[BP]` visual |
| Tip | Bake light from the windows into the 1F/2F interiors. Basement uses point lights only | — |

---

## 13. JSON-ready summary (for `data/maps/oregon/layout.json`)
```json
{
  "attacker_spawns": [
    {"id": "A", "name": "Junkyard", "side": "west", "verified": "yes"},
    {"id": "B", "name": "Street", "side": "south", "verified": "yes"},
    {"id": "C", "name": "Construction Site", "side": "north-east", "verified": "yes"}
  ],
  "hatches": [
    {"id": "H1", "upper": "1F_meeting_hall", "lower": "B_electric_room", "bp_px": [893,372], "verified": "blueprint"},
    {"id": "H2", "upper": "1F_security", "lower": "B_freezer", "bp_px": [742,566], "verified": "blueprint"},
    {"id": "H3", "upper": "1F_lobby", "lower": "B_laundry_storage", "bp_px": [891,615], "verified": "blueprint+r6calls"},
    {"id": "H4", "upper": "2F_kids_dorms", "lower": "1F_kitchen", "bp_px": [655,490], "verified": "blueprint"},
    {"id": "H5", "upper": "2F_attic", "lower": "1F_meeting_hall", "bp_px": [873,383], "verified": "blueprint"},
    {"id": "H6", "upper": "2F_armory", "lower": "1F_garage", "bp_px": [1015,610], "verified": "blueprint"}
  ],
  "stairs": [
    {"id": "S1", "names": ["Back Stairs","Tower Stairs"], "floors": ["B","1F","2F"], "verified": "yes"},
    {"id": "S2", "names": ["Freezer Stairs","White Stairs"], "floors": ["B","1F","2F"], "verified": "yes"},
    {"id": "S3", "names": ["Laundry Stairs","Main Stairs","Armory Stairs"], "floors": ["B","1F","2F"], "verified": "UNVERIFIED_continuity"},
    {"id": "S4", "names": ["Small Stairs"], "floors": ["1F","2F"], "verified": "r6calls_label"},
    {"id": "S5", "names": ["Bunker stairs"], "floors": ["EXT","B"], "verified": "UNVERIFIED"}
  ],
  "ladders": [{"id": "L1", "from": "2F_big_tower", "to": "3F_cat_walk", "bp_px": [940,243], "verified": "r6calls"}],
  "default_cameras": {"count": 8, "verified": "r6calls_only (facing UNVERIFIED)", "list": [
    {"id": "CAM1", "floor": "EXT", "area": "junkyard_bus", "bp_px": [275,636]},
    {"id": "CAM2", "floor": "EXT", "area": "parking_street", "bp_px": [1101,663]},
    {"id": "CAM3", "floor": "EXT", "area": "construction", "bp_px": [1032,90]},
    {"id": "CAM4", "floor": "B", "room": "freezer", "bp_px": [685,532]},
    {"id": "CAM5", "floor": "1F", "room": "rear_stage", "bp_px": [943,302]},
    {"id": "CAM6", "floor": "1F", "room": "lobby", "bp_px": [890,544]},
    {"id": "CAM7", "floor": "1F", "room": "shower_corridor", "bp_px": [621,650]},
    {"id": "CAM8", "floor": "2F", "room": "armory_corridor", "bp_px": [950,508]}]},
  "ingredients": {"verified": "r6calls_only", "instances": [
    {"id": "ING1", "type": "fire_extinguisher", "floor": "B", "room": "basement_hall", "bp_px": [830,481]},
    {"id": "ING2", "type": "fire_extinguisher", "floor": "B", "room": "freezer", "bp_px": [784,512]},
    {"id": "ING3", "type": "fire_extinguisher", "floor": "1F", "room": "security_corridor", "bp_px": [670,589]},
    {"id": "ING4", "type": "fire_extinguisher", "floor": "1F", "room": "kitchen_corridor", "bp_px": [789,376]},
    {"id": "ING5", "type": "fire_extinguisher", "floor": "1F", "room": "lobby_hall", "bp_px": [850,541]},
    {"id": "ING6", "type": "fire_extinguisher", "floor": "2F", "room": "trophy_room", "bp_px": [920,505]},
    {"id": "ING7", "type": "fire_extinguisher", "floor": "2F", "room": "low_attic", "bp_px": [853,491]},
    {"id": "ING8", "type": "gas_pipe", "floor": "1F", "room": "main_stairs_or_ext_garage_sw", "bp_px": [940,655]},
    {"id": "ING9", "type": "gas_pipe", "floor": "2F", "room": "attic", "bp_px": [903,411]}]}
}
```

---

## Open questions
- **Q1 (cameras):** r6calls shows **8** default cameras: EXT Junkyard/Bus, EXT Parking/Street, EXT Construction, B Freezer, 1F Rear Stage, 1F Lobby, 1F Shower Corridor, 2F Armory Corridor. Is that right? For each, which wall is it on and which way does it face (a screenshot of its view)?
- **Q2 (ingredients):** r6calls shows **7 fire extinguishers** (B Basement Hall, B Freezer, 1F Security Corridor, 1F Kitchen Corridor, 1F Lobby hall, 2F Trophy, 2F Low Attic) and **2 gas pipes** (1F by Main Stairs / Garage SW corner, 2F Attic). Is that all? Which wall and height is each on? Any metal detectors?
- **Q3 (Laundry hatch):** Does the 1F Lobby hatch (next to Classroom) drop into Laundry Storage, Laundry Room, or the Laundry Stairs?
- **Q4 (stairs):** Are Main Stairs (1F↔2F) and Laundry Stairs (B↔1F) one stairwell or two separate flights? Where exactly does each flight start and end?
- **Q5 (Small Tower):** r6calls labels "Small Stairs" in Small Tower. Confirm the staircase between 1F and 2F. Is there an office on both floors ("1F Small Tower Office" appears in a patch note)?
- **Q6 (Big Tower ladder):** Confirm the ladder spot (north edge of the open well in Big Tower 2F's east room). Is the tower top ("Cat Walk") indoors, i.e. no out-of-bounds reveal?
- **Q7 (Bunker):** Confirm the outside stairs down into Blue Bunker, and where they start outside.
- **Q8 (spawn names):** Are the in-game spawn names exactly "Junkyard", "Street", "Construction Site"? Are there only 3?
- **Q9 (rappel):** Any exterior walls or roofs where the game refuses rappel? Can you stand on the Dining Hall flat roof?
- **Q10 (entries):** Which windows do attackers actually use most on each site in your games (e.g., Big Window, Attic window, Armory, Meeting Hall east)?
- **Q11 (spawn-peek):** Which windows or doors are known spawn-peek spots on Oregon today?
- **Q12 (vaults):** Any notable vaultable props (Kitchen counters, Meeting Hall stage, basement shelving)?

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/maps/oregon — official description, "Map reworked: March 2026", playlists, blueprint zip link
- https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints/r6-maps-oregon-blueprints.zip — official blueprints (5 images, dated 2020-02-18; server last-modified 2026-07-08). Geometry, hatches, destructible floors, openings. Kept in scratch only
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — Y11S1 modernization (graphics, lighting, new destructible ingredients, health pass); Ranked rotation
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/voidedge — Y5S1 rework: Kitchen Corridor, Freezer and Freezer Stairs, Security Corridor rename, Dining door changes, Attic doorway and ladder removal, site replacement, drone spawn side
- https://news.ubisoft.com/en-us/article/7jpjTlTV0IuZAhvGXnYgDW/rainbow-six-siege-operation-void-edge-operator-and-map-guide — small tower expanded, dorm stairs extended to basement, attic window, ladder removed
- https://liquipedia.net/rainbowsix/Oregon — attacker spawns A/B/C, sites, rework date, day/night history
- https://rainbowsix.fandom.com/wiki/Oregon — "6 Hatches", site lists, overview (dark colours, big tower ladder)
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.1.1 (Y5S1.1, 2020-03-24), /Patch_5.1.2 (Y5S1.2, 2020-04-21), /Patch_5.2.1 (Y5S2.1, 2020-06-29), /Patch_5.4.2 (Y5S4.2, 2021-01-19), /Patch_11.1.0 , /Patch_11.1.1 , /Patch_11.1.3 — post-rework Oregon fixes (vaulting, fence, generator, excavator, Small Tower Office lighting, Main Entrance barricade, EXT Dorms Roof). /Patch_5.0 (2016-11-17) — pre-rework bunk-bed vault fix only. Note: Fandom's "Patch 5.x" numbering covers both 2016 and 2020 pages, so check the page date
- https://rainbowsix.fandom.com/wiki/Rank_Up_Intermediate_Series:_Map_Navigation_Strategies — official Rank Up transcript: blueprints show soft walls, hatches, destructible floor
- https://www.r6trainer.com/oregon/ and https://www.r6trainer.com/2020/03/19/oregon-updated/ — PC room polygons and callouts for the reworked map (updated 2020-03-19)
- https://r6calls.com/img/maps/oregon.svg — r6calls Oregon vector map (map revision 5 per r6calls' map data; file last-modified 2026-07-25). Cameras, fire extinguishers, gas pipes, ladder, drone tunnels, hatches, bomb markers, insertion points, room and roof labels. Downloaded by the layout agent to scratch; coordinates converted with the fit in `layout_notes.md` §0
- https://game8.co/games/Rainbow-Six-Mobile/archives/582535 — R6 Mobile Oregon callout maps (cross-check; its camera section shows Bank, not Oregon)
- https://www.r6maps.com/js/release.2.4.1/main.min.js and https://github.com/capajon/r6maps — pre-rework camera, spawn, ladder, hatch and room data (baseline only)
- https://www.player.one/rainbow-six-siege-all-major-changes-oregon-rework-133091 — rework change list (hatch count, three basement staircases)
- https://www.pcgamer.com/oregons-rework-in-rainbow-six-siege-void-edge-is-a-lot-to-take-in/ — Laundry hatch moved to a less central location
- https://siege.gg/news/destructible-ingredients-to-change-the-game-in-siege-x — ingredient behaviour; metal detectors on Bank/Border
- https://siege.gg/news/2966-rainbow-six-siege-map-guide-oregon — map structure, sites, small-tower-window anecdote
- https://www.youtube.com/watch?v=dvZjsEc4XEg — title only ("EVERY NEW Gas Pipe & Extinguisher Spot in Y11S1"); content not accessible
- https://www.youtube.com/watch?v=IpvWbQbid5Q — "Oregon Map Rework Camera Guide!" (title via oEmbed; content not accessible). The best lead for Q1
- https://alviran.net/blog/r6-oregon-callouts-guide-2026/ — 2026 community short names only (low trust)
