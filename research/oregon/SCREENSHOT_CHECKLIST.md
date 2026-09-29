# Oregon — Screenshot Checklist for Ulo
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: high that these shots are the ones we need (each item maps to an open question in `map_features.md` or `common_setups.md`). Menu names and hotkeys in Siege X are **UNVERIFIED** (written from older guides), so use whatever your client shows.

Hi Ulo, this is the list of screenshots that will make our Oregon greybox match the real map. The web gives us the official blueprints and a community vector map (r6calls) with *approximate* camera, extinguisher, gas-pipe and bomb icons. It does **not** tell us camera facing, exact bomb positions, where the ingredients sit on the walls, or which walls are really reinforceable. You can answer all of that in one or two sessions. Items marked **P1** matter most. **P2** is nice to have.

If you only have 30 minutes, do the **Minimum set** at the end.

---

## 0. One-time setup (about 5 min)

1. **Start a private match:** Play → **Custom Game** → **Local** → Create. (Menu names are from a 2020 guide, so they may differ slightly in Siege X.) Pick **Oregon**, mode **Bomb**.
2. **Timers:** R6 Trainer's "explore a map" recipe sets the action phase to the **maximum the menu allows** (it quotes 600 s) and the prep phase short. For drone and camera shots, set **prep to its maximum** instead, because defenders can use cameras and attackers can drone during prep. There's no "no timer" option that I know of, so just use the max values.
3. **Rounds:** as many as possible. Turn on side swap if you like, so you can play both sides.
4. **Graphics:** your normal settings are fine. Please write down your **FOV** and resolution once in `NOTES.txt` (e.g., "FOV 90, 2560×1440"), because we use it to estimate room sizes from photos. Use at least 1920×1080. PNG preferred, JPG is fine.
5. **Screenshot key:** Steam F12, the Ubisoft Connect overlay, or Windows **Win+Alt+PrtScn** (Xbox Game Bar, saves to `Videos\Captures`). Any of these works.
6. **Optional power tool:** if your custom match shows up in **Match Replay**, the replay free cam can fly anywhere (top-down, roofs, through walls), and Y11S1 added options to hide HUD parts. That's great for the overview and exterior shots. Whether local custom games get replays is UNVERIFIED.
7. **Directions** in file names use the **in-game compass** at the top of your HUD (N, NE, E, …). "from_corner_NE" means you stand in the NE corner looking across the room.

### File naming
```
<GROUP or FLOOR>_<room_or_thing>_<detail>_<facing-or-from>.png
FLOOR  = B | 1F | 2F | 3F (Big Tower top) | ROOF | EXT
room   = lower_snake_case callout as the game shows it, e.g. kids_dorms, dorm_main_hall, laundry_room
GROUP  = BP | SPAWN | CAM | HATCH | BOMB | STAIRS | LADDER | ING | WALL | OOB | LIGHT | Q
examples:
  2F_kids_dorms_from_door_NE.png
  HATCH_H3_1F_lobby_top_closed.png
  CAM_03_1F_rear_stage_view.png
  ING_gaspipe_B_boiler_room_1.png
```
If you shoot several of the same thing, add `_2`, `_3`. Put all answers to questions in `research/oregon/refs/ulo/NOTES.txt` (plain text is fine), e.g. `Q3: H3 drops into Laundry Storage`.

The room names below are the **PC callouts** (they appear on your HUD when you enter a room). If the game shows a different name, use the game's name and tell me in NOTES.txt.

---

## 1. Overview / "blueprint" views — P1
Capture whatever floor-plan or map overview the game shows during **operator select**, **site selection** or **prep phase**. If it can switch floors, capture each one.
- [ ] `BP_B_prepview.png`, `BP_1F_prepview.png`, `BP_2F_prepview.png` (and `BP_3F_prepview.png` if the Big Tower top shows)
- [ ] `BP_attack_spawn_select.png`: the attacker spawn-choice screen showing all spawn names (expected: Junkyard, Street, Construction Site; answers **Q8**)
- [ ] `BP_defense_site_select.png`: the defender site list (expected: Kids' Dorms/Dorms Main Hall, Kitchen/Dining Hall, Meeting Hall/Kitchen, Laundry/Supply)

## 2. Attacker spawns — P1
How: play attack, pick each spawn in turn (you can change spawn in prep).
- [ ] `SPAWN_A_junkyard_toward_building.png` + `SPAWN_A_junkyard_behind.png` (turn around once)
- [ ] `SPAWN_B_street_toward_building.png` + `SPAWN_B_street_behind.png`
- [ ] `SPAWN_C_construction_site_toward_building.png` + `SPAWN_C_construction_site_behind.png`
- [ ] P2: from each spawn, one zoomed (ADS) shot at the windows that look back at you: `SPAWN_A_junkyard_peek_windows.png`, etc.

## 3. Default cameras — P1 (the biggest unknown, **Q1**)
How: play defense. During prep, open the camera view and cycle through every default camera.
- [ ] Write the **total count** in NOTES.txt. A community map (r6calls, July 2026) shows **8**:

| NN | Expected location | File |
|---|---|---|
| 01 | EXT, west / Junkyard–Bus side (by Small Tower's south-west corner) | `CAM_01_EXT_junkyard_view.png` |
| 02 | EXT, south-east / Parking–Street side (beyond Garage) | `CAM_02_EXT_parking_view.png` |
| 03 | EXT, north-east / Construction | `CAM_03_EXT_construction_view.png` |
| 04 | B Freezer | `CAM_04_B_freezer_view.png` |
| 05 | 1F Rear Stage (Big Tower ground floor), east end | `CAM_05_1F_rear_stage_view.png` |
| 06 | 1F Lobby, north side of the hall | `CAM_06_1F_lobby_view.png` |
| 07 | 1F Shower Corridor, south end | `CAM_07_1F_shower_corridor_view.png` |
| 08 | 2F Armory Corridor, north end | `CAM_08_2F_armory_corridor_view.png` |

- [ ] For each camera: the `_view.png` above (the feed at its default angle).
- [ ] For each camera: `CAM_NN_<floor>_<room>_mount.png`. Walk to it and look at the camera so we see which wall or corner it's on, and how high.
- [ ] If the game shows a camera that isn't in this table, or one of these is missing, tell me in NOTES.txt.
- [ ] P2: `CAM_NN_..._view_left.png` / `_view_right.png` at the rotation limits.

## 4. Hatches (6) — P1
Standing on top, look down at the hatch. Standing below, look up at it. Take one shot **closed**, then break it (melee or shotgun) and take the same two shots **open**.

| id | Top (upper floor/room) | Bottom (lower floor/room I expect) | Files |
|---|---|---|---|
| H1 | 1F Meeting Hall (north part) | B Electric Room | `HATCH_H1_1F_meeting_hall_top_{closed,open}.png`, `HATCH_H1_B_electric_room_bottom_{closed,open}.png` |
| H2 | 1F Security | B Freezer (east end) | `HATCH_H2_1F_security_top_*.png`, `HATCH_H2_B_freezer_bottom_*.png` |
| H3 | 1F Lobby (next to Classroom) | **B Laundry Storage?** (answers **Q3**) | `HATCH_H3_1F_lobby_top_*.png`, `HATCH_H3_B_<room>_bottom_*.png` |
| H4 | 2F Kids' Dorms (west side) | 1F Kitchen (west end) | `HATCH_H4_2F_kids_dorms_top_*.png`, `HATCH_H4_1F_kitchen_bottom_*.png` |
| H5 | 2F Attic (north corridor) | 1F Meeting Hall | `HATCH_H5_2F_attic_top_*.png`, `HATCH_H5_1F_meeting_hall_bottom_*.png` |
| H6 | 2F Armory | 1F Garage | `HATCH_H6_2F_armory_top_*.png`, `HATCH_H6_1F_garage_bottom_*.png` |

- [ ] If you find a hatch that isn't in this table, shoot it and tell me.

## 5. Bomb sites — P1
For each bomb room: **4 corner shots** (stand in the corner, look across the room), **one shot from each doorway** looking in, and a **close-up of the bomb** from 2 angles (answers **SQ3**). Kitchen belongs to two site pairs, so shoot it once. Also note the **in-game A/B letter** of each bomb. Expected rough positions (r6calls markers): Laundry SW part, Supply centre, Dining north-centre, Kitchen centre-east, Meeting Hall NW part, Kids' east part, Dorm Main Hall SW part.

### Basement — Laundry / Supply
How: Custom → defense → pick Laundry/Supply (or walk down any stairs).
- [ ] `B_laundry_room_from_corner_{NE,NW,SE,SW}.png`
- [ ] `B_laundry_room_from_door_basement_hall.png`, `B_laundry_room_from_door_laundry_storage.png`, `B_laundry_room_from_laundry_stairs.png`
- [ ] `BOMB_B_laundry_1.png`, `BOMB_B_laundry_2.png`
- [ ] `B_supply_room_from_corner_{NE,NW,SE,SW}.png`, `B_supply_room_from_door_basement_hall.png`, `B_supply_room_from_door_electric_room.png`, `B_supply_closet_inside.png`
- [ ] `BOMB_B_supply_1.png`, `BOMB_B_supply_2.png`
- [ ] P2 (neighbours): `B_freezer_*`, `B_basement_hall_*`, `B_boiler_room_*`, `B_electric_room_*`, `B_blue_bunker_*`, `B_laundry_storage_*`, one or two shots each

### 1F — Kitchen / Dining Hall / Meeting Hall
- [ ] `1F_kitchen_from_corner_{NE,NW,SE,SW}.png`, `1F_kitchen_from_door_dining_hall.png`, `1F_kitchen_from_door_kitchen_corridor.png`, `BOMB_1F_kitchen_1.png`, `BOMB_1F_kitchen_2.png`
- [ ] `1F_dining_hall_from_corner_{NE,NW,SE,SW}.png`, `1F_dining_hall_from_door_small_tower.png`, `1F_dining_hall_from_door_SE.png`, `BOMB_1F_dining_hall_1.png`, `BOMB_1F_dining_hall_2.png`
- [ ] `1F_meeting_hall_from_corner_{NE,NW,SE,SW}.png`, `1F_meeting_hall_from_door_kitchen_corridor.png`, `1F_meeting_hall_from_split.png`, `1F_meeting_hall_stage.png`, `BOMB_1F_meeting_hall_1.png`, `BOMB_1F_meeting_hall_2.png`

### 2F — Kids' Dorms / Dorm Main Hall
- [ ] `2F_kids_dorms_from_corner_{NE,NW,SE,SW}.png`, `2F_kids_dorms_from_door_dorm_main_hall.png`, `BOMB_2F_kids_dorms_1.png`, `BOMB_2F_kids_dorms_2.png`
- [ ] `2F_dorm_main_hall_from_corner_{NE,NW,SE,SW}.png`, `2F_dorm_main_hall_from_door_white_stairs.png`, `2F_dorm_main_hall_from_door_attic.png`, `2F_dorm_main_hall_from_door_trophy_room.png`, `BOMB_2F_dorm_main_hall_1.png`, `BOMB_2F_dorm_main_hall_2.png`
- [ ] `2F_dorm_main_hall_big_window_inside.png` and `..._outside.png` (the large west window)
- [ ] P2: `2F_attic_*` (both ends), `2F_trophy_room_*`, `2F_game_room_*`, `2F_walk_in_*`, `2F_master_bedroom_*`, `2F_armory_*`

## 6. Stairs and ladder — P1/P2
- [ ] **S1 Tower/Back Stairs:** `STAIRS_S1_B_bottom.png`, `STAIRS_S1_1F_landing.png`, `STAIRS_S1_2F_top.png`
- [ ] **S2 White/Freezer Stairs:** `STAIRS_S2_B_bottom_freezer.png`, `STAIRS_S2_1F_landing.png`, `STAIRS_S2_2F_top.png`
- [ ] **S3 Main/Laundry Stairs:** `STAIRS_S3_B_bottom.png`, `STAIRS_S3_1F_landing.png`, `STAIRS_S3_2F_top.png`. In NOTES.txt: one stairwell or two separate flights? (**Q4**)
- [ ] **S4 Small Tower ("Small Stairs" on r6calls):** confirm the staircase inside Small Tower between 1F and 2F. `STAIRS_S4_small_tower_bottom.png`, `STAIRS_S4_small_tower_top.png` (**Q5**)
- [ ] **S5 Bunker stairs:** `STAIRS_S5_EXT_top.png`, `STAIRS_S5_B_blue_bunker_bottom.png` (**Q7**)
- [ ] **L1 Big Tower ladder:** `LADDER_L1_2F_big_tower_bottom.png`, `LADDER_L1_3F_top.png`. In NOTES.txt: where in Big Tower is it? (**Q6**)

## 7. Siege X destructible ingredients — P1 (**Q2**)
How: for each item, take one wide shot that shows where it sits in the room (which wall, how high). r6calls (July 2026) shows these 9. Confirm them, and add any it missed:
- [ ] `ING_extinguisher_B_basement_hall_1.png` (Basement Hall/Corridor, between the Supply and Laundry doors)
- [ ] `ING_extinguisher_B_freezer_1.png` (the dark north arm of Freezer)
- [ ] `ING_extinguisher_1F_security_corridor_1.png`
- [ ] `ING_extinguisher_1F_kitchen_corridor_1.png`
- [ ] `ING_extinguisher_1F_lobby_1.png` (the east–west hall south of Split)
- [ ] `ING_extinguisher_2F_trophy_room_1.png` (NE corner, top of Armory Corridor)
- [ ] `ING_extinguisher_2F_low_attic_1.png` (the wide part of the Attic next to Kids')
- [ ] `ING_gaspipe_1F_main_stairs_1.png`: by Main Stairs, or just outside the Garage's south-west corner. Which is it?
- [ ] `ING_gaspipe_2F_attic_1.png` (north corridor from Big Tower)
- [ ] Any others you spot: `ING_<type>_<floor>_<room>_<n>.png`. Any **metal detector**? (I don't expect any.)
- [ ] P2: shoot one gas pipe and one extinguisher and record a short clip or 2–3 screenshots of the effect (flame length, smoke size). Note seconds in NOTES.txt.
Tip: take the placement shots before you shoot anything.

## 8. Walls and floors: soft / hard / reinforceable — P1 for site walls
How: play defense in prep. Walk up to each wall below and hold the reinforce key.
- If it reinforces, great: take the screenshot **after** it's reinforced (shows the panel count).
- If you get no prompt, stand back and melee it 2–3 times. A soft wall gets holes, a hard wall doesn't.
- File name: `WALL_<floor>_<roomA>__<roomB>_<reinforced|soft_only|hard>.png`

| Wall (see `common_setups.md`) | Where |
|---|---|
| Laundry ↔ Freezer | B, west wall of Laundry |
| Supply ↔ Blue Bunker | B, east wall of Supply |
| Supply ↔ Boiler Room | B, north-west wall of Supply |
| Electric Room ↔ Boiler / ↔ Blue Bunker | B, the walls of the small Electric Room |
| Supply Closet ↔ Laundry, Supply ↔ Laundry | B, between the two bomb rooms |
| Kitchen ↔ Meeting Hall | 1F |
| Kitchen ↔ Security (both parts) | 1F, south wall of Kitchen |
| Kitchen ↔ Dining Hall (the part beside the door) | 1F |
| Dining Hall ↔ Small Tower | 1F |
| Dining Hall ↔ Showers | 1F |
| Rear Stage ↔ Meeting Hall | 1F, north wall of Meeting Hall |
| Meeting Hall corners ↔ White Hall / Lobby | 1F, south corners |
| Classroom ↔ Lobby | 1F |
| Kids' Dorms ↔ Attic | 2F |
| Kids' Dorms ↔ Dorm Main Hall | 2F |
| Attic ↔ Trophy Room | 2F |
| Dorm Main Hall ↔ Game Room, Game Room ↔ Walk-In | 2F |
| Big Tower ↔ Attic connector | 2F |
| Master ↔ Armory Corridor, Armory Corridor ↔ Armory | 2F |

- [ ] **Exterior walls (SQ2):** melee-test one exterior wall of Kitchen (north), Meeting Hall (east), Dorm Main Hall (west) and Garage (south). Do they break? `WALL_EXT_<room>_<result>.png`
- [ ] **Floors:** shoot or melee the floor in 1F Kitchen and in 2F Kids' Dorms. I expect 1F floors to be hard and 2F floors to be soft. `FLOOR_1F_kitchen_<result>.png`, `FLOOR_2F_kids_dorms_<result>.png`
- [ ] **Hatch reinforce:** does each hatch H1–H6 accept reinforcement? A yes/no list in NOTES.txt is enough.

## 9. Windows and doors used as entries — P2 (**Q10**, **SQ8**)
For each exterior window or door you'd actually use to attack a site: one shot from outside, one from inside.
- [ ] Dorm Main Hall "Big Window" (west), Kids' Dorms north window (does it exist? is it used?), the Attic exterior window, Armory east windows, Master/Balcony (south), Meeting Hall east windows, Small Tower windows and door, Kitchen Corridor outside door, Garage doors, Main Entrance.
- [ ] File: `EXT_entry_<room>_<window|door>_{outside,inside}.png`

## 10. Exterior, roofs and the Big Tower top — P1
How: as attacker, climb the Big Tower ladder or rappel onto roofs. Use the Match Replay free cam if it works for you.
- [ ] `3F_big_tower_top_view_{N,E,S,W}.png`: 4 shots from the highest point of the map
- [ ] `ROOF_dorms_roof_view_{N,E,S,W}.png` (main brown roof over the 2F block)
- [ ] `ROOF_dining_flat_roof_view_{E,W}.png`: can you walk on the flat roof west of the Dorms? (**Q9**)
- [ ] `ROOF_meeting_hall_roof_*.png`, `ROOF_small_tower_roof_*.png`, `ROOF_garage_roof_*.png`
- [ ] One wide shot per exterior area: `EXT_junkyard.png`, `EXT_bus_yard.png`, `EXT_farmlands.png`, `EXT_shooting_range.png`, `EXT_construction_site.png`, `EXT_parking.png`, `EXT_main_entrance.png`, `EXT_street.png`
- [ ] P2 rappel test: try to rappel on each side of the building. NOTES.txt: any wall where rappel isn't allowed? (**Q9**)

## 11. Out-of-bounds / spawn-peek — P2 (**Q11**)
How: play defense in the action phase and step out of an exterior door (Kitchen Corridor outside door, Small Tower door, Garage, Main Entrance, Bunker stairs).
- [ ] `OOB_<door>_warning.png` when the "detected / out of bounds" warning appears. Write down how many seconds it took.
- [ ] Does standing in the **Big Tower top** or on a **roof** count as outside?
- [ ] NOTES.txt: known spawn-peek windows today (which window → which spawn).

## 12. Lighting reference — P2 (for the art pass)
If you can, hide the HUD; otherwise just aim away from it.
- [ ] `LIGHT_B_laundry_room.png`, `LIGHT_B_basement_hall.png` (how dark is the basement?)
- [ ] `LIGHT_1F_kitchen.png`, `LIGHT_1F_meeting_hall.png`, `LIGHT_2F_kids_dorms.png`, `LIGHT_3F_big_tower_top.png`
- [ ] `LIGHT_EXT_spawn_A_sun.png`: look toward the sun if you can, so we can match the sun direction
- [ ] Any really dark corners you know defenders hide in: `LIGHT_dark_corner_<room>.png`

## 13. Question sheet (copy into NOTES.txt and answer)
From `map_features.md`: Q1 cameras (8 expected) · Q2 ingredients (7 extinguishers + 2 gas pipes expected) · Q3 Lobby hatch → which room · Q4 Main/Laundry stairs continuity · Q5 Small Tower stairs · Q6 ladder position and whether the tower top counts as inside · Q7 Bunker stairs · Q8 spawn names/count · Q9 rappel limits and Dining flat roof · Q10 common entry windows · Q11 spawn-peek spots · Q12 notable vaultable props.
From `common_setups.md`: SQ1 your usual reinforcements per site · SQ2 are the "breakable" walls reinforceable, and are exterior walls hard · SQ3 bomb positions · SQ4 standard Mira spots · SQ5 usual attack routes per site · SQ6 default plants and post-plant spots · SQ7 does anyone reinforce H1/H4 · SQ8 the Kids' north window · SQ9 standard rotation holes · SQ10 ingredients that change setups.

---

## Minimum set (about 30 min, if that's all you have)
1. `BP_*` for B, 1F, 2F (3 shots)
2. `SPAWN_*_toward_building` (3 shots)
3. Every `CAM_NN_*_view` + the camera count (8 expected)
4. Every `HATCH_H*_top_closed` + `_bottom_closed` (12 shots)
5. `BOMB_*` one shot per bomb (7 bomb rooms, since Kitchen counts once)
6. Every gas pipe / extinguisher you pass (`ING_*`)

---

## How to share
1. Save everything (plus `NOTES.txt`) into **`research/oregon/refs/ulo/`** in your local clone.
2. The repo's `.gitattributes` already routes `*.png`, `*.jpg`, `*.jpeg`, `*.webp` and `*.mp4` through **Git LFS**. If you've never used LFS on this PC, run `git lfs install` once.
3. Commit and push:
   ```
   git add research/oregon/refs/ulo
   git commit -m "docs(oregon): add Ulo's Oregon screenshots"
   git push
   ```
   Check with `git lfs ls-files`: your images should be listed.
4. **The repo is currently public** (`github.com/DoperDodge/Siege_Online`). These screenshots are Ubisoft game imagery, and PLAN.md §1.1 treats references as private. Consider **making the repository private first**: GitHub → the repo → Settings → General → Danger Zone → *Change repository visibility*. If you'd rather keep the repo public, zip the screenshots and share them privately (e.g., a private Drive link), and I'll use them locally without committing them.
5. Short video walkthroughs (`.mp4`, e.g., one per floor) also help and are LFS-tracked. Keep each under about 100 MB, because GitHub's free LFS quota is limited (exact current quota UNVERIFIED).

## Open questions
- Menu names (Custom Game → Local), the max prep/action timer values, and whether Match Replay works for local custom games are all UNVERIFIED for Siege X. Ulo: tell me what you actually see so I can fix this checklist.

## Sources
- `research/oregon/map_features.md` and `research/oregon/common_setups.md` (this repo) — the open questions these shots resolve
- https://www.r6trainer.com/creating-a-custom-match-for-exploring-a-map/ — Custom Game → Local recipe for exploring a map (prep short, action at max)
- https://r6calls.com/img/maps/oregon.svg — community vector map (July 2026). Expected camera, extinguisher, gas-pipe and bomb-marker locations (converted in `map_features.md` §2–3)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — Y11S1 Match Replay free-cam optimization and HUD-hiding options; Oregon modernization with new destructible ingredients
- `PLAN.md` §1.1 (references stay private), §2.2 item 3 (screenshot priorities), §4 / `.gitattributes` (Git LFS patterns)
