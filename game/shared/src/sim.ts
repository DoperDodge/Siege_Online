// A simulation instance: one physics world + level + pawns + controllers. The Node server runs one per
// match room; the browser runs one for prediction and for offline Practice / Bot Training (PLAN §5).
import { DT } from "./core/constants.js";
import { clamp, forwardXZ, rotateXZ, DEG, wrapAngle } from "./core/math.js";
import { loadGameData, type GameData } from "./data/load.js";
import { deployAction, deployTicks, DeployKind, type DeployAction, type DeployRules } from "./destruction/deploy.js";
import { buildLevel, type BuiltLevel } from "./level/builder.js";
import { initRapier, PLAYER_GROUPS, QUERY_DRONE, QUERY_SIGHT, QUERY_SOLID, QUERY_STATIC as QUERY_STATIC_FILTER, refreshBroadPhase, type CharacterController, type Rapier, type World } from "./physics/rapier.js";
import { cancelRappelHold, capsuleFree, movementPrompt, poseCollider, stepPawn, type MoveContext, type MovementPrompt } from "./player/movement.js";
import { initialPawnState, type Pawn, type PlayerController } from "./player/pawn.js";
import { droneCollider, droneEye, stepDrone } from "./player/drone.js";
import { insideAny, zoneBoxes, ZONE_TEST_HEIGHT, type ZoneBox } from "./level/zones.js";
import { raycastLevel } from "./level/raycast.js";
import { GadgetTable, GFlag, type Gadget } from "./gadgets/table.js";
import { KIND_BP_CAMERA, kindId } from "./gadgets/kinds.js";
import { gadgetOnRay } from "./gadgets/hits.js";
import { placeSpotFor, slotCounts, slotGadget } from "./gadgets/hands.js";
import { CAMERA_HALF_M } from "./intel/cameras.js";
import { canDisable, canPickUp, inSite, siteArea, type DefuserState, type SiteArea } from "./match/objective.js";
import { eyePose, poseHitboxes } from "./player/hitboxes.js";
import { capsuleDims, stanceDims } from "./player/stance.js";
import { Btn, GadgetAct, PawnKind, PawnMode, ropeIdle, Stance, type InputCmd, type PawnState } from "./player/types.js";
import { isDowned } from "./player/downed.js";
import { defaultLoadoutPick, resolveLoadout, type LoadoutPick, type ResolvedLoadout } from "./weapons/loadout.js";
import type { SimEvent } from "./weapons/step.js";
import { viewDir } from "./weapons/spread.js";
import { ticks } from "./weapons/ticks.js";

/**
 * What a match decides that the simulation must know, so a client predicts it the way the server applies it
 * (match/DESIGN.md §6): set by the room, and on a client from the room's match state.
 */
export interface MatchSimRules {
  /** Red walls (prep): a defender's move that would take its feet out of the building zones is undone. */
  redWalls: boolean;
  /** Below the kill plane a body dies (the room kills it) instead of going back to spawn 0 (labs). */
  killPlaneKills: boolean;
  /**
   * Defenders watch the level's default cameras, then the round's Bulletproof Cameras (Phase 7, a match; the gadget
   * table's, Phase 8); `camsBroken`: a bit for each broken default camera.
   */
  cameras: boolean;
  camsBroken: number;
}

/** A camera's lens sits this far out of the front of its box (metres). */
const LENS_AHEAD_M = 0.03;

/** A dropped thing's floor is looked for from this far over the point it was let go at, down to this far below it (metres). */
const DROP_FROM_ABOVE = 0.1;
const DROP_MAX_FALL = 60;

/** Contextual hint for the HUD: "Space to mantle", "F to climb", "F to transfer" (Skopós camera), "Hold F to reinforce". */
export type Prompt = MovementPrompt | "transfer" | "revive" | "reinforce" | "barricade" | "unbarricade" | "plant" | "disable" | "pickUp" | "pickUpDrone" | "pickUpGadget";

export class Sim {
  readonly pawns = new Map<number, Pawn>();
  readonly controllers = new Map<number, PlayerController>();
  tick = 0;
  /**
   * Who may reinforce, barricade (Phase 4 M6) and rappel (Phase 5 M8), and the reinforcements left per team: set
   * by the room, and on a client from the room's deployRules event, so holds are predicted the way the server
   * judges them.
   */
  deployRules: DeployRules = { anyone: false, rappel: false, pools: [0, 0] };
  /** A match room's rules for bodies (none in a lab). */
  matchRules: MatchSimRules = { redWalls: false, killPlaneKills: false, cameras: false, camsBroken: 0 };
  /**
   * Everything placed, thrown or dropped this round (Phase 8, gadgets/table.ts): the server's room changes it, a client
   * applies the server's ops. The simulation reads entries' flags and places (never their ticks).
   */
  readonly gadgets = new GadgetTable();
  private bpCache: { version: number; list: Gadget[] } = { version: -1, list: [] };
  /**
   * The defuser in a match (null in a lab): who carries it, where it lies or is planted, the site and the holds
   * (match/objective.ts). The simulation moves it (pick up, drop, plant); the room sets the rest.
   */
  objective: DefuserState | null = null;
  private readonly siteAreas = new Map<string, SiteArea | null>();
  /** The level's building zones (level.json, D-105): red walls and run-outs. */
  readonly building: ZoneBox[];
  private nextId = 1;
  private readonly ctx: MoveContext;

  private constructor(
    readonly R: Rapier,
    readonly world: World,
    readonly cc: CharacterController,
    readonly dcc: CharacterController,
    readonly data: GameData,
    readonly level: BuiltLevel,
  ) {
    // Attackers rappel; in a lab room anyone does (deployRules.rappel, from the room's rules).
    this.ctx = { R, world, cc, dcc, data, level, events: [], canRappel: (pawn) => pawn.team === sideTeam("attacker") || this.deployRules.rappel };
    this.building = zoneBoxes(level.def, "building");
  }

  /** Whether a body's feet (x, y, z) are inside the building (false on a level without building zones). */
  insideBuilding(x: number, y: number, z: number): boolean {
    return insideAny(this.building, x, y + ZONE_TEST_HEIGHT, z);
  }

  /** One body's step, with what the level and the match add: the kill plane and the red walls. */
  private stepBody(pawn: Pawn, cmd: InputCmd, live: boolean, fresh: boolean) {
    const s = pawn.state;
    const confined = this.matchRules.redWalls && pawn.team === sideTeam("defender") && this.building.length > 0;
    const before = confined ? { x: s.x, y: s.y, z: s.z, mode: s.mode } : null;
    stepPawn(this.ctx, pawn, cmd, live, fresh);
    if (before) this.keepInside(pawn, before);
    this.belowKillPlane(pawn);
  }

  /**
   * Red walls: a move that took a defender's feet out of the building is undone (back where it was, stopped),
   * and a vault or climb that would land outside doesn't start. Inside the building nothing changes.
   */
  private keepInside(pawn: Pawn, before: { x: number; y: number; z: number; mode: PawnMode }) {
    const s = pawn.state;
    const started = s.mode === PawnMode.Vault && before.mode !== PawnMode.Vault;
    if (this.insideBuilding(s.x, s.y, s.z) && !(started && !this.insideBuilding(s.toX, s.toY, s.toZ))) return;
    s.x = before.x;
    s.y = before.y;
    s.z = before.z;
    s.vx = 0;
    s.vy = 0; // in the air too: a fall held back doesn't gather speed
    s.vz = 0;
    if (s.mode === PawnMode.Vault) {
      s.mode = PawnMode.Walk;
      s.moveT = 0;
      s.moveDur = 0;
      s.tuck = 0;
    }
    poseCollider(this.ctx, pawn);
  }

  /**
   * What happened during the last step() call (shots, reloads): cleared when the next one starts, so the
   * server reads it after every step (catch-up steps too) and a client only after a fresh prediction.
   */
  get events(): readonly SimEvent[] {
    return this.ctx.events;
  }

  static async create(levelId: string, data: GameData = loadGameData()): Promise<Sim> {
    const R = await initRapier();
    const def = data.levels.get(levelId);
    if (!def) throw new Error(`Unknown level "${levelId}"`);
    const m = data.movement;
    const world = new R.World({ x: 0, y: m.gravity, z: 0 });
    // Pawns are kinematic colliders moved by our own code; world.step() only refreshes query structures
    // (refreshBroadPhase) and there are no rigid bodies to integrate. The timestep must not be 0 all the
    // same: with a zero timestep, after a collider has been removed, Rapier 0.21's tree intermittently
    // loses static colliders (the floor missing from every query on ~9% of ticks; DECISIONS D-037).
    world.timestep = DT;
    const level = buildLevel(R, world, def, data.destruction);
    const cc = world.createCharacterController(0.02);
    cc.enableAutostep(m.step.maxStepHeight, 0.2, false);
    cc.enableSnapToGround(m.step.snapToGround);
    cc.setMaxSlopeClimbAngle(m.step.maxSlopeDeg * DEG);
    cc.setMinSlopeSlideAngle(m.step.maxSlopeDeg * DEG);
    // Drones (Phase 7): a thin skin, a small step (data/intel.json `stepM`), the bodies' slopes.
    const drone = data.intel.drone;
    const dcc = world.createCharacterController(0.01);
    if (drone.stepM > 0) dcc.enableAutostep(drone.stepM, 0.05, false);
    dcc.enableSnapToGround(0.05);
    dcc.setMaxSlopeClimbAngle(m.step.maxSlopeDeg * DEG);
    dcc.setMinSlopeSlideAngle(m.step.maxSlopeDeg * DEG);
    const sim = new Sim(R, world, cc, dcc, data, level);
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
   * client mirror the server's controller and pawn ids for the player it predicts. `pick` is the loadout
   * (an invalid one becomes the operator's default, DECISIONS D-042); every shell carries the same one,
   * each with its own ammo.
   */
  addPlayer(name: string, operatorId: string, spawnIndex = 0, ids?: { controller: number; pawns: number[] }, pick?: LoadoutPick, team?: number): PlayerController {
    const op = this.data.operators.get(operatorId);
    if (!op) throw new Error(`Unknown operator "${operatorId}"`);
    const side = team ?? sideTeam(op.side);
    const loadout = resolveLoadout(this.data, pick && pick.operator === operatorId ? pick : defaultLoadoutPick(this.data, operatorId)).loadout;
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
      drone: 0,
      prevLean: 0,
      cam: 0,
      camYaw: 0,
      camPitch: 0,
      shellCam: false,
      swapPhase: 0,
      swapT: 0,
      swapCooldown: 0,
      prevButtons: 0,
      team: side,
    };
    // Check every shell's spot before creating any, so a failed join leaves nothing behind.
    const m = this.data.movement;
    const shellOffset = op.ability.params.idleShellOffset ?? 0; // required for 2-pawn operators (schema)
    const minOffset = 2 * m.stance.collisionRadius + 0.02; // two bodies plus the controller's contact gap
    if (op.pawns > 1 && shellOffset < minOffset) {
      throw new Error(`${op.name}: ability.params.idleShellOffset (${shellOffset}) must be at least two body radii (${minOffset})`);
    }
    // The shells stand in a line from the first: to its right, or another way round when a wall or a prop is there.
    const turns = op.pawns > 1 ? [0, 180, 90, -90, 45, -45, 135, -135].map((d) => d * DEG) : [0];
    const shellSpots = (bx: number, bz: number, turn: number): [number, number][] =>
      Array.from({ length: op.pawns }, (_, i) => {
        const [ox, oz] = rotateXZ(i * shellOffset, 0, yaw + turn);
        return [bx + ox, bz + oz];
      });
    // capsuleFree tests a slightly shrunken body (right for walls); between players, keep a full body gap.
    const clearOfPlayers = ([px, pz]: [number, number]) =>
      [...this.pawns.values()].every((p) => p.state.mode === PawnMode.Dead || Math.hypot(p.state.x - px, p.state.z - pz) >= minOffset);
    // Nothing static between two spots at chest height: a free spot behind a thin wall is in the next room.
    const inSight = ([ax, az]: [number, number], [bx, bz]: [number, number]) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) return true;
      const ray = new this.R.Ray({ x: ax, y: spawn.pos[1] + 1, z: az }, { x: (bx - ax) / len, y: 0, z: (bz - az) / len });
      return this.world.castRay(ray, len, true, undefined, QUERY_STATIC_FILTER) === null;
    };
    // Spots from `from` on (1: the shells only, the spawn itself trusted) are free, and in sight of the first.
    const fits = (spots: [number, number][], filter: number, from = 0) =>
      spots.every(
        ([px, pz], i) =>
          i < from ||
          (capsuleFree(this.ctx, null, px, spawn.pos[1] + 0.02, pz, m.stance.stand.height, filter) &&
            (filter !== QUERY_SOLID || clearOfPlayers([px, pz])) &&
            inSight(spots[0], [px, pz])),
      );
    // The nearest arrangement around the spawn clear of the level and of other players (rings 0.8 m apart, each
    // in sight of the spawn); with none, the first on the spawn itself clear of the level (players get pushed apart).
    const at: [number, number] = [spawn.pos[0], spawn.pos[2]];
    let spots: [number, number][] | null = null;
    let crowded: [number, number][] | null = null;
    search: for (let ring = 0; ring <= 6; ring++) {
      for (let k = 0; k < (ring === 0 ? 1 : 8); k++) {
        const a = (k / 8) * 2 * Math.PI;
        const base: [number, number] = [at[0] + Math.cos(a) * ring * 0.8, at[1] + Math.sin(a) * ring * 0.8];
        if (!inSight(at, base)) continue;
        for (const turn of turns) {
          const cand = shellSpots(base[0], base[1], turn);
          if (fits(cand, QUERY_SOLID)) {
            spots = cand;
            break search;
          }
          if (ring === 0 && !crowded && fits(cand, QUERY_STATIC_FILTER, 1)) crowded = cand;
        }
      }
    }
    spots ??= crowded;
    if (!spots) throw new Error(`${op.name}'s second shell has no room at spawn "${spawn.id}": a wall or a prop on every side`);
    for (const [i, [px, pz]] of spots.entries()) {
      const pawn = this.spawnPawn(operatorId, px, spawn.pos[1], pz, yaw, controller.id, ids?.pawns[i], loadout, side);
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

  spawnPawn(
    operatorId: string,
    x: number,
    y: number,
    z: number,
    yaw: number,
    ownerId: number | null = null,
    id?: number,
    loadout: ResolvedLoadout | null = null,
    team = 0,
    kind = PawnKind.Body,
  ): Pawn {
    const m = this.data.movement;
    const op = this.data.operators.get(operatorId);
    const maxHp = kind === PawnKind.Drone ? 1 : m.healthByRating[String(op?.healthRating ?? 2) as "1" | "2" | "3"];
    const { r, hh } = capsuleDims(m.stance.stand.height, m.stance.collisionRadius);
    const collider =
      kind === PawnKind.Drone
        ? droneCollider(this.R, this.world, this.data.intel.drone)
        : this.world.createCollider(this.R.ColliderDesc.capsule(hh, r).setTranslation(x, y + hh + r + 0.02, z).setCollisionGroups(PLAYER_GROUPS));
    if (kind === PawnKind.Drone) collider.setTranslation({ x, y: y + this.data.intel.drone.sizeM[1] / 2 + 0.02, z });
    const pawnId = id !== undefined ? this.claimId(id) : this.nextId++;
    // Float32-exact like every other state, and the collider placed from that state the same way a client
    // places it from the correction it gets for this body, so both start bit-identical.
    const t = collider.translation();
    const pawn: Pawn = { id: pawnId, kind, operatorId, ownerId, collider, loadout, team, life: 0, state: initialPawnState(t.x, Math.fround(y + 0.02), t.z, Math.fround(yaw), maxHp, loadout) };
    if (kind === PawnKind.Drone) pawn.state.mode = PawnMode.Held;
    else [pawn.state.g1, pawn.state.g2] = slotCounts(this.data, loadout);
    // Recoil randomness: any non-zero start works for xorshift; a server reseeds it from its room seed and
    // the client gets the value with the body's first correction.
    pawn.state.rng = Math.imul(pawnId, 0x9e3779b1) >>> 0 || 1;
    poseCollider(this.ctx, pawn);
    this.pawns.set(pawn.id, pawn);
    refreshBroadPhase(this.world); // a new collider is invisible to queries until the next refresh
    return pawn;
  }

  /**
   * A stand-in for a pawn simulated somewhere else (another player, as seen by a client): it blocks
   * movement like any pawn, but step() never moves it; setPawnState() places it.
   */
  addProxy(id: number, operatorId: string, state: PawnState, loadout: ResolvedLoadout | null = null, team = 0, kind = PawnKind.Body): Pawn {
    if (this.pawns.has(id)) throw new Error(`pawn id ${id} is already in use`);
    const collider =
      kind === PawnKind.Drone
        ? droneCollider(this.R, this.world, this.data.intel.drone)
        : this.world.createCollider(this.R.ColliderDesc.capsule(0.5, 0.3).setCollisionGroups(PLAYER_GROUPS));
    const pawn: Pawn = { id: this.claimId(id), kind, operatorId, ownerId: null, collider, loadout, team, life: 0, state: { ...state }, proxy: true };
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
    this.cutReviveLinks(pawn);
    this.world.removeCollider(pawn.collider, false);
    this.pawns.delete(id);
    refreshBroadPhase(this.world);
  }

  /**
   * A body leaves, respawns or jumps (a lab tool): any revive it was part of ends, on both sides. Both
   * bodies' own records go (the reviver's progress, the downed body's "being revived").
   */
  cutReviveLinks(pawn: Pawn): void {
    for (const p of this.pawns.values()) {
      if (p === pawn) continue;
      let cut = false;
      if (p.state.revivedBy === pawn.id) {
        p.state.revivedBy = 0;
        cut = true;
      }
      if (p.state.reviveTarget === pawn.id) {
        p.state.reviveTarget = 0;
        p.state.reviveTicks = 0;
        cut = true;
      }
      if (cut) this.onReviveCut?.(p);
    }
    pawn.state.reviveTarget = 0;
    pawn.state.reviveTicks = 0;
    pawn.state.revivedBy = 0;
  }

  /**
   * Server: told of each body whose revive was cut by something another body did (it left, respawned,
   * jumped, went down or died). That body's owner couldn't predict it, so the room corrects them.
   */
  onReviveCut: ((pawn: Pawn) => void) | null = null;

  /**
   * A body its player's buttons don't reach this tick lets go of a revive (D-061: a stalled reviver can't
   * keep one going). A hold on a panel, or to hook on a rope, lets go only when the player is elsewhere (driven
   * idle on the shell camera, `idle`); through a stall it just waits, and goes on if the key is still held when
   * inputs come back (it takes a fresh press to start, so a hold ended by a stall could never restart while held).
   */
  private letGo(pawn: Pawn, idle: boolean) {
    if (pawn.state.reviveTarget !== 0) this.endRevive(pawn, this.pawns.get(pawn.state.reviveTarget), false);
    if (idle) {
      endDeploy(pawn);
      cancelRappelHold(pawn.state);
    }
  }

  /**
   * What holding Interact would do to a panel right now (destruction/deploy.ts): from the body's eye along
   * its view, stopped by plain level geometry.
   */
  deployActionFor(pawn: Pawn): DeployAction | null {
    const s = pawn.state;
    if (s.mode !== PawnMode.Walk || !s.grounded) return null;
    const eye = eyePose(this.data.movement, this.data.hitboxes, s).pos;
    const dir = viewDir(s.yaw, s.pitch);
    const ray = new this.R.Ray({ x: eye[0], y: eye[1], z: eye[2] }, { x: dir[0], y: dir[1], z: dir[2] });
    const limit = this.data.destruction.reinforcement.reach + 1.5;
    const plain = this.world.castRay(ray, limit, true, undefined, QUERY_SIGHT)?.timeOfImpact ?? limit;
    return deployAction(this.data.destruction, this.level.panels, eye, dir, [s.x, s.y, s.z], pawn.team, this.deployRules, plain);
  }

  /** The plantable area of a site (cached; null: no such site). */
  private areaOf(site: string): SiteArea | null {
    if (!this.siteAreas.has(site)) this.siteAreas.set(site, siteArea(this.level.def, site));
    return this.siteAreas.get(site) ?? null;
  }

  /**
   * What the Use key would do with the defuser now (match/DESIGN.md §8, D-120): an attacker on foot picks a dropped
   * one up from close by; its carrier plants it in the site's rooms while planting is open; a defender disables a
   * planted one within reach, facing it. Null: nothing (no match, or none of these).
   */
  defuserActionFor(pawn: Pawn): "pickUp" | "plant" | "disable" | null {
    const o = this.objective;
    const s = pawn.state;
    if (!o || s.mode !== PawnMode.Walk || !s.grounded) return null;
    const attacker = pawn.team === sideTeam("attacker");
    if (attacker && o.dropped && o.carrier === 0 && canPickUp(this.data.objective, o.dropped, s.x, s.y, s.z)) return "pickUp";
    if (attacker && o.carrier === pawn.id && o.canPlant && o.site) {
      const area = this.areaOf(o.site);
      if (area && inSite(area, s.x, s.y, s.z)) return "plant";
    }
    if (!attacker && o.planted && canDisable(this.data.objective, o.planted, s.x, s.y, s.z, s.yaw)) return "disable";
    return null;
  }

  /** The defuser's hold kept up: the same action still offered, Interact still held; done after the format's time. */
  private holdDefuser(pawn: Pawn, held: boolean): boolean {
    const s = pawn.state;
    const o = this.objective;
    const want = s.deployKind === DeployKind.Plant ? "plant" : "disable";
    if (!o || !held || s.meleeTicks > 0 || this.defuserActionFor(pawn) !== want) {
      endDeploy(pawn);
      return false;
    }
    s.deployTicks = Math.min(0xffff, s.deployTicks + 1);
    if (s.deployTicks < (want === "plant" ? o.plantTicks : o.disableTicks)) return true;
    if (want === "plant") {
      o.planted = [s.x, s.y, s.z];
      o.carrier = 0;
      this.ctx.events.push({ kind: "plant", pawnId: pawn.id, pos: [s.x, s.y, s.z] });
    } else this.ctx.events.push({ kind: "disable", pawnId: pawn.id });
    endDeploy(pawn);
    return true; // still this tick
  }

  /**
   * One of this body's own gadgets that can be picked up (data/gadgets/<id>.json `pickUp`), first along its view within
   * data/gadgets.json `pickUpReachM` and in sight, of a kind one of its slots holds: Interact held takes it back.
   */
  gadgetToPickUp(pawn: Pawn): Gadget | null {
    const s = pawn.state;
    if (pawn.kind !== PawnKind.Body || pawn.ownerId === null || s.mode !== PawnMode.Walk || !s.grounded || !pawn.loadout) return null;
    const slots = [slotGadget(this.data, pawn.loadout, 1)?.id, slotGadget(this.data, pawn.loadout, 2)?.id];
    const eye = eyePose(this.data.movement, this.data.hitboxes, s).pos;
    const dir = viewDir(s.yaw, s.pitch);
    const reach = this.data.gadgetRules.pickUpReachM;
    const plain = raycastLevel(this, eye, dir, reach)?.t ?? reach;
    const hit = gadgetOnRay(this.gadgets, this.data, eye, dir, plain + 0.05, (g) => {
      const id = this.data.gadgets.get(kindId(g.kind) ?? "");
      return g.owner === pawn.ownerId && !(g.flags & GFlag.Flying) && id !== undefined && id.pickUp && slots.includes(id.id);
    });
    return hit?.g ?? null;
  }

  /** The pick-up hold kept up on the same gadget, Interact still held: after data/gadgets.json `pickUpS`, it's back in its slot. */
  private holdPickUp(pawn: Pawn, held: boolean): boolean {
    const s = pawn.state;
    const g = held && s.meleeTicks === 0 ? this.gadgetToPickUp(pawn) : null;
    if (!g || g.id !== s.gTarget) {
      endDeploy(pawn);
      return false;
    }
    s.deployTicks = Math.min(0xffff, s.deployTicks + 1);
    if (s.deployTicks < ticks(this.data.gadgetRules.pickUpS)) return true;
    const id = kindId(g.kind);
    if (id === slotGadget(this.data, pawn.loadout, 1)?.id) s.g1++;
    else s.g2++;
    this.ctx.events.push({ kind: "pickUpGadget", pawnId: pawn.id, gadgetId: g.id });
    endDeploy(pawn);
    return true; // still this tick
  }

  /** The carrier's Drop key: the defuser falls to the floor under the body (off a rope or a ladder too). */
  private dropDefuser(pawn: Pawn, input: InputCmd) {
    const o = this.objective;
    if (!o || o.carrier !== pawn.id || !(input.buttons & ~pawn.state.prevButtons & Btn.Drop)) return;
    const s = pawn.state;
    o.carrier = 0;
    o.dropped = this.dropSpot(s.x, s.y, s.z);
    this.ctx.events.push({ kind: "drop", pawnId: pawn.id, pos: o.dropped });
  }

  /**
   * Where something let go of at (x, y, z) comes to rest: on the first floor under it (the level, its panels and props;
   * never a body), or where it is when nothing is under it. A defuser dropped from a rope lands at the wall's foot.
   */
  dropSpot(x: number, y: number, z: number): [number, number, number] {
    const from = y + DROP_FROM_ABOVE;
    const hit = this.world.castRay(new this.R.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 }), DROP_MAX_FALL, true, undefined, QUERY_STATIC_FILTER);
    return [x, hit ? from - hit.timeOfImpact : y, z];
  }

  /**
   * Holds of Interact: the defuser's first (pick up, plant, disable; D-120), then reinforcing and barricades (Phase
   * 4 M6). A fresh press starts what is offered; holding it, still offered the same, for its time completes it (a
   * "deploy", "plant" or "disable" event), and the body holds still meanwhile (reinforcement.locksReinforcer, also
   * for barricades; the defuser's own data for plant and disable). Picking the defuser up is the press itself.
   * Letting go, looking away or anything else cancels a hold. Returns true while one is under way, or the press
   * was used.
   */
  private updateDeploy(pawn: Pawn, input: InputCmd): boolean {
    const s = pawn.state;
    const held = (input.buttons & Btn.Interact) !== 0;
    if (s.deployKind === DeployKind.PickUp) return this.holdPickUp(pawn, held);
    if (s.deployKind === DeployKind.Plant || s.deployKind === DeployKind.Disable) return this.holdDefuser(pawn, held);
    if (s.deployKind !== DeployKind.None) {
      const a = held && s.meleeTicks === 0 ? this.deployActionFor(pawn) : null;
      if (!a || a.kind !== s.deployKind || a.panel !== s.deployPanel || a.section !== s.deploySection) {
        endDeploy(pawn);
        return false;
      }
      s.deployTicks = Math.min(0xffff, s.deployTicks + 1);
      if (s.deployTicks < deployTicks(this.data.destruction, s.deployKind)) return true;
      this.ctx.events.push({ kind: "deploy", pawnId: pawn.id, action: s.deployKind, panel: s.deployPanel, section: s.deploySection, side: a.side });
      endDeploy(pawn);
      return true; // still this tick
    }
    const pressed = input.buttons & ~s.prevButtons & Btn.Interact;
    if (!pressed || s.meleeTicks > 0) return false;
    const d = this.defuserActionFor(pawn);
    if (d === "pickUp") {
      this.objective!.carrier = pawn.id;
      this.objective!.dropped = null;
      this.ctx.events.push({ kind: "pickup", pawnId: pawn.id });
      return true;
    }
    if (d) {
      s.deployKind = d === "plant" ? DeployKind.Plant : DeployKind.Disable;
      s.deployPanel = 0;
      s.deploySection = 0;
      s.deployTicks = 1;
      return true;
    }
    const mine = this.droneToPickUp(pawn);
    if (mine) {
      mine.state.mode = PawnMode.Held;
      mine.state.vx = mine.state.vy = mine.state.vz = 0;
      return true;
    }
    // Taking a gadget back comes before reinforcing (gadgets/DESIGN.md §2).
    const own = s.gAct === GadgetAct.Ready ? this.gadgetToPickUp(pawn) : null;
    if (own) {
      s.deployKind = DeployKind.PickUp;
      s.deployPanel = 0;
      s.deploySection = 0;
      s.deployTicks = 1;
      s.gTarget = own.id;
      return true;
    }
    const a = this.deployActionFor(pawn);
    if (!a) return false;
    s.deployKind = a.kind;
    s.deployPanel = a.panel;
    s.deploySection = a.section;
    s.deployTicks = 1;
    return true;
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
    for (const id of this.bodyIds(c)) {
      const p = this.pawns.get(id);
      if (id !== c.possessedPawnId && p && p.state.mode !== PawnMode.Dead) return p;
    }
    return null;
  }

  /**
   * Skopós's shell died while she was transferring out of it (from the transfer's start it crouches and stands still:
   * it is going idle, and an attacker sees her inactive shell, research/operators/skopos.md §3.2): she arrives in the
   * other at once, if it stands, and isn't eliminated. True when that happened (the room tells her client).
   */
  shellLeftBehind(pawn: Pawn): boolean {
    const c = pawn.ownerId !== null ? this.controllers.get(pawn.ownerId) : undefined;
    if (!c || c.swapPhase === 0 || c.possessedPawnId !== pawn.id) return false;
    const other = this.otherPawn(c.id);
    if (!other) return false;
    c.possessedPawnId = other.id;
    c.swapPhase = 0;
    c.swapT = 0;
    c.shellCam = false;
    c.swapCooldown = Math.fround(this.data.operators.get(c.operatorId)!.ability.params.swapCooldownSeconds);
    return true;
  }

  /** A controller's bodies (Skopós: her two shells), not its drones. */
  bodyIds(c: PlayerController): number[] {
    return c.pawnIds.filter((id) => this.pawns.get(id)?.kind !== PawnKind.Drone);
  }

  /** A controller's drones (Phase 7), held, out or destroyed. */
  dronesOf(c: PlayerController): Pawn[] {
    const out: Pawn[] = [];
    for (const id of c.pawnIds) {
      const p = this.pawns.get(id);
      if (p?.kind === PawnKind.Drone) out.push(p);
    }
    return out;
  }

  /**
   * A controller with no body yet (Phase 7: an attacker in prep): it possesses the first drone `addDrone` gives it.
   * `ids`: a client mirroring the server's controller id.
   */
  addPilot(name: string, operatorId: string, team: number, ids?: { controller: number }): PlayerController {
    if (ids && this.controllers.has(ids.controller)) throw new Error(`controller id ${ids.controller} is already in use`);
    const c: PlayerController = {
      id: ids ? this.claimId(ids.controller) : this.nextId++,
      name,
      operatorId,
      pawnIds: [],
      possessedPawnId: 0,
      drone: 0,
      prevLean: 0,
      cam: 0,
      camYaw: 0,
      camPitch: 0,
      shellCam: false,
      swapPhase: 0,
      swapT: 0,
      swapCooldown: 0,
      prevButtons: 0,
      team,
    };
    this.controllers.set(c.id, c);
    return c;
  }

  /** A held drone for a controller (Phase 7); one with no body possesses its first. `id`: a client mirroring the server's. */
  addDrone(controllerId: number, id?: number): Pawn {
    const c = this.controllers.get(controllerId);
    if (!c) throw new Error(`no controller ${controllerId}`);
    const at = this.pawns.get(c.possessedPawnId)?.state ?? { x: 0, y: 0, z: 0 };
    const pawn = this.spawnPawn(c.operatorId, at.x, at.y, at.z, 0, c.id, id, null, c.team, PawnKind.Drone);
    c.pawnIds.push(pawn.id);
    if (!c.possessedPawnId) c.possessedPawnId = pawn.id;
    return pawn;
  }

  /** Put a drone out at rest with its bottom at (x, y, z), facing `yawDeg` (an attacker's first drone at their spawn in prep). */
  placeDrone(droneId: number, x: number, y: number, z: number, yawDeg: number): void {
    const p = this.pawns.get(droneId);
    if (!p || p.kind !== PawnKind.Drone) return;
    Object.assign(p.state, { x: Math.fround(x), y: Math.fround(y), z: Math.fround(z), vx: 0, vy: 0, vz: 0, yaw: Math.fround(yawDeg * DEG), pitch: 0, grounded: false, mode: PawnMode.Walk });
    poseCollider(this.ctx, p);
    refreshBroadPhase(this.world);
  }

  /** Would a drone fit with its bottom at (x, y, z), clear of the level, panels and props? */
  private droneFits(x: number, y: number, z: number): boolean {
    const [w, h] = this.data.intel.drone.sizeM;
    const shape = new this.R.Cylinder(h / 2 - 0.005, w / 2 - 0.005);
    return this.world.intersectionWithShape({ x, y: y + h / 2, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, undefined, QUERY_DRONE) === null;
  }

  /**
   * A body throws a held drone (data/intel.json `drone.throw`): it appears ahead of the body, or in its place when a
   * wall is that close, moving forward and up. Null when none is held.
   */
  private throwDrone(c: PlayerController, body: Pawn, buttons: number): Pawn | null {
    const held = this.dronesOf(c).find((p) => p.state.mode === PawnMode.Held);
    if (!held) return null;
    const t = this.data.intel.drone.throw;
    const b = body.state;
    const [fx, fz] = forwardXZ(b.yaw);
    const y = b.y + t.heightM;
    const ahead = this.droneFits(b.x + fx * t.aheadM, y, b.z + fz * t.aheadM);
    const x = ahead ? b.x + fx * t.aheadM : b.x;
    const z = ahead ? b.z + fz * t.aheadM : b.z;
    const s = held.state;
    Object.assign(s, {
      x: Math.fround(x),
      y: Math.fround(y),
      z: Math.fround(z),
      vx: Math.fround(fx * t.forwardMps),
      vy: Math.fround(t.upMps),
      vz: Math.fround(fz * t.forwardMps),
      yaw: b.yaw,
      pitch: 0,
      grounded: false,
      mode: PawnMode.Walk,
      prevButtons: buttons,
    });
    poseCollider(this.ctx, held);
    refreshBroadPhase(this.world);
    return held;
  }

  /**
   * Drones' keys (Phase 7, intel/DESIGN.md §2, §5). Throw: from a standing body, throw a held drone and drive it.
   * Observe: from a body (a dead one too), go to the first in the feed list (feedDrones: your drones out, then your
   * teammates'); from a drone, back to the body. A new lean on a drone goes to the previous / next in the list. A
   * teammate's drone is watched, not driven. A drone destroyed or picked up while on it, or the body going down, ends
   * it. In prep (no body yet) you are your first drone, and a new lean goes round it and your teammates' drones.
   */
  private updateDrones(c: PlayerController, input: InputCmd | undefined, heldBefore: number) {
    this.switchDrones(c, input, heldBefore);
    if (input) this.lookFromMates(c, input);
  }

  private switchDrones(c: PlayerController, input: InputCmd | undefined, heldBefore: number) {
    const drones = this.dronesOf(c);
    const out = this.feedDrones(c);
    const body = this.pawns.get(c.possessedPawnId);
    const downed = body !== undefined && body.kind === PawnKind.Body && isDowned(body.state);
    if (c.drone && (downed || !out.some((p) => p.id === c.drone))) c.drone = 0;
    if ((!drones.length && !out.length) || !input) return;
    const lean = Math.sign(input.lean);
    const newLean = lean !== 0 && lean !== c.prevLean ? lean : 0;
    c.prevLean = lean;
    if (!body || downed) return;
    const pressed = input.buttons & ~heldBefore;
    if (body.kind === PawnKind.Drone) {
      // In prep the pawn you are is your first drone: a new lean goes round it and your teammates' drones out.
      if (!newLean) return;
      const list = [body, ...out.filter((p) => !c.pawnIds.includes(p.id))];
      const at = Math.max(0, list.findIndex((p) => p.id === (c.drone || body.id)));
      const next = list[(at + newLean + list.length) % list.length];
      c.drone = next.id === body.id ? 0 : next.id;
      return;
    }
    if (c.drone) {
      if (pressed & Btn.Observe) c.drone = 0;
      else if (newLean && out.length > 1) {
        const i = out.findIndex((p) => p.id === c.drone);
        c.drone = out[(i + newLean + out.length) % out.length].id;
      }
      return;
    }
    if (pressed & Btn.Throw) {
      const thrown = body.state.mode === PawnMode.Walk ? this.throwDrone(c, body, input.buttons) : null;
      if (thrown) c.drone = thrown.id;
    } else if (pressed & Btn.Observe && out.length) c.drone = out[0].id;
  }

  /**
   * The drones in an attacker's feed list (Phase 7, intel/DESIGN.md §5): their own out, then their teammates' out in
   * pawn order (watched, not driven).
   */
  feedDrones(c: PlayerController): Pawn[] {
    const own = this.dronesOf(c).filter((p) => p.state.mode === PawnMode.Walk);
    const mates: Pawn[] = [];
    for (const p of this.pawns.values()) if (p.kind === PawnKind.Drone && p.team === c.team && p.state.mode === PawnMode.Walk && !c.pawnIds.includes(p.id)) mates.push(p);
    return [...own, ...mates.sort((a, b) => a.id - b.id)];
  }

  /**
   * On a teammate's drone the viewer turns their own view (the camera's view fields), within the drone's tilt: from the
   * input alone, so a client predicts it exactly, whatever it last heard of that drone.
   */
  private lookFromMates(c: PlayerController, input: InputCmd) {
    if (!c.drone || c.pawnIds.includes(c.drone)) return;
    const d = this.data.intel.drone;
    c.camYaw = Math.fround(wrapAngle(input.yaw));
    c.camPitch = Math.fround(clamp(input.pitch, d.pitchMinDeg * DEG, d.pitchMaxDeg * DEG));
  }

  /**
   * Default cameras (Phase 7, intel/DESIGN.md §3), for defenders in a match: Observe opens the first working camera and
   * closes it; a new lean goes to the previous / next working one; the view turns toward the mouse within the camera's
   * limits at its turn rate (data/intel.json `camera`). A camera broken while watched hands over to the next working
   * one, or closes when none is left. Down, nothing; going down closes it.
   */
  private updateCams(c: PlayerController, input: InputCmd | undefined, heldBefore: number) {
    if (!this.matchRules.cameras || c.team !== sideTeam("defender") || this.camCount() === 0) {
      c.cam = 0;
      return;
    }
    const body = this.pawns.get(c.possessedPawnId);
    const downed = body !== undefined && isDowned(body.state);
    if (c.cam && (downed || !this.camWorks(c.cam - 1))) {
      const next = downed ? -1 : this.nextCam(c.cam - 1, 1);
      if (next < 0) c.cam = 0;
      else this.openCam(c, next);
    }
    if (!input) return;
    const lean = Math.sign(input.lean);
    const newLean = lean !== 0 && lean !== c.prevLean ? lean : 0;
    c.prevLean = lean;
    const pressed = input.buttons & ~heldBefore;
    if (c.cam) {
      if (pressed & Btn.Observe) {
        c.cam = 0;
        return;
      }
      if (newLean) {
        const next = this.nextCam(c.cam - 1, newLean);
        if (next >= 0) this.openCam(c, next);
      }
      // Toward the mouse, within the camera's limits, at its turn rate.
      const l = this.camLimits(c.cam - 1);
      const yaw = l.face + clamp(wrapAngle(input.yaw - l.face), -l.half, l.half);
      const pitch = clamp(input.pitch, l.pitchMin, l.pitchMax);
      c.camYaw = Math.fround(wrapAngle(c.camYaw + clamp(wrapAngle(yaw - c.camYaw), -l.turn, l.turn)));
      c.camPitch = Math.fround(c.camPitch + clamp(pitch - c.camPitch, -l.turn, l.turn));
      return;
    }
    if (!(pressed & Btn.Observe) || downed) return;
    const first = this.nextCam(-1, 1);
    if (first >= 0) this.openCam(c, first);
  }

  /** Where a controller looks from now: a camera's lens, its drone's eye, or its body's; null for a dead body. */
  viewOf(c: PlayerController, input?: InputCmd): { pos: [number, number, number]; yaw: number; pitch: number } | null {
    if (c.cam) return { pos: this.camLens(c.cam - 1, c.camYaw), yaw: c.camYaw, pitch: c.camPitch };
    const p = this.pawns.get(this.viewedPawnId(c.id));
    if (!p || p.state.mode === PawnMode.Dead || p.state.mode === PawnMode.Held) return null;
    const eye = this.eyeOf(p);
    if (p.kind === PawnKind.Drone && !c.pawnIds.includes(p.id)) return { ...eye, yaw: c.camYaw, pitch: c.camPitch }; // a teammate's drone
    return input ? { ...eye, yaw: input.yaw, pitch: input.pitch } : eye;
  }

  /** The ping key (Phase 7, intel/DESIGN.md §6): the point the view is on, a "ping" event for the room to share. */
  private ping(c: PlayerController, input: InputCmd) {
    const v = this.viewOf(c, input);
    if (!v) return;
    const dir = viewDir(v.yaw, v.pitch);
    const hit = raycastLevel(this, v.pos, dir, 200);
    if (!hit) return;
    this.ctx.events.push({ kind: "ping", ctrlId: c.id, pos: [v.pos[0] + dir[0] * hit.t, v.pos[1] + dir[1] * hit.t, v.pos[2] + dir[2] * hit.t] });
  }

  /** The round's Bulletproof Cameras (the gadget table's, in the order they were placed). */
  bpCams(): readonly Gadget[] {
    if (this.bpCache.version !== this.gadgets.version) this.bpCache = { version: this.gadgets.version, list: this.gadgets.list.filter((g) => g.kind === KIND_BP_CAMERA) };
    return this.bpCache.list;
  }

  /** How many cameras defenders have: the level's, then the round's Bulletproof Cameras. */
  camCount(): number {
    return this.level.def.cameras.length + this.bpCams().length;
  }

  /** A Bulletproof Camera by its place in the defenders' list (from 0); null for one of the level's. */
  bpCamAt(i: number): Gadget | null {
    return i < this.level.def.cameras.length ? null : (this.bpCams()[i - this.level.def.cameras.length] ?? null);
  }

  /**
   * Whether camera i has a feed: not broken, and a Bulletproof Camera placed outdoors not yet without its signal (the
   * room says when: a client's ticks aren't the server's).
   */
  camWorks(i: number): boolean {
    if (i >= this.camCount()) return false; // a Bulletproof Camera from a round that's over
    const bp = this.bpCamAt(i);
    if (bp) return !(bp.flags & (GFlag.Broken | GFlag.Lost));
    return i < 32 && (this.matchRules.camsBroken & (1 << i)) === 0;
  }

  /**
   * How camera i's view turns: `face` its facing; within `half` of it (π: all the way round, a Bulletproof Camera on
   * the floor), tilting from `pitchMin` to `pitchMax`, at most `turn` a tick; `fovDeg` how wide it sees.
   */
  camLimits(i: number): { face: number; half: number; pitchMin: number; pitchMax: number; turn: number; fovDeg: number } {
    const bp = this.bpCamAt(i);
    const k = bp ? this.data.intel.bulletproofCamera.view : this.data.intel.camera;
    return {
      face: bp ? bp.yaw : (this.level.def.cameras[i]?.yawDeg ?? 0) * DEG,
      half: bp && bp.flags & GFlag.OnFloor ? Math.PI : k.yawHalfRangeDeg * DEG,
      pitchMin: k.pitchMinDeg * DEG,
      pitchMax: k.pitchMaxDeg * DEG,
      turn: k.turnDegPerS * DEG * DT,
      fovDeg: k.fovDeg,
    };
  }

  /** Camera i's lens, looking `yaw`: just out of the front of its box (the origin for no such camera). */
  camLens(i: number, yaw: number): [number, number, number] {
    const bp = this.bpCamAt(i);
    const at = bp ? bp.pos : (this.level.def.cameras[i]?.pos ?? [0, 0, 0]);
    const ahead = (bp ? this.data.gadgets.get("bulletproof_camera")!.sizeM[2] / 2 : CAMERA_HALF_M) + LENS_AHEAD_M;
    const [fx, fz] = forwardXZ(yaw);
    return [at[0] + fx * ahead, at[1], at[2] + fz * ahead];
  }

  /** The next working camera from `from` going `dir` (±1), round the defenders' list; −1 when none works. */
  private nextCam(from: number, dir: number): number {
    const n = this.camCount();
    const start = Math.min(from, n - 1); // from one no longer in the list (last round's): as if from the last
    for (let k = 1; k <= n; k++) {
      const i = (((start + dir * k) % n) + n) % n;
      if (this.camWorks(i)) return i;
    }
    return -1;
  }

  private openCam(c: PlayerController, i: number) {
    const l = this.camLimits(i);
    c.cam = i + 1;
    c.camYaw = Math.fround(wrapAngle(l.face));
    c.camPitch = Math.fround(clamp(this.bpCamAt(i) ? 0 : this.level.def.cameras[i].pitchDeg * DEG, l.pitchMin, l.pitchMax));
  }

  /** One of this body's own drones out within reach (data/intel.json `drone.pickupReachM`), to pick up with F. */
  private droneToPickUp(pawn: Pawn): Pawn | null {
    const c = pawn.ownerId !== null ? this.controllers.get(pawn.ownerId) : undefined;
    const s = pawn.state;
    if (!c || s.mode !== PawnMode.Walk || !s.grounded) return null;
    const reach = this.data.intel.drone.pickupReachM;
    for (const d of this.dronesOf(c)) {
      const q = d.state;
      if (q.mode === PawnMode.Walk && Math.hypot(q.x - s.x, q.z - s.z) <= reach && Math.abs(q.y - s.y) <= 1.2) return d;
    }
    return null;
  }

  /** Where a pawn's eyes are: a body's, or a drone's camera (Phase 7). */
  eyeOf(pawn: Pawn): { pos: [number, number, number]; yaw: number; pitch: number } {
    if (pawn.kind === PawnKind.Drone) return droneEye(this.data.intel.drone, pawn.state);
    const e = eyePose(this.data.movement, this.data.hitboxes, pawn.state);
    return { pos: [e.pos[0], e.pos[1], e.pos[2]], yaw: pawn.state.yaw, pitch: pawn.state.pitch };
  }

  /** The pawn whose eyes the player sees through: the drone driven, the idle shell while on its camera or mid-swap. */
  viewedPawnId(controllerId: number): number {
    const c = this.controllers.get(controllerId);
    if (!c) return 0;
    if (c.drone) return c.drone;
    if (c.shellCam || c.swapPhase) return this.otherPawn(controllerId)?.id ?? c.possessedPawnId;
    return c.possessedPawnId;
  }

  /**
   * Reviving (Phase 3 M7; DECISIONS D-049): holding Interact beside a downed teammate, facing them, picks
   * them up after revive.seconds with revive.revivedHp. The progress lives on the reviver; the downed body
   * stops bleeding (and crawling) while it lasts. Letting go, losing reach or either body changing state
   * cancels it. Returns true while a revive is under way.
   */
  private updateRevive(pawn: Pawn, input: InputCmd): boolean {
    const s = pawn.state;
    const held = (input.buttons & Btn.Interact) !== 0;
    if (s.reviveTarget !== 0) {
      const t = this.pawns.get(s.reviveTarget);
      if (!held || !t || t.state.mode !== PawnMode.Downed || s.mode !== PawnMode.Walk || this.reviveDistance(pawn, t) === null) {
        this.endRevive(pawn, t, false);
        return false;
      }
      s.reviveTicks = Math.min(0xffff, s.reviveTicks + 1);
      t.state.revivedBy = pawn.id;
      if (s.reviveTicks < ticks(this.data.combat.revive.seconds)) return true;
      this.endRevive(pawn, t, true);
      return false;
    }
    if (!held || s.mode !== PawnMode.Walk || !s.grounded || s.meleeTicks > 0) return false;
    const t = this.reviveCandidate(pawn);
    if (!t) return false;
    s.reviveTarget = t.id;
    s.reviveTicks = 1;
    t.state.revivedBy = pawn.id;
    this.ctx.events.push({ kind: "reviveStart", reviverPawn: pawn.id, targetPawn: t.id });
    return true;
  }

  private endRevive(reviver: Pawn, target: Pawn | undefined, completed: boolean) {
    reviver.state.reviveTarget = 0;
    reviver.state.reviveTicks = 0;
    if (target && target.state.revivedBy === reviver.id) {
      target.state.revivedBy = 0;
      if (completed) {
        // Up again with a little health, still lying down; going down a second time is death.
        target.state.mode = PawnMode.Walk;
        target.state.hp = this.data.combat.revive.revivedHp;
        target.state.downHp = 0;
        target.state.invulnTicks = 0;
      }
    }
    this.ctx.events.push({ kind: "reviveEnd", reviverPawn: reviver.id, targetPawn: target?.id ?? 0, completed });
  }

  /** The downed teammate a reviver would pick up now: the nearest in reach (lowest id on a tie), or null. */
  reviveCandidate(reviver: Pawn): Pawn | null {
    let best: Pawn | null = null;
    let bestD = Infinity;
    for (const t of this.pawns.values()) {
      if (t === reviver || t.team !== reviver.team || t.state.mode !== PawnMode.Downed) continue;
      if (t.state.revivedBy !== 0 && t.state.revivedBy !== reviver.id) continue; // someone else is on it
      const d = this.reviveDistance(reviver, t);
      if (d !== null && (d < bestD || (d === bestD && best !== null && t.id < best.id))) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Horizontal distance from the reviver to the downed body's torso, if within reach, height and the
   * facing cone (data/combat.json `revive`, placeholders); otherwise null.
   */
  private reviveDistance(reviver: Pawn, target: Pawn): number | null {
    const rv = this.data.combat.revive;
    const r = reviver.state;
    if (Math.abs(target.state.y - r.y) > rv.maxHeightDiff) return null;
    const torso = poseHitboxes(this.data.movement, this.data.hitboxes, target.state).find((h) => h.part === "torso");
    if (!torso) return null;
    const ax = torso.a[0];
    const az = torso.a[2];
    const dx = torso.b[0] - ax;
    const dz = torso.b[2] - az;
    const l2 = dx * dx + dz * dz;
    const u = l2 > 1e-12 ? clamp(((r.x - ax) * dx + (r.z - az) * dz) / l2, 0, 1) : 0;
    const px = ax + dx * u - r.x;
    const pz = az + dz * u - r.z;
    const dist = Math.hypot(px, pz);
    if (dist > rv.reach) return null;
    if (dist > 1e-3) {
      const [fx, fz] = forwardXZ(r.yaw);
      if ((px * fx + pz * fz) / dist < Math.cos(rv.facingDeg * DEG)) return null; // not facing them
    }
    return dist;
  }

  /** Which contextual prompt the player should see right now. */
  prompt(controllerId: number): Prompt {
    const c = this.controllers.get(controllerId);
    if (!c) return null;
    if (c.swapPhase || c.drone || c.cam) return null;
    if (c.shellCam) return "transfer";
    const pawn = this.pawns.get(c.possessedPawnId);
    if (!pawn || pawn.kind === PawnKind.Drone) return null;
    if (pawn.state.reviveTarget !== 0 || pawn.state.deployKind !== DeployKind.None || pawn.state.rappelTicks > 0) return null; // its gauge shows instead
    if (pawn.state.mode === PawnMode.Walk && this.reviveCandidate(pawn)) return "revive"; // before ladders (D-049)
    const defuser = this.defuserActionFor(pawn);
    if (defuser) return defuser; // before panels (D-120)
    if (this.droneToPickUp(pawn)) return "pickUpDrone";
    if (pawn.state.gAct === GadgetAct.Ready && this.gadgetToPickUp(pawn)) return "pickUpGadget";
    const deploy = this.deployActionFor(pawn);
    const move = movementPrompt(this.ctx, pawn);
    // A lab room gives both sides both tools (on different keys): an attacker is shown the rope's prompt first, a
    // defender the panel's.
    const rope = move === "rappel" || move === "rappelVault";
    if (deploy && !(rope && pawn.team === sideTeam("attacker"))) return deploy.kind === DeployKind.Reinforce ? "reinforce" : deploy.kind === DeployKind.BarricadeUp ? "barricade" : "unbarricade";
    return move;
  }

  /**
   * Put a pawn back at a spawn (or at `at`: a Range Lab dummy's own spot) with full health, ammo and nothing
   * half done; the same id in a new life (lab / respawn tooling).
   */
  respawn(pawnId: number, spawnIndex = 0, at?: { pos: readonly [number, number, number]; yawDeg: number }): void {
    const pawn = this.pawns.get(pawnId);
    if (!pawn) return;
    this.cutReviveLinks(pawn);
    const spawn = at ?? this.level.def.spawns[spawnIndex % this.level.def.spawns.length];
    const m = this.data.movement;
    const { r, hh } = capsuleDims(m.stance.stand.height, m.stance.collisionRadius);
    pawn.collider.setRadius(r);
    pawn.collider.setHalfHeight(hh);
    pawn.collider.setTranslation({ x: spawn.pos[0], y: spawn.pos[1] + hh + r + 0.02, z: spawn.pos[2] });
    pawn.state = { ...initialPawnState(spawn.pos[0], spawn.pos[1] + 0.02, spawn.pos[2], Math.fround(spawn.yawDeg * DEG), pawn.state.maxHp, pawn.loadout), rng: pawn.state.rng };
    [pawn.state.g1, pawn.state.g2] = slotCounts(this.data, pawn.loadout);
    pawn.life++;
    poseCollider(this.ctx, pawn); // also makes a dead body solid again
    refreshBroadPhase(this.world);
  }

  /** After changing a pawn's state from outside a step (damage on the server): place its collider to match. */
  refreshPawn(pawnId: number): void {
    const pawn = this.pawns.get(pawnId);
    if (!pawn) return;
    poseCollider(this.ctx, pawn); // a dead body stops blocking at once
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
      rappel: -1,
      rappelFlags: 0,
      rappelTicks: 0,
      ropeTurn: 0,
      moveT: 0,
      moveDur: 0,
      airPeakY: Math.fround(y + 0.02),
      // Back on your feet: no longer down, and nothing half done carries over.
      downHp: 0,
      invulnTicks: 0,
      meleeTicks: 0,
      deployKind: 0,
      deployPanel: 0,
      deploySection: 0,
      deployTicks: 0,
    });
    this.cutReviveLinks(pawn);
    if (pawn.state.hp === 0) {
      pawn.state.hp = pawn.state.maxHp; // a dead or downed body comes back: a new life
      pawn.state.downs = 0;
      pawn.life++;
    }
    poseCollider(this.ctx, pawn); // also makes a dead body solid again
    refreshBroadPhase(this.world);
  }

  /** Whether a standing body teleported to feet (x, y, z) has room there: no level geometry in it (lab tools). */
  standsFree(x: number, y: number, z: number): boolean {
    return capsuleFree(this.ctx, null, x, y + 0.02, z, this.data.movement.stance.stand.height);
  }

  /**
   * Advance one tick. Possessed pawns get their controller's input. Idle pawns stand still (gravity only);
   * idle Skopós shells stay crouched. While Skopós looks through her other shell's camera, her mouse
   * turns that shell's view and the body she left stands still.
   */
  step(inputs: ReadonlyMap<number, InputCmd>, only?: ReadonlySet<number>, advanceTick = only === undefined): void {
    // `only`: step just these controllers and their pawns; everyone else stays put. The server uses it
    // to hold a player still while their next input hasn't arrived, and for an extra catch-up step
    // (a second queued input after a network stall, which doesn't advance the tick counter).
    this.ctx.events.length = 0;
    const drive = new Map<number, InputCmd>();
    // Pawns driven without real buttons this tick (the body left behind on the shell camera, the shell
    // being looked through): like the no-input case below, their held-button memory is kept.
    const idleDriven = new Set<number>();
    for (const c of this.controllers.values()) {
      if (only && !only.has(c.id)) continue;
      const input = inputs.get(c.id);
      const heldBefore = c.prevButtons;
      const viewedBefore = this.viewedPawnId(c.id);
      const onCamBefore = c.shellCam || c.swapPhase !== 0 || c.drone !== 0 || c.cam !== 0;
      const camBefore = c.cam;
      this.updateShells(c, input);
      this.updateDrones(c, input, heldBefore);
      this.updateCams(c, input, heldBefore);
      if (input && input.buttons & ~heldBefore & Btn.Ping) this.ping(c, input);
      if (c.cam) {
        // Watching a camera (Phase 7): the body, if it stands, idles with its weapon parked.
        const body = this.pawns.get(c.possessedPawnId);
        if (body && body.kind === PawnKind.Body && body.state.mode !== PawnMode.Dead) {
          drive.set(body.id, idleInput(body, body.state.stance));
          idleDriven.add(body.id);
        }
        continue;
      }
      // The view belongs to whichever body you were looking through: on the tick that changes (the camera
      // opens or closes, a drone is entered or left), the newly viewed one keeps its own facing instead of taking
      // the old view's.
      const viewChanged = this.viewedPawnId(c.id) !== viewedBefore || c.cam !== camBefore;
      const drone = c.drone ? this.pawns.get(c.drone) : undefined;
      if (drone) {
        // Driving a drone (Phase 7): it takes the input; the body, if it stands, idles with its weapon parked. A
        // teammate's drone is only watched (lookFromMates): nothing of theirs takes the input.
        const body = this.pawns.get(c.possessedPawnId);
        if (body && body.kind === PawnKind.Body && body.state.mode !== PawnMode.Dead) {
          drive.set(body.id, idleInput(body, body.state.stance));
          idleDriven.add(body.id);
        }
        if (input && c.pawnIds.includes(drone.id)) drive.set(drone.id, viewChanged ? { ...input, yaw: drone.state.yaw, pitch: drone.state.pitch } : input);
        continue;
      }
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
      if (pawn.proxy || pawn.kind === PawnKind.Drone) continue; // simulated elsewhere; drones below
      if (only && (pawn.ownerId === null || !only.has(pawn.ownerId))) continue;
      const input = drive.get(pawn.id);
      if (input) {
        const held = pawn.state.prevButtons;
        let cmd = input;
        if (idleDriven.has(pawn.id)) this.letGo(pawn, true);
        else {
          this.dropDefuser(pawn, input);
          const holding = pawn.state.deployKind;
          const reviving = this.updateRevive(pawn, input);
          if (reviving || this.updateDeploy(pawn, input)) {
            // Reviving holds you in place, and so do reinforcing and barricading (reinforcement.locksReinforcer;
            // both placeholders), the defuser's holds (data/objective.json) and placing a Bulletproof Camera (ours),
            // through the tick a hold completes; the held key never reaches a ladder.
            const k = pawn.state.deployKind !== DeployKind.None ? pawn.state.deployKind : holding;
            const d = this.data.objective.defuser;
            const still =
              reviving ||
              (k === DeployKind.Plant ? d.plantLocksBody : k === DeployKind.Disable ? d.disableLocksBody : k === DeployKind.PickUp || (k !== DeployKind.None && this.data.destruction.reinforcement.locksReinforcer));
            // A standing body crouches for the defuser's holds where the data says so (prone stays prone); it stands
            // back up when the hold ends, as its stance key says.
            const kneel = !reviving && input.stance === Stance.Stand && (k === DeployKind.Plant ? d.plantCrouches : k === DeployKind.Disable && d.disableCrouches);
            cmd = { ...input, forward: still ? 0 : input.forward, strafe: still ? 0 : input.strafe, buttons: input.buttons & ~Btn.Interact, stance: kneel ? Stance.Crouch : input.stance };
          }
        }
        // Placing a gadget holds the body still (ours, like the Bulletproof Camera in Phase 7), from the tick it starts.
        const placing = pawn.state.gAct === GadgetAct.Place || (input.buttons & Btn.Fire && pawn.state.gAct === GadgetAct.Ready && placeSpotFor(this.ctx, pawn));
        if (placing && !idleDriven.has(pawn.id)) cmd = { ...cmd, forward: 0, strafe: 0 };
        // A body driven without its player's buttons (left behind on the camera, or being looked
        // through) has its weapon parked: nothing it was doing carries on unseen.
        this.stepBody(pawn, cmd, !idleDriven.has(pawn.id), !idleDriven.has(pawn.id));
        refreshBroadPhase(this.world); // the next pawn must see this one where it now is
        if (idleDriven.has(pawn.id)) pawn.state.prevButtons = held;
        else if (cmd !== input) pawn.state.prevButtons |= input.buttons & Btn.Interact; // still held: not a fresh press later
        continue;
      }
      const owner = pawn.ownerId !== null ? this.controllers.get(pawn.ownerId) : undefined;
      const idleShell = owner !== undefined && this.bodyIds(owner).length > 1 && owner.possessedPawnId !== pawn.id;
      // No input this tick (idle shell, or a dropped packet): stand still, and keep the held-button
      // memory so keys still held when input resumes don't count as fresh presses. The body the player
      // is in keeps its weapon running (a reload goes on through a lag spike); an idle shell's is parked.
      const held = pawn.state.prevButtons;
      this.letGo(pawn, idleShell);
      this.stepBody(pawn, idleInput(pawn, idleShell ? Stance.Crouch : pawn.state.stance), !idleShell, false);
      refreshBroadPhase(this.world);
      pawn.state.prevButtons = held;
    }
    // Drones (Phase 7) after every body, whatever order a server and a client made the pawns in: a drone picked up
    // this tick is in hand before it would move, on both. Driven, or parked (settling under gravity); held and
    // destroyed drones don't move.
    for (const pawn of this.pawns.values()) {
      if (pawn.proxy || pawn.kind !== PawnKind.Drone) continue;
      if (only && (pawn.ownerId === null || !only.has(pawn.ownerId))) continue;
      stepDrone(this.ctx, pawn, drive.get(pawn.id) ?? null);
      refreshBroadPhase(this.world);
    }
    if (advanceTick) this.tick++;
  }

  /**
   * A body whose feet fell below the level's kill plane (bounds.killY, DECISIONS D-076) is out of the level:
   * in a lab it goes back to spawn 0 standing, with no fall damage, as part of the step, so a client predicts it
   * exactly as the server does; in a match it keeps falling and the room kills it (MatchSimRules.killPlaneKills).
   */
  private belowKillPlane(pawn: Pawn) {
    const killY = this.level.def.bounds?.killY;
    if (killY === undefined || pawn.state.y >= killY || this.matchRules.killPlaneKills) return;
    const s = this.level.def.spawns[0];
    this.teleport(pawn.id, s.pos[0], s.pos[1], s.pos[2], s.yawDeg);
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
    if (this.bodyIds(c).length < 2) return;
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
    // On her feet, or hanging on a rope (Ulo: cameras work on the rope; a lab room lets her rappel).
    const ready = active !== undefined && ((active.state.mode === PawnMode.Walk && active.state.grounded) || ropeIdle(active.state));
    if (!this.otherPawn(c.id) || !ready) {
      c.shellCam = false; // nothing to look through, or busy (climbing, vaulting, dead)
      return;
    }
    if (pressed & Btn.Ability) {
      c.shellCam = !c.shellCam && c.swapCooldown <= 0;
    } else if (c.shellCam && pressed & Btn.Interact && active.state.mode !== PawnMode.Rappel) {
      // No swap off a rope (Ulo): the shell left behind would hang there.
      c.swapPhase = 1;
      c.swapT = 0;
    }
  }
}

/** Nothing half put up carries on. */
function endDeploy(pawn: Pawn) {
  const s = pawn.state;
  s.deployKind = DeployKind.None;
  s.deployPanel = 0;
  s.deploySection = 0;
  s.deployTicks = 0;
}

/** Teams until match modes assign them (Phase 6): attackers 0, defenders 1. */
export const sideTeam = (side: "attacker" | "defender") => (side === "attacker" ? 0 : 1);

export function idleInput(pawn: Pawn, stance: Stance = pawn.state.stance): InputCmd {
  const s = pawn.state;
  return { seq: 0, forward: 0, strafe: 0, yaw: s.yaw, pitch: s.pitch, buttons: 0, stance, lean: 0 };
}
