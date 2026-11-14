// Presentation data (Phase 3 M9): how things look, never how they behave. Client-only in use, kept apart
// from GameData so it is not part of the simulation data hash (a look change never makes a tab refresh).
import { z } from "zod";
import oregonArtJson from "../../../../data/maps/oregon/art.json";
import gunKitJson from "../../../../data/presentation/gun_kit.json";
import materialsJson from "../../../../data/presentation/materials.json";
import ranksJson from "../../../../data/presentation/ranks.json";
import texturesJson from "../../../../data/presentation/textures.json";
import { BARRELS, GRIPS, SIGHTS, UNDERBARRELS, WEAPON_CLASSES } from "./schemas.js";

const v3 = z.tuple([z.number(), z.number(), z.number()]);
const size = z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const tube = z.strictObject({ radius: z.number().positive(), length: z.number().positive() });
/** Every key of `keys` present (a gun can't miss a part the data offers), nothing else. */
const all = <K extends string, V extends z.ZodType>(keys: readonly K[], value: V) =>
  z.strictObject(Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>);

/** A gun's base form (render/gunKit.ts builds each): the family its silhouette comes from. */
export const GUN_BASES = ["ar", "ak", "bullpup", "chassis", "smg", "mpistol", "pump", "semi_shotgun", "revolver_shotgun", "double", "pistol", "flare", "lmg"] as const;
export type GunBase = (typeof GUN_BASES)[number];

/** How a weapon looks (Phase 10 M7): its base form and that form's parameters. */
export const gunLookSchema = z.strictObject({
  base: z.enum(GUN_BASES),
  /** How far the barrel runs on past the receiver (or a pistol's slide), metres. */
  barrel: z.number().min(0).max(0.8),
  /** Its colours: the metal, the furniture (stock, grip, handguard). */
  finish: z.enum(["black", "tan", "grey", "olive", "wood", "silver", "two_tone"]),
  stock: z.enum(["collapsible", "fixed", "skeleton", "folding", "wood", "none"]).optional(),
  fore: z.enum(["rail", "mlok", "round", "wood", "pump", "ribbed"]).optional(),
  mag: z.enum(["stanag", "308", "ak", "pistol", "smg", "curved", "box", "tube"]).optional(),
  /** The whole gun's size against its base's (a bigger calibre, a compact). */
  scale: z.number().min(0.6).max(1.6).optional(),
  /** A base's sub-form (a pistol's "1911", an SMG's "vector"…). */
  variant: z.string().min(1).optional(),
});
export type GunLookData = z.infer<typeof gunLookSchema>;

export const gunKitSchema = z.strictObject({
  _doc: z.string(),
  /** Each weapon's look by its id; a weapon not listed looks like its class's. */
  weapons: z.record(z.string(), gunLookSchema),
  byClass: all([...WEAPON_CLASSES, "shield"] as const, gunLookSchema),
  sights: all(SIGHTS, z.union([
    z.strictObject({ kind: z.literal("posts"), height: z.number().positive() }),
    z.strictObject({ kind: z.literal("box"), size, reticle: z.enum(["dot", "cross"]) }),
    z.strictObject({ kind: z.literal("tube"), radius: z.number().positive(), length: z.number().positive(), reticle: z.enum(["dot", "cross"]) }),
  ])),
  barrels: all(BARRELS, tube),
  grips: all(GRIPS, size),
  underbarrel: all(UNDERBARRELS, size),
  colors: z.strictObject({ attachment: color, laser: color }),
  viewmodel: z.strictObject({
    fovDeg: z.number().min(30).max(100),
    hip: v3,
    sprint: z.strictObject({ offset: v3, yawDeg: z.number(), pitchDeg: z.number() }),
    downFor: z.strictObject({ equip: z.number().nonnegative(), reload: z.number().nonnegative() }),
    adsDistance: z.number().positive(),
    kickBack: z.number().nonnegative(),
    kickPitchDeg: z.number().nonnegative(),
  }),
});
export type GunKit = z.infer<typeof gunKitSchema>;

/** Local ranked tiers (Phase 6 M5, D-124): our own names, colours and shapes, by the lowest rating in each, rising. */
export const ranksSchema = z
  .strictObject({
    _doc: z.string(),
    tiers: z
      .array(z.strictObject({ name: z.string(), min: z.number().int().nonnegative(), color, shape: z.enum(["circle", "square", "diamond", "hexagon", "star"]) }))
      .min(1),
  })
  .superRefine((r, ctx) => {
    if (r.tiers[0].min !== 0) ctx.addIssue({ code: "custom", path: ["tiers", 0, "min"], message: "the first tier starts at 0" });
    for (let i = 1; i < r.tiers.length; i++) if (r.tiers[i].min <= r.tiers[i - 1].min) ctx.addIssue({ code: "custom", path: ["tiers", i, "min"], message: "tiers rise" });
  });
export type Ranks = z.infer<typeof ranksSchema>;

let kit: GunKit | null = null;
let ranks: Ranks | null = null;
/** data/presentation/*, validated once. */
export function loadPresentationData(): { gunKit: GunKit; ranks: Ranks } {
  kit ??= gunKitSchema.parse(gunKitJson);
  ranks ??= ranksSchema.parse(ranksJson);
  return { gunKit: kit, ranks };
}

// ---- The art pass (Phase 10, game/client/src/render/DESIGN.md §2, §5) ----

const artId = z.string().regex(/^[a-z0-9_]+$/);

/** data/presentation/textures.json: the CC0 texture sets tools/art/textures.mjs fetches and packs. */
export const texturesSchema = z
  .strictObject({
    _doc: z.string(),
    resolution: z.number().int().min(256).max(4096),
    sky: z.strictObject({ source: z.literal("polyhaven"), asset: z.string().min(1), for: z.string() }),
    sets: z
      .array(
        z.strictObject({
          id: artId,
          source: z.enum(["polyhaven", "ambientcg"]),
          asset: z.string().min(1),
          /** Which of a Poly Haven asset's colour maps to take, when it has several (e.g. "col_1"); its "Diffuse" otherwise. */
          variant: z.string().min(1).optional(),
          for: z.string(),
        }),
      )
      .min(1)
      .max(64),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    t.sets.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: "custom", path: ["sets", i, "id"], message: `set ${s.id} listed twice` });
      seen.add(s.id);
    });
  });
export type TextureList = z.infer<typeof texturesSchema>;

/** data/presentation/materials.json: a texture set, tinted, scaled and turned. */
export const artMaterialSchema = z.strictObject({
  set: artId,
  tint: color,
  gain: z.number().positive().max(4).optional(),
  rotate: z.union([z.literal(0), z.literal(90)]).optional(),
  scaleM: z.tuple([z.number().positive(), z.number().positive()]).optional(),
  roughness: z.number().positive().max(4).optional(),
  normal: z.number().min(0).max(4).optional(),
});
export type ArtMaterial = z.infer<typeof artMaterialSchema>;
export const materialsSchema = z.strictObject({ _doc: z.string(), materials: z.record(artId, artMaterialSchema) });

/** A style: what a room's (or an outside part's) walls, floor, ceiling and trims wear (render/DESIGN.md §5.2, §5.3). */
export const artStyleSchema = z.strictObject({
  wall: artId,
  floor: artId,
  ceiling: artId,
  trim: artId,
  wainscot: z.strictObject({ material: artId, heightM: z.number().positive().max(2.5) }).optional(),
  /** Trim heights: the baseboard (default 0.12 m inside) and the crown under the ceiling (0.07 m); 0 for none. */
  baseboardM: z.number().min(0).max(0.4).optional(),
  crownM: z.number().min(0).max(0.4).optional(),
  /** Faces of the outside, or of things standing in the open: no trims by height. */
  exterior: z.boolean().optional(),
  /** On an outside wall: this material up to this height (world y). */
  foundation: z.strictObject({ material: artId, topY: z.number() }).optional(),
  /** The room's lamps (render/DESIGN.md §6.6): colour and power (1 by default inside; 0 for none). */
  lamp: z.strictObject({ color, power: z.number().min(0).max(10) }).optional(),
});
export type ArtStyle = z.infer<typeof artStyleSchema>;

/** A style's floor that blends the map's ground layers (mapArtSchema.ground). */
export const GROUND = "ground";

/** data/maps/<map>/art.json: a map's look. */
/** What hangs on a room's walls (render/dressing.ts). */
export const DRESSING_WALL = ["picture", "poster", "clock", "shelf", "cross", "board", "mirror", "pegboard"] as const;
export type DressingWall = (typeof DRESSING_WALL)[number];

export const mapArtSchema = z.strictObject({
  _doc: z.string(),
  styles: z.record(artId, artStyleSchema),
  /** The style of a room not listed in `rooms`, and of an outside face in no zone. */
  default: artId,
  outside: artId,
  rooms: z.record(z.string(), artId),
  /** Outside faces near these rooms (padded), or anywhere outside on these storeys, wear `style` (the first zone wins). */
  zones: z.array(z.strictObject({ style: artId, rooms: z.array(z.string()).optional(), storeys: z.array(z.string()).optional(), padM: z.number().min(0).max(5).optional() })),
  /** Renderables (by id, a regular expression) that wear a style whatever room they're in; the first match wins. */
  items: z.array(z.strictObject({ match: z.string(), style: artId })),
  /** A cover prop's style by its class (data/destruction.json props), until its model arrives. */
  props: z.record(z.string(), artId),
  /**
   * The ground outside (render/DESIGN.md §8): a style's floor of "ground" blends these — the base everywhere, each
   * layer over its rects with edges `softM` wide (at most three layers).
   */
  ground: z
    .strictObject({
      base: artId,
      layers: z.array(z.strictObject({ material: artId, softM: z.number().min(0).max(20), rects: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).min(1) })).max(3),
    })
    .optional(),
  /**
   * Dressing by room style (render/DESIGN.md §9.2): how many of each item hang on the room's hard walls, how many rugs
   * lie on its hard floor, how many low things stand against its hard walls. Placed by the client (render/dressing.ts);
   * drawn only.
   */
  dressing: z
    .record(
      artId,
      z.strictObject({
        wall: z.partialRecord(z.enum(DRESSING_WALL), z.number().int().min(0).max(12)).optional(),
        rug: z.number().int().min(0).max(3).optional(),
        clutter: z.number().int().min(0).max(12).optional(),
      }),
    )
    .optional(),
});
export type MapArt = z.infer<typeof mapArtSchema>;

export interface ArtData {
  textures: TextureList;
  materials: Record<string, ArtMaterial>;
  /** Each map's look, by level id (a level without one wears the built-in lab look). */
  maps: ReadonlyMap<string, MapArt>;
}

/** Every material, style and match an art file names must exist; returns what's wrong (none: valid). */
export function artProblems(data: ArtData): string[] {
  const out: string[] = [];
  const sets = new Set(data.textures.sets.map((s) => s.id));
  for (const [id, m] of Object.entries(data.materials)) if (!sets.has(m.set)) out.push(`material ${id}: no texture set ${m.set}`);
  for (const [mapId, art] of data.maps) {
    const mat = (where: string, id: string) => {
      if (!(id in data.materials)) out.push(`${mapId} ${where}: no material ${id}`);
    };
    const style = (where: string, id: string) => {
      if (!(id in art.styles)) out.push(`${mapId} ${where}: no style ${id}`);
    };
    for (const [id, s] of Object.entries(art.styles)) {
      for (const k of ["wall", "floor", "ceiling", "trim"] as const) if (!(k === "floor" && s[k] === GROUND && art.ground)) mat(`style ${id}.${k}`, s[k]);
      if (s.wainscot) mat(`style ${id}.wainscot`, s.wainscot.material);
      if (s.foundation) mat(`style ${id}.foundation`, s.foundation.material);
    }
    style("default", art.default);
    style("outside", art.outside);
    for (const [room, s] of Object.entries(art.rooms)) style(`room ${room}`, s);
    art.zones.forEach((z, i) => style(`zone ${i}`, z.style));
    art.items.forEach((it, i) => {
      style(`item ${i}`, it.style);
      try {
        new RegExp(it.match);
      } catch {
        out.push(`${mapId} item ${i}: bad pattern ${it.match}`);
      }
    });
    for (const [cls, s] of Object.entries(art.props)) style(`props.${cls}`, s);
    for (const id of Object.keys(art.dressing ?? {})) style(`dressing.${id}`, id);
    if (art.ground) {
      mat("ground.base", art.ground.base);
      art.ground.layers.forEach((l, i) => mat(`ground.layers[${i}]`, l.material));
    }
  }
  return out;
}

let art: ArtData | null = null;
/** The art pass's data (textures, materials, each map's look), validated and cross-checked once. */
export function loadArtData(): ArtData {
  if (art) return art;
  const data: ArtData = {
    textures: texturesSchema.parse(texturesJson),
    materials: materialsSchema.parse(materialsJson).materials,
    maps: new Map([["oregon", mapArtSchema.parse(oregonArtJson)]]),
  };
  const problems = artProblems(data);
  if (problems.length) throw new Error(`art data: ${problems.join("; ")}`);
  return (art = data);
}
