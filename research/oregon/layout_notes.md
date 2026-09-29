# Oregon — layout notes (rooms, callouts, dimensions, connections)
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29. The geometry is the Y5S1 rework, which has been unchanged through the Y11S1 modernization (see `version.md`).
Confidence: **high** for room list, soft walls, hatches and stair connectivity (official blueprints, r6calls vector map and R6 Mobile blueprints all agree). **Medium** for dimensions (scale inferred, ±15%) and for which wall openings are doors vs windows (blueprint glyphs don't separate them; see §8).

Companion files: `surfaces.md` (surface tagging per wall/floor), `version.md`, `refs/SOURCES.md`. Cameras, spawns, ingredients, rappel/OOB zones and setups are covered by the other Oregon research agent. They are mentioned here only where they help to orient.

---

## 1. Coordinate system and scale (reuse this in `layout.json`)
- **Unit `u`** = r6calls.com SVG floor-local unit. **Origin** = top-left corner of r6calls' per-floor image square (361.244 u × 361.244 u; the embedded 1024 px floor PNG has 1 px = 0.3528 u). **+X = east, +Y = south** (screen coordinates; north is up in r6calls and in the official Ubisoft blueprints).
- All floors share the same origin, so a point (x, y) is vertically aligned across B/1F/2F/3F/Roof. Example: hatch H1 is at the identical u-rect on 1F (floor) and B (ceiling).
- Converting from the r6calls SVG (`https://r6calls.com/img/maps/oregon.svg`): inside a `Floor N` group, `u = (x − 236.996, y − 64.0)`. From SVG root/viewBox coords: `u = (X − 617.588, Y − 259.121)`.
- **Converting to/from the official Ubisoft blueprint pixels** (1600×900 images, the frame used in `map_features.md`): `px_x ≈ 2.019·u_x + 361.9`, `px_y ≈ 2.014·u_y + 115.7`. Inverse: `u_x ≈ (px_x − 361.9)/2.019`, `u_y ≈ (px_y − 115.7)/2.014`. So **1 blueprint px ≈ 0.496 u ≈ 0.074 m**. Fitted on the 6 hatch centres from both files; residuals ≤ 6 px.
- **Scale estimate: 1 u ≈ 0.15 m (≈ 6.7 u per metre), ±15%. ESTIMATE.**
  - Basis: the tipped-over yellow school bus south of the west wing measures ≈ 77 u long. A Type-C school bus is ≈ 10.5–12.2 m long; 11.5 m gives 0.149 m/u.
  - Sanity checks: doorway gaps ≈ 9–11 u (1.35–1.65 m); reinforceable wall sections ≈ 9–13 u (1.3–2.0 m); 1F footprint ≈ 328 × 234 u ≈ 49 × 35 m.
- The room boxes below were read off gridded renders to about ±2 u. Boxes are axis-aligned bounding boxes; several rooms are L-shaped (noted).
- **Storey heights: UNVERIFIED.** Use placeholders of 3.2 m floor-to-floor for B→1F→2F and 3.0 m for 2F→3F catwalk until Ulo confirms (see Open questions). The Meeting Hall appears to be single-storey under a pitched roof, with the Attic running along its east side.
- **Floor codes:** `B` (basement), `1F`, `2F`, `3F` (Big Tower catwalk), `RF` (roof surfaces), `EXT` (ground-level exterior). Fandom and the official zip use European naming ("Ground" = 1F, "1st Floor" = 2F, "2nd Floor" = 3F tower top).

## 2. Callout / room-ID table
The in-game PC HUD location names are not published in any list we could find. Names come from three sources:
- **r6calls** = PC community/pro callouts (r6calls.com, rev 5, 2026).
- **R6M** = Ubisoft's official Rainbow Six **Mobile** blueprint labels. R6M uses the same rework layout; the names look like Ubisoft's own, but Mobile ≠ PC.
- **PC official** = names confirmed from PC game text: bomb-site names (Liquipedia/Fandom) and "EXT Dorms Roof" (Y11S1.1 patch notes).

| room_id | Floor | r6calls (PC) | R6M (official Mobile) | PC official name (verified) | PLAN starter-list name |
|---|---|---|---|---|---|
| B_TOWER_STAIRS | B | Tower Stairs | Tower Stairs | — | — |
| B_BOILER | B | Pillar | Boiler | — | — |
| B_ELECTRIC | B | Electric | Electric Room | — | — |
| B_BUNKER_ENTRANCE | B | Blue | Bunker Entrance | — | — |
| B_SUPPLY | B | Supply | Supply | **B Supply Room** (site 4) | Supply ✓ |
| B_SUPPLY_CLOSET | B | Closet | Supply Closet | — | — |
| B_CORRIDOR | B | Basement Corridor | Basement Hallway | — | — |
| B_FREEZER_HALL | B | (unlabeled) | (part of Freezer) | — | — |
| B_FREEZER | B | Freezer | Freezer | — | — |
| B_FREEZER_STAIRS | B | Freezer Stairs | Freezer Stairs | — | — |
| B_LAUNDRY | B | Laundry | Laundry | **B Laundry Room** (site 4) | Laundry ✓ |
| B_LAUNDRY_STORAGE | B | Storage | Laundry Storage | — | — |
| B_LAUNDRY_STAIRS | B | Laundry Stairs | Laundry Stairs | — | Laundry Stairs ✓ |
| 1F_SMALL_TOWER | 1F | Small Tower (+ "Small Stairs") | Workshop Entrance | — | Small Tower ✓ |
| 1F_DINING | 1F | Dining | Dining Room | **1F Dining Hall** (site 2) | Dining Hall ✓ |
| 1F_SHOWERS | 1F | Showers | Showers | — | — |
| 1F_DINING_HALLWAY | 1F | (unlabeled) | Dining Hallway | — | — |
| 1F_SHOWER_CORRIDOR | 1F | Shower Corridor | Showers Hallway | — | — |
| 1F_KITCHEN | 1F | Kitchen | Kitchen | **1F Kitchen** (sites 2 & 3) | Kitchen ✓ |
| 1F_KITCHEN_CORRIDOR | 1F | Kitchen Corridor | Kitchen Hallway | — | — |
| 1F_TOWER | 1F | Tower | Tower Entrance | — | Big Tower ✓ |
| 1F_TOWER_STAIRS | 1F | Tower Stairs | Tower Stairs | — | — |
| 1F_MEETING_HALL | 1F | Meeting | Meeting Hall | **1F Meeting Hall** (site 3) | Meeting Hall ✓ |
| 1F_STAGE | 1F | Stage (north end of Meeting) | (part of Meeting Hall) | — | — |
| 1F_SPLIT | 1F | Split | Meeting Hall Lobby | — | — |
| 1F_SECURITY | 1F | Security | CCTV | — | — |
| 1F_SECURITY_CORRIDOR | 1F | Security Corridor | CCTV Hallway | — | — |
| 1F_WHITE_STAIRS | 1F | White Stairs | West Stairs | — | — |
| 1F_LOBBY | 1F | Lobby | Lobby Entrance | — | Lobby ✓ |
| 1F_CLASSROOM | 1F | Classroom | Classroom | — | — |
| 1F_ARMORY_STAIRS | 1F | Armory Stairs | East Stairs | — | — |
| 1F_GARAGE | 1F | Garage | Garage | — | — |
| 2F_SMALL_TOWER | 2F | Small Tower (+ "Small Stairs") | Workshop Balcony | — | Small Tower (2F) |
| 2F_OFFICE | 2F | Office | Workshop Office | — | — |
| 2F_KIDS_DORMS | 2F | Kids | Kids' Dorms | **2F Kids' Dorms** (site 1) | Kids' Dorms ✓ |
| 2F_DORMS_MAIN_HALL | 2F | Dorm | Dorms | **2F Dorms Main Hall** (site 1) | Dorms Main Hall ✓ |
| 2F_MIDDLE | 2F | Middle | (unlabeled hall) | — | — |
| 2F_GAME_ROOM | 2F | Gaming | Game Room | — | — |
| 2F_WALK_IN | 2F | Walk In | Bedroom Closet | — | — |
| 2F_MASTER_BEDROOM | 2F | Master | Bedroom | — | Master Bedroom ✓ |
| 2F_TROPHY | 2F | Trophy | Trophy Room | — | — |
| 2F_LOW_ATTIC | 2F | Low Attic | Attic (south part) | — | Attic ✓ |
| 2F_ATTIC | 2F | Attic | Attic (north part) | — | Attic ✓ |
| 2F_TOWER | 2F | Tower Stairs (2F) | Tower / Tower Stairs | — | Big Tower (2F) |
| 2F_ARMORY_CORRIDOR | 2F | Armory Corridor | Armory Hallway | — | — |
| 2F_ARMORY_STAIRS | 2F | Armory Stairs | East Stairs | — | — |
| 2F_ARMORY | 2F | Armory | Armory | — | Armory ✓ |
| 2F_WHITE_STAIRS | 2F | White Stairs | West Stairs | — | — |
| 3F_CATWALK | 3F | Cat Walk | (not on R6M) | — | "Big Tower top" ✓ |
| RF_* | RF | Tower Roof, Meeting Roof ×2, Attic Roof, Kids Roof, Dorms Roof, Master Roof, Armory Roof, Dining Roof, Small Tower Roof | Tower Roof, West Roof, East Roof, Main Roof, Small Roof, Terrace | **EXT Dorms Roof** (patch 11.1.1) | Roof |
| EXT_* | EXT | Junkyard, Street, Construction, Bus, Main Entrance, Parking, Garden, Shooting Range, Bunker | Junkyard, Street, Construction Site | Spawns: Junkyard, Street, Construction Site (Liquipedia) | Construction Site / Junkyard / Street ✓ |

Starter-list corrections:
- "Big Tower" on 1F is the tower's ground room (r6calls "Tower", R6M "Tower Entrance").
- "Small Tower" is the separate west wing (1F workshop plus a 2F annex), not a tower you climb.
- "Attic" is two spaces: Low Attic (E–W, north of Middle/Trophy) and Attic (N–S strip toward the Big Tower).
- "Big Tower top" = 3F "Cat Walk", reached only by a ladder from 2F Tower.

## 3. Bomb sites (Bomb mode) — verified
Site numbering and A/B letters follow r6calls markers (in-game letters UNVERIFIED). Marker positions are icon anchors, not exact bomb-object positions.

| Site | A | B | r6calls marker A (u) | r6calls marker B (u) | Sources |
|---|---|---|---|---|---|
| 1 | 2F Dorms Main Hall | 2F Kids' Dorms | (164–172, 243–251) | (194–202, 180–187) | Liquipedia, Fandom, r6calls |
| 2 | 1F Dining Hall | 1F Kitchen | (98–106, 156–164) | (173–181, 172–180) | same |
| 3 | 1F Meeting Hall | 1F Kitchen | (231–239, 123–131), north end near Stage | (173–181, 180–188) | same |
| 4 | B Laundry Room | B Supply Room | (214–222, 225–233), west end | (257–265, 162–170) | same |

PLAN §2.2 list confirmed exactly: B Laundry/Supply; 1F Kitchen/Dining Hall; 1F Meeting Hall/Kitchen; 2F Kids' Dorms/Dorms Main Hall.
- Secure Area (Fandom): 2F Dorms Main Hall, 1F Dining Hall, 1F Meeting Hall, B Laundry Room. Liquipedia's "2F Dining Hall" is a typo.
- Hostage: 2F Dorms Main Hall, 1F Kitchen, 1F Meeting Hall, B Supply Room.

## 4. Rooms by floor (dimensions are ESTIMATES: u × 0.15 m)

### 4.1 Basement (B)
Basement ceilings are **hard concrete except 3 hatches** (see `surfaces.md`).

| room_id | bbox x (u) | bbox y (u) | approx size (m) | shape / contents |
|---|---|---|---|---|
| B_TOWER_STAIRS | 232–262 | 45–88 | 4.5 × 6.5 | Stair shaft up to 1F/2F Tower stairs; opens south into Boiler |
| B_BOILER | 211–283 | 88–135 | 10.8 × 7.1 | L-shape (Electric cut out of SE corner). Freestanding structural pillar ≈ (228–236, 108–117) → HARD |
| B_ELECTRIC | 258–283 | 116–135 | 3.8 × 2.9 | Hatch H1 in ceiling (from 1F Meeting Hall) |
| B_BUNKER_ENTRANCE | 285–322 | 90–185 | 5.6 × 14.3 | L-shape (south part x 285–313, y 135–185). Dark rectangle (287–300, 137–165), use UNVERIFIED (pit/stairs?). East door to exterior Bunker |
| B_SUPPLY | 237–283 | 137–198 | 6.9 × 9.2 | Site 4B. Closet occupies its SW corner; a strip x 266–283 runs south beside the Closet |
| B_SUPPLY_CLOSET | 237–262 | 180–198 | 3.8 × 2.7 | Opens east into Supply |
| B_CORRIDOR | 214–235 | 137–199 | 3.2 × 9.3 | N–S hallway Boiler → Laundry. Fire extinguisher ≈ (231–234, 179–183) |
| B_FREEZER_HALL | 196–209 | 150–200 | 2.0 × 7.5 | Dark N–S passage, the north arm of Freezer. Extinguisher ≈ (208–211, 194–198) |
| B_FREEZER | 140–211 | 200–232 | 10.7 × 4.8 | Hatch H2 in ceiling (from 1F Security) |
| B_FREEZER_STAIRS | 140–180 | 232–265 | 6.0 × 5.0 | Stairs up to 1F White Stairs |
| B_LAUNDRY | 214–287 | 201–232 | 11.0 × 4.7 | Site 4A |
| B_LAUNDRY_STORAGE | 243–266 | 235–277 | 3.5 × 6.3 | Hatch H3 in ceiling (from 1F Lobby) |
| B_LAUNDRY_STAIRS | 267–283 | 232–277 | 2.4 × 6.8 | Stairs up to 1F Armory Stairs |

### 4.2 First floor (1F)
| room_id | bbox x (u) | bbox y (u) | approx size (m) | shape / contents |
|---|---|---|---|---|
| 1F_SMALL_TOWER | 3–63 | 173–256 | 9.0 × 12.5 | L-shape plus a north arm x 49–63, y 150–173. **Small Stairs** in NW corner (3–34, 175–193) up to 2F Small Tower |
| 1F_DINING | 66–134 | 150–206 | 10.2 × 8.4 | Site 2A |
| 1F_SHOWERS | 66–117 | 209–254 | 7.7 × 6.8 | — |
| 1F_DINING_HALLWAY | 120–134 | 209–255 | 2.1 × 6.9 | N–S hall: Dining → Shower Corridor / Security Corridor |
| 1F_SHOWER_CORRIDOR | 49–134 | 256–271 | 12.8 × 2.3 | E–W hall along the south facade |
| 1F_KITCHEN | 137–214 | 155–206 | 11.6 × 7.7 | Sites 2B/3B. Checkerboard floor. NE alcove (203–214, 157–178) behind a partition. Hatch H4 in ceiling (from 2F Kids') at (139–149, 180–191) |
| 1F_KITCHEN_CORRIDOR | 200–213 | 99–157 | 2.0 × 8.7 (+ NE room 213–240 × 99–121 ≈ 4.1 × 3.3) | L-shape. Extinguisher ≈ (211–213, 126–131) |
| 1F_TOWER | 200–290 | 73–97 | 13.5 × 3.6 (+ NE part 268–290 × 49–73) | Big Tower ground room |
| 1F_TOWER_STAIRS | 241–265 | 49–96 | 3.6 × 7.1 | Stairs B↔1F↔2F |
| 1F_MEETING_HALL | 217–287 | 121–206 | 10.5 × 12.8 (+ Stage) | Site 3A. Open to Stage on the north. Floor hatch H1 at (259–270, 122–133); ceiling hatch H5 at (245–256, 127–138) |
| 1F_STAGE | 243–287 | 99–121 | 6.6 × 3.3 | Raised north end of Meeting Hall (open, no wall) |
| 1F_SPLIT | 222–262 | 180–206 | 6.0 × 3.9 | Small room on Meeting's south edge; doors W, E, S |
| 1F_SECURITY | 137–204 | 209–231 | 10.1 × 3.3 | Floor hatch H2 at (185–196, 219–230) |
| 1F_SECURITY_CORRIDOR | 137–207 | 232–250 | 10.5 × 2.7 (+ SW nook 137–146 × 250–272) | Extinguisher ≈ (152–154, 232–237) |
| 1F_WHITE_STAIRS | 146–197 | 252–268 | 7.7 × 2.4 | Central stairwell B↔1F↔2F; stairs down at the east end (185–197) |
| 1F_LOBBY | 204–290 | 209–226 (hall) + 246–272 × 226–282 (entrance) | hall 12.9 × 2.6; entrance 3.9 × 8.4 | T-shape. Main entrance at the south. Floor hatch H3 at (258–269, 243–253). Extinguisher ≈ (241–243, 208–213) |
| 1F_CLASSROOM | 208–243 | 227–281 | 5.3 × 8.1 | — |
| 1F_ARMORY_STAIRS | 272–287 | 228–268 | 2.3 × 6.0 | Stairs B↔1F↔2F (east stairwell) |
| 1F_GARAGE | 290–330 | 202–264 | 6.0 × 9.3 | Ceiling hatch H6 at (318–329, 240–251) from 2F Armory. Gas pipe just outside the SW corner ≈ (286–291, 263–268) |

### 4.3 Second floor (2F)
| room_id | bbox x (u) | bbox y (u) | approx size (m) | shape / contents |
|---|---|---|---|---|
| 2F_SMALL_TOWER | 7–62 | 181–229 | 8.3 × 7.2 | Separate west annex (not connected to the main 2F indoors). Small Stairs arrive in the NW corner (7–30, 181–193). Internal partition (20–43, 191–229) |
| 2F_OFFICE | 65–97 | 181–229 | 4.8 × 7.2 | Annex room east of Small Tower 2F |
| 2F_KIDS_DORMS | 140–209 | 160–204 | 10.4 × 6.6 | Site 1B, above 1F Kitchen. Floor hatch H4 |
| 2F_DORMS_MAIN_HALL | 140–201 | 207–254 | 9.2 × 7.1 | Site 1A. Opens east into Middle |
| 2F_MIDDLE | 205–249 | 191–225 | 6.6 × 5.1 | Central hub |
| 2F_GAME_ROOM | 204–248 | 227–254 | 6.6 × 4.1 | — |
| 2F_WALK_IN | 224–248 | 257–273 | 3.6 × 2.4 | Closet between Game Room and Master |
| 2F_MASTER_BEDROOM | 251–280 | 227–272 | 4.4 × 6.8 | Balcony door on the south |
| 2F_TROPHY | 251–280 | 190–224 | 4.4 × 5.1 | Extinguisher marker ≈ (276–278, 190–195) at its NE corner, by the top of the Armory Corridor |
| 2F_LOW_ATTIC | 211–273 | 160–187 | 9.3 × 4.1 | Extinguisher ≈ (242–245, 183–188) |
| 2F_ATTIC | 249–273 | 99–160 | 3.6 × 9.2 | N–S strip over the east side of Meeting Hall. Floor hatch H5 at (245–256, 127–138). Gas pipe ≈ (268–273, 142–147) |
| 2F_TOWER | 220–300 | 73–99 (+ 246–300 × 47–73) | 12 × 3.9 (+ 8.1 × 3.9) | Big Tower 2F. Tower stairs (246–270, 47–96) arrive here. **Ladder to 3F** ≈ (280–287, 55–66) |
| 2F_ARMORY_CORRIDOR | 283–296 | 190–245 | 2.0 × 8.3 | Default-camera icon at its north end (see the cameras file from the other agent) |
| 2F_ARMORY_STAIRS | 283–296 | 245–275 | 2.0 × 4.5 | East stairwell top |
| 2F_ARMORY | 299–333 | 205–254 | 5.1 × 7.4 | Floor hatch H6 at (318–329, 240–251) |
| 2F_WHITE_STAIRS | 140–205 | 256–276 | 9.8 × 3.0 | Central stairwell top landing |

### 4.4 Big Tower top (3F)
| room_id | bbox x (u) | bbox y (u) | approx size (m) | notes |
|---|---|---|---|---|
| 3F_CATWALK | 253–310 | 43–100 | 8.6 × 8.6 | Square walkway ring (destructible floor per r6calls `3-losf`) around a central square (260–297, 56–85 ≈ 5.6 × 4.4 m). The central square is most likely open to the 2F Tower room below (UNVERIFIED). Reached by the ladder from 2F_TOWER. Openings: north (257–266, y 43–46) and south (285–294, y 97–100, facing the Meeting/Attic roofs) |

### 4.5 Roof surfaces (RF)
These are walkable exterior surfaces for rappel play. Approximate extents come from the r6calls roof layer; heights are UNVERIFIED.

| id | r6calls name | x (u) | y (u) | notes |
|---|---|---|---|---|
| RF_TOWER | Tower Roof | 246–318 | 41–101 | Top of the Big Tower (highest point) |
| RF_TOWER_LOW | Tower Roof (2nd label) | 193–246 | 72–100 | Lower roof over the west half of the 2F Tower room |
| RF_MEETING_W | Meeting Roof | 193–246 | 100–158 | Pitched roof over the west side of Meeting Hall / Kitchen Corridor; **walkable at 2F level** (the 2F Tower and Attic have openings onto it) |
| RF_ATTIC | Attic Roof | 246–278 | 101–158 | Over 2F Attic |
| RF_MEETING_E | Meeting Roof | 278–295 | 101–199 | Narrow strip east of the Attic at 2F level; openings from 2F Tower, 3F Catwalk, 2F Armory Corridor |
| RF_KIDS | Kids Roof | 136–246 | 157–204 | Corrugated roof over Kids' Dorms |
| RF_DORMS | Dorms Roof | 136–249 | 204–260 | **Official name "EXT Dorms Roof"** |
| RF_MASTER | Master Roof | 219–301 | 235–279 | — |
| RF_ARMORY | Armory Roof | 270–345 | 204–263 | — |
| RF_DINING | Dining Roof | 46–136 | 148–273 | **Flat roof at 2F level** wrapping around the 2F Small Tower/Office annex. Openings into 2F Office, 2F Small Tower and 2F Dorms Main Hall |
| RF_SMALL_TOWER | Small Tower Roof | 1–103 | 176–263 | Pitched; 2 skylights and solar panels visible. Skylights are not marked as breakable (UNVERIFIED) |
| EXT_BALCONY | Balcony (2F) | 225–300 | 274–285 | Over the 1F main entrance; door into Master Bedroom |

### 4.6 Exterior (EXT) and attacker spawns
Label anchors come from r6calls, converted to u (the building occupies x 0–345, y 40–285).

| id | name | anchor (u) | notes |
|---|---|---|---|
| EXT_JUNKYARD | **Junkyard** (spawn A) | label (−108, 252); insertion point ≈ (−140, 306) | West/south-west |
| EXT_STREET | **Street** (spawn B) | label (130, 399); insertion point ≈ (287, 420) | South road |
| EXT_CONSTRUCTION | **Construction (Site)** (spawn C) | labels (368, 138) and (266, 4); insertion point ≈ (466, −3) | North-east: construction yard with an unfinished timber building, excavator and a generator (the Y11S1.3 exploit fix) |
| EXT_BUS | Bus | (88, 319) | Tipped-over school bus south of the west wing |
| EXT_MAIN_ENTRANCE | Main Entrance | (251, 335) | Yard in front of 1F Lobby's south door |
| EXT_PARKING | Parking | (361, 299) | South-east vehicles |
| EXT_GARDEN | Garden | (69, 127) | North of Dining / Small Tower; vegetable plots |
| EXT_SHOOTING_RANGE | Shooting Range | (164, 62) | North of Kitchen / Kitchen Corridor |
| EXT_BUNKER | Bunker | (331, 128) | Sunken exterior passage (322–352+, 110–136) leading from the Construction side down into B_BUNKER_ENTRANCE |

Spawn letters: Liquipedia and r6calls use A = Junkyard, B = Street, C = Construction Site. R6 Mobile uses A = Street, B = Junkyard. The other Oregon agent owns spawn details.

Unnamed exterior features visible on the official blueprints (names UNVERIFIED): a greenhouse (north), two grain silos and water tanks (north-west), sheds, and the construction-site excavator (north-east).

## 5. Vertical connections

### 5.1 Stairs
| id | Floors | Footprint per floor (u) | Notes |
|---|---|---|---|
| ST_TOWER | B ↔ 1F ↔ 2F | B (232–262, 45–88); 1F (241–265, 49–96); 2F (246–270, 47–96) | Big Tower stairwell (all three sources) |
| ST_WHITE (West Stairs) | B ↔ 1F ↔ 2F | B Freezer Stairs (140–180, 232–265); 1F White Stairs (146–197, 252–268); 2F White Stairs (140–205, 256–276) | R6M names B "Freezer Stairs" and 1F/2F "West Stairs" at the same spot. B↔1F continuity is inferred from alignment (medium confidence) |
| ST_ARMORY (East Stairs) | B ↔ 1F ↔ 2F | B Laundry Stairs (267–283, 232–277); 1F Armory Stairs (272–287, 228–268); 2F Armory Stairs (283–296, 245–275) | R6M: "Laundry Stairs" → "East Stairs". The 2F footprint is shifted about 11 u east (dog-leg), UNVERIFIED |
| ST_SMALL | 1F ↔ 2F | 1F (3–34, 175–193); 2F (7–30, 181–193) | Small Tower stairs; the only indoor link to the 2F annex |
| ST_EXT_TOWER_E | EXT ↔ 1F? | exterior (291–305, 48–90), outside the 1F Tower east door | Exterior staircase visible on the blueprints; where it leads is UNVERIFIED |
| ST_EXT_BUNKER | EXT ↔ B | EXT_BUNKER passage (322–352+, 110–136) | Ramp/stairs down into B Bunker Entrance, UNVERIFIED |

### 5.2 Hatches (6 total, matching Fandom "6 Hatches")
All three sources list the same six. Size ≈ 11 × 11 u ≈ 1.6 × 1.6 m (ESTIMATE).

| id | Top room (floor side) | Bottom room (ceiling side) | Rect (u) |
|---|---|---|---|
| H1 | 1F_MEETING_HALL (NE, beside Stage) | B_ELECTRIC | (258.6–269.6, 122.1–133.1) |
| H2 | 1F_SECURITY | B_FREEZER | (184.5–196.1, 218.7–229.5) |
| H3 | 1F_LOBBY | B_LAUNDRY_STORAGE | (257.6–268.5, 242.7–253.4) |
| H4 | 2F_KIDS_DORMS (west end) | 1F_KITCHEN (west end) | (138.8–149.3, 180.0–191.1) |
| H5 | 2F_ATTIC | 1F_MEETING_HALL (north, beside H1) | (244.6–256.1, 126.7–138.3) |
| H6 | 2F_ARMORY | 1F_GARAGE | (317.6–328.7, 239.6–250.7) |

There are no hatches on the roof or into 3F.

### 5.3 Ladders
| id | Floors | Position (u) | Notes |
|---|---|---|---|
| LD_TOWER | 2F_TOWER ↔ 3F_CATWALK | ≈ (280–287, 55–66) | "Ladder stairs … to the highest point on the map" (Fandom). The only ladder in the r6calls ladder layer. No exterior ladders are marked |

### 5.4 Drone tunnels / drone holes (r6calls `dt` layer; small gaps drones can pass)
| Floor | Between | Rect (u) |
|---|---|---|
| B | Exterior (south, below chevron icon) ↔ basement (Freezer Stairs side) | (181.8–186.8, 263.6–274.6); same chevron on 1F, route UNVERIFIED |
| B | B_CORRIDOR ↔ B_FREEZER_HALL | (211.5–214.3, 188.4–191.8) |
| B | B_CORRIDOR ↔ B_SUPPLY_CLOSET | (234.8–237.5, 183.8–186.9) |
| B | B_SUPPLY SE strip ↔ east side (exterior below Bunker Entrance?) | (285.9–288.5, 181.9–201.2); far side UNVERIFIED |
| 1F | 1F_KITCHEN_CORRIDOR (NE room) ↔ 1F_MEETING_HALL | (222.6–226.6, 119.8–122.5) |
| 1F | 1F_KITCHEN (NE alcove) ↔ 1F_MEETING_HALL | (214.4–217.1, 163.7–167.2) |
| 1F | 1F_KITCHEN ↔ 1F_LOBBY hall | (205.6–210.3, 206.2–209.0) |
| 1F | Exterior south ↔ 1F_WHITE_STAIRS | (181.8–186.8, 270.2–274.6) |
| 1F | Exterior south ↔ 1F_SHOWER_CORRIDOR | (127.8–133.0, 270.4–274.9) |
| 1F | Exterior NW (Garden) ↔ 1F_SMALL_TOWER | (45.0–49.5, 167.6–173.0) |
| 2F | EXT/RF_MEETING_W ↔ 2F_ATTIC | (246.5–250.9, 112.0–115.3) |
| 2F | 2F_GAME_ROOM/MIDDLE ↔ 2F_MASTER_BEDROOM | (246.1–248.8, 227.7–231.0) |

## 6. Horizontal connections (doors, windows, open passages, soft walls)
Opening types:
- `DOOR` = interior doorway (glyph: single line + tick). These are barricadable doorways (Siege standard; individual exceptions UNVERIFIED).
- `EXT_OPENING` = opening in an exterior wall (glyph: double line + tick). Door vs window cannot be told from the blueprints. The table gives a best guess and marks it UNVERIFIED; §8 explains.
- `OPEN` = passage with no door glyph (no barricade).
- `SOFT(n)` = destructible, reinforceable wall with *n* reinforcement sections (see `surfaces.md`).

Coordinates are the opening's span on the wall line.

### 6.1 Basement
| Room A | Room B | Type | Where (u) |
|---|---|---|---|
| B_TOWER_STAIRS | B_BOILER | OPEN (stair foot) | y≈88, x 232–254 |
| B_BOILER | B_BUNKER_ENTRANCE | DOOR | x 283–285, y 94–104 |
| B_BOILER | B_ELECTRIC | DOOR | x 256–258, y 117–126 |
| B_BOILER | B_ELECTRIC | SOFT(2) | y 113–116, x 258–283 |
| B_BOILER | B_CORRIDOR | DOOR | y 135–137, x 215–226 |
| B_BOILER | B_SUPPLY | SOFT(1) | y 134–137, x 237–251 |
| B_ELECTRIC | B_SUPPLY | DOOR | y 135–137, x 263–272 |
| B_ELECTRIC | B_BUNKER_ENTRANCE | SOFT(2) | x 283–285, y 116–134 |
| B_SUPPLY | B_BUNKER_ENTRANCE | SOFT(2) | x 283–285, y 161–182 |
| B_SUPPLY | B_CORRIDOR | DOOR | x 235–237, y 155–166 |
| B_SUPPLY | B_SUPPLY_CLOSET | DOOR | x 262–266, y 184–193 |
| B_SUPPLY_CLOSET | B_LAUNDRY | SOFT(2) | y 198.5–201.2, x 237.6–261.7 |
| B_SUPPLY (SE strip) | B_LAUNDRY | SOFT(1) | y 198.6–201.2, x 268.9–282.9 |
| B_CORRIDOR | B_LAUNDRY | DOOR | y 199–201, x 219–229 |
| B_CORRIDOR | B_FREEZER_HALL | DOOR | x 207–211, y 158–167 |
| B_FREEZER_HALL | B_FREEZER | OPEN | y≈200 |
| B_FREEZER | B_LAUNDRY | SOFT(2) | x 211.6–214.2, y 201.1–228.1 |
| B_FREEZER | B_FREEZER_STAIRS | OPEN | y≈232 |
| B_LAUNDRY | B_LAUNDRY_STORAGE | DOOR | y 232–235, x 243–255 |
| B_LAUNDRY | B_LAUNDRY_STAIRS | OPEN | y≈232, x 268–282 |
| B_LAUNDRY_STORAGE | B_LAUNDRY_STAIRS | DOOR | x 266–267, y 267–274 |
| B_BUNKER_ENTRANCE | EXT_BUNKER | EXT_OPENING (door, likely) | x≈322, y 119–128 |

### 6.2 First floor
| Room A | Room B | Type | Where (u) |
|---|---|---|---|
| 1F_SMALL_TOWER (N arm) | 1F_DINING | DOOR | x 63–66, y 151–164 |
| 1F_SMALL_TOWER | 1F_DINING | SOFT(2) | x 63.8–66.4, y 181.9–206.3 |
| 1F_SMALL_TOWER | 1F_SHOWERS | SOFT(2) | x 63.7–66.5, y 227.2–248.7 |
| 1F_SMALL_TOWER | 1F_SHOWER_CORRIDOR | DOOR | y 254–256, x 50–61 |
| 1F_SMALL_TOWER | EXT west (Junkyard side) | EXT_OPENING (door? UNVERIFIED) | x≈3, y 232–245 |
| 1F_SMALL_TOWER | EXT south porch | EXT_OPENING (door? UNVERIFIED) | y 255–257, x 20–29 |
| 1F_DINING | 1F_KITCHEN | DOOR | x 134–137, y 157–168 |
| 1F_DINING | 1F_KITCHEN | SOFT(1) | x 134.3–137.0, y 174.6–185.7 |
| 1F_DINING | 1F_SHOWERS | SOFT(2) | y 206.2–208.9, x 94.5–117.7 |
| 1F_DINING | 1F_DINING_HALLWAY | DOOR | y 206–209, x 121–132 |
| 1F_SHOWERS | 1F_DINING_HALLWAY | SOFT(2) | x 117.7–120.4, y 208.9–226.4 |
| 1F_SHOWERS | 1F_SHOWER_CORRIDOR | DOOR | y 253–256, x 78–89 |
| 1F_DINING_HALLWAY | 1F_SHOWER_CORRIDOR | OPEN | y≈255 |
| 1F_DINING_HALLWAY | 1F_SECURITY_CORRIDOR | DOOR | x 134–137, y 239–251 |
| 1F_SHOWER_CORRIDOR | EXT south (Bus) | EXT_OPENING (door? UNVERIFIED) | y 271–273, x 84–95 |
| 1F_SECURITY_CORRIDOR (SW nook) | EXT south | EXT_OPENING (door? UNVERIFIED) | y 270–272, x 138–147 |
| 1F_KITCHEN | 1F_KITCHEN_CORRIDOR | DOOR | y 155–157, x 203–212 |
| 1F_KITCHEN | 1F_SECURITY | SOFT(2) | y 206.3–209.0, x 137.0–164.0 |
| 1F_KITCHEN | 1F_SECURITY | SOFT(1) | y 206.2–208.9, x 184.2–195.4 |
| 1F_KITCHEN | 1F_MEETING_HALL | SOFT(2) | x 214.4–217.2, y 179.6–200.4 |
| 1F_KITCHEN_CORRIDOR | 1F_TOWER | DOOR | y 97–99, x 205–215 |
| 1F_KITCHEN_CORRIDOR (NE room) | 1F_STAGE | DOOR | x 240–243, y 102–112 |
| 1F_KITCHEN_CORRIDOR | EXT west (Garden) | EXT_OPENING (door? UNVERIFIED) | x 198–200, y 135–147 |
| 1F_TOWER | 1F_TOWER_STAIRS | OPEN | — |
| 1F_TOWER | 1F_STAGE | SOFT(2) | y 97.2–100.0, x 242.7–258.7 |
| 1F_TOWER | EXT north (Shooting Range) | EXT_OPENING (UNVERIFIED) | y 73–75, x 219–233 |
| 1F_TOWER (NE part) | EXT east (exterior stairs) | EXT_OPENING (door? UNVERIFIED) | x≈290, y 60–70 |
| 1F_STAGE | 1F_MEETING_HALL | OPEN | same room |
| 1F_MEETING_HALL | 1F_SPLIT | DOOR (west) | x 221–224, y 190–201 |
| 1F_MEETING_HALL | 1F_SPLIT | DOOR (east) | x 260–263, y 188–199 |
| 1F_SPLIT | 1F_LOBBY (hall) | DOOR | y 204–207, x 232–246 |
| 1F_MEETING_HALL (SW corner) | 1F_LOBBY (hall) | SOFT(1) | y 206.3–208.9, x 217.0–227.8 |
| 1F_MEETING_HALL (SE corner) | 1F_LOBBY (hall) | SOFT(1) | y 206.3–208.9, x 275.6–288.9 |
| 1F_SECURITY | 1F_SECURITY_CORRIDOR | DOOR | y 230–232, x 159–172 |
| 1F_SECURITY_CORRIDOR | 1F_LOBBY (hall) | OPEN | via passage x 204–214, y 209–232 |
| 1F_SECURITY_CORRIDOR | 1F_WHITE_STAIRS | DOOR | y 250–252, x 175–187 |
| 1F_CLASSROOM | 1F_LOBBY (hall, north) | DOOR | y 224–227, x 225–234 |
| 1F_CLASSROOM | 1F_LOBBY (hall, north) | SOFT(1) + SOFT(1) | y 224.3–227.0, x 216.6–225.5 and x 233.9–243.4 |
| 1F_CLASSROOM | 1F_LOBBY (entrance, east) | DOOR | x 243–246, y 249–259 |
| 1F_CLASSROOM | 1F_LOBBY (entrance, east) | SOFT(2) + SOFT(2) | x 243.4–246.0, y 227.0–248.7 and y 260.2–280.7 |
| 1F_CLASSROOM | EXT west (recessed yard) | EXT_OPENING (window? UNVERIFIED) | x 207–210, y 258–270 |
| 1F_LOBBY | EXT_MAIN_ENTRANCE | **EXT_OPENING = DOOR (main entrance, double)** | y 280–283, x 245–262 |
| 1F_LOBBY | 1F_ARMORY_STAIRS | DOOR | x 270–272, y 230–240 |
| 1F_LOBBY (hall) | 1F_ARMORY_STAIRS | SOFT(1) | y 225.7–228.4, x 276.9–289.9 |
| 1F_LOBBY (hall) | 1F_GARAGE | DOOR | x 287–290, y 213–223 |
| 1F_GARAGE | EXT north (Construction side) | EXT_OPENING (door? UNVERIFIED) | y 200–203, x 305–316 |
| 1F_GARAGE | EXT east | EXT_OPENING (window, likely; different glyph) | x 328–331, y 239–249 |
| 1F_GARAGE | EXT south (Parking) | EXT_OPENING (door? UNVERIFIED) | y 263–266, x 293–303 |
| 1F_GARAGE | EXT south (Parking) | SOFT(2), drawn thicker (garage door?) | y 262.8–267.0, x 306.1–330.9 |
| 1F_KITCHEN | 1F_DINING / Security etc. | — | all other shared wall spans are HARD (see `surfaces.md`) |

### 6.3 Second floor
| Room A | Room B | Type | Where (u) |
|---|---|---|---|
| 2F_SMALL_TOWER | 2F_OFFICE | DOOR | x 62–65, y 183–193 |
| 2F_SMALL_TOWER | RF_DINING (south part) | EXT_OPENING (window? UNVERIFIED) | y 229–232, x 45–56 |
| 2F_OFFICE | RF_DINING (north part) | EXT_OPENING (UNVERIFIED) | y 177–180, x 84–94 |
| RF_DINING | 2F_DORMS_MAIN_HALL | EXT_OPENING (window? UNVERIFIED) | x 136–140, y 208–221 |
| 2F_KIDS_DORMS | EXT north (2-storey drop) | EXT_OPENING (**window**; no roof outside) | y 157–160, x 183–197 |
| 2F_KIDS_DORMS | 2F_DORMS_MAIN_HALL | DOOR | y 204–207, x 180–192 |
| 2F_KIDS_DORMS | 2F_DORMS_MAIN_HALL | SOFT(2) | y 204.9–207.5, x 146.5–173.5 |
| 2F_KIDS_DORMS | 2F_LOW_ATTIC | SOFT(2) | x 208.4–211.1, y 162.3–178.8 |
| 2F_DORMS_MAIN_HALL | 2F_MIDDLE | OPEN (no wall) | x≈201–209, y 207–225 |
| 2F_DORMS_MAIN_HALL | 2F_GAME_ROOM | SOFT(1) | x 201.4–203.9, y 242.5–254.1 |
| 2F_DORMS_MAIN_HALL | 2F_WHITE_STAIRS | DOOR | y 254–257, x 185–196 |
| 2F_MIDDLE | 2F_GAME_ROOM | OPEN (doorway, no door glyph) | y 224–227, x 215–229 |
| 2F_MIDDLE | 2F_LOW_ATTIC | DOOR | y 189–191, x 216–226 |
| 2F_MIDDLE | 2F_TROPHY | DOOR | x 247–251, y 195–203 |
| 2F_GAME_ROOM | 2F_WALK_IN | SOFT(2) | y 253.9–256.6, x 223.3–246.2 |
| 2F_GAME_ROOM | EXT/roof south | EXT_OPENING (window? UNVERIFIED) | y 254–256, x 205–216 |
| 2F_WALK_IN | 2F_MASTER_BEDROOM | DOOR | x 248–251, y 262–270 |
| 2F_TROPHY | 2F_LOW_ATTIC | SOFT(2) | y 187.2–189.9, x 248.7–272.6 |
| 2F_TROPHY | 2F_MASTER_BEDROOM | DOOR | y 224–227, x 257–270 |
| 2F_TROPHY | 2F_ARMORY_CORRIDOR | DOOR | x 280–283, y 195–203 |
| 2F_MASTER_BEDROOM | 2F_ARMORY_CORRIDOR | SOFT(2) | x 280.7–283.5, y 226.5–245.6 |
| 2F_MASTER_BEDROOM | EXT_BALCONY | EXT_OPENING (door? UNVERIFIED) | y 272–274, x 254–264 |
| 2F_LOW_ATTIC | 2F_ATTIC | OPEN | y≈160 |
| 2F_ATTIC | 2F_TOWER | SOFT(2) | y 96.9–99.6, x 251.1–272.7 |
| 2F_ATTIC | RF_MEETING_W | EXT_OPENING (window? UNVERIFIED) | x 245–249, y 146–156 |
| 2F_ARMORY_CORRIDOR | RF_MEETING_E | EXT_OPENING (window? UNVERIFIED) | y 186–189, x 280–292 |
| 2F_ARMORY_CORRIDOR | 2F_ARMORY | DOOR | x 296–299, y 232–241 |
| 2F_ARMORY_CORRIDOR | 2F_ARMORY | SOFT(2) | x 296.3–298.9, y 209.4–229.9 |
| 2F_ARMORY_CORRIDOR | 2F_ARMORY_STAIRS | OPEN | — |
| 2F_ARMORY | EXT east | EXT_OPENING (window, likely) | x 332–335, y 234–243 |
| 2F_TOWER (W part) | EXT north | EXT_OPENING (window? UNVERIFIED) | y 73–75, x 228–241 |
| 2F_TOWER (W part) | RF_MEETING_W | EXT_OPENING (UNVERIFIED) | y≈99, x 229–241 |
| 2F_TOWER (NE part) | RF_MEETING_E | EXT_OPENING (UNVERIFIED) | y≈99, x 281–293 |
| 2F_TOWER (NE part) | EXT north | EXT_OPENING (window? UNVERIFIED) | y≈47, x 282–292 |

### 6.4 3F
| Room A | Room B | Type | Where (u) |
|---|---|---|---|
| 3F_CATWALK | 2F_TOWER | LADDER | ≈ (280–287, 55–66) |
| 3F_CATWALK | EXT north | EXT_OPENING (window, likely) | y 43–46, x 257–266 |
| 3F_CATWALK | RF_MEETING_E / RF_ATTIC | EXT_OPENING (UNVERIFIED) | y 97–100, x 285–294 |

## 7. Adjacency summary
Rooms that share a wall with **no** passable or destructible section (HARD only) are listed in `surfaces.md` §3. Key facts for gameplay:
- **Site 1 (Kids'/Dorms):** linked by a door plus a 2-section soft wall. Kids' is also soft to Low Attic. Dorms is open to Middle and soft (1 section) to Game Room. Hatch H4 drops from Kids' into Kitchen.
- **Site 2 (Dining/Kitchen):** a door plus a 1-section soft wall; the rest of the shared wall is hard. Kitchen is soft to Security (3 sections in 2 walls) and to Meeting (2 sections).
- **Site 3 (Meeting/Kitchen):** 2-section soft wall and drone holes. Meeting has H1 (to B Electric) and H5 (from 2F Attic) side by side near the Stage.
- **Site 4 (Laundry/Supply):** linked through Closet (2 sections) and the SE strip (1 section). Laundry is soft to Freezer (2). Supply is soft to Boiler (1) and to Bunker Entrance (2).

## 8. Known limits of this data
- **Doors vs windows:** in both the official and r6calls blueprints, interior doors use a single-line + tick glyph and every exterior opening uses a double-line + tick glyph; only the Garage east opening uses a different window-style glyph. Exterior opening types above are therefore guesses (main entrance = door is certain). Ulo can settle each in 1–2 minutes in a Custom Game.
- **Non-barricadable windows:** openings that the blueprints don't draw may exist (e.g. Meeting Hall's east wall shows window-like shapes in the floor texture but no wall glyph). They are UNVERIFIED.
- **R6 Mobile** layout differs in small ways: its 1F only draws the Meeting and Lobby hatches, and it has no ceiling-hatch layer. Use R6M for names only.

## Open questions
(For Ulo — a Custom Game walk-through answers most of these.)
1. **Scale:** stand at a doorway and estimate its width, or tell us how many reinforcements the Kitchen↔Meeting soft wall takes (we expect 2). This calibrates the 0.15 m/u estimate.
2. **Storey heights:** roughly how tall are B, 1F, 2F? Is Meeting Hall a tall single-storey room (pitched ceiling), with the Attic only along its east side?
3. **Exterior openings — door or window?**
   - 1F: Small Tower west, Small Tower south, Shower Corridor south, Security Corridor SW-south, Kitchen Corridor west, Tower north, Tower east, Garage north/south/east, Classroom west.
   - 2F: Kids' north, Dorms→Dining Roof, Office north, Small Tower south, Game Room south, Master→Balcony, Attic west, Armory Corridor north, Armory east, 2F Tower north ×2 / south ×2.
   - 3F: Catwalk north and south.
4. Is the **Garage south wall** a destructible garage door (2 reinforcements)?
5. Where does the **exterior staircase east of the 1F Tower** lead: down to the Bunker side, or up?
6. Does **Freezer Stairs (B) come up into White Stairs (1F)**, and do both White Stairs and Armory Stairs continue to 2F?
7. Is the **3F Cat Walk** a ring around an open drop to 2F, or is its middle solid?
8. Does **2F Middle ↔ Game Room** have a door (barricadable), or is it an open archway?
9. Where do the **basement drone tunnels** lead? One enters from the south exterior near White/Freezer Stairs; one runs along Supply's SE strip.
10. Any **callout names** that differ from the table? What do you and your squad call these rooms, and what does the in-game HUD show?

## Sources
- https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints/r6-maps-oregon-blueprints.zip — official blueprints (B, 1F, 2F, 3F, Roof; legend: breakable walls, breakable floor traps, LOS walls, LOS floor). Used for layout, soft walls, hatches, soft floors.
- https://r6calls.com/img/maps/oregon.svg — vector layers per floor (breakable walls with section dividers, floor/ceiling hatches, LOS floors, drone tunnels, ladders, cameras, ingredients, labels, bomb/secure/hostage markers). All coordinates in this file come from it.
- https://r6calls.com/data/dataMap.json — map revision (5), floors 0–4, layer ids.
- https://liquipedia.net/commons/File:R6M_Blueprint_Oregon_-_Basement.jpg (+ `-_1st_Floor`, `-_2nd_Floor`, `-_Outside`) — R6 Mobile official labels, soft walls, hatches, destructible floors, roof names.
- https://liquipedia.net/rainbowsix/Oregon — attacker spawns A Junkyard / B Street / C Construction Site; site lists.
- https://rainbowsix.fandom.com/wiki/Oregon — site lists, "6 Hatches", ladder to the highest point, blueprint gallery.
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.1.1 — official name "EXT Dorms Roof".
- https://rainbowsix.fandom.com/wiki/Reinforcement — reinforcement sections per wall (2–3 per wall; small walls 1).
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/maps/oregon — official map page (blueprint download).
