// Player/pawn separation (PLAN §11.2, Phase 1): a PlayerController is the human or bot; a Pawn is a
// body in the world. Most operators own one pawn. Skopós owns two shells and possesses one at a time;
// the idle one stays in the world (it can be seen, shot, and later acts as a camera).
import { PawnKind, PawnMode, ReloadKind, Stance, WeaponAct, type PawnState } from "./types.js";
import type { Collider } from "../physics/rapier.js";
import type { ResolvedLoadout, ResolvedWeapon } from "../weapons/loadout.js";

export interface Pawn {
  id: number;
  /** A body, or an attacker's drone (Phase 7); fixed for the pawn's life. */
  kind: PawnKind;
  /** A drone that's one of Brava's Kludge drones (Phase 8 M8; the roster says which); fixed for its life. */
  kludge?: boolean;
  operatorId: string;
  /** Controller that owns this pawn (null for dummies). */
  ownerId: number | null;
  collider: Collider;
  state: PawnState;
  /** Simulated elsewhere (another player on a client): never stepped here, only placed (Sim.addProxy). */
  proxy?: boolean;
  /** Weapons, fixed for this body's life (DECISIONS D-042); not part of the predicted state. */
  loadout: ResolvedLoadout | null;
  /** 0 attackers, 1 defenders; fixed for this body's life. */
  team: number;
  /**
   * Counts the times this body came back (Sim.respawn, a teleport that revives it). Lag compensation skips
   * what it remembers of an earlier life (a body that kept its id), so nobody shoots a ghost.
   */
  life: number;
}

/** A camera's view as a viewer left it (D-155): its key (Sim.camKey) and where it looked (radians). */
export interface CamView {
  key: number;
  yaw: number;
  pitch: number;
}

/** A controller's key for Skopós's own idle shell among its feeds (D-155); cameras' keys are 2 and up. */
export const SHELL_VIEW = 1;

/** How many cameras' views a controller remembers (D-155): the oldest goes first. */
export const MAX_CAM_VIEWS = 24;

export interface PlayerController {
  id: number;
  name: string;
  operatorId: string;
  /** Its bodies, then its drones (Phase 7: an attacker in a match; in prep, the drones alone). */
  pawnIds: number[];
  /** The body receiving this controller's input; an attacker in prep, with no body yet, possesses their first drone. */
  possessedPawnId: number;
  /** The drone being driven (Phase 7, intel/DESIGN.md §2): it takes the input and the body stands idle; 0: none. */
  drone: number;
  /** The lean key last tick (−1, 0, 1): on a drone or a camera, a new lean goes to the previous / next one. */
  prevLean: number;
  /** The default camera a defender watches (Phase 7, intel/DESIGN.md §3): its index in the level's cameras + 1; 0: none. */
  cam: number;
  /** Where that camera looks (radians), within its limits: each viewer has their own (D-134). */
  camYaw: number;
  camPitch: number;
  /**
   * The gadget table entry of the camera watched (a Bulletproof Camera's, an idle shell's barrier's), 0 for one of the
   * level's: the list's numbers shift as such cameras come and go, and the view stays on its camera (the review, M12).
   */
  camEntry: number;
  /**
   * The feed last watched on the cameras (Ulo, D-155), which Observe opens again: a camera's key (Sim.camKey), or
   * SHELL_VIEW for Skopós's own idle shell; 0: none yet this life.
   */
  lastCam: number;
  /**
   * Where each camera watched this life was left looking (Ulo, D-155: flip back to one and it looks where you left
   * it), by its key, the newest last (at most MAX_CAM_VIEWS). Each entry is replaced, never changed in place.
   */
  camViews: readonly CamView[];
  /** Skopós: looking through the idle shell's camera (the step before a swap). */
  shellCam: boolean;
  /** Skopós swap in progress: 0 none, 1 transfer (active shell idles), 2 activation (target shell wakes). */
  swapPhase: 0 | 1 | 2;
  swapT: number;
  swapCooldown: number;
  prevButtons: number;
  /**
   * Dokkaebi's Jegeo Payload blew up this player's phone (Phase 8 M9): no observation tools (cameras, Skopós's swap and
   * shell camera) for the rest of the round (the next body is a new controller).
   */
  phoneLost?: boolean;
  /** 0 attackers, 1 defenders (static: changing team means a new body). */
  team: number;
}

/** Rounds a weapon spawns with: a full magazine (and the chambered +1), the rest in reserve. */
export function spawnAmmo(w: ResolvedWeapon): { loaded: number; reserve: number } {
  const loaded = Math.min(w.ammo.maxAmmo, w.ammo.magazine + (w.ammo.plusOne ? 1 : 0));
  return { loaded, reserve: w.ammo.maxAmmo - loaded };
}

export function initialPawnState(x: number, y: number, z: number, yaw: number, maxHp: number, loadout: ResolvedLoadout | null = null): PawnState {
  const a = loadout ? spawnAmmo(loadout.weapons[0]) : { loaded: 0, reserve: 0 };
  const b = loadout ? spawnAmmo(loadout.weapons[1]) : { loaded: 0, reserve: 0 };
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
    tiltF: 0,
    tiltB: 0,
    tiltSide: 0,
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
    rappel: -1,
    rappelFlags: 0,
    rappelTicks: 0,
    ropeTurn: 0,
    airPeakY: y,
    hp: maxHp,
    maxHp,
    lastFallDamage: 0,
    slot: 0,
    wAct: WeaponAct.Ready,
    actTicks: 0,
    reloadKind: ReloadKind.None,
    wflags: 0,
    loaded0: a.loaded,
    loaded1: b.loaded,
    reserve0: a.reserve,
    reserve1: b.reserve,
    modes: 0,
    cycle: 0,
    burstLeft: 0,
    adsQ: 0,
    shotIdx: 0,
    sinceShot: 0xffff,
    rng: 0,
    recoilPendP: 0,
    recoilPendY: 0,
    recoilRecP: 0,
    recoilRecY: 0,
    downHp: 0,
    downs: 0,
    invulnTicks: 0,
    meleeTicks: 0,
    reviveTicks: 0,
    reviveTarget: 0,
    revivedBy: 0,
    deployKind: 0,
    deployPanel: 0,
    deploySection: 0,
    deployTicks: 0,
    jumpCd: 0,
    boostTicks: 0,
    boostCd: 0,
    jammed: 0,
    hand: 0,
    gAct: 0,
    gTicks: 0,
    g1: 0,
    g2: 0,
    w1: 0,
    w2: 0,
    gTarget: 0,
    needled: false,
    ringing: false,
    regenMade: 0,
    regenTicks: 0,
    guard: 0,
    suppress: 0,
    suppressT: 0,
    shieldAt: 0,
    knockTicks: 0,
    knockLie: 0,
  };
}
