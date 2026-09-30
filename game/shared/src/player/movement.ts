// The per-tick movement step. Pure function of (pawn state, input, static level, data), shared by the
// server (authority) and the browser (prediction). Values come from data/movement.json (PLAN §7).
import { DT } from "../core/constants.js";
import { approach, clamp, DEG, forwardXZ, lerp, quatYawPitchRoll, rightXZ, rotateXZ, smoothstep, wrapAngle } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { BuiltLevel } from "../level/builder.js";
import { QUERY_STATIC, type CharacterController, type Rapier, type World } from "../physics/rapier.js";
import { eyePose, proneBendLift, proneBodyExtents } from "./hitboxes.js";
import type { Pawn } from "./pawn.js";
import { capsuleDims, currentHeight, proneWeight, stanceDims, transitionSeconds } from "./stance.js";
import { Btn, PawnMode, STANCE_KEYS, Stance, type InputCmd, type PawnState } from "./types.js";

export interface MoveContext {
  R: Rapier;
  world: World;
  cc: CharacterController;
  data: GameData;
  level: BuiltLevel;
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const SKIN = 0.02;
/** How far a prone body may sink into geometry after a move before the move is refused (float noise). */
const PRONE_TOLERANCE = 0.005;

export function stepPawn(ctx: MoveContext, pawn: Pawn, input: InputCmd): void {
  const s = pawn.state;
  const pressed = input.buttons & ~s.prevButtons;
  s.prevButtons = input.buttons;
  s.lastFallDamage = 0;
  if (s.mode === PawnMode.Dead) return;

  updateLook(ctx, pawn, input);

  if (s.mode === PawnMode.Ladder) {
    stepLadder(ctx, pawn, input, pressed);
  } else if (s.mode === PawnMode.Vault) {
    stepScriptedMove(ctx, pawn);
  } else {
    stepWalk(ctx, pawn, input, pressed);
  }
  roundState(s);
}

// ---------------------------------------------------------------- look

function updateLook(ctx: MoveContext, pawn: Pawn, input: InputCmd) {
  const m = ctx.data.movement;
  const s = pawn.state;
  let pitchMin = m.look.pitchMinDeg * DEG;
  let pitchMax = m.look.pitchMaxDeg * DEG;
  if (s.mode === PawnMode.Walk && proneWeight(s) > 0) {
    // Lying down (and getting down or up) limits turn speed and aim arc (PLAN §7); turning is also
    // blocked if the body would clip a wall.
    pitchMin = m.stance.pronePitchMinDeg * DEG;
    pitchMax = m.stance.pronePitchMaxDeg * DEG;
    const maxTurn = m.stance.proneTurnRateDeg * DEG * DT;
    const delta = clamp(wrapAngle(input.yaw - s.yaw), -maxTurn, maxTurn);
    if (delta !== 0) {
      const next = wrapAngle(s.yaw + delta);
      const fit = proneFitFree(ctx, pawn, s.x, s.y, s.z, next, 0);
      if (fit) {
        s.yaw = next;
        setTilt(s, fit);
      }
    }
  } else {
    s.yaw = wrapAngle(input.yaw);
  }
  s.pitch = clamp(input.pitch, pitchMin, pitchMax);
}

// ---------------------------------------------------------------- walking (incl. stance, sprint, lean)

function stepWalk(ctx: MoveContext, pawn: Pawn, input: InputCmd, pressed: number) {
  const m = ctx.data.movement;
  const s = pawn.state;

  updateStance(ctx, pawn, input);
  const height = currentHeight(m, s);
  placeCollider(ctx, pawn, height);

  // Contextual actions first: ladders (interact or vault key) and vaulting (held vault key is buffered).
  if ((pressed & Btn.Interact || input.buttons & Btn.Vault) && tryAttachLadder(ctx, pawn)) return;
  if (input.buttons & Btn.Vault && s.grounded && s.stance !== Stance.Prone && s.stanceT >= 1 && tryVault(ctx, pawn)) return;

  // Speed for this tick.
  const op = ctx.data.operators.get(pawn.operatorId);
  const rating = String(op?.speedRating ?? 2) as "1" | "2" | "3";
  const walk = m.speed.walkByRating[rating];
  const stanceSpeed = (st: Stance) => (st === Stance.Prone ? m.speed.proneSpeed : st === Stance.Crouch ? walk * m.speed.crouchWalkFactor : walk);
  let speed = s.stanceT < 1 ? Math.min(stanceSpeed(s.stanceFrom), stanceSpeed(s.stance)) : stanceSpeed(s.stance);
  const ads = (input.buttons & Btn.Ads) !== 0;
  if (ads && s.stance !== Stance.Prone) speed = Math.min(speed, m.speed.adsWalkSpeed);
  if (input.buttons & Btn.SlowWalk) speed *= m.speed.slowWalkFactor;

  const sprinting =
    (input.buttons & Btn.Sprint) !== 0 &&
    input.forward > m.sprint.forwardThreshold &&
    !ads &&
    s.stance === Stance.Stand &&
    s.stanceT >= 1 &&
    s.grounded;
  if (sprinting) speed = m.speed.sprintByRating[rating];
  s.sinceSprint = sprinting ? 0 : s.sinceSprint + DT;
  s.sprinting = sprinting;

  // Desired horizontal velocity, then accelerate toward it (air keeps momentum: Siege X, short ledges).
  let f = input.forward;
  let st = input.strafe;
  const len = Math.hypot(f, st);
  if (len > 1) {
    f /= len;
    st /= len;
  }
  const [fx, fz] = forwardXZ(s.yaw);
  const [rx, rz] = rightXZ(s.yaw);
  const wx = (fx * f + rx * st) * speed;
  const wz = (fz * f + rz * st) * speed;
  const accel = s.grounded ? (Math.hypot(wx, wz) > 1e-3 ? m.speed.groundAccel : m.speed.groundDecel) : m.speed.airAccel;
  const dvx = wx - s.vx;
  const dvz = wz - s.vz;
  const dl = Math.hypot(dvx, dvz);
  const maxDv = accel * DT;
  if (dl <= maxDv) {
    s.vx = wx;
    s.vz = wz;
  } else {
    s.vx += (dvx / dl) * maxDv;
    s.vz += (dvz / dl) * maxDv;
  }

  updateLean(ctx, pawn, input);

  // Gravity (Siege has no jump: the vault key is the only way up).
  s.vy = s.grounded ? m.gravity * DT : s.vy + m.gravity * DT;

  const wasGrounded = s.grounded;
  let dx = s.vx * DT;
  let dz = s.vz * DT;
  // Lying down, the body reaches far beyond the small movement capsule: sweep it so the head, arms and
  // legs stop short of walls (and slide along them) instead of crawling into them.
  const prone = proneWeight(s) > 0;
  const fit = prone ? (proneFit(ctx, pawn, s.x, s.y, s.z, s.yaw) ?? { tF: s.tiltF, tB: s.tiltB, side: s.tiltSide }) : null;
  if (fit && (dx !== 0 || dz !== 0)) [dx, dz] = proneSweep(ctx, pawn, fit, dx, dz);
  let mv = moveCollider(ctx, pawn, dx, s.vy * DT, dz);
  if (
    fit &&
    (mv.x !== 0 || mv.z !== 0) &&
    ((s.grounded && !groundWithin(ctx, pawn, s.x + mv.x, s.y + mv.y, s.z + mv.z, m.step.maxStepHeight)) ||
      !proneFitFree(ctx, pawn, s.x + mv.x, s.y + mv.y, s.z + mv.z, s.yaw, -PRONE_TOLERANCE))
  ) {
    // Stay put if the body would have to bend into something there (a crest under a low ceiling, a slope
    // beside a wall), or would crawl off a drop taller than a step (DECISIONS D-023: stand up to drop).
    mv = moveCollider(ctx, pawn, 0, s.vy * DT, 0);
  }
  const c = pawn.collider.translation();
  pawn.collider.setTranslation({ x: c.x + mv.x, y: c.y + mv.y, z: c.z + mv.z });
  readFeet(ctx, pawn, height);
  // Only ground you could walk up counts: on steeper slopes you keep falling and slide off.
  const n = groundNormal(ctx, pawn);
  s.grounded = ctx.cc.computedGrounded() && (!n || n.y >= Math.cos(m.step.maxSlopeDeg * DEG) - 1e-6);
  if (s.grounded || (s.vy > 0 && mv.y < s.vy * DT - 1e-4)) s.vy = 0;
  if (prone) {
    const f = proneFit(ctx, pawn, s.x, s.y, s.z, s.yaw);
    if (f) setTilt(s, f);
  } else {
    s.tiltF = s.tiltB = s.tiltSide = 0;
  }

  trackFall(ctx, pawn, wasGrounded);
}

/** Run the character controller for one step; while grounded, the step follows the ground plane. */
function moveCollider(ctx: MoveContext, pawn: Pawn, dx: number, dy: number, dz: number): { x: number; y: number; z: number } {
  if (pawn.state.grounded) {
    // Follow the ground plane so horizontal speed holds on ramps and stairs (the controller would
    // otherwise project the step onto the slope and lose ~40% of it on a 40° incline).
    const n = groundNormal(ctx, pawn);
    if (n && n.y >= Math.cos(ctx.data.movement.step.maxSlopeDeg * DEG)) dy += -(n.x * dx + n.z * dz) / n.y;
  }
  ctx.cc.computeColliderMovement(pawn.collider, { x: dx, y: dy, z: dz }, undefined, QUERY_STATIC);
  const mv = ctx.cc.computedMovement();
  return { x: mv.x, y: mv.y, z: mv.z };
}

function updateStance(ctx: MoveContext, pawn: Pawn, input: InputCmd) {
  const m = ctx.data.movement;
  const s = pawn.state;
  if (s.stanceT < 1) {
    // Transitions always finish before a new one starts (Siege removed crouch/lean spam in Y4S1).
    s.stanceT = Math.min(1, s.stanceT + DT / transitionSeconds(m, s.stanceFrom, s.stance));
    return;
  }
  let desired = input.stance;
  const wantsSprint =
    (input.buttons & Btn.Sprint) !== 0 && input.forward > m.sprint.forwardThreshold && (input.buttons & Btn.Ads) === 0 && s.grounded;
  // Sprinting forward overrides a crouch request (you stand up and run).
  if (wantsSprint && m.sprint.forcesStand && desired === Stance.Crouch) desired = Stance.Stand;
  if (desired === s.stance || !canEnterStance(ctx, pawn, desired)) return;
  s.stanceFrom = s.stance;
  s.stance = desired;
  s.stanceT = 0;
}

function canEnterStance(ctx: MoveContext, pawn: Pawn, target: Stance): boolean {
  const m = ctx.data.movement;
  const s = pawn.state;
  if (target === Stance.Prone) return s.grounded && proneFitFree(ctx, pawn, s.x, s.y, s.z, s.yaw, SKIN / 2) !== null;
  const targetHeight = stanceDims(m, target).height;
  if (targetHeight <= currentHeight(m, s)) return true;
  return capsuleFree(ctx, pawn, s.x, s.y, s.z, targetHeight);
}

function updateLean(ctx: MoveContext, pawn: Pawn, input: InputCmd) {
  const m = ctx.data.movement;
  const s = pawn.state;
  const w = proneWeight(s);
  let target: number = input.lean;
  if (!m.lean.allowInStances.includes(STANCE_KEYS[s.stance]) || (s.sprinting && m.lean.sprintCancelsLean)) target = 0;
  if (w > 0 && w < 1) target = 0; // no leaning while getting down or up
  let lean = approach(s.lean, target, DT / m.lean.seconds);
  if (w > 0 && lean !== s.lean) {
    // Lying down, leaning shifts the whole upper body sideways: sweep it so the arms stop at walls too.
    const m0 = m.lean.offset * m.lean.proneOffsetScale;
    const shift = (lean - s.lean) * m0;
    const [rx, rz] = rightXZ(s.yaw);
    const fit = { tF: s.tiltF, tB: s.tiltB, side: s.tiltSide };
    const [upper] = proneBoxes(ctx, s.x, s.y, s.z, s.yaw, fit, s.lean, 0);
    const hit = ctx.world.castShape(upper.pos, upper.rot, { x: rx * shift, y: 0, z: rz * shift }, upper.shape, 0, 1, false, undefined, QUERY_STATIC, pawn.collider);
    if (hit) lean = s.lean + (lean - s.lean) * clamp(hit.time_of_impact - SKIN / Math.abs(shift), 0, 1);
  }
  if (lean !== 0) {
    // The head can't pass through walls: sweep a head-sized sphere from the unleaned eye to the leaned eye.
    const from = eyePose(m, ctx.data.hitboxes, s, 0).pos;
    const to = eyePose(m, ctx.data.hitboxes, s, lean).pos;
    const hit = ctx.world.castShape(
      { x: from[0], y: from[1], z: from[2] },
      IDENTITY,
      { x: to[0] - from[0], y: to[1] - from[1], z: to[2] - from[2] },
      new ctx.R.Ball(ctx.data.hitboxes.parts.head.radius),
      0,
      1,
      true,
      undefined,
      QUERY_STATIC,
      pawn.collider,
    );
    if (hit) lean *= clamp(hit.time_of_impact - 0.05, 0, 1);
  }
  s.lean = lean;
}

// ---------------------------------------------------------------- falls

function trackFall(ctx: MoveContext, pawn: Pawn, wasGrounded: boolean) {
  const f = ctx.data.movement.fall;
  const s = pawn.state;
  if (!s.grounded) {
    s.airPeakY = Math.max(s.airPeakY, s.y);
    return;
  }
  if (!wasGrounded) {
    const drop = s.airPeakY - s.y;
    if (drop > f.safeHeight) {
      const frac = (drop - f.safeHeight) / (f.lethalHeight - f.safeHeight);
      const dmg = frac >= 1 ? s.hp : Math.round(frac * s.maxHp);
      s.hp = Math.max(0, s.hp - dmg);
      s.lastFallDamage = dmg;
      // Lethal falls kill outright, no DBNO (research/core_mechanics.md §8).
      if (s.hp === 0) s.mode = PawnMode.Dead;
    }
    s.airPeakY = s.y;
    return;
  }
  // Only trust the ground height while standing on it, not while the capsule rolls off an edge.
  s.airPeakY = groundNormal(ctx, pawn) ? s.y : Math.max(s.airPeakY, s.y);
}

// ---------------------------------------------------------------- vault

export interface VaultPlan {
  /** true = vault over a low, thin obstacle; false = mantle onto it. */
  over: boolean;
  toX: number;
  toY: number;
  toZ: number;
  apexY: number;
  seconds: number;
  /** Standing won't fit at the landing spot, so you land crouched. */
  landCrouched: boolean;
}

/**
 * Is there something to vault or mantle straight ahead (the direction you're facing, even standing
 * still)? Read-only: used both to start a vault and to show the on-screen prompt.
 */
export function planVault(ctx: MoveContext, pawn: Pawn): VaultPlan | null {
  const m = ctx.data.movement;
  const v = m.vault;
  const s = pawn.state;
  const r = m.stance.collisionRadius;
  const [fx, fz] = forwardXZ(s.yaw);
  const ray = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) =>
    ctx.world.castRay(new ctx.R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }), max, true, undefined, QUERY_STATIC, pawn.collider);

  // 1. A vaultable obstacle straight ahead at shin height (vaultability is tagged in map data).
  const front = ray(s.x, s.y + v.minHeight * 0.5, s.z, fx, 0, fz, r + v.reach);
  if (!front || !ctx.level.solids.get(front.collider.handle)?.vaultable) return null;
  const face = front.timeOfImpact;

  // 2. Its top surface, found by casting down just past the front face.
  const topStart = s.y + v.maxOntoHeight + 0.3;
  const px = s.x + fx * (face + 0.05);
  const pz = s.z + fz * (face + 0.05);
  const down = ray(px, topStart, pz, 0, -1, 0, v.maxOntoHeight + 0.35);
  if (!down || down.collider.handle !== front.collider.handle) return null;
  const topY = topStart - down.timeOfImpact;
  const h = topY - s.y;
  if (h < v.minHeight || h > v.maxOntoHeight) return null;

  // 3. Depth: walk along the top until it ends. Thin + low enough = vault over; otherwise mantle onto.
  let depth = Infinity;
  for (let d = 0.1; d <= v.maxOverDepth + 0.1001; d += 0.1) {
    const probe = ray(s.x + fx * (face + d), topY + 0.2, s.z + fz * (face + d), 0, -1, 0, 0.35);
    if (!probe || topY + 0.2 - probe.timeOfImpact < topY - 0.1) {
      depth = d;
      break;
    }
  }
  const over = depth !== Infinity && h <= v.maxOverHeight;
  if (!over && depth !== Infinity) return null; // too tall to vault over, too thin to stand on

  // 4. Landing spot.
  let toX: number;
  let toY: number;
  let toZ: number;
  if (over) {
    const land = face + depth + r + 0.1;
    toX = s.x + fx * land;
    toZ = s.z + fz * land;
    const floor = ray(toX, topY + 0.2, toZ, 0, -1, 0, topY + 0.2 - s.y + 3);
    if (!floor) return null;
    toY = topY + 0.2 - floor.timeOfImpact;
  } else {
    const land = face + r + 0.15;
    toX = s.x + fx * land;
    toZ = s.z + fz * land;
    toY = topY;
  }

  // 5. Clearance above the obstacle (body tucked) and at the landing spot (crouch if standing won't fit).
  const midX = s.x + fx * (face + Math.min(depth === Infinity ? 0.2 : depth, 0.5) / 2);
  const midZ = s.z + fz * (face + Math.min(depth === Infinity ? 0.2 : depth, 0.5) / 2);
  if (!capsuleFree(ctx, pawn, midX, topY + v.clearance, midZ, v.apexBodyHeight)) return null;
  let landCrouched = false;
  if (!capsuleFree(ctx, pawn, toX, toY, toZ, currentHeight(m, s))) {
    if (!capsuleFree(ctx, pawn, toX, toY, toZ, m.stance.crouch.height)) return null;
    landCrouched = true;
  }
  return { over, toX, toY, toZ, apexY: topY + v.clearance, seconds: v.secondsBase + v.secondsPerMeter * h, landCrouched };
}

function tryVault(ctx: MoveContext, pawn: Pawn): boolean {
  const plan = planVault(ctx, pawn);
  if (!plan) return false;
  const s = pawn.state;
  if (plan.landCrouched) {
    s.stance = s.stanceFrom = Stance.Crouch;
    s.stanceT = 1;
  }
  startScriptedMove(s, plan.toX, plan.toY, plan.toZ, plan.apexY, plan.seconds);
  return true;
}

function startScriptedMove(s: PawnState, toX: number, toY: number, toZ: number, apexY: number, seconds: number) {
  s.mode = PawnMode.Vault;
  s.moveT = 0;
  s.moveDur = Math.fround(seconds);
  s.fromX = s.x;
  s.fromY = s.y;
  s.fromZ = s.z;
  s.toX = Math.fround(toX);
  s.toY = Math.fround(toY);
  s.toZ = Math.fround(toZ);
  s.apexY = Math.fround(Math.max(apexY, s.y, toY));
  s.tuck = 0;
  s.vx = s.vy = s.vz = 0;
  s.lean = 0;
  s.sprinting = false;
}

/**
 * Vaults and ladder dismounts: a timed move from `from` to `to` that rises to exactly `apexY` halfway,
 * with the body tucked (lower height and eye) in the middle. Clearance is checked when it starts.
 */
function stepScriptedMove(ctx: MoveContext, pawn: Pawn) {
  const s = pawn.state;
  s.moveT += DT;
  const u = Math.min(1, s.moveT / s.moveDur);
  const e = smoothstep(u);
  const x = lerp(s.fromX, s.toX, e);
  const z = lerp(s.fromZ, s.toZ, e);
  // Rise (ease out) to the apex over the first half, then settle (ease in) onto the landing spot.
  const y = u < 0.5 ? lerp(s.fromY, s.apexY, 1 - (1 - 2 * u) ** 2) : lerp(s.apexY, s.toY, (2 * u - 1) ** 2);
  s.tuck = Math.fround(Math.sin(Math.PI * u));
  setFeet(ctx, pawn, x, y, z, currentHeight(ctx.data.movement, s));
  if (u >= 1) {
    s.mode = PawnMode.Walk;
    s.tuck = 0;
    s.grounded = false;
    s.airPeakY = s.y;
    setFeet(ctx, pawn, s.x, s.y, s.z, currentHeight(ctx.data.movement, s));
  }
}

// ---------------------------------------------------------------- ladders

function ladderClimbPoint(ctx: MoveContext, i: number): [number, number] {
  const L = ctx.level.ladders[i];
  const off = ctx.data.movement.stance.collisionRadius + 0.05;
  return [L.base[0] - L.forward[0] * off, L.base[2] - L.forward[1] * off];
}

/** Index of a ladder you're standing at and facing (you can grab it), or -1. Read-only. */
export function findLadder(ctx: MoveContext, pawn: Pawn): number {
  const m = ctx.data.movement;
  const s = pawn.state;
  const [pfx, pfz] = forwardXZ(s.yaw);
  for (let i = 0; i < ctx.level.ladders.length; i++) {
    const L = ctx.level.ladders[i];
    const [cx, cz] = ladderClimbPoint(ctx, i);
    if (Math.hypot(s.x - cx, s.z - cz) > m.ladder.attachDistance) continue;
    if (s.y < L.base[1] - m.ladder.bottomGrabMargin || s.y > L.base[1] + L.height - m.ladder.topGrabMargin) continue;
    if (pfx * L.forward[0] + pfz * L.forward[1] < 0.5) continue; // must face the ladder
    // Only from a settled stand: stand up first (Siege makes you wait out the transition too).
    if (s.stance !== Stance.Stand || s.stanceT < 1) continue;
    return i;
  }
  return -1;
}

function tryAttachLadder(ctx: MoveContext, pawn: Pawn): boolean {
  const i = findLadder(ctx, pawn);
  if (i < 0) return false;
  const m = ctx.data.movement;
  const s = pawn.state;
  const [cx, cz] = ladderClimbPoint(ctx, i);
  s.mode = PawnMode.Ladder;
  s.ladder = i;
  s.vx = s.vy = s.vz = 0;
  s.lean = 0;
  s.sprinting = false;
  s.grounded = false;
  setFeet(ctx, pawn, cx, s.y, cz, m.stance.stand.height);
  return true;
}

export type MovementPrompt = "mantle" | "ladder" | null;

/**
 * Which contextual prompt to show right now ("Space to mantle", "F to climb"). Like Siege, it appears
 * whenever you face something usable — you don't need to be moving.
 */
export function movementPrompt(ctx: MoveContext, pawn: Pawn): MovementPrompt {
  const s = pawn.state;
  if (s.mode !== PawnMode.Walk) return null;
  if (findLadder(ctx, pawn) >= 0) return "ladder";
  if (s.grounded && s.stance !== Stance.Prone && s.stanceT >= 1 && planVault(ctx, pawn)) return "mantle";
  return null;
}

function stepLadder(ctx: MoveContext, pawn: Pawn, input: InputCmd, pressed: number) {
  const m = ctx.data.movement;
  const s = pawn.state;
  const L = ctx.level.ladders[s.ladder];
  if (pressed & Btn.Interact) {
    // Let go (fall damage applies from wherever you are).
    s.mode = PawnMode.Walk;
    s.ladder = -1;
    return;
  }
  const slide = input.stance !== Stance.Stand && input.forward <= 0; // hold crouch to slide down
  const vy = slide ? -m.ladder.slideSpeed : input.forward * m.ladder.climbSpeed;
  const [cx, cz] = ladderClimbPoint(ctx, s.ladder);
  const top = L.base[1] + L.height;
  let y = s.y + vy * DT;
  if (vy > 0 && y >= top - 0.05) {
    // Climb off the top onto the platform.
    const d = m.stance.collisionRadius + 0.05 + m.ladder.dismountForward;
    s.ladder = -1;
    startScriptedMove(s, cx + L.forward[0] * d, top, cz + L.forward[1] * d, top + m.ladder.dismountApex, m.ladder.dismountSeconds);
    return;
  }
  if (vy < 0 && y <= L.base[1]) {
    y = L.base[1];
    s.mode = PawnMode.Walk;
    s.ladder = -1;
  }
  setFeet(ctx, pawn, cx, y, cz, m.stance.stand.height);
  s.airPeakY = s.y;
}

// ---------------------------------------------------------------- collider helpers

function placeCollider(ctx: MoveContext, pawn: Pawn, height: number) {
  setFeet(ctx, pawn, pawn.state.x, pawn.state.y, pawn.state.z, height);
}

function setFeet(ctx: MoveContext, pawn: Pawn, x: number, y: number, z: number, height: number) {
  const { r, hh } = capsuleDims(height, ctx.data.movement.stance.collisionRadius);
  pawn.collider.setRadius(r);
  pawn.collider.setHalfHeight(hh);
  pawn.collider.setTranslation({ x, y: y + hh + r, z });
  readFeet(ctx, pawn, height);
}

/** Copy the collider position (float32 as stored by Rapier) back into the state so both sides round alike. */
function readFeet(ctx: MoveContext, pawn: Pawn, height: number) {
  const { r, hh } = capsuleDims(height, ctx.data.movement.stance.collisionRadius);
  const t = pawn.collider.translation();
  pawn.state.x = t.x;
  pawn.state.y = Math.fround(t.y - (hh + r));
  pawn.state.z = t.z;
}

/** Surface normal of the ground directly under the feet, if any is within reach. */
function groundNormal(ctx: MoveContext, pawn: Pawn): { x: number; y: number; z: number } | null {
  return groundNormalAt(ctx, pawn, pawn.state.x, pawn.state.y, pawn.state.z);
}

function groundNormalAt(ctx: MoveContext, pawn: Pawn, x: number, y: number, z: number): { x: number; y: number; z: number } | null {
  const hit = ctx.world.castRayAndGetNormal(
    new ctx.R.Ray({ x, y: y + 0.1, z }, { x: 0, y: -1, z: 0 }),
    0.45,
    true,
    undefined,
    QUERY_STATIC,
    pawn.collider,
  );
  return hit ? hit.normal : null;
}

/** Is there ground at most `depth` below these feet? */
function groundWithin(ctx: MoveContext, pawn: Pawn, x: number, y: number, z: number, depth: number): boolean {
  const ray = new ctx.R.Ray({ x, y: y + 0.1, z }, { x: 0, y: -1, z: 0 });
  return ctx.world.castRay(ray, depth + 0.1 + SKIN, true, undefined, QUERY_STATIC, pawn.collider) !== null;
}

/** Is an upright capsule of `height` standing at these feet free of level geometry? */
export function capsuleFree(ctx: MoveContext, pawn: Pawn | null, x: number, y: number, z: number, height: number): boolean {
  const { r, hh } = capsuleDims(height - SKIN * 2, ctx.data.movement.stance.collisionRadius - SKIN);
  const hit = ctx.world.intersectionWithShape(
    { x, y: y + SKIN * 1.5 + hh + r, z },
    IDENTITY,
    new ctx.R.Capsule(hh, r),
    undefined,
    QUERY_STATIC,
    pawn?.collider,
  );
  return hit === null;
}

// ---------------------------------------------------------------- the lying-down body

interface ProneBody {
  front: number;
  back: number;
  halfWidth: number;
  top: number;
  lift: number;
}

/** How the lying body rests on the ground (PawnState.tiltF / tiltB / tiltSide). */
interface ProneFit {
  tF: number;
  tB: number;
  side: number;
}

const proneBodies = new WeakMap<GameData, ProneBody>();
/** Spacing of the ground probes under the lying body. */
const PRONE_PROBE_SPACING = 0.15;
/** Probes are at most this much further apart than the nominal spacing (reach / ceil(reach / spacing)). */
const reachSpacingSlack = 1.05;
/** The upper-body and leg boxes overlap this much at the hinge so nothing slips between them. */
const PRONE_HINGE_OVERLAP = 0.1;

function proneBody(ctx: MoveContext): ProneBody {
  let b = proneBodies.get(ctx.data);
  if (!b) {
    const m = ctx.data.movement;
    const e = proneBodyExtents(m, ctx.data.hitboxes);
    // At least as wide as the standing clearance test (capsuleFree), so a body that fits can always get up.
    b = { ...e, halfWidth: Math.max(e.halfWidth, m.stance.collisionRadius - SKIN), lift: m.stance.proneBodyLift };
    proneBodies.set(ctx.data, b);
  }
  return b;
}

function setTilt(s: PawnState, fit: ProneFit) {
  s.tiltF = Math.fround(fit.tF);
  s.tiltB = Math.fround(fit.tB);
  s.tiltSide = Math.fround(fit.side);
}

/**
 * How the lying body would rest here: the upper body and the legs each pitch about the feet point to lie
 * on the highest ground beneath them (probed every 15 cm), so the body follows ramps, stairs, crests and
 * troughs. Null if the ground is too steep to lie on, or something taller than a step is in the way.
 */
function proneFit(ctx: MoveContext, pawn: Pawn, x: number, y: number, z: number, yaw: number): ProneFit | null {
  const m = ctx.data.movement;
  const b = proneBody(ctx);
  const maxK = Math.tan(m.step.maxSlopeDeg * DEG);
  const [fx, fz] = forwardXZ(yaw);
  const probeTop = y + b.top * 0.75; // below anything the body could crawl under
  const ray = (px: number, py: number, pz: number, len: number) =>
    ctx.world.castRay(new ctx.R.Ray({ x: px, y: py, z: pz }, { x: 0, y: -1, z: 0 }), len, true, undefined, QUERY_STATIC, pawn.collider);
  // Ground height relative to the feet, `d` meters along the facing (negative = behind).
  // -Infinity: nothing within reach (a drop). +Infinity: blocked (a wall).
  const groundAt = (d: number): number => {
    const px = x + fx * d;
    const pz = z + fz * d;
    const rise = Math.abs(d) * maxK;
    const hit = ray(px, probeTop, pz, probeTop - y + rise + 0.2); // + the capsule's float above a slope
    if (!hit) return -Infinity;
    if (hit.timeOfImpact > 0) return probeTop - hit.timeOfImpact - y;
    // The probe starts inside something: ground rising steeply (stairs, a ramp going up) or a wall.
    const hi = y + rise + 0.05;
    if (hi <= probeTop) return Infinity;
    const top = ray(px, hi, pz, hi - probeTop);
    return top && top.timeOfImpact > 0 ? hi - top.timeOfImpact - y : Infinity;
  };
  // Heights are measured from the ground under the feet (the capsule floats a skin above it), so flat
  // ground gives exactly zero tilt.
  const g0 = groundAt(0);
  const base = Number.isFinite(g0) ? g0 : 0;
  // Walk out from the feet point along one half of the body. Returns the slope (rise toward the head per
  // meter) that keeps that half on or above every probe, or null if something too tall is in the way.
  const slopeRise = (PRONE_PROBE_SPACING * reachSpacingSlack) * maxK; // most a walkable slope rises between probes
  const half = (dir: 1 | -1, reach: number): number | null => {
    const n = Math.max(1, Math.ceil(reach / PRONE_PROBE_SPACING));
    let prev = 0;
    let prevD = 0;
    let k = dir > 0 ? -Infinity : Infinity;
    // One extra probe past the end looks ahead, so the body starts to rise onto a step (a curb, stairs)
    // before it gets there; a wall or a tall step out there doesn't block, the sweep handles those.
    for (let i = 1; i <= n + 1; i++) {
      const ahead = i > n;
      const d = ahead ? reach + PRONE_PROBE_SPACING : (reach * i) / n;
      const g = groundAt(dir * d) - base;
      if (g === -Infinity) continue;
      let at = d;
      if (g - prev > slopeRise) {
        // A step up, not a slope: only one you could step onto, and its edge could be anywhere since the
        // last probe, so assume the nearest.
        if (g - prev > m.step.maxStepHeight) {
          if (ahead) break;
          return null;
        }
        at = Math.max(prevD, PRONE_PROBE_SPACING / 2);
      }
      prev = g;
      prevD = d;
      k = dir > 0 ? Math.max(k, g / at) : Math.min(k, -g / at);
    }
    return Number.isFinite(k) ? k : 0;
  };
  const kF = half(1, b.front);
  const kB = half(-1, b.back);
  if (kF === null || kB === null || kF > maxK || kB < -maxK) return null;
  // Lying across a slope, the body rolls to follow it (from the ground under the feet).
  const n = groundNormalAt(ctx, pawn, x, y, z);
  const [rx, rz] = rightXZ(yaw);
  const kSide = n && n.y > 0 ? clamp(-(n.x * rx + n.z * rz) / n.y, -maxK, maxK) : 0;
  return { tF: Math.atan(Math.max(kF, -maxK)), tB: Math.atan(Math.min(kB, maxK)), side: Math.atan(kSide) };
}

/**
 * The lying body as two boxes hinged at the feet point: the upper body (shifted sideways by the prone
 * lean) and the legs, pitched and rolled like the prone pose (hitboxes.ts). Together they contain every
 * prone hitbox and the camera. `grow` pads every side.
 */
function proneBoxes(ctx: MoveContext, x: number, y: number, z: number, yaw: number, fit: ProneFit, lean: number, grow: number) {
  const b = proneBody(ctx);
  const m = ctx.data.movement;
  const cr = Math.cos(fit.side);
  const sr = Math.sin(fit.side);
  const lift = proneBendLift(ctx.data.hitboxes, fit.tF, fit.tB); // the pose rises at a bend; so do the boxes
  const make = (t: number, z0: number, z1: number, sx: number) => {
    const c = Math.cos(t);
    const sn = Math.sin(t);
    // Each box overlaps the hinge; raise its bottom so that overlap doesn't dip into the ground when tilted.
    const bottom = b.lift + PRONE_HINGE_OVERLAP * Math.abs(sn);
    const hy = (b.top - bottom) / 2;
    const cy = bottom + hy;
    const cz = (z0 + z1) / 2;
    const py = cy * c - cz * sn; // pitch about x, then roll about z (same order as the pose)
    const [ox, oz] = rotateXZ(sx * cr - py * sr, cy * sn + cz * c, yaw);
    const q = quatYawPitchRoll(yaw, t, fit.side);
    return {
      pos: { x: x + ox, y: y + sx * sr + py * cr + lift, z: z + oz },
      rot: { x: q[0], y: q[1], z: q[2], w: q[3] },
      shape: new ctx.R.Cuboid(b.halfWidth + grow, hy + grow, (z1 - z0) / 2 + grow),
    };
  };
  const shift = lean * m.lean.offset * m.lean.proneOffsetScale;
  return [make(fit.tF, -b.front, PRONE_HINGE_OVERLAP, shift), make(fit.tB, -PRONE_HINGE_OVERLAP, b.back, 0)];
}

/** The lying body's fit here if it doesn't overlap level geometry (padded by `grow`), else null. */
function proneFitFree(ctx: MoveContext, pawn: Pawn, x: number, y: number, z: number, yaw: number, grow: number): ProneFit | null {
  const fit = proneFit(ctx, pawn, x, y, z, yaw);
  if (!fit) return null;
  for (const box of proneBoxes(ctx, x, y, z, yaw, fit, pawn.state.lean, grow)) {
    if (ctx.world.intersectionWithShape(box.pos, box.rot, box.shape, undefined, QUERY_STATIC, pawn.collider) !== null) return null;
  }
  return fit;
}

/**
 * Clip a horizontal move of the lying body so it stops SKIN short of walls, sliding along them (up to
 * two contacts). A body already touching something can still move away from it or along it.
 */
function proneSweep(ctx: MoveContext, pawn: Pawn, fit: ProneFit, dx: number, dz: number): [number, number] {
  const s = pawn.state;
  let ox = 0;
  let oz = 0;
  let rx = dx;
  let rz = dz;
  for (let iter = 0; iter < 2; iter++) {
    const len = Math.hypot(rx, rz);
    if (len < 1e-9) break;
    const ux = rx / len;
    const uz = rz / len;
    const reach = len + SKIN;
    let best: { time_of_impact: number; normal1: { x: number; y: number; z: number } } | null = null;
    for (const box of proneBoxes(ctx, s.x + ox, s.y, s.z + oz, s.yaw, fit, s.lean, 0)) {
      const hit = ctx.world.castShape(box.pos, box.rot, { x: ux * reach, y: 0, z: uz * reach }, box.shape, 0, 1, false, undefined, QUERY_STATIC, pawn.collider);
      if (hit && (!best || hit.time_of_impact < best.time_of_impact)) best = hit;
    }
    if (!best) {
      ox += rx;
      oz += rz;
      break;
    }
    const n = best.normal1; // points out of the obstacle
    const approachCos = Math.max(0.2, -(ux * n.x + uz * n.z));
    const allowed = clamp(best.time_of_impact * reach - SKIN / approachCos, 0, len);
    ox += ux * allowed;
    oz += uz * allowed;
    const nl = Math.hypot(n.x, n.z);
    if (nl < 0.3) break; // touching a floor or ceiling edge: no sensible slide direction
    const nx = n.x / nl;
    const nz = n.z / nl;
    rx = ux * (len - allowed);
    rz = uz * (len - allowed);
    const into = rx * nx + rz * nz;
    if (into < 0) {
      rx -= nx * into;
      rz -= nz * into;
    }
  }
  return [ox, oz];
}

/** Keep continuous state float32-exact so snapshots (float32 on the wire) restore it without drift. */
function roundState(s: PawnState) {
  s.vx = Math.fround(s.vx);
  s.vy = Math.fround(s.vy);
  s.vz = Math.fround(s.vz);
  s.yaw = Math.fround(s.yaw);
  s.pitch = Math.fround(s.pitch);
  s.lean = Math.fround(s.lean);
  s.tiltF = Math.fround(s.tiltF);
  s.tiltB = Math.fround(s.tiltB);
  s.tiltSide = Math.fround(s.tiltSide);
  s.stanceT = Math.fround(s.stanceT);
  s.sinceSprint = Math.fround(s.sinceSprint);
  s.moveT = Math.fround(s.moveT);
  s.tuck = Math.fround(s.tuck);
  s.airPeakY = Math.fround(s.airPeakY);
}
