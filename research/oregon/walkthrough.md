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
    pillar (in the Pillar room) and two walls at the Blue room's east end, by the passage out to the Bunker
    stairs (`python3 -I tools/mapgen/extract/bpcheck.py` measures it). Are they there?

## Checklist, room by room

What we built in each room, as the research lists it (the soft walls with their reinforcements, the doors and
windows, stairs, hatches, drone holes, soft floors, bombs, cameras, extinguishers and gas pipes, and the
furniture with its class and height). North is up in the plans; "to the outside" is an outside wall.

#### Basement (B)

- [ ] **Tower Stairs** (`B_TOWER_STAIRS`): stairs (Tower Stairs) up to 1F Tower.
- [ ] **Pillar** (`B_BOILER`): soft wall **SW-B-04** south, to Electric: 2 reinforcements; soft wall **SW-B-07** south, to Supply Room: 1 reinforcement; door south to Basement Corridor; door east to Electric; door east to Blue.
- [ ] **Electric** (`B_ELECTRIC`): soft wall **SW-B-04** north, to Pillar: 2 reinforcements; soft wall **SW-B-03** east, to Blue: 2 reinforcements; door south to Supply Room; door west to Pillar; hatch **H1** in the ceiling, from Meeting Hall.
- [ ] **Blue** (`B_BUNKER_ENTRANCE`): soft wall **SW-B-03** west, to Electric: 2 reinforcements; soft wall **SW-B-02** west, to Supply Room: 2 reinforcements; door west to Pillar; door east to the outside.
- [ ] **Supply Room** (`B_SUPPLY`): soft wall **SW-B-07** north, to Pillar: 1 reinforcement; soft wall **SW-B-06** south, to Laundry Room: 1 reinforcement; soft wall **SW-B-02** east, to Blue: 2 reinforcements; door north to Electric; door west to Basement Corridor; door east to Closet; the drone tunnel the research has along its south-east strip isn't built (where it comes out is layout_notes question 9); bomb **4B** (site 4, B Laundry / Supply); the table by the north wall (wood, 0.75 m).
- [ ] **Closet** (`B_SUPPLY_CLOSET`): soft wall **SW-B-05** south, to Laundry Room: 2 reinforcements; door east to Supply Room; drone hole to Basement Corridor.
- [ ] **Basement Corridor** (`B_CORRIDOR`): door north to Pillar; door south to Laundry Room; door west to Freezer Hall; door east to Supply Room; drone hole to Freezer Hall; drone hole to Closet; extinguisher ING1.
- [ ] **Freezer Hall** (`B_FREEZER_HALL`): door east to Basement Corridor; drone hole to Basement Corridor; extinguisher ING2.
- [ ] **Freezer** (`B_FREEZER`): soft wall **SW-B-01** east, to Laundry Room: 2 reinforcements; hatch **H2** in the ceiling, from Security; camera **CAM4** (the research: B Freezer, west part); the chest freezer on the south side (metal, 0.9 m); the chest freezer by the west end (metal, 0.9 m).
- [ ] **Freezer Stairs** (`B_FREEZER_STAIRS`): stairs (White Stairs) up to 1F White Stairs.
- [ ] **Laundry Room** (`B_LAUNDRY`): soft wall **SW-B-05** north, to Closet: 2 reinforcements; soft wall **SW-B-06** north, to Supply Room: 1 reinforcement; soft wall **SW-B-01** west, to Freezer: 2 reinforcements; door north to Basement Corridor; door south to Storage; bomb **4A** (site 4, B Laundry / Supply); the folding table (wood, 0.75 m); the washing machines in the east alcove (metal, 0.9 m).
- [ ] **Storage** (`B_LAUNDRY_STORAGE`): door north to Laundry Room; door east to Laundry Stairs; hatch **H3** in the ceiling, from Lobby.
- [ ] **Laundry Stairs** (`B_LAUNDRY_STAIRS`): stairs (Armory Stairs) up to 1F Armory Stairs; door west to Storage.

#### First floor (1F)

- [ ] **Small Tower** (`1F_SMALL_TOWER`): stairs (Small Stairs) up to 2F Small Tower; soft wall **SW-1F-01** east, to Dining Hall: 2 reinforcements; soft wall **SW-1F-02** east, to Showers: 2 reinforcements; door south to Shower Corridor; door south to the outside; door west to the outside; door east to Dining Hall; drone hole to the outside.
- [ ] **Dining Hall** (`1F_DINING`): soft wall **SW-1F-03** south, to Showers: 2 reinforcements; soft wall **SW-1F-01** west, to Small Tower: 2 reinforcements; soft wall **SW-1F-05** east, to Kitchen: 1 reinforcement; door south to Dining Hallway; door west to Small Tower; door east to Kitchen; bomb **2A** (site 2, 1F Kitchen / Dining Hall); the long seat east of the middle (soft, 0.8 m); the low cabinet beside it (wood, 0.9 m); the table on the rug by the north-west corner (wood, 0.75 m); the table in the south-west corner (wood, 0.75 m).
- [ ] **Showers** (`1F_SHOWERS`): soft wall **SW-1F-03** north, to Dining Hall: 2 reinforcements; soft wall **SW-1F-02** west, to Small Tower: 2 reinforcements; soft wall **SW-1F-04** east, to Dining Hallway: 2 reinforcements; door south to Shower Corridor.
- [ ] **Dining Hallway** (`1F_DINING_HALLWAY`): soft wall **SW-1F-04** west, to Showers: 2 reinforcements; door north to Dining Hall; door east to Security Corridor.
- [ ] **Shower Corridor** (`1F_SHOWER_CORRIDOR`): door north to Small Tower; door north to Showers; door south to the outside; drone hole to the outside; camera **CAM7** (the research: 1F Shower Corridor, south end).
- [ ] **Kitchen** (`1F_KITCHEN`): soft wall **SW-1F-06** south, to Security: 2 reinforcements; soft wall **SW-1F-07** south, to Security: 1 reinforcement; soft wall **SW-1F-05** west, to Dining Hall: 1 reinforcement; soft wall **SW-1F-08** east, to Meeting Hall: 2 reinforcements; door north to Kitchen Corridor; door west to Dining Hall; hatch **H4** in the ceiling, from Kids' Dorms; drone hole to Meeting Hall; drone hole to Lobby; bomb **2B** (site 2, 1F Kitchen / Dining Hall); bomb **3B** (site 3, 1F Meeting Hall / Kitchen); the counter in the east part (wood, 0.9 m); the counter along the north wall (wood, 0.9 m); the counter along the south wall (wood, 0.9 m); the island (wood, 0.9 m).
- [ ] **Kitchen Corridor** (`1F_KITCHEN_CORRIDOR`): door north to Tower; door south to Kitchen; door west to the outside; door east to Stage; drone hole to Meeting Hall; extinguisher ING4.
- [ ] **Tower** (`1F_TOWER`): stairs (Tower Stairs) down to B Tower Stairs; stairs (Tower Stairs) up to 2F Tower; soft wall **SW-1F-09** south, to Stage: 2 reinforcements; door north to the outside; door south to Kitchen Corridor; door east to the outside; camera **CAM5** (the research: 1F Rear Stage, east end (west along it [PRE])).
- [ ] **Tower Stairs** (`1F_TOWER_STAIRS`): the research lists nothing between it and its neighbours.
- [ ] **Meeting Hall** (`1F_MEETING_HALL`): soft wall **SW-1F-10** south, to Lobby: 1 reinforcement; soft wall **SW-1F-11** south, to Lobby: 1 reinforcement; soft wall **SW-1F-08** west, to Kitchen: 2 reinforcements; door west to Split; door east to Split; hatch **H1** in the floor, down to Electric; hatch **H5** in the ceiling, from Attic; drone hole to Kitchen Corridor; drone hole to Kitchen; bomb **3A** (site 3, 1F Meeting Hall / Kitchen); the benches in the middle (wood, 0.75 m); the low bookcase north of the middle (wood, 0.9 m); the long table on the east side (wood, 0.75 m); the long table on the west side (wood, 0.75 m).
- [ ] **Stage** (`1F_STAGE`): soft wall **SW-1F-09** north, to Tower: 2 reinforcements; door west to Kitchen Corridor.
- [ ] **Split** (`1F_SPLIT`): door south to Lobby; door west to Meeting Hall; door east to Meeting Hall.
- [ ] **Security** (`1F_SECURITY`): soft wall **SW-1F-06** north, to Kitchen: 2 reinforcements; soft wall **SW-1F-07** north, to Kitchen: 1 reinforcement; door south to Security Corridor; hatch **H2** in the floor, down to Freezer.
- [ ] **Security Corridor** (`1F_SECURITY_CORRIDOR`): stairs (White Stairs) up to 2F White Stairs; door north to Security; door south to White Stairs; door south to the outside; door west to Dining Hallway; open east to Lobby; extinguisher ING3.
- [ ] **White Stairs** (`1F_WHITE_STAIRS`): stairs (White Stairs) down to B Freezer Stairs; door north to Security Corridor; drone hole to the outside.
- [ ] **Lobby** (`1F_LOBBY`): soft wall **SW-1F-10** north, to Meeting Hall: 1 reinforcement; soft wall **SW-1F-11** north, to Meeting Hall: 1 reinforcement; soft wall **SW-1F-12** south, to Classroom: 1 reinforcement; soft wall **SW-1F-13** south, to Classroom: 1 reinforcement; soft wall **SW-1F-16** south, to Armory Stairs: 1 reinforcement; soft wall **SW-1F-14** west, to Classroom: 2 reinforcements; soft wall **SW-1F-15** west, to Classroom: 2 reinforcements; door north to Split; door south to Classroom; door south to the outside; door west to Classroom; door east to Armory Stairs; door east to Garage; open west to Security Corridor; hatch **H3** in the floor, down to Storage; drone hole to Kitchen; camera **CAM6** (the research: 1F Lobby, north edge of the east-west hall); extinguisher ING5.
- [ ] **Classroom** (`1F_CLASSROOM`): soft wall **SW-1F-12** north, to Lobby: 1 reinforcement; soft wall **SW-1F-13** north, to Lobby: 1 reinforcement; soft wall **SW-1F-14** east, to Lobby: 2 reinforcements; soft wall **SW-1F-15** east, to Lobby: 2 reinforcements; door north to Lobby; door east to Lobby; window west to the outside.
- [ ] **Armory Stairs** (`1F_ARMORY_STAIRS`): stairs (Armory Stairs) down to B Laundry Stairs; stairs (Armory Stairs) up to 2F Armory Stairs; soft wall **SW-1F-16** north, to Lobby: 1 reinforcement; door west to Lobby; gas pipe ING8.
- [ ] **Garage** (`1F_GARAGE`): soft wall **SW-1F-17** south, to the outside: 2 reinforcements; door north to the outside; door south to the outside; door west to Lobby; window east to the outside; hatch **H6** in the ceiling, from Armory; the workbench on the east wall (the render shows no car) (wood, 0.9 m).

#### Second floor (2F)

- [ ] **Small Tower** (`2F_SMALL_TOWER`): stairs (Small Stairs) down to 1F Small Tower; door east to Office; south: the window r6calls draws onto the roof is built as wall (P36, D-087); soft floor **SF-2F-08**: Small Tower (east strip).
- [ ] **Office** (`2F_OFFICE`): door west to Small Tower; window north onto the roof; soft floor **SF-2F-07**: Office (north ~60%).
- [ ] **Kids' Dorms** (`2F_KIDS_DORMS`): soft wall **SW-2F-01** south, to Dorms Main Hall: 3 reinforcements; soft wall **SW-2F-02** east, to Low Attic: 2 reinforcements; door south to Dorms Main Hall; window north to the outside; hatch **H4** in the floor, down to Kitchen; soft floor **SF-2F-01**: Kids' Dorms (whole); bomb **1B** (site 1, 2F Kids' Dorms / Dorms Main Hall); the bed by the east wall (soft, 0.6 m); the bed in the middle (soft, 0.6 m); the bed by the north wall (soft, 0.6 m); the bed by the west wall (soft, 0.6 m).
- [ ] **Dorms Main Hall** (`2F_DORMS_MAIN_HALL`): soft wall **SW-2F-01** north, to Kids' Dorms: 3 reinforcements; soft wall **SW-2F-03** east, to Gaming: 1 reinforcement; door north to Kids' Dorms; door south to White Stairs; window west onto the roof; soft floor **SF-2F-02**: Dorms Main Hall + south half of Middle + Gaming; bomb **1A** (site 1, 2F Kids' Dorms / Dorms Main Hall); the bed by the east wall (soft, 0.6 m); the bunk beds in the south part (metal, 1.6 m); the bunk beds on the west side (not vaultable, map_features §7) (metal, 1.6 m); the wardrobe in the north part (wood, 2.0 m).
- [ ] **Middle** (`2F_MIDDLE`): door north to Low Attic; door east to Trophy; open south to Gaming; soft floor **SF-2F-02**: Dorms Main Hall + south half of Middle + Gaming.
- [ ] **Gaming** (`2F_GAME_ROOM`): soft wall **SW-2F-04** south, to Walk In: 2 reinforcements; soft wall **SW-2F-03** west, to Dorms Main Hall: 1 reinforcement; open north to Middle; south: the window r6calls draws to the outside is built as wall (P36, D-087); drone hole to Master; soft floor **SF-2F-02**: Dorms Main Hall + south half of Middle + Gaming; the plaid sofa on the rug (soft, 0.8 m); the green-topped game table by the west wall (wood, 0.75 m).
- [ ] **Walk In** (`2F_WALK_IN`): soft wall **SW-2F-04** north, to Gaming: 2 reinforcements; door east to Master; soft floor **SF-2F-04**: Walk In.
- [ ] **Master** (`2F_MASTER_BEDROOM`): soft wall **SW-2F-06** east, to Armory Corridor: 2 reinforcements; door north to Trophy; door south to the outside; door west to Walk In; drone hole to Gaming; soft floor **SF-2F-03**: Master; the bed (soft, 0.6 m).
- [ ] **Trophy** (`2F_TROPHY`): soft wall **SW-2F-05** north, to Low Attic: 2 reinforcements; door south to Master; door west to Middle; door east to Armory Corridor; soft floor **SF-2F-10**: Trophy (south half); extinguisher ING6.
- [ ] **Low Attic** (`2F_LOW_ATTIC`): soft wall **SW-2F-05** south, to Trophy: 2 reinforcements; soft wall **SW-2F-02** west, to Kids' Dorms: 2 reinforcements; door south to Middle; extinguisher ING7.
- [ ] **Attic** (`2F_ATTIC`): soft wall **SW-2F-08** north, to Tower: 2 reinforcements; window west onto the roof; hatch **H5** in the floor, down to Meeting Hall; drone hole to the outside; soft floor **SF-2F-09**: Attic (north end); gas pipe ING9.
- [ ] **Tower** (`2F_TOWER`): stairs (Tower Stairs) down to 1F Tower; ladder **L1** up to the Cat Walk; soft wall **SW-2F-08** south, to Attic: 2 reinforcements; window north to the outside (×2); window south onto the roof (×2).
- [ ] **Armory Corridor** (`2F_ARMORY_CORRIDOR`): soft wall **SW-2F-06** west, to Master: 2 reinforcements; soft wall **SW-2F-07** east, to Armory: 2 reinforcements; door west to Trophy; door east to Armory; window north onto the roof; soft floor **SF-2F-05**: Armory Corridor (middle strip); camera **CAM8** (the research: 2F Armory Corridor, north end (south along it [PRE])).
- [ ] **Armory Stairs** (`2F_ARMORY_STAIRS`): stairs (Armory Stairs) down to 1F Armory Stairs.
- [ ] **Armory** (`2F_ARMORY`): soft wall **SW-2F-07** west, to Armory Corridor: 2 reinforcements; door west to Armory Corridor; window east to the outside; hatch **H6** in the floor, down to Garage; soft floor **SF-2F-06**: Armory (whole, minus hatch).
- [ ] **White Stairs** (`2F_WHITE_STAIRS`): stairs (White Stairs) down to 1F Security Corridor; door north to Dorms Main Hall; soft floor **SF-2F-11**: White Stairs landing.

#### The Cat Walk (3F)

- [ ] **Cat Walk** (`3F_CATWALK`): ladder **L1** down to the 2F Tower; window north to the outside; window south onto the roof; soft floor **SF-3F-01**: Cat Walk ring.

#### Outside and roofs

- [ ] **Attacker spawns:** A Junkyard (west), B Street (south), C Construction (north-east), five spots each,
      facing the building.
- [ ] **The outside items:** the school bus, the vans and cars, fences and low walls (all 1.0 m and vaultable),
      the construction house (a 3 m shell), the water tanks.
- [ ] **The Bunker stairs (S5):** from the ground east of the building down a sunken passage to the basement's
      east door.
- [ ] **The Tower's outside stairs (S6):** beside the 1F Tower's east door, up onto the Meeting roof.
- [ ] **The roofs:** flat: the Dining roof, the Meeting roof east of the Attic, the Balcony, the Garage strip, the
      Kids roof and the corners round the cross roof; sloped: the Tower and its two west parts, the brown cross
      roof, the Attic and the Small Tower.
- [ ] **Getting onto them:** the Office's north window and the Dorms' big window onto the Dining roof; the
      Master's door onto the Balcony.

## Mismatches

| # | Walk | Where (room; HUD position) | What the game has | Fix | Commit |
|---|---|---|---|---|---|
| | | | | | |

## Sign-off

Not yet: walk #1 is next.
