// Presentation data (Phase 3 M9): how things look, never how they behave. Client-only in use, kept apart
// from GameData so it is not part of the simulation data hash (a look change never makes a tab refresh).
import { z } from "zod";
import gunKitJson from "../../../../data/presentation/gun_kit.json";
import { BARRELS, GRIPS, SIGHTS, UNDERBARRELS, WEAPON_CLASSES } from "./schemas.js";

const v3 = z.tuple([z.number(), z.number(), z.number()]);
const size = z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const tube = z.strictObject({ radius: z.number().positive(), length: z.number().positive() });
/** Every key of `keys` present (a gun can't miss a part the data offers), nothing else. */
const all = <K extends string, V extends z.ZodType>(keys: readonly K[], value: V) =>
  z.strictObject(Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>);

const gunShape = z.strictObject({
  receiver: size,
  receiverZ: z.number(),
  barrel: tube,
  stock: size.nullable(),
  mag: size,
  magZ: z.number(),
  magTilt: z.number(),
  color,
});

export const gunKitSchema = z.strictObject({
  _doc: z.string(),
  classes: all([...WEAPON_CLASSES, "shield"] as const, gunShape),
  sights: all(SIGHTS, z.union([
    z.strictObject({ kind: z.literal("posts"), height: z.number().positive() }),
    z.strictObject({ kind: z.literal("box"), size, reticle: z.enum(["dot", "cross"]) }),
    z.strictObject({ kind: z.literal("tube"), radius: z.number().positive(), length: z.number().positive(), reticle: z.enum(["dot", "cross"]) }),
  ])),
  barrels: all(BARRELS, tube),
  grips: all(GRIPS, size),
  underbarrel: all(UNDERBARRELS, size),
  colors: z.strictObject({ attachment: color, laser: color, knife: color }),
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

let kit: GunKit | null = null;
/** data/presentation/*, validated once. */
export function loadPresentationData(): { gunKit: GunKit } {
  kit ??= gunKitSchema.parse(gunKitJson);
  return { gunKit: kit };
}
