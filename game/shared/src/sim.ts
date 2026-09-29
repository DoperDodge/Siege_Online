// A simulation instance: one physics world + level + pawns + controllers. The Node server runs one per
// match room; the browser runs one for prediction and for offline Practice / Bot Training (PLAN §5).
import { DT } from "./core/constants.js";
import { rotateXZ, DEG } from "./core/math.js";
import { loadGameData, type GameData } from "./data/load.js";
import { buildLevel, type BuiltLevel } from "./level/builder.js";
import { initRapier, PLAYER_GROUPS, type CharacterController, type Rapier, type World } from "./physics/rapier.js";
import { movementPrompt, stepPawn, type MoveContext, type MovementPrompt } from "./player/movement.js";
import { initialPawnState, type Pawn, type PlayerController } from "./player/pawn.js";
import { capsuleHalfHeight, stanceDims } from "./player/stance.js";
import { Btn, PawnMode, Stance, type InputCmd } from "./player/types.js";

/** Contextual hint for the HUD: "Space to mantle", "F to climb", "F to transfer" (Skopós camera). */
export type Prompt = MovementPrompt | "transfer";

export class Sim {
  readonly pawns = new Map<number, Pawn>();
  readonly controllers = new Map<number, PlayerController>();
  tick = 0;
  private nextId = 1;
  private readonly ctx: MoveContext;

  private constructor(
    readonly R: Rapier,
    readonly world: World,
    readonly cc: CharacterController,
    readonly data: GameData,
    readonly level: BuiltLevel,
  ) {
    this.ctx = { R, world, cc, data, level };
  }

  static async create(levelId: string, data: GameData = loadGameData()): Promise<Sim> {
    const R = await initRapier();
    const def = data.levels.get(levelId);
    if (!def) throw new Error(`Unknown level "${levelId}"`);
    const m = data.movement;
    const world = new R.World({ x: 0, y: m.gravity, z: 0 });
    const level = buildLevel(R, world, def);
    const cc = world.createCharacterController(0.02);
    cc.enableAutostep(m.step.maxStepHeight, 0.2, false);
    cc.enableSnapToGround(m.step.snapToGround);
    cc.setMaxSlopeClimbAngle(m.step.maxSlopeDeg * DEG);
    cc.setMinSlopeSlideAngle(m.step.maxSlopeDeg * DEG);
    return new Sim(R, world, cc, data, level);
  }

  /** Create a controller and its pawn(s) at a level spawn. Skopós gets two shells side by side. */
  addPlayer(name: string, operatorId: string, spawnIndex = 0): PlayerController {
    const op = this.data.operators.get(operatorId);
    if (!op) throw new Error(`Unknown operator "${operatorId}"`);
    const spawn = this.level.def.spawns[spawnIndex % this.level.def.spawns.length];
    const yaw = spawn.yawDeg * DEG;
    const controller: PlayerController = {
      id: this.nextId++,
      name,
      operatorId,
      pawnIds: [],
      possessedPawnId: 0,
      shellCam: false,
      swapPhase: 0,
      swapT: 0,
      swapCooldown: 0,
      prevButtons: 0,
    };
    for (let i = 0; i < op.pawns; i++) {
      const [ox, oz] = rotateXZ(i * 1.5, 0, yaw);
      const pawn = this.spawnPawn(operatorId, spawn.pos[0] + ox, spawn.pos[1], spawn.pos[2] + oz, yaw, controller.id);
      if (i > 0) pawn.state.stance = pawn.state.stanceFrom = Stance.Crouch; // idle shells crouch behind their shield
      controller.pawnIds.push(pawn.id);
    }
    controller.possessedPawnId = controller.pawnIds[0];
    this.controllers.set(controller.id, controller);
    return controller;
  }

  spawnPawn(operatorId: string, x: number, y: number, z: number, yaw: number, ownerId: number | null = null): Pawn {
    const m = this.data.movement;
    const op = this.data.operators.get(operatorId);
    const maxHp = m.healthByRating[String(op?.healthRating ?? 2) as "1" | "2" | "3"];
    const r = m.stance.collisionRadius;
    const hh = capsuleHalfHeight(m.stance.stand.height, r);
    const collider = this.world.createCollider(
      this.R.ColliderDesc.capsule(hh, r).setTranslation(x, y + hh + r + 0.02, z).setCollisionGroups(PLAYER_GROUPS),
    );
    const pawn: Pawn = { id: this.nextId++, operatorId, ownerId, collider, state: initialPawnState(x, y + 0.02, z, Math.fround(yaw), maxHp) };
    this.pawns.set(pawn.id, pawn);
    return pawn;
  }

  /** A controller's other, still-alive pawn (Skopós' idle shell), or null. */
  otherPawn(controllerId: number): Pawn | null {
    const c = this.controllers.get(controllerId);
    if (!c) return null;
    for (const id of c.pawnIds) {
      const p = this.pawns.get(id);
      if (id !== c.possessedPawnId && p && p.state.mode !== PawnMode.Dead) return p;
    }
    return null;
  }

  /** The pawn whose eyes the player sees through: the idle shell while on its camera or mid-swap. */
  viewedPawnId(controllerId: number): number {
    const c = this.controllers.get(controllerId);
    if (!c) return 0;
    if (c.shellCam || c.swapPhase) return this.otherPawn(controllerId)?.id ?? c.possessedPawnId;
    return c.possessedPawnId;
  }

  /** Which contextual prompt the player should see right now. */
  prompt(controllerId: number): Prompt {
    const c = this.controllers.get(controllerId);
    if (!c) return null;
    if (c.swapPhase) return null;
    if (c.shellCam) return "transfer";
    const pawn = this.pawns.get(c.possessedPawnId);
    return pawn ? movementPrompt(this.ctx, pawn) : null;
  }

  /** Put a pawn back at a spawn with full health (lab / respawn tooling). */
  respawn(pawnId: number, spawnIndex = 0): void {
    const pawn = this.pawns.get(pawnId);
    if (!pawn) return;
    const spawn = this.level.def.spawns[spawnIndex % this.level.def.spawns.length];
    const m = this.data.movement;
    const r = m.stance.collisionRadius;
    const hh = capsuleHalfHeight(m.stance.stand.height, r);
    pawn.collider.setHalfHeight(hh);
    pawn.collider.setTranslation({ x: spawn.pos[0], y: spawn.pos[1] + hh + r + 0.02, z: spawn.pos[2] });
    pawn.state = initialPawnState(spawn.pos[0], spawn.pos[1] + 0.02, spawn.pos[2], Math.fround(spawn.yawDeg * DEG), pawn.state.maxHp);
  }

  /** Move a pawn to feet position (x, y, z) in a settled stance (lab "go to" menu, tests, admin tools). */
  teleport(pawnId: number, x: number, y: number, z: number, yawDeg = 0, stance: Stance = Stance.Stand): void {
    const pawn = this.pawns.get(pawnId);
    if (!pawn) return;
    const m = this.data.movement;
    const r = m.stance.collisionRadius;
    const hh = capsuleHalfHeight(stanceDims(m, stance).height, r);
    pawn.collider.setHalfHeight(hh);
    pawn.collider.setTranslation({ x, y: y + hh + r + 0.02, z });
    const t = pawn.collider.translation();
    Object.assign(pawn.state, {
      x: t.x,
      y: Math.fround(y + 0.02),
      z: t.z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.fround(yawDeg * DEG),
      stance,
      stanceFrom: stance,
      stanceT: 1,
      lean: 0,
      grounded: false,
      sprinting: false,
      mode: PawnMode.Walk,
      ladder: -1,
      airPeakY: Math.fround(y + 0.02),
    });
    if (pawn.state.hp === 0) pawn.state.hp = pawn.state.maxHp;
  }

  /**
   * Advance one tick. Possessed pawns get their controller's input. Idle pawns stand still (gravity only);
   * idle Skopós shells stay crouched. While Skopós looks through her other shell's camera, her mouse
   * turns that shell's view and the body she left stands still.
   */
  step(inputs: ReadonlyMap<number, InputCmd>): void {
    const drive = new Map<number, InputCmd>();
    for (const c of this.controllers.values()) {
      const input = inputs.get(c.id);
      if (!input) continue;
      this.updateShells(c, input);
      const target = c.shellCam || c.swapPhase ? this.otherPawn(c.id) : null;
      if (target) {
        const active = this.pawns.get(c.possessedPawnId);
        if (active) drive.set(active.id, idleInput(active, c.swapPhase === 1 ? Stance.Crouch : active.state.stance));
        drive.set(target.id, { ...idleInput(target, c.swapPhase === 2 ? Stance.Stand : target.state.stance), yaw: input.yaw, pitch: input.pitch });
      } else {
        drive.set(c.possessedPawnId, input);
      }
    }
    for (const pawn of this.pawns.values()) {
      let input = drive.get(pawn.id);
      if (!input) {
        const owner = pawn.ownerId !== null ? this.controllers.get(pawn.ownerId) : undefined;
        const idleShell = owner !== undefined && owner.pawnIds.length > 1 && owner.possessedPawnId !== pawn.id;
        input = idleInput(pawn, idleShell ? Stance.Crouch : pawn.state.stance);
      }
      stepPawn(this.ctx, pawn, input);
    }
    this.tick++;
  }

  /**
   * Skopós shell swap (research/operators/skopos.md §3.2): the ability key opens the idle shell's camera;
   * interact, while on that camera, starts the swap: transfer (the active shell idles), then activation
   * (the target shell wakes up), then a short cooldown. Timings come from the operator's ability params.
   */
  private updateShells(c: PlayerController, input: InputCmd) {
    const pressed = input.buttons & ~c.prevButtons;
    c.prevButtons = input.buttons;
    if (c.pawnIds.length < 2) return;
    const params = this.data.operators.get(c.operatorId)?.ability.params ?? {};
    const transfer = params.transferSeconds ?? 1.3;
    const activation = params.activationSeconds ?? 1.3;
    c.swapCooldown = Math.max(0, c.swapCooldown - DT);

    if (c.swapPhase === 1) {
      c.swapT += DT;
      if (c.swapT >= transfer - 1e-9) {
        c.swapPhase = 2;
        c.swapT = 0;
      }
      return;
    }
    if (c.swapPhase === 2) {
      c.swapT += DT;
      if (c.swapT >= activation - 1e-9) {
        const target = this.otherPawn(c.id);
        if (target) c.possessedPawnId = target.id;
        c.swapPhase = 0;
        c.swapT = 0;
        c.shellCam = false;
        c.swapCooldown = params.swapCooldownSeconds ?? 0.5;
      }
      return;
    }

    const active = this.pawns.get(c.possessedPawnId);
    const ready = active !== undefined && active.state.mode === PawnMode.Walk && active.state.grounded;
    if (!this.otherPawn(c.id) || !ready) {
      c.shellCam = false; // nothing to look through, or busy (climbing, vaulting, dead)
      return;
    }
    if (pressed & Btn.Ability) {
      c.shellCam = !c.shellCam && c.swapCooldown <= 0;
    } else if (c.shellCam && pressed & Btn.Interact) {
      c.swapPhase = 1;
      c.swapT = 0;
    }
  }
}

function idleInput(pawn: Pawn, stance: Stance = pawn.state.stance): InputCmd {
  const s = pawn.state;
  return { seq: 0, forward: 0, strafe: 0, yaw: s.yaw, pitch: s.pitch, buttons: 0, stance, lean: 0 };
}
