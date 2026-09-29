// Runtime validation for everything in data/. Balancing is done in JSON; these schemas catch typos
// and missing fields at load time instead of as strange behavior in a match (PLAN §0.4).
import { z } from "zod";

const meta = {
  _doc: z.string().optional(),
  _season: z.string().optional(),
  /** Dot-paths of placeholder values that still need verification (PLAN §0.2). */
  _unverified: z.array(z.string()).default([]),
};

const byRating = z.object({ "1": z.number().positive(), "2": z.number().positive(), "3": z.number().positive() });
const stanceDims = z.object({ height: z.number().positive(), eye: z.number().positive() });
export const STANCE_NAMES = ["stand", "crouch", "prone"] as const;

export const movementSchema = z.object({
  ...meta,
  gravity: z.number().negative(),
  healthByRating: byRating,
  speed: z.object({
    walkByRating: byRating,
    sprintByRating: byRating,
    crouchWalkFactor: z.number().positive(),
    proneSpeed: z.number().positive(),
    adsWalkSpeed: z.number().positive(),
    slowWalkFactor: z.number().positive(),
    groundAccel: z.number().positive(),
    groundDecel: z.number().positive(),
    airAccel: z.number().nonnegative(),
  }),
  stance: z.object({
    collisionRadius: z.number().positive(),
    stand: stanceDims,
    crouch: stanceDims,
    prone: stanceDims,
    transitionSeconds: z.object({
      standToCrouch: z.number().positive(),
      crouchToStand: z.number().positive(),
      crouchToProne: z.number().positive(),
      standToProne: z.number().positive(),
      proneToCrouch: z.number().positive(),
      proneToStand: z.number().positive(),
    }),
    proneBodyLength: z.number().positive(),
    proneTurnRateDeg: z.number().positive(),
    pronePitchMinDeg: z.number(),
    pronePitchMaxDeg: z.number(),
  }),
  look: z.object({ pitchMinDeg: z.number(), pitchMaxDeg: z.number() }),
  lean: z.object({
    rollDeg: z.number().nonnegative(),
    offset: z.number().nonnegative(),
    seconds: z.number().positive(),
    allowInStances: z.array(z.enum(STANCE_NAMES)),
    sprintCancelsLean: z.boolean(),
  }),
  sprint: z.object({ forwardThreshold: z.number(), exitToFireSeconds: z.number().nonnegative(), forcesStand: z.boolean() }),
  vault: z.object({
    reach: z.number().positive(),
    minHeight: z.number().positive(),
    maxOverHeight: z.number().positive(),
    maxOntoHeight: z.number().positive(),
    maxOverDepth: z.number().positive(),
    secondsBase: z.number().positive(),
    secondsPerMeter: z.number().nonnegative(),
    clearance: z.number().nonnegative(),
    apexBodyHeight: z.number().positive().default(0.9),
  }),
  ladder: z.object({
    climbSpeed: z.number().positive(),
    slideSpeed: z.number().positive(),
    attachDistance: z.number().positive(),
    dismountForward: z.number().positive(),
  }),
  fall: z.object({ safeHeight: z.number().nonnegative(), lethalHeight: z.number().positive() }),
  step: z.object({ maxStepHeight: z.number().nonnegative(), snapToGround: z.number().nonnegative(), maxSlopeDeg: z.number().positive() }),
});
export type MovementData = z.infer<typeof movementSchema>;

const capsuleR = z.object({ radius: z.number().positive() });
export const hitboxSchema = z.object({
  ...meta,
  parts: z.object({ head: capsuleR, neck: capsuleR, torso: capsuleR, pelvis: capsuleR, arm: capsuleR, leg: capsuleR }),
  standing: z.object({
    hipHeight: z.number(),
    chestHeight: z.number(),
    neckHeight: z.number(),
    headCenterHeight: z.number(),
    shoulderHalfWidth: z.number(),
    hipHalfWidth: z.number(),
  }),
});
export type HitboxData = z.infer<typeof hitboxSchema>;

export const operatorSchema = z.object({
  ...meta,
  id: z.string(),
  name: z.string(),
  side: z.enum(["attacker", "defender"]),
  healthRating: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  speedRating: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  loadout: z.object({
    primaries: z.array(z.string()).min(1),
    secondaries: z.array(z.string()).min(1),
    gadgets: z.array(z.string()),
    gadgetKit: z.object({ picks: z.number().int().positive(), distinct: z.boolean(), pool: z.array(z.string()) }).optional(),
  }),
  ability: z.object({ id: z.string(), name: z.string() }),
  /** Bodies the player controls (Skopós has two shells; PLAN §11.2). */
  pawns: z.number().int().min(1).max(2),
});
export type OperatorData = z.infer<typeof operatorSchema>;

export const SURFACES = [
  "SOFT_WALL",
  "REINFORCEABLE",
  "REINFORCED_WALL",
  "HARD_WALL",
  "SOFT_FLOOR",
  "HARD_FLOOR",
  "HATCH",
  "BARRICADE",
  "WINDOW",
  "PROP",
  "INGREDIENT",
] as const;
export type Surface = (typeof SURFACES)[number];

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const levelSchema = z.object({
  _doc: z.string().optional(),
  id: z.string(),
  name: z.string(),
  spawns: z.array(z.object({ id: z.string(), pos: vec3, yawDeg: z.number() })).min(1),
  solids: z.array(
    z.object({
      id: z.string(),
      center: vec3,
      size: vec3,
      yawDeg: z.number().default(0),
      surface: z.enum(SURFACES),
      vaultable: z.boolean().default(false),
      label: z.string().optional(),
    }),
  ),
  stairs: z
    .array(
      z.object({
        id: z.string(),
        start: vec3,
        yawDeg: z.number(),
        steps: z.number().int().positive(),
        rise: z.number().positive(),
        run: z.number().positive(),
        width: z.number().positive(),
        surface: z.enum(SURFACES),
      }),
    )
    .default([]),
  ramps: z
    .array(
      z.object({
        id: z.string(),
        start: vec3,
        yawDeg: z.number(),
        length: z.number().positive(),
        angleDeg: z.number().positive(),
        width: z.number().positive(),
        surface: z.enum(SURFACES),
        label: z.string().optional(),
      }),
    )
    .default([]),
  ladders: z
    .array(
      z.object({
        id: z.string(),
        base: vec3,
        height: z.number().positive(),
        yawDeg: z.number(),
        width: z.number().positive(),
        label: z.string().optional(),
      }),
    )
    .default([]),
});
export type LevelDef = z.infer<typeof levelSchema>;

/** Returns the `_unverified` paths that don't exist in the object (typos in the marker list). */
export function missingUnverifiedPaths(obj: Record<string, unknown>, paths: string[]): string[] {
  return paths.filter((p) => {
    let cur: unknown = obj;
    for (const key of p.split(".")) {
      if (cur === null || typeof cur !== "object" || !(key in (cur as object))) return true;
      cur = (cur as Record<string, unknown>)[key];
    }
    return false;
  });
}
