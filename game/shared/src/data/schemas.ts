// Runtime validation for everything in data/. Balancing is done in JSON; these schemas catch typos
// and missing fields at load time instead of as strange behavior in a match (PLAN §0.4).
import { z } from "zod";
import { TICK_HZ } from "../core/constants.js";

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
    proneTurnRateDeg: z.number().positive(),
    pronePitchMinDeg: z.number(),
    pronePitchMaxDeg: z.number(),
    /** Gap kept between the ground and the bottom of the prone body clearance boxes. */
    proneBodyLift: z.number().nonnegative(),
  }),
  look: z.object({ pitchMinDeg: z.number(), pitchMaxDeg: z.number() }),
  lean: z.object({
    rollDeg: z.number().nonnegative(),
    offset: z.number().nonnegative(),
    seconds: z.number().positive(),
    allowInStances: z.array(z.enum(STANCE_NAMES)),
    sprintCancelsLean: z.boolean(),
    /** Prone lean moves the head/upper body less than upright lean. */
    proneOffsetScale: z.number().nonnegative(),
    proneRollScale: z.number().nonnegative(),
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
    apexBodyHeight: z.number().positive(),
  }),
  ladder: z.object({
    climbSpeed: z.number().positive(),
    slideSpeed: z.number().positive(),
    attachDistance: z.number().positive(),
    dismountForward: z.number().positive(),
    dismountSeconds: z.number().positive(),
    dismountApex: z.number().nonnegative(),
    /** You can grab the ladder up to this far below its top. */
    topGrabMargin: z.number().nonnegative(),
    /** How far below a ladder's base you can still grab it. */
    bottomGrabMargin: z.number().nonnegative(),
  }),
  fall: z.object({ safeHeight: z.number().nonnegative(), lethalHeight: z.number().positive() }),
  step: z.object({ maxStepHeight: z.number().nonnegative(), snapToGround: z.number().nonnegative(), maxSlopeDeg: z.number().positive() }),
});
export type MovementData = z.infer<typeof movementSchema>;

const capsuleR = z.object({ radius: z.number().positive() });
export const hitboxSchema = z.object({
  ...meta,
  parts: z.object({ head: capsuleR, neck: capsuleR, torso: capsuleR, pelvis: capsuleR, arm: capsuleR, leg: capsuleR }),
  /** Upright pose. The head sits at the stance's eye height (data/movement.json). */
  standing: z.object({
    /** Fractions of the current stance height. */
    hipHeight: z.number(),
    chestHeight: z.number(),
    neckHeight: z.number(),
    /** Meters. */
    shoulderHalfWidth: z.number(),
    hipHalfWidth: z.number(),
    headForward: z.number(),
    neckBaseAboveChest: z.number(),
    torsoBaseAboveHip: z.number(),
    handForward: z.number(),
    handHalfWidth: z.number(),
    handAboveHip: z.number(),
    footForward: z.number(),
    footHeight: z.number(),
  }),
  /**
   * Lying-down pose, in meters from the pawn's feet point (forward = along facing). Single source for the
   * prone hitboxes and the prone body clearance check.
   */
  prone: z.object({
    headForward: z.number(),
    neckFrontHeight: z.number(),
    neckRearHeight: z.number(),
    shoulderForward: z.number(),
    shoulderHalfWidth: z.number(),
    shoulderHeight: z.number(),
    chestHeight: z.number(),
    torsoRearBack: z.number(),
    torsoRearHeight: z.number(),
    handForward: z.number(),
    handHalfWidth: z.number(),
    handHeight: z.number(),
    hipBack: z.number(),
    hipHeight: z.number(),
    thighBack: z.number(),
    thighHeight: z.number(),
    footBack: z.number(),
    footSpread: z.number(),
    footHeight: z.number(),
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
  /** Unique ability; `params` holds its tuning numbers (filled in per operator as abilities are built). */
  ability: z.object({ id: z.string(), name: z.string(), params: z.record(z.string(), z.number()).default({}) }),
  /** Bodies the player controls (Skopós has two shells; PLAN §11.2). */
  pawns: z.number().int().min(1).max(2),
  /** Combat exceptions (Phase 3). Skopós's shells can't be downed and make the bigger melee hole. */
  combat: z.strictObject({ canDbno: z.boolean().default(true), meleeHole: z.enum(["standard", "large"]).default("standard") }).default({ canDbno: true, meleeHole: "standard" }),
}).superRefine((op, ctx) => {
  if (op.pawns < 2) return;
  // Swap timings must be positive (the cooldown may be 0); the shell offset is range-checked against the
  // body size when the shells spawn (Sim.addPlayer).
  const required: [string, (v: number) => boolean, string][] = [
    ["transferSeconds", (v) => v > 0, "a positive number"],
    ["activationSeconds", (v) => v > 0, "a positive number"],
    ["swapCooldownSeconds", (v) => v >= 0, "zero or more"],
    ["idleShellOffset", (v) => v > 0, "a positive number"],
  ];
  for (const [key, ok, what] of required) {
    const v = op.ability.params[key];
    if (v === undefined || !ok(v)) {
      ctx.addIssue({ code: "custom", path: ["ability", "params", key], message: `a ${op.pawns}-pawn operator needs ability.params.${key} (${what})` });
    }
  }
});
export type OperatorData = z.infer<typeof operatorSchema>;

// ---- Weapons and combat (Phase 3; DECISIONS D-039) ----

export const WEAPON_CLASSES = ["assault_rifle", "marksman_rifle", "lmg", "smg", "machine_pistol", "shotgun", "slug_shotgun", "handgun", "hand_cannon"] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];
/** Attachment ids per slot. The order is the wire encoding (index + 1; 0 = none), so only append. */
export const SIGHTS = ["iron", "nonmag", "magnified", "telescopic"] as const;
export const BARRELS = ["muzzle_brake", "compensator", "flash_hider", "suppressor", "extended_barrel"] as const;
export const GRIPS = ["vertical", "angled", "horizontal"] as const;
export const UNDERBARRELS = ["laser"] as const;
export const FIRE_MODES = ["auto", "burst2", "burst3", "semi"] as const;
export type FireMode = (typeof FIRE_MODES)[number];
/** The cadence counter allows at most one shot per pawn per tick (DECISIONS D-040). */
export const MAX_RPM = 60 * TICK_HZ;

/** An attachment a weapon offers: a plain id, or an id only some operators get (weapons_notes.md §6). */
const offer = <T extends readonly [string, ...string[]]>(ids: T) =>
  z.union([z.enum(ids), z.strictObject({ id: z.enum(ids), operators: z.array(z.string()).min(1) })]);
export type Offer<T extends string = string> = T | { id: T; operators: string[] };
export const offerId = <T extends string>(o: Offer<T>): T => (typeof o === "string" ? o : o.id);

/** [meters, damage] points: flat before the first and after the last, linear in between. */
const falloff = z.array(z.tuple([z.number().nonnegative(), z.number().int().nonnegative()])).min(1);
const secs = z.number().positive();

const gunSchema = z
  .strictObject({
    ...meta,
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    class: z.enum(WEAPON_CLASSES),
    fire: z.strictObject({
      kind: z.enum(["hitscan", "explosive_projectile"]),
      /** Rounds per minute; a whole number so the tick cadence is exact. Hitscan only. */
      rpm: z.number().int().positive().max(MAX_RPM).optional(),
      /** The first mode is the one a fresh weapon starts in. */
      modes: z.array(z.enum(FIRE_MODES)).min(1),
      pellets: z.number().int().positive(),
    }),
    /** Null for weapons whose damage isn't modelled yet (the GONNE-6's explosion, Phase 4/8). */
    damage: z
      .strictObject({
        base: z.number().int().nonnegative(),
        falloff,
        penetration: z.enum(["none", "simple", "full"]),
        /** "kill": a head or neck hit kills; "pellet": combat.json's pellet head multiplier. */
        head: z.enum(["kill", "pellet"]),
        extendedBarrel: z.strictObject({ base: z.number().int().nonnegative(), falloff }).optional(),
      })
      .nullable(),
    ammo: z.strictObject({
      magazine: z.number().int().min(1).max(255),
      /** Closed-bolt: spawns and tactical-reloads with one extra round in the chamber (weapons_notes.md §4.6). */
      plusOne: z.boolean(),
      /** Every round carried: loaded + chambered + reserve. */
      maxAmmo: z.number().int().positive().max(65535),
    }),
    reload: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("magazine"), tacticalS: secs, emptyS: secs, refillTacticalS: secs.optional(), refillEmptyS: secs.optional() }),
      z.strictObject({ kind: z.literal("per_shell"), perShellS: secs, emptyFullS: secs }),
      z.strictObject({ kind: z.literal("none") }),
    ]),
    adsS: secs,
    /** Caliber-based destruction tier (weapons_notes.md §4.8); nothing reads it until Phase 4. */
    destruction: z.enum(["low", "medium", "high", "full", "full_close_range", "explosive"]).nullable(),
    integralSuppressor: z.boolean().default(false),
    /** Only if a suppressor turns out to lower this weapon's damage (weapons_notes.md Q7). */
    suppressedDamage: z.number().int().nonnegative().optional(),
    attachments: z.strictObject({
      sights: z.array(offer(SIGHTS)).min(1),
      barrels: z.array(offer(BARRELS)),
      grips: z.array(offer(GRIPS)),
      underbarrel: z.array(offer(UNDERBARRELS)),
    }),
    recoil: z.strictObject({
      /** A gunplay.json recoilTemplates key. */
      template: z.string(),
      firstShotMult: z.number().positive().optional(),
      /** Overrides the template's stage boundaries (bullet indices), keeping its magnitudes. */
      stageStarts: z.array(z.number().int().nonnegative()).min(1).optional(),
    }),
  })
  .superRefine((w, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const checkFalloff = (pts: [number, number][], base: number, path: string[]) => {
      if (pts[0][1] !== base) issue(path, `the first falloff point must deal the base damage (${base})`);
      for (let i = 1; i < pts.length; i++) {
        if (pts[i][0] <= pts[i - 1][0]) issue([...path, i], "falloff distances must increase");
        if (pts[i][1] > pts[i - 1][1]) issue([...path, i], "damage must not rise with distance");
      }
    };
    if (w.fire.kind === "hitscan") {
      if (w.fire.rpm === undefined) issue(["fire", "rpm"], "a hitscan weapon needs rpm");
      if (w.damage === null) issue(["damage"], "a hitscan weapon needs a damage block");
    }
    const barrels = w.attachments.barrels.map(offerId);
    if (w.damage) {
      checkFalloff(w.damage.falloff, w.damage.base, ["damage", "falloff"]);
      if (w.damage.extendedBarrel) checkFalloff(w.damage.extendedBarrel.falloff, w.damage.extendedBarrel.base, ["damage", "extendedBarrel", "falloff"]);
      if (!!w.damage.extendedBarrel !== barrels.includes("extended_barrel")) {
        issue(["damage", "extendedBarrel"], "extendedBarrel must be present exactly when the barrels offer extended_barrel");
      }
      if ((w.damage.head === "pellet") !== w.fire.pellets > 1) issue(["damage", "head"], `"pellet" headshots go with multi-pellet weapons, "kill" with single projectiles`);
    }
    const grips = w.attachments.grips.map(offerId);
    // The horizontal grip is the renamed "no grip" (weapons_notes.md §4.5): every grip slot has it.
    if (grips.length > 0 && !grips.includes("horizontal")) issue(["attachments", "grips"], "a grip slot must offer horizontal");
    if (w.integralSuppressor && barrels.length > 0) issue(["attachments", "barrels"], "an integral suppressor leaves no barrel slot");
    for (const slot of ["sights", "barrels", "grips", "underbarrel"] as const) {
      const ids = (w.attachments[slot] as Offer[]).map(offerId);
      if (new Set(ids).size !== ids.length) issue(["attachments", slot], "duplicate attachment");
    }
    if (new Set(w.fire.modes).size !== w.fire.modes.length) issue(["fire", "modes"], "duplicate fire mode");
    if (w.reload.kind === "per_shell") {
      if (w.ammo.plusOne) issue(["ammo", "plusOne"], "a per-shell (tube) reload has no chambered +1");
      if (w.reload.emptyFullS < w.ammo.magazine * w.reload.perShellS) issue(["reload", "emptyFullS"], "an empty reload can't be faster than loading every shell");
    }
    if (w.reload.kind === "magazine") {
      const r = w.reload;
      if (r.emptyS < r.tacticalS) issue(["reload", "emptyS"], "an empty reload can't be faster than a tactical one");
      if ((r.refillTacticalS === undefined) !== (r.refillEmptyS === undefined)) issue(["reload"], "give both refill points or neither");
      if (r.refillTacticalS !== undefined && r.refillTacticalS > r.tacticalS) issue(["reload", "refillTacticalS"], "the refill point must come before the reload ends");
      if (r.refillEmptyS !== undefined && r.refillEmptyS > r.emptyS) issue(["reload", "refillEmptyS"], "the refill point must come before the reload ends");
    }
    if (w.ammo.maxAmmo < w.ammo.magazine + (w.ammo.plusOne ? 1 : 0)) issue(["ammo", "maxAmmo"], "maxAmmo must cover a full magazine (and the +1)");
    const starts = w.recoil.stageStarts;
    if (starts && (starts[0] !== 0 || starts.some((v, i) => i > 0 && v <= starts[i - 1]))) issue(["recoil", "stageStarts"], "stage starts begin at 0 and increase");
  });

/** The Ballistic Shield (weapons_notes.md §5). Validated now; usable from Phase 8 (DECISIONS D-054). */
const shieldSchema = z.strictObject({
  ...meta,
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  class: z.literal("shield"),
  shield: z.strictObject({
    pistolAdsS: z.strictObject({ walk: secs, sprint: secs }),
    hipFire: z.boolean(),
    moveSpeedMult: z.number().positive(),
    suppression: z.strictObject({ hitsToTrigger: z.number().int().positive(), hitsToMax: z.number().int().positive(), falloffS: secs }),
    bashDamage: z.number().nonnegative(),
  }),
});

export const weaponSchema = z.discriminatedUnion("class", [gunSchema, shieldSchema]);
export type WeaponData = z.infer<typeof weaponSchema>;
export type GunData = z.infer<typeof gunSchema>;
export type ShieldData = z.infer<typeof shieldSchema>;
export const isGun = (w: WeaponData): w is GunData => w.class !== "shield";

/** A strict object with the same schema under each of `keys`. */
function keyed<K extends string, S extends z.ZodType>(keys: readonly K[], schema: S) {
  return z.strictObject(Object.fromEntries(keys.map((k) => [k, schema])) as unknown as Record<K, S>);
}

const recoilStage = z.strictObject({
  fromShot: z.number().int().nonnegative(),
  upDeg: z.number(),
  upJitterDeg: z.number().nonnegative(),
  sideDeg: z.number(),
  sideJitterDeg: z.number().nonnegative(),
});
const fraction = z.number().min(0).max(1);
const bonusMath = z.enum(["divide", "subtract"]);
const range2 = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).refine(([a, b]) => a <= b, "min must not exceed max");

export const gunplaySchema = z
  .strictObject({
    ...meta,
    classes: keyed(
      WEAPON_CLASSES,
      z.strictObject({
        adsS: secs,
        adsCurve: z.enum(["fast", "medium", "slow"]),
        /** The class falloff shape as [meters, fraction of base damage] points, or null when not modelled. Validation only. */
        falloff: z.array(z.tuple([z.number().nonnegative(), fraction])).min(1).nullable(),
        moveSpeedMult: z.number().positive(),
        /** Total-ammo range (weapons_notes.md §4.6); the +1 may add one. Validation only. */
        maxAmmo: range2.nullable(),
        /** The range only applies to primaries (secondary shotguns kept their old counts). */
        maxAmmoPrimaryOnly: z.boolean().default(false),
      }),
    ),
    /** ADS accuracy curves: easeIn is t^power, easeOut is 1 − (1 − t)^power. */
    curves: keyed(["fast", "medium", "slow"] as const, z.strictObject({ kind: z.enum(["easeIn", "easeOut"]), power: z.number().positive() })),
    sights: keyed(SIGHTS, z.strictObject({ zoom: z.number().positive(), adsBonus: z.number().nonnegative() })),
    attachments: z.strictObject({
      suppressor: z.strictObject({ damageMult: z.number().positive(), noFlash: z.boolean(), noTracer: z.boolean(), noThreat: z.boolean() }),
      extended_barrel: z.strictObject({}),
      muzzle_brake: z.strictObject({ firstShotMult: z.number().positive(), recenterTimeMult: z.number().positive() }),
      compensator: z.strictObject({ sideMult: z.number().positive() }),
      flash_hider: z.strictObject({ upMult: z.number().positive(), firstShotUpMult: z.number().positive() }),
      vertical: z.strictObject({ verticalControlBonus: z.number().nonnegative() }),
      angled: z.strictObject({ reloadSpeedBonus: z.number().nonnegative() }),
      horizontal: z.strictObject({ moveSpeedMult: z.number().positive() }),
      laser: z.strictObject({ adsBonus: z.number().nonnegative(), visibleDot: z.boolean() }),
    }),
    rules: z.strictObject({
      /** How "+X %" bonuses apply, per kind: "divide" is value / (1 + Σ bonuses); "subtract" is value × (1 − Σ bonuses). */
      bonusMath: z.strictObject({ ads: bonusMath, reload: bonusMath, recoilControl: bonusMath }),
      /**
       * Full speed as a multiple of a bare primary's (weapons_notes.md §4.5: the horizontal grip "never exceeds
       * the operator's cap"). data/movement.json's speeds are reached at it; slower setups scale down.
       */
      maxMoveSpeedMult: z.number().positive(),
      swapS: secs,
      adsExitS: secs,
      adsFromSprintMult: z.number().min(1),
      reload: z.strictObject({ magOutFractionOfRefill: fraction, fireCancels: z.boolean(), pulledRoundsReturn: z.boolean(), sprintInterrupts: z.boolean() }),
      fire: z.strictObject({
        /** "weapon": bursts fire at the weapon's own rpm. */
        burstRpm: z.literal("weapon"),
        burstReleaseCancels: z.boolean(),
        semiBuffer: z.boolean(),
        autoReloadOnEmpty: z.boolean(),
        modeSwitchS: z.number().nonnegative(),
      }),
      /** Which movement speeds a weapon's moveSpeedMult scales. */
      moveMultScope: z.array(z.enum(["walk", "crouch", "sprint", "adsWalk"])),
    }),
    recoilTemplates: z.record(
      z.string(),
      z.strictObject({
        firstShotMult: z.number().positive(),
        cameraUpDegPerS: z.number().positive(),
        resetS: secs,
        stages: z.array(recoilStage).min(1),
        recenter: z.strictObject({ fraction, delayS: z.number().nonnegative(), degPerS: z.number().positive() }),
      }),
    ),
    /** Cone half-angles; `movePerMpsDeg` widens it per m/s of horizontal speed. Server-only (DECISIONS D-041). */
    spread: keyed(WEAPON_CLASSES, z.strictObject({ hipDeg: z.number().nonnegative(), adsDeg: z.number().nonnegative(), movePerMpsDeg: z.number().nonnegative() })),
  })
  .superRefine((g, ctx) => {
    for (const [id, t] of Object.entries(g.recoilTemplates)) {
      if (t.stages[0].fromShot !== 0 || t.stages.some((st, i) => i > 0 && st.fromShot <= t.stages[i - 1].fromShot)) {
        ctx.addIssue({ code: "custom", path: ["recoilTemplates", id, "stages"], message: "stages start at shot 0 and increase" });
      }
    }
  });
export type GunplayData = z.infer<typeof gunplaySchema>;

const zoneValue = z.union([z.literal("kill"), z.number().nonnegative()]);
export const combatSchema = z.strictObject({
  ...meta,
  zones: z.strictObject({ head: zoneValue, neck: zoneValue, torso: zoneValue, pelvis: zoneValue, arm: zoneValue, leg: zoneValue }),
  pellet: z.strictObject({ headMultiplier: z.number().positive(), neckCountsAsHead: z.boolean() }),
  penetration: z.strictObject({ fullNextBodyMultiplier: fraction, fullCumulative: z.boolean(), simpleStopsAtFirstBody: z.boolean() }),
  rounding: z.enum(["floor", "round"]),
  maxRangeM: z.number().positive(),
  idleShellHeadMultiplier: z.number().positive(),
  dbno: z.strictObject({
    hp: z.number().positive(),
    downsPerRound: z.number().int().nonnegative(),
    bleedStillSeconds: secs,
    bleedMovingSeconds: secs,
    movingSpeed: z.number().nonnegative(),
    invulnSeconds: z.number().nonnegative(),
    crawlSpeed: z.number().positive(),
    overkillKillsAbove: z.number().nonnegative(),
    lethalCauses: z.array(z.enum(["explosive", "fall", "melee", "headshot"])),
  }),
  revive: z.strictObject({
    seconds: secs,
    revivedHp: z.number().positive(),
    reach: z.number().positive(),
    maxHeightDiff: z.number().positive(),
    facingDeg: z.number().positive().max(180),
    reviverLocked: z.boolean(),
    targetLocked: z.boolean(),
    cancelOnReviverHit: z.boolean(),
  }),
  melee: z.strictObject({
    reach: z.number().positive(),
    coneHalfAngleDeg: z.number().positive().max(90),
    impactSeconds: z.number().nonnegative(),
    cycleSeconds: secs,
    vsStanding: z.union([z.literal("kill"), z.number().nonnegative()]),
    vsDowned: z.union([z.literal("kill"), z.number().nonnegative()]),
    allowInStances: z.array(z.enum(STANCE_NAMES)),
    endsSprint: z.boolean(),
  }),
}).superRefine((c, ctx) => {
  if (c.melee.impactSeconds > c.melee.cycleSeconds) ctx.addIssue({ code: "custom", path: ["melee", "impactSeconds"], message: "the melee hit must land before the swing ends" });
});
export type CombatData = z.infer<typeof combatSchema>;

/** A mode preset (data/modes/<id>.json, PLAN §4). Damage-rule names follow research/core_mechanics.md §11. */
export const modeSchema = z.strictObject({
  ...meta,
  id: z.string(),
  friendlyFire: z.strictObject({ actionPhase: z.boolean(), prepPhase: z.boolean(), scale: z.number().nonnegative() }),
  reverseFriendlyFire: z.strictObject({ enabled: z.boolean(), thresholdHp: z.number().positive() }),
  lastAliveDies: z.boolean(),
  dummyRespawnS: z.number().nonnegative(),
});
export type ModeData = z.infer<typeof modeSchema>;

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
export const levelSchema = z.strictObject({
  _doc: z.string().optional(),
  id: z.string(),
  name: z.string(),
  spawns: z.array(z.strictObject({ id: z.string(), pos: vec3, yawDeg: z.number() })).min(1),
  solids: z.array(
    z.strictObject({
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
      z.strictObject({
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
      z.strictObject({
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
      z.strictObject({
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
