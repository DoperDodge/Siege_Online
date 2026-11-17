# Millrace: Project Redmond's own map (R2, D-183)

Oregon is replaced by a map of our own. Millrace is a closed textile mill by a river: a long two-storey brick mill
block over a basement, its office wing at the east end, a boiler house to the south joined to the mill's cellars by a
tunnel, a loading dock and yard to the north, and the millrace (the stone channel that turned the wheel, dry now) along
the west at basement depth, with the wheel pit cut into the mill's west end. It is the same kind of map as before (a
basement and two floors, four bomb sites, lots of soft walls and floors, several ways in from three attacker spawns)
with a floor plan, rooms, names and look of its own.

Built like Oregon was (tools/mapgen, DESIGN.md §4): `layout.json` (rooms, splits, soft floors, hatches, stairs,
ladders, roofs, spawns, sites, cameras, ingredients, zones), `walls_{B,1F,2F}.json` (wall lines with their soft,
door, window, open and drone-hole spans), `exterior.json` (the yard's items and the rooms' cover props), compiled to
`level.json`; `art.json` (each room's style, the outside's items), `bot_strats.json` (each site's plan). Hand-authored
in metres: one frame (`world`, 1 u = 1 m), x east, z south, y up.

## Footprints

| Part | x (m) | z (m) | Storeys |
|---|---|---|---|
| Mill block | 0 – 48 | 0 – 20 | B, 1F, 2F (the Loom Hall is 1F to the roof) |
| Office wing | 48 – 60 | 0 – 28 | B, 1F, 2F |
| Boiler house | 8 – 22 | 26 – 38 | B, 1F; its chimney to 14 m |
| Tunnel | 13.5 – 16.5 | 20 – 26 | B |
| Loading platform | 10 – 38 | −14 – −11 | 1.1 m up, by the rail line (the apron along the mill is at ground level) |
| Millrace | −5 – 0 | −6 – 34 | an open channel at basement depth, a footbridge over it at z 22 |
| Playable ground | −30 – 90 | −30 – 70 | |

Storeys: B floor −3.2, 1F 0, 2F 3.2, eaves 6.2 (the mill's gable roof and the office wing's flat roof, both
walkable), the boiler house's roof at 3.2 sloping down to the north.

## Rooms (version 2)

Version 1 had a few very large rooms (a 26 m Loom Hall, 16 × 20 m cellars, an 8 m-wide channel): long, empty
sightlines that favoured whoever held them. Version 2 cuts the building into smaller rooms joined by corridors, so a
fight crosses a few short sightlines rather than one long one.

| Storey | Rooms (id, callout) |
|---|---|
| B | `B_MILLRACE` Millrace (5 m wide now, a sluice gate and debris in it); `B_PIT_STORES` Pit Stores, `B_WHEEL_PIT` Wheel Pit (the wheel as cover, a 3.5 m arch onto the millrace), `B_SLUICE` Sluice Room; `B_DYE_VATS` Dye Vats, `B_RINSE` Rinse Room, `B_BOLT_STORE` Bolt Store, `B_WORKSHOP` Workshop north of `B_CORRIDOR` the Cellar Corridor (3 m wide, west to east); `B_VALVE_ROOM` Valve Room, `B_TUNNEL` Tunnel (from the corridor to the boiler house), `B_LYE_STORE` Lye Store, `B_SORTING` Sorting Room south of it; `B_CELLAR_STAIRS` Cellar Stairs; `B_PUMP_ROOM` Pump Room, `B_STRONGROOM` Strongroom; `B_BOILER_ROOM` Boiler Room, `B_COAL_STORE` Coal Store |
| 1F | `1F_LOOM_HALL` Loom Hall (18 × 20 m, open to the roof, four pillars and rows of looms); `1F_WARPING` Warping Room, `1F_FOREMAN` Foreman's Office; `1F_SPINNING` Spinning Room, `1F_MENDING` Mending Room; `1F_MILL_CORRIDOR` Mill Corridor (2 m, between the site and the stairs); `1F_STAIR_HALL` Stair Hall; `1F_OFFICE_HALL` Office Hall (3 m, down the office wing's west side); `1F_RECEPTION` Reception, `1F_DISPATCH` Dispatch Office, `1F_BALE_STORE` Bale Store; `1F_FIRING_FLOOR` Firing Floor, `1F_ENGINE_ROOM` Engine Room (the boiler house) |
| 2F | `2F_GALLERY` Gallery (over the Loom Hall's north side); `2F_OVERLOOK` Overlook, `2F_PATTERN_ROOM` Pattern Room; `2F_CARD_ROOM` Card Room, `2F_CARDING_STORE` Carding Store; `2F_UPPER_CORRIDOR` Upper Corridor; `2F_UPPER_STAIRS` Upper Stairs; `2F_OFFICE_HALL` Upper Office Hall; `2F_DRAFTING` Drafting Room, `2F_PAYROLL` Payroll, `2F_ARCHIVE` Archive |

## Sites

| Site | Rooms | Ways in |
|---|---|---|
| `SITE_BOILER` | B Boiler Room / Coal Store | the Tunnel, the boiler stairs from the Engine Room, the Firing Floor's hatch |
| `SITE_MILL` | 1F Spinning Room / Mending Room | soft walls from the Warping Room, the Foreman's Office and the Mill Corridor; doors from each; the dock door; hatches from the Carding Store above and into the Bolt Store below |
| `SITE_DISPATCH` | 1F Dispatch Office / Bale Store | soft walls and doors from the Office Hall and Reception; the yard door; Payroll's hatch above |
| `SITE_OFFICES` | 2F Drafting Room / Payroll | the office stairs, soft walls and doors from the Upper Office Hall, the Archive's wall, windows on two sides |

## What version 2 follows

General principles of well-liked maps in this genre (our reading of players' and designers' writing, not any one
map's layout):

- **Short sightlines.** Rooms of 6 to 12 m and corridors of 2 to 3 m between them, so no one holds a long empty lane;
  big spaces (the Loom Hall) get pillars and machines to break them up.
- **Chokepoints that can be contested.** Each corridor meets the sites through a door and a soft wall at least, with
  cover on both sides, so a choke has counter-angles and a second way round.
- **Several ways into every site**, including vertical ones (hatches from above and below, soft floors) and soft walls
  that attackers can open themselves.
- **Spawns screened from the building.** Each attacker spawn stands behind solid cover taller than a head (the river
  wall, two rows of wagons, the yard wall and its gatehouse), and the windows that looked straight at a spawn are fewer.
- **Nothing in front of an opening.** The loading platform stands by the rail line, away from the walls; the apron
  along the mill is at ground level, its doors and windows clear.

## Ways in, up and down

- **Attacker spawns:** `A_RIVERBANK` west behind the river wall, `B_RAIL_SIDING` north behind the wagons, `C_YARD_GATE`
  south-east behind the yard wall and gatehouse.
- **Stairs:** the main stairs (B, 1F, 2F) in the Stair Hall; the office stairs (Reception up to the Drafting Room); the
  boiler stairs (Engine Room down to the Boiler Room); the Gallery stairs up the Loom Hall's west wall; outdoor steps
  down into the millrace's south end.
- **Hatches:** Carding Store → Mending Room, Payroll → Dispatch Office, Spinning Room → Bolt Store, Firing Floor →
  Boiler Room, Overlook → Warping Room.
- **Soft floors:** the Gallery, the Card Room's east part, the Pattern Room, the Archive, the Bale Store's west part.

## Milestones

| M | What |
|---|---|
| R2.1 | The generator compiles any map in `data/maps/<id>` (Oregon's literals and its blueprint tooling out of the path) |
| R2.2 | Millrace's walls, rooms, floors, stairs, hatches, roofs, outside and metadata; the structural checks; a walkable greybox |
| R2.3 | Its art: each room's style, the outside's items, cover props and dressing |
| R2.4 | The bots' plans for its four sites; the bot tests on it |
| R2.5 | Matches, Bot Training, the labs and the tests on Millrace; Oregon's data off this branch |
