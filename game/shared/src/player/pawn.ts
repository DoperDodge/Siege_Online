// Player/pawn separation (PLAN §11.2, Phase 1): a PlayerController is the human or bot; a Pawn is a
// body in the world. Most operators own one pawn. Skopós owns two shells and possesses one at a time;
// the idle one stays in the world (it can be seen, shot, and later acts as a camera).
import { PawnMode, ReloadKind, Stance, WeaponAct, type PawnState } from "./types.js";
import type { Collider } from "../physics/rapier.js";
import type { ResolvedLoadout, ResolvedWeapon } from "../weapons/loadout.js";

export interface Pawn {
  id: number;
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
  };
}
