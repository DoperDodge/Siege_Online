// The per-tick movement step. Pure function of (pawn state, input, static level, data), shared by the
// server (authority) and the browser (prediction). Values come from data/movement.json (PLAN §7).
import { DT } from "../core/constants.js";
import { approach, clamp, DEG, forwardXZ, lerp, quatFromTo, rightXZ, smoothstep, wrapAngle } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { BuiltLevel } from "../level/builder.js";
import { QUERY_STATIC, type CharacterController, type Rapier, type World } from "../physics/rapier.js";
import { eyePose } from "./hitboxes.js";
import type { Pawn } from "./pawn.js";
import { capsuleHalfHeight, currentHeight, stanceDims, transitionSeconds } from "./stance.js";
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
  if (s.mode === PawnMode.Walk && s.stance === Stance.Prone) {
    // Prone limits turn speed and aim arc (PLAN §7); turning is also blocked if the body would clip a wall.
    pitchMin = m.stance.pronePitchMinDeg * DEG;
    pitchMax = m.stance.pronePitchMaxDeg * DEG;
    const maxTurn = m.stance.proneTurnRateDeg * DEG * DT;
    const delta = clamp(wrapAngle(input.yaw - s.yaw), -maxTurn, maxTurn);
    if (delta !== 0) {
      const next = wrapAngle(s.yaw + delta);
      if (proneBodyFree(ctx, pawn, s.x, s.y, s.z, next)) s.yaw = next;
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
  const dx = s.vx * DT;
  const dz = s.vz * DT;
  let dy = s.vy * DT;
  if (s.grounded) {
    // Follow the ground plane so horizontal speed holds on ramps and stairs (the controller would
    // otherwise project the step onto the slope and lose ~40% of it on a 40° incline).
    const n = groundNormal(ctx, pawn);
    if (n && n.y >= Math.cos(m.step.maxSlopeDeg * DEG)) dy += -(n.x * dx + n.z * dz) / n.y;
  }
  ctx.cc.computeColliderMovement(pawn.collider, { x: dx, y: dy, z: dz }, undefined, QUERY_STATIC);
  const mv = ctx.cc.computedMovement();
  const c = pawn.collider.translation();
  pawn.collider.setTranslation({ x: c.x + mv.x, y: c.y + mv.y, z: c.z + mv.z });
  readFeet(ctx, pawn, height);
  s.grounded = ctx.cc.computedGrounded();
  if (s.grounded || (s.vy > 0 && mv.y < s.vy * DT - 1e-4)) s.vy = 0;

  trackFall(ctx, pawn, wasGrounded);
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
  const wantsSprint = (input.buttons & Btn.Sprint) !== 0 && input.forward > m.sprint.forwardThreshold;
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
  if (target === Stance.Prone) return s.grounded && proneBodyFree(ctx, pawn, s.x, s.y, s.z, s.yaw);
  const targetHeight = stanceDims(m, target).height;
  if (targetHeight <= currentHeight(m, s)) return true;
  return capsuleFree(ctx, pawn, s.x, s.y, s.z, targetHeight);
}

function updateLean(ctx: MoveContext, pawn: Pawn, input: InputCmd) {
  const m = ctx.data.movement;
  const s = pawn.state;
  let target: number = input.lean;
  if (!m.lean.allowInStances.includes(STANCE_KEYS[s.stance]) || (s.sprinting && m.lean.sprintCancelsLean)) target = 0;
  let lean = approach(s.lean, target, DT / m.lean.seconds);
  if (lean !== 0) {
    // The head can't pass through walls: sweep a head-sized sphere from the unleaned eye to the leaned eye.
    const from = eyePose(m, s, 0).pos;
    const to = eyePose(m, s, lean).pos;
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
  s.moveDur = seconds;
  s.fromX = s.x;
  s.fromY = s.y;
  s.fromZ = s.z;
  s.toX = toX;
  s.toY = toY;
  s.toZ = toZ;
  s.apexY = apexY;
  s.vx = s.vy = s.vz = 0;
  s.lean = 0;
  s.sprinting = false;
}

/** Vaults and ladder dismounts: a timed arc from `from` to `to` peaking at `apexY` (collision-checked at start). */
function stepScriptedMove(ctx: MoveContext, pawn: Pawn) {
  const s = pawn.state;
  s.moveT += DT;
  const u = Math.min(1, s.moveT / s.moveDur);
  const e = smoothstep(u);
  const ctrl = 2 * s.apexY - (s.fromY + s.toY) / 2;
  const x = lerp(s.fromX, s.toX, e);
  const z = lerp(s.fromZ, s.toZ, e);
  const y = (1 - e) * (1 - e) * s.fromY + 2 * e * (1 - e) * ctrl + e * e * s.toY;
  const height = currentHeight(ctx.data.movement, s);
  setFeet(ctx, pawn, x, y, z, height);
  if (u >= 1) {
    s.mode = PawnMode.Walk;
    s.grounded = false;
    s.airPeakY = s.y;
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
    if (s.y < L.base[1] - 0.5 || s.y > L.base[1] + L.height - 1.0) continue;
    if (pfx * L.forward[0] + pfz * L.forward[1] < 0.5) continue; // must face the ladder
    if (s.stance !== Stance.Stand && !capsuleFree(ctx, pawn, cx, s.y, cz, m.stance.stand.height)) continue;
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
  s.stance = s.stanceFrom = Stance.Stand;
  s.stanceT = 1;
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
    startScriptedMove(s, cx + L.forward[0] * d, top, cz + L.forward[1] * d, top + 0.15, 0.5);
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
  const r = ctx.data.movement.stance.collisionRadius;
  const hh = capsuleHalfHeight(height, r);
  pawn.collider.setHalfHeight(hh);
  pawn.collider.setTranslation({ x, y: y + hh + r, z });
  readFeet(ctx, pawn, height);
}

/** Copy the collider position (float32 as stored by Rapier) back into the state so both sides round alike. */
function readFeet(ctx: MoveContext, pawn: Pawn, height: number) {
  const r = ctx.data.movement.stance.collisionRadius;
  const t = pawn.collider.translation();
  pawn.state.x = t.x;
  pawn.state.y = Math.fround(t.y - (capsuleHalfHeight(height, r) + r));
  pawn.state.z = t.z;
}

/** Surface normal of the ground directly under the feet, if any is within reach. */
function groundNormal(ctx: MoveContext, pawn: Pawn): { x: number; y: number; z: number } | null {
  const s = pawn.state;
  const hit = ctx.world.castRayAndGetNormal(
    new ctx.R.Ray({ x: s.x, y: s.y + 0.1, z: s.z }, { x: 0, y: -1, z: 0 }),
    0.45,
    true,
    undefined,
    QUERY_STATIC,
    pawn.collider,
  );
  return hit ? hit.normal : null;
}

/** Is an upright capsule of `height` standing at these feet free of level geometry? */
function capsuleFree(ctx: MoveContext, pawn: Pawn, x: number, y: number, z: number, height: number): boolean {
  const r = ctx.data.movement.stance.collisionRadius - SKIN;
  const hh = capsuleHalfHeight(height - SKIN * 2, r);
  const hit = ctx.world.intersectionWithShape(
    { x, y: y + SKIN * 1.5 + hh + r, z },
    IDENTITY,
    new ctx.R.Capsule(hh, r),
    undefined,
    QUERY_STATIC,
    pawn.collider,
  );
  return hit === null;
}

/** Is a lying-down body (horizontal capsule along the facing) free of geometry? */
function proneBodyFree(ctx: MoveContext, pawn: Pawn, x: number, y: number, z: number, yaw: number): boolean {
  const len = ctx.data.movement.stance.proneBodyLength;
  const r = 0.2;
  const [fx, fz] = forwardXZ(yaw);
  // Body runs from the head (0.55 m ahead of the feet point) back toward the legs.
  const back = len / 2 - 0.55;
  const q = quatFromTo([0, 1, 0], [fx, 0, fz]);
  const hit = ctx.world.intersectionWithShape(
    { x: x - fx * back, y: y + r + 0.05, z: z - fz * back },
    { x: q[0], y: q[1], z: q[2], w: q[3] },
    new ctx.R.Capsule(Math.max(0.01, len / 2 - r), r),
    undefined,
    QUERY_STATIC,
    pawn.collider,
  );
  return hit === null;
}

/** Keep continuous state float32-exact so snapshots (float32 on the wire) restore it without drift. */
function roundState(s: PawnState) {
  s.vx = Math.fround(s.vx);
  s.vy = Math.fround(s.vy);
  s.vz = Math.fround(s.vz);
  s.yaw = Math.fround(s.yaw);
  s.pitch = Math.fround(s.pitch);
  s.lean = Math.fround(s.lean);
  s.stanceT = Math.fround(s.stanceT);
  s.sinceSprint = Math.fround(s.sinceSprint);
  s.moveT = Math.fround(s.moveT);
  s.airPeakY = Math.fround(s.airPeakY);
}
