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
| Loading dock | 12 – 40 | −4 – 0 | a platform 1 m up along the mill's north wall |
| Millrace | −8 – −2 | −12 – 44 | an open channel at basement depth, a footbridge over it at z 22 |
| Playable ground | −30 – 90 | −30 – 70 | |

Storeys: B floor −3.2, 1F 0, 2F 3.2, eaves 6.2 (the mill's gable roof and the office wing's flat roof, both
walkable), the boiler house's roof at 3.2 sloping down to the north.

## Rooms

| Storey | Room (id, callout) | x | z |
|---|---|---|---|
| B | `B_WHEEL_PIT` Wheel Pit (opens on the millrace through an arch) | 0 – 8 | 4 – 16 |
| B | `B_DYE_VATS` Dye Vats | 8 – 24 | 0 – 20 |
| B | `B_CLOTH_STORE` Cloth Store | 24 – 40 | 0 – 20 |
| B | `B_CELLAR_STAIRS` Cellar Stairs | 40 – 48 | 0 – 20 |
| B | `B_PUMP_ROOM` Pump Room | 48 – 60 | 0 – 14 |
| B | `B_STRONGROOM` Strongroom | 48 – 60 | 14 – 28 |
| B | `B_TUNNEL` Tunnel | 13.5 – 16.5 | 20 – 26 |
| B | `B_BOILER_ROOM` Boiler Room | 8 – 22 | 26 – 33 |
| B | `B_COAL_STORE` Coal Store | 8 – 22 | 33 – 38 |
| 1F | `1F_LOOM_HALL` Loom Hall (open to the roof) | 0 – 26 | 0 – 20 |
| 1F | `1F_SPINNING` Spinning Room | 26 – 40 | 0 – 11 |
| 1F | `1F_MENDING` Mending Room | 26 – 40 | 11 – 20 |
| 1F | `1F_STAIR_HALL` Stair Hall | 40 – 48 | 0 – 20 |
| 1F | `1F_RECEPTION` Reception (the front door, east) | 48 – 60 | 0 – 10 |
| 1F | `1F_DISPATCH` Dispatch Office | 48 – 60 | 10 – 18 |
| 1F | `1F_BALE_STORE` Bale Store (a wide door south to the yard) | 48 – 60 | 18 – 28 |
| 1F | `1F_FIRING_FLOOR` Firing Floor (the boiler house) | 8 – 22 | 26 – 38 |
| 2F | `2F_GALLERY` Gallery (a walkway over the Loom Hall's north side) | 0 – 26 | 0 – 3 |
| 2F | `2F_CARD_ROOM` Card Room | 26 – 40 | 0 – 20 |
| 2F | `2F_UPPER_STAIRS` Upper Stairs | 40 – 48 | 0 – 20 |
| 2F | `2F_DRAFTING` Drafting Room | 48 – 60 | 0 – 12 |
| 2F | `2F_PAYROLL` Payroll | 48 – 60 | 12 – 20 |
| 2F | `2F_ARCHIVE` Archive | 48 – 60 | 20 – 28 |

## Sites

| Site | Rooms |
|---|---|
| `SITE_BOILER` | B Boiler Room / Coal Store |
| `SITE_MILL` | 1F Spinning Room / Mending Room |
| `SITE_DISPATCH` | 1F Dispatch Office / Bale Store |
| `SITE_OFFICES` | 2F Drafting Room / Payroll |

## Ways in, up and down

- **Attacker spawns:** `A_RIVERBANK` west across the millrace, `B_RAIL_SIDING` north beyond the dock, `C_YARD_GATE`
  south-east at the yard's gate.
- **Doors:** two dock doors and the Stair Hall's north door on the mill's north side; the front door into Reception
  (east); the Bale Store's wide south door; the Firing Floor's north and west doors; the Wheel Pit's arch onto the
  millrace (basement level, reached down the channel's steps at its south end).
- **Windows:** along both long walls of the mill on both floors, the office wing's east and south walls, the boiler
  house's west wall.
- **Stairs:** the main stairs (B, 1F, 2F) in the Stair Hall; the office stairs (1F Reception to 2F Drafting); the boiler
  house stairs (Firing Floor down to the Boiler Room); the Gallery stairs up the Loom Hall's west wall; outdoor steps
  down into the millrace. A ladder from the Wheel Pit up into the Loom Hall.
- **Hatches:** Card Room → Mending Room, Payroll → Dispatch Office, Spinning Room → Cloth Store, Firing Floor → Boiler
  Room.
- **Soft floors:** the Gallery's boards, the Card Room's east half, the Archive, the Bale Store's west part.
- **Soft walls:** every wall between a site's rooms and its neighbours, the Loom Hall's partitions, the office wing's
  inner walls, the tunnel's ends.

## Milestones

| M | What |
|---|---|
| R2.1 | The generator compiles any map in `data/maps/<id>` (Oregon's literals and its blueprint tooling out of the path) |
| R2.2 | Millrace's walls, rooms, floors, stairs, hatches, roofs, outside and metadata; the structural checks; a walkable greybox |
| R2.3 | Its art: each room's style, the outside's items, cover props and dressing |
| R2.4 | The bots' plans for its four sites; the bot tests on it |
| R2.5 | Matches, Bot Training, the labs and the tests on Millrace; Oregon's data off this branch |
