// The authoring format of a compiled map (tools/mapgen/DESIGN.md §4): data/maps/<id>/layout.json plus its
// parts (walls_<floor>.json, exterior.json). Plan positions are u in the frame the record names; heights
// and sizes are metres (an M or Y suffix). Nothing here is loaded at runtime: tools/mapgen compiles it to
// data/maps/<id>/level.json, an ordinary LevelDef.
import { z } from "zod";
import { SURFACES } from "../../game/shared/src/data/schemas.js";

const num = z.number();
const U2 = z.tuple([num, num]);
/** [x0, y0, x1, y1], u. */
const URect = z.tuple([num, num, num, num]);
/** [from, to] along a wall line, u. */
const Span = z.tuple([num, num]).refine(([a, b]) => b > a, "a span runs from low to high");
export const FLOOR_IDS = ["B", "1F", "2F", "3F"] as const;
const Floor = z.enum(FLOOR_IDS);
const Level = z.union([Floor, z.literal("EXT")]);
/** Native image frames (each floor image is its own perspective render) and world (= the 1F frame). */
export const FRAME_IDS = ["B", "1F", "2F", "3F", "world"] as const;
const Frame = z.enum(FRAME_IDS);
const Dir = z.enum(["N", "E", "S", "W"]);
/** Where a record came from: the raster extraction, the SVG vectors, research tables, the blueprint, by hand, or Ulo. */
const Src = z.enum(["raster", "vector", "research", "blueprint", "hand", "ulo"]);
/** This record's placeholder fields (UNVERIFIED), by name. */
const Uv = z.array(z.string()).default([]);

const common = {
  id: z.string(),
  at: Span,
  /** The research row it answers to ("layout_notes §6.2: 1F_DINING | 1F_KITCHEN"). */
  research: z.string().optional(),
  /** Extraction ids it was seeded from (data/maps/<id>/extracted.json): the drift test follows them. */
  from: z.array(z.string()).optional(),
  src: Src.optional(),
  note: z.string().optional(),
  _unverified: Uv,
};
const barricade = z.enum(["standing", "empty", "none"]);

export const spanSchema = z.discriminatedUnion("kind", [
  /** A destructible, reinforceable wall section run (surfaces.md §2): one panel with `sections` reinforcements. */
  z.strictObject({ kind: z.literal("SOFT"), ...common, sections: z.number().int().min(1).max(3), construction: z.string().optional() }),
  /** A doorway: a barricade frame (standing outside, empty inside, unless `barricade` says otherwise). */
  z.strictObject({ kind: z.literal("DOOR"), ...common, headM: num.optional(), barricade: barricade.optional() }),
  /** A window: sill (vault over once open), glass outside, barricade inside. */
  z.strictObject({
    kind: z.literal("WINDOW"),
    ...common,
    sillM: num.optional(),
    headM: num.optional(),
    glass: z.boolean().optional(),
    barricade: barricade.optional(),
  }),
  /** A passage with no barricade: a header at `headM`, or nothing above it (null). */
  z.strictObject({ kind: z.literal("OPEN"), ...common, headM: num.nullable().optional() }),
  /** A drone hole: a slot at floor level centred on the span. */
  z.strictObject({ kind: z.literal("DRONE_HOLE"), ...common }),
]);
export type SpanDef = z.infer<typeof spanSchema>;

export const wallSchema = z.strictObject({
  /** Stable, from the extraction ("1F.w003"). */
  id: z.string(),
  /** H runs east–west (along x), V north–south (along y). */
  axis: z.enum(["H", "V"]),
  /** Centreline: y for H, x for V (u, this part's frame). */
  at: num,
  /** Extent along the axis, u. */
  span: Span,
  /** Thickness class (defaults.wallM), or metres for an odd band (a pillar). */
  weight: z.union([z.enum(["int", "ext"]), num]),
  /** The rasters can't tell rails or half walls from walls: `rail` and `half` are set by hand. */
  kind: z.enum(["wall", "rail", "half"]).default("wall"),
  /** Height above this floor, metres, overriding the cover above (rails, half walls). */
  topM: num.optional(),
  /** Sorted, not overlapping; every part of the line no span covers is HARD. */
  spans: z.array(spanSchema).default([]),
  research: z.string().optional(),
  from: z.array(z.string()).optional(),
  src: Src,
  conf: z.enum(["high", "medium", "low"]).optional(),
  note: z.string().optional(),
  _unverified: Uv,
});
export type WallDef = z.infer<typeof wallSchema>;

export const wallsPartSchema = z.strictObject({
  _doc: z.string(),
  floor: Floor,
  frame: Frame,
  walls: z.array(wallSchema),
  /** Extracted items (extracted.json ids) deliberately left out, each with why: the drift test checks the rest are used. */
  dropped: z.array(z.strictObject({ from: z.string(), note: z.string() })).default([]),
});
export type WallsPart = z.infer<typeof wallsPartSchema>;

const itemSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(["box", "fence", "ramp", "stairs"]),
  level: Level,
  frame: Frame,
  rect: URect,
  yawDeg: num.default(0),
  baseY: num.optional(),
  hM: num,
  surface: z.enum(SURFACES).default("HARD_WALL"),
  vaultable: z.boolean().default(false),
  angleDeg: num.optional(),
  label: z.string().optional(),
  src: Src,
  note: z.string().optional(),
  _unverified: Uv,
});

export const exteriorPartSchema = z.strictObject({
  _doc: z.string(),
  /** The play area (world u): boundary blockers stand around it, and the ground slab covers it. */
  playable: URect,
  items: z.array(itemSchema).default([]),
  props: z.array(itemSchema).default([]),
  _unverified: Uv,
});
export type ExteriorPart = z.infer<typeof exteriorPartSchema>;

/** world = a * native + b, per axis. */
const affine = z.strictObject({ ax: num, bx: num, ay: num, by: num });
export type Affine = z.infer<typeof affine>;

const stairRun = z.strictObject({
  from: Level,
  to: Level,
  plan: z.enum(["straight", "switchback", "quarter"]),
  shaft: URect,
  up: Dir,
  turn: z.enum(["left", "right"]).optional(),
  widthM: num.optional(),
  steps: z.number().int().optional(),
  hole: z.array(URect).optional(),
  _unverified: Uv,
});

const roofSchema = z.strictObject({
  id: z.string(),
  callout: z.string(),
  rects: z.array(URect),
  shape: z.enum(["flat", "gable", "mono"]),
  ridge: z.enum(["NS", "EW"]).optional(),
  low: Dir.optional(),
  eaveY: num,
  pitchDeg: num.optional(),
  walkable: z.boolean(),
  _unverified: Uv,
});

export const layoutSchema = z.strictObject({
  _doc: z.string(),
  /** Dot-paths of the root's placeholder values; records list theirs in their own `_unverified`. */
  _unverified: z.array(z.string()),
  /** Where answers came from: key -> "research/oregon/surfaces.md §2" or "Ulo 2026-10-09". */
  _sources: z.record(z.string(), z.string()),
  id: z.string(),
  name: z.string(),
  /** The storeys compiled so far (milestones add them in order); the rest are authored and checked only. */
  emit: z.array(Floor).min(1),
  parts: z.array(z.string()),
  units: z.strictObject({ mPerU: num.positive(), snapM: num.positive() }),
  frames: z.record(
    Frame,
    affine.extend({
      status: z.enum(["reference", "fitted", "assumed"]),
      alt: affine.optional(),
      use: z.enum(["main", "alt"]),
      note: z.string(),
    }),
  ),
  storeys: z.array(z.strictObject({ id: Floor, floorY: num, slabM: num.positive() })),
  defaults: z.strictObject({
    wallM: z.strictObject({ int: num.positive(), ext: num.positive() }),
    /** Wall height above its floor where nothing is built over it yet (M1: no slabs above). */
    wallHeightM: num.positive(),
    door: z.strictObject({ headM: num.positive(), barricadeM: num.positive() }),
    window: z.strictObject({ sillM: num.positive(), headM: num.positive(), glass: z.boolean(), glassM: num.positive(), barricadeM: num.positive() }),
    open: z.strictObject({ headM: num.positive().nullable() }),
    droneHole: z.strictObject({ wM: num.positive(), hM: num.positive() }),
    softFloor: z.strictObject({ tileMaxM: num.positive() }),
    rail: z.strictObject({ hM: num.positive() }),
    stairs: z.strictObject({ riserMaxM: num.positive(), treadM: num.positive(), headroomM: num.positive() }),
    boundary: z.strictObject({ hM: num.positive(), thickM: num.positive() }),
    groundM: num.positive(),
    killDepthM: num.positive(),
    /** A wall end this close (u) to a perpendicular wall's band meets it (DESIGN §5.3 junctions). */
    junctionU: num.positive(),
  }),
  rooms: z
    .array(z.strictObject({ id: z.string(), floor: Floor, callout: z.string(), names: z.record(z.string(), z.string()).optional(), seed: U2, frame: Frame }))
    .default([]),
  splits: z.array(z.strictObject({ floor: Floor, frame: Frame, axis: z.enum(["H", "V"]), at: num, span: Span, note: z.string() })).default([]),
  softFloors: z
    .array(z.strictObject({ id: z.string(), floor: Floor, frame: Frame, rects: z.array(URect), hard: z.boolean().default(false), tileMaxM: num.optional(), _unverified: Uv }))
    .default([]),
  hatches: z.array(z.strictObject({ id: z.string(), frame: Frame, rect: URect, top: z.string(), bottom: z.string(), _unverified: Uv })).default([]),
  wells: z.array(z.strictObject({ id: z.string(), floor: Floor, frame: Frame, rects: z.array(URect), rail: z.boolean(), _unverified: Uv })).default([]),
  stairs: z.array(z.strictObject({ id: z.string(), names: z.array(z.string()), runs: z.array(stairRun) })).default([]),
  ladders: z
    .array(z.strictObject({ id: z.string(), from: Floor, to: Floor, frame: Frame, at: U2, facing: Dir, widthM: num, _unverified: Uv }))
    .default([]),
  roofs: z.array(roofSchema).default([]),
  spawns: z.array(
    z.strictObject({
      id: z.string(),
      side: z.enum(["attack", "defense", "lab"]),
      group: z.string(),
      level: Level,
      frame: Frame,
      at: U2,
      /** Compass-free facing: yaw in degrees (0 faces north), or toward the building's middle. */
      facing: z.union([num, z.literal("building")]),
      src: Src.optional(),
      note: z.string().optional(),
      _unverified: Uv,
    }),
  ),
  sites: z
    .array(
      z.strictObject({
        id: z.string(),
        name: z.string(),
        liquipedia: z.number().int(),
        rooms: z.array(z.string()).length(2),
        bombs: z.array(z.strictObject({ id: z.string(), room: z.string(), frame: Frame, at: U2 })),
        _unverified: Uv,
      }),
    )
    .default([]),
  cameras: z
    .array(z.strictObject({ id: z.string(), level: Level, room: z.string().optional(), frame: Frame, at: U2, yawDeg: num.optional(), pitchDeg: num.optional(), _unverified: Uv }))
    .default([]),
  ingredients: z
    .array(
      z.strictObject({ id: z.string(), kind: z.enum(["fire_extinguisher", "gas_pipe"]), level: Level, room: z.string().optional(), frame: Frame, at: U2, _unverified: Uv }),
    )
    .default([]),
  zones: z
    .array(
      z.strictObject({ id: z.string(), kind: z.enum(["out_of_bounds", "spawn_peek"]), level: Level, frame: Frame, rects: z.array(URect), faces: z.string().optional(), _unverified: Uv }),
    )
    .default([]),
  rappel: z.strictObject({ refuse: z.array(z.string()) }).default({ refuse: [] }),
});
export type Layout = z.infer<typeof layoutSchema>;
