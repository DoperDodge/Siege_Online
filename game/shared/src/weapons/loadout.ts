// Loadouts (DECISIONS D-042): what a player picked, checked against the operator and weapon data, and turned
// into the static numbers the simulation uses (all durations in ticks, angles in float32 radians). Built once
// per body on both client and server from the same data, so it is not part of the predicted state.
import { DEG } from "../core/math.js";
import type { GameData } from "../data/load.js";
import {
  BARRELS,
  GRIPS,
  isGun,
  offerId,
  SIGHTS,
  UNDERBARRELS,
  type FireMode,
  type GunData,
  type GunplayData,
  type Offer,
  type OperatorData,
  type WeaponClass,
} from "../data/schemas.js";
import type { Falloff } from "./damage.js";
import { ticks, ticksOrZero } from "./ticks.js";

export type SightId = (typeof SIGHTS)[number];
export type BarrelId = (typeof BARRELS)[number];
export type GripId = (typeof GRIPS)[number];
export type UnderbarrelId = (typeof UNDERBARRELS)[number];

export interface WeaponPick {
  weapon: string;
  /** null = iron sight. */
  sight: SightId | null;
  barrel: BarrelId | null;
  /** null = horizontal grip on a weapon with a grip slot (the horizontal grip is the renamed "no grip"). */
  grip: GripId | null;
  underbarrel: UnderbarrelId | null;
}

export interface LoadoutPick {
  operator: string;
  primary: WeaponPick;
  secondary: WeaponPick;
  gadgets: string[];
}

export interface ResolvedDamage {
  base: number;
  falloff: Falloff;
  penetration: "none" | "simple" | "full";
  head: "kill" | "pellet";
}

export type ResolvedReload =
  | {
      kind: "magazine";
      tacticalTicks: number;
      emptyTicks: number;
      /** When the ammo counter refills. */
      refillTacticalTicks: number;
      refillEmptyTicks: number;
      /** When the old magazine is out (rounds not kept are gone from the weapon from here on). */
      magOutTacticalTicks: number;
      magOutEmptyTicks: number;
    }
  | { kind: "per_shell"; perShellTicks: number; /** Extra time at the start of a reload from empty. */ emptyExtraTicks: number }
  | { kind: "none" };

export interface ResolvedRecoilStage {
  fromShot: number;
  up: number;
  upJitter: number;
  side: number;
  sideJitter: number;
}

/** Recoil with the attachments already applied. Angles in radians (float32). */
export interface ResolvedRecoil {
  firstShotMult: number;
  /** Extra factor on the first shot's vertical kick (flash hider). */
  firstShotUpMult: number;
  upMult: number;
  sideMult: number;
  /** How much pending kick reaches the view per tick ("Camera Up Speed"). */
  cameraUpPerTick: number;
  /** Ticks without a shot after which the spray starts again at stage 0. */
  resetTicks: number;
  stages: ResolvedRecoilStage[];
  recenter: { fraction: number; delayTicks: number; perTick: number };
}

export interface ResolvedWeapon {
  id: string;
  name: string;
  class: WeaponClass;
  pick: WeaponPick;
  fire: { kind: "hitscan" | "explosive_projectile"; rpm: number; modes: FireMode[]; pellets: number };
  damage: ResolvedDamage | null;
  ammo: { magazine: number; plusOne: boolean; maxAmmo: number };
  reload: ResolvedReload;
  ads: { ticks: number; fromSprintTicks: number; exitTicks: number; curve: { kind: "easeIn" | "easeOut"; power: number }; zoom: number };
  /** Scales the operator's speeds (data/movement.json, which are full speed): 1 at full speed, less when slower. */
  moveSpeedMult: number;
  suppressed: boolean;
  laser: boolean;
  recoil: ResolvedRecoil;
  /** Cone half-angles in radians. Server-only (DECISIONS D-041). */
  spread: { hip: number; ads: number; perMps: number };
  destruction: GunData["destruction"];
}

export interface ResolvedLoadout {
  pick: LoadoutPick;
  weapons: [ResolvedWeapon, ResolvedWeapon];
  gadgets: string[];
  swapTicks: number;
}

const f32 = Math.fround;
const rad = (deg: number) => f32(deg * DEG);

/** A weapon can be picked in Phase 3 unless it is the shield or the GONNE-6 (DECISIONS D-054). */
export function isPickable(data: GameData, weaponId: string): boolean {
  const w = data.weapons.get(weaponId);
  return !!w && isGun(w) && w.fire.kind === "hitscan";
}

/** The attachment ids of a slot that this operator may fit. */
function allowed<T extends string>(offers: Offer<T>[], operatorId: string): T[] {
  return offers.filter((o) => typeof o === "string" || o.operators.includes(operatorId)).map(offerId);
}

/** Applies "+X %" bonuses (gunplay.rules.bonusMath). */
function withBonus(math: "divide" | "subtract", value: number, bonus: number): number {
  return math === "divide" ? value / (1 + bonus) : value * (1 - bonus);
}

/** Why this weapon pick is invalid for the operator, or null when it is fine. Expects a normalized pick. */
function weaponPickProblem(data: GameData, op: OperatorData, slot: "primaries" | "secondaries", p: WeaponPick): string | null {
  if (!op.loadout[slot].includes(p.weapon)) return `${op.id} can't carry ${p.weapon} as a ${slot === "primaries" ? "primary" : "secondary"}`;
  if (!isPickable(data, p.weapon)) return `${p.weapon} can't be picked yet`;
  const w = data.weapons.get(p.weapon) as GunData;
  const a = w.attachments;
  if (!allowed(a.sights, op.id).includes(p.sight!)) return `${p.weapon} has no ${p.sight} sight for ${op.id}`;
  if (p.barrel !== null && !allowed(a.barrels, op.id).includes(p.barrel)) return `${p.weapon} has no ${p.barrel} for ${op.id}`;
  const grips = allowed(a.grips, op.id);
  if (p.grip === null ? grips.length > 0 : !grips.includes(p.grip)) return `${p.weapon} has no ${p.grip ?? "empty"} grip slot for ${op.id}`;
  if (p.underbarrel !== null && !allowed(a.underbarrel, op.id).includes(p.underbarrel)) return `${p.weapon} has no ${p.underbarrel} for ${op.id}`;
  return null;
}

/** Fills the defaults a pick may leave out: iron sight, and the horizontal grip on a weapon with a grip slot. */
function normalizeWeaponPick(data: GameData, opId: string, p: WeaponPick): WeaponPick {
  const w = data.weapons.get(p.weapon);
  const grips = w && isGun(w) ? allowed(w.attachments.grips, opId) : [];
  return { ...p, sight: p.sight ?? "iron", grip: p.grip ?? (grips.includes("horizontal") ? "horizontal" : null) };
}

function gadgetProblem(op: OperatorData, gadgets: string[]): string | null {
  const kit = op.loadout.gadgetKit;
  if (kit) {
    if (gadgets.length !== kit.picks) return `${op.id} picks ${kit.picks} gadgets from the kit`;
    if (gadgets.some((g) => !kit.pool.includes(g))) return `a gadget isn't in ${op.id}'s kit`;
    if (kit.distinct && new Set(gadgets).size !== gadgets.length) return `${op.id}'s kit gadgets must differ`;
    return null;
  }
  if (op.loadout.gadgets.length === 0) return gadgets.length === 0 ? null : `${op.id} has no gadgets`;
  return gadgets.length === 1 && op.loadout.gadgets.includes(gadgets[0]) ? null : `${op.id} picks one of ${op.loadout.gadgets.join(", ")}`;
}

/**
 * The loadout an operator gets when nothing (valid) was picked: first pickable primary and secondary, iron
 * sights, no barrel, horizontal grip, no laser, first gadget(s). Our UX choice, not a Siege rule.
 */
export function defaultLoadoutPick(data: GameData, operatorId: string): LoadoutPick {
  const op = data.operators.get(operatorId);
  if (!op) throw new Error(`unknown operator ${operatorId}`);
  const first = (ids: string[]) => {
    const id = ids.find((w) => isPickable(data, w));
    if (!id) throw new Error(`${operatorId} has no pickable weapon in ${ids.join(", ")}`);
    return normalizeWeaponPick(data, op.id, { weapon: id, sight: null, barrel: null, grip: null, underbarrel: null });
  };
  const kit = op.loadout.gadgetKit;
  const gadgets = kit ? kit.pool.slice(0, kit.picks) : op.loadout.gadgets.slice(0, 1);
  return { operator: op.id, primary: first(op.loadout.primaries), secondary: first(op.loadout.secondaries), gadgets };
}

/** Why a pick is invalid, or null. */
export function loadoutPickProblem(data: GameData, pick: LoadoutPick): string | null {
  const op = data.operators.get(pick.operator);
  if (!op) return `unknown operator ${pick.operator}`;
  return (
    weaponPickProblem(data, op, "primaries", normalizeWeaponPick(data, op.id, pick.primary)) ??
    weaponPickProblem(data, op, "secondaries", normalizeWeaponPick(data, op.id, pick.secondary)) ??
    gadgetProblem(op, pick.gadgets)
  );
}

/**
 * Resolves a pick. An invalid pick quietly becomes the operator's default loadout (the roster tells the client
 * what it got); an unknown operator throws, since callers check operators first.
 */
export function resolveLoadout(data: GameData, pick: LoadoutPick): { loadout: ResolvedLoadout; problem: string | null } {
  const problem = loadoutPickProblem(data, pick);
  const p = problem === null ? pick : defaultLoadoutPick(data, pick.operator);
  const primary = normalizeWeaponPick(data, p.operator, p.primary);
  const secondary = normalizeWeaponPick(data, p.operator, p.secondary);
  const normalized: LoadoutPick = { operator: p.operator, primary, secondary, gadgets: [...p.gadgets] };
  return {
    loadout: {
      pick: normalized,
      weapons: [resolveWeapon(data, primary), resolveWeapon(data, secondary)],
      gadgets: normalized.gadgets,
      swapTicks: ticks(data.gunplay.rules.swapS),
    },
    problem,
  };
}

/** Median of refill point ÷ reload time per class (and over all weapons as a fallback), for weapons without a measured refill point. */
const refillRatioCache = new WeakMap<GameData, Map<string, [number, number]>>();
function refillRatios(data: GameData, cls: WeaponClass): [number, number] {
  let byClass = refillRatioCache.get(data);
  if (!byClass) {
    byClass = new Map();
    const samples = new Map<string, [number[], number[]]>();
    const add = (key: string, tac: number, emp: number) => {
      if (!samples.has(key)) samples.set(key, [[], []]);
      samples.get(key)![0].push(tac);
      samples.get(key)![1].push(emp);
    };
    for (const w of data.weapons.values()) {
      if (!isGun(w) || w.reload.kind !== "magazine" || w.reload.refillTacticalS === undefined) continue;
      const tac = w.reload.refillTacticalS / w.reload.tacticalS;
      const emp = w.reload.refillEmptyS! / w.reload.emptyS;
      add(w.class, tac, emp);
      add("*", tac, emp);
    }
    const median = (v: number[]) => {
      const s = [...v].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    for (const [key, [tac, emp]] of samples) byClass.set(key, [median(tac), median(emp)]);
    refillRatioCache.set(data, byClass);
  }
  return byClass.get(cls) ?? byClass.get("*")!;
}

function resolveRecoil(gunplay: GunplayData, w: GunData, p: WeaponPick): ResolvedRecoil {
  const t = gunplay.recoilTemplates[w.recoil.template];
  const a = gunplay.attachments;
  const brake = p.barrel === "muzzle_brake";
  const hider = p.barrel === "flash_hider";
  const recenterTime = brake ? a.muzzle_brake.recenterTimeMult : 1;
  const vertical = p.grip === "vertical" ? a.vertical.verticalControlBonus : 0;
  return {
    firstShotMult: f32((w.recoil.firstShotMult ?? t.firstShotMult) * (brake ? a.muzzle_brake.firstShotMult : 1)),
    firstShotUpMult: f32(hider ? a.flash_hider.firstShotUpMult : 1),
    upMult: f32((hider ? a.flash_hider.upMult : 1) * withBonus(gunplay.rules.bonusMath.recoilControl, 1, vertical)),
    sideMult: f32(p.barrel === "compensator" ? a.compensator.sideMult : 1),
    cameraUpPerTick: rad(t.cameraUpDegPerS / 64),
    resetTicks: ticks(t.resetS),
    stages: t.stages.map((st, i) => ({
      fromShot: w.recoil.stageStarts?.[i] ?? st.fromShot,
      up: rad(st.upDeg),
      upJitter: rad(st.upJitterDeg),
      side: rad(st.sideDeg),
      sideJitter: rad(st.sideJitterDeg),
    })),
    recenter: { fraction: f32(t.recenter.fraction), delayTicks: ticksOrZero(t.recenter.delayS * recenterTime), perTick: rad(t.recenter.degPerS / recenterTime / 64) },
  };
}

/** Resolves one weapon pick (already validated and normalized). */
export function resolveWeapon(data: GameData, p: WeaponPick): ResolvedWeapon {
  const w = data.weapons.get(p.weapon);
  if (!w || !isGun(w)) throw new Error(`${p.weapon} is not a gun`);
  const g = data.gunplay;
  const cls = g.classes[w.class];
  const sight = g.sights[p.sight ?? "iron"];
  const laser = p.underbarrel === "laser";

  const adsS = withBonus(g.rules.bonusMath.ads, w.adsS, sight.adsBonus + (laser ? g.attachments.laser.adsBonus : 0));
  const reloadF = withBonus(g.rules.bonusMath.reload, 1, p.grip === "angled" ? g.attachments.angled.reloadSpeedBonus : 0);
  let reload: ResolvedReload;
  if (w.reload.kind === "magazine") {
    const r = w.reload;
    const [ratioTac, ratioEmp] = refillRatios(data, w.class);
    const refillTac = (r.refillTacticalS ?? r.tacticalS * ratioTac) * reloadF;
    const refillEmp = (r.refillEmptyS ?? r.emptyS * ratioEmp) * reloadF;
    const magOut = g.rules.reload.magOutFractionOfRefill;
    reload = {
      kind: "magazine",
      tacticalTicks: ticks(r.tacticalS * reloadF),
      emptyTicks: ticks(r.emptyS * reloadF),
      refillTacticalTicks: ticks(refillTac),
      refillEmptyTicks: ticks(refillEmp),
      magOutTacticalTicks: ticks(refillTac * magOut),
      magOutEmptyTicks: ticks(refillEmp * magOut),
    };
  } else if (w.reload.kind === "per_shell") {
    reload = {
      kind: "per_shell",
      perShellTicks: ticks(w.reload.perShellS * reloadF),
      emptyExtraTicks: ticksOrZero((w.reload.emptyFullS - w.ammo.magazine * w.reload.perShellS) * reloadF),
    };
  } else reload = { kind: "none" };

  const d = w.damage;
  const eb = p.barrel === "extended_barrel" ? d?.extendedBarrel : undefined;
  const spread = g.spread[w.class];
  return {
    id: w.id,
    name: w.name,
    class: w.class,
    pick: p,
    fire: { kind: w.fire.kind, rpm: w.fire.rpm ?? 0, modes: [...w.fire.modes], pellets: w.fire.pellets },
    damage: d ? { base: eb?.base ?? d.base, falloff: eb?.falloff ?? d.falloff, penetration: d.penetration, head: d.head } : null,
    ammo: { ...w.ammo },
    reload,
    ads: {
      ticks: ticks(adsS),
      fromSprintTicks: ticks(adsS * g.rules.adsFromSprintMult),
      exitTicks: ticks(g.rules.adsExitS),
      curve: { ...g.curves[cls.adsCurve] },
      zoom: sight.zoom,
    },
    // movement.json's speeds are full speed, reached at the cap (a handgun, or a primary with the
    // horizontal grip); everything else is that much slower (data/gunplay.json _doc).
    moveSpeedMult: f32(Math.min(g.rules.maxMoveSpeedMult, cls.moveSpeedMult * (p.grip === "horizontal" ? g.attachments.horizontal.moveSpeedMult : 1)) / g.rules.maxMoveSpeedMult),
    suppressed: p.barrel === "suppressor" || w.integralSuppressor,
    laser,
    recoil: resolveRecoil(g, w, p),
    spread: { hip: rad(spread.hipDeg), ads: rad(spread.adsDeg), perMps: rad(spread.movePerMpsDeg) },
    destruction: w.destruction,
  };
}
