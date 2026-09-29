# Oregon — surface tagging (walls, floors, ceilings, hatches, openings)
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29. Geometry is the Y5S1 rework, unchanged by the Y11S1 modernization (see `version.md`).
Confidence: **high** for the soft-wall and hatch list: three independent sources agree wall by wall (official Ubisoft blueprints 2020, r6calls.com vector map rev 5 from 2026, and Ubisoft's Rainbow Six Mobile blueprints). **Medium** for the "everything else is HARD" rule, for reinforcement section counts (inferred from r6calls section dividers) and for soft-floor extents (two sources differ slightly). **Low** for door-vs-window typing of exterior openings.

Coordinates use the `u` system defined in `layout_notes.md` §1 (+x east, +y south; **1 u ≈ 0.15 m, ESTIMATE**). Room IDs match `layout_notes.md`.

---

## 1. Tag vocabulary (maps to PLAN §8.1 classes)
| Tag used here | PLAN §8.1 class | Meaning | Evidence |
|---|---|---|---|
| `SOFT` | `REINFORCEABLE` (unreinforced; behaves as `SOFT_WALL`) | Destructible wall: bullets, melee and explosives open it; **defenders can reinforce it**. Split into *n* reinforcement **sections**; one reinforcement covers one section | Official legend "Breakable walls"; r6calls layer `bw`; R6M legend "Soft wall". Fandom *Reinforcement*: reinforcements go on "fully destructible walls"; walls are "divided into 2–3 equal sized sections… some of the smaller walls only need one" |
| `HARD` | `HARD_WALL` | Indestructible wall | Default for every wall the blueprints don't mark as breakable. All three sources draw walls white and overlay only the breakable ones |
| `LOS_WALL` | (bullet-holes-only wall) | Can be shot through but not opened | Present in the official and R6M legends; **no Oregon wall carries it** in any source |
| `SOFT_FLOOR` | `SOFT_FLOOR` / `SOFT_CEILING` | Destructible floor (vertical play). **Not reinforceable**: only walls and hatches take reinforcements (Fandom *Reinforcement*) | Official legend "Line of sight floor"; R6M "Destructible floor"; r6calls layer `losf` |
| `HARD_FLOOR` | `HARD_FLOOR` | Indestructible floor/ceiling | Default where no LOS-floor is marked |
| `HATCH` | `HATCH` | Floor trapdoor; breakable; reinforceable **from the top side only** (Fandom *Reinforcement*) | Official "Breakable floor traps"; r6calls `fh`/`ch`; R6M "Hatch" |
| `DOOR` | opening + `BARRICADE` | Interior doorway; `barricadable = yes` (Siege default; exceptions UNVERIFIED) | Blueprint glyph: single line + tick |
| `EXT_OPENING` | opening + `BARRICADE` (door or `WINDOW`) | Opening in an exterior wall. Door vs window is **not distinguishable** on the blueprints; best guess given. `barricadable = yes` (UNVERIFIED) | Glyph: double line + tick |
| `OPEN` | — | Passage with no door, no barricade | No glyph |
| `DRONE_HOLE` | — | Small gap drones can pass | r6calls `dt` layer |

**Default rule for `layout.json`:** every wall segment not listed in §2 as `SOFT`, and not an opening in `layout_notes.md` §6, is `HARD`. That includes **all exterior walls except the Garage south wall**, and all basement walls except the seven listed.

## 2. Soft (destructible + reinforceable) walls — complete list (32 walls, 54 sections)
- Section dividers come from r6calls' divider marks. `div at` gives the divider coordinate along the wall.
- All 32 walls appear in the official 2020 blueprint and in r6calls. An `R6M` ✓ means the Mobile blueprint also shows it.
- `verified` = yes where ≥2 sources agree on existence. Section counts stay UNVERIFIED until Ulo confirms a sample.

### 2.1 Basement (7 walls, 12 sections)
| id | room A | room B | x (u) | y (u) | orient | length u / m | sections | div at | R6M | verified |
|---|---|---|---|---|---|---|---|---|---|---|
| SW-B-01 | B_LAUNDRY | B_FREEZER | 211.6–214.2 | 201.1–228.1 | N–S | 27.0 / 4.1 | 2 | y 214.6 | ✓ | yes (sections UNVERIFIED) |
| SW-B-02 | B_SUPPLY | B_BUNKER_ENTRANCE | 282.8–285.5 | 161.5–182.0 | N–S | 20.5 / 3.1 | 2 | y 171.7 | ✓ | yes |
| SW-B-03 | B_ELECTRIC | B_BUNKER_ENTRANCE | 282.8–285.5 | 115.7–134.4 | N–S | 18.7 / 2.8 | 2 | y 125.0 | ✓ | yes |
| SW-B-04 | B_ELECTRIC | B_BOILER | 257.9–282.8 | 113.1–115.7 | E–W | 24.9 / 3.7 | 2 | x 270.3 | ✓ | yes |
| SW-B-05 | B_SUPPLY_CLOSET | B_LAUNDRY | 237.6–261.7 | 198.5–201.2 | E–W | 24.1 / 3.6 | 2 | x 249.6 | ✓ | yes |
| SW-B-06 | B_SUPPLY (SE strip) | B_LAUNDRY | 268.9–282.9 | 198.6–201.2 | E–W | 14.0 / 2.1 | 1 | — | ✓ | yes |
| SW-B-07 | B_SUPPLY | B_BOILER | 237.4–251.0 | 134.3–137.0 | E–W | 13.5 / 2.0 | 1 | — | ✓ | yes |

### 2.2 First floor (17 walls, 27 sections)
| id | room A | room B | x (u) | y (u) | orient | length u / m | sections | div at | R6M | verified |
|---|---|---|---|---|---|---|---|---|---|---|
| SW-1F-01 | 1F_SMALL_TOWER | 1F_DINING | 63.8–66.4 | 181.9–206.3 | N–S | 24.4 / 3.7 | 2 | y 194.1 | ✓ | yes |
| SW-1F-02 | 1F_SMALL_TOWER | 1F_SHOWERS | 63.7–66.5 | 227.2–248.7 | N–S | 21.6 / 3.2 | 2 | y 237.9 | ✓ | yes |
| SW-1F-03 | 1F_DINING | 1F_SHOWERS | 94.5–117.7 | 206.2–208.9 | E–W | 23.2 / 3.5 | 2 | x 106.1 | ✓ | yes |
| SW-1F-04 | 1F_SHOWERS | 1F_DINING_HALLWAY | 117.7–120.4 | 208.9–226.4 | N–S | 17.5 / 2.6 | 2 | y 217.6 | ✓ | yes |
| SW-1F-05 | 1F_DINING | 1F_KITCHEN | 134.3–137.0 | 174.6–185.7 | N–S | 11.1 / 1.7 | 1 | — | ✓ | yes |
| SW-1F-06 | 1F_KITCHEN | 1F_SECURITY (west) | 137.0–164.0 | 206.3–209.0 | E–W | 26.9 / 4.0 | 2 | x 150.5 | ✓ | yes |
| SW-1F-07 | 1F_KITCHEN | 1F_SECURITY (east) | 184.2–195.4 | 206.2–208.9 | E–W | 11.2 / 1.7 | 1 | — | ✓ | yes |
| SW-1F-08 | 1F_KITCHEN | 1F_MEETING_HALL | 214.4–217.2 | 179.6–200.4 | N–S | 20.8 / 3.1 | 2 | y 189.9 | ✓ | yes |
| SW-1F-09 | 1F_TOWER | 1F_STAGE (Meeting) | 242.7–258.7 | 97.2–100.0 | E–W | 16.1 / 2.4 | 2 | x 250.7 | ✓ | yes |
| SW-1F-10 | 1F_MEETING_HALL (SW corner) / 1F_SPLIT (SW) | 1F_LOBBY (hall) | 217.0–227.8 | 206.3–208.9 | E–W | 10.9 / 1.6 | 1 | — | ✓ | yes |
| SW-1F-11 | 1F_MEETING_HALL (SE corner) | 1F_LOBBY (hall) | 275.6–288.9 | 206.3–208.9 | E–W | 13.3 / 2.0 | 1 | — | ✓ | yes |
| SW-1F-12 | 1F_CLASSROOM (N, west of door) | 1F_LOBBY (hall) | 216.6–225.5 | 224.3–226.9 | E–W | 8.9 / 1.3 | 1 | — | ✓ | yes |
| SW-1F-13 | 1F_CLASSROOM (N, east of door) | 1F_LOBBY (hall) | 233.9–243.4 | 224.3–227.0 | E–W | 9.4 / 1.4 | 1 | — | ✓ | yes |
| SW-1F-14 | 1F_CLASSROOM (E, north of door) | 1F_LOBBY (entrance) | 243.4–246.0 | 227.0–248.7 | N–S | 21.7 / 3.3 | 2 | y 237.9 | ✓ | yes |
| SW-1F-15 | 1F_CLASSROOM (E, south of door) | 1F_LOBBY (entrance) | 243.3–246.0 | 260.2–280.7 | N–S | 20.6 / 3.1 | 2 | y 270.5 | ✓ | yes |
| SW-1F-16 | 1F_LOBBY (hall) | 1F_ARMORY_STAIRS | 276.9–289.9 | 225.7–228.4 | E–W | 13.0 / 2.0 | 1 | — | ✓ | yes |
| SW-1F-17 | 1F_GARAGE | EXT_PARKING (**exterior**) | 306.1–330.9 | 262.8–267.0 | E–W | 24.7 / 3.7 | 2 | x 318.5 | ✓ | yes. Drawn thicker (4.2 u vs ~2.7) → possibly a garage door, UNVERIFIED |

### 2.3 Second floor (8 walls, 15 sections)
| id | room A | room B | x (u) | y (u) | orient | length u / m | sections | div at | R6M | verified |
|---|---|---|---|---|---|---|---|---|---|---|
| SW-2F-01 | 2F_KIDS_DORMS | 2F_DORMS_MAIN_HALL | 146.5–173.5 | 204.9–207.5 | E–W | 27.0 / 4.1 | 2 | x 160.0 | ✓ | yes |
| SW-2F-02 | 2F_KIDS_DORMS | 2F_LOW_ATTIC | 208.4–211.1 | 162.3–178.8 | N–S | 16.5 / 2.5 | 2 | y 170.6 | ✓ | yes |
| SW-2F-03 | 2F_DORMS_MAIN_HALL | 2F_GAME_ROOM | 201.4–203.9 | 242.5–254.1 | N–S | 11.6 / 1.7 | 1 | — | ✓ | yes |
| SW-2F-04 | 2F_GAME_ROOM | 2F_WALK_IN | 223.3–246.2 | 253.9–256.6 | E–W | 22.9 / 3.4 | 2 | x 234.8 | ✓ | yes |
| SW-2F-05 | 2F_LOW_ATTIC | 2F_TROPHY | 248.7–272.6 | 187.2–189.9 | E–W | 23.9 / 3.6 | 2 | x 260.7 | ✓ | yes |
| SW-2F-06 | 2F_MASTER_BEDROOM | 2F_ARMORY_CORRIDOR | 280.7–283.5 | 226.5–245.6 | N–S | 19.1 / 2.9 | 2 | y 236.1 | ✓ | yes |
| SW-2F-07 | 2F_ARMORY_CORRIDOR | 2F_ARMORY | 296.3–298.9 | 209.4–229.9 | N–S | 20.5 / 3.1 | 2 | y 219.7 | ✓ | yes |
| SW-2F-08 | 2F_ATTIC | 2F_TOWER (Big Tower 2F) | 251.1–272.7 | 96.9–99.6 | E–W | 21.6 / 3.2 | 2 | x 261.9 | ? (not clear on R6M) | yes (official + r6calls) |

### 2.4 3F / Roof
No soft walls anywhere (official 3F/roof blueprints and r6calls show none).

## 3. Every shared wall, by room pair (composition along the wall)
Read each row left to right along the wall line. Anything not named SOFT, DOOR, EXT_OPENING, OPEN or DRONE_HOLE is `HARD`. Spans in u.

### 3.1 Basement
| Room A | Room B / exterior | Wall line | Composition |
|---|---|---|---|
| B_BOILER | B_TOWER_STAIRS | y≈88 | OPEN (stair foot) |
| B_BOILER | B_BUNKER_ENTRANCE | x 283–285, y 88–116 | HARD · DOOR 94–104 · HARD |
| B_BOILER | B_ELECTRIC (Electric N) | y 113–116, x 258–283 | SOFT(2) full (SW-B-04) |
| B_BOILER | B_ELECTRIC (Electric W) | x 256–258, y 116–135 | DOOR 117–126 · HARD |
| B_BOILER | B_SUPPLY | y 134–137, x 237–258 | SOFT(1) 237–251 (SW-B-07) · HARD 251–258 |
| B_BOILER | B_CORRIDOR | y 135–137, x 211–237 | HARD · DOOR 215–226 · HARD |
| B_ELECTRIC | B_SUPPLY | y 135–137, x 258–283 | HARD · DOOR 263–272 · HARD |
| B_ELECTRIC | B_BUNKER_ENTRANCE | x 283–285, y 116–134 | SOFT(2) full (SW-B-03) |
| B_SUPPLY | B_BUNKER_ENTRANCE | x 283–285, y 135–185 | HARD 135–161 · SOFT(2) 161–182 (SW-B-02) · HARD 182–185 |
| B_SUPPLY | B_CORRIDOR | x 235–237, y 137–180 | HARD · DOOR 155–166 · HARD |
| B_SUPPLY | B_SUPPLY_CLOSET | N wall y≈180 (237–262) + E wall x 262–266 (180–198) | HARD (N) · E wall: HARD · DOOR 184–193 · HARD |
| B_SUPPLY (SE strip) | B_LAUNDRY | y 198–201, x 262–283 | HARD 262–269 · SOFT(1) 269–283 (SW-B-06) |
| B_SUPPLY (SE strip) | exterior east | x 285–288, y 182–201 | HARD + DRONE_HOLE along 182–201 (far side UNVERIFIED) |
| B_SUPPLY_CLOSET | B_CORRIDOR | x 235–237, y 180–198 | HARD + DRONE_HOLE y 184–187 |
| B_SUPPLY_CLOSET | B_LAUNDRY | y 198–201, x 237–262 | SOFT(2) full (SW-B-05) |
| B_CORRIDOR | B_LAUNDRY | y 199–201, x 214–235 | HARD · DOOR 219–229 · HARD |
| B_CORRIDOR | B_FREEZER_HALL | x 209–214, y 150–199 | HARD · DOOR 158–167 · HARD · DRONE_HOLE 188–192 · HARD |
| B_FREEZER | B_LAUNDRY | x 211–214, y 200–232 | SOFT(2) 201–228 (SW-B-01) · HARD 228–232 |
| B_FREEZER / B_FREEZER_HALL | B_FREEZER_STAIRS / each other | — | OPEN |
| B_LAUNDRY | B_LAUNDRY_STORAGE | y 232–235, x 243–266 | DOOR 243–255 · HARD |
| B_LAUNDRY | B_LAUNDRY_STAIRS | y≈232, x 267–283 | OPEN |
| B_LAUNDRY_STORAGE | B_LAUNDRY_STAIRS | x 266–267, y 235–277 | HARD · DOOR 267–274 · HARD |
| B_BUNKER_ENTRANCE | EXT_BUNKER | x≈322, y 90–135 | HARD · EXT_OPENING (door, likely) 119–128 · HARD |
| all other basement perimeter walls | earth | — | HARD |

### 3.2 First floor
| Room A | Room B / exterior | Wall line | Composition |
|---|---|---|---|
| 1F_SMALL_TOWER | 1F_DINING | x 63–66, y 150–206 | DOOR 151–164 · HARD 164–182 · SOFT(2) 182–206 (SW-1F-01) |
| 1F_SMALL_TOWER | 1F_SHOWERS | x 63–66, y 209–254 | HARD 209–227 · SOFT(2) 227–249 (SW-1F-02) · HARD 249–254 |
| 1F_SMALL_TOWER | 1F_SHOWER_CORRIDOR | y 254–256, x 49–63 | DOOR 50–61 · HARD |
| 1F_SMALL_TOWER | exterior N/W/S | perimeter | HARD · EXT_OPENING W (x≈3, y 232–245) · EXT_OPENING S (y≈256, x 20–29) · DRONE_HOLE NW (45–49.5, 167.6–173) |
| 1F_DINING | 1F_KITCHEN | x 134–137, y 150–206 | HARD 150–157 · DOOR 157–168 · HARD 168–174.6 · SOFT(1) 174.6–185.7 (SW-1F-05) · HARD 185.7–206 |
| 1F_DINING | 1F_SHOWERS | y 206–209, x 66–117.7 | HARD 66–94.5 · SOFT(2) 94.5–117.7 (SW-1F-03) |
| 1F_DINING | 1F_DINING_HALLWAY | y 206–209, x 120–134 | DOOR 121–132 · HARD |
| 1F_DINING | exterior N (Garden) | y 147–150, x 66–134 | HARD (no openings drawn; UNVERIFIED) |
| 1F_SHOWERS | 1F_DINING_HALLWAY | x 117–120, y 209–254 | SOFT(2) 208.9–226.4 (SW-1F-04) · HARD 226.4–254 |
| 1F_SHOWERS | 1F_SHOWER_CORRIDOR | y 253–256, x 66–117 | HARD · DOOR 78–89 · HARD |
| 1F_DINING_HALLWAY | 1F_SHOWER_CORRIDOR | y≈255 | OPEN |
| 1F_DINING_HALLWAY | 1F_SECURITY_CORRIDOR | x 134–137, y 232–255 | HARD · DOOR 239–251 · HARD |
| 1F_SHOWER_CORRIDOR | exterior S (Bus) | y 271–273, x 49–134 | HARD · EXT_OPENING 84–95 · HARD · DRONE_HOLE 127.8–133 |
| 1F_SECURITY_CORRIDOR (SW nook) | exterior S | y 270–272, x 137–146 | EXT_OPENING 138–147 |
| 1F_KITCHEN | 1F_KITCHEN_CORRIDOR | y 155–157, x 200–214 | HARD · DOOR 203–212 · HARD |
| 1F_KITCHEN | 1F_SECURITY | y 206–209, x 137–204 | SOFT(2) 137–164 (SW-1F-06) · HARD 164–184 · SOFT(1) 184–195 (SW-1F-07) · HARD 195–204 |
| 1F_KITCHEN | 1F_LOBBY (passage x 204–214) | y 206–209 | HARD + DRONE_HOLE 205.6–210.3 |
| 1F_KITCHEN | 1F_MEETING_HALL | x 214–217, y 157–206 | HARD 157–163.7 · DRONE_HOLE 163.7–167.2 · HARD 167–179.6 · SOFT(2) 179.6–200.4 (SW-1F-08) · HARD 200.4–206 |
| 1F_KITCHEN | exterior N | y 152–155, x 137–200 | HARD |
| 1F_KITCHEN_CORRIDOR | 1F_TOWER | y 97–99, x 200–240 | HARD · DOOR 205–215 · HARD |
| 1F_KITCHEN_CORRIDOR | 1F_MEETING_HALL | y 120–122 (x 213–243) + x 213–217 (y 121–157) | HARD + DRONE_HOLE (222.6–226.6, 119.8–122.5) |
| 1F_KITCHEN_CORRIDOR (NE room) | 1F_STAGE | x 240–243, y 99–121 | HARD · DOOR 102–112 · HARD |
| 1F_KITCHEN_CORRIDOR | exterior W | x 198–200, y 99–157 | HARD · EXT_OPENING 135–147 · HARD |
| 1F_TOWER | 1F_STAGE | y 97–100, x 240–287 | HARD 240–242.7 · SOFT(2) 242.7–258.7 (SW-1F-09) · HARD 258.7–287 |
| 1F_TOWER / 1F_TOWER_STAIRS | exterior | perimeter | HARD · EXT_OPENING N (y≈74, x 219–233) · EXT_OPENING E (x≈290, y 60–70) |
| 1F_MEETING_HALL | 1F_SPLIT | Split W wall x 221–224 · E wall x 260–263 · N wall y≈180 | W: DOOR 190–201 + HARD · E: DOOR 188–199 + HARD · N: HARD |
| 1F_MEETING_HALL + 1F_SPLIT | 1F_LOBBY (hall) | y 204–209, x 217–290 | SOFT(1) 217–227.8 (SW-1F-10) · HARD 227.8–232 · DOOR (Split) 232–246 · HARD 246–275.6 · SOFT(1) 275.6–288.9 (SW-1F-11) |
| 1F_MEETING_HALL | exterior E (Construction) | x 287–290, y 99–206 | HARD. No barricadable opening drawn; window-like shapes in the floor art, so possibly fixed windows (UNVERIFIED) |
| 1F_SECURITY | 1F_SECURITY_CORRIDOR | y 230–232, x 137–204 | HARD · DOOR 159–172 · HARD |
| 1F_SECURITY | 1F_LOBBY passage | x 204–207, y 209–232 | HARD |
| 1F_SECURITY_CORRIDOR | 1F_LOBBY | via passage x 204–214, y 209–232 | OPEN |
| 1F_SECURITY_CORRIDOR | 1F_WHITE_STAIRS | y 250–252, x 146–197 | HARD · DOOR 175–187 · HARD |
| 1F_SECURITY_CORRIDOR | 1F_CLASSROOM | x 207–210, y 232–250 | HARD |
| 1F_WHITE_STAIRS | exterior S | y 268–272 | HARD + DRONE_HOLE 181.8–186.8 |
| 1F_CLASSROOM | 1F_LOBBY (hall) | y 224–227, x 207–243 | HARD 207–216.6 · SOFT(1) 216.6–225.5 (SW-1F-12) · DOOR 225–234 · SOFT(1) 233.9–243.4 (SW-1F-13) |
| 1F_CLASSROOM | 1F_LOBBY (entrance) | x 243–246, y 227–281 | SOFT(2) 227–248.7 (SW-1F-14) · DOOR 249–259 · SOFT(2) 260.2–280.7 (SW-1F-15) |
| 1F_CLASSROOM | exterior W/S | perimeter | HARD · EXT_OPENING W (x≈208, y 258–270) |
| 1F_LOBBY | 1F_ARMORY_STAIRS | W wall x 270–272 (y 228–268) · N wall y 225.7–228.4 | W: DOOR 230–240 + HARD · N: SOFT(1) 276.9–289.9 (SW-1F-16) |
| 1F_LOBBY | 1F_GARAGE | x 287–290, y 202–226 | HARD · DOOR 213–223 · HARD |
| 1F_LOBBY | EXT_MAIN_ENTRANCE | y 280–283, x 246–272 | **DOOR (main entrance, double) 245–262** · HARD |
| 1F_ARMORY_STAIRS | 1F_GARAGE | x 287–290, y 228–264 | HARD |
| 1F_GARAGE | exterior | N y≈201 · E x≈330 · S y≈265 | N: EXT_OPENING 305–316 · E: EXT_OPENING (window-style glyph) 239–249 · S: EXT_OPENING 293–303 + **SOFT(2) 306.1–330.9 (SW-1F-17)**. All else HARD |

### 3.3 Second floor
| Room A | Room B / exterior | Wall line | Composition |
|---|---|---|---|
| 2F_SMALL_TOWER | 2F_OFFICE | x 62–65, y 181–229 | HARD · DOOR 183–193 · HARD |
| 2F_SMALL_TOWER / 2F_OFFICE | RF_DINING / exterior | annex perimeter | HARD · EXT_OPENING S of Small Tower (y≈230, x 45–56) · EXT_OPENING N of Office (y≈178, x 84–94) |
| 2F_KIDS_DORMS | 2F_DORMS_MAIN_HALL | y 204–207, x 140–209 | HARD 140–146.5 · SOFT(2) 146.5–173.5 (SW-2F-01) · HARD 173.5–180 · DOOR 180–192 · HARD 192–209 |
| 2F_KIDS_DORMS | 2F_LOW_ATTIC | x 208–211, y 160–189 | HARD 160–162.3 · SOFT(2) 162.3–178.8 (SW-2F-02) · HARD 178.8–189 |
| 2F_KIDS_DORMS | 2F_MIDDLE | x 208–211, y 189–204 | HARD |
| 2F_KIDS_DORMS | exterior N / W | y 157–160 · x 137–140 | N: HARD · EXT_OPENING (window) 183–197 · HARD. W: HARD |
| 2F_DORMS_MAIN_HALL | 2F_MIDDLE | x≈201–209, y 207–225 | OPEN (no wall) |
| 2F_DORMS_MAIN_HALL | 2F_GAME_ROOM | x 201–204, y 226–254 | HARD 226–242.5 · SOFT(1) 242.5–254.1 (SW-2F-03) |
| 2F_DORMS_MAIN_HALL | 2F_WHITE_STAIRS | y 254–257, x 140–201 | HARD · DOOR 185–196 · HARD |
| 2F_DORMS_MAIN_HALL | RF_DINING (west) | x 136–140, y 207–254 | HARD · EXT_OPENING 208–221 · HARD |
| 2F_MIDDLE | 2F_GAME_ROOM | y 224–227, x 204–249 | HARD 204–215 · OPEN 215–229 · HARD 229–249 |
| 2F_MIDDLE | 2F_LOW_ATTIC | y 189–191, x 211–249 | HARD · DOOR 216–226 · HARD |
| 2F_MIDDLE | 2F_TROPHY | x 247–251, y 190–224 | HARD · DOOR 195–203 · HARD |
| 2F_GAME_ROOM | 2F_MASTER_BEDROOM | x 248–251, y 227–254 | DRONE_HOLE 227.7–231 · HARD |
| 2F_GAME_ROOM | 2F_WALK_IN | y 254–257, x 222–248 | SOFT(2) 223.3–246.2 (SW-2F-04) · HARD ends |
| 2F_GAME_ROOM | exterior S | y 254–256, x 204–222 | EXT_OPENING 205–216 · HARD |
| 2F_WALK_IN | 2F_MASTER_BEDROOM | x 248–251, y 256–273 | HARD · DOOR 262–270 · HARD |
| 2F_TROPHY | 2F_LOW_ATTIC | y 187–190, x 249–280 | SOFT(2) 248.7–272.6 (SW-2F-05) · HARD 272.6–280 |
| 2F_TROPHY | 2F_MASTER_BEDROOM | y 224–227, x 251–280 | HARD · DOOR 257–270 · HARD |
| 2F_TROPHY | 2F_ARMORY_CORRIDOR | x 280–283, y 190–224 | HARD · DOOR 195–203 · HARD |
| 2F_MASTER_BEDROOM | 2F_ARMORY_CORRIDOR / 2F_ARMORY_STAIRS | x 280–283, y 226–272 | SOFT(2) 226.5–245.6 (SW-2F-06) · HARD 245.6–272 |
| 2F_MASTER_BEDROOM | EXT_BALCONY | y 272–274, x 251–280 | HARD · EXT_OPENING 254–264 · HARD |
| 2F_LOW_ATTIC | 2F_ATTIC | y≈160 | OPEN |
| 2F_LOW_ATTIC | RF_MEETING_W (north) | y 157–160, x 211–249 | HARD |
| 2F_ATTIC | 2F_TOWER | y 97–100, x 249–273 | SOFT(2) 251.1–272.7 (SW-2F-08) |
| 2F_ATTIC | RF_MEETING_W | x 245–249, y 99–160 | HARD · DRONE_HOLE 112–115.3 · HARD · EXT_OPENING 146–156 · HARD |
| 2F_ATTIC / 2F_LOW_ATTIC | RF_MEETING_E | x 273–277, y 99–187 | HARD |
| 2F_ARMORY_CORRIDOR | RF_MEETING_E | y 186–189, x 280–296 | EXT_OPENING 280–292 · HARD |
| 2F_ARMORY_CORRIDOR | 2F_ARMORY | x 296–299, y 205–245 | SOFT(2) 209.4–229.9 (SW-2F-07) · DOOR 232–241 · HARD |
| 2F_ARMORY | exterior | perimeter | HARD · EXT_OPENING E (x≈333, y 234–243) |
| 2F_TOWER | exterior / RF_MEETING_W / RF_MEETING_E | perimeter | HARD · EXT_OPENING N-west (y≈74, x 228–241) · S-west to RF_MEETING_W (y≈99, x 229–241) · S-east to RF_MEETING_E (y≈99, x 281–293) · N-east (y≈47, x 282–292) |

### 3.4 3F
| Room | Neighbour | Composition |
|---|---|---|
| 3F_CATWALK | exterior | HARD walls · EXT_OPENING N (y≈44, x 257–266) · EXT_OPENING S (y≈99, x 285–294) |

## 4. Floors and ceilings

### 4.1 Rule per level
| Level | Surface | Tag | Evidence |
|---|---|---|---|
| Basement floor | ground slab | HARD_FLOOR | — |
| **B ceiling = 1F floor** | everywhere | **HARD_FLOOR**, except hatches H1, H2, H3 | Official 1F blueprint has no LOS-floor marking; r6calls has no `1-losf` layer; R6M basement/1F show no destructible floor. A low-reliability guide (r6coaching.com) claims "Buck opens 1F soft floors above Laundry"; **rejected but flagged** in Open questions |
| **1F ceiling = 2F floor** | see §4.2 | SOFT_FLOOR areas + HARD_FLOOR elsewhere + hatches H4, H5, H6 | r6calls `2-losf`; official 2F blueprint; R6M 2F |
| 1F ceilings under a roof (single-storey parts: most of Meeting Hall, Kitchen Corridor, Tower, north part of Dining, Showers/Shower Corridor outside the annex) | roof | HARD (roof) | Official roof blueprint and r6calls roof layer show no destructible roof, skylight or hatch. UNVERIFIED |
| **2F ceilings** | roof | HARD | same |
| 2F Tower ceiling = 3F Catwalk floor | ring | SOFT_FLOOR (ring) + central opening (UNVERIFIED) | r6calls `3-losf` (4 strips forming a ring); official 3F blueprint shows the red LOS-floor ring |
| Roofs (RF_*) | walkable exterior | HARD | as above |

### 4.2 Soft-floor areas on 2F (= soft ceilings of the 1F rooms below)
| id | 2F area | Rect / bbox (u) | 1F room(s) underneath | Sources | verified |
|---|---|---|---|---|---|
| SF-2F-01 | 2F_KIDS_DORMS (whole) | (141.1–207.1, 161.7–203.5) | 1F_KITCHEN | r6calls, official, R6M | yes |
| SF-2F-02 | 2F_DORMS_MAIN_HALL + south half of 2F_MIDDLE + 2F_GAME_ROOM | polygon, bbox (140.3–242.0, 189.8–254.0) | 1F_SECURITY, 1F_SECURITY_CORRIDOR, south edge of 1F_KITCHEN, west part of 1F_LOBBY hall, north part of 1F_CLASSROOM | r6calls (polygon), official (Dorm, Middle-south, Game Room red), R6M | yes (exact polygon UNVERIFIED) |
| SF-2F-03 | 2F_MASTER_BEDROOM (west ~80%) | (248.6–273.0, 226.6–272.3) | 1F_LOBBY (entrance) | r6calls, official | yes |
| SF-2F-04 | 2F_WALK_IN | (223.4–241.9, 256.9–269.8) | south part of 1F_CLASSROOM | r6calls, official | yes |
| SF-2F-05 | 2F_ARMORY_CORRIDOR (middle strip) | (283.3–290.9, 208.7–239.9) | east end of 1F_LOBBY hall / 1F_ARMORY_STAIRS top | r6calls, official | yes |
| SF-2F-06 | 2F_ARMORY (whole, minus hatch) | (298.9–333.0, 209.4–249.3) | 1F_GARAGE | r6calls, official, R6M | yes |
| SF-2F-07 | 2F_OFFICE (north ~60%) | (65.3–95.9, 180.6–207.6) | SW part of 1F_DINING | r6calls, official | yes |
| SF-2F-08 | 2F_SMALL_TOWER (east strip) | (34.3–62.7, 180.6–227.4) | east part of 1F_SMALL_TOWER | r6calls, official | yes |
| SF-2F-09 | 2F_ATTIC (north end) | (251.1–266.3, 99.6–111.5) | 1F_STAGE | r6calls, official, R6M | yes |
| SF-2F-10 | 2F_TROPHY (south half) | ≈ (251–280, 207–224) | south-east of 1F_MEETING_HALL / 1F_SPLIT | official only (r6calls does not mark it) | **UNVERIFIED** |
| SF-2F-11 | 2F_WHITE_STAIRS landing | ≈ (140–197, 256–275) | 1F_WHITE_STAIRS | official only | **UNVERIFIED** |
| SF-3F-01 | 3F_CATWALK ring | outer (256.6–306.5, 48.7–96.8); inner edge ≈ (260–297, 56–85) | 2F_TOWER (NE part) | r6calls, official | yes |

**HARD 2F floors** (no marking in any source): 2F_TOWER; 2F_LOW_ATTIC; 2F_ATTIC except SF-2F-09 and H5; north half of 2F_MIDDLE; 2F_TROPHY (r6calls; see SF-2F-10); north and south ends of 2F_ARMORY_CORRIDOR; 2F_ARMORY_STAIRS; west part of 2F_SMALL_TOWER (stairs/partition area) and south ~40% of 2F_OFFICE.

## 5. Hatches (6)
All six are breakable and reinforceable from the top (Fandom *Reinforcement*: "Trap doors can only be reinforced from the topside"). Size ≈ 11 × 11 u ≈ 1.6 m square (ESTIMATE).

| id | Top (reinforce from) | Bottom | Rect (u) | Sources |
|---|---|---|---|---|
| H1 | 1F_MEETING_HALL | B_ELECTRIC | (258.6–269.6, 122.1–133.1) | official, r6calls (1F `fh` + B `ch`), R6M |
| H2 | 1F_SECURITY | B_FREEZER | (184.5–196.1, 218.7–229.5) | official, r6calls, R6M |
| H3 | 1F_LOBBY | B_LAUNDRY_STORAGE | (257.6–268.5, 242.7–253.4) | official, r6calls, R6M |
| H4 | 2F_KIDS_DORMS | 1F_KITCHEN | (138.8–149.3, 180.0–191.1) | official, r6calls (2F `fh` + 1F `ch`), R6M |
| H5 | 2F_ATTIC | 1F_MEETING_HALL | (244.6–256.1, 126.7–138.3) | official, r6calls, R6M |
| H6 | 2F_ARMORY | 1F_GARAGE | (317.6–328.7, 239.6–250.7) | official, r6calls, R6M |

## 6. Other fixed hard geometry
| What | Where (u) | Tag | Source |
|---|---|---|---|
| Structural pillar in B_BOILER (the room's r6calls name "Pillar") | (228–236, 108–117) | HARD (prop/column) | r6calls floor image |
| Kitchen NE partition (alcove wall) | x 200–203, y 157–178 plus stub y≈178 | HARD (UNVERIFIED: may be a counter or prop) | r6calls floor image |
| 2F Small Tower inner partition | x 20–43, y 191–193 and x 41–43, y 193–229 | HARD (UNVERIFIED) | r6calls / official |

## 7. Notes for implementation (PLAN §8)
- **Section widths vary** from 8.9 u (1.3 m) to 13.5 u (2.0 m) per section. Reinforcements should follow the listed sections, not a fixed width (Fandom: "The width of a Reinforced Wall is dependent on the section it is reinforcing").
- Fandom: "Reinforced walls have fixed heights, though map walls can be higher and thus leave a small unreinforced section at the top". This matters for tall rooms (Meeting Hall, Big Tower stairwell, basement stair shafts). Which Oregon walls leave a gap is UNVERIFIED.
- Only one soft wall faces the outside (SW-1F-17, Garage south). Every other attacker entry from outside is through a door or window, a hatch (none on the roof), or the soft floors from 2F.

## Open questions
1. **Default HARD rule:** is every wall not in §2 really indestructible? Please spot-check in a Custom Game:
   - (a) Kitchen north exterior wall;
   - (b) Dining north exterior wall;
   - (c) Meeting Hall east exterior wall (and does it have windows?);
   - (d) the Kitchen–Security wall between the two soft sections (x 164–184);
   - (e) Boiler–Corridor walls in the basement.
2. **Section counts:** how many reinforcements do these take:
   - Kitchen↔Meeting (expected 2);
   - Kitchen↔Dining (expected 1);
   - Laundry↔Freezer (expected 2);
   - Kids'↔Dorms (expected 2);
   - Garage south wall (expected 2)?
3. **Garage south:** is it a roll-up/garage-door-style destructible panel, or a normal soft wall?
4. **1F floor over the basement:** confirm it is indestructible (no vertical into Laundry/Supply except via the 3 hatches). One low-quality guide claims soft floors above Laundry.
5. **Soft floors:** is the **Trophy** floor (south half) destructible? The **2F White Stairs landing**? Only Ubisoft's 2020 blueprint marks them.
6. **Roofs:** confirm no roof section is breakable. Also: are the two Small Tower roof skylights breakable/enterable?
7. **Exterior openings:** for each EXT_OPENING in `layout_notes.md` §6 — door or window, and can defenders barricade it?
8. **3F catwalk:** is the middle an open drop to 2F, and can the catwalk floor be shot or blown through?
9. Are any **doorways NOT barricadable**? For example, the Split doors, the Stage door, or 2F Middle↔Game Room (we tagged that one OPEN).

## Sources
- https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints/r6-maps-oregon-blueprints.zip — official blueprints with legend (Breakable walls / Breakable floor traps / Line of sight walls / Line of sight floor). Primary source for SOFT, HATCH and SOFT_FLOOR.
- https://r6calls.com/img/maps/oregon.svg — vector layers `bw` (breakable walls plus section dividers), `fh`/`ch` (hatches), `losf` (soft floors), `dt` (drone holes), `ld` (ladders). All coordinates and section counts come from here.
- https://liquipedia.net/commons/File:R6M_Blueprint_Oregon_-_Basement.jpg, https://liquipedia.net/commons/File:R6M_Blueprint_Oregon_-_1st_Floor.jpg, https://liquipedia.net/commons/File:R6M_Blueprint_Oregon_-_2nd_Floor.jpg — Rainbow Six Mobile official blueprints (soft walls, hatches, destructible floors). Third cross-check.
- https://rainbowsix.fandom.com/wiki/Reinforcement — reinforcement rules: fully destructible walls only, 2–3 sections per wall, section-dependent width, hatches reinforced from the top, fixed reinforcement height.
- https://rainbowsix.fandom.com/wiki/Oregon — "6 Hatches", "many soft walls".
- https://r6coaching.com/guides/oregon.html — low-reliability guide (claims 1F soft floors above Laundry); recorded only as a conflicting claim.
