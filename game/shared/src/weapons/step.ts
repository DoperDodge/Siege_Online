// The weapon in hand, stepped inside the deterministic simulation after movement (DECISIONS D-040): fire
// cadence, fire modes, ammo, reloads and swapping. Everything here is integer ticks and rounds, so a
// client's prediction matches the server exactly; the sim only decides *when* a shot happens and emits a
// ShotEvent, and the server judges what it hits (net/room.ts).
//
// Placeholders (data/gunplay.json `rules`, research/OPEN_QUESTIONS.md): when the magazine comes out,
// whether pulled rounds return to reserve, whether firing cancels a reload, whether an empty trigger starts
// a reload, burst behaviour, and that reload presses are ignored while sprinting.
import type { Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import { eyePose } from "../player/hitboxes.js";
import { turnView, type MoveContext } from "../player/movement.js";
import type { Pawn } from "../player/pawn.js";
import { Btn, PawnMode, ReloadKind, WeaponAct, WFlag, type InputCmd, type PawnState } from "../player/types.js";
import type { ResolvedWeapon } from "./loadout.js";

/** One minute in ticks: a shot adds this to the cadence debt, every tick pays off `rpm` of it. */
export const CADENCE_UNITS = 60 * 64;

export type SimEvent =
  | {
      kind: "shot";
      pawnId: number;
      /** The input that fired (0 never: shots only come from real inputs). */
      seq: number;
      slot: number;
      weaponId: string;
      /** Bullet index in the spray. */
      shotIdx: number;
      pellets: number;
      /** The view the shot leaves along (after this tick's look, before its recoil). */
      yaw: number;
      pitch: number;
      /** Eye position when it fired. */
      origin: Vec3;
      /** Where in the tick the shot fell, 0..1 (audio and tracer timing). */
      frac: number;
      /** Spread cone half-angle when it fired (radians); the server draws the pellets in it. */
      cone: number;
    }
  | { kind: "dry"; pawnId: number; seq: number; slot: number }
  | { kind: "reload"; pawnId: number; slot: number; reloadKind: ReloadKind }
  /** Recoil moved this body's view this tick: the client adds it to its own view (D-041). */
  | { kind: "kick"; pawnId: number; dYaw: number; dPitch: number };

export type WeaponContext = MoveContext & { data: GameData; events: SimEvent[] };

export const loadedOf = (s: PawnState, slot = s.slot) => (slot === 0 ? s.loaded0 : s.loaded1);
export const reserveOf = (s: PawnState, slot = s.slot) => (slot === 0 ? s.reserve0 : s.reserve1);
function setAmmo(s: PawnState, slot: number, loaded: number, reserve: number) {
  if (slot === 0) {
    s.loaded0 = loaded;
    s.reserve0 = reserve;
  } else {
    s.loaded1 = loaded;
    s.reserve1 = reserve;
  }
}

/** The fire-mode index of a slot (nibbles of PawnState.modes). */
export const modeIndex = (s: PawnState, slot = s.slot) => (s.modes >> (slot * 4)) & 15;
export const fireModeOf = (w: ResolvedWeapon, s: PawnState, slot = s.slot) => w.fire.modes[Math.min(modeIndex(s, slot), w.fire.modes.length - 1)];

/** Holding fire (or melee, or reviving later) stops a sprint (research/core_mechanics.md §14). */
export function blocksSprint(s: PawnState, input: InputCmd): boolean {
  return (input.buttons & Btn.Fire) !== 0 || s.meleeTicks > 0 || s.reviveTarget !== 0;
}

/**
 * Aiming down sights this tick: the ADS button, on your feet, not mid-swap, melee or revive, and not in a
 * long drop (Siege X forces you out of ADS; the height is a placeholder). Decides ADS walk speed too.
 */
export function wantsAim(ctx: { data: GameData }, s: PawnState, input: InputCmd): boolean {
  if (!(input.buttons & Btn.Ads) || s.mode !== PawnMode.Walk || s.wAct === WeaponAct.Equip || s.meleeTicks > 0 || s.reviveTarget !== 0) return false;
  return s.grounded || s.airPeakY - s.y <= ctx.data.gunplay.rules.adsDropCancelM;
}

/** ADS progress 0..1 through the weapon's accuracy curve (fast / medium / slow, data/gunplay.json). */
export function adsAccuracy(w: ResolvedWeapon, adsQ: number): number {
  const t = adsQ / 65535;
  const c = w.ads.curve;
  return c.kind === "easeIn" ? t ** c.power : 1 - (1 - t) ** c.power;
}

/**
 * Spread cone half-angle (radians) for the weapon in hand: hip-fire spread blending to the ADS spread along
 * the ADS curve, widened by horizontal speed (buckshot, Y8S3). A pure function of state, so the client can
 * draw it as a crosshair; the server alone samples pellets from it (DECISIONS D-041).
 */
export function spreadCone(w: ResolvedWeapon, s: PawnState): number {
  return w.spread.hip + (w.spread.ads - w.spread.hip) * adsAccuracy(w, s.adsQ) + w.spread.perMps * Math.hypot(s.vx, s.vz);
}

/** xorshift32 on the body's recoil random state; returns a number in [-1, 1). */
function rand11(s: PawnState): number {
  let x = s.rng >>> 0 || 0x9e3779b9;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  s.rng = x >>> 0;
  return s.rng / 2147483648 - 1;
}

/** One shot's kick, added to what the view still has to climb (Ubisoft's model: stages by bullet index). */
function kick(w: ResolvedWeapon, s: PawnState) {
  const r = w.recoil;
  let stage = r.stages[0];
  for (const st of r.stages) if (st.fromShot <= s.shotIdx) stage = st;
  const first = s.shotIdx === 0 ? r.firstShotMult : 1;
  const r1 = rand11(s);
  const r2 = rand11(s);
  s.recoilPendP = Math.fround(s.recoilPendP + (stage.up + stage.upJitter * r1) * r.upMult * first * (s.shotIdx === 0 ? r.firstShotUpMult : 1));
  s.recoilPendY = Math.fround(s.recoilPendY + (stage.side + stage.sideJitter * r2) * r.sideMult * first);
}

/**
 * Move the view by the pending kick at the weapon's "Camera Up Speed", then recenter part of it once the
 * shooting stops. Positive side kick turns the view right. Emits the view change as a kick event.
 */
function releaseRecoil(ctx: WeaponContext, pawn: Pawn, w: ResolvedWeapon) {
  const s = pawn.state;
  const r = w.recoil;
  const clampTo = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  let dYaw = 0;
  let dPitch = 0;
  if (s.recoilPendP !== 0 || s.recoilPendY !== 0) {
    const p = clampTo(s.recoilPendP, r.cameraUpPerTick);
    const y = clampTo(s.recoilPendY, r.cameraUpPerTick);
    s.recoilPendP = Math.fround(s.recoilPendP - p);
    s.recoilPendY = Math.fround(s.recoilPendY - y);
    const [ay, ap] = turnView(ctx, pawn, -y, p); // a pitch clamp or a prone wall drops the excess
    s.recoilRecP = Math.fround(s.recoilRecP + ap * r.recenter.fraction);
    s.recoilRecY = Math.fround(s.recoilRecY + ay * r.recenter.fraction);
    dYaw += ay;
    dPitch += ap;
  }
  if ((s.recoilRecP !== 0 || s.recoilRecY !== 0) && s.sinceShot >= r.recenter.delayTicks) {
    const p = clampTo(s.recoilRecP, r.recenter.perTick);
    const y = clampTo(s.recoilRecY, r.recenter.perTick);
    s.recoilRecP = Math.fround(s.recoilRecP - p);
    s.recoilRecY = Math.fround(s.recoilRecY - y);
    const [ay, ap] = turnView(ctx, pawn, -y, -p);
    dYaw += ay;
    dPitch += ap;
  }
  if (dYaw !== 0 || dPitch !== 0) ctx.events.push({ kind: "kick", pawnId: pawn.id, dYaw, dPitch });
}

function endReload(s: PawnState) {
  s.wAct = WeaponAct.Ready;
  s.actTicks = 0;
  s.reloadKind = ReloadKind.None;
  s.wflags &= ~(WFlag.MagOut | WFlag.Refilled);
}

function startReload(ctx: WeaponContext, pawn: Pawn, w: ResolvedWeapon): void {
  const s = pawn.state;
  const loaded = loadedOf(s);
  if (w.reload.kind === "none" || reserveOf(s) === 0) return;
  let kind: ReloadKind;
  if (w.reload.kind === "per_shell") {
    if (loaded >= w.ammo.magazine) return;
    kind = loaded === 0 ? ReloadKind.Empty : ReloadKind.Shell;
  } else {
    // A closed-bolt gun with a round chambered tops up to magazine + 1 (weapons_notes.md §4.6).
    if (loaded >= w.ammo.magazine + (w.ammo.plusOne && loaded > 0 ? 1 : 0)) return;
    kind = loaded > 0 ? ReloadKind.Tactical : ReloadKind.Empty;
  }
  s.wAct = WeaponAct.Reload;
  s.actTicks = 0;
  s.reloadKind = kind;
  s.wflags &= ~(WFlag.MagOut | WFlag.Refilled);
  s.burstLeft = 0;
  ctx.events.push({ kind: "reload", pawnId: pawn.id, slot: s.slot, reloadKind: kind });
}

/** Immersive reload (core_mechanics.md §14): the magazine comes out, the counter refills, the animation ends. */
function advanceReload(ctx: WeaponContext, s: PawnState, w: ResolvedWeapon) {
  const r = w.reload;
  let loaded = loadedOf(s);
  let reserve = reserveOf(s);
  if (r.kind === "magazine") {
    const tactical = s.reloadKind === ReloadKind.Tactical;
    if (!(s.wflags & WFlag.MagOut) && s.actTicks >= (tactical ? r.magOutTacticalTicks : r.magOutEmptyTicks)) {
      // A closed-bolt gun keeps its chambered round; the rest leave with the magazine.
      const keep = w.ammo.plusOne && loaded > 0 ? 1 : 0;
      if (ctx.data.gunplay.rules.reload.pulledRoundsReturn) reserve += loaded - keep;
      loaded = keep;
      s.wflags |= WFlag.MagOut;
    }
    if (!(s.wflags & WFlag.Refilled) && s.actTicks >= (tactical ? r.refillTacticalTicks : r.refillEmptyTicks)) {
      const add = Math.min(reserve, w.ammo.magazine);
      loaded += add;
      reserve -= add;
      s.wflags |= WFlag.Refilled;
    }
    setAmmo(s, s.slot, loaded, reserve);
    if (s.actTicks >= (tactical ? r.tacticalTicks : r.emptyTicks)) endReload(s);
  } else if (r.kind === "per_shell") {
    // From empty the overhead comes first (placeholder), then one shell at a time.
    const t = s.actTicks - (s.reloadKind === ReloadKind.Empty ? r.emptyExtraTicks : 0);
    if (t > 0 && t % r.perShellTicks === 0 && reserve > 0) {
      loaded++;
      reserve--;
      setAmmo(s, s.slot, loaded, reserve);
    }
    if (loaded >= w.ammo.magazine || reserve === 0) endReload(s);
  } else endReload(s);
}

/**
 * Stops whatever the weapon was doing on a body nobody is driving (Skopós's shell left behind on a swap):
 * a reload is cancelled (an immersive one leaves what was in the weapon), a burst or queued shot dropped.
 */
export function parkWeapon(s: PawnState): void {
  if (s.wAct === WeaponAct.Reload) endReload(s);
  s.burstLeft = 0;
  s.wflags &= ~WFlag.FireQueued;
  s.recoilPendP = s.recoilPendY = s.recoilRecP = s.recoilRecY = 0;
}

/** One tick of the weapon in hand, after movement. `pressed` = buttons that went down this tick. */
export function stepWeapon(ctx: WeaponContext, pawn: Pawn, input: InputCmd, pressed: number): void {
  const lo = pawn.loadout;
  if (!lo) return;
  const s = pawn.state;
  const rules = ctx.data.gunplay.rules;
  const exitToFire = ctx.data.movement.sprint.exitToFireSeconds;
  const walking = s.mode === PawnMode.Walk;
  let w = lo.weapons[s.slot];

  // 1. Timers.
  if (s.wAct !== WeaponAct.Ready) s.actTicks = Math.min(0xffff, s.actTicks + 1);
  s.sinceShot = Math.min(0xffff, s.sinceShot + 1);
  if (s.sinceShot >= w.recoil.resetTicks) s.shotIdx = 0;

  // 2. Interrupts: sprinting, a vault or a ladder cancel a reload.
  if (s.wAct === WeaponAct.Reload && ((rules.reload.sprintInterrupts && s.sprinting) || !walking)) endReload(s);

  // 3. Presses.
  if (pressed & Btn.Swap && s.wAct !== WeaponAct.Equip) {
    if (s.wAct === WeaponAct.Reload) endReload(s);
    s.slot ^= 1;
    s.wAct = WeaponAct.Equip;
    s.actTicks = 0;
    s.burstLeft = 0;
    s.shotIdx = 0;
    s.wflags &= ~WFlag.FireQueued;
    w = lo.weapons[s.slot];
  }
  if (pressed & Btn.FireMode && w.fire.modes.length > 1) {
    const next = (modeIndex(s) + 1) % w.fire.modes.length;
    s.modes = (s.modes & ~(15 << (s.slot * 4))) | (next << (s.slot * 4));
    s.burstLeft = 0;
  }
  if (pressed & Btn.Reload && s.wAct === WeaponAct.Ready && walking && !s.sprinting) startReload(ctx, pawn, w);

  // 4. The current action.
  if (s.wAct === WeaponAct.Equip && s.actTicks >= lo.swapTicks) {
    s.wAct = WeaponAct.Ready;
    s.actTicks = 0;
  }
  if (s.wAct === WeaponAct.Reload) advanceReload(ctx, s, w);

  // 5. ADS: rising over the weapon's ADS ticks (slower straight out of a sprint), falling over the exit time.
  if (wantsAim(ctx, s, input)) {
    if (s.adsQ === 0) {
      if (s.sprinting || s.sinceSprint < exitToFire - 1e-6) s.wflags |= WFlag.AdsFromSprint;
      else s.wflags &= ~WFlag.AdsFromSprint;
    }
    s.adsQ = Math.min(65535, s.adsQ + Math.ceil(65536 / (s.wflags & WFlag.AdsFromSprint ? w.ads.fromSprintTicks : w.ads.ticks)));
  } else {
    s.adsQ = Math.max(0, s.adsQ - Math.ceil(65536 / w.ads.exitTicks));
    if (s.adsQ === 0) s.wflags &= ~WFlag.AdsFromSprint;
  }

  // 6. Trigger. Shots need a body on its feet, out of the sprint exit, with the weapon up (or reloading
  // with a round in it: firing cancels the reload).
  const mode = fireModeOf(w, s);
  const held = (input.buttons & Btn.Fire) !== 0;
  const press = (pressed & Btn.Fire) !== 0;
  const realInput = input.seq !== 0;
  if (!held && rules.fire.burstReleaseCancels) s.burstLeft = 0;
  const sprintGate = !s.sprinting && s.sinceSprint >= exitToFire - 1e-6;
  const loaded = loadedOf(s);
  const ready = s.wAct === WeaponAct.Ready || (s.wAct === WeaponAct.Reload && loaded > 0 && rules.reload.fireCancels);
  const gate = walking && sprintGate && ready && s.meleeTicks === 0 && s.reviveTarget === 0 && w.fire.kind === "hitscan";
  // A press during the sprint exit fires once it ends, but only on a tick with real input (its view and seq).
  if (press && !sprintGate) s.wflags |= WFlag.FireQueued;
  let queued = false;
  if (s.wflags & WFlag.FireQueued && (sprintGate || !realInput)) {
    s.wflags &= ~WFlag.FireQueued;
    queued = realInput;
  }
  const start = (press && sprintGate) || queued;
  let want: boolean;
  if (mode === "auto") want = held || queued;
  else if (mode === "semi") want = start;
  else {
    if (start && gate) s.burstLeft = mode === "burst2" ? 2 : 3;
    want = s.burstLeft > 0;
  }

  if (want && gate) {
    if (loaded === 0) {
      if (start) {
        ctx.events.push({ kind: "dry", pawnId: pawn.id, seq: input.seq, slot: s.slot });
        if (rules.fire.autoReloadOnEmpty && s.wAct === WeaponAct.Ready && !s.sprinting) startReload(ctx, pawn, w);
      }
      s.burstLeft = 0;
    } else if (s.cycle < w.fire.rpm) {
      if (s.wAct === WeaponAct.Reload) endReload(s);
      setAmmo(s, s.slot, loaded - 1, reserveOf(s));
      ctx.events.push({
        kind: "shot",
        pawnId: pawn.id,
        seq: input.seq,
        slot: s.slot,
        weaponId: w.id,
        shotIdx: s.shotIdx,
        pellets: w.fire.pellets,
        yaw: s.yaw,
        pitch: s.pitch,
        origin: eyePose(ctx.data.movement, ctx.data.hitboxes, s).pos,
        frac: s.cycle / w.fire.rpm,
        cone: spreadCone(w, s),
      });
      s.cycle += CADENCE_UNITS;
      kick(w, s); // after the shot left: every bullet goes where the crosshair was when the input was sampled
      s.shotIdx = Math.min(0xffff, s.shotIdx + 1);
      s.sinceShot = 0;
      if (s.burstLeft > 0) s.burstLeft--;
    }
  }
  s.cycle = Math.max(0, s.cycle - w.fire.rpm);

  // 7. Recoil reaches the view.
  releaseRecoil(ctx, pawn, w);
}
