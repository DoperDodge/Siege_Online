// Player/pawn separation (PLAN §11.2, Phase 1): a PlayerController is the human or bot; a Pawn is a
// body in the world. Most operators own one pawn. Skopós owns two shells and possesses one at a time;
// the idle one stays in the world (it can be seen, shot, and later acts as a camera).
import { PawnMode, Stance, type PawnState } from "./types.js";
import type { Collider } from "../physics/rapier.js";

export interface Pawn {
  id: number;
  operatorId: string;
  /** Controller that owns this pawn (null for dummies). */
  ownerId: number | null;
  collider: Collider;
  state: PawnState;
}

export interface PlayerController {
  id: number;
  name: string;
  operatorId: string;
  pawnIds: number[];
  /** The pawn currently receiving this controller's input. */
  possessedPawnId: number;
  /** Skopós: looking through the idle shell's camera (the step before a swap). */
  shellCam: boolean;
  /** Skopós swap in progress: 0 none, 1 transfer (active shell idles), 2 activation (target shell wakes). */
  swapPhase: 0 | 1 | 2;
  swapT: number;
  swapCooldown: number;
  prevButtons: number;
}

export function initialPawnState(x: number, y: number, z: number, yaw: number, maxHp: number): PawnState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    pitch: 0,
    grounded: false,
    stance: Stance.Stand,
    stanceFrom: Stance.Stand,
    stanceT: 1,
    lean: 0,
    sprinting: false,
    sinceSprint: 10,
    mode: PawnMode.Walk,
    prevButtons: 0,
    moveT: 0,
    moveDur: 0,
    fromX: 0,
    fromY: 0,
    fromZ: 0,
    toX: 0,
    toY: 0,
    toZ: 0,
    apexY: 0,
    tuck: 0,
    ladder: -1,
    airPeakY: y,
    hp: maxHp,
    maxHp,
    lastFallDamage: 0,
  };
}
