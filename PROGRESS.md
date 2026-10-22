# PROGRESS.md

Status per phase (PLAN.md §17). Newest phase on top. Each phase lists what's done, how to test it,
known issues, and what's next.

---

## Phase 5 — Oregon greybox · 🚧 in progress (M4 of 8 done)

**Done when (PLAN §17):** you walk it and sign off on layout accuracy. Rappel (M8) comes before the Phase 5
report (D-080). The design, with the review's amendments, is `tools/mapgen/DESIGN.md`.

| Milestone | Status |
|---|---|
| M1 Oregon 1F walkable, offline and online (generator, wall extraction, engine prep) | ✅ 1F built from the floor plans; batched drawing and a stats overlay (F8); browser test |
| M2 All storeys stacked: B, 2F, Cat Walk; rooms and callouts; ceilings, soft floors, hatches, drone holes; storey views | ✅ four storeys, 49 rooms, 12 soft floors, 6 hatches; hide-above, plan view, HUD line; browser test |
| M3 Stairs and the ladder (grab it from the top too) | ✅ every staircase inside the building, the ladder both ways, the walk graph: every room reachable; browser test |
| M4 Roofs, the outside and the three attacker spawns; free camera | ✅ roofs on every part of the building, the outside blockout with the Bunker and Tower outside stairs, five attackers at each insertion point, a free camera in every lab; browser test |
| M5 Sites, defender spawns, cameras, ingredients, zones, cover props | ⏳ |
| M6 Walk-ready: every check, performance on Oregon, your walk #1 | ⏳ |
| M7 Your corrections, round by round, to sign-off | ⏳ |
| M8 Rappel | ⏳ |

### What's done (M4)
- **Roofs on the whole building (D-097):** 17 roofs with the research's names. Pitched where the roof renders
  show a ridge (the Tower, the Tower's two west parts, the brown cross roof over Dorms, Armory, Attic and Master,
  the Small Tower, the Meeting roof west of the Attic), flat where they don't (the Dining roof, the Kids roof, the
  Meeting roof east of the Attic, the Balcony, the Garage strip, the corners round the cross). Every flat roof and
  slope is walkable; the gable ends are closed. The 2F rooms have a ceiling at 6.0 m, the Meeting Hall and
  Kitchen Corridor look up into their roof. Onto the roofs: the Office's north window and the Dorms' big window
  onto the Dining roof, the Master's door onto the Balcony, the Armory Corridor's and 2F Tower's windows onto the
  Meeting roof. The build now fails if a room has nothing over it or a roof stands on nothing.
- **Free camera (D-098):** press N in any lab and fly (WASD along the view, Space up, C down, Shift faster)
  while your body stays put; N goes back to it, F puts it on the floor under the camera. Also in the pause
  menu's Lab tools.
- **The outside (D-099):** 79 items read off the r6calls background: the greenhouse, sheds, silos and tanks,
  the garden, the Junkyard's trailers and tyre walls, the bus, vans and cars, fences and low walls (1.0 m, you
  vault them), and the construction site (the house's shell, the excavator, the generator, lumber). The
  **Bunker stairs** go down from the ground east of the building, in a sunken passage, to the Bunker
  Entrance's east door. The **Tower's outside stairs** go up from beside the 1F Tower's east door to the
  Meeting roof east of the Attic. The **Balcony** has its railing.
- **Attacker spawns (D-100):** five at each insertion point (Junkyard, Street, Construction), facing the
  building. Go to takes you to each.
- **Checks:** every room has something over it, every eave rests on a wall, no roof covers a window's sill;
  the three spawn groups, the Bunker passage and the Meeting roof are one walkable piece of outside; a body
  walking at the play area's edge stops there; the browser test visits each spawn and drops you on the
  Dining roof from the free camera.
- **Review (D-101):** two reviewers read the M4 changes; eight findings held up, and all are fixed, each with a
  test. The ones you'd notice: F, leaving the free camera, also pressed "use" for your body (it grabbed the
  ladder if one was in reach); a weapon key pressed while flying switched weapons when you came back; F with the
  camera inside a wall put you in the wall (now the camera stays, with a message); a cable reel stood half inside
  the Meeting Hall (it's 6 m further east on the background); and a slot from the Kitchen Corridor ran into the
  Tower's west roof space. The build now fails if anything outside stands in a room.

### What's done since M3: your stairs walk (D-095)
- **The White Stairs** now go up east, both flights, one over the other, and each fills the stairwell wall to
  wall. From the basement you arrive on the 1F landing by the Security Corridor door. The flight to 2F starts in
  the Security Corridor's south-west corner, so from that landing you go round through the corridor, and it
  arrives by the 2F door.
- **The Armory Stairs** now go up north, both flights, wall to wall. From the basement's south landing (by its
  door) you arrive on the 1F north landing (by the Lobby door). The flight to 2F starts at the 1F south end,
  open to the Lobby, and arrives at the south end of the Armory Corridor. The 2F "Armory Stairs" callout now
  covers the top of the stairs.
- **The Small Stairs** (after your second look, D-096) go the first way round again, now wall to wall: up north
  through the passage beside the Small Tower's corner, a landing in the corner, then east along its north wall
  onto the 2F walkway to the Office, 2.1 m wide. The two 2F walls of that corner now stand on the 1F walls under
  them (the 2F image draws them on the same spot).
- **The Tower Stairs** keep their width: the 2F image has floor beside them, where the Cat Walk ladder stands.
  Their landing now meets the north walls.
- **The basement's frame:** to stack full-width flights, the basement's stairwells have to sit under the 1F
  ones, and the basement image does that only when drawn 2.4% larger, as 2F is. That frame also puts hatches H2
  and H3 well inside their rooms. H1 then sat over a wall, so it moved 1.07 m east inside the Meeting Hall.
- **Checks:** every run walks up and down; every flight can be climbed hugging its open sides; the walk graph
  still reaches all 49 rooms; the browser test walks the Armory Stairs up north now.

### What's done (M3)
- **Stairs (D-091):** all seven runs of the four staircases inside the building. The Tower Stairs (S1), the
  White Stairs (S2) and the Armory Stairs (S3) go from the basement to 2F; the Small Stairs (S4) go from 1F to
  2F.
  - Each run is built from its stairwell: straight, a switchback with a landing, or an L (the Small Stairs).
  - The flights are open underneath, so one can stand over another: the Armory Stairs are two flights, one
    over the other, as you described.
  - The floor above opens where your head would meet it, with a rail round the hole wherever there's no wall.
  - Every step is 0.2 m high (16 to a storey).
- **The ladder (D-092):** from the 2F Tower up to the Cat Walk. You can now get on it from the top too: stand at
  the gap in the well's rail, face the drop and press F; S climbs down, W back up.
- **The walk graph (D-093):** a map of everywhere a body can stand and walk, read from the game's own
  collision. From the Junkyard spawn, with every barricade broken and nothing breached, it reaches all 49
  rooms on every storey.
  - It found the 2F Office shut off: my first guess at the Small Stairs put their stairwell across the only
    walkway to the Office door.
  - They're now an L that arrives on that walkway.
- **Plans:** the stairs are on the plans in red, darker as they climb, with an arrow pointing up. Landings and
  the ladder are drawn too, and the comparison page has a stairs layer.
- **The Oregon page:** the help explains the stairs and the ladder.
- **Checks:**
  - A body walks up and down every run, between the rooms the research names.
  - A body climbs the ladder and comes back down from the top.
  - The browser test walks the Armory Stairs from the basement to 1F and back, and takes the ladder both ways.
- **Review (D-094):** two reviewers read the M3 changes. Seven findings held up, and all are fixed, each with a
  test. The ones you'd notice:
  - Walking up a staircase hugging an open side, you stopped dead a third of the way up, your head against
    the floor above. Those sides now have a handrail, with an invisible guard up to the floor above.
  - Holding Space at the top of the ladder grabbed it, so climbing with Space held could loop at the top.
    Now only F grabs it from the top, on your feet, and never through a wall.

### What's done (M2)
- **Every storey stacked:** B, 1F, 2F and the Cat Walk (3F), each from its own wall file and placed through its
  frame (P2: B as drawn, 3F scaled onto the tower's walls). Floors at −3.2, 0, 3.2 and 6.2 m. The basement is
  underground, so its walls stop under the 1F slab. All 32 soft walls are in (7 on B, 17 on 1F, 8 on 2F), with
  every storey's doors, windows and drone holes.
- **Rooms and callouts (D-085):** the 49 rooms of the research, each with its callout. The generator floods each
  storey's plan (5 cm cells) from the compiled walls; 11 splits divide spaces the plans draw as one (a hall and
  its stairs). Each room becomes floor rectangles (what the HUD looks up) and an anchor 0.45 m clear of the
  walls (Go to and its label). The checks fail on two rooms in one space, a seed on a wall, or an anchor where a
  body doesn't fit, and report any enclosed space bigger than 2 m² that has no room.
- **Floors and ceilings (D-086):** each storey's floor covers its footprint and is the ceiling of the one below;
  the ground is the play area, less the hatches.
  - 12 soft floors (SF-2F-01 to 11 on 2F, SF-3F-01 on the Cat Walk) cover the rooms the research names, to
    their walls. They're cut into tiles of at most 4 m in 0.4 m joist spacings, and a bullet that crosses a
    seam goes into one surface, not two (D-088).
  - 6 hatches (H1–H6): r6calls' squares, clipped to the room above, breakable and reinforceable from the top.
  - The Cat Walk's centre is an open well over the 2F tower, inside a 1.0 m rail you can vault.
- **Where the sources disagree (D-087):** we follow Ubisoft's blueprint. SF-2F-10 and SF-2F-11 are soft, and five
  soft floors use Ubisoft's bigger extents. The Game Room's south window and the 2F Small Tower's south opening,
  which only r6calls 2026 draws, are built as wall. Each choice is one field in `layout.json`.
- **The Oregon page:**
  - H hides the storeys above yours. M opens the plan view: your storey from above, north up, centred on you;
    the wheel zooms and you can keep walking. P switches between the surface colours and one light grey.
  - Room callouts float over your storey. The line at the bottom left gives the room, the storey and your
    position in the plan's units (u), in the world frame and in your storey's own drawing.
  - Go to lists every room by storey.
  - Each storey has its own light, darker below ground.
- **Plans and tools:**
  - `research/oregon/compare/{B,1F,2F,3F}.svg` draw every storey with its floors (soft yellow, hatches
    green), rails and callouts.
  - `npm run mapgen -- --where x,y,floor` gives a position in every floor's frame and the room there.
  - `npm run mapgen` builds B both ways (as drawn, and 2.4% larger) and prints where each basement hatch lands.
- **Checks:**
  - Leak and shell checks run on every storey. Research tests cover the rooms, soft floors and hatches.
  - A bullet goes up through each soft floor, and a body dropped through each hatch lands in the room the
    research names.
  - The browser test shoots up through the Kids' Dorms floor from the 1F Kitchen, then knifes H4 open from
    above and lands in the Kitchen.
- **Review (D-089):** two reviewers read the M2 changes; nine findings held up and all are fixed, each with a
  test. The ones you'd notice: six rooms had strips of floor in no room (the HUD said "outside" in the Lobby),
  bullet marks and other players floated in view when their storey was hidden, and the gun in hand stayed
  daylight-bright in the basement.
- **Smaller fixes:** the Destruction Lab's walls no longer name their sections twice; Go to uses the rooms'
  anchors instead of hand-picked centres.
- **After your walk (D-090):** the few-pixel gap you saw at some soft floors' sides was a strip of hard ceiling,
  5–15 cm wide and up to 6.9 m long, where a 2F wall overhangs the 1F wall under it. Soft floors now run on to
  the walls of the room below; the longest hard strip left is 0.4 m, at a corner.

### What's done (M1)
- **Walls from the floor plans (D-071):** `tools/mapgen/extract` reads r6calls' Oregon map (the floor images and
  their soft-wall, hatch and drone-hole overlays) and checks it against Ubisoft's official blueprint. It finds
  every wall, door, window, soft wall and drone hole on B, 1F, 2F and the Cat Walk (285 wall pieces, 69
  openings, all 32 soft walls), and writes only numbers to `data/maps/oregon/extracted.json`. Those became one
  file per floor (`walls_<floor>.json`): wall lines with their soft sections, doors, windows, passages and drone
  holes, each tied to the research row it answers to. The 2F image is drawn 2.4% larger than 1F, so each floor
  has its own frame (D-072).
- **The generator (D-070):** `npm run mapgen` compiles `data/maps/oregon/layout.json` and its parts into
  `level.json`, the level the game loads: hard walls, the 17 soft walls of 1F as reinforceable panels with
  their research section counts, door and window frames (exterior ones barricaded, inside doorways empty, glass
  on windows; D-074), drone-hole slots, the ground, the play area's edge and the spawns. Hard geometry never
  overlaps a soft wall (D-075). Only 1F is compiled so far.
- **Checks:** level.json must equal what the layout compiles to; the compiled walls must close every room the
  plan draws (no slot between rooms or to the outside); the wall files must still match the extraction, and
  every extracted item is used or listed as dropped with a reason; every 1F soft wall, door, exterior opening
  and passage in the research must be there with the research's type and its door-or-window guess.
- **Engine:** a faster physics refresh (D-073: room step p99 7.6 → 3.8 ms on an Oregon-sized level, movement
  identical), map data in the level format (spawn sides, invisible blockers, bounds, storeys, rooms, sites,
  cameras, zones; D-076), and a kill plane: fall out of the map and you're back at the start.
- **The Oregon page**, offline and online, with Go to for the main rooms and the three attacker spawns; the
  destruction tools work there as in the Destruction Lab.
- **Our 1F plan** is in `research/oregon/compare/1F.svg` (open it in a browser). The overlay page puts it over
  the official blueprint and the r6calls image on your PC (the images stay out of the repo, D-079).
- **Review fixes:** a review of M1 found 11 problems, and a second check of the fixes found that some had gone
  wrong or fell short. All are fixed now:
  - Walls: the Big Tower's east wall is no longer merged into the facade, and its corner block sits flush.
    Corners are settled in pairs: a door or soft wall at a corner gets a post, and a wall ending on a soft wall
    meets its face. Wall heights change where a wall goes from outside to inside, so the facade stays at full
    height at every corner.
  - Checks: tests now catch gaps between rooms, 5 cm slots, and a building shell that isn't closed at the top
    of the outer walls. They also catch a deleted soft wall on any floor.
  - The image check reads what git stages, including large-file storage. It catches archives, image bytes and
    base64 images anywhere, plan SVGs that link a picture, and odd file names.
  - Kill credit survives the kill plane: a body brought back keeps nobody's old credit, a bleed-out on that
    very step still credits whoever downed it, and a shot can't land on the new life.
  - The physics guard test now runs Rapier's own step and checks every collider.
  - Shadows come back after the graphics card resets.
  - The stats overlay shows the page's work a frame: its own code plus the messages it handled.
- **Drawing a whole map (D-077):** level boxes are drawn in batches (one instanced mesh per material and
  storey), the floors carry a 1 m grid to judge distances by, soft walls show their section seams and a
  "N sections" label, and shadows are redrawn only when a wall changes (players and guns cast none now). A
  stats overlay in every lab (F8, or `?stats` in the address) shows FPS, frame time, the 1% low, the work
  time a frame and draw calls against the target: 120 FPS on average and 90 at the 1% lows, at 1080p on High.

### How to test (needs Node 22.12+)
1. `npm ci`, then `npm run dev` and, in a second terminal, `npm run build -w @redmond/server && npm start`.
2. Open http://localhost:5173/labs/oregon.html (offline) or `?online` (a room on your local server; send the
   invite link to play together). You start outside the Main Entrance.
3. Go to (Esc, then a room) takes you to any room on B, 1F, 2F or the Cat Walk. Its callout floats over the
   floor, and the line at the bottom left names the room you're in. Walk each storey against the blueprint and
   note anything out of place with that line (it gives your position in the plan's units).
4. Stairs: walk from the basement up to 2F on each staircase. Go to puts you at the foot of each one.
   - The Tower Stairs: B → Tower Stairs.
   - The White Stairs: B → Freezer Stairs; the flight on to 2F starts in the 1F Security Corridor's south-west
     corner.
   - The Armory Stairs: B → Laundry Stairs; the flight on to 2F starts at the 1F south end, by the Lobby.
   - The Small Stairs go from 1F to 2F: 1F → Small Tower, then north up the passage on the west side.
   - The Bunker stairs go from the ground east of the building down a sunken passage to the basement's east
     door; the Tower's outside stairs, beside the 1F Tower's east door, go up onto the Meeting roof.
5. The ladder: Go to 2F → Tower. The ladder stands under the north edge of the Cat Walk's well. Face it, press F,
   then hold W up to the Cat Walk. To come down, stand at the gap in the rail at the top, face the drop, press F,
   then hold S.
6. Press H to hide the storeys above you, M for the plan view (the wheel zooms; M again to go back), and P to
   switch to plain grey.
7. The outside: Go to → Attacker spawn A Junkyard, B Street or C Construction puts you at that insertion point,
   facing the building (four more spawns stand beside it); walk to the building from each.
8. The roofs: Go to 2F → Office and vault out of its north window onto the Dining roof, or 2F → Master and
   step out of its south door onto the Balcony. Press N for the free camera and fly over every roof (WASD along
   the view, Space up, C down, Shift faster); F puts you on the floor under the camera, N takes you back.
9. Soft floors: Go to 1F Kitchen, look straight up and fire. The yellow floor above (the Kids' Dorms, SF-2F-01)
   takes holes; every soft floor works the same way from the room below.
10. Hatches: Go to 2F Kids' Dorms and stand on the green square (H4). Crouch (C), look down and knife it (V)
   until it breaks, and you drop into the 1F Kitchen. H1–H3 go from 1F to the basement, H5 and H6 from 2F to 1F.
11. Press F8 and read the overlay on your PC: average FPS and the 1% low (target 120 and 90 at 1080p High).
   The browser draws no faster than your display refreshes, and a missed refresh counts as a whole extra one,
   so read the FPS on a display faster than 120 Hz (144 Hz or more). At 120 Hz or less, read the work instead:
   the page's own work each frame on the main thread, 8.3 ms on average and 11.1 ms for the slowest 1% leaving
   room for 120 and 90 FPS. It doesn't include the graphics card's time.
12. The plans: open `research/oregon/compare/B.svg`, `1F.svg`, `2F.svg` and `3F.svg`. To see them over the
   official blueprint: `npm run mapgen:refs` (downloads the blueprint and r6calls' map into a gitignored
   folder), then `npm run mapgen:compare`, and open `builds/mapgen/compare/index.html`.
13. Checks: `npm run typecheck`, `npm test`, `npm run build && npm run test:e2e` (`oregon.mjs` shoots through a
   soft floor, drops through a hatch, walks the Armory Stairs, takes the ladder both ways, stands at each attacker
   spawn and drops onto the Dining roof from the free camera),
   `npm run mapgen -- --check`.

### Known issues
- The stairs follow your walk now (open question 20).
- On 2F, the floor inside the Small Tower's L-shaped wall is cut off by the Small Stairs' opening, and Go to's
  spot for the 2F Small Tower is on it. Both images show that spot open to the workshop below (open question 22).
- In the basement, the White Stairs stand 0.15–0.3 m off their stairwell's walls, and the Tower Stairs 0.95 m off
  the east one (open question 23b). On 2F, the floor over the Armory Stairs' foot is cut off by the hole (23a).
- Ubisoft's 2F blueprint seems to show the 1F workshop through the floor inside the 2F Small Tower's L-shaped
  wall. We build a floor and a full wall there (open question 22).
- Every roof's shape and pitch is our reading of the roof renders (open question 24), and every outside item is
  read off the background, ±0.75 m (open question 25): where the Tower's outside stairs lead is a guess.
- The basement's frame is still an assumption (P2, open question 10), now the 2.4% perspective step; hatch H1
  moved 1.07 m east to land inside B Electric under it (open question 15).
- Behind the 1F White Stairs, a sealed 3.6 m² strip has no room (open question 19b).
- Room callouts show for your storey only.
- Every size is a placeholder until you've walked it: 1 u of the plans = 0.15 m, walls 3 m, doors 2.1 m
  (research/OPEN_QUESTIONS.md, "Placeholders added while building Phase 5").
- You no longer see your own shadow (shadows are drawn once for the level, D-077).

### Next: Phase 5 M5 — sites, defender spawns, cameras, ingredients, zones, props
The four bomb sites (rooms, bomb markers, plant zones) with Go to by site; the defender spawns; the default
cameras with their facing (8 on r6calls' map) and the ingredients (7 extinguishers and 2 gas pipes there); the
zones (the building, out of bounds, spawn-peek spots, drone holes); the rappel faces with a debug view; and the
major cover props. Each marker is drawn in the lab (DESIGN E9).

---

## Phase 4 — Destruction v1 · ✅ complete (PR #5)

**Done when (PLAN §17):** wallbangs, punch holes and reinforcing are all synced across clients.

Built in milestones; each keeps the tests, the browser tests and the netsim green, and the game playable.

| Milestone | Status |
|---|---|
| M1 Destruction data (constructions, bullet tiers, tools, reinforcement, barricades, hatches) | ✅ data/destruction.json, validated; 8 new open questions |
| M2 Panel model: a cell grid per surface (skins, studs, steel), holes, falling pieces | ✅ pure model + 13 tests (D-062) |
| M3 Panels in the simulation (movement through holes) and on screen | ✅ intact panels collide exactly as before; breaches let bodies through; rays see holes; drawn from cells (D-064) |
| M4 Bullets and the knife through panels (wallbangs, holes, rewound holes) | ✅ on the server: wallbangs at 70 %, holes, studs, steel, two-wall limit, knife holes, panels as the shooter had them (D-065) |
| M5 Destruction over the network, and for players who join late | ✅ ops to everyone with each snapshot, with a hash check; full state on joining; netsim and browser test agree (D-066) |
| M6 Reinforcement, barricades and hatches | ✅ hold F to reinforce (4.5 s, team pool, from your side, hatches from above), barricade (2 s) or pry one off (1 s); Destruction Lab level (D-067) |
| M7 Destruction Lab (explosive tools, every surface, Oregon wall samples) | ✅ page offline and online; T/G explosives (shapes only), Reset walls; five Oregon walls; browser test (D-068) |
| M8 Browser and netsim tests, review, docs | ✅ six browser tests, the netsim's fight across walls, a three-reviewer pass and its fixes |

### What's done
- **Destruction data (M1):** `data/destruction.json` holds the rules. Every destructible surface is a panel
  built from a *construction*: two skins and a core (wooden studs in walls, metal joists in floors, beams in
  hatches) on a grid of 5 cm cells, plus door and window barricades and glass. Bullets follow each weapon's
  destruction tier (from its weapon file, or its class where the file has none; the XK23's "medium" is the
  official one): hole size, whether it cuts studs (buckshot only within 5 m), and how much it wears down a
  hatch or barricade (a DMR opens a hatch in 9 shots, a slug in 3, two buckshot blasts; a barricade takes 3
  knife hits or about 20 rifle bullets). Wallbangs lose 30 % per wall, through at most 2. The knife punches a
  25 cm hole. The Destruction Lab's explosives (Breach Charge, Impact and Frag Grenades, Nitro Cell, Exothermic
  and Hard Breach Charges) cut their shapes; only the last two cut steel. Reinforcing takes 4.5 s from a team
  pool of 10 (lab rooms let both sides reinforce and barricade); a reinforced hatch has a 1,000,000 HP pool.
  Everything not verified is listed in research/OPEN_QUESTIONS.md ("Placeholders added while building Phase
  4", 8 questions). The movement lab's floor hatch sample is now thick enough to be a real panel, and sits on the floor (it was sunk into it, out of reach of bullets, the knife and reinforcing).
- **The panel model (M2, D-062):** each destructible surface is a grid of 5 cm cells in layers (two skins, a core
  of studs, joists or beams, and steel once reinforced). A bullet removes the cells within its hole's radius
  (always the one it hit), the knife a 25 cm disc, a breach a rectangle; whatever nothing holds then falls (a
  piece of skin cut free of the frame and the studs, a stud cut at both ends, a reinforcement cut along a full
  line at the top and the bottom). Hatches, barricades and glass break whole once worn down; a reinforced
  hatch takes only hard damage. Bodies collide with 10 cm cells, so bullet holes never open a gap, only a real
  breach does; floors never open. A panel's state is run-length coded (about 1–2 KB for a wall shot to pieces)
  and hashed, for players who join later and to check clients agree.
- **Panels in the game (M3, D-064):** the labs' destructible surfaces are now panels. Bodies collide with a
  panel's solid 10 cm cells (an intact wall is exactly the box it was), so an opening a body fits through lets
  it walk through; a soft floor never opens; a broken hatch drops whoever stands on it. Bullets, the knife's
  reach, laser dots and bullet marks see every hole. Panels are drawn from their cells (skins in the surface's
  colour, wooden or metal studs, steel plates on the side they went up from) and redrawn when they change.
  Nothing in the game damages them yet: bullets and the knife start making holes in M4.
- **Wallbangs and holes (M4, D-065):** on the server, a bullet now goes through what it can break, making a hole
  in every layer it passes, and stops at steel, metal supports and studs its gun can't cut (buckshot cuts them
  within 5 m). A body behind a wall takes 70 % per wall; a bullet goes through at most two walls. Hatches,
  barricades and glass wear down per bullet (a DMR opens a hatch in 9 shots spread over it; ten knife hits
  do it too). The knife punches a 25 cm hole through both skins of a wall. Shots are judged against the walls
  as the shooter's screen had them. Players see the holes from M5 (until then only the server has them).
- **Holes for everyone (M5, D-066):** new holes go to every player with each snapshot (a few bytes each) with
  a checksum of all the walls; a player whose walls ever disagree gets them again, and one who joins mid-game
  gets them all at once. Broken pieces throw a few chunks of debris. Tested in the netsim (ten bots fighting
  across the sample walls: 401 changes in 30 s, every client ends with the server's walls, 27–32 kbps each)
  and in a browser test (`tools/e2e/online-walls.mjs`: a wallbang hit at +100 ms, a sprayed wall and a
  knifed hole, a watcher and a late joiner with exactly the server's walls).
- **Reinforcing, barricades and hatches (M6, D-067):** hold F at a wall section for 4.5 s to put steel up on
  your side (one of the team's 10 reinforcements; a hatch only from above); hold F for 2 s to barricade an
  empty door or window, or 1 s to pry a barricade off. You stand still meanwhile, and the bar shows the time
  left. Defenders only, except in lab rooms. Three knife hits break a barricade; a broken hatch drops whoever
  stands on it. The new Destruction Lab level has every kind of wall, door, window, hatch and floor (its
  page comes in M7).
- **The Destruction Lab (M7, D-068):** `/labs/destruction_lab.html` (offline, or `?online` to share a room):
  soft walls with wooden studs, without and with metal studs; reinforceable walls of two and three sections
  and one already reinforced; a barricaded door, an empty door and a window; a platform with a hatch and a
  soft floor; and five of Oregon's soft walls at their researched sizes. T picks an explosive and G sets it
  off where you look (Breach Charge, Impact and Frag Grenades, Nitro Cell, Exothermic and Hard Breach
  Charges: only their cuts for now). Reset walls in the pause menu puts everything back. A browser test
  (`tools/e2e/destruction-lab.mjs`) checks the reinforce prompt and gauge, steel on your side, a Breach
  Charge, Reset walls, and two players online with identical steel and knife holes.
- **Checks and review fixes (M8):** shot-up walls redraw in about 0.6 ms (a 4.5 × 3 m wall with 300 shots'
  holes). A review found, and these are now fixed: you could shoot, aim and knife while reinforcing (your
  hands are busy now, as when reviving); a hole made between two snapshots counted as not there for your
  next shot even though you saw it (holes now travel with the snapshot that covers them); a shot along a
  wall from its end went through 3 m of it untouched, and two walls overlapping at a corner counted as four;
  free-standing walls looked hollow from their ends and top (they are drawn closed now); marks on steel hid
  inside the plate; the Movement Lab hatch was sunk into the floor; a barricade took 21 rifle bullets
  instead of 20; four data values (reinforcing a damaged wall, reinforcing again, standing still while
  reinforcing, when a worn barricade lets bodies through) were read by nothing; and a malformed explosive
  name from a client could drop every player in a lab room.

### How to test (needs Node 22.12+)
```
npm install
npm run build
npm start
```
1. **Offline:** open http://localhost:8080 → **Destruction Lab**. Shoot the soft walls: each bullet leaves a
   hole in every layer it passes; wooden studs stop most guns (a shotgun cuts them up close), metal studs
   stop everything, and a body behind a wall takes 70 %. Hold **F** at a reinforceable wall section for
   4.5 s, then shoot it from the other side. Knife the barricaded door three times; hold **F** at the empty
   door to barricade it (2 s), or at a standing one to pry it off (1 s). **T** picks an explosive and **G**
   sets it off. `Esc` → *Go to* → *Platform* to reinforce the hatch from above, or *Under the platform* to
   shoot it from below; `Esc` → *Reset walls* puts everything back.
2. **Online at 100 ms:** **Destruction Lab online** → *Create a room*; `Esc` → *Copy invite link* and open it
   in a second window (or on a second PC). In both pause menus set **Simulated extra latency → +100 ms
   round trip**. Shoot, knife and reinforce in one window and watch the other; open the link in a third
   window later: it gets the walls as they are.
3. **Range Lab:** the *Behind the wall* dummy can now be shot through the soft wall.

The automated checks: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (all six browser
tests), and `npm run netsim -- --combat --walls`.

Things to judge, at +100 ms:
- Wallbangs: do they hit where your screen says, and do the holes appear where you shot?
- Reinforcing and barricading: the prompt, the bar, steel on your side; does the other window see it too?
- Do the walls look right (holes, studs, steel, debris, broken barricades and hatches)?

### Known issues
- Every number beyond the researched ones is a placeholder, listed in research/OPEN_QUESTIONS.md (Phase 4
  placeholders, 8 questions), the stud layout among them.
- Holes another player makes appear about 0.1 s before you see their shot (the server sends a hole at once;
  the shooter is drawn a little in the past, D-032).
- Only the destructible surfaces break: everything else (hard walls, the floor) stops bullets.
- No reinforcement animation or sound yet: the bar and the steel only.
- The lab's explosives cut their shapes only: no throwing, fuses or damage to players until the gadgets
  (Phase 8).
- A bullet that runs along a wall from its end makes one hole where it goes in and carries on through that
  skin, at 70 %; a shot into a wall's end goes into the gap between the skins up to the first stud.
- An 8-pellet shotgun blast takes about 2.7 ms to apply (on the server and on every client): fine for now,
  to watch in full rooms.

### Next: Phase 5 — Oregon greybox
Oregon's layout.json, the generator and the full greybox with correct surface tagging, sites, spawns and
cameras. **Done when:** you walk it and sign off on the layout's accuracy.

---

## Phase 3 — Gunplay · ✅ complete (merged, PR #4; Ulo tested it at +100 ms on 2026-10-08: headshots land)

**Done when (PLAN §17):** headshots and hit registration feel right at 100 ms.

Built in milestones; each one keeps the tests, both e2e scripts and the netsim green, and the game playable.

| Milestone | Status |
|---|---|
| M1 Weapon, gunplay, combat and lab-rules data | ✅ 40 weapon files + rule files, validated, CSV-agreement tests |
| M0 Hit-registration measurement harness | ✅ server agrees with every shot as drawn (netsim); rewind cap 250 ms (D-045, your call) |
| M2 Damage maths and loadout resolution | ✅ pure functions + tests (the simulation uses them from M3, the server's damage from M6) |
| M3 Weapon state in the simulation (fire, ammo, reload, swap, modes) | ✅ predicted exactly online; ammo HUD; Fire/R/1/2/wheel/B |
| M4 Loadout pick online, data hash check | ✅ pause-menu loadouts (offline and online), stale tabs told to refresh |
| M5 ADS, recoil, spread | ✅ recoil predicted exactly online; server-only spread; zoom and spread crosshair |
| M6 Hit registration, damage, death | ✅ every pellet judged on the server; kills, hit markers, kill feed; no new mispredictions |
| M7 DBNO and revive | ✅ down, crawl and bleed; hold F for 4 s to revive; predicted with no mispredictions |
| M8 Melee | ✅ V swings the knife: kills standing or downed, judged with lag compensation |
| M9 Client presentation (viewmodel, HUD, hit markers) | ✅ a gun in your hands, sights, flashes, tracers and bullet marks; ADS sensitivity per zoom |
| M10 Range Lab (dummies) | ✅ targets out to 50 m, offline in its own room or online; F2 overlay, damage against the data |
| M11 End-to-end tests, netsim gates, docs | ✅ a fight in the netsim, two Range Lab browser tests, hit-reg gates (D-060) |

### What's done
- **Weapon data (M1, D-039):** `data/weapons/<id>.json` for all 40 roster weapons, generated once from
  `research/weapons.csv`. Damage and falloff, fire rate and modes, magazine and +1, total ammo, reload times
  (with the community-measured ammo-refill points), ADS time, attachments (including the per-operator ones:
  Dokkaebi's Mk 14 telescopic sight and muzzle brake, Brava's CAMRS grips, the 5.7 USG muzzle brake),
  extended-barrel damage, and the two official recoil facts (Mk 14 first-shot ×3.5, Reaper MK2 stages).
  `data/gunplay.json` holds class, sight, attachment and handling rules; `data/combat.json` damage zones,
  penetration, DBNO, revive and melee; `data/modes/lab.json` the lab mode preset (friendly-fire settings). Every
  invented value is in its file's `_unverified` list and in research/OPEN_QUESTIONS.md ("Placeholders added
  while building Phase 3", 34 questions).
- **Checks:** schemas reject impossible weapons (damage rising with range, a barrel offered without its
  numbers, more than one shot per tick, and more), cross-file checks catch loadouts naming a missing weapon,
  and a test compares every number and UNVERIFIED mark with the CSV and the class rules
  (weapons_notes.md §4). The Ballistic Shield and GONNE-6 are in the data but can't be picked until Phase 8
  (D-054).
- **Loadouts and damage maths (M2):** a loadout pick (operator, two weapons with sight, barrel, grip and laser,
  gadgets) is checked against the data (who can carry what, per-operator attachments, the shield and GONNE-6
  not pickable yet) and an invalid one quietly becomes the default loadout. It resolves into the numbers the
  simulation will use, all in 64 Hz ticks: ADS time with sight and laser bonuses, reload times with the angled
  grip, refill points (estimated from similar guns where nobody measured them), swap time, move speed, recoil
  with barrels and grips, extended-barrel damage. Damage: falloff by distance, head/neck/limb zones, buckshot
  pellets ×1.5 to the head, Skopós's idle-shell headshot rule, and limb penetration (none / simple / full).
- **Hit-registration harness (M0, D-045):** a shot now claims the frame that was on screen when you clicked,
  and the server rewinds using only the snapshots that client actually received. `npm run netsim -- --hitreg`
  runs a still shooter aiming at the heads it draws while four targets strafe, sprint, spam lean and crouch,
  crawl and vault, at 100 ms round trip: the server agrees with every shot (also with 10 ms jitter); with
  rewinding switched off, only 9 % hit the head. 11 % of shots needed more than 200 ms of rewind, so the cap
  is now 250 ms. The online lab's pause menu also simulates jitter and packet loss now (or
  `?lag=100&jitter=20&loss=1`, PLAN §16.9).
- **Weapons in the simulation (M3, D-040, D-055):** every operator now carries their real primary and
  secondary (picking another loadout came with M4). Hold the left mouse to fire (automatic weapons
  keep firing at their real rate; semi-auto ones fire per click), **R** reloads (tactical gives 31, empty 30
  on a 30-round rifle; interrupting after the magazine is out leaves just the chambered round), **1 / 2 / the
  wheel** switch weapons (0.6 s placeholder), **B** cycles fire modes where the gun has them. Sprinting
  cancels a reload, and a shot from a sprint waits out the 0.25 s sprint exit. Skopós's two shells each keep
  their own ammo. The HUD shows weapon, rounds and fire mode, with a placeholder muzzle flash. Online, all of
  it is predicted: the netsim's bots fire, reload and swap at 100 ms with jitter and stalls and get exactly one
  correction each (the join).
- **Loadouts (M4, D-042):** the pause menu has a Loadout section: each weapon your operator carries, with
  the sights, barrels, grips and laser it can take (per operator too: only Dokkaebi's Mk 14 gets the telescopic
  sight, only Thermite's and Pulse's 5.7 USG the muzzle brake). Under each weapon are the numbers the game
  uses (damage, fire rate, magazine, ADS and reload times with your attachments, speed), with a **?** on any
  that is still a placeholder. The Ballistic Shield and the GONNE-6 are listed but greyed out until Phase 8.
  Online, the server spawns the new body and everyone sees what you carry; the team switch lives there too.
  The loadout is part of the link, e.g. `?op=brava&primary=para_308.magnified..angled`. A browser tab left
  open across an update is now told to refresh (the game data is checked when you connect).
- **Aiming, recoil and spread (M5, D-041):** hold the right mouse to aim: the sights come up over the
  weapon's ADS time (faster with a laser or a better sight, 10 % slower straight out of a sprint), and a
  magnified sight zooms in. Long drops (over 1 m, placeholder) take the sights down. Spraying kicks the view up
  and sideways in stages by bullet (the Reaper MK2's official stages at bullets 3, 10 and 25), never past
  the pitch limit, and lying against a wall the sideways kick can't swing your body into it. Hip-fire spreads
  bullets inside a cone that four ticks around the dot show; aiming down sights closes it (to nothing for
  bullets, to a tighter cone for buckshot) and moving widens buckshot. Online, recoil is predicted exactly (no
  corrections) and only the server knows where each pellet goes. All numbers are placeholders.
- **Damage and death (M6, D-043, D-044, D-046, D-051):** shots now hurt. The server judges every pellet
  against everyone as the shooter saw them, then applies the tick's damage in a fixed order: bullet and slug
  headshots kill, buckshot does ×1.5 per pellet to the head, limbs take less, and rifles' penetration follows
  the weapon. Two players who shoot each other in the same tick both die; the dead can't fire; friendly fire
  is on in lab rooms. You get a hit marker (red on a kill) with the damage and the zone, a red edge and an arc
  pointing where damage came from, and a kill feed top right; dying shows who killed you and with what.
  Other players' shots show a muzzle flash and tracers when they happen on your screen. Skopós's idle shell
  can be destroyed without eliminating her (she just can't swap any more). Bullets go through the invisible
  ramp over the stairs but stop at walls. The pause menu has **Refill ammo** and **Take 30 damage**. Online,
  a hit costs the victim one correction from the server and never a misprediction: the netsim's spread-out
  bots shoot and kill each other with 0 mispredictions, and its hit-registration run confirms every shot's
  damage exactly as the shooter's own view predicts it (kills included).
- **Down but not out (M7, D-048, D-049):** at 0 HP you go down instead of dying (not on a headshot, the knife,
  a fall, a second down or a shot more than 20 past 0, and never as Skopós). Down, the view darkens and blurs,
  you lie down (crouched where there's no room), crawl slowly and bleed out of a 20 HP pool in 60 s, or 30 s
  while crawling; the HUD shows the pool. A teammate holds **F** beside you, facing you, for 4 s to pick you
  up with 20 HP (a gauge shows their progress; you stop bleeding meanwhile). Whoever downed you gets the kill
  if you die. **Down me** in the pause menu tries it alone. Online it is all predicted: the browser test
  downs and revives a player with every correction coming from the server and none from a misprediction.
- **The knife (M8, D-050):** **V** (or the Knife button on touch) swings; it lands 0.2 s later and kills anyone
  standing or down within reach in front of you, judged by the server against what you saw (at 100 ms round
  trip a test knifes a sprinting target where the attacker saw it, and misses it with rewinding off). It ends a
  sprint, cancels a reload and holds fire.
- **What you see (M9, D-055, D-059):** a placeholder gun in your hands, built from boxes for each weapon type
  with the sight, barrel, grip and laser you picked; it bobs as you walk, lowers when you sprint, comes up on
  a swap, dips for a reload (the magazine comes out) and kicks when you fire, and the knife swipes across. Down
  the sights you look through the sight: a red dot or a cross on the non-magnifying sights, a scope view on
  2.5× and 3.5×, with the zoom from M5. Muzzle flashes light the room, tracers and bullet marks show where shots
  went (nothing from others with a suppressor), lasers put a red dot on the walls, and you see your own
  shadow. The pause menu sets ADS sensitivity separately for 1×, 2.5× and 3.5× sights (your old single setting
  carries over). The HUD pieces are now separate modules the Range Lab will reuse.
- **The Range Lab (M10, D-052):** Home page → *Range Lab*. A shooting range with 18 targets: a dummy every 5
  to 10 m down a 50 m lane (posts at 13, 18 and 28 m, where falloff starts and ends for many guns), a row
  standing, crouched, prone and leaning, one strafing back and forth, one leaning out from behind a post, one
  through a doorway, a downed teammate on a revive pad, and one behind a soft wall (bullets stop there until
  Phase 4). Dummies come back 3 s after they die; *Reset dummies* (pause menu) brings them all back. A panel on
  the left reads out your last shot: who and where you hit, at what range, the damage the server dealt and what
  the weapon data says for that range and body part (at 40 m a rifle's 28 is the data's 28). Damage numbers
  float over whoever you hit. **F2** shows what the server judged: every pellet as it drew them, the target
  where the server had it (green) and where you saw it (blue). Offline the page runs a room of its own (no
  server; the latency settings still work); `?online` plays it with friends on the server.
- **Shared lab code:** both labs are now one page (`labs/common/lab.ts`) with their own level, go-to spots, help
  and extras. Dead bodies are drawn lying on the floor under them (they were left standing, or in mid-air).
- **Sights you can see through:** aiming down iron sights now looks through a rear notch at the front post (the
  first version's solid rear sight covered the middle of the screen), a red dot through an open frame, and a
  scope through an open tube.
- **A first-shot stall, found and fixed:** the first shot used to compile its effects' shaders mid-frame,
  which froze software-rendered pages for ~300 ms and delayed that shot's input past the 250 ms rewind cap,
  so the browser test's moving-target shot missed. Every effect shader is now drawn once at load, and the
  effects are pooled (they never allocate during a fight).
- **Frame rate (software rendering, so CPU-bound; real GPUs are measured on your PC, PLAN §18):** the Movement
  Lab at 1280×720 draws 13.5 fps against 15.7 before M9 (the gun pass costs about 1 fps, the flash light
  0.5); the two online test pages at 480×270 sharing one CPU draw 13 fps each.
- **Movement fix (D-057):** sprinting diagonally into a wall could, rarely, drop you 0.29 m into the floor in
  one tick. Fixed, with a regression test.
- **Checks for "done when" (M11, D-060):**
  - **A fight in the netsim** (`npm run netsim -- --combat`): two teams of five, 8 m apart at 100 ms round trip,
    spray at each other in bursts, knife up close, revive downed teammates and respawn a second after dying. In
    30 s: 24 downs, 3 revives started, 72 kills (31 with the knife), no desyncs (the two bots who end it
    pressed together get a few sub-millimetre corrections at rest, D-033 addendum), 33–38 kbps down per
    player, server tick 3 ms at p99 (budget 5). It runs in the unit tests for 20 s.
  - **Hit registration** (`--hitreg`, also in the unit tests) now also requires that every head the shooter hits
    on screen is a headshot on the server: 69 of 69, with and without 10 ms of jitter.
  - **A stall while spraying:** a 300 ms network stall while holding Fire costs no misprediction.
  - **Browser test of the Range Lab offline** (`tools/e2e/range-lab.mjs`): its own room with every dummy; a
    headshot kills; torso damage at 10 m and at 40 m (falloff) is exactly the data's 47 and 28; a leg takes
    less; a downed dummy can be finished; a tactical reload gives 31 (30 + 1 in the chamber) and an empty one 30;
    fire modes and weapon swaps work; a headshot while leaning leaves from the leaned eye; a 2.5× sight narrows
    the view to 31.3°.
  - **Browser test of the Range Lab online** (`tools/e2e/online-range.mjs`, two pages at +100 ms): a still
    dummy's head kills; on the strafing dummy, a click claims the frame on screen, the server never rewinds
    further back than that, and the target where the server rewound it is exactly where the shooter's page
    draws that moment (0.00 cm apart); the damage arc points at the attacker (−90° expected, −90° shown); A
    downs B, both kill feeds say so and B sees the down screen; A revives B with 20 HP; no mispredictions.
- **Review (D-061):** three reviewers read all of Phase 3 and found 20 problems; 19 are fixed, each with a
  test where one can be written. The worst two were on the page: changing your loadout with the pause menu
  open froze it, and joining a room while someone was shooting could hang on "Connecting…". In the game: a
  reviver who stalled (or Skopós opening her camera) froze the revive and stopped the downed body bleeding; a
  downed player trickling inputs could slow their bleed-out; a weapon key pressed while down fired after the
  revive. One is left for later (below).
- **Low graphics:** add `lowgfx` to the address (`range_lab.html?lowgfx`, or `?online&lowgfx`) to turn off
  shadows and anti-aliasing on a slow device; it doubles the frame rate of the software-rendered test pages.
- **Two page bugs the new browser test found:** a page that took seconds to start (the second page joining a
  busy room) got a first frame stamped from before its start, which stopped its clock for as long as the
  start-up took (no input reached the server, then its own 5 s silence check disconnected it). Time no longer
  runs backwards, and the silence check doesn't count time the page itself was too busy to read messages.
- 286 unit tests (33 of them for the page: settings, controls, HUD maths, guns and effects, the offline room).

### How to test (needs Node 22.12+)
```
npm install
npm run build
npm start
```
1. **Offline:** open http://localhost:8080 → **Range Lab**. Shoot the dummies down the lane and check the
   panel on the left (the damage dealt against what the data says at that range). **F2** shows where the
   server had the target (green) against where you saw it (blue). `Esc` → *Loadout* swaps guns and
   attachments; the *Downed teammate* on the revive pad takes a hold of **F**; **V** is the knife.
2. **Online at 100 ms:** **Range Lab online** (or **Movement Lab online**) → *Create a room*; `Esc` → *Copy
   invite link* and open it in a second window (or on a second PC, as in Phase 2). In both pause menus set
   **Simulated extra latency → +100 ms round trip**. Shoot the strafing dummy and each other, down and revive
   each other, try the knife. On a slow device (a tablet), add `&lowgfx` to the address.
3. **Over the internet:** your Railway link redeploys from `main` once this phase is merged. While the server
   is in Singapore, a US round trip (230–250 ms) plus the drawing delay is past the 250 ms rewind cap, so
   moving targets will be hard to hit; switch the region to US West or US East first (Settings → Deploy →
   Regions, keep 1 instance).

The automated checks: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (all four browser
tests), and `npm run netsim -- --hitreg` / `-- --combat` / `-- --spread`.

Things to judge, at +100 ms:
- Headshots on the strafing dummy and on another player: do they land where your screen says they should?
- Does the F2 overlay's green box sit where you saw the target (blue) when you clicked?
- Recoil, aiming down sights (the sight pictures and zoom) and the HUD: do they feel like Siege?
- Going down, crawling, bleeding out and reviving; the knife.

### Known issues
- **Every wall stops bullets** in Phase 3, soft walls included (the *Behind the wall* dummy can't be shot yet):
  wallbangs come with destruction in Phase 4 (D-046).
- All numbers beyond the official ones are placeholders, each listed in research/OPEN_QUESTIONS.md (Phase 3
  placeholders, 34 questions); the guns and bodies are placeholder boxes and capsules.
- The rewind cap is 250 ms (D-045, your call): beyond about 150 ms of ping, or below about 30 fps (when other
  players are drawn up to 150 ms in the past, D-032), some shots at moving targets are judged against a later
  moment than the one you saw.
- A body standing still pressed against others can get a correction now and then (sub-millimetre, faded out;
  D-033 addendum).
- A reviver who lets go and holds **F** again within about a round trip gets one small correction (D-061).
- The dummies don't shoot back; the Ballistic Shield and GONNE-6 can't be picked until Phase 8 (D-054), nor
  Skopós's idle-shell barrier (D-058).
- Frame rate is measured with software rendering only (5–15 fps for two test pages sharing a CPU); real GPUs are
  measured on your PC (PLAN §18).

### Next: Phase 4 — Destruction v1
Soft walls, floors, barricades, reinforcement, hatches, bullet penetration, networked destruction with late
join, and a destruction_lab page. **Done when:** wallbangs, punch holes and reinforcing are all synced across
clients.

---

## Phase 2 — Netcode core · ✅ merged and live on Railway (2026-10-01); waiting for your two-PC test

**Done when (PLAN §17):** two PCs play smoothly at 100 ms simulated latency. Before sign-off PLAN §3 also
asks for a real Railway deploy (latency from your location, WebSocket stability).

### What's done
- **Game server** (`game/server`): match rooms over a WebSocket at `/ws`, on the same port as the page.
  - Create a room, or join one with its 5-character code (no look-alike characters).
  - Limits: 10 players a room, rate limits per connection and per address (against one script taking every
    room or guessing codes), and bad messages disconnect.
  - When Railway restarts the server, players are told it's restarting.
  - `/stats` shows rooms, players and tick time. Decisions D-034 and D-036.
- **Server authority with client prediction** (D-029, D-030):
  - The server runs the same shared simulation at 64 Hz.
  - Your page predicts your own movement, so it responds instantly, and only gets corrected when the server
    disagrees.
  - Other players are drawn smoothly between server snapshots, a little in the past (D-032).
  - Your clock adjusts itself so your inputs reach the server just in time.
  - If your inputs are late, the server holds your body still (up to 250 ms) instead of guessing.
- **Lag compensation framework** (D-031): a shot rides on your input, and the server rewinds everyone else to
  what you were seeing when you fired, up to 200 ms. Phase 2 has a test shot (left click); weapons use it from
  Phase 3.
- **Players block each other** (D-033). Small corrections when you bump into someone fade out over 0.1 s.
- **Online Movement Lab** (D-035):
  - Home page → *Movement Lab online*: create a room; the address bar is the invite link.
  - Other players are orange with name tags.
  - Pause menu: simulated extra latency, invite link, leave.
  - Net stats line under the fps: ping, interpolation delay, corrections, kbps.
- **netsim harness** (`npm run netsim`, PLAN §19): 10 headless clients over a simulated network (100 ms round
  trip, jitter, TCP stalls, clock drift). Results for 30 s:
  - Desyncs: none. Dropped inputs: none.
  - Bandwidth per player: about 14–17 kbps down and 13 kbps up.
  - Server tick: 0.7 ms on average, 2.3 ms at p99. The budget is 5 ms.
  - Corrections: about one per player in 30 s when spread out (the spawn), and about 1.5 per second when
    constantly bumping into each other.
- **Tests:**
  - 127 unit tests, including the protocol, snapshots, lag compensation, player collision, the lobby and its
    limits, room behaviour (respawn, operator picks, stalls, shots, resyncs), and the netsim as a regression test.
  - Two headless-browser tests. The new one runs two browsers at +100 ms: they join by code, see each other
    move, one hits the other mid-stride with a test shot, one respawns, then one leaves and the server restarts.
- **Review:** one reviewer read all the Phase 2 changes and found 12 problems, including one that let anyone
  crash the server and one that froze the online lab on respawn. All 12 were fixed. A second round (verifiers on
  each fix, fresh reviewers on the fix commits, a skeptic on every new claim) found 13 more gaps, all fixed. The
  biggest was a physics-library quirk that briefly hid the floor after a player left or respawned (D-037). Each
  fix has a test that fails without it where one could be written.

### How to test (needs Node 22.12+)
```
npm install
npm run build
npm start
```
1. **One PC, two windows:** open http://localhost:8080 → **Movement Lab online** → *Create a room*. Press
   `Esc` → *Copy invite link* and open it in a second browser window (or a private window, to use another
   name). In both pause menus set **Simulated extra latency → +100 ms round trip**.
2. **Two PCs on the same network:** on the second PC open `http://<first PC's IP>:8080` and join with the
   code. Windows asks whether Node may use the network the first time; allow private networks. (`ipconfig`
   shows the IP, usually 192.168.x.x.)
3. **Over the internet:** open your Railway link (the `@redmond/server` service's domain) on both PCs, or
   send it to a friend. Railway redeploys automatically whenever `main` changes.

Things to judge, at +100 ms:
- Does your own movement feel as responsive as offline?
- Does the other player move smoothly (no stutter or teleporting)?
- Bump into each other: is it acceptable?
- Left-click at the other player while they strafe. The red line is your shot. The green outline is where the
  server judged them to be. Does that match where you saw them?

### Known issues
- Below ~30 fps, other players are drawn up to 150 ms in the past instead of ~65 ms (D-032).
- Bumping into another player causes small corrections (smoothed). Standing on someone's head slides you off;
  whether Siege lets you stand there is an open question (research/OPEN_QUESTIONS.md, Phase 2 placeholders).
- Rarely, a 0.1 mm disagreement at wall corners causes a correction (absorbed, invisible).
- **Deployed** on Railway as one service (settings in `.railway/railway.ts`, D-036). Two test clients on the live
  server: join by code, no corrections while walking, no resyncs, server tick 0.5 ms. The server currently runs
  in **Singapore**: about 230–250 ms round trip from a US test machine. For US players, switch the region to US
  West or US East (Settings → Deploy → Regions, keep 1 instance).

### Next: Phase 3 — Gunplay
The weapon data system, recoil, ADS, attachments, hit registration on the rewind framework (with lean and stance
hitboxes), DBNO and revive, plus melee (deferred from Phase 1, D-024). **Done when:** headshots and hit
registration feel right at 100 ms.

---

## Phase 1 — Skeleton + movement · ✅ complete (Ulo tested it on 2026-09-30: "all looking good")

**Done when (PLAN §17):** it feels like Siege movement to you, offline.

### What's done
- **npm workspace** (PLAN §4): `game/shared` (simulation used by both browser and server), `game/client` (Vite +
  Three.js), `game/server` (serves the built client; Railway-ready).
- **Data-driven movement** in `data/movement.json`: per-rating walk and sprint speeds, crouch, prone, ADS and
  slow-walk speeds, stance heights and transition times, lean, vault, ladder, fall damage. Health comes from
  `data/operators/*.json` (all 12 operators). Placeholders are listed in `_unverified`.
- **Movement:**
  - Stances: stand, crouch and prone with timed transitions; you can't stand or crouch without headroom.
  - Prone: turn speed and aim arc are limited, and you can't go prone or turn where your body wouldn't fit.
    The lying body follows the ground (ramps and stairs in any direction) and stops at walls, so the camera
    and hitboxes never end up inside them.
  - Lean: toggle or hold, in any stance, with camera roll; your head stops at walls.
  - Sprint: forward only, not while aiming, cancels lean, and stands you up.
  - Vaulting/mantling: over, onto, and through open windows; tagged objects only. Works standing still — a
    "Space to mantle" prompt shows whenever you face something you can mantle (your feedback).
  - Ladders: climb, slide down (hold or toggle crouch), dismount at the top, let go. Grab them standing.
  - Stairs and ramps: speed holds on slopes, and 55° is too steep.
  - Fall damage.
- **Player/pawn separation:** Skopós owns two shells. `Z` opens the other shell's camera; `F` there transfers
  (1.3 s + 1.3 s, then 0.5 s cooldown), per your feedback. The idle shell stays crouched.
- **Hitboxes** follow stance and lean (F3 shows them). They're ready for lag compensation in Phase 2/3.
- **Movement Lab** page:
  - Views: first person and third person (F4).
  - Settings: sensitivity, ADS sensitivity, vertical FOV with its horizontal equivalent, raw input, invert Y,
    and separate toggle/hold modes for crouch, prone, lean and ADS.
  - Tools: operator picker, "Go to" menu, HUD, help (F1).
  - Touch controls for tablets.
- **Tests:**
  - 71 unit tests, including a determinism test: two independent simulations fed the same inputs end identical.
  - A headless-browser test that plays through every mechanic.
  - CI on every PR.

### How to test (on your PC, needs Node 22.12+)
```
npm install
npm run build
npm start
```
Then open http://localhost:8080 → **Movement Lab**. Click to lock the mouse; `Esc` pauses (settings, operator,
"Go to" menu). `F1` lists the keys and what to try. Things to judge:
1. Walk and sprint speeds for a 1-, 2- and 3-speed operator (Fuze, Sledge, Brava). Do they *feel* like Siege?
2. Crouch and prone transition times; the lean amount and speed.
3. Vault heights and timing (vault course, window); ladder speed; the 3 m and 6.5 m drops.
4. Anything that feels floaty, sticky, or wrong — tell me and I'll tune `data/movement.json`.

For development there's also `npm run dev` (hot reload at http://localhost:5173/labs/movement_lab.html).

### Known issues
- The numbers are placeholders from research until you measure them (research/OPEN_QUESTIONS.md, core mechanics).
- Simplifications and deferrals are listed in DECISIONS D-023 and D-024 (e.g. rappel moves to Phase 5, melee to
  Phase 3). Prone, you can't crawl off a drop taller than a step or climb a curb head-first yet (D-023a).
- Nothing is on Railway yet, so it can't be opened from an iPad until Phase 2 deploys it.

### Next: Phase 2 — Netcode core
WebSocket match rooms on the Node server, room codes, client prediction + server reconciliation (the shared
simulation is already deterministic), interpolation of other players, the lag-compensation framework, a headless
multi-client test harness, and the first Railway deploy.

---

## Phase 0 — Research · ✅ complete, ⏳ waiting for your SUMMARY skim (2026-09-29)

**Done when (PLAN §17):** `research/` complete, SUMMARY.md, OPEN_QUESTIONS.md, screenshot checklist
sent → you skim it and answer the open questions you can.

### What's done
- **All research files from PLAN §2.1/§2.2**, verified against **Y11S3 incl. Y11S3.1**:
  - `research/core_mechanics.md`, `destruction.md`, `round_flow.md`, `intel.md`, `gadgets.md`
  - `research/operators/*.md` — all 12 (Lesion confirmed as "Legion")
  - `research/weapons.csv` (40 rows) + `weapons_notes.md`
  - `research/interactions.csv` (343 rows) + `interactions_notes.md`
  - `research/oregon/`: `version.md`, `layout_notes.md`, `surfaces.md`, `map_features.md`,
    `common_setups.md`, `SCREENSHOT_CHECKLIST.md`, `refs/SOURCES.md`
  - `research/SUMMARY.md` (one-page digest) and `research/OPEN_QUESTIONS.md` (259 questions; top 3 answered)
- **Stack switched to the browser** (your call): TypeScript + Three.js + Rapier + a Node WebSocket server on
  Railway. PLAN.md §3/§4/§5/§18 rewritten. The desktop Godot spike was retired.
- **§3 tech spike for the web stack: passed** (`tools/spike/web_stack/`, DECISIONS D-020). Browser prediction
  matches the server bit-for-bit, and the server tick is 0.54 ms p99 with 10 players (budget 5 ms).
- **Your decisions applied:** browser + Railway (D-019), Lesion (D-011), reinforcements `max(6, …)` (D-015),
  Pick & Ban in Unranked (D-014), Quick Match format, no 3v3 (D-017).

### How to test / review
1. **Run the spike** (2 minutes, needs Node 22+):
   ```
   cd tools/spike/web_stack
   npm install
   npm run build
   npm start
   ```
   Open http://localhost:8080 in Chrome/Edge (WASD + drag mouse). Open a second tab to see a second player.
   The HUD's "max prediction error" should stay at 0.
2. Skim **`research/SUMMARY.md`** (one page).
3. When you have time: the rest of `research/OPEN_QUESTIONS.md` (reply in chat, or write `> Ulo: …`
   under a question) and the **30-minute minimum screenshot set** in `research/oregon/SCREENSHOT_CHECKLIST.md`.
   The repo is **public**; consider making it private before adding screenshots.

### Known issues
- **Weakest data:** movement speeds, stance heights, hole sizes, drone and camera numbers, and camera facings.
  Ubisoft doesn't publish these, so they're `UNVERIFIED` placeholders until you measure them in-game.
- `oregon/common_setups.md` (what the bots will use) is mostly inferred (tagged `DER`).
- Nothing is deployed to Railway yet. That's Phase 2, and I'll confirm with you before creating anything in
  your Railway account.
- Several agents' web requests briefly carried your GitHub handle (and once your email) in a User-Agent header.
  This was caught and forbidden; nothing personal is in the repo.

### Next: Phase 1 — Skeleton + movement
TypeScript workspace (`game/shared`, `game/server`, `game/client`), data loaders for `data/*.json`,
player/pawn separation (Skopós-ready), stand/crouch/prone, lean (toggle/hold), sprint, vault, ladders,
and a `movement_lab` test page. **Done when:** it feels like Siege movement to you, offline in the browser.
