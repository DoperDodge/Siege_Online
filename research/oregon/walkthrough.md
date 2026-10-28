# Oregon walkthrough log (Phase 5, M6 and M7)

Ulo walks the greybox against the game, and each mismatch is logged here: where it was (the room, and the HUD line's
position), what the game has, the fix and its commit (tools/mapgen/DESIGN.md §9.4). Sign-off on the layout's
accuracy (PLAN §17) is recorded at the end and in PROGRESS.md.

## How to walk it

Open the Oregon greybox (PROGRESS.md, Phase 5, "How to test") next to Oregon in a Custom Game. For each room, Go to
(Esc, then the room) puts you in it. Then walk between rooms on foot. Compare:

- **walls**: where they are and how long;
- **doors and windows**: where they are, and door or window;
- **soft walls**: where they are, and how many reinforcements each takes (the label on each says);
- **hatches, stairs and the ladder**: where they are, which way they go, and where you land;
- **roofs**: which are flat, which slope, and where you can get onto them;
- **callouts, bomb sites, cameras and spawns**.

To report a mismatch, tell me the room, what's different, and the HUD line at the bottom left: it names the room
and the storey, and gives your position in the plan's units. A screenshot helps, but game screenshots are Ubisoft's
imagery and never go into the repo (PLAN §1.1).

A route that covers everything:
1. **Outside:** Go to → Attacker spawn A Junkyard, then B Street and C Construction; walk round the building, down
   the Bunker stairs to the basement's east door, and up the Tower's outside stairs onto the Meeting roof.
2. **1F**, room by room, then the corridors on foot.
3. **The basement**, down each staircase (the Tower, White and Armory Stairs).
4. **2F**, up the stairs; out of the Office's north window onto the Dining roof; the Master's door onto the
   Balcony.
5. **The Cat Walk**, up the ladder in the 2F Tower.
6. **The bomb sites:** Go to → Bomb sites, each with O for the zones (rappel faces, spawn peeks, run-outs).

## Questions to settle on the walk

Each is open in research/OPEN_QUESTIONS.md ("Placeholders added while building Phase 5" unless it says otherwise).

1. **The 2F Small Tower's south opening (item 13):** can you go from the 2F Small Tower straight out onto the
   Dining roof, or only through the Office next door? We build that opening as wall (Ubisoft's blueprint has none).
2. **The 2F Small Tower's west part (item 22):** inside its L-shaped wall, is there a floor, or a balcony over the
   1F workshop with a railing?
3. **Door or window (item 5):** each outside opening in the checklist says which we built.
4. **Soft walls (items 8 and 9):** how many reinforcements each takes; most likely to be wrong: SW-B-01, SW-1F-06,
   SW-B-04, SW-B-05, SW-1F-01, SW-1F-17, SW-2F-05. Is the Garage's south wall a garage door?
5. **Scale and heights (items 1 and 2):** is an inside doorway about 1.2 m wide? How many steps from 1F to 2F?
6. **Ceilings (item 24):** flat under the pitched roofs on 2F? Is the Meeting Hall open to its roof?
7. **The Tower's outside stairs and the Bunker stairs (item 25):** where do they lead?
8. **Camera CAM5 (item 28):** the research calls its room the Rear Stage ("T1", the Big Tower's ground floor), and
   r6calls' icon is in our 1F Tower room, 0.7 m north of its wall with the Stage. Which room is the Rear Stage?
9. **The basement's drone tunnels (layout_notes question 9):** where do they lead? The one along the Supply Room's
   south-east strip isn't built.
10. **Three basement walls (item 32):** Ubisoft's blueprint doesn't draw them where we built them: the Boiler's
    pillar (in the Pillar room), a thick wall at the Blue room's east end, and a short wall at the far east end
    of the Bunker passage (`python3 -I tools/mapgen/extract/bpcheck.py` measures it). Are they there?

## Checklist, room by room

What we built, read off the compiled level (`npm run mapgen` writes this list; `npm run mapgen -- --check` fails
when it is out of date, and a ticked line stays ticked). Each thing is listed where it was built, whatever the
research calls the room: a door, window, soft wall, passage or drone hole in the rooms on both sides of it, with
the side of the room it is on and where it leads ("to the outside", "onto" a roof); stairs, the ladder, hatches
and soft floors in the rooms at both ends; bombs, defender spawns, cameras, extinguishers and gas pipes where they
stand in the room, from its middle; the furniture with its class and height. Ids in brackets are the build's
(data/maps/oregon/walls_*.json; hover a box in research/oregon/compare/*.svg for its id), for reporting a
mismatch. UNVERIFIED marks a placeholder (research/OPEN_QUESTIONS.md). North is up in the plans.

<!-- checklist: npm run mapgen writes everything down to the end marker (tools/mapgen/checklist.ts); ticks are kept -->

#### Basement (B)

- [ ] **Tower Stairs** (`B_TOWER_STAIRS`): stairs **S1** (Tower Stairs) up to 1F Tower; open south, to Pillar, no wall between.
- [ ] **Pillar** (`B_BOILER`): soft wall **SW-B-04** south, to Electric: 2 reinforcements (UNVERIFIED); soft wall **SW-B-07** south, to Supply Room: 1 reinforcement (UNVERIFIED); door east to Blue (B.o004); door east to Electric (B.o010); door south to Basement Corridor (B.o000); open north, to Tower Stairs, no wall between.
- [ ] **Electric** (`B_ELECTRIC`): hatch **H1** in the ceiling, in the middle, up to 1F Meeting Hall; soft wall **SW-B-04** north, to Pillar: 2 reinforcements (UNVERIFIED); soft wall **SW-B-03** east, to Blue: 2 reinforcements (UNVERIFIED); door south to Supply Room (B.o001); door west to Pillar (B.o010).
- [ ] **Blue** (`B_BUNKER_ENTRANCE`): soft wall **SW-B-02** west, to Supply Room: 2 reinforcements (UNVERIFIED); soft wall **SW-B-03** west, to Electric: 2 reinforcements (UNVERIFIED); door east to the outside (B.o009; door or window UNVERIFIED); door west to Pillar (B.o004).
- [ ] **Supply Room** (`B_SUPPLY`): soft wall **SW-B-07** north, to Pillar: 1 reinforcement (UNVERIFIED); soft wall **SW-B-02** east, to Blue: 2 reinforcements (UNVERIFIED); soft wall **SW-B-06** south, to Laundry Room: 1 reinforcement (UNVERIFIED); door north to Electric (B.o001); door west to Basement Corridor (B.o006); door west to Closet (B.o008); bomb **4B** in the middle (site 4, B Laundry / Supply); defender spawn (site 4) (×2); the table by the north wall (wood, 0.8 m, vaultable).
- [ ] **Closet** (`B_SUPPLY_CLOSET`): soft wall **SW-B-05** south, to Laundry Room: 2 reinforcements (UNVERIFIED); door east to Supply Room (B.o008); drone hole west, to Basement Corridor (B.dt3).
- [ ] **Basement Corridor** (`B_CORRIDOR`): door north to Pillar (B.o000); door east to Supply Room (B.o006); door south to Laundry Room (B.o002); door west to Freezer Hall (B.o005); drone hole east, to Closet (B.dt3); drone hole west, to Freezer Hall (B.dt2); extinguisher **ING1** in the south-east.
- [ ] **Freezer Hall** (`B_FREEZER_HALL`): door east to Basement Corridor (B.o005); open south, to Freezer, no wall between; drone hole east, to Basement Corridor (B.dt2); extinguisher **ING2** in the south-east.
- [ ] **Freezer** (`B_FREEZER`): hatch **H2** in the ceiling, in the south-east, up to 1F Security; soft wall **SW-B-01** east, to Laundry Room: 2 reinforcements (UNVERIFIED); open north, to Freezer Hall, no wall between; open south, to Freezer Stairs, no wall between; camera **CAM4** in the north-west, 2.7 m up (the research: B Freezer, west part); the chest freezer by the west end (metal, 0.9 m, vaultable); the chest freezer on the south side (metal, 0.9 m, vaultable).
- [ ] **Freezer Stairs** (`B_FREEZER_STAIRS`): stairs **S2** (White Stairs) up to 1F White Stairs; open north, to Freezer, no wall between.
- [ ] **Laundry Room** (`B_LAUNDRY`): soft wall **SW-B-05** north, to Closet: 2 reinforcements (UNVERIFIED); soft wall **SW-B-06** north, to Supply Room: 1 reinforcement (UNVERIFIED); soft wall **SW-B-01** west, to Freezer: 2 reinforcements (UNVERIFIED); door north to Basement Corridor (B.o002); door south to Storage (B.o003); bomb **4A** in the west (site 4, B Laundry / Supply); defender spawn (site 4) (×3); the folding table (wood, 0.8 m, vaultable); the washing machines in the east alcove (metal, 0.9 m, vaultable).
- [ ] **Storage** (`B_LAUNDRY_STORAGE`): hatch **H3** in the ceiling, in the north, up to 1F Lobby; door north to Laundry Room (B.o003); door east to Laundry Stairs (B.o007).
- [ ] **Laundry Stairs** (`B_LAUNDRY_STAIRS`): stairs **S3** (Armory Stairs) up to 1F Armory Stairs; door west to Storage (B.o007).

#### First floor (1F)

- [ ] **Small Tower** (`1F_SMALL_TOWER`): stairs **S4** (Small Stairs) up to 2F Small Tower; soft wall **SW-1F-01** east, to Dining Hall: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-02** east, to Showers: 2 reinforcements (UNVERIFIED); door east to Dining Hall (1F.o022); door south to Shower Corridor (1F.o006); door south to the outside (1F.o005; door or window UNVERIFIED); door west to the outside (1F.o021; door or window UNVERIFIED); drone hole west, to the outside (1F.dt1); soft ceiling **SF-2F-08** (25 m², under 2F Small Tower).
- [ ] **Dining Hall** (`1F_DINING`): soft wall **SW-1F-05** east, to Kitchen: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-03** south, to Showers: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-01** west, to Small Tower: 2 reinforcements (UNVERIFIED); door east to Kitchen (1F.o019); door south to Dining Hallway (1F.o000); door west to Small Tower (1F.o022); soft ceiling **SF-2F-07** (20 m², under 2F Office); bomb **2A** in the north (site 2, 1F Kitchen / Dining Hall); defender spawn (site 2) (×3); the long seat east of the middle (soft, 0.8 m, vaultable); the low cabinet beside it (wood, 0.9 m, vaultable); the table in the south-west corner (wood, 0.8 m, vaultable); the table on the rug by the north-west corner (wood, 0.8 m, vaultable).
- [ ] **Showers** (`1F_SHOWERS`): soft wall **SW-1F-03** north, to Dining Hall: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-04** east, to Dining Hallway: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-02** west, to Small Tower: 2 reinforcements (UNVERIFIED); door south to Shower Corridor (1F.o007).
- [ ] **Dining Hallway** (`1F_DINING_HALLWAY`): soft wall **SW-1F-04** west, to Showers: 2 reinforcements (UNVERIFIED); door north to Dining Hall (1F.o000); door east to Security Corridor (1F.o020); open south, to Shower Corridor, no wall between.
- [ ] **Shower Corridor** (`1F_SHOWER_CORRIDOR`): door north to Showers (1F.o007); door north to Small Tower (1F.o006); door south to the outside (1F.o008; door or window UNVERIFIED); open north, to Dining Hallway, no wall between; drone hole south, to the outside (1F.dt2); camera **CAM7** in the east, 2.7 m up (the research: 1F Shower Corridor, south end).
- [ ] **Kitchen** (`1F_KITCHEN`): hatch **H4** in the ceiling, in the west, up to 2F Kids' Dorms; soft wall **SW-1F-08** east, to Meeting Hall: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-06** south, to Security: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-07** south, to Security: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-05** west, to Dining Hall: 1 reinforcement (UNVERIFIED); door north to Kitchen Corridor (1F.o004); door west to Dining Hall (1F.o019); drone hole east, to Meeting Hall (1F.dt5); drone hole south, to Security Corridor (1F.dt4); soft ceiling **SF-2F-01** (62 m², under 2F Kids' Dorms); bomb **2B** in the middle (site 2, 1F Kitchen / Dining Hall); bomb **3B** in the middle (site 3, 1F Meeting Hall / Kitchen); defender spawn (site 2) (×2); defender spawn (site 3) (×2); the counter along the north wall (wood, 0.9 m, vaultable); the counter along the south wall (wood, 0.9 m, vaultable); the counter in the east part (wood, 0.9 m, vaultable); the island (wood, 0.9 m, vaultable).
- [ ] **Kitchen Corridor** (`1F_KITCHEN_CORRIDOR`): door north to Tower (1F.o002); door east to Stage (1F.o028); door south to Kitchen (1F.o004); door west to the outside (1F.o024; door or window UNVERIFIED); drone hole south, to Meeting Hall (1F.dt6); extinguisher **ING4** in the middle.
- [ ] **Tower** (`1F_TOWER`): stairs **S1** (Tower Stairs) down to B Tower Stairs; stairs **S1** (Tower Stairs) up to 2F Tower; soft wall **SW-1F-09** south, to Stage: 2 reinforcements (UNVERIFIED); door north to the outside (1F.o015; door or window UNVERIFIED); door east to the outside (1F.o027; door or window UNVERIFIED); door south to Kitchen Corridor (1F.o002); open north, to Tower Stairs, no wall between; camera **CAM5** in the south-east, 2.7 m up (the research: 1F Rear Stage, east end (west along it [PRE])).
- [ ] **Tower Stairs** (`1F_TOWER_STAIRS`): stairs **S1** (Tower Stairs) from 1F up to 2F run through it; stairs **S1** (Tower Stairs) from B up to 1F run through it; open south, to Tower, no wall between.
- [ ] **Meeting Hall** (`1F_MEETING_HALL`): hatch **H1** in the floor, in the north-east, down to B Electric; hatch **H5** in the ceiling, in the north, up to 2F Attic; soft wall **SW-1F-10** south, to Lobby: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-11** south, to Lobby: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-08** west, to Kitchen: 2 reinforcements (UNVERIFIED); door east to Split (1F.o029); door west to Split (1F.o030); open north, to Stage, no wall between; drone hole north, to Kitchen Corridor (1F.dt6); drone hole west, to Kitchen (1F.dt5); bomb **3A** in the north-west (site 3, 1F Meeting Hall / Kitchen); defender spawn (site 3) (×3); the benches in the middle (wood, 0.8 m, vaultable); the long table on the east side (wood, 0.8 m, vaultable); the long table on the west side (wood, 0.8 m, vaultable); the low bookcase north of the middle (wood, 0.9 m, vaultable).
- [ ] **Stage** (`1F_STAGE`): soft wall **SW-1F-09** north, to Tower: 2 reinforcements (UNVERIFIED); door west to Kitchen Corridor (1F.o028); open south, to Meeting Hall, no wall between; soft ceiling **SF-2F-09** (4 m², under 2F Attic).
- [ ] **Split** (`1F_SPLIT`): door east to Meeting Hall (1F.o030); door south to Lobby (1F.o001); door west to Meeting Hall (1F.o029); soft ceiling **SF-2F-10** (2 m², under 2F Trophy).
- [ ] **Security** (`1F_SECURITY`): hatch **H2** in the floor, in the east, down to B Freezer; soft wall **SW-1F-06** north, to Kitchen: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-07** north, to Kitchen: 1 reinforcement (UNVERIFIED); door south to Security Corridor (1F.o003); soft ceiling **SF-2F-02** (33 m², under 2F Dorms Main Hall).
- [ ] **Security Corridor** (`1F_SECURITY_CORRIDOR`): stairs **S2** (White Stairs) up to 2F White Stairs; door north to Security (1F.o003); door south to White Stairs (1F.o010); door south to the outside (1F.o009; door or window UNVERIFIED); door west to Dining Hallway (1F.o020); open east, to Lobby (1F.o017); open east, to White Stairs, no wall between; drone hole north, to Kitchen (1F.dt4); soft ceiling **SF-2F-02** (39 m², under 2F Dorms Main Hall, 2F Gaming, 2F Middle); soft ceiling **SF-2F-11** (7 m², under 2F White Stairs); extinguisher **ING3** in the west.
- [ ] **White Stairs** (`1F_WHITE_STAIRS`): stairs **S2** (White Stairs) down to B Freezer Stairs; stairs **S2** (White Stairs) from 1F up to 2F run through it; door north to Security Corridor (1F.o010); open west, to Security Corridor, no wall between; soft ceiling **SF-2F-11** (6 m², under 2F White Stairs).
- [ ] **Lobby** (`1F_LOBBY`): hatch **H3** in the floor, in the south-east, down to B Storage; soft wall **SW-1F-10** north, to Meeting Hall: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-11** north, to Meeting Hall: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-12** south, to Classroom: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-13** south, to Classroom: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-16** south, to Armory Stairs: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-14** west, to Classroom: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-15** west, to Classroom: 2 reinforcements (UNVERIFIED); door north to Split (1F.o001); door east to Armory Stairs (1F.o025); door east to Garage (1F.o016); door south to Classroom (1F.o013); door south to the outside (1F.o011); door west to Classroom (1F.o023); open east, to Armory Stairs, no wall between; open west, to Security Corridor (1F.o017); soft ceiling **SF-2F-02** (8 m², under 2F Middle); soft ceiling **SF-2F-03** (29 m², under 2F Master); soft ceiling **SF-2F-05** (7 m², under 2F Armory Corridor); soft ceiling **SF-2F-10** (10 m², under 2F Trophy); camera **CAM6** in the north, 2.7 m up (the research: 1F Lobby, north edge of the east-west hall); extinguisher **ING5** in the north-west.
- [ ] **Classroom** (`1F_CLASSROOM`): soft wall **SW-1F-12** north, to Lobby: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-13** north, to Lobby: 1 reinforcement (UNVERIFIED); soft wall **SW-1F-14** east, to Lobby: 2 reinforcements (UNVERIFIED); soft wall **SW-1F-15** east, to Lobby: 2 reinforcements (UNVERIFIED); door north to Lobby (1F.o013); door east to Lobby (1F.o023); window west to the outside (1F.o018; door or window UNVERIFIED); soft ceiling **SF-2F-02** (14 m², under 2F Gaming); soft ceiling **SF-2F-04** (9 m², under 2F Walk In).
- [ ] **Armory Stairs** (`1F_ARMORY_STAIRS`): stairs **S3** (Armory Stairs) down to B Laundry Stairs; stairs **S3** (Armory Stairs) up to 2F Armory Stairs; soft wall **SW-1F-16** north, to Lobby: 1 reinforcement (UNVERIFIED); door west to Lobby (1F.o025); open west, to Lobby, no wall between; soft ceiling **SF-2F-05** (3 m², under 2F Armory Corridor); gas pipe **ING8** in the south.
- [ ] **Garage** (`1F_GARAGE`): hatch **H6** in the ceiling, in the south-east, up to 2F Armory; soft wall **SW-1F-17** south, to the outside: 2 reinforcements (UNVERIFIED); door north to the outside (1F.o014; door or window UNVERIFIED); door south to the outside (1F.o012; door or window UNVERIFIED); door west to Lobby (1F.o016); window east to the outside (1F.o026; door or window UNVERIFIED); soft ceiling **SF-2F-06** (39 m², under 2F Armory); the workbench on the east wall (the render shows no car) (wood, 0.9 m, vaultable).

#### Second floor (2F)

- [ ] **Small Tower** (`2F_SMALL_TOWER`): stairs **S4** (Small Stairs) down to 1F Small Tower; door east to Office (2F.o020); south: the window r6calls draws onto the Dining Roof is built as wall (2F.o005; P36); soft floor **SF-2F-08** (25 m², over 1F Small Tower).
- [ ] **Office** (`2F_OFFICE`): door west to Small Tower (2F.o020); window north onto the Dining Roof (2F.o000; door or window UNVERIFIED); soft floor **SF-2F-07** (21 m², over 1F Dining Hall).
- [ ] **Kids' Dorms** (`2F_KIDS_DORMS`): hatch **H4** in the floor, in the west, down to 1F Kitchen; soft wall **SW-2F-02** east, to Low Attic: 2 reinforcements; soft wall **SW-2F-01** south, to Dorms Main Hall: 3 reinforcements; door south to Dorms Main Hall (2F.o001); window north to the outside (2F.o004; door or window UNVERIFIED); soft floor **SF-2F-01** (62 m², over 1F Kitchen); bomb **1B** in the east (site 1, 2F Kids' Dorms / Dorms Main Hall); defender spawn (site 1) (×2); the bed by the east wall (soft, 0.6 m, vaultable); the bed by the north wall (soft, 0.6 m, vaultable); the bed by the west wall (soft, 0.6 m, vaultable); the bed in the middle (soft, 0.6 m, vaultable).
- [ ] **Dorms Main Hall** (`2F_DORMS_MAIN_HALL`): soft wall **SW-2F-01** north, to Kids' Dorms: 3 reinforcements; soft wall **SW-2F-03** east, to Gaming: 1 reinforcement (UNVERIFIED); door north to Kids' Dorms (2F.o001); door south to White Stairs (2F.o002); window west onto the Dining Roof (2F.o021; door or window UNVERIFIED); open east, to Middle, no wall between; soft floor **SF-2F-02** (65 m², over 1F Security, 1F Security Corridor); bomb **1A** in the south (site 1, 2F Kids' Dorms / Dorms Main Hall); defender spawn (site 1) (×3); the bed by the east wall (soft, 0.6 m, vaultable); the bunk beds in the south part (metal, 1.6 m); the bunk beds on the west side (not vaultable, map_features §7) (metal, 1.6 m); the wardrobe in the north part (wood, 2 m).
- [ ] **Middle** (`2F_MIDDLE`): door north to Low Attic (2F.o007); door east to Trophy (2F.o017); open south, to Gaming (2F.o009); open west, to Dorms Main Hall, no wall between; soft floor **SF-2F-02** (15 m², over 1F Lobby, 1F Security Corridor).
- [ ] **Gaming** (`2F_GAME_ROOM`): soft wall **SW-2F-04** south, to Walk In: 2 reinforcements; soft wall **SW-2F-03** west, to Dorms Main Hall: 1 reinforcement (UNVERIFIED); open north, to Middle (2F.o009); south: the window r6calls draws to the outside is built as wall (2F.o003; P36); drone hole east, to Master (2F.dt1); soft floor **SF-2F-02** (28 m², over 1F Classroom, 1F Security Corridor); the green-topped game table by the west wall (wood, 0.8 m, vaultable); the plaid sofa on the rug (soft, 0.8 m, vaultable).
- [ ] **Walk In** (`2F_WALK_IN`): soft wall **SW-2F-04** north, to Gaming: 2 reinforcements; door east to Master (2F.o018); soft floor **SF-2F-04** (9 m², over 1F Classroom).
- [ ] **Master** (`2F_MASTER_BEDROOM`): soft wall **SW-2F-06** east, to Armory Corridor: 2 reinforcements (UNVERIFIED); door north to Trophy (2F.o010); door south onto the Balcony (2F.o011; door or window UNVERIFIED); door west to Walk In (2F.o018); drone hole west, to Gaming (2F.dt1); soft floor **SF-2F-03** (32 m², over 1F Lobby); the bed (soft, 0.6 m, vaultable).
- [ ] **Trophy** (`2F_TROPHY`): soft wall **SW-2F-05** north, to Low Attic: 2 reinforcements (UNVERIFIED); door east to Armory Corridor (2F.o015); door south to Master (2F.o010); door west to Middle (2F.o017); soft floor **SF-2F-10** (12 m², over 1F Lobby, 1F Split); extinguisher **ING6** in the north-east.
- [ ] **Low Attic** (`2F_LOW_ATTIC`): soft wall **SW-2F-05** south, to Trophy: 2 reinforcements (UNVERIFIED); soft wall **SW-2F-02** west, to Kids' Dorms: 2 reinforcements; door south to Middle (2F.o007); open north, to Attic, a 0.2 m step down, no wall between; extinguisher **ING7** in the south.
- [ ] **Attic** (`2F_ATTIC`): the floor lies 0.2 m below the rest of 2F; hatch **H5** in the floor, in the middle, down to 1F Meeting Hall; soft wall **SW-2F-08** north, to Tower: 2 reinforcements (UNVERIFIED); window west onto the Meeting Roof (2F.o016; door or window UNVERIFIED); open south, to Low Attic, a 0.2 m step up, no wall between; drone hole west, onto the Meeting Roof (2F.dt2); soft floor **SF-2F-09** (4 m², over 1F Stage); gas pipe **ING9** in the south-east.
- [ ] **Tower** (`2F_TOWER`): stairs **S1** (Tower Stairs) down to 1F Tower; ladder **L1** up to 3F Cat Walk; soft wall **SW-2F-08** south, to Attic: 2 reinforcements (UNVERIFIED); window north to the outside (2F.o006; door or window UNVERIFIED); window north to the outside (2F.o014; door or window UNVERIFIED); window south onto the Meeting Roof (2F.o012; door or window UNVERIFIED); window south onto the Meeting Roof (2F.o013; door or window UNVERIFIED); soft ceiling **SF-3F-01** (29 m², under 3F Cat Walk).
- [ ] **Armory Corridor** (`2F_ARMORY_CORRIDOR`): soft wall **SW-2F-07** east, to Armory: 2 reinforcements (UNVERIFIED); soft wall **SW-2F-06** west, to Master: 2 reinforcements (UNVERIFIED); door east to Armory (2F.o019); door west to Trophy (2F.o015); window north onto the Meeting Roof (2F.o008; door or window UNVERIFIED); open south, to Armory Stairs, no wall between; soft floor **SF-2F-05** (10 m², over 1F Lobby, 1F Armory Stairs); camera **CAM8** in the north, 2.5 m up (the research: 2F Armory Corridor, north end (south along it [PRE])).
- [ ] **Armory Stairs** (`2F_ARMORY_STAIRS`): stairs **S3** (Armory Stairs) down to 1F Armory Stairs; open north, to Armory Corridor, no wall between.
- [ ] **Armory** (`2F_ARMORY`): hatch **H6** in the floor, in the south-east, down to 1F Garage; soft wall **SW-2F-07** west, to Armory Corridor: 2 reinforcements (UNVERIFIED); door west to Armory Corridor (2F.o019); window east to the outside (2F.o022; door or window UNVERIFIED); soft floor **SF-2F-06** (37 m², over 1F Garage).
- [ ] **White Stairs** (`2F_WHITE_STAIRS`): stairs **S2** (White Stairs) down to 1F Security Corridor; door north to Dorms Main Hall (2F.o002); soft floor **SF-2F-11** (18 m², over 1F Security Corridor, 1F White Stairs).

#### The Cat Walk (3F)

- [ ] **Cat Walk** (`3F_CATWALK`): ladder **L1** down to 2F Tower; window north to the outside (3F.o000; door or window UNVERIFIED); window south to the outside, 3 m above the Meeting Roof (3F.o002; door or window UNVERIFIED); window west to the outside (3F.o003; door or window UNVERIFIED); gap in the rail south, over the well, open down to 2F Tower (3F.o001); soft floor **SF-3F-01** (29 m², over 2F Tower).

#### Outside and roofs

- [ ] **Attacker spawns:** A Junkyard (5, south-west of the building), B Street (5, south-east of the building), C Construction (5, north-east of the building), each spot facing the building.
- [ ] **Cameras outside:** **CAM1** south-west of the building, 2.7 m up (the research: EXT Junkyard / Bus, west of the Small Tower's south end); **CAM2** south-east of the building, 2.7 m up (the research: EXT Parking / Street, south-east of the Garage); **CAM3** north-east of the building, 2.7 m up (the research: EXT Construction, the north-east yard).
- [ ] **Stairs outside:** stairs **S5** (Bunker Stairs), east of the building: up from the basement's level outside to the ground; stairs **S6** (Tower outside stairs), north-east of the building: up from the ground to the Meeting Roof.
- [ ] **Roofs over 1F, eaves at 3.2 m:** Meeting Roof (`RF_MEETING_W`, gable 10°), Tower Roof (`RF_TOWER_WEST`, mono 10°), Meeting Roof (`RF_MEETING_E`, flat), Dining Roof (`RF_DINING`, flat), Balcony (`EXT_BALCONY`, flat), Garage Roof (`RF_GARAGE`, flat).
- [ ] **Roofs over 2F, eaves at 6.2 m:** Tower Roof (`RF_TOWER_LOW`, mono 25°), Dorms Roof (`RF_DORMS`, gable 25°), Armory Roof (`RF_ARMORY`, gable 25°), Attic Roof (`RF_ATTIC`, gable 25°), Master Roof (`RF_MASTER`, gable 25°), Kids Roof (`RF_KIDS`, flat), Armory Roof (`RF_ARMORY_N`, flat), Dorms Roof (`RF_DORMS_S`, flat), Master Roof (`RF_MASTER_S`, flat), Small Tower Roof (`RF_SMALL_TOWER`, gable 25°).
- [ ] **Roofs over 3F, eaves at 9.2 m:** Tower Roof (`RF_TOWER`, gable 25°).
- [ ] **Onto the roofs:** from 2F Tower, the window south (2F.o012) onto the Meeting Roof; from 2F Tower, the window south (2F.o013) onto the Meeting Roof; from 2F Office, the window north (2F.o000) onto the Dining Roof; from 2F Armory Corridor, the window north (2F.o008) onto the Meeting Roof; from 2F Master, the door south (2F.o011) onto the Balcony; from 2F Dorms Main Hall, the window west (2F.o021) onto the Dining Roof; from 2F Attic, the window west (2F.o016) onto the Meeting Roof; from 3F Cat Walk, the window south (3F.o002), 3 m above the Meeting Roof; stairs **S6** (Tower outside stairs) from the ground onto the Meeting Roof.
- [ ] **Fences, low walls and rails** (bodies vault them): 1 m: EXT_BALCONY.railE, EXT_BALCONY.railS, EXT_BALCONY.railW, EXT_FENCE_E, EXT_FENCE_JY, EXT_FENCE_N1–4, EXT_FENCE_S1–2, EXT_FENCE_W1–2, EXT_TYRES#0–3, EXT_WALL_S1–2; 0.8 m: EXT_GARDEN_S, EXT_GARDEN_W; 0.6 m: EXT_BED_NE#0–3.
- [ ] **Vehicles and wrecks** (cover props): 2.5 m: EXT_BUS, EXT_TRUCK_S, EXT_VAN_B, EXT_VAN_W; 2 m: EXT_GENERATOR; 1.5 m: EXT_CAR_S1–2, EXT_CAR_SE, EXT_WRECK_JY1–2, EXT_WRECK_W.
- [ ] **Other outside boxes** (14 of them vaultable: EXT_BED#0–7, EXT_BLOCKS, EXT_LUMBER#0–4): 8 m: EXT_SILO_N, EXT_SILO_S; 3.5 m: EXT_GREENHOUSE; 3 m: EXT_EXCAVATOR, EXT_HOUSE.wall#0–7, EXT_JY_TOWER, EXT_SHED_E1–2, EXT_SHED_N, EXT_SHED_NE, EXT_TANK_N, EXT_TRAILER_1–3; 2.5 m: EXT_TANK_GREEN; 2.2 m: EXT_BOOTH_E; 2 m: EXT_CONTAINER_SE; 1.5 m: EXT_EXCAVATOR.arm; 1.2 m: EXT_REEL; 1 m: EXT_BLOCKS; 0.8 m: EXT_LUMBER#1, EXT_LUMBER#3–4; 0.5 m: EXT_LUMBER#0, EXT_LUMBER#2; 0.4 m: EXT_BED#0–7; 0.3 m: EXT_HOUSE.floor.
- [ ] **In no room:** drone hole **1F.dt3** on 1F, into an enclosed space that is no room (beside White Stairs) on one side and to the outside on the other.

<!-- checklist end -->

## Mismatches

| # | Walk | Where (room; HUD position) | What the game has | Fix | Commit |
|---|---|---|---|---|---|
| 1 | 1 | 2F Attic, where its hall opens into the Low Attic | Walking south, the floor steps up about 20 cm into the Low Attic | The hall's floor (slab, hatch H5, soft floor SF-2F-09) 0.2 m under 2F's: layout.json `drops`, D-112 | M7 round 1 |
| 2 | 1 | Any soft or reinforceable wall | A hole made in it can be vaulted (mantled) through | Vaulting through a hole low and big enough, by the vault's own rules (D-112) | e06b386 |
| 3 | 1 | Phones and tablets | Tapping fast zoomed the page in, with no way back | Pinch and double-tap zoom blocked on every lab page (D-112) | e06b386 |

## Sign-off

Walk #1 (2026-10-28): "it looks good, actually really accurate", with the two issues above (and the phone zoom).
Rows 1–3 are fixed. Not signed off yet: the next walk confirms the Attic's step and the ten questions above (none
was answered one by one).
