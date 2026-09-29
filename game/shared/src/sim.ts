// A simulation instance: one physics world + level + pawns + controllers. The Node server runs one per
// match room; the browser runs one for prediction and for offline Practice / Bot Training (PLAN §5).
import { rotateXZ, DEG } from "./core/math.js";
import { loadGameData, type GameData } from "./data/load.js";
import { buildLevel, type BuiltLevel } from "./level/builder.js";
import { initRapier, PLAYER_GROUPS, type CharacterController, type Rapier, type World } from "./physics/rapier.js";
import { stepPawn, type MoveContext } from "./player/movement.js";
import { initialPawnState, type Pawn, type PlayerController } from "./player/pawn.js";
import { capsuleHalfHeight, stanceDims } from "./player/stance.js";
import { PawnMode, Stance, type InputCmd } from "./player/types.js";

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
    const controller: PlayerController = { id: this.nextId++, name, operatorId, pawnIds: [], possessedPawnId: 0 };
    for (let i = 0; i < op.pawns; i++) {
      const [ox, oz] = rotateXZ(i * 1.5, 0, yaw);
      const pawn = this.spawnPawn(operatorId, spawn.pos[0] + ox, spawn.pos[1], spawn.pos[2] + oz, yaw, controller.id);
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

  /** Switch which owned pawn a controller drives (Skopós shell swap). Returns the new pawn id. */
  cyclePossession(controllerId: number): number {
    const c = this.controllers.get(controllerId);
    if (!c || c.pawnIds.length < 2) return c?.possessedPawnId ?? 0;
    const i = c.pawnIds.indexOf(c.possessedPawnId);
    c.possessedPawnId = c.pawnIds[(i + 1) % c.pawnIds.length];
    return c.possessedPawnId;
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

  /** Advance one tick. Possessed pawns get their controller's input; idle pawns stand still (gravity only). */
  step(inputs: ReadonlyMap<number, InputCmd>): void {
    for (const pawn of this.pawns.values()) {
      const owner = pawn.ownerId !== null ? this.controllers.get(pawn.ownerId) : undefined;
      const input = owner && owner.possessedPawnId === pawn.id ? inputs.get(owner.id) : undefined;
      stepPawn(this.ctx, pawn, input ?? idleInput(pawn));
    }
    this.tick++;
  }
}

function idleInput(pawn: Pawn): InputCmd {
  const s = pawn.state;
  return { seq: 0, forward: 0, strafe: 0, yaw: s.yaw, pitch: s.pitch, buttons: 0, stance: s.stance, lean: 0 };
}
