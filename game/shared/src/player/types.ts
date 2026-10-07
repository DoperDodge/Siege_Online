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
  /** Fire, held (DECISIONS D-055): automatic weapons fire while it is down, others on the press. */
  Fire: 1 << 6,
  /** One-tick presses (C15 in the Phase 3 plan). */
  Reload: 1 << 7,
  /** Switch between primary and secondary (the client turns 1 / 2 / the wheel into this press). */
  Swap: 1 << 8,
  FireMode: 1 << 9,
  Melee: 1 << 10,
  /** Reserved: ping (Phase 7) and gadget (Phase 8), so the numbers never change. */
  Ping: 1 << 11,
  Gadget: 1 << 12,
} as const;

/** What the weapon in hand is doing (PawnState.wAct). */
export enum WeaponAct {
  Ready = 0,
  /** Bringing the other weapon up after a swap. */
  Equip = 1,
  Reload = 2,
}

/** Which reload is running (PawnState.reloadKind). */
export enum ReloadKind {
  None = 0,
  /** Magazine weapon with rounds left (keeps the chambered round). */
  Tactical = 1,
  /** Magazine weapon from empty, or a tube shotgun from empty (its overhead first). */
  Empty = 2,
  /** Tube shotgun with shells left: one shell at a time. */
  Shell = 3,
}

/** PawnState.wflags bits. */
export const WFlag = {
  /** The old magazine is out (reload past its magazine-out point). */
  MagOut: 1 << 0,
  /** The ammo counter has refilled (reload past its refill point). */
  Refilled: 1 << 1,
  /** A semi or burst press during the sprint exit, fired as soon as the gate opens. */
  FireQueued: 1 << 2,
  /** ADS started from a sprint (slower, Phase 3 M5). */
  AdsFromSprint: 1 << 3,
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
  /**
   * Prone body pitch (radians, positive = rising toward the head) of the upper body and of the legs, so
   * the lying body follows ramps, stairs and crests. 0 when not prone.
   */
  tiltF: number;
  tiltB: number;
  /** Prone roll (radians, positive = right side up) for lying across a slope. 0 when not prone. */
  tiltSide: number;
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
  // weapons (Phase 3; all predicted and hashed, DECISIONS D-040)
  /** 0 primary, 1 secondary. */
  slot: number;
  /** WeaponAct, and ticks into it. */
  wAct: WeaponAct;
  actTicks: number;
  reloadKind: ReloadKind;
  wflags: number;
  /** Rounds in each weapon, the chambered one included, and in reserve. */
  loaded0: number;
  loaded1: number;
  reserve0: number;
  reserve1: number;
  /** Fire-mode index per slot: low nibble primary, high nibble secondary. */
  modes: number;
  /** Fire-rate debt in 1/(60·64) minute units: a shot adds 3840, every tick pays off the weapon's rpm. */
  cycle: number;
  burstLeft: number;
  /** ADS progress 0..65535 (M5). */
  adsQ: number;
  /** Bullet index in the current spray (recoil stages), and ticks since the last shot (saturating). */
  shotIdx: number;
  sinceShot: number;
  /** Recoil random state, seeded by the server (M5). */
  rng: number;
  recoilPendP: number;
  recoilPendY: number;
  recoilRecP: number;
  recoilRecY: number;
  // down-but-not-out, revive, melee (M7, M8)
  downHp: number;
  downs: number;
  invulnTicks: number;
  meleeTicks: number;
  reviveTicks: number;
  reviveTarget: number;
  revivedBy: number;
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
