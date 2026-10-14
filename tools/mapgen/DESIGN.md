# Phase 5 design: Oregon greybox

Status: adopted 2026-10-13, with the review amendments below. Scope: PLAN.md §17 Phase 5, "layout.json + generator +
full greybox with correct surface tagging, sites, spawns, cams"; done when "Ulo walks it and signs off on layout
accuracy".

Read with: PLAN.md §8, §9, §17, §18, §20; DECISIONS D-013, D-023(b), D-024, D-037, D-062..D-069 and the Phase 5
entries; research/oregon/*. The three investigations (engine, data, geometry) that this design rests on ran in a
scratch folder that is not in the repo; their scripts that matter now live in `tools/mapgen/extract/` and their
numbers in `data/maps/oregon/extracted.json`. Section 1 still names their scratch folders for the record.

Rules this design keeps: never invent Siege facts (every placeholder is marked UNVERIFIED with its rule, section 10);
no third-party image ever enters the public repo (derived coordinates only); the project owner is called Ulo.

## Review amendments (adopted; where the body below disagrees, these win)

An independent review judged the design "sound with fixes". All fixes are adopted:

1. **Exterior opening kinds (P9).** Each exterior span's DOOR or WINDOW kind is seeded from the research guesses
   (layout_notes §6, map_features §11) with a `_sources` note. The Dorms "Big Window" and the Attic window onto
   the Meeting roof are WINDOWs (sourced). The P9 rule applies only where research gives no guess. A completeness
   check lists every compiled kind that differs from the research guess. ("Only the Main Entrance is known" was
   wrong: 11 of the 28 exterior rows guess window.)
2. **Hatch stacking test (M2).** Not "0.3 m to spare" (no frame passes it): the hatch centre lies inside the named
   room on both floors; no overlap with hard walls after a clip of at most 0.5 u; a clear opening of at least
   1.2 m; clearance under 0.3 m is a warning. Per-hatch B-side offsets (`src: "hand"` with a note) are the
   sanctioned fix. The B default frame comes from a joint fit (one perspective model with the 2F fixed point,
   H1–H3 and the three stairwells); both options stay in the report.
3. **Props and bullets (M5).** D-069(5) schedules prop penetration for Oregon's props, and research says bullets
   pass most props (PLAN §8.1). In M5, PROP solids get their own collision group that bullet queries skip, and a
   prop counts like a panel for the ×0.7 multiplier and the two-surface limit, with no holes; per-class data
   ("stops bullets", UNVERIFIED) with unit and determinism tests. If it slips: a DECISIONS entry naming the
   phase, an OPEN_QUESTIONS line, and Ulo is told.
4. **Image hygiene (M1).** Every image output of the extraction goes to gitignored folders
   (`tools/mapgen/extract/{img,out,work}/`, `research/oregon/refs/web/`, `builds/`). `tools/mapgen/hygiene.test.ts`
   (CI) and the opt-in `.githooks/pre-commit` read what git has staged and reject any image file (SVG included),
   any archive or container that can carry one (zip, 7z, rar, gzip, PDF, binary glTF), and any file with image
   bytes anywhere in it, an image data URI or base64 image data. The only exceptions: our own plan SVGs in
   `research/oregon/compare/` (no embedded or linked picture), and `research/oregon/refs/ulo/` only after Ulo
   makes the repo private; until then that folder is gitignored except its README.
5. **Meeting roof (M4).** RF_MEETING_W is pitched (research: "pitched roof … walkable at 2F level", gabled),
   with its eave at the 2F walking level (pitch UNVERIFIED); only Dining is flat. P23 becomes: the Meeting Hall
   ceiling follows the roof underside (UNVERIFIED); the Meeting Hall height question stays.
6. **H5 clip (M2).** Clip in world coordinates against the mapped Attic wall (about x 245.1–256.1 u), not with the
   2F-native numbers in §5.6 and P17. Surfaces Q11 gets a note that the straddle is mostly a frame artifact.
7. **Official blueprint over r6calls (PLAN §0.3).** Where they conflict, the official blueprint wins unless newer
   official text supports r6calls: SF-2F-10 Trophy and SF-2F-11 White Stairs landing are soft floors, and the five
   soft-floor extents Ubisoft draws larger use Ubisoft's extents. The two openings of P36 (Game Room S window, 2F
   Small Tower S opening) are decided in M2 against the patch notes' "new exterior second-floor window". Each case
   is listed in OPEN_QUESTIONS with the alternative one flag away.
8. **Client performance gate (M1, M6).** The stats overlay shows FPS, frame time, 1% lows and draw calls; the pass
   bar for Ulo's PC is ≥ 120 FPS average and ≥ 90 FPS 1% lows at 1080p High. The shadow map renders on demand
   (redrawn when panels or the level change; players don't cast into it). M6 adds `tools/e2e/oregon-perf.mjs`
   (scripted fly-through plus a destruction storm: CPU frame time, draw calls, panel redraw p95/max, loose CI
   bound) and benchmarks 4 m tiles at p95/max (cap at 3 m if they miss).
9. **Leak check and corner posts (M1, M2).** The generator adds a hard corner post at an L corner where both
   walls stop short (each ends in a panel or an opening there). M1's test rasterises the compiled boxes 1.2 m
   above 1F (2.5 cm cells, openings closed) and flood-fills the plan's rooms (its drawn wall bands): any
   connection between rooms, or to the outside, that isn't a declared opening or drone hole fails. M2 adds
   0.1 m and the other storeys.
10. **Rappel is not dropped.** The Phase 5 end report (PLAN §20) waits for M8 (rappel). If M8 slips, a DECISIONS
    entry moves rappel to a named phase and Ulo is told.
11. **Our own plans are committed (M1+).** `npm run mapgen:compare` also writes our per-storey plan SVGs (our
    geometry only) to `research/oregon/compare/`, committed, so Ulo can open them without the downloads; the
    composites with Ubisoft or r6calls imagery stay in `builds/`. M6's done-when includes "Ulo opens the overlay
    page", with the exact commands in PROGRESS.
12. **Rails (M2/M3).** A rail is one vaultable `bodiesOnly` box up to rail height plus a render-only bar with no
    collider; railing vaultability is a placeholder.
13. **Sections visible (M1).** REINFORCEABLE panels show their section seams and a count label in the greybox
    palette, so the section counts can be checked by eye without reinforcing.
14. **Soft-floor tiles count as one surface (M2).** Tiles carry their region's id; hits.ts counts the tiles of one
    region as one surface for penetration (D-065), with a test that shoots across a seam.
15. **Lighting (M2).** A cheap greybox version now: per-storey ambient and hemisphere light from `storeys`, the
    basement darker (PLAN §9.2). The lighting mood proper is Phase 10.
16. **Floor scale reference (M1).** Textured floors stay out of instancing, and Oregon's floors get a world-space
    1 m grid in the material, which also gives Ulo a ruler.
17. **HUD positions (M2).** The HUD line shows world u and the storey's native u (the frame the wall files use);
    `npm run mapgen -- --where x,y,floor` converts.
18. **Boundary and kill plane in M1.** The four `bodiesOnly` boundary walls and the kill plane (E7) land in M1;
    the south edge sits at least 10 m behind the Street insertion point (UNVERIFIED).
19. **One question to Ulo.** The first ask is a single request: a short screen recording, kept off the repo, of a
    fixed route (each staircase up and down, standing in a doorway, the Cat Walk and ladder, the Meeting and
    Dining roofs). Everything else is batched in OPEN_QUESTIONS. Before asking, the scale estimate is tightened
    with more ground objects (vans, trailers) besides the bus.

---

## 0. Summary

Oregon is built as data. A hand-curated authoring layout (`data/maps/oregon/layout.json` plus per-floor wall
parts) describes floors, wall lines with their spans (soft sections, doors, windows, open passages, drone
holes), rooms, soft floors, hatches, stairs, the ladder, roofs, the exterior, props, spawns, sites, cameras,
ingredients and zones. A TypeScript generator (`tools/mapgen`) compiles it into an ordinary `LevelDef`
(`data/maps/oregon/level.json`, committed, checked by a freshness test) that the engine already knows how to
build: boxes, panels, stairs, ramps and ladders, plus a few optional metadata fields.

Key choices:

1. **Walls come from the r6calls floor rasters, not the research tables.** The geometry prototype vectorises the
   white wall bands almost losslessly (98.9–99.3% of wall pixels, all 32 soft walls within 0.07 u, 2F
   composition rows 99.9% agreement, 61/61 opening types right). The research tables give meaning (ids, room
   pairs, types, section counts), not positions: their B/1F opening spans are off by up to 14 u.
2. **Each floor image has its own frame.** The 2F images (r6calls and Ubisoft alike) are about 2.4% larger than
   1F; a fitted affine maps 2F into the 1F frame (rms 0.3 u). 1F is the world frame. B and 3F frames are
   UNVERIFIED and are switchable data.
3. **One scale parameter.** World metres = 0.15 x world u (ESTIMATE, ±15%), origin at u (0, 0), +X east,
   +Z south, Y up; storeys at -3.2 / 0 / 3.2 / 6.2 m (placeholders).
4. **Minimal engine changes.** The engine carries Oregon (1,495 colliders, about 150–210 panels, 360k cells
   per layer, Sim.create 16 ms). Required: a faster broad-phase refresh (E1: room step p99 7.6 -> 3.8 ms),
   instanced static drawing (E4: about 500–1,600 draws per frame -> about 40 plus panels), soft floors cut into
   tiles of at most 4 x 4 m (generator rule), a few optional LevelDef fields, a kill plane, the ladder grab from
   the top (promised in D-023b) and greybox viewing tools.
5. **The generator never lets hard geometry overlap a panel** (in the synthetic level, 57 of 64 soft-wall faces
   were bulletproof because of overlaps).
6. **The Oregon page arrives in M1** (offline and online, 1F walkable), then all storeys (M2), stairs and the
   ladder (M3), roofs and exterior (M4), objectives and props (M5), checks and walk #1 (M6), iteration to
   sign-off (M7), and rappel (M8, promised in D-024, not gating the sign-off).

---

## 1. What earlier work left, and how it is used

| Folder | Contents | Result of the rerun | Used for |
|---|---|---|---|
| `/tmp/claude-0/phase5/engine/` | Research parser (`parse_research.py`, byte-identical rerun), synthetic-Oregon generator (`synth.ts`, `common.ts`), benchmarks (`bench_build`, `bench_panels`, `bench_rapier`, `bench_state`, `bench_tick`, `bench_room`, `bench_draw`, `bench_query`, `bench_rooms_mem`), `proto_settle.ts`, `check_overlap.ts`, a vitest config with the faster physics step | All results saved in `engine/out/*.json` (no errors). Full suite with E1: 356/356 | Sizing, budgets, engine changes E1/E4/E6, the overlap rule. Point the same benches at `data/maps/oregon` in M6 |
| `/tmp/claude-0/phase5/data-inventory/` | Raster pipeline (`scripts/`, `scripts2/`), `points.json` (104 vector features in u), `out/raster_walls_u.json` (146 bands, 91 openings), `out2/oregon_inventory_derived.json` (floor frames, points in the 1F frame, stair footprints, raster room regions, verified opening corrections, roof and exterior visual reads) | Masks and bands reproduce exactly; research rows with coordinates cover only 36/52/47/0% (B/1F/2F/3F) of wall length; 18 of 49 room boxes are off by more than 3 u | Points (cameras, spawns, ingredients, objectives), room regions, roof and exterior reads, frame evidence. Its wall bands are superseded by the geometry prototype |
| `/tmp/claude-0/phase5/geometry/` | Wall extraction prototype (`svgdata.py`, `wallgeo.py`, `build.py`, `run.py`, `rerun.sh`), checks (`evaluate.py`, `bpcheck.py`, `bpglyph.py`, `xfloor.py`), outputs `out/walls_{B,1F,2F,3F}.json`, `out/walls_oregon.json`, `eval_*.json`, `opening_corrections.csv`, `summary.json` | 285 wall boxes (B 72, 1F 119, 2F 82, 3F 12), 67 openings with glyphs (38 doors, 29 exterior), 2 open passages, 11 drone holes; per-floor blueprint registrations rms 0.10–0.15 u | Seeds the wall parts of layout.json (section 6); the scripts move into `tools/mapgen/extract/` |

Images in those folders (overlays, crops) contain r6calls or Ubisoft imagery: scratch only.

---

## 2. Goals and non-goals

**Goals (Phase 5)**
- Every floor (B, 1F, 2F, 3F Cat Walk), both towers, the attic, every roof surface and the exterior between the
  attacker spawns and the building, at greybox detail (boxes, ramps, stairs, panels), coloured by surface class
  (PLAN §9.1: soft yellow, hard gray, reinforceable blue, hatch green), with a neutral palette toggle.
- Correct surface tagging: 32 soft walls (55 sections) as reinforceable panels, 12 soft-floor regions, 6
  hatches, every door and window frame with its barricade and glass, drone holes, everything else hard.
- Rooms with callouts (49 room ids), the 4 bomb-site pairs with bomb markers and plant zones, attacker spawns
  (3 groups) and defender spawns (per site), the 8 default cameras, the 9 destructible ingredients, rappel faces,
  out-of-bounds and spawn-peek zones: **as data and markers**.
- The Oregon page, offline and online, from M1; tools to walk it (callouts, storey views, free camera, stats).
- A validation suite and a comparison against the official blueprints that keeps third-party images local.
- Ladder grab from the top (D-023b) and the rappel mechanic (D-024, M8).

**Non-goals (and where they go)**
- Art pass: architecture kit, real props, lighting mood, exact roof shapes (hips, eaves), terrain: Phase 10.
- Match flow, lobby, operator select, prep/action, bomb plant/defuse, rounds, prep barriers on exits, runout
  detection: Phase 6. Phase 5 places sites, plant zones, spawn sides/groups and zones only.
- Drones, default-camera use, pings, spectating: Phase 7. Phase 5 places camera and drone-hole data only.
- Gadgets and ingredient behaviour (gas pipe fire, extinguisher clouds): Phase 8. Phase 5 places markers.
- Navmesh and bots: Phase 9 (the M3 walk graph is a head start).
- Audio: Phase 11.
- Engine fix for big panels (local settle, chunked panel drawing, cuts across tile seams), E6: before Phase 8.

---

## 3. Coordinates, frames and storeys

### 3.1 From u to metres

- **u**: the r6calls floor-image unit (layout_notes §1): origin at the top-left of each 361.244 u floor
  square, +x east, +y south; 1 px of the embedded 1024 px raster = 0.3528 u.
- **native u**: a point as drawn on one floor's image (B, 1F, 2F, 3F, roof). **world u**: the same point mapped
  into the 1F frame (section 3.2). The exterior (r6calls background layer) is taken as the 1F frame.
- **Game metres**: `X = mPerU * x_world`, `Z = mPerU * y_world`, `Y` = height. `mPerU = 0.15` (ESTIMATE, ±15%,
  from the school-bus length on the ground plane, layout_notes §1). Origin u (0, 0), so a metre value converts
  back by dividing by 0.15. The building spans about X 0..52 m, Z 6..43 m; the playable exterior guess
  x -180..500, y -70..440 u is X -27..75 m, Z -10.5..66 m.
- Yaw (engine convention, `forwardXZ`): yawDeg 0 faces north (-Z), 90 west, 180 south, -90 east. A compass
  bearing b (clockwise from north) is yawDeg = -b.
- Snapping: after mapping and scaling, box faces snap to 5 cm (the panel cell; one raster pixel is 5.3 cm at
  0.15 m/u). Thicknesses are exact multiples of 5 cm, so centred walls keep faces on the grid.

### 3.2 Per-floor frames

The floor images are not in one frame, contrary to layout_notes §1. Both investigations found it independently
(geometry: 22 + 18 stacked wall pairs; data: 9 + 9), and the roof render shows the Big Tower's west facade as one
wall drawn at rising x (240.2 on 1F, 245.9 on 2F, 255.4 on 3F): the images behave like perspective renders.
Each floor gets an affine `world = a * native + b` per axis:

| Floor | Transform to world (1F) | Status |
|---|---|---|
| 1F | identity | reference |
| 2F | x1 = (x2 - 0.02) / 1.0233, y1 = (y2 + 2.81) / 1.0261 (rms 0.29 / 0.31 u) | fitted, medium-high |
| 3F | x2 = (x3 + 9.36) / 1.0767, y2 = (y3 + 7.27) / 1.078, then 2F -> 1F | assumed: the Cat Walk walls stand on the 2F tower walls. UNVERIFIED |
| B | identity (default); alternative: x1 = -10 + 1.024 (xB + 10), y1 = 107 + 1.024 (yB - 107) | UNVERIFIED: hatch H1 lands inside B Electric only with identity; the stairwells and H3 favour the scale |
| roof | roofs are authored in world u and snapped to the walls below (section 5.8) | — |
| exterior | identity | assumed |

Without the 2F mapping, 2F walls would stand up to about 7.7 u (1.15 m) east of the walls under them and hatch
rectangles H4/H5 would straddle 2F walls. The r6calls hatch rectangles (`fh`/`ch`) are copies in the 1F frame on
both floors, and they sit on the hatch squares drawn on the 1F raster: they are world positions.

The generator applies the frames to everything per-floor: walls, openings, soft walls, soft floors, room seeds,
drone holes, cameras, ingredients, bomb markers. It reports stacking diagnostics for both B options (hatch inside
its rooms with margin, stairwell overlap), so an answer from Ulo flips one field.

The official-blueprint registrations to use (geometry prototype, rms 0.21–0.30 px, about 0.1 u) replace the
earlier 2F fit (rms 1.64 u in x) and the hatch-based fit in layout_notes §1 (rms 0.7 u):

| Floor | px_x | px_y |
|---|---|---|
| B | 2.0226 u + 359.80 | 2.0226 u + 114.74 |
| 1F | 2.0237 u + 359.33 | 2.0214 u + 114.96 |
| 2F | 2.0248 u + 359.22 | 2.0255 u + 114.34 |

(3F: weak, 4 vertical walls.) They convert the map_features §13 `bp_px` points into native u, and they place
the blueprints under our plans in the comparison page (section 9.1).

### 3.3 Storeys and heights (all UNVERIFIED placeholders, layout_notes §1)

| Storey | Walking surface Y | Notes |
|---|---|---|
| B | -3.2 m | 3.2 m storey to 1F |
| 1F and ground | 0 | ground = 1F floor level, flat |
| 2F | 3.2 m | 3.2 m storey; flat 1F roofs (Dining, Meeting W) sit at this level |
| 3F (Cat Walk) | 6.2 m | 3.0 m storey; roofs over 2F also start here |
| Tower roof | 9.2 m | top of the Cat Walk walls |

Hard slabs are 0.2 m thick; a wall runs from its floor to the cover above (3.0 m under a slab).

---

## 4. The layout format

### 4.1 Files

| File | Role | Edited by | Loaded at runtime |
|---|---|---|---|
| `data/maps/oregon/layout.json` | Authoring root (PLAN §9.1's name): units, frames, storeys, defaults, rooms, splits, soft floors, hatches, stairs, ladders, roofs, spawns, sites, cameras, ingredients, zones, rappel refusals, `_unverified`, `_sources` | hand | no |
| `data/maps/oregon/walls_{B,1F,2F,3F}.json` | Wall lines with spans, per floor, native frame; seeded once from the extraction, then curated | hand (seeded) | no |
| `data/maps/oregon/exterior.json` | Exterior items, props, the playable rectangle | hand | no |
| `data/maps/oregon/extracted.json` | Raw extraction output (derived numbers only), provenance and drift reference | `tools/mapgen/extract` | no |
| `data/maps/oregon/level.json` | Compiled `LevelDef` + metadata; `_doc` says "generated, do not edit" | `npm run mapgen` | yes (shared `data/load.ts`) |

The labs keep their hand-written `LevelDef`s in `data/maps/<id>/layout.json`; Oregon's `layout.json` is an
authoring file and its `level.json` is the `LevelDef` (a DECISIONS entry records the naming).

Units: plan positions are **u in the frame named on the record** (native floor frame for anything drawn on a
floor image, `world` for hand-authored items); everything vertical and every size is **metres** and carries an
`M` suffix (`headM`, `widthM`) or `Y` (`eaveY`).

### 4.2 Authoring schema (zod sketch; lives in `tools/mapgen/schema.ts`)

```ts
import { z } from "zod";
import { SURFACES } from "../../game/shared/src/data/schemas.js";

const num = z.number();
const U2 = z.tuple([num, num]);                    // plan point, u
const URect = z.tuple([num, num, num, num]);       // [x0, y0, x1, y1], u
const Span = z.tuple([num, num]);                  // [from, to] along a wall line, u
const Floor = z.enum(["B", "1F", "2F", "3F"]);
const Level = z.union([Floor, z.literal("EXT")]);
const Frame = z.enum(["B", "1F", "2F", "3F", "world"]);  // native image frames; world = 1F
const Dir = z.enum(["N", "E", "S", "W"]);
const Src = z.enum(["raster", "vector", "research", "blueprint", "hand", "ulo"]);
/** This record's placeholder fields (UNVERIFIED); the root `_unverified` lists JSON paths, as in every data file. */
const Uv = z.array(z.string()).default([]);

const affine = z.strictObject({ ax: num, bx: num, ay: num, by: num });  // world = a * native + b, per axis

// ---- walls_<floor>.json ------------------------------------------------------------------------------
const spanSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("SOFT"), id: z.string() /* SW-2F-01 */, at: Span,
    sections: z.number().int().min(1).max(3), construction: z.string().optional(), _unverified: Uv }),
  z.strictObject({ kind: z.literal("DOOR"), id: z.string(), at: Span,
    barricade: z.enum(["empty", "standing", "none"]).optional(), _unverified: Uv }),   // default: rule P10
  z.strictObject({ kind: z.literal("WINDOW"), id: z.string(), at: Span, sillM: num.optional(),
    headM: num.optional(), glass: z.boolean().optional(),
    barricade: z.enum(["empty", "standing", "none"]).optional(), _unverified: Uv }),
  z.strictObject({ kind: z.literal("OPEN"), id: z.string(), at: Span, headM: num.nullable().optional() }),
  z.strictObject({ kind: z.literal("DRONE_HOLE"), id: z.string(), at: Span, _unverified: Uv }),
]);

export const wallSchema = z.strictObject({
  id: z.string(),                            // "2F.w003": stable, from the extraction
  axis: z.enum(["H", "V"]),                  // H runs east-west, V north-south
  at: num,                                   // centreline: y for H, x for V (u, this part's frame)
  span: Span,                                // extent along the axis, u
  weight: z.union([z.enum(["int", "ext"]), num]),   // thickness class, or metres for odd bands (pillar)
  kind: z.enum(["wall", "rail", "half"]).default("wall"),   // the rasters can't tell rails from walls
  topY: num.optional(),                      // override: metres above this floor (default: the cover above)
  spans: z.array(spanSchema).default([]),    // sorted, non-overlapping; everything else on the line is HARD
  research: z.string().optional(),           // "surfaces §3.3 Kids' | Dorms" etc.
  src: Src, conf: z.enum(["high", "medium", "low"]).optional(), note: z.string().optional(),
  _unverified: Uv,
});
export const wallsPartSchema = z.strictObject({
  _doc: z.string(), floor: Floor, frame: Frame, walls: z.array(wallSchema),
});

// ---- exterior.json ---------------------------------------------------------------------------------------
const itemSchema = z.strictObject({
  id: z.string(), kind: z.enum(["box", "fence", "ramp", "stairs"]),
  level: Level, frame: Frame, rect: URect, yawDeg: num.default(0),
  baseY: num.optional(), hM: num, surface: z.enum(SURFACES).default("HARD_WALL"),
  vaultable: z.boolean().default(false), angleDeg: num.optional(),   // ramps
  label: z.string().optional(), src: Src, _unverified: Uv,
});
export const exteriorPartSchema = z.strictObject({
  _doc: z.string(),
  playable: URect,                                // world u; boundary blockers go around it
  items: z.array(itemSchema),                     // fences, vehicles, sheds, the construction house, the trench
  props: z.array(itemSchema),                     // interior cover props (surface PROP)
});

// ---- layout.json (root) ----------------------------------------------------------------------------------
const stairRun = z.strictObject({
  from: Level, to: Level,
  plan: z.enum(["straight", "switchback", "quarter"]),
  shaft: URect,                                   // world u: the stairwell the run fits in
  up: Dir,                                        // the way you face on the first flight going up
  turn: z.enum(["left", "right"]).optional(),     // switchback and quarter
  widthM: num.optional(), steps: z.number().int().optional(),   // default from riserMaxM
  hole: z.array(URect).optional(),                // cut in the upper slab (default: shaft minus arrival strip)
  _unverified: Uv,
});
const roofSchema = z.strictObject({
  id: z.string(), callout: z.string(), rects: z.array(URect),        // world u
  shape: z.enum(["flat", "gable", "mono"]), ridge: z.enum(["NS", "EW"]).optional(), low: Dir.optional(),
  eaveY: num, pitchDeg: num.optional(), walkable: z.boolean(), _unverified: Uv,
});

export const layoutSchema = z.strictObject({
  _doc: z.string(),
  _unverified: z.array(z.string()),
  _sources: z.record(z.string(), z.string()),     // key -> "research/oregon/surfaces.md §2" or "Ulo 2026-10-09"
  id: z.literal("oregon"), name: z.string(),
  parts: z.array(z.string()),                     // walls_B.json, ..., exterior.json
  units: z.strictObject({ mPerU: num, snapM: num }),
  frames: z.record(Frame, affine.extend({
    status: z.enum(["reference", "fitted", "assumed"]), alt: affine.optional(), use: z.enum(["main", "alt"]),
    note: z.string() })),
  storeys: z.array(z.strictObject({ id: Floor, floorY: num, slabM: num })),
  defaults: z.strictObject({
    wallM: z.strictObject({ int: num, ext: num }),
    door: z.strictObject({ headM: num, barricadeM: num }),
    window: z.strictObject({ sillM: num, headM: num, glass: z.boolean(), glassM: num, barricadeM: num }),
    open: z.strictObject({ headM: num.nullable() }),
    droneHole: z.strictObject({ wM: num, hM: num }),
    softFloor: z.strictObject({ tileMaxM: num }),
    rail: z.strictObject({ hM: num }),
    stairs: z.strictObject({ riserMaxM: num, treadM: num, headroomM: num }),
    boundary: z.strictObject({ hM: num }), killDepthM: num,
  }),
  rooms: z.array(z.strictObject({ id: z.string() /* 1F_KITCHEN */, floor: Floor, callout: z.string(),
    names: z.record(z.string(), z.string()).optional(), seed: U2, frame: Frame })),
  splits: z.array(z.strictObject({ floor: Floor, frame: Frame, axis: z.enum(["H", "V"]), at: num, span: Span,
    note: z.string() })),                         // virtual walls that separate open-plan rooms (rooms only)
  softFloors: z.array(z.strictObject({ id: z.string(), floor: Floor, frame: Frame, rects: z.array(URect),
    hard: z.boolean().default(false), tileMaxM: num.optional(), _unverified: Uv })),
  hatches: z.array(z.strictObject({ id: z.string(), frame: Frame, rect: URect, top: z.string(),
    bottom: z.string(), _unverified: Uv })),
  wells: z.array(z.strictObject({ id: z.string(), floor: Floor, frame: Frame, rects: z.array(URect),
    rail: z.boolean(), _unverified: Uv })),     // open drops (the Cat Walk centre)
  stairs: z.array(z.strictObject({ id: z.string(), names: z.array(z.string()), runs: z.array(stairRun) })),
  ladders: z.array(z.strictObject({ id: z.string(), from: Floor, to: Floor, frame: Frame, at: U2,
    facing: Dir, widthM: num, _unverified: Uv })),
  roofs: z.array(roofSchema),
  spawns: z.array(z.strictObject({ id: z.string(), side: z.enum(["attack", "defense", "lab"]),
    group: z.string(), level: Level, frame: Frame, at: U2,
    facing: z.union([num, z.enum(["building", "room"])]), _unverified: Uv })),
  sites: z.array(z.strictObject({ id: z.string(), name: z.string(), liquipedia: z.number().int(),
    rooms: z.array(z.string()).length(2),
    bombs: z.array(z.strictObject({ id: z.string(), room: z.string(), frame: Frame, at: U2 })),
    _unverified: Uv })),
  cameras: z.array(z.strictObject({ id: z.string(), level: Level, room: z.string().optional(), frame: Frame,
    at: U2, yawDeg: num.optional(), pitchDeg: num.optional(), _unverified: Uv })),
  ingredients: z.array(z.strictObject({ id: z.string(), kind: z.enum(["fire_extinguisher", "gas_pipe"]),
    level: Level, room: z.string().optional(), frame: Frame, at: U2, _unverified: Uv })),
  zones: z.array(z.strictObject({ id: z.string(), kind: z.enum(["out_of_bounds", "spawn_peek"]),
    level: Level, frame: Frame, rects: z.array(URect), faces: z.string().optional(), _unverified: Uv })),
  rappel: z.strictObject({ refuse: z.array(z.string()) }),   // wall ids where Siege refuses rappel
});
```

Notes on the shape:
- A wall **line** carries its spans. HARD is implicit (the parts of the line no span covers), matching the
  research's "composition rows" and the default-HARD rule (surfaces §1).
- An exterior opening (research `EXT_OPENING`) is a `DOOR` or `WINDOW` span; "exterior" is computed (one side of
  the span is outside the footprint), so it can't drift.
- Rooms are seeds plus splits; the generator flood-fills the real shapes from the walls (section 5.5), so room
  shapes follow wall edits and every room is checked to be closed.

### 4.3 Compiled level: additions to `levelSchema` (game/shared/src/data/schemas.ts)

All optional with defaults, so the three lab levels stay valid unchanged:

```ts
spawns: z.array(z.strictObject({ id, pos: vec3, yawDeg: num,
  side: z.enum(["attack", "defense"]).optional(),   // absent: a lab spawn (rooms still use spawn 0 today)
  group: z.string().optional() })).min(1),           // "A_JUNKYARD", "SITE_KIDS_DORMS", ...
solids[]: + bodiesOnly: z.boolean().default(false),  // invisible: stops bodies, not bullets or sight (HELPER group); never a panel
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
  normal: vec3.optional() })).default([]),
```

What is deliberately **not** added: tilted plain solids (pitch/roll). Pitched roofs and slopes compile to the
existing ramps (0.2 m slabs at any yaw and angle); gable ends are stepped boxes; Phase 10 replaces both. A
per-solid storey field is not needed either: the client bins boxes by height against `storeys`.

Cross-file checks added to `crossFileProblems` (data/load.ts): a `bodiesOnly` solid has no panel; spawn sides are
valid; every room, site room and bomb room id resolves; `bounds.killY` is below every solid. The error-message
path uses the level's real file (`level.json` for Oregon).

### 4.4 How the authoring layout maps to LevelDef

| Authoring | Compiled |
|---|---|
| Wall line, HARD parts | `solids` HARD_WALL boxes (one per segment between spans) |
| SOFT span | `solids` REINFORCEABLE with `panel.sections` (construction `reinforceable_wall`) |
| DOOR span | header box (HARD_WALL) + BARRICADE panel (`barricade_door`, `panel.empty` per rule P10) |
| WINDOW span | sill box (HARD_WALL, `vaultable`) + header + WINDOW panel (glass) + BARRICADE panel (`barricade_window`) |
| OPEN span | header box (or nothing) |
| DRONE_HOLE span | the HARD segment split around a floor-level slot; a `drone_hole` zone |
| rail / half wall | visible top bar (HARD_WALL, 0.05 m) + `bodiesOnly` blocker below; half wall = box at its height |
| Storey footprint minus holes | HARD_FLOOR slab boxes (greedy rectangles) |
| Soft floor region | SOFT_FLOOR panels, tiles of at most `tileMaxM` |
| Hatch | HATCH panel, slab-thick |
| Stair run | `stairs` flights + landing boxes + rails + slab holes |
| Ladder | `ladders` + well rail gap |
| Roof | flat: HARD_FLOOR slab; gable/mono: `ramps` + stepped gable boxes |
| Exterior item, prop | boxes, `ramps`, `stairs` |
| Playable rect | 4 `bodiesOnly` walls + `bounds` (killY) |
| Rooms, sites, cameras, ingredients, zones, spawns | the metadata arrays of section 4.3 |

---

## 5. The generator (`tools/mapgen`)

### 5.1 Inputs, outputs, commands

- **Inputs**: `layout.json` and its parts; `extracted.json` (drift check only); `data/destruction.json` (panel
  constructions), `data/movement.json` (stand height, max step, max slope, vault limits) for checks; the
  research markdown (parsed for the completeness manifest, section 9.2).
- **Outputs**: `data/maps/oregon/level.json` (committed); `builds/mapgen/report.json` and a printed summary
  (counts, budgets, warnings, the UNVERIFIED list, drift); `builds/mapgen/plans/<storey>.svg` (our geometry
  only, drawn in each floor's native frame); `builds/mapgen/compare/index.html` (section 9.1). `builds/` is
  gitignored.
- **Commands** (root package.json, the netsim pattern: esbuild bundle then node, no new runner):
  - `npm run mapgen`: regenerate `level.json` and the reports; `-- --check` fails if the file would change.
  - `npm run mapgen:refs`: download the official blueprint zip and the r6calls SVG into
    `research/oregon/refs/web/` (already gitignored), unpack the floor images (a 60-line zip reader on
    `node:zlib`, base64 PNG extraction from the SVG; no new dependency).
  - `npm run mapgen:compare`: write the plans and the comparison page and print its path.
- **Code layout**: `schema.ts`, `frames.ts`, `walls.ts`, `grid.ts` (rasterising, flood fill, greedy
  rectangles), `rooms.ts`, `floors.ts`, `stairs.ts`, `roofs.ts`, `exterior.ts`, `meta.ts`, `compile.ts`,
  `checks.ts`, `walkgraph.ts`, `research.ts` (markdown tables), `plans.ts`, `refs.ts`, `run.ts`; tests in
  `tools/mapgen/*.test.ts` (added to vitest's `include`); `tools/mapgen/tsconfig.json` (added to `typecheck`).
- **Extraction** (`tools/mapgen/extract/`, Python 3 + numpy + Pillow, dev-only, never in CI): the geometry
  prototype's `svgdata.py`, `wallgeo.py`, `build.py`, `run.py`, `xfloor.py`, `bpcheck.py`, with a README. It
  reads the images from `research/oregon/refs/web/` and writes `extracted.json` (numbers only). A one-off
  `tools/mapgen/import.ts` seeds `walls_<floor>.json` from it (refuses to overwrite without `--force`, the
  weapons-from-csv pattern of D-039).

### 5.2 Pipeline

Ordering matters because covers and holes feed the walls and slabs:

1. **Load and validate** every part (zod); resolve defaults; refuse unknown ids.
2. **Frames**: map every plan coordinate to world u with its record's frame (`use: main | alt`).
3. **Rooms and footprints** (2D only, section 5.5): rasterise each storey's wall lines at 5 cm with openings
   closed and splits added; flood from outside for the footprint; flood each room seed.
4. **Holes and covers**: stair holes (from the runs), wells, hatches, soft floors; the cover map per storey
   (the next storey's footprint plus the roofs) gives every wall its top.
5. **Walls** (section 5.3) and **openings** (section 5.4).
6. **Slabs, soft floors, hatches** (section 5.6).
7. **Stairs and ladders** (section 5.7). 8. **Roofs** (5.8). 9. **Exterior, boundary, props** (5.9, 5.10).
10. **Metadata** (5.11). 11. **Metres, snap, ids, order** (5.12).
12. **Validate**: `levelSchema`, `crossFileProblems`, the generator checks (section 9.2). Errors fail the run;
    warnings go to the report.
13. **Emit** `level.json` (one solid per line, stable order, so diffs read well), report, plans.

### 5.3 Walls: splitting at openings and soft sections

For each wall line (axis, centreline `at`, extent `span`, thickness from `weight`: int 0.2 m, ext 0.3 m, or the
explicit metres of a pillar), with its spans sorted:

- **HARD segments** fill every gap between spans: one box from the floor to the wall top.
- **SOFT span**: one REINFORCEABLE panel solid over exactly the span, full wall height, 0.2 m thick, centred on
  the line, `panel.sections` from the record (the panel splits sections equally; research gives the count
  only, surfaces §7).
- **Junctions**: a wall end within 3 px (about 1 u) of a perpendicular line extends to that line's far face
  where the line is HARD there, so corners close; it **stops at the near face** where the line is a panel or an
  opening there. A panel is never extended; it is clipped by perpendicular hard boxes. Result: hard boxes may
  touch panels but never overlap them (checked to 1 cm; engine rule, raycast takes the nearer of Rapier geometry
  and panel cells, level/raycast.ts:28–34).
- **Wall top** = the cover above, sampled along the segment; a segment splits where the cover changes:
  - interior walls stop under the cover (the slab bottom, a flat roof's bottom, or a pitched roof's eave);
  - exterior walls (one side outside the footprint) run up to the next floor level (through the slab band) or to
    the roof eave, and the slab is cut back to their inner face, so no HARD_WALL face is coplanar with a
    HARD_FLOOR face (they have different colours and would flicker);
  - walls under a gable end (perpendicular to the ridge) get stepped fill up to the roof line (section 5.8);
  - `topY` overrides (rails, half walls, tall rooms).
- **Rails** (`kind: rail`): a 0.05 m visible bar at `rail.hM` (1.0 m) on a `bodiesOnly` blocker, so bodies stop
  and bullets and sight pass (a railing is mostly open). **Half walls**: a hard box at `topY`.
- **Drone holes**: the HARD segment over the hole becomes left, right and above pieces around a
  `droneHole.wM x hM` slot at floor level; a `drone_hole` zone records it for Phase 7.

### 5.4 Openings: barricades and glass

| Span | Geometry | Panels | Start state |
|---|---|---|---|
| DOOR | header from `headM` (2.1 m) to the wall top; nothing below | BARRICADE `barricade_door`, opening width x `headM`, 0.1 m, centred in the wall | exterior: standing; interior: `empty` (a frame for defenders) |
| WINDOW | sill from the floor to `sillM` (0.9 m, `vaultable`), header from `headM` (2.1 m) up | WINDOW (glass, 0.02 m) toward the outside, BARRICADE `barricade_window` (0.06 m) toward the inside, side by side inside the wall thickness, never overlapping | exterior: barricade standing, glass whole |
| OPEN | header from `open.headM` (2.1 m) up, or none when `headM: null` | none | — |

- Research: "All exterior-facing doors and windows start barricaded" (research/destruction.md §9, [S3]); door and
  window frames are indestructible (§2, [U21]), so headers and sills are HARD. Glass behaviour and presence are
  unsourced (destruction.md §10): every window gets a pane, UNVERIFIED, one flag (`defaults.window.glass`)
  turns them all off.
- Door or window for an exterior opening is a placeholder rule (P9); only the Main Entrance (a double door) is
  known. Each such span lists `kind` in its `_unverified`, so Ulo's walk flips it with one edit.
- The barricade and glass are panels whose boxes sit inside the opening; the header and sill touch them at
  `headM` and `sillM` exactly.

### 5.5 Rooms and footprints

- **Footprint** of a storey: rasterise its walls (world frame, 5 cm cells, all openings closed), flood from the
  playable rectangle's border; whatever the flood can't reach is inside (rooms plus wall cells). The 1F footprint
  is the building boundary for zones; the ground slab covers the whole playable rectangle anyway.
- **Rooms**: flood from each `rooms[].seed` inside the footprint, bounded by walls, closed openings and `splits`
  (virtual walls for open-plan boundaries, for example Security Corridor | White Stairs | Lobby | Armory
  Stairs, which the raster shows as one region). Errors: a seed outside the footprint, two seeds in one region
  (needs a split), a room that reaches the outside (a wall or opening is missing). Warning: an unnamed region
  (the 9 small 1F porches and recesses are expected). Each room becomes greedy rectangles in metres plus an
  `anchor` (the free floor cell nearest its centroid, used by goTo and labels).
- Room ids and callouts come from layout_notes §2 (49 ids: B 13, 1F 19, 2F 16, 3F 1) with the r6calls, Mobile
  and PC names (map_features §0.4). Seeds come from the raster regions (data-inventory `room_regions_raster`).

### 5.6 Floors: slabs, stairwell holes, soft floors, hatches

- **Ground (1F level)**: one slab layer over the playable rectangle, top at Y 0, 0.2 m thick, minus the holes
  where something goes down: the B stair shafts that arrive in 1F, hatches H1–H3, the Bunker passage trench.
  It is also the B ceiling.
- **B floor**: the B footprint at Y -3.2, plus the trench floor.
- **2F slab** (Y 3.0..3.2): the 2F footprint minus stair holes (runs arriving on 2F), hatches H4–H6, soft floors
  SF-2F-01..09, and cut back to exterior-wall inner faces. Flat 1F roofs at the same level are roofs (5.8).
- **3F**: the Cat Walk ring is SF-3F-01 (soft floor); the centre is a well with a rail (P21).
- **Holes and slab rectangles**: holes are subtracted on the same 5 cm grid, then the remaining mask becomes
  greedy rectangles (the panel drawing uses the same algorithm, D-069(3)). Expect 20–60 rectangles per storey.
- **Stairwell holes**: each stair run cuts its `hole` (default: the shaft minus the strip where the top flight
  arrives) from the slab above; the check is headroom, not shape: every step needs at least `headroomM`
  (2.0 m) of clearance under any slab, else the run errors.
- **Soft floors**: each region (world u) minus wall footprints and hatches, split into rectangles, then each
  rectangle into an even grid of tiles no larger than `tileMaxM` (4 m), sized in whole joist spacings (0.4 m)
  where possible so the joist pattern doesn't jump at seams. Each tile is a SOFT_FLOOR panel, slab-thick
  (0.2 m) so ceilings and floors stay flush. Tile ids: `SF-2F-02#r1c2`.
  SF-2F-10 (Trophy) and SF-2F-11 (White Stairs landing) appear only on Ubisoft's blueprint: they are listed with
  `hard: true` and stay HARD until Ulo confirms (surfaces Q5). The five extents Ubisoft draws larger keep
  r6calls' 2026 extents.
- **Hatches**: the research rectangles (world frame), clipped to the room side (H5 only east of the Attic wall,
  surfaces §5 note), slab-thick HATCH panels with `reinforcedFrom` default (top).

### 5.7 Stairs and ladders

- Stairs are authored as **runs** inside a shaft rectangle: `straight` (one flight, optional mid landing),
  `switchback` (two half-width flights and a landing at the far end, `turn` left or right) or `quarter`
  (L-shaped). The generator derives the flights for the existing `stairs` schema (start, yaw, steps, rise, run,
  width), landing boxes (HARD_FLOOR), rails on hole edges that are neither walls nor the arrival edge, and the
  hole in the upper slab.
- Steps: `steps = ceil(rise / riserMaxM)` (16 for 3.2 m at 0.2 m; under `maxStepHeight` 0.35), tread
  `treadM` 0.3 m. The builder already adds the invisible ramp over each flight.
- Checks: each run's foot sits on its lower floor and its top within 2 cm of its upper floor; the flight
  fits the shaft without touching walls; headroom; the foot and top open onto the rooms the research names
  (layout_notes §5.1).
- Placeholders per stair (P19). One answer from Ulo ("faces north going up, 8 steps, turns left at a landing")
  is a one-line edit of `up`, `plan`, `turn`, `steps`.
- **Ladder L1**: `ladders` entry from 2F to 3F (height = the 2F->3F storey), 0.6 m wide, facing the wall it
  stands on; the well rail leaves a gap at its top. Engine change E8 lets a body grab it from the top.

### 5.8 Roofs

- Each roof surface (layout_notes §4.5 footprints, types read from the roof render) is a record in world u.
  Its rectangles snap to the outer faces of the walls below within 1 u (the roof image is another perspective
  frame, so the footprints are only good to 3–5 u).
- `flat`: a HARD_FLOOR slab at `eaveY` (top at the next storey level). Dining and Meeting W are walkable at 2F
  level (research); others UNVERIFIED.
- `gable`: two ramps (the existing 0.2 m ramp primitive) from the eave lines to the ridge at `pitchDeg` (25
  degrees placeholder, walkable under `maxSlopeDeg` 46); gable ends are stepped boxes (0.5 m steps) on the
  gable walls. Hip roofs (the Dorms/Master/Armory cross-hip) are modelled as gables, UNVERIFIED shape.
- `mono`: one ramp from the high eave to the `low` side.
- Walls under a roof run to its eave (section 5.3); a coverage check requires every 1F/2F/3F room to have a
  slab, soft floor, hatch, well or roof above it.
- No roof hatches or skylights (sources agree on hatches; skylights UNVERIFIED, surfaces Q6).

### 5.9 Exterior and boundary

- Hand-authored in `exterior.json` from the r6calls background (exact for the three spawn insertion points;
  the rest a visual read, ±5 u, data-inventory `exterior_visual`): greenhouse, north fence and shed, garden
  plots, silo, tanks, the Junkyard fence and trailers, the tipped-over bus (57–133 x 302–330 u), the south
  fence, the street, parked vehicles, sheds, the timber-frame construction house, cable reels, the east fence,
  the generator and excavator, and the sunken Bunker passage with S5 down to the B east door.
- Behaviour from research only: the Construction metal fence is vaultable; the generator is not climbable; the
  excavator is solid (map_features §7).
- **Boundary**: four `bodiesOnly` walls (4 m) around `playable` (the image extent guess x -180..500,
  y -70..440 u) and `bounds.killY` 30 m under the basement floor (-33.2 m) for anything that still falls.

### 5.10 Props

- Phase 5 places the **major cover props**, the furniture that shapes movement or sight (counters, tables,
  beds, shelves, sofas, freezers, washing machines, vehicles in the garage), as PROP boxes. The r6calls floor
  rasters are top-down renders of the game with furniture visible (beds, tables, rugs), so footprints are traced
  from them (±1 u); heights by class are placeholders (P35). PROP stays hard to bullets in Phase 5 (D-069(5)).
- Small clutter, decoration and exact shapes: Phase 10. Props must keep doors, stairs and hatches clear (the
  walk graph check).

### 5.11 Spawns, sites, cameras, ingredients, zones, rappel faces

- **Spawns**: spawn 0 is a lab spawn just outside the Main Entrance (rooms use spawn 0 today, room.ts:263, 377).
  Attackers: groups A Junkyard (-140.2, 305.9 u), B Street (287.5, 420.6), C Construction (466.4, -3.2), exact
  r6calls insertion points; 5 points within 3 m of each, facing the building (P27). Defenders: per site pair, 5
  points over the two rooms' anchors (P28). Sim.create already refuses a spawn whose capsule overlaps geometry
  (sim.ts:71).
- **Sites** (layout_notes §3, verified): 1 = 2F Kids' Dorms / 2F Dorms Main Hall; 2 = 1F Kitchen / 1F Dining
  Hall; 3 = 1F Meeting Hall / 1F Kitchen; 4 = B Laundry / B Supply. Bombs at the 8 r6calls marker centres (icon
  anchors, P30); plant zone = the site rooms minus `plantMarginM`.
- **Cameras**: the 8 r6calls points (map_features §2, §13), mounted on the nearest wall 0.3 m under the
  ceiling, yaw toward the room centre (P31). Exterior cameras on the nearest building face or a 3 m post.
- **Ingredients**: 7 fire extinguishers, 2 gas pipes at r6calls icons, on the nearest wall (P32).
- **Zones**: `building` (the union of the room rectangles, extruded per storey; roofs are outside, map_features
  §10), `out_of_bounds` and `spawn_peek` candidates (map_features §10, UNVERIFIED), `drone_hole` (12 rows),
  `rappel` faces: every exterior wall outer face above ground and every roof edge, minus `rappel.refuse`
  (empty, map_features §8 [DER]).

### 5.12 Ids, order, snapping, determinism

- Ids are stable and readable: walls `2F.w003#0` (segment), `#head`, `#sill`; soft walls `SW-2F-01`; openings
  `2F.o012` with `.bar` and `.glass`; slabs `2F.slab#7`; tiles `SF-2F-02#r1c2`; hatches `H1`; stairs `S1.1F-2F`
  (the builder appends `_step<i>`); roofs `RF_DINING`; props `P.1F.kitchen.counter1`.
- Order: storey (B, 1F, 2F, 3F, roof, exterior), then kind (walls, openings, slabs, soft floors, hatches, props),
  then id. Panel indexes follow solid order (D-064's stable ids from the map generator); any layout change
  changes the data hash, so stale clients are refused (D-042).
- Snapping to 5 cm happens once, after metres; checks run on the snapped output.
- The generator is pure: same inputs, byte-identical output (tested).

### 5.13 Committed output

`level.json` is generated and committed; it is not built at build time:
- the shared loader imports JSON at bundle time (Vite and esbuild); a prebuild step would complicate the server
  build, the Railway deploy and the dev server;
- a layout change and its effect on the compiled level are reviewed in the same diff;
- `npm run mapgen -- --check` and a vitest freshness test (regenerate in memory, deep-equal the committed file)
  keep them in step. Size estimate 150–400 KB (synthetic 119 KB).

---

## 6. Authoring the wall geometry and checking its accuracy

**Decision: automatic extraction plus curation.** The r6calls SVG has no vector geometry for hard walls: each
floor is one embedded 1024 px raster plus small overlays (`bw` soft walls with separators, `fh`/`ch` hatches,
`dt` drone holes, `losf` soft floors, icons). In the raster, every wall is a pure-white band (7 px = 2.47 u
interior, 12 px = 4.23 u exterior or structural), and every door or window is a fixed glyph inside the band.
Run-length vectorisation recovers them almost losslessly.

Steps:
1. `tools/mapgen/extract` (Python, dev-only) produces `extracted.json`: wall boxes per floor in native u, glyph
   openings (DOOR by thin band, EXT by thick band: 61/61 matched the documented type), OPEN gaps, `bw` soft
   spans with ids and section counts, `dt` drone holes, `fh`/`ch` hatches, `losf` soft floors, points (cameras,
   spawns, ingredients, objectives), confidence per box.
2. `tools/mapgen/import.ts` seeds `walls_<floor>.json` once: boxes grouped into lines, openings and soft spans
   placed on their lines, research ids and room-pair notes attached (surfaces §2, §3; layout_notes §6).
3. Curation by hand, each edit marked `src: "hand"` with a `note`: walls the rasters don't draw (railings,
   balcony edges, low walls, the B Bunker passage walls that leave the raster at x = 361 u, the Boiler pillar's
   true size), rails versus walls, door or window types, Ulo's corrections.
4. The generator compiles; the checks below run on every change.

Expected manual work: wall and opening geometry on B, 1F, 2F is 95–99% automatic (2F and 1F needed no wall
fixes in the prototype; B has 5 items to confirm); 3F has 12 boxes but an UNVERIFIED frame. Most hand work is
outside the rasters: stairs, roofs, exterior (100–200 boxes) and props.

Accuracy checks, in order of strength:
1. **Extraction self-checks** (extract): white pixels inside boxes ≥ 98.5% per floor (now 98.9–99.3%), box
   area that is white ≥ 99.9%.
2. **Research cross-checks** (CI, section 9.2): all 32 soft walls present with their ids and sections, centre
   within 0.5 u of surfaces §2; every documented opening present by room pair and type; 2F composition rows
   (surfaces §3.3) ≥ 99% sample agreement.
3. **Drift check** (CI): every wall and span in the layout matches `extracted.json` within 0.5 u unless it is
   marked `src: "hand"` with a note, so accidental edits can't slip in.
4. **Blueprint agreement** (dev-only, `extract/bpcheck.py` against our compiled plan): every non-soft wall of
   3 u or more on 1F and 2F appears on the official blueprint (true in the prototype); the score per floor is
   pasted in the PR. Caveat: r6calls and the blueprint are the same drawing (0.1 u residuals), so agreement is
   consistency with the official plan, not proof about the game.
5. **Ulo's walk**: the only check against the game itself.

Research corrections: layout_notes §6 B/1F spans and surfaces §3 B/1F coordinates are wrong in places (24 of 29
1F spans more than 2 u off, up to 14 u; the blueprint sides with the extraction in 92% of disagreeing samples on
1F; eight cases checked by eye). The extraction is the geometry source; M7 adds a note to those tables pointing
at the layout files, and fixes the two new conflicts' notes (Game Room S window, 2F Small Tower S opening:
r6calls 2026 draws an opening where Ubisoft's 2020 blueprint draws a wall; we follow r6calls).

---

## 7. Engine changes (minimal)

| Id | Change | Files | Effort | Milestone |
|---|---|---|---|---|
| E1 | `refreshBroadPhase` calls `world.physicsPipeline.step(...)` with the world's own fields instead of `world.step()` (Rapier 0.21's wrapper walks every collider handle across the WASM boundary on each step: 177 µs at 1,500 colliders against 7–20 µs for the pipeline). Use it at builder.ts:158 too. Keep `DT` (D-037). Add a determinism test (pawn hash equal to `world.step()`; a collider added or removed is seen by queries) and a comment to re-verify on any Rapier upgrade; Rapier stays pinned at 0.21.0 | `game/shared/src/physics/rapier.ts`, `game/shared/src/level/builder.ts`, test | 1–2 h | M1 |
| E2 | Soft floors become tiles of at most 4 x 4 m (6,400 cells per layer) and a data test fails any panel over that. No engine code | generator, `tools/mapgen` test | in M2 | M2 |
| E3 | Optional LevelDef fields (section 4.3) and `bodiesOnly` in the builder (`addBox` with `visible: false`, HELPER group, already supported internally); cross-file checks; per-level file path in error messages | `schemas.ts`, `builder.ts`, `data/load.ts`, tests | 0.5 d | M1 |
| E4 | Static boxes drawn as one `InstancedMesh` per surface material and storey bin (unit box scaled per instance: exact for boxes; nothing raycasts the scene); panels stay separate meshes. Stats overlay (FPS, frame time, `renderer.info` draw calls and triangles). Shadow camera fitted to the level bounds (now ±36 m around the origin, labScene.ts:62–71). Fix the empty `scene.add(...labels)` and the module-level `labels` array (labScene.ts:103, 107) | `game/client/src/render/labScene.ts`, `labs/common/lab.ts` | 1 d | M1 |
| E5 | Oregon page: `game/client/labs/oregon.html`, `src/labs/oregon.ts` (startLab, levelId `oregon`, offline `local`, goTo built from compiled rooms/sites/spawns, destruction features reused); `oregon` in `ROOM_LEVELS` (protocol.ts:123); import in `data/load.ts`; vite input; links on `index.html` (offline and online) | client, `net/protocol.ts`, `data/load.ts`, `vite.config.ts` | 0.5 d | M1 |
| E7 | Kill plane: a body below `bounds.killY` dies (matches, Phase 6) or respawns at spawn 0 (lab rooms) | `game/shared/src/sim.ts`, test | 1–2 h | M2 |
| E8 | Ladder grab from the top: standing at the top edge facing the drop, Interact attaches at the top and climbs down (D-023b). Same settled-stand rule as the bottom grab | `game/shared/src/player/movement.ts`, test | 0.5 d | M3 |
| E9 | Greybox viewing: palette toggle (surface classes per PLAN §9.1 with SOFT_FLOOR yellow, or neutral) by material colour only; room callout labels for the camera's storey; markers drawn (level `markers` are validated but never drawn today) plus debug markers for cameras (with facing), ingredients, bombs, spawns, rappel faces; HUD line with room callout, storey and position in u; storey hide-above and a top-down plan view (orthographic); pause-menu goTo grouped by storey | `labScene.ts`, `panelView.ts` (per-panel group visibility), `labs/common/lab.ts`, `labs/oregon.ts` | 1 d | M2 (plan view, labels), M5 (markers) |
| E10 | Free camera (lab tool): fly without collision, pawn left in place; "teleport here" on exit | `labs/common/lab.ts` | 2–3 h | M4 |
| — | Walk graph (tooling, not engine): column-sampled walkable nodes at 0.25 m using the Sim's Rapier queries, edges where the step is ≤ `maxStepHeight` and the capsule fits, explicit ladder edges. Used by the reachability tests; a head start for the Phase 9 navmesh | `tools/mapgen/walkgraph.ts` | 1 d | M3 |
| — | `netsim --level oregon` (the netsim room is hard-coded to movement_lab) | `tools/netsim/run.ts`, `netsim.ts` | 1 h | M6 |

**Deferred, with reasons (DECISIONS entries):**
- **E6 (before Phase 8)**: local settle (floods only next to removed cells; prototype gives identical cells and
  makes floor cuts about 40x cheaper), incremental move mask, chunked PanelView, explosive cuts that continue
  across tile seams (destruction/explosives.ts). Removes the tile seams and the storm tail (Room.step p99 7.1 ms
  with E1). 1.5–2 d.
- **Panel state compression** (column RLE or XOR with the as-built panel; protocol bump): late join after heavy
  destruction sends 70–130 KB against room.ts:77 `MAX_BUFFERED` 16 KB, a short snapshot hitch, not an error.
  Phase 6 or 12.
- **One broad-phase refresh per PanelState** (net/panels.ts): only matters without E1.
- **Tilted plain solids**: not needed (ramps cover roofs and slopes).

---

## 8. Performance budgets

| Metric | PLAN §18 / §8.2 target | Measured (synthetic Oregon, engine report) | Phase 5 gate |
|---|---|---|---|
| Server Room.step, 10 clients walking and firing | ≤ 5 ms at 10 players incl. 9 bots | stock p50 3.2 / p99 7.6 ms; with E1 0.93 / 3.8 ms; storm with E1 2.8 / 7.1 ms | E1 in M1; real level p99 ≤ 4 ms (bench, recorded in PROGRESS); storm tail tracked for E6 |
| Client message handling | — | 69 -> 3.3 ms/s with E1 | — |
| Bandwidth per client | ≤ 64 kbps typical, ≤ 256 kbps peak | 21.8 kbps; storm 63.5 kbps | netsim on Oregon, no desyncs |
| FPS, 1080p High, RTX 3070 Ti | ≥ 120 average, ≥ 90 1% lows | not measurable here (no GPU); today about 471–510 draws p50, up to 1,595, plus up to 1,769 shadow casters | E4: static draws ≤ 40 per pass; Ulo reads the stats overlay at M1, M2, M6 |
| Panel redraw | ≤ 1 ms per frame | 15 x 10 m floor 1.9–4.1 ms; 3 m tile 0.18–0.35 ms; 4 m wall 0.36 ms | every panel ≤ 6,400 cells per layer (test) |
| Panel op cost (server and clients) | — | bullet on a 15 x 10 m floor 3.0 ms p50; on a tile 0.35 ms | same cap |
| Load | ≤ 30 s first, ≤ 10 s repeat | Sim.create 16 ms; zod 3 ms; hash 7–26 ms; scene 32–40 ms; PanelView 16–24 ms | level.json ≤ 500 KB; Sim.create ≤ 50 ms in Node (test with a loose CI bound) |
| Memory | GPU ≤ 2 GB | about 8 MB per Sim; 3.6 MB RSS per server room (50 rooms about 190 MB) | note for Railway |
| Geometry counts | — | 1,495 colliders, 130–190 panels, 359k cells per layer; stress x3 4,310 / 380 / 719k fine | ≤ 2,500 static colliders, ≤ 300 panels, ≤ 600k cells per layer (test) |

Estimated real counts (Appendix B): about 1,100–1,600 static colliders, 150–210 panels.

---

## 9. Validation

### 9.1 Top-down comparison without committing third-party images

- `npm run mapgen:refs` downloads the blueprint zip and the r6calls SVG into `research/oregon/refs/web/`
  (gitignored since Phase 0) and unpacks the floor images there.
- `npm run mapgen:compare` writes `builds/mapgen/plans/<storey>.svg` (our compiled geometry cut at 1.2 m above
  each floor, coloured by surface, openings as gaps, callouts, soft-wall and hatch ids; drawn in that floor's
  native frame by inverting its transform) and `builds/mapgen/compare/index.html`: per floor, the blueprint (or
  the r6calls raster) as a background positioned with the registration of section 3.2, our SVG over it, an
  opacity slider, layer toggles (walls, panels, openings, rooms, research rectangles). Plain HTML and CSS: it
  works from `file://` and reads no pixels.
- Numeric agreement (dev-only): `tools/mapgen/extract/bpcheck.py` samples the blueprint under our wall
  centrelines and openings and prints the agreement per floor (the prototype's method).
- PLAN §9.1 step 3 put side-by-side PNGs in `research/oregon/compare/`; they contain Ubisoft imagery, so they
  stay in `builds/` and `refs/web/` (DECISIONS entry). Our own SVGs are build output and aren't committed either.
- In game: the plan view (E9) shows any storey from above with the storeys over it hidden, for a quick check
  against the blueprint on a second screen.
- **Repo hygiene test**: as amendment 4 has it (it replaced this line): nothing tracked carries an image except
  our own plan SVGs.

### 9.2 Structural tests (vitest; `tools/mapgen/*.test.ts`)

1. **Freshness**: regenerating from the layout reproduces the committed `level.json` exactly; the generator is
   byte-deterministic.
2. **Schemas**: layout parts parse; `level.json` passes `levelSchema` and `crossFileProblems`; every `_unverified`
   path exists (the data.test helper).
3. **Research completeness** (`tools/mapgen/research.ts` parses the markdown tables, so a research edit is
   noticed): 32 soft walls by id with research or Ulo section counts, REINFORCEABLE, centred within 0.5 u;
   6 hatches with their top and bottom rooms; 12 soft-floor ids (10 soft, 2 flagged hard); every opening row of
   layout_notes §6 matched by room pair and type (positions trusted on 2F only; B/1F by pair); 12 drone-hole
   rows (the copied south chevron counted once); 49 rooms; 4 sites; 8 cameras; 9 ingredients; 3 attacker
   groups; stairs S1–S5; ladder L1.
4. **No overlaps**: no static box intersects any panel's box by more than 1 cm; no two panels intersect; lint:
   no two visible boxes of different surfaces share a coplanar overlapping face.
5. **Panels and budgets**: every panel ≤ 6,400 cells per layer; static colliders ≤ 2,500; panels ≤ 300; cells
   ≤ 600k per layer; level.json ≤ 500 KB.
6. **Spawns**: Sim.create passes (capsule free, sim.ts:71); a ray down from each spawn meets a walkable surface
   within 0.1 m; attackers outside the building zone and inside the playable rectangle; defenders inside their
   site rooms.
7. **Rooms**: one region per room id; no room reaches outside; unnamed regions listed.
8. **Cover**: every room has a slab, soft floor, hatch, well or roof above it.
9. **Stacking**: every hatch lies inside its top and bottom rooms with 0.3 m to spare; every stair run starts
   and ends on its floors (2 cm) with 2.0 m headroom; the report prints both B frame options.
10. **Reachability** (walk graph, M3): every room reachable from attacker group A with barricades broken and no
    breaching; every storey connected; the playable boundary holds.
11. **Lab samples**: the Destruction Lab's five Oregon walls (destruction_lab layout `oregon_*`) match the
    compiled panels (length, height, sections), so an answer from Ulo reaches both.
12. **Determinism**: two Sims on Oregon apply the same panel-op log to identical hashes (existing pattern).

### 9.3 Browser tests and performance captures

- `tools/e2e/oregon.mjs` (added to `test:e2e`): the page loads offline (worker room) and online (two pages in one
  room), a short scripted walk through the Main Entrance, a goTo per storey with one plan-view screenshot each
  into `builds/e2e`, no console errors.
- Engine benches pointed at `data/maps/oregon` (bench_build, bench_tick, bench_room, bench_draw) and
  `npm run netsim -- --level oregon --combat --walls`: numbers recorded in PROGRESS; CI keeps loose bounds only.
- GPU numbers come from Ulo's PC through the stats overlay (PLAN §18).

### 9.4 Ulo's walk

PROGRESS gets a walk checklist (route through every room by goTo, then on foot; what to compare: walls, doors,
windows, soft walls and their sections, hatches, stairs, ladder, roofs, callouts, sites, cameras, spawns). Each
mismatch goes into `research/oregon/walkthrough.md` (what Ulo saw, where (room and u position from the HUD),
the fix, the commit). Sign-off is recorded there and in PROGRESS.

---

## 10. Placeholders (all UNVERIFIED) and the update policy

| # | Value used | Rule and source |
|---|---|---|
| P1 | 1 u = 0.15 m | ESTIMATE ±15% from the bus length (layout_notes §1); `units.mPerU` |
| P2 | Frames: 2F fitted; 3F fitted to the tower walls; B identity | 2F medium-high confidence; 3F assumes the Cat Walk walls stand on the tower walls; B evidence conflicts (alt: 2.4% scale) |
| P3 | Floors at B -3.2, 1F 0, 2F 3.2, 3F 6.2 m; tower roof 9.2 m | storeys 3.2 / 3.2 / 3.0 m (layout_notes §1) |
| P4 | Hard slab 0.2 m; soft floors and hatches as thick as the slab | flush ceilings (the lab used 0.1 m) |
| P5 | Wall height = floor to the cover above (3.0 m under a slab); exterior walls to the next floor or the eave | destruction_lab precedent (3 m walls) |
| P6 | Wall thickness 0.2 m interior and soft, 0.3 m exterior, on the raster centreline; odd bands keep their drawn size | raster weights are a drawing convention (2.47 / 4.23 u) |
| P7 | Door width = glyph span; head 2.1 m; headers hard | destruction_lab door; frames indestructible ([U21]) |
| P8 | Window sill 0.9 m (vaultable once open), head 2.1 m | destruction_lab window; windows vaultable once the barricade is gone (map_features §7) |
| P9 | Exterior opening = door if it opens at floor level onto ground, a balcony or a walkable roof, else a window | only the Main Entrance is known; 29 openings flagged |
| P10 | Exterior doors and windows start barricaded; interior doors start as empty frames; every doorway barricadable | exterior rule sourced (destruction.md §9 [S3]); exceptions UNVERIFIED (surfaces Q9) |
| P11 | Every window has glass (0.02 m) outside the barricade | no source (destruction.md §10) |
| P12 | OPEN passages get a header at 2.1 m | — |
| P13 | Drone hole = 0.4 x 0.2 m slot at floor level on the `dt` rectangle | icon sizes aren't true sizes; far side UNVERIFIED for 3 |
| P14 | Soft-wall sections from r6calls separators, except Ulo's SW-2F-01 = 3, SW-2F-02 = 2, SW-2F-04 = 2 | SW-B-01, SW-1F-06, SW-B-04, SW-B-05, SW-1F-01, SW-1F-17, SW-2F-05 may be 3 (surfaces §2, §7) |
| P15 | All 32 soft walls REINFORCEABLE; Garage south (SW-1F-17) a normal soft wall | common_setups SQ2; surfaces Q3 |
| P16 | Soft floors: r6calls extents; SF-2F-10 Trophy and SF-2F-11 White Stairs landing HARD; tiles ≤ 4 x 4 m | blueprint-only areas (surfaces Q5); tiles are an engine budget |
| P17 | Hatches: research rectangles in the 1F frame (about 1.6 m square); H5 only east of the Attic wall | surfaces §5 and Q11 |
| P18 | Everything not in surfaces §2 is HARD (Kitchen NE partition and 2F annex partition included); 1F floor HARD apart from H1–H3; roofs HARD; no skylights | surfaces §1, §4.1, §6 |
| P19 | Stairs: S1 switchback; S2 straight E–W on 1F, U-turn in B; S3 straight N–S with a landing, B foot at Laundry; S4 switchback; S5 straight flight in the Bunker passage to the B east door; exterior tower stairs up to a 2F-level landing; risers ≤ 0.2 m (16 per 3.2 m), tread 0.3 m, headroom 2.0 m | footprints only (layout_notes §5.1, map_features §5) |
| P20 | Ladder L1 at the 3F inner-square gap mapped to 2F, 0.6 m wide, 2F->3F storey tall | ±12 u position uncertainty (data inventory) |
| P21 | Cat Walk centre = open well over the 2F tower room, 1.0 m railing on the inner-square bands, gap at the ladder | surfaces §4.1 ring + central opening |
| P22 | Rails: bands listed as rails get a 1.0 m rail (bodies blocked, bullets pass); every other band is a full wall | the rasters can't tell rails from walls |
| P23 | No double-height rooms (Meeting Hall 3.0 m under the Attic and the flat Meeting W roof) | layout_notes §1 says "appears single-storey under a pitched roof": ambiguous |
| P24 | Roofs: flat ones at the next storey level; pitched ones two ramps at 25 degrees from the eaves; hips as gables; gable ends stepped 0.5 m; walkable if ≤ 46 degrees | walkability sourced only for Dining and Meeting W (layout_notes §4.5) |
| P25 | Exterior: ground flat at 1F level; playable x -180..500, y -70..440 u; fences 1.2 m, vehicles 2–3 m, sheds 3 m, the construction house 6 m; boundary walls 4 m | imagery only; image extent |
| P26 | Kill plane 30 m below the basement floor (killY -33.2 m); lab rooms respawn | safety |
| P27 | Attacker spawns: 5 points within 3 m of each insertion point, facing the building | insertion points exact (r6calls), spreads unknown |
| P28 | Defender spawns: 5 per site pair over the two site rooms | none in any source |
| P29 | Lab spawn 0 just outside the Main Entrance | lab convenience, not a Siege fact |
| P30 | Bomb objects at the r6calls marker centres; plant zone = site rooms minus 0.5 m | icon anchors; Kitchen shared or not (common_setups SQ3); "no-drop zone" size unknown (round_flow §5) |
| P31 | Cameras on the nearest wall 0.3 m under the ceiling, yaw to the room centre, pitch -20 degrees | positions r6calls only; facing [DER]/[PRE] for 4, unknown for CAM4 and CAM7 |
| P32 | Extinguishers at 1.0 m, gas pipes at 1.2 m on the nearest wall | r6calls icons only |
| P33 | Rappel allowed on every exterior wall face and roof edge | map_features §8 [DER] |
| P34 | Spawn-peek and out-of-bounds zones: map_features §10 candidates; building = union of the rooms | map_features §10 |
| P35 | Props: traced footprints ±1 u; heights table 0.75, counter 0.9, bed 0.6, bunk bed 1.6, shelf 2.0, sofa 0.8, washer 0.9, car 1.5 m; vaultable if ≤ 1.1 m except bunk beds | bunk beds not vaultable (map_features §7, pre-rework patch) |
| P36 | Game Room S window and 2F Small Tower S opening exist (r6calls 2026) | Ubisoft 2020 draws walls there |
| P37 | Fall damage unchanged (safe 3 m, lethal 6 m): a drop from a 2F roof (6.2 m) is lethal | data/movement.json placeholders; OPEN_QUESTIONS core Q8 |

**Update policy**
1. Every placeholder lives in the layout files: global ones in `units`, `frames`, `storeys`, `defaults`; per-item
   ones in the record's `_unverified`; the root `_unverified` lists JSON paths (the convention of every data file,
   checked by a test).
2. Each one is listed in `research/OPEN_QUESTIONS.md` under "Placeholders added while building Phase 5" with its
   rule.
3. When Ulo answers: edit the value; drop it from `_unverified`; add a `_sources` entry ("Ulo 2026-10-20");
   `npm run mapgen`; the tests must pass; mark the question answered in OPEN_QUESTIONS (`> Ulo: ...`); fix the
   research file it came from (for example surfaces §2 "(sections: Ulo)"); log it in `walkthrough.md`; one
   commit per batch of answers; tell Ulo what changed and what to look at on the next walk.
4. Global parameters (scale, storeys, frames) are single values: changing one regenerates everything, and the
   mapgen report's before and after counts go in the PR.
5. A mismatch Ulo can describe but not measure gets a better placeholder and a note, and stays UNVERIFIED.

---

## 11. Milestones (each ends playable; PROGRESS gets "how to test")

### M1: Oregon 1F walkable, offline and online
- **Deliverables**: E1, E3, E4 (instancing, stats overlay, shadow fit, label fixes), E5 (Oregon page offline and
  online, ROOM_LEVELS, loader, vite, index links). `tools/mapgen` v1: schemas, frames, metres, wall lines to hard
  segments, soft panels and openings (barricades, glass), the ground slab, lab spawn 0 and the three attacker
  insertion spawns; `level.json` committed; `npm run mapgen`, `mapgen:refs`, `mapgen:compare` (1F plan and
  overlay). `tools/mapgen/extract` and `extracted.json`; wall parts seeded for all four floors (only 1F emitted).
- **Done when**: Ulo opens Oregon offline and online and walks 1F: every 1F wall, door and window where the
  blueprint has it, the 17 1F soft walls blue with their sections, exterior openings barricaded; the stats overlay
  shows the frame rate on Ulo's PC.
- **Tests**: E1 determinism (pawn hash against `world.step()`, collider add and remove seen by queries); schema
  tests (new optional fields, labs unchanged); freshness; no hard box overlaps a panel; spawns; 1F research
  completeness (17 soft walls, 1F openings by pair and type); `tools/e2e/oregon.mjs` (offline load and walk,
  online two pages); full suite and typecheck.

### M2: all storeys stacked
- **Deliverables**: B, 2F, 3F walls through their frames; rooms by seeds and splits (49 callouts); footprints;
  slabs and ceilings with holes; soft floors in tiles (E2); hatches H1–H6; drone holes; kill plane (E7); E9 part 1
  (storey bins, hide-above, plan view, palette toggle, callout labels, HUD line, goTo by storey and room); plans
  and overlays for every floor.
- **Done when**: Ulo can go to any room on B, 1F, 2F and the Cat Walk from the menu, sees its callout, shoots
  through the 2F soft floors from 1F, and drops through each hatch into the room the research names.
- **Tests**: rooms (one region per id, no leaks); hatch stacking; soft floors (10 ids, tile cap); full research
  completeness (32 soft walls with sections, 6 hatches, 12 drone-hole rows); cover; budgets; Destruction Lab
  samples equal the compiled panels; kill plane; frame diagnostics printed for both B options.

### M3: stairs and the ladder
- **Deliverables**: S1–S5 and the exterior tower stairs as parametric runs, landings, rails, slab holes; L1 and
  the ladder grab from the top (E8); the walk graph.
- **Done when**: Ulo walks from B to 2F on each staircase and climbs the ladder to the Cat Walk and back down
  from the top.
- **Tests**: stair runs (feet and tops on their floors within 2 cm, headroom, step height ≤ 0.35 m, foot and top
  rooms as researched); ladder-from-top unit test; reachability (every room from attacker group A without
  breaching; every storey connected).

### M4: roofs and the exterior
- **Deliverables**: roofs (flat slabs, gable and mono ramps, stepped gable ends), the balcony, walls raised to
  eaves; exterior ground, the Bunker passage, fences, vehicles, sheds, the construction house and the rest of
  the exterior blockout; boundary blockers and bounds; attacker spawn groups A, B, C (5 each); free camera (E10).
- **Done when**: Ulo spawns at each attacker spawn, walks to the building, gets onto the Dining roof from Small
  Tower 2F, and flies over every roof.
- **Tests**: cover (every room has a ceiling or roof); roofs sit on the walls (eaves within 5 cm of wall tops);
  attacker spawns outside the building and inside the playable rectangle; the walk graph can't leave the
  playable rectangle; e2e screenshot per attacker spawn.

### M5: sites, defender spawns, cameras, ingredients, zones, props
- **Deliverables**: the 4 site pairs (rooms, bomb markers, plant zones), defender spawn groups, 8 camera markers
  with facing, 9 ingredient markers, zones (building, out-of-bounds and spawn-peek candidates, drone holes),
  rappel faces with a debug view, the major cover props, goTo by site; E9 part 2 (markers).
- **Done when**: Ulo picks each site from the menu and checks its rooms, bomb markers, cameras and ingredients
  against the game.
- **Tests**: sites match layout_notes §3; bombs inside their rooms; cameras inside rooms and against a wall;
  defender spawns inside site rooms on the floor; counts (8 cameras, 9 ingredients); props keep doors, stairs and
  hatches reachable (walk graph) and never overlap panels.

### M6: walk-ready, walk #1
- **Deliverables**: the whole validation suite; the mapgen report (counts, budgets, drift, UNVERIFIED list);
  bpcheck and the overlay page; real-level performance (benches, `netsim --level oregon`); PROGRESS "how to
  test" and the walk checklist; Phase 5 placeholders in OPEN_QUESTIONS; `research/oregon/walkthrough.md`.
- **Done when**: `npm run check` passes; Ulo has walked the greybox once and the mismatch list is logged.
- **Tests**: everything above; Room.step p99 ≤ 4 ms on Oregon with 10 walking and firing clients; netsim with no
  desyncs and no panel differences; e2e.

### M7: iterate to sign-off (the Phase 5 done-when)
- **Deliverables**: Ulo's answers and mismatch fixes through the layout files; research notes corrected
  (layout_notes §6 and surfaces §3 B/1F coordinates point to the layout files; section counts); DECISIONS and
  OPEN_QUESTIONS kept current; one walk per round.
- **Done when**: Ulo signs off on layout accuracy (PLAN §17), recorded in walkthrough.md and PROGRESS.
- **Tests**: all gates on every round; freshness proves level.json matches the layout.

### M8: rappel v1 (D-024; does not gate the sign-off)
- **Deliverables**: a short design first (research/core_mechanics.md §6: attackers only, hold to start, needs a
  vertical foothold, starts inverted from roof edges); attach on rappel faces and roof edges, climb, descend and
  move sideways, detach at the top and bottom, enter through open or broken windows, shoot and lean on the rope,
  predicted and networked like the ladder. Rappel breach and going around corners (Y10S2) go in if they fit;
  otherwise they move to Phase 8 with a DECISIONS entry.
- **Done when**: Ulo rappels down the Big Tower and into a Dorms window online at +100 ms.
- **Tests**: movement unit tests (attach rules, faces, window entry, inverted start), client and server
  determinism, netsim with rappel.

Rough effort (agent days): M1 2–3, M2 2, M3 1.5–2, M4 2–3, M5 2, M6 1–1.5, M7 0.5–1 per round, M8 2–4.

---

## 12. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Floor frames for B and 3F are UNVERIFIED (B evidence conflicts; 3F fits only at x1.077) | hatches in walls, stairs offset by up to about 1 m | frames are data with an alternative; stacking checks print both; Q1 |
| Stairs and heights are placeholders | the first thing Ulo will notice | parametric runs, one edit per answer; Q1 |
| Scale ±15% | every distance and room feels wrong together | one parameter; budgets re-checked automatically; Q2 |
| Client FPS can't be measured in the cloud | Ulo's first impression | E4 in M1, stats overlay, Ulo measures at M1, M2, M6 |
| Destruction storm tail (p99 7.1 ms with E1) and bots later | over the 5 ms tick | panel cap now; E6 before Phase 8 |
| Tile seams clip explosive holes in soft floors | visible artifact in the lab tools | documented; E6 removes it |
| Hard geometry overlapping panels makes soft walls bulletproof (57 of 64 faces in the synthetic level) | silent wrong tagging | junction rule plus the overlap test |
| Roofs, exterior and props are image-only and large | effort and scope creep, late sign-off | structure first (M1–M3), exterior and props time-boxed, Q3 |
| Research B/1F coordinates are wrong (up to 14 u) | wrong doors if used | extraction is the geometry source; docs corrected in M7 |
| Third-party images reaching the public repo | IP and policy breach | refs only in gitignored folders; repo-hygiene test; plans are our own geometry |
| E1 depends on Rapier 0.21 wrapper internals | breaks on upgrade | version pinned, determinism test, comment |
| Late join after heavy destruction (70–130 KB of panel state, 16 KB send buffer) | short snapshot hitch | known; compression deferred |
| r6calls and Ubisoft are one drawing lineage | agreement is not proof | Ulo's walk is the acceptance test |
| Placeholder fall damage makes 2F-roof drops lethal | surprise deaths on roofs | flagged (P37); OPEN_QUESTIONS core Q8 |
| Python extraction in a TS repo | tooling rot | dev-only, derived JSON committed, drift test |

---

## 13. DECISIONS.md entries to add (D-070 onward)

1. **Oregon is authored, then compiled**: `data/maps/oregon/layout.json` (PLAN §9.1's name) plus per-floor wall
   parts and `exterior.json` are the authoring data; `tools/mapgen` compiles them to `data/maps/oregon/level.json`
   (a `LevelDef`), committed and kept fresh by a test; the labs keep hand-written `layout.json` levels. Render
   meshes are built at runtime from the level (no mesh files) and plans are SVG, not PNG.
2. **Walls come from the r6calls floor rasters**: automatic extraction (Python, dev-only, `tools/mapgen/extract`)
   seeds the wall parts; research tables give ids, types, room pairs and section counts; B/1F research spans are
   superseded.
3. **Per-floor frames**: the floor images are not in one frame (2F about 2.4% larger); 1F is the world frame;
   2F fitted; 3F fitted to the tower; B identity, UNVERIFIED; metres = 0.15 x u from u (0, 0), +X east, +Z south.
4. **Broad-phase refresh calls the physics pipeline directly** (E1); Rapier pinned at 0.21.0.
5. **Soft floors are tiles of at most 4 x 4 m** and any panel is at most 6,400 cells per layer; explosive cuts stop
   at seams until E6 (before Phase 8).
6. **Static level geometry is instanced** per surface and storey; panels stay separate meshes.
7. **LevelDef metadata**: optional spawn sides and groups, `bodiesOnly`, bounds with a kill plane, storeys, rooms,
   sites, cameras, ingredients, zones; no tilted solids (roofs are ramps, gables stepped boxes until Phase 10).
8. **Openings**: exterior doors and windows start barricaded (research [S3]), interior doors start empty, windows
   get glass (UNVERIFIED), headers and sills are hard (frames are indestructible).
9. **Ladder from the top** lands in Phase 5 (D-023b); **rappel**: faces in the data now, the mechanic is Phase 5's
   last milestone and doesn't gate the layout sign-off (D-024).
10. **Comparison images stay local** (`research/oregon/refs/web/`, `builds/`); PLAN §9.1's
    `research/oregon/compare/` is not used because the composites contain Ubisoft imagery; a test keeps image
    files out of the repo.
11. **Props**: Phase 5 places major cover props traced from the floor rasters as hard PROP boxes; clutter and
    shapes go to Phase 10.
12. **Stairs are parametric runs** (straight, switchback, quarter) inside shafts, all UNVERIFIED until Ulo walks
    them.
13. **Deferred**: E6 local settle and chunked panel drawing (before Phase 8); panel-state compression (Phase 6 or
    12).

---

## 14. Questions for Ulo (most important first)

1. **Stairs and heights** (blocks the sign-off; drives the whole vertical layout): in a Custom Game, walk each
   staircase once: Tower (B to 1F to 2F), White/Freezer (B to 1F to 2F), Main/Armory/Laundry (B to 1F to 2F),
   Small Tower (1F to 2F), the outside Bunker stairs and the outside stairs east of the Big Tower. For each
   flight: which way do you face going up, about how many steps, does it turn at a landing, and does the
   stairwell keep the same walls from floor to floor? And is Meeting Hall about two floors tall inside?
2. **Size of the map** (one number scales everything): stand in a normal single interior doorway. Is it about as
   wide as two-thirds of an operator's height (about 1.2 m), or clearly narrower or wider? If the game shows a
   distance when you ping, the length of the 1F Lobby hallway in metres would be even better.
3. **Tower top and roofs**: at the top of the Big Tower, is the Cat Walk a ring around an open drop to the 2F
   tower room, and where does the ladder come up? Which roofs can you stand on (Dining, Meeting, Attic, Kids',
   Dorms/Master/Armory, Small Tower, Big Tower), and is each flat or sloped?

The other open points keep their placeholders and Ulo's walk corrects them: door or window for each exterior
opening (layout_notes Q3), the play-area edge, which props to add, rappel limits, soft-floor tile seams.

---

## Appendix A: files added or changed

New: `tools/mapgen/*.ts` and tests, `tools/mapgen/tsconfig.json`, `tools/mapgen/extract/` (Python, README),
`data/maps/oregon/{layout.json, walls_B.json, walls_1F.json, walls_2F.json, walls_3F.json, exterior.json,
extracted.json, level.json}`, `game/client/labs/oregon.html`, `game/client/src/labs/oregon.ts`,
`tools/e2e/oregon.mjs`, `research/oregon/walkthrough.md`.

Changed: `game/shared/src/physics/rapier.ts`, `level/builder.ts`, `data/schemas.ts`, `data/load.ts`,
`net/protocol.ts`, `sim.ts`, `player/movement.ts`; `game/client/src/render/labScene.ts`, `render/panelView.ts`,
`labs/common/lab.ts`, `vite.config.ts`, `index.html`; `vitest.config.ts` (include `tools/mapgen/**/*.test.ts`);
root `package.json` (scripts `mapgen`, `mapgen:refs`, `mapgen:compare`, `test:e2e`, `typecheck`);
`tools/netsim/run.ts`, `netsim.ts`; DECISIONS, PROGRESS, OPEN_QUESTIONS; research/oregon notes (M7).

## Appendix B: counts (estimate)

| Item | Count |
|---|---|
| Wall boxes from the extraction | 285 (B 72, 1F 119, 2F 82, 3F 12) |
| Hard wall segments after splitting at openings, soft spans and drone holes | about 380–420 |
| Headers and sills | about 80–100 |
| Slabs (4 storeys, ground, flat roofs) | about 100–150 |
| Stair steps, landings, rails | about 150–200 |
| Roof ramps and gable steps | about 40–80 |
| Exterior items | about 100–200 |
| Props | about 100–300 |
| Static colliders total | about 1,100–1,600 (synthetic 1,495) |
| Panels: soft walls / hatches / soft-floor tiles / barricades / glass | 32 / 6 / 35–75 / 67 (38 doors + 29 exterior) / 12–28: about 150–210 |
| Cells per layer | about 360k (about 3 MB per Sim) |
| level.json | 150–400 KB |
