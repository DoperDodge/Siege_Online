# The map generator (`tools/mapgen`)

Status: built in Phase 5 (adopted 2026-10-13, with the review amendments below), for the project's first map, a
greybox traced from published floor plans. Project Redmond replaced that map with Millrace, our own, drawn by hand
(R2, D-183), and took the tracing pipeline and the first map out (R4). This document keeps the design as built and
states the rules every compiled map follows; the history of the traced map is in DECISIONS (D-070 onward) and
PROGRESS. Millrace is the example throughout (data/maps/millrace, its DESIGN.md).

Read with: PLAN.md §8, §9, §17, §18, §20; DECISIONS D-013, D-023(b), D-024, D-037, D-062..D-069, the Phase 5
entries, D-183, D-184, D-200.

Rules this design keeps: every placeholder is marked UNVERIFIED with its rule (section 10); no third-party image
ever enters the public repo; the project owner is called Ulo.

## Review amendments (adopted; where the body below disagrees, these win)

An independent review judged the design "sound with fixes". The fixes still in force, by their numbers (code cites
them):

1. **Exterior opening kinds (P9).** A DOOR or WINDOW span's kind is authored on the span; P9 is the default rule
   where nothing says otherwise.
2. **Hatch landing (M2).** A hatch's centre lies inside its named room on both floors; it may be clipped by at most
   0.5 u to keep clear of hard walls; its clear opening is at least 1.2 m; a landing under 0.3 m from a wall of the
   room below is a warning. A frame with an alternative (`alt`) reports where each hatch lands under both options.
3. **Props and bullets (M5).** PROP solids have their own collision group that bullet queries skip; a prop with a
   class counts like a panel for the ×0.7 multiplier and the two-surface limit, with no holes, unless its class
   stops bullets (data/destruction.json `props`).
4. **Image hygiene (M1).** `tools/mapgen/hygiene.test.ts` (CI) and the opt-in `.githooks/pre-commit` read what git
   has staged (Git LFS files by their stored content) and reject any image file (SVG included); any archive,
   document, model or video, by name and by its bytes; PNG, JPEG or WEBP bytes anywhere in a file and other image
   formats by their header; and image data URIs and base64 image data, JSON-escaped or URL-safe, anywhere in a
   long base64 run. The only exception is the game's CC0 texture sets (D-170). The generator's plans go to
   `builds/`, never tracked.
5. **A pitched roof without a ceiling (M4).** `ceiling: false` leaves the room under a pitched roof open to it; the
   walls under it are raised to the roof's underside in steps.
6. **Hatch clipping (M2).** A hatch is clipped in world coordinates against the walls of its top room.
7. **Alternatives one flag away (M2).** Where two readings of a plan disagree, the one built is the default and the
   other stays one field away: a soft floor's `alt` extent with `use: "alt"`, a span kept on the plan but built as
   wall with `hard` (P36).
8. **Client performance gate (M1, M6).** The stats overlay shows FPS, frame time, 1% lows and draw calls; the pass
   bar for Ulo's PC is ≥ 120 FPS average and ≥ 90 FPS 1% lows at 1080p High. The shadow map renders on demand.
   Soft-floor tiles are at most 4 m (a 3 m cap was measured and not needed: `npm run bench:map`).
9. **Leak check and corner posts (M1, M2).** The generator adds a hard corner post at an L corner where both walls
   stop short (each ends in a panel or an opening there). The tests rasterise the compiled boxes 1.2 m and 0.1 m
   above each storey's floor (2.5 cm cells, openings closed) and flood-fill the plan's rooms: any connection
   between rooms, or to the outside, that isn't a declared opening or drone hole fails.
10. **Rappel is not dropped.** Phase 5 ended with rappel (M8).
11. **Our own plans (M1+).** `npm run mapgen` writes a plan SVG per storey, our geometry only, to
    `builds/mapgen/plans/<map>/` with a page that shows them.
12. **Rails (M2/M3).** A rail is one vaultable `bodiesOnly` box up to rail height plus a render-only bar with no
    collider; railing vaultability is a placeholder.
13. **Sections visible (M1).** REINFORCEABLE panels show their section seams and a count label in the greybox
    palette.
14. **Soft-floor tiles count as one surface (M2).** Tiles carry their region's id; hits.ts counts the tiles of one
    region as one surface for penetration (D-065).
15. **Lighting (M2).** Per-storey ambient and hemisphere light from `storeys`, the basement darker; the lighting
    proper is Phase 10's.
16. **Floor scale reference (M1).** Textured floors stay out of instancing and get a world-space 1 m grid.
17. **HUD positions (M2).** The HUD line shows world u and the storey's native u (the frame the wall files use);
    `npm run mapgen -- --where x,y,floor` converts.
18. **Boundary and kill plane in M1.** Four `bodiesOnly` boundary walls round the play area, and the kill plane.
19. **Questions batched.** Questions to Ulo go in OPEN_QUESTIONS, asked together.

---

## 0. Summary

A map is built as data. A hand-curated authoring layout (`data/maps/<id>/layout.json` plus per-floor wall parts
and `exterior.json`) describes floors, wall lines with their spans (soft sections, doors, windows, open passages,
drone holes), rooms, soft floors, hatches, stairs, ladders, roofs, the outside, props, spawns, sites, cameras,
ingredients and zones. A TypeScript generator (`tools/mapgen`) compiles it into an ordinary `LevelDef`
(`data/maps/<id>/level.json`, committed, checked by a freshness test) that the engine already knows how to build:
boxes, panels, stairs, ramps and ladders, plus a few optional metadata fields.

Key choices:

1. **Each storey can have its own plan frame.** A record's plan position is in the frame it names; an affine per
   frame maps it to world u. Millrace is drawn in one frame (all identity).
2. **One scale parameter.** World metres = `mPerU` × world u (Millrace: 0.15), origin at u (0, 0), +X east, +Z
   south, Y up.
3. **The generator never lets hard geometry overlap a panel** (an overlap makes a soft wall bulletproof).
4. **Minimal engine changes** (section 7), sized by the budgets of section 8.

---

## 1. Where it came from

Phase 5 wrote the generator for a map traced from published floor plans: an extraction (Python, dev-only) seeded the
wall files from the plans' rasters, and the tests checked the compiled level against the research's tables. Project
Redmond removed that map with its extraction, references and research cross-checks (R4); the generator itself, its
general checks and its tests on small layouts stayed, and Millrace (R2) is compiled with it.

---

## 2. Goals and non-goals

**Goals**
- Every storey, every roof surface and the outside between the attacker spawns and the building, at greybox detail
  (boxes, ramps, stairs, panels), coloured by surface class (PLAN §9.1), with a neutral palette toggle.
- Correct surface tagging: soft walls as reinforceable panels with their sections, soft floors, hatches, every door
  and window frame with its barricade and glass, drone holes, everything else hard.
- Rooms with callouts, bomb-site pairs with bomb markers and plant zones, attacker spawns (in groups) and defender
  spawns (per site), default cameras, destructible ingredients, rappel faces, out-of-bounds and spawn-peek zones:
  **as data and markers**.
- A validation suite (section 9).

**Non-goals (and where they went)**
- The art pass: Phase 10 (render/DESIGN.md), on the compiled level.
- Match flow: Phase 6. Drones and cameras in use: Phase 7. Gadgets and ingredient behaviour: Phase 8. Navigation and
  bots: Phase 9 (the walk graph of section 9.2 was a head start).

---

## 3. Coordinates, frames and storeys

### 3.1 From u to metres

- **u**: the authoring unit. **native u**: a point in the frame its record names (a storey's own drawing).
  **world u**: the same point mapped into the world frame (section 3.2).
- **Game metres**: `X = mPerU * x_world`, `Z = mPerU * y_world`, `Y` = height. Origin u (0, 0).
- Yaw (engine convention, `forwardXZ`): yawDeg 0 faces north (-Z), 90 west, 180 south, -90 east. A compass bearing
  b (clockwise from north) is yawDeg = -b.
- Snapping: after mapping and scaling, box faces snap to `snapM` (5 cm, the panel cell). Thicknesses are exact
  multiples of 5 cm, so centred walls keep faces on the grid.

### 3.2 Per-floor frames

Each frame has an affine `world = a * native + b` per axis, a `status` (reference, fitted or assumed) and optionally
an `alt` affine with `use: "main" | "alt"` choosing which is built. The generator applies the frames to everything
drawn per floor: walls, openings, soft walls, soft floors, room seeds, drone holes, cameras, ingredients, bomb
markers; and reports where each hatch lands under both options of a frame with an alternative (amendment 2), so an
answer flips one field. Millrace's frames are all identity (`assumed`): it is drawn in world u.

### 3.3 Storeys and heights

`storeys` lists each storey's floor height and slab thickness; an `underground` storey's walls all stop under the
slab above (earth outside). Millrace: B −3.2 m (underground), 1F 0, 2F 3.2 m; slabs 0.2 m. A wall runs from its
floor to the cover above (3.0 m under a slab).

---

## 4. The layout format

### 4.1 Files

| File | Role | Edited by | Loaded at runtime |
|---|---|---|---|
| `data/maps/<id>/layout.json` | Authoring root (PLAN §9.1's name): units, frames, storeys, defaults, rooms, splits, soft floors, hatches, floor shifts, wells, stairs, ladders, roofs, spawns, sites, cameras, ingredients, zones, rappel refusals, `_unverified`, `_sources` | hand | no |
| `data/maps/<id>/walls_<floor>.json` | Wall lines with spans, per floor, in the frame it names | hand | no |
| `data/maps/<id>/exterior.json` | Outside items, props, the playable rectangle | hand | no |
| `data/maps/<id>/level.json` | Compiled `LevelDef` + metadata; `_doc` says "generated, do not edit" | `npm run mapgen` | yes (shared `data/load.ts`) |

The labs keep their hand-written `LevelDef`s in `data/maps/<lab>/layout.json`; a compiled map's `layout.json` is an
authoring file and its `level.json` is the `LevelDef`.

Units: plan positions are **u in the frame named on the record**; everything vertical and every size is **metres**
and carries an `M` suffix (`headM`, `widthM`) or `Y` (`eaveY`).

### 4.2 Authoring schema

The schema is `tools/mapgen/schema.ts` (zod); its comments say what each field means. Notes on the shape:
- A wall **line** carries its spans. HARD is implicit: the parts of the line no span covers.
- An exterior opening is a `DOOR` or `WINDOW` span; "exterior" is computed (one side of the span is outside the
  footprint), so it can't drift.
- Rooms are seeds plus splits; the generator flood-fills the real shapes from the walls (section 5.5), so room
  shapes follow wall edits and every room is checked to be closed.
- Every record has `_unverified` (its placeholder fields) and may say where it came from (`src`, `research`, a
  `note`).

### 4.3 Compiled level: additions to `levelSchema` (game/shared/src/data/schemas.ts)

All optional with defaults, so the lab levels stay valid unchanged:

```ts
spawns: z.array(z.strictObject({ id, pos: vec3, yawDeg: num,
  side: z.enum(["attack", "defense"]).optional(),   // absent: a lab spawn
  group: z.string().optional() })).min(1),           // "A_RIVERBANK", "SITE_MILL", ...
solids[]: + bodiesOnly: z.boolean().default(false),  // invisible: stops bodies, not bullets or sight (HELPER group); never a panel
solids[]: + drawOnly: z.boolean().default(false),    // drawn, no collider (a rail's bar); never a panel
solids[].panel: + region: z.string().optional(),     // a soft floor's tiles, one surface for bullets (amendment 14)
plan: z.strictObject({ mPerU: num, frames: z.record(z.string(), affine) }).optional(),  // the HUD's plan u
bounds: z.strictObject({ min: vec3, max: vec3, killY: num }).optional(),
storeys: z.array(z.strictObject({ id: z.string(), floorY: num, ceilingY: num })).default([]),
rooms: z.array(z.strictObject({ id: z.string(), callout: z.string(), storey: z.string(),
  rects: z.array(z.tuple([num, num, num, num])) /* x0, z0, x1, z1 in metres */, anchor: vec3 })).default([]),
sites: z.array(z.strictObject({ id: z.string(), name: z.string(), rooms: z.array(z.string()).min(1),
  bombs: z.array(z.strictObject({ id: z.string(), pos: vec3, room: z.string() })),
  plantMarginM: num })).default([]),
cameras: z.array(z.strictObject({ id: z.string(), pos: vec3, yawDeg: num, pitchDeg: num,
  room: z.string().optional() })).default([]),
ingredients: z.array(z.strictObject({ id: z.string(), kind: z.enum(["fire_extinguisher", "gas_pipe"]),
  pos: vec3, yawDeg: num, room: z.string().optional() })).default([]),
zones: z.array(z.strictObject({ id: z.string(),
  kind: z.enum(["building", "out_of_bounds", "spawn_peek", "rappel", "drone_hole"]),
  boxes: z.array(z.strictObject({ center: vec3, size: vec3, yawDeg: num.default(0) })),
  normal: vec3.optional(), faces: z.string().optional() })).default([]),  // faces: an attackers' spawn group (D-105)
```

What is deliberately **not** added: tilted plain solids (pitch/roll). Pitched roofs and slopes compile to the
existing ramps (0.2 m slabs at any yaw and angle); gable ends are stepped boxes.

Cross-file checks in `crossFileProblems` (data/load.ts): a `bodiesOnly` solid has no panel; spawn sides are valid;
every room, site room and bomb room id resolves; `bounds.killY` is below every solid.

### 4.4 How the authoring layout maps to LevelDef

| Authoring | Compiled |
|---|---|
| Wall line, HARD parts | `solids` HARD_WALL boxes (one per segment between spans) |
| SOFT span | `solids` REINFORCEABLE with `panel.sections` (construction `reinforceable_wall`) |
| DOOR span | header box (HARD_WALL) + BARRICADE panel (`barricade_door`, `panel.empty` per rule P10) |
| WINDOW span | sill box (HARD_WALL, `vaultable`) + header + WINDOW panel (glass) + BARRICADE panel (`barricade_window`) |
| OPEN span | header box (or nothing) |
| DRONE_HOLE span | the HARD segment split around a floor-level slot; a `drone_hole` zone |
| rail / half wall | visible top bar (`drawOnly`) + `bodiesOnly` blocker below; half wall = box at its height |
| Storey footprint minus holes | HARD_FLOOR slab boxes (greedy rectangles) |
| Soft floor region | SOFT_FLOOR panels, tiles of at most `tileMaxM` |
| Hatch | HATCH panel, slab-thick |
| Stair run | `stairs` flights + landing boxes + rails and guards + slab holes |
| Ladder | `ladders` + well rail gap |
| Roof | flat: HARD_FLOOR slab; gable/mono: `ramps` + stepped gable boxes (+ a ceiling slab) |
| Outside item, prop | boxes, `ramps`, `stairs` |
| Playable rect | 4 `bodiesOnly` walls + `bounds` (killY) |
| Rooms, sites, cameras, ingredients, zones, spawns | the metadata arrays of section 4.3 |

---

## 5. The generator (`tools/mapgen`)

### 5.1 Inputs, outputs, commands

- **Inputs**: `layout.json` and its parts; `data/destruction.json` (panel constructions) and `data/movement.json`
  (stand height, max step, max slope, vault limits) for the checks.
- **Outputs**: `data/maps/<id>/level.json` (committed); `builds/mapgen/report.json` and `report.md` with a printed
  summary (counts, budgets, warnings, frames with an alternative, the UNVERIFIED list); the plans,
  `builds/mapgen/plans/<id>/<storey>.svg` and `index.html` (section 9.1). `builds/` is gitignored.
- **Commands** (root package.json; an esbuild bundle then node, the netsim pattern):
  - `npm run mapgen [-- --map <id>]`: regenerate `level.json`, the report and the plans (Millrace by default);
    `-- --check` fails if `level.json` would change.
  - `npm run mapgen -- --where x,y,floor`: a position in a floor's own u (or world u, or metres with `,m`) in every
    frame, and the room there (amendment 17).
- **Code layout**: `schema.ts`, `frames.ts`, `walls.ts`, `grid.ts` (rasterising, flood fill, greedy rectangles),
  `enclosure.ts`, `rooms.ts`, `floors.ts`, `stairs.ts`, `roofs.ts`, `exterior.ts`, `markers.ts`, `zones.ts`,
  `diagnostics.ts` (frame alternatives), `compile.ts`, `checks.ts`, `report.ts`, `plans.ts`, `walkgraph.ts`,
  `format.ts`, `run.ts`; tests in `tools/mapgen/*.test.ts` (in vitest's `include`); `tools/mapgen/tsconfig.json`
  (in `typecheck`).

### 5.2 Pipeline

Ordering matters because covers and holes feed the walls and slabs:

1. **Load and validate** every part (zod); resolve defaults; refuse unknown ids.
2. **Frames**: map every plan coordinate to world u with its record's frame (`use: main | alt`).
3. **Rooms and footprints** (section 5.5).
4. **Holes and covers**: stair holes (from the runs), wells, hatches, soft floors; the cover map per storey (the
   next storey's footprint plus the roofs) gives every wall its top.
5. **Walls** (section 5.3) and **openings** (section 5.4).
6. **Slabs, soft floors, hatches** (section 5.6).
7. **Stairs and ladders** (5.7). 8. **Roofs** (5.8). 9. **Outside, boundary, props** (5.9, 5.10).
10. **Metadata** (5.11). 11. **Metres, snap, ids, order** (5.12).
12. **Validate**: `levelSchema`, the generator's checks (section 9.2). Errors fail the run; warnings go to the
    report.
13. **Emit** `level.json` (one solid per line, stable order, so diffs read well), the report, the plans.

### 5.3 Walls: splitting at openings and soft sections

For each wall line (axis, centreline `at`, extent `span`, thickness from `weight`: int and ext from
`defaults.wallM`, or the explicit metres of a pillar), with its spans sorted:

- **HARD segments** fill every gap between spans: one box from the floor to the wall top.
- **SOFT span**: one REINFORCEABLE panel solid over exactly the span, full wall height, 0.2 m thick, centred on the
  line, `panel.sections` from the record.
- **Junctions**: a wall end within `junctionU` of a perpendicular line meets it; the line that is there across the
  end's band wins over a nearer one that stops short of it. A **hard end** runs on to the line's far face where the
  line is HARD across its whole band, so corners close; where the line has a panel there it stops at the panel's
  face, and at a frame it stops at the line's near face. An end that **isn't hard** (a panel or a frame) touches
  nothing hard: it stops at the outer face of whatever the line has across its band. At an **L corner** (each end
  meets the other) the two are settled together: a hard end covers the corner square at the other end's own
  thickness; where neither end is hard, a hard post fills the square exactly between where they stopped. Panels are
  centred on the snap grid line nearest their line's centre, so their faces stay on the grid. Result: hard boxes may
  touch panels but never overlap them (checked to 1 cm; the engine's raycast takes the nearer of Rapier geometry and
  panel cells).
- **Wall top** = the cover above, sampled along the segment; a segment splits where the cover changes (where a line
  goes from exterior to interior; sampled every 25 cm on both faces, a probe that meets a perpendicular wall takes
  its neighbours' class, and the change falls on that wall's centreline):
  - interior walls stop under the cover (the slab bottom, a flat roof's bottom, or a pitched roof's eave);
  - exterior walls run up to the next floor level (through the slab band) or to the roof eave, and the slab is cut
    back to their inner face, so no HARD_WALL face is coplanar with a HARD_FLOOR face (different colours flicker);
  - walls under a gable end get stepped fill up to the roof line (section 5.8);
  - `topY` overrides (rails, half walls, tall rooms).
- **Rails** (`kind: rail`): a 0.05 m visible bar at `rail.hM` on a `bodiesOnly` blocker, so bodies stop and bullets
  and sight pass. **Half walls**: a hard box at `topY`.
- **Drone holes**: the HARD segment over the hole becomes left, right and above pieces around a `droneHole.wM x hM`
  slot at floor level; a `drone_hole` zone records it.

### 5.4 Openings: barricades and glass

| Span | Geometry | Panels | Start state |
|---|---|---|---|
| DOOR | header from `headM` (2.1 m) to the wall top; nothing below | BARRICADE `barricade_door`, opening width x `headM`, 0.1 m, centred in the wall | exterior: standing; interior: `empty` (a frame for defenders) |
| WINDOW | sill from the floor to `sillM` (0.9 m, `vaultable`), header from `headM` (2.1 m) up | WINDOW (glass, 0.02 m) toward the outside, BARRICADE `barricade_window` (0.06 m) toward the inside, side by side inside the wall thickness, never overlapping | exterior: barricade standing, glass whole |
| OPEN | header from `open.headM` (2.1 m) up, or none when `headM: null` | none | — |

- All exterior doors and windows start barricaded (research/destruction.md §9); frames are indestructible, so
  headers and sills are HARD. Every window gets a pane (P11); one flag (`defaults.window.glass`) turns them off.
- The barricade and glass are panels whose boxes sit inside the opening; the header and sill touch them at `headM`
  and `sillM` exactly.

### 5.5 Rooms and footprints

- **Footprint** of a storey: its compiled boxes rasterised at 5 cm (all openings closed), flooded from the playable
  rectangle's border; whatever the flood can't reach is inside (rooms plus wall cells).
- **Rooms**: flood from each `rooms[].seed` inside the footprint, bounded by walls, closed openings and `splits`
  (virtual walls for open-plan boundaries). Errors: a seed outside the footprint, two seeds in one region (needs a
  split), a room that reaches the outside. Warning: an unnamed region. Each room becomes greedy rectangles in metres
  (doorway slivers under 0.3 m left out, unless a spot 0.3 m clear of the room's edge is in them) plus an `anchor`:
  the free floor cell nearest its centroid, 0.45 m clear of walls and stairs (a crowded room gets its clearest spot,
  with a warning). Wells are no room.

### 5.6 Floors: slabs, stairwell holes, soft floors, hatches

- Each storey's floor is one 5 cm raster: the footprint (inside and under its boxes) less what the storey below runs
  up into the slab, then wells (holes), hatches, soft floors and hard slab (greedy rectangles). An `underground`
  storey's walls all stop under the slab, so it needs no cutback.
- **The ground** is the first storey above ground's floor over the whole play area, less its hatches and
  stairwells; a soft floor on the ground storey is tiled as on any other and cut out of the ground (D-200).
- **Stairwell holes**: each stair run cuts its hole from the slab above; the check is headroom, not shape: every
  step needs `headroomM` of clearance under any slab, else the run errors. A run also needs a way on and off: a strip
  a body wide from its first riser 0.9 m out, and from its top 0.9 m on, clear from the floor to head height (D-184).
- **Soft floors**: each region's rectangles' floor inside the storey's walls, less hatches and wells, split into an
  even grid of tiles no larger than `tileMaxM` (4 m), sized in whole joist spacings (0.4 m) where possible. Each tile
  is a SOFT_FLOOR panel, slab-thick (0.2 m), so ceilings and floors stay flush; tile ids `SF-2F-02#r1c2`. Slivers
  under 0.3 m stay hard unless part of one is 0.3 m clear of the area's edge. A soft floor meets the walls of the
  room below too (D-090): where a wall above overhangs the wall below, or the rectangle stops short of it, its tiles
  grow across the strip (up to 0.15 m) where it runs a whole edge, and a strip along part of an edge gets a thin tile
  of its own from 0.5 m long. `hard: true` builds a region as slab.
- **Hatches**: the largest rectangle of the authored square inside the top room (amendment 6), a slab-thick HATCH
  panel reinforced from the top.
- **Floor shifts** (`floorShifts`): a room's floor lower (`dropM`, a step down; its slab, soft floor and hatch hang
  that much under the storey's, the floor under its walls staying put) or higher (`raiseM`, a ledge a body mantles
  onto: solid from the storey's slab up and vaultable).

### 5.7 Stairs and ladders

- Stairs are authored as **runs** inside a shaft rectangle: `straight` (one flight, optional mid landing),
  `switchback` (two half-width flights and a landing at the far end, `turn` left or right) or `quarter` (L-shaped).
  The generator derives the flights for the `stairs` schema (start, yaw, steps, rise, run, width), landing boxes,
  rails on hole edges that are neither walls nor the arrival edge, and the hole in the upper slab.
- Steps: `steps = ceil(rise / riserMaxM)` (16 for 3.2 m at 0.2 m; under `maxStepHeight` 0.35), tread `treadM`.
- Flights are open (`solid: false`): each step is a box two risers deep, so a run can stand over the one below it,
  and the builder's invisible ramp through the nosings is what a body walks on. A straight run fills its shaft; a
  switchback's flights are half the shaft less a 0.1 m wall between them, with 0.3 m treads and the rest for the
  landing; a quarter-turn's flights are `widthM` wide and its landing is the square in the far corner. The slab above
  loses each run's hole on the 5 cm grid, from the first tread where the line through the nosings, a body's reach on,
  comes within `headroomM` of the slab, through to the arrival; a hole never runs under the storey's own walls. Rails
  go round each hole where the floor beyond is open; beside a flight or landing whose walkers' heads reach the slab
  and with no wall of the storey below alongside, a guard (a blocker for bodies up to the slab, a handrail drawn over
  each tread). Room anchors keep clear of holes, flights, landings and guards.
- Checks: each run's foot sits on its lower floor and its top within 2 cm of its upper floor; headroom; a way on and
  off.
- **Ladders**: a `ladders` entry between two storeys, facing the wall it stands on; a well's rail leaves a gap at its
  top. A body grabs it from the top with F (D-092). Millrace has none.

### 5.8 Roofs

- A record covers its storey's footprint inside its rectangles, less the storeys above and the roofs listed before
  it, so the rectangles say which roof is which and the footprint does the snapping (a gable or mono rectangle is
  drawn on the walls' outer faces: its slopes start there). Every eave is at a storey level, where the walls stop.
- `flat`: a HARD_FLOOR slab with its top at `eaveY`. `gable`: two ramps (0.2 m slabs) from the eave lines up to the
  ridge at `pitchDeg` (walkable under `maxSlopeDeg` 46); `mono`: one ramp from the `low` side up. Pitched roofs
  overhang 0.15 m at the eaves and at ends left open, and have a ceiling slab at the eave unless `ceiling: false`
  (amendment 5). Gable-end steps are 0.2 m, no taller than the ramp is thick, so a step's corner stays inside it. An
  end that a storey above or a roof as high closes gets none.
- The build fails if a room has nothing over it (a slab, soft floor, hatch, well or roof), an eave rests on nothing
  at its height (±5 cm), or a slope rises over the sill of a window or door beside it.

### 5.9 Outside and boundary

- Hand-authored in `exterior.json`: items placed in world u (or a floor's frame) as boxes, fences, rails, ramps and
  steps. A box, fence or rail's rectangle is its footprint before it turns `yawDeg` about its middle; a ramp or a
  flight of steps faces a quarter. `baseY` is where it stands (default the floor of its level, the ground outside).
  Stair runs to and from `EXT` (the ground's level) are ordinary runs (Millrace's race steps). The build fails if an
  item stands in a room.
- **Boundary**: four `bodiesOnly` walls (`boundary.hM`) around `playable`, and `bounds.killY` `killDepthM` under the
  lowest floor for anything that still falls. The plans leave the outside's items off.

### 5.10 Props

- The major cover props, the furniture that shapes movement or sight, are PROP boxes in `exterior.json` with a class
  (data/destruction.json `props.classes`: wood and soft let bullets through, metal stops them; amendment 3). Small
  clutter and exact shapes are the art pass's (render/furniture.ts draws each prop fitted to its box).
- The build fails if one stands in a doorway (any door or open passage, 0.7 m either side of the wall), on a hatch or
  on the stairs, or goes into another solid at its height.

### 5.11 Spawns, sites, cameras, ingredients, zones, rappel faces

- **Spawns**: spawn 0 is a lab spawn. Attackers: groups of five, the insertion point and four more, facing the
  building's middle (P27). Defenders: five per site, three in its A room and two in its B, facing between its bombs
  (P28). Sim.create refuses a spawn whose body would overlap anything.
- **Sites**: two rooms each, a bomb at each marker on its room's floor (P30); plant zone = the site rooms minus
  `plantMarginM`; an optional Quick Match pre-setup (walls and hatches reinforced, rotation holes; match/DESIGN.md
  §9), each panel checked to be a reinforceable wall beside its room, or a hatch (reinforced from the top).
- **Cameras** (P31) and **ingredients** (P32): `markers.ts` puts each on the wall face nearest its marker that faces
  into its room (an outside camera on a building face looking out, or on a post looking at the building). A marker
  inside on no room's floor, or outside but inside the building, is reported.
- **Zones** (`zones.ts`, P33, P34): the building zone of a storey is its inside and every wall joined to it, from its
  floor to the next storey's (a doorway counts as inside, a roof as outside); spawn peeks and run-outs are boxes
  `zone.depthM` deep inside or outside the doors and windows each names, with `faces`; a rappel face is a thin box
  outside each stretch of wall face with the outside in front, from its storey's floor to the wall's top (a roof edge
  is the top of the face under it), none on the walls of `rappel.refuse`. The lab draws every marker and, with O, the
  zones.

### 5.12 Ids, order, snapping, determinism

- Ids are stable and readable: walls `2F.w003#0` (segment), `#head`, `#sill`; soft walls `SW-2F-01`; openings
  `2F.o012` with `.bar` and `.glass`; slabs `2F.slab#7`; tiles `SF-2F-02#r1c2`; hatches `H1`; stairs
  `ST_MAIN:1F>2F#0` (the builder appends `_step<i>`); roofs `RF_MILL` (`.ceiling#i`, `.N`/`.S` ramps); props by their
  authored ids.
- Order: storey, then kind (walls, openings, slabs, soft floors, hatches, props), then id. Panel indexes follow solid
  order (D-064's stable ids from the map generator); any layout change changes the data hash, so stale clients are
  refused (D-042).
- Snapping to 5 cm happens once, after metres; checks run on the snapped output.
- The generator is pure: same inputs, byte-identical output (tested).

### 5.13 Committed output

`level.json` is generated and committed, not built at build time: the shared loader imports JSON at bundle time
(Vite and esbuild); a layout change and its effect on the compiled level are reviewed in the same diff; and
`npm run mapgen -- --check` and the freshness test keep them in step.

---

## 6. Authoring the wall geometry and checking its accuracy

Millrace is drawn by hand in world u: each wall line, its spans, the rooms' seeds and the rest, edited in the layout
files. The report (`builds/mapgen/report.md`: counts, budgets, frames with an alternative, warnings, the UNVERIFIED
list by file and record) and the plans (section 9.1) show what was built; the tests (section 9.2) hold every room
closed, every way in and every marker where the rules say; Ulo's walk in the lab is the check against intent
(section 9.4).

---

## 7. Engine changes (as built in Phase 5)

| Id | Change |
|---|---|
| E1 | `refreshBroadPhase` calls the physics pipeline directly instead of `world.step()` (Rapier 0.21's wrapper walks every collider across the WASM boundary on each step); Rapier stays pinned at 0.21.0, with a determinism test |
| E2 | Soft floors are tiles of at most 4 x 4 m (6,400 cells per layer); a test fails any panel over that |
| E3 | Optional LevelDef fields (section 4.3) and `bodiesOnly` in the builder; cross-file checks |
| E4 | Static boxes drawn as one `InstancedMesh` per surface material and storey bin; panels stay separate meshes; the stats overlay; the shadow camera fitted to the level |
| E5 | A lab page for a compiled map (`?map=<id>`), offline (worker room) and online |
| E7 | Kill plane: a body below `bounds.killY` dies (matches) or respawns at spawn 0 (lab rooms) |
| E8 | Ladder grab from the top (D-023b, D-092) |
| E9 | Greybox viewing: palette toggle, room callouts for the camera's storey, markers drawn, the HUD's room, storey and position in u, storey hide-above and a top-down plan view, Go to by storey |
| E10 | Free camera (lab tool, D-098, D-101) |
| — | The walk graph (`walkgraph.ts`, tooling): see section 9.2 check 10 |

Deferred, with reasons (DECISIONS): chunked panel drawing and explosive cuts across tile seams (the rest of E6 was
done in M6, D-108); panel-state compression (a late join after heavy destruction sends tens of KB).

---

## 8. Performance budgets

| Metric | Target (PLAN §18 / §8.2) | Gate |
|---|---|---|
| Server Room.step, 10 clients walking and firing | ≤ 5 ms at 10 players incl. 9 bots | `npm run bench:bots`, netsim |
| Bandwidth per client | ≤ 64 kbps typical, ≤ 256 kbps peak | netsim, no desyncs |
| FPS, 1080p High | ≥ 120 average, ≥ 90 1% lows | the stats overlay on Ulo's PC |
| Panel redraw | ≤ 1 ms per frame | every panel ≤ 6,400 cells per layer (test); `npm run bench:map` |
| Load | ≤ 30 s first, ≤ 10 s repeat | level.json ≤ 500 KB (test) |
| Geometry counts | — | ≤ 2,500 static colliders, ≤ 300 panels, ≤ 600k cells per layer (test) |

**Millrace** (the report, `npm run bench:map`, `npm run bench:bots`): 858 solids, 193 panels, 402k cells per layer,
the largest panel 5,760 cells, level.json 120 KB; Sim.create p50 11 ms; a bullet's panel op p95 0.08 ms; the client's
redraw after a hole p95 under 0.52 ms on every panel kind; nine bots' room step p99 3.5 ms over a round.

---

## 9. Validation

### 9.1 The plans

`npm run mapgen` writes `builds/mapgen/plans/<id>/<storey>.svg`: the compiled level cut 1.2 m above each storey's
floor, coloured by surface, openings as gaps, rails dashed, soft floors and hatches, stairs (darker as they climb, an
arrow up each flight) and ladders, room callouts, soft-wall and hatch ids; drawn in that storey's frame and framed to
what it draws; and `index.html`, every storey's plan with a box per layer. Our geometry only, never tracked
(amendment 4). In game, the plan view (E9) shows any storey from above with the storeys over it hidden.

### 9.2 Structural tests (vitest; `tools/mapgen/*.test.ts`)

`mapgen.test.ts` holds the generator's own rules on small layouts and levels built in the test (the level checks,
the plan grid, the junction rule, the walk graph's joins, the report); `millrace.test.ts` holds each check on
Millrace's compiled level; `hygiene.test.ts` holds amendment 4. The checks, by number (code cites them):

1. **Freshness**: regenerating from the layout reproduces the committed `level.json` exactly; the generator is
   byte-deterministic.
2. **Schemas**: layout parts parse; `level.json` passes `levelSchema` and `crossFileProblems`; every `_unverified`
   path exists.
3. **Contents**: each storey's rooms have callouts, rectangles and anchors; sites, cameras, ingredients, defenders
   and props stand where sections 5.10–5.11 say; the generator reports a marker or prop it can't place.
4. **No overlaps**: no static box intersects any panel's box by more than 1 cm; no two panels intersect; lint: no two
   visible boxes of different surfaces share a coplanar overlapping face (the stairs' steps included).
5. **Panels and budgets**: every panel ≤ 6,400 cells per layer; static colliders ≤ 2,500; panels ≤ 300; cells ≤ 600k
   per layer; level.json ≤ 500 KB; the report lists them.
6. **Spawns**: Sim.create passes; a ray down from each spawn meets the ground; attackers outside the building zone and
   inside the playable rectangle, facing the building; defenders inside their site rooms.
7. **Rooms**: the compiled walls keep every room closed at 1.2 m and 0.1 m (amendment 9), and the shell between the
   interior and exterior wall tops; a room's rectangles hold every spot of it a body fits; its anchor holds a body.
8. **Cover**: every room has a slab, soft floor, hatch, well or roof above it; a soft floor meets the walls under it,
   and a bullet goes up through it into one surface.
9. **Stacking**: every hatch lies inside its top and bottom rooms, holds a body until it breaks and drops it into the
   room below; every stair run starts and ends on its floors (2 cm) with headroom, a body walks up and down it, and up
   any flight 5 cm in from an open side.
10. **Reachability** (the walk graph, `walkgraph.ts`): every collider a body collides with is rasterised into 10 cm
    columns of solid spans; a node is a walkable top with a crouching body's height clear above it and nothing it
    can't step over within its radius and the controller's 2 cm skin; neighbours join a step apart, a floor joins a
    vaultable top a body mantles onto, each ladder joins its foot to its top, and drops aren't edges (so what it
    joins, a body walks both ways). On Millrace: from the riverbank spawn every room is reached with nothing broken,
    down the race's steps and through the Wheel Pit's arch; without those steps no room is, and a barricade joins its
    doorway's two sides only once broken; every attacker spawn is one piece with the rest of the outside; the play
    area's edge holds a body in.
11. **Lab samples**: retired with the first map (the Destruction Lab's long soft walls once matched its compiled
    panels).
12. **Determinism**: two Sims given the same panel-op log and the same inputs end with the same panels, and a body
    walks through the same hole.

### 9.3 Browser tests and performance captures

The map lab page loads offline (worker room) and online, walks, and takes a plan-view screenshot per storey (the
e2e scripts in `tools/e2e/`); `npm run bench:map` and netsim measure the server side, the stats overlay the browser.

### 9.4 Ulo's walk

Ulo walks the map in the lab (Go to by room, the free camera, the plan view); each mismatch is fixed in the layout
files and recorded in the map's DESIGN.md and PROGRESS.

---

## 10. Placeholders (all UNVERIFIED) and the update policy

The rules a map's placeholders follow, by number (code cites them); each map's values are in its layout files.

| # | Rule |
|---|---|
| P1 | One scale: metres = `units.mPerU` × world u |
| P2 | Frames: each storey's affine to world u, with an `alt` one field away; a hatch's landing reported under both (amendment 2) |
| P3 | Storey floor heights (`storeys`) |
| P4 | Hard slab 0.2 m; soft floors and hatches as thick as the slab |
| P5 | Wall height = floor to the cover above; exterior walls to the next floor or the eave |
| P6 | Wall thickness `defaults.wallM` (int, ext); odd lines keep their own metres |
| P7 | Door: the span's width, head 2.1 m; headers hard |
| P8 | Window sill 0.9 m (vaultable once open), head 2.1 m |
| P9 | An exterior opening is a door if it opens at floor level onto ground, a balcony or a walkable roof, else a window, unless its span says |
| P10 | Exterior doors and windows start barricaded; interior doors start as empty frames; every doorway barricadable |
| P11 | Every window has glass (0.02 m) outside the barricade |
| P12 | OPEN passages get a header at 2.1 m |
| P13 | Drone hole = a 0.4 x 0.2 m slot at floor level |
| P14 | Soft-wall sections as authored on the span (1–3) |
| P15 | Soft walls are REINFORCEABLE |
| P16 | Soft-floor tiles ≤ `tileMaxM` in 0.4 m joist spacings; `alt` extents one flag away (amendment 7) |
| P17 | Hatches: the authored square, clipped to the top room (amendment 6) |
| P18 | Everything not authored as a panel is HARD |
| P19 | Stairs: risers ≤ `riserMaxM` (0.2 m), tread `treadM`, headroom `headroomM`, as authored per run |
| P20 | Ladders as authored, 0.6 m wide |
| P21 | A well over a lower room is an open drop, with rails where authored |
| P22 | Rails: lines authored as rails get a 1.0 m rail (bodies blocked, bullets pass) |
| P23 | A room's height is its storey's unless its roof has no ceiling (amendment 5) |
| P24 | Roofs: flat at the next storey level; pitched ramps at `pitchDeg` over a ceiling at the eave (unless `ceiling: false`); gable ends stepped 0.2 m; walkable if ≤ 46 degrees |
| P25 | The outside: the ground flat at the ground storey's level; fences and low walls 1.0 m (vaultable); boundary walls 4 m |
| P26 | Kill plane `killDepthM` (30 m) below the lowest floor; lab rooms respawn |
| P27 | Attacker spawns: 5 per insertion point, facing the building's middle |
| P28 | Defender spawns: 5 per site, three in its A room and two in its B, clear of walls and props, facing between its bombs |
| P29 | Lab spawn 0 outside the building |
| P30 | Bombs at their markers, on the room's floor; plant zone = site rooms minus `plantMarginM` (0.5 m) |
| P31 | Cameras on the wall face nearest the marker (within `camera.reachM`) that faces into its room, `belowCeilingM` under the ceiling, yaw to the room's middle, pitch `pitchDeg`; outside, on the nearest building face looking out, or on a `postM` post facing the building |
| P32 | Extinguishers at 1.0 m, gas pipes at 1.2 m on the nearest wall face of their room (within `ingredient.reachM`), facing out |
| P33 | Rappel allowed on every exterior wall face and roof edge above ground, less `rappel.refuse` (D-105) |
| P34 | Spawn-peek and out-of-bounds zones `zone.depthM` deep at the openings named; building = each storey's inside and the walls joined to it, floor to next floor (D-105) |
| P35 | Props: classes wood, soft (bullets pass) and metal (they stop); vaultable as authored (up to a vault's height) |
| P36 | A span kept on the plan but built as wall (`hard: true`; `false` builds the opening) |
| P37 | Fall damage as data/movement.json has it: a drop from a 2F roof (6.2 m) is lethal |

**Update policy**
1. Every placeholder lives in the layout files: global ones in `units`, `frames`, `storeys`, `defaults`; per-item
   ones in the record's `_unverified`; the root `_unverified` lists JSON paths (checked by a test).
2. Open questions about them go in `research/OPEN_QUESTIONS.md`.
3. When Ulo answers: edit the value; drop it from `_unverified`; add a `_sources` entry ("Ulo 2026-10-20");
   `npm run mapgen`; the tests must pass; tell Ulo what changed and what to look at on the next walk.
4. Global parameters (scale, storeys, frames) are single values: changing one regenerates everything, and the
   report's before and after counts go in the PR.

Millrace is ours: its values are design choices, not readings of a source, so none is UNVERIFIED.

---

## 11. Milestones

Phase 5 built the generator in eight milestones, each ending playable: M1 the first storey walkable, offline and
online; M2 all storeys stacked (rooms, floors, soft floors, hatches, drone holes, the kill plane, the plan view); M3
stairs, the ladder and the walk graph; M4 roofs, the outside and the free camera; M5 sites, defender spawns, cameras,
ingredients, zones and props; M6 the validation suite, the report and the real level's performance; M7 Ulo's walks
and fixes to sign-off; M8 rappel (D-114, D-116, D-117; its tests now play in the Rappel Lab, data/maps/rappel_lab).
PROGRESS records each; DECISIONS D-070 to D-117 record what was decided. Project Redmond compiled Millrace with it
(R2: D-183, D-184, D-200) and took the first map and its tracing out (R4).

---

## 12. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Hard geometry overlapping panels makes soft walls bulletproof | silent wrong tagging | the junction rule plus the overlap test |
| A staircase without room to step on or off | bots and bodies stuck | the generator refuses it (D-184) |
| A storey's floor or roof missing over a room | open to the sky, or a floor to fall through | the cover check fails the build |
| Third-party images reaching the public repo | IP and policy breach | the repo-hygiene test (amendment 4) |
| E1 depends on Rapier 0.21 wrapper internals | breaks on upgrade | version pinned, determinism test |
| Late join after heavy destruction (tens of KB of panel state) | short snapshot hitch | known; compression deferred |
| Placeholder fall damage makes 2F-roof drops lethal | surprise deaths on roofs | P37; OPEN_QUESTIONS |

---

## 13. DECISIONS entries

Phase 5's decisions are D-070 to D-117 (the authored-then-compiled layout, per-floor frames, the broad-phase refresh,
soft-floor tiles, instancing, the LevelDef metadata, openings, stairs as parametric runs, rappel). Later: D-183
(Project Redmond: Millrace), D-184 (stairs need room to step on and off), D-200 (soft floors on the ground storey;
the general checks on Millrace).

---

## 14. Questions for Ulo

Open questions about a map go in `research/OPEN_QUESTIONS.md`; Millrace's are in its DESIGN.md.

---

## Appendix A: files

`tools/mapgen/*.ts` and tests, `tools/mapgen/tsconfig.json`; per map `data/maps/<id>/{layout.json,
walls_<floor>.json, exterior.json, level.json}`; the shared engine's `level/builder.ts`, `data/schemas.ts`,
`data/load.ts`; the client's `render/labScene.ts`, `render/panelView.ts`, `labs/common/lab.ts`; root `package.json`
(`mapgen`, `typecheck`, `test`); `vitest.config.ts` (includes `tools/mapgen/**/*.test.ts`).

## Appendix B: counts (Millrace, from the report)

| Item | Count |
|---|---|
| Solids (static boxes, panels, props, bars) | 858 |
| Panels | 193 |
| Soft walls | 33 |
| Openings: exterior / interior | 43 / 50 |
| Zones | 40 |
| Spawns | 36 |
| Cells per layer | 402,110 (the largest panel 5,760) |
| level.json | 120 KB |
