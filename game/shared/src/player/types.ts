export enum Stance {
  Stand = 0,
  Crouch = 1,
  Prone = 2,
}
export const STANCE_KEYS = ["stand", "crouch", "prone"] as const;

export enum PawnMode {
  Walk = 0,
  Vault = 1,
  Ladder = 2,
  Dead = 3,
}

/** Held-button bitfield carried by every input command. */
export const Btn = {
  Sprint: 1 << 0,
  Vault: 1 << 1,
  Interact: 1 << 2,
  Ads: 1 << 3,
  SlowWalk: 1 << 4,
  /** Unique-ability key (Skopós: open / close the idle shell's camera). */
  Ability: 1 << 5,
} as const;

/**
 * One tick of player intent. Toggle-vs-hold bindings are resolved on the client, so the server only
 * sees the *desired* stance and lean (PLAN §7: separate toggle/hold options are a client setting).
 */
export interface InputCmd {
  seq: number;
  /** -1..1, W = +1 (quantized to 1/127 steps on the wire). */
  forward: number;
  /** -1..1, D = +1. */
  strafe: number;
  /** Radians. 0 faces -Z; positive turns left. */
  yaw: number;
  /** Radians, positive looks up. */
  pitch: number;
  buttons: number;
  stance: Stance;
  /** -1 = lean left (Q), 0 = none, +1 = lean right (E). */
  lean: -1 | 0 | 1;
}

export interface PawnState {
  /** Feet position (bottom of the movement capsule). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  /** Stance we are in, or transitioning to. */
  stance: Stance;
  stanceFrom: Stance;
  /** 0..1 transition progress; 1 = settled in `stance`. */
  stanceT: number;
  /** -1..1 current lean amount (after wall clamping). */
  lean: number;
  sprinting: boolean;
  /** Seconds since sprint ended (for sprint-to-fire delay, Phase 3). */
  sinceSprint: number;
  mode: PawnMode;
  prevButtons: number;
  // vault / scripted move
  moveT: number;
  moveDur: number;
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  apexY: number;
  /** 0..1 how tucked the body is during a vault (lowers height and eye). */
  tuck: number;
  // ladder
  ladder: number;
  // falls and health
  airPeakY: number;
  hp: number;
  maxHp: number;
  lastFallDamage: number;
}

export const NEUTRAL_INPUT: Readonly<Omit<InputCmd, "seq" | "yaw" | "pitch">> = {
  forward: 0,
  strafe: 0,
  buttons: 0,
  stance: Stance.Stand,
  lean: 0,
};

/** Quantize an input exactly like the wire format will, so prediction matches the server bit-for-bit. */
export function quantizeInput(cmd: InputCmd): InputCmd {
  const q = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127))) / 127;
  return { ...cmd, forward: q(cmd.forward), strafe: q(cmd.strafe), yaw: Math.fround(cmd.yaw), pitch: Math.fround(cmd.pitch) };
}
