// A simulation instance: one physics world + level + pawns + controllers. The Node server runs one per
// match room; the browser runs one for prediction and for offline Practice / Bot Training (PLAN §5).
import { DT } from "./core/constants.js";
import { rotateXZ, DEG } from "./core/math.js";
import { loadGameData, type GameData } from "./data/load.js";
import { buildLevel, type BuiltLevel } from "./level/builder.js";
import { initRapier, PLAYER_GROUPS, QUERY_SOLID, QUERY_STATIC as QUERY_STATIC_FILTER, refreshBroadPhase, type CharacterController, type Rapier, type World } from "./physics/rapier.js";
import { capsuleFree, movementPrompt, poseCollider, stepPawn, type MoveContext, type MovementPrompt } from "./player/movement.js";
import { initialPawnState, type Pawn, type PlayerController } from "./player/pawn.js";
import { capsuleDims, stanceDims } from "./player/stance.js";
import { Btn, PawnMode, Stance, type InputCmd, type PawnState } from "./player/types.js";

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
    // Pawns are kinematic colliders moved by our own code; world.step() only refreshes query structures
    // (refreshBroadPhase), so give it nothing to integrate.
    world.timestep = 0;
    const level = buildLevel(R, world, def);
    const cc = world.createCharacterController(0.02);
    cc.enableAutostep(m.step.maxStepHeight, 0.2, false);
    cc.enableSnapToGround(m.step.snapToGround);
    cc.setMaxSlopeClimbAngle(m.step.maxSlopeDeg * DEG);
    cc.setMinSlopeSlideAngle(m.step.maxSlopeDeg * DEG);
    const sim = new Sim(R, world, cc, data, level);
    // A capsule spawned inside geometry gets stuck (found in the §3 spike), so check every spawn at load.
    for (const sp of def.spawns) {
      if (!capsuleFree(sim.ctx, null, sp.pos[0], sp.pos[1] + 0.02, sp.pos[2], m.stance.stand.height)) {
        throw new Error(`Level "${levelId}": spawn "${sp.id}" at ${sp.pos.join(", ")} overlaps level geometry`);
      }
    }
    return sim;
  }

  /**
   * Create a controller and its pawn(s) at a level spawn. Skopós gets two shells side by side. `ids` lets a
   * client mirror the server's controller and pawn ids for the player it predicts.
   */
  addPlayer(name: string, operatorId: string, spawnIndex = 0, ids?: { controller: number; pawns: number[] }): PlayerController {
    const op = this.data.operators.get(operatorId);
    if (!op) throw new Error(`Unknown operator "${operatorId}"`);
    if (ids && ids.pawns.length !== op.pawns) throw new Error(`${op.name} has ${op.pawns} pawn(s), got ${ids.pawns.length} ids`);
    for (const id of ids?.pawns ?? []) if (this.pawns.has(id)) throw new Error(`pawn id ${id} is already in use`);
    if (ids && this.controllers.has(ids.controller)) throw new Error(`controller id ${ids.controller} is already in use`);
    const spawn = this.level.def.spawns[spawnIndex % this.level.def.spawns.length];
    const yaw = spawn.yawDeg * DEG;
    const controller: PlayerController = {
      id: ids ? this.claimId(ids.controller) : this.nextId++,
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
    // Check every shell's spot before creating any, so a failed join leaves nothing behind.
    const m = this.data.movement;
    const shellOffset = op.ability.params.idleShellOffset ?? 0; // required for 2-pawn operators (schema)
    const minOffset = 2 * m.stance.collisionRadius + 0.02; // two bodies plus the controller's contact gap
    if (op.pawns > 1 && shellOffset < minOffset) {
      throw new Error(`${op.name}: ability.params.idleShellOffset (${shellOffset}) must be at least two body radii (${minOffset})`);
    }
    const shellSpots = (bx: number, bz: number): [number, number][] =>
      Array.from({ length: op.pawns }, (_, i) => {
        const [ox, oz] = rotateXZ(i * shellOffset, 0, yaw);
        return [bx + ox, bz + oz];
      });
    // capsuleFree tests a slightly shrunken body (right for walls); between players, keep a full body gap.
    const clearOfPlayers = ([px, pz]: [number, number]) =>
      [...this.pawns.values()].every((p) => p.state.mode === PawnMode.Dead || Math.hypot(p.state.x - px, p.state.z - pz) >= minOffset);
    const fits = (spots: [number, number][], filter: number) =>
      spots.every(([px, pz]) => capsuleFree(this.ctx, null, px, spawn.pos[1] + 0.02, pz, m.stance.stand.height, filter) && (filter !== QUERY_SOLID || clearOfPlayers([px, pz])));
    const home = shellSpots(spawn.pos[0], spawn.pos[2]);
    if (!fits(home.slice(1), QUERY_STATIC_FILTER)) {
      throw new Error(`${op.name}'s second shell would spawn inside level geometry at spawn "${spawn.id}"`);
    }
    // Other players already on the spawn: take the nearest free spot around it (rings 0.8 m apart).
    let spots = home;
    search: for (let ring = 0; ring <= 6; ring++) {
      for (let k = 0; k < (ring === 0 ? 1 : 8); k++) {
        const a = (k / 8) * 2 * Math.PI;
        const cand = shellSpots(spawn.pos[0] + Math.cos(a) * ring * 0.8, spawn.pos[2] + Math.sin(a) * ring * 0.8);
        if (fits(cand, QUERY_SOLID)) {
          spots = cand;
          break search;
        }
      }
    }
    for (const [i, [px, pz]] of spots.entries()) {
      const pawn = this.spawnPawn(operatorId, px, spawn.pos[1], pz, yaw, controller.id, ids?.pawns[i]);
      if (i > 0) pawn.state.stance = pawn.state.stanceFrom = Stance.Crouch; // idle shells crouch behind their shield
      controller.pawnIds.push(pawn.id);
    }
    controller.possessedPawnId = controller.pawnIds[0];
    this.controllers.set(controller.id, controller);
    return controller;
  }

  private claimId(id: number): number {
    if (!Number.isInteger(id) || id < 1) throw new Error(`bad id ${id}`);
    this.nextId = Math.max(this.nextId, id + 1);
    return id;
  }

  spawnPawn(operatorId: string, x: number, y: number, z: number, yaw: number, ownerId: number | null = null, id?: number): Pawn {
    const m = this.data.movement;
    const op = this.data.operators.get(operatorId);
    const maxHp = m.healthByRating[String(op?.healthRating ?? 2) as "1" | "2" | "3"];
    const { r, hh } = capsuleDims(m.stance.stand.height, m.stance.collisionRadius);
    const collider = this.world.createCollider(
      this.R.ColliderDesc.capsule(hh, r).setTranslation(x, y + hh + r + 0.02, z).setCollisionGroups(PLAYER_GROUPS),
    );
    const pawnId = id !== undefined ? this.claimId(id) : this.nextId++;
    const pawn: Pawn = { id: pawnId, operatorId, ownerId, collider, state: initialPawnState(x, y + 0.02, z, Math.fround(yaw), maxHp) };
    this.pawns.set(pawn.id, pawn);
    refreshBroadPhase(this.world); // a new collider is invisible to queries until the next refresh
    return pawn;
  }

  /**
   * A stand-in for a pawn simulated somewhere else (another player, as seen by a client): it blocks
   * movement like any pawn, but step() never moves it; setPawnState() places it.
   */
  addProxy(id: number, operatorId: string, state: PawnState): Pawn {
    if (this.pawns.has(id)) throw new Error(`pawn id ${id} is already in use`);
    const collider = this.world.createCollider(this.R.ColliderDesc.capsule(0.5, 0.3).setCollisionGroups(PLAYER_GROUPS));
    const pawn: Pawn = { id: this.claimId(id), operatorId, ownerId: null, collider, state: { ...state }, proxy: true };
    this.pawns.set(id, pawn);
    poseCollider(this.ctx, pawn);
    refreshBroadPhase(this.world);
    return pawn;
  }

  /**
   * Overwrite a pawn's state exactly and move its collider to match (reconciliation restoring the
   * server's state, or a proxy following snapshots). The state itself is copied untouched.
   */
  setPawnState(id: number, state: PawnState): void {
    const pawn = this.pawns.get(id);
    if (!pawn) throw new Error(`no pawn ${id}`);
    pawn.state = { ...state };
    poseCollider(this.ctx, pawn);
    refreshBroadPhase(this.world);
  }

  removePawn(id: number): void {
    const pawn = this.pawns.get(id);
    if (!pawn) return;
    this.world.removeCollider(pawn.collider, false);
    this.pawns.delete(id);
    refreshBroadPhase(this.world);
  }

  /** Remove a controller and every pawn it owns (a player leaving). */
  removePlayer(controllerId: number): void {
    const c = this.controllers.get(controllerId);
    if (!c) return;
    for (const id of c.pawnIds) this.removePawn(id);
    this.controllers.delete(controllerId);
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
    const { r, hh } = capsuleDims(m.stance.stand.height, m.stance.collisionRadius);
    pawn.collider.setRadius(r);
    pawn.collider.setHalfHeight(hh);
    pawn.collider.setTranslation({ x: spawn.pos[0], y: spawn.pos[1] + hh + r + 0.02, z: spawn.pos[2] });
    pawn.state = initialPawnState(spawn.pos[0], spawn.pos[1] + 0.02, spawn.pos[2], Math.fround(spawn.yawDeg * DEG), pawn.state.maxHp);
    poseCollider(this.ctx, pawn); // also makes a dead body solid again
    refreshBroadPhase(this.world);
  }

  /** Move a pawn to feet position (x, y, z) in a settled stance (lab "go to" menu, tests, admin tools). */
  teleport(pawnId: number, x: number, y: number, z: number, yawDeg = 0, stance: Stance = Stance.Stand): void {
    const pawn = this.pawns.get(pawnId);
    if (!pawn) return;
    const m = this.data.movement;
    const { r, hh } = capsuleDims(stanceDims(m, stance).height, m.stance.collisionRadius);
    pawn.collider.setRadius(r);
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
      tiltF: 0,
      tiltB: 0,
      tiltSide: 0,
      tuck: 0,
      grounded: false,
      sprinting: false,
      mode: PawnMode.Walk,
      ladder: -1,
      airPeakY: Math.fround(y + 0.02),
    });
    if (pawn.state.hp === 0) pawn.state.hp = pawn.state.maxHp;
    poseCollider(this.ctx, pawn); // also makes a dead body solid again
    refreshBroadPhase(this.world);
  }

  /**
   * Advance one tick. Possessed pawns get their controller's input. Idle pawns stand still (gravity only);
   * idle Skopós shells stay crouched. While Skopós looks through her other shell's camera, her mouse
   * turns that shell's view and the body she left stands still.
   */
  step(inputs: ReadonlyMap<number, InputCmd>): void {
    const drive = new Map<number, InputCmd>();
    // Pawns driven without real buttons this tick (the body left behind on the shell camera, the shell
    // being looked through): like the no-input case below, their held-button memory is kept.
    const idleDriven = new Set<number>();
    for (const c of this.controllers.values()) {
      const input = inputs.get(c.id);
      const heldBefore = c.prevButtons;
      const viewedBefore = this.viewedPawnId(c.id);
      const onCamBefore = c.shellCam || c.swapPhase !== 0;
      this.updateShells(c, input);
      // The view belongs to whichever body you were looking through: on the tick that changes (the camera
      // opens or closes), the newly viewed body keeps its own facing instead of taking the old view's.
      const viewChanged = this.viewedPawnId(c.id) !== viewedBefore;
      const target = c.shellCam || c.swapPhase ? this.otherPawn(c.id) : null;
      if (target) {
        const active = this.pawns.get(c.possessedPawnId);
        if (active) {
          drive.set(active.id, idleInput(active, c.swapPhase === 1 ? Stance.Crouch : active.state.stance));
          idleDriven.add(active.id);
        }
        const view = input && !viewChanged ? { yaw: input.yaw, pitch: input.pitch } : {};
        drive.set(target.id, { ...idleInput(target, c.swapPhase === 2 ? Stance.Stand : target.state.stance), ...view });
        idleDriven.add(target.id);
      } else if (input) {
        const body = this.pawns.get(c.possessedPawnId);
        // Back in a body after the camera or a swap: keys already held don't count as fresh presses.
        if (body && onCamBefore) body.state.prevButtons = heldBefore;
        drive.set(c.possessedPawnId, body && viewChanged ? { ...input, yaw: body.state.yaw, pitch: body.state.pitch } : input);
      }
    }
    for (const pawn of this.pawns.values()) {
      if (pawn.proxy) continue; // simulated elsewhere
      const input = drive.get(pawn.id);
      if (input) {
        const held = pawn.state.prevButtons;
        stepPawn(this.ctx, pawn, input);
        refreshBroadPhase(this.world); // the next pawn must see this one where it now is
        if (idleDriven.has(pawn.id)) pawn.state.prevButtons = held;
        continue;
      }
      const owner = pawn.ownerId !== null ? this.controllers.get(pawn.ownerId) : undefined;
      const idleShell = owner !== undefined && owner.pawnIds.length > 1 && owner.possessedPawnId !== pawn.id;
      // No input this tick (idle shell, or a dropped packet): stand still, and keep the held-button
      // memory so keys still held when input resumes don't count as fresh presses.
      const held = pawn.state.prevButtons;
      stepPawn(this.ctx, pawn, idleInput(pawn, idleShell ? Stance.Crouch : pawn.state.stance));
      refreshBroadPhase(this.world);
      pawn.state.prevButtons = held;
    }
    this.tick++;
  }

  /**
   * Skopós shell swap (research/operators/skopos.md §3.2): the ability key opens the idle shell's camera;
   * interact, while on that camera, starts the swap: transfer (the active shell idles), then activation
   * (the target shell wakes up), then a short cooldown. Timings come from the operator's ability params
   * and run every tick, even when this tick's input is missing (it only carries the key presses).
   */
  private updateShells(c: PlayerController, input: InputCmd | undefined) {
    let pressed = 0;
    if (input) {
      pressed = input.buttons & ~c.prevButtons;
      c.prevButtons = input.buttons;
    }
    if (c.pawnIds.length < 2) return;
    const params = this.data.operators.get(c.operatorId)!.ability.params; // validated by the schema
    const transfer = params.transferSeconds;
    const activation = params.activationSeconds;
    c.swapCooldown = Math.fround(Math.max(0, c.swapCooldown - DT)); // float32-exact, like pawn state

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
        c.swapCooldown = Math.fround(params.swapCooldownSeconds);
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
