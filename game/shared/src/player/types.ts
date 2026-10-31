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
  /** Down but not out (DECISIONS D-048): lying down, crawling, bleeding out until revived or finished. */
  Downed = 4,
  /** On a rope down an outside wall (Phase 5 M8, PawnState.rappel). */
  Rappel = 5,
  /** A drone in its owner's hand (Phase 7, intel/DESIGN.md §2): no collider, not stepped, not sent to others. */
  Held = 6,
}

/** What a pawn is (Phase 7): an operator's body (Skopós's shells too), or an attacker's drone. */
export enum PawnKind {
  Body = 0,
  Drone = 1,
}

/** PawnState.rappelFlags bits. */
export const RappelFlag = {
  /** On the rope: upside down is where the body is turning to, or hangs (the stance key, research/core_mechanics.md §6.1). */
  Inverted: 1 << 0,
  /** The hold to hook on is at a roof edge (it goes over upside down), not a face's foot. */
  FromTop: 1 << 1,
  /** The hold to hook on is at a window from inside (it climbs out onto the rope outside). */
  FromWindow: 1 << 2,
  // Bits 3–4 on the rope: the stance the stance key last asked for (player/movement.ts).
} as const;

/** Held-button bitfield carried by every input command. */
export const Btn = {
  Sprint: 1 << 0,
  Vault: 1 << 1,
  Interact: 1 << 2,
  Ads: 1 << 3,
  SlowWalk: 1 << 4,
  /** Unique-ability key: the ability's item in and out, like the gadget key (Skopós: open / close the idle shell's camera). */
  Ability: 1 << 5,
  /** Fire, held (DECISIONS D-055): automatic weapons fire while it is down, others on the press. */
  Fire: 1 << 6,
  /** One-tick presses (C15 in the Phase 3 plan). */
  Reload: 1 << 7,
  /** Switch between primary and secondary (the client turns 1 / 2 / the wheel into this press). */
  Swap: 1 << 8,
  FireMode: 1 << 9,
  Melee: 1 << 10,
  /** Ping where the view is on (Phase 7, intel/DESIGN.md §6: the room shares it with the team). */
  Ping: 1 << 11,
  /**
   * The gadget key (Phase 8, gadgets/DESIGN.md §2): takes the secondary gadget out (or its detonator) and puts it
   * away; on a Bulletproof Camera, fires its EMP dart (as Fire does).
   */
  Gadget: 1 << 12,
  /** Drop the defuser (Phase 6, D-120). */
  Drop: 1 << 13,
  /**
   * Drones and cameras (Phase 7, intel/DESIGN.md §2, §3): from the body, go to a drone out (yours, then your
   * teammates'); from a drone, back to the body. A defender's opens and closes the cameras.
   */
  Observe: 1 << 14,
  /** Throw a drone in hand and drive it (Phase 7; its own key since Ulo's test: entering one is Observe's). */
  Throw: 1 << 15,
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
  // rappel (Phase 5 M8): the rope's face (BuiltLevel.rappel; -1 none: also the face a hold to hook on is for),
  // RappelFlag bits, ticks of holding the vault key to hook on (on foot) or of a swing (on the rope), and how far
  // the body has turned upside down (0 right side up, 1 upside down; the turn takes rappel.turnSeconds). Moving
  // onto the rope uses the scripted move's fields (moveT/moveDur > 0 while it lasts).
  rappel: number;
  rappelFlags: number;
  rappelTicks: number;
  ropeTurn: number;
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
  // reinforcing and barricades (Phase 4 M6; destruction/deploy.ts): what the body is putting up or taking
  // down (DeployKind, 0 = nothing), on which panel and section, and for how many ticks it has held Interact
  deployKind: number;
  deployPanel: number;
  deploySection: number;
  deployTicks: number;
  // a drone (Phase 7, intel/DESIGN.md §2): ticks until it may jump again, ticks of boost left, and ticks until a
  // boost may start again (counted from the last one's start)
  jumpCd: number;
  boostTicks: number;
  boostCd: number;
  /** A drone's ticks left jammed by a Bulletproof Camera's EMP dart (it doesn't move or turn meanwhile). */
  jammed: number;
  // gadgets (Phase 8, gadgets/DESIGN.md §2): what the hands hold (Hand), what the gadget in them is doing (GadgetAct)
  // and for how many ticks, the devices left in slot 1 (the secondary gadget) and slot 2 (the ability's, or a kit's
  // second gadget), the remote ones of each out and waiting for the detonator, and the gadget an Interact hold is on
  hand: number;
  gAct: number;
  gTicks: number;
  g1: number;
  g2: number;
  w1: number;
  w2: number;
  gTarget: number;
}

/** What a body's hands hold (PawnState.hand). */
export enum Hand {
  Weapon = 0,
  /** Slot 1, the secondary gadget: a device, or the detonator of those waiting. */
  Gadget = 1,
  Detonator = 2,
  /** Slot 2, the ability's item (Striker's and Sentry's second gadget): a device, or its detonator. */
  Ability = 3,
  AbilityDetonator = 4,
}

/** The slot (1 or 2) a hand holds, or 0 for the weapon. */
export const handSlot = (hand: number): 0 | 1 | 2 => (hand === Hand.Gadget || hand === Hand.Detonator ? 1 : hand === Hand.Ability || hand === Hand.AbilityDetonator ? 2 : 0);
export const isDetonator = (hand: number) => hand === Hand.Detonator || hand === Hand.AbilityDetonator;

/** What the gadget in hand is doing (PawnState.gAct), `gTicks` into it. */
export enum GadgetAct {
  Ready = 0,
  /** Coming out of its slot (data/gadgets.json `equipS`). */
  Equip = 1,
  /** Winding up a throw: overhand (Fire) or a lob (ADS). */
  Throw = 2,
  Lob = 3,
  /** Fire held with the view on a spot for it: placing. */
  Place = 4,
}

export const NEUTRAL_INPUT: Readonly<Omit<InputCmd, "seq" | "yaw" | "pitch">> = {
  forward: 0,
  strafe: 0,
  buttons: 0,
  stance: Stance.Stand,
  lean: 0,
};

/**
 * On a rope and free to act (Phase 5 M8): not moving onto it, swinging, or turning over. Aiming, firing, the knife,
 * Skopós' shell camera and the window prompts wait for it.
 */
export const ropeIdle = (s: PawnState) => s.mode === PawnMode.Rappel && s.moveDur === 0 && s.rappelTicks === 0 && (s.ropeTurn === 0 || s.ropeTurn === 1);

/** Quantize an input exactly like the wire format will, so prediction matches the server bit-for-bit. */
export function quantizeInput(cmd: InputCmd): InputCmd {
  const q = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127))) / 127;
  return { ...cmd, forward: q(cmd.forward), strafe: q(cmd.strafe), yaw: Math.fround(cmd.yaw), pitch: Math.fround(cmd.pitch) };
}
