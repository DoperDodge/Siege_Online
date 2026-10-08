// A match room: the authoritative simulation plus everyone connected to it (PLAN §5). Transport-free, so
// the Node server, the netsim harness and (later) offline Practice in a Web Worker all run this same code.
import { DT, TICK_HZ } from "../core/constants.js";
import type { Vec3 } from "../core/math.js";
import { applyDamage, Cause, isIdleShell, type Damage } from "../combat/apply.js";
import { shotOnBodies, tracePellets, type ShotOnBody } from "../combat/hitreg.js";
import { judgeMelee } from "../combat/melee.js";
import { PanelHistory } from "../destruction/history.js";
import { meleeOnPanels } from "../destruction/hits.js";
import type { PanelOp } from "../destruction/panel.js";
import type { IndexedOp } from "../destruction/panels.js";
import type { DummyDef, ModeData } from "../data/schemas.js";
import { DUMMY_STANCE, dummyInput } from "../lab/dummies.js";
import { spawnAmmo, type Pawn, type PlayerController } from "../player/pawn.js";
import { PawnMode, type InputCmd, type PawnState } from "../player/types.js";
import { Sim } from "../sim.js";
import { ByteWriter, fnv1a } from "./bytes.js";
import { HitboxHistory, SentRing } from "./lagComp.js";
import { controllerState, writeControllerState, writePawnState } from "./pawnState.js";
import type { SimEvent } from "../weapons/step.js";
import { defaultLoadoutPick, resolveLoadout, type LoadoutPick } from "../weapons/loadout.js";
import { hash4, pelletDirections, viewDir } from "../weapons/spread.js";
import { QUERY_BULLET } from "../physics/rapier.js";
import { sideTeam } from "../sim.js";
import { encodeEvents, type GameEvent } from "./events.js";
import { encodeError, encodePong, encodeRoster, encodeShotResult, encodeWelcome, ErrorCode, unwrap16, type InputMsg, type LabTool, type RosterEntry, type ShotResult } from "./protocol.js";
import { encodePanelOps, encodePanelState, wireOp } from "./panels.js";
import { MAX_INTERP_MS, quantizeRemote, SNAPSHOT_EVERY, SnapshotEncoder, type RemoteQ } from "./snapshot.js";

/** Inputs the server tries to keep queued per client (absorbs jitter); clients pace themselves to it. */
export const TARGET_QUEUE = 2;
/**
 * More queued inputs than this and the oldest are dropped. Half a second: a browser that stalls (a slow
 * frame, a GC pause) sends up to 16 ticks of input at once, on top of what is already queued.
 */
export const MAX_QUEUE = 32;
/**
 * Input credit: every tick earns one, every applied input spends one, and up to MAX_CREDIT bank up while
 * a client's inputs aren't arriving (a TCP stall). Afterwards the backlog is applied at up to two inputs
 * per tick until the credit is spent, so nothing is lost; a client that sends inputs faster than real
 * time never has credit for the second one (PLAN §5: inputs per tick are capped against speed hacks).
 */
export const MAX_CREDIT = 16;
/**
 * Default longest rewind for lag compensation (PLAN §5 says ~200 ms; DECISIONS D-045): 250 ms, because the
 * rewind is round trip + interpolation delay, which at 100 ms round trip is already 160–250 ms. A room
 * option, so tests and later match modes can set their own.
 */
export const DEFAULT_MAX_REWIND_TICKS = 0.25 * TICK_HZ;
/**
 * How far behind its newest snapshot a client can claim to be drawing others: its interpolation ceiling,
 * plus the age of the frame a click claims (newer snapshots can arrive before that input is sent; 4 ticks
 * covers a 16 fps frame). The rewind cap still bounds the total.
 */
const FRAME_SLACK_TICKS = 4;
const MAX_VIEW_BACK_TICKS = (MAX_INTERP_MS / 1000) * TICK_HZ + 0.5 + FRAME_SLACK_TICKS;
/**
 * A player whose inputs stop arriving is held still (a short stall costs no correction) for up to this
 * many ticks, then simulated without input (gravity, a vault in progress), so nobody can hang in the air
 * or on a ledge by withholding inputs. The hold is a budget: each tick without input spends one, each
 * applied input earns back HOLD_REFUND, so withholding most inputs (a trickle) runs it out too.
 */
export const MAX_HOLD_TICKS = 16;
const HOLD_REFUND = 0.25;
/**
 * A shot's claimed view may lag the server by at most this much more than the least lag this client has
 * shown recently (its real round trip): claiming an older snapshot only on the input that fires would
 * otherwise rewind targets further than the connection explains.
 */
const LAG_SLACK_TICKS = 4;
/** Inputs remembered for that least lag (two seconds). */
const LAG_WINDOW = 128;
/** Don't queue more bytes than this on a slow connection; skip its snapshots until it drains. */
const MAX_BUFFERED = 16 * 1024;
/** A connection this far behind isn't reading at all: events (never skipped) would pile up, so it's closed. */
const MAX_BUFFERED_EVENTS = 1024 * 1024;
export const MAX_ROOM_PLAYERS = 10;
/** Lab teleports beyond this distance from the origin (metres) are ignored: no level is that big. */
const MAX_COORD = 1000;

/** One connection's view of the transport. */
export interface RoomClient {
  send(bytes: Uint8Array): void;
  /** Bytes queued but not yet sent (WebSocket bufferedAmount); 0 in-process. */
  buffered(): number;
  /** Drop the connection (WebSocket close code and reason). */
  close?(code: number, reason: string): void;
}

/** A queued input, with the server tick it arrived at (shots are judged against that time). */
interface QueuedInput extends InputMsg {
  receivedTick: number;
}

interface Member {
  id: number;
  name: string;
  client: RoomClient;
  ctrl: PlayerController | null;
  /** What the member carries (normalized: an invalid pick became the default) and their team. */
  pick: LoadoutPick;
  team: number;
  queue: QueuedInput[];
  credit: number;
  /** Corrections sent to this client (prediction mismatches, respawns, damage), and how many the server forced. */
  corrections: number;
  forcedCorrections: number;
  /**
   * The pending correction is the server's doing (damage, a new body, a lab tool), not a misprediction
   * (DECISIONS D-043): the client couldn't have predicted it.
   */
  forced: boolean;
  /** Events for this client this tick (sent at the end of the tick). */
  events: GameEvent[];
  /** Damage done to teammates (reverse friendly fire turns on at the mode's threshold). */
  teamDamage: number;
  reflect: boolean;
  /** Highest input seq received / applied (unwrapped from 16 bits). */
  lastQueuedSeq: number;
  lastSeq: number;
  /** The input applied this tick, whose predicted hash is checked after stepping. */
  applied: QueuedInput | null;
  /** The last input applied (a knife landing on a tick without input is judged with its view time). */
  lastApplied: QueuedInput | null;
  idled: boolean;
  /** Hold budget spent (ticks held still, minus HOLD_REFUND per applied input). */
  held: number;
  /** Arrival tick minus claimed snapshot tick, for the last LAG_WINDOW inputs (a ring). */
  lags: number[];
  lagAt: number;
  needCorrection: boolean;
  epoch: number;
  /**
   * The current body is new (join, respawn, operator pick) and its first correction hasn't gone out yet:
   * inputs are still for the old body and are dropped.
   */
  newBody: boolean;
  /**
   * After that correction (its epoch): inputs are dropped until the first one made with it arrives.
   * Inputs arrive in order, so everything before that one was sent for the old body.
   */
  confirmEpoch: number | null;
  encoder: SnapshotEncoder;
  /** Snapshot ticks actually sent to this client (skipped ones aren't), for rewinding to what it drew. */
  sent: SentRing;
  /** When we last sent it every changed panel's state because it asked (it may ask once a second). */
  panelStateAt: number;
}

/** A shot judged against the world as its shooter saw it, waiting to be applied with the rest of the tick's. */
interface JudgedShot {
  m: Member;
  /** A bullet (shots) or the knife. */
  cause: Cause;
  ctrlId: number;
  team: number;
  seq: number;
  weaponId: string;
  receivedTick: number;
  rewoundTick: number;
  origin: [number, number, number];
  bodies: ShotOnBody[];
  /** What it did to panels (holes, wear), in order: applied with its damage. */
  panelOps: IndexedOp[];
}

/** A Range Lab target: a body with no client, stepped from its script (lab/dummies.ts). */
interface Dummy {
  def: DummyDef;
  ctrl: PlayerController;
  /** The tick it died (it comes back the mode's dummyRespawnS later), or null. */
  diedAt: number | null;
}

/** Hash of everything a client predicts for itself: each owned pawn's exact state plus its controller. */
export function predictionHash(sim: Sim, ctrl: PlayerController): number {
  const w = new ByteWriter(256);
  for (const id of ctrl.pawnIds) {
    const p = sim.pawns.get(id);
    if (p) writePawnState(w, p.state);
  }
  writeControllerState(w, controllerState(ctrl));
  return fnv1a(w.finish());
}

export class Room {
  readonly history: HitboxHistory;
  /** Recent panel changes: shots are judged against the panels as their shooter had them (destruction/history.ts). */
  readonly panelHistory = new PanelHistory();
  /** Panel ops from between ticks (lab tools), applied with the next tick's. */
  private queuedOps: IndexedOp[] = [];
  /** Panel ops applied this tick, sent to everyone at its end (before its snapshot). */
  private tickOps: IndexedOp[] = [];
  private readonly members = new Map<number, Member>();
  private nextMemberId = 1;
  /** Range Lab dummies (lab rooms on a level that has some). */
  private readonly dummies: Dummy[] = [];
  /** Performance counters for the /stats endpoint and the netsim. */
  readonly stats = {
    ticks: 0,
    corrections: 0,
    /** Corrections the server caused (damage, new bodies, lab tools) vs. real mispredictions. */
    forcedCorrections: 0,
    mismatchCorrections: 0,
    droppedInputs: 0,
    idledTicks: 0,
    skippedSnapshots: 0,
    shots: 0,
    cappedShots: 0,
    hits: 0,
    kills: 0,
    /** Panel ops applied (holes, wear, reinforcements). */
    panelOps: 0,
    /** Panel states sent because a client's panels disagreed. */
    panelResyncs: 0,
  };
  /** Damage rules (friendly fire): the lab mode preset until match modes arrive (Phase 6). */
  readonly rules: ModeData;
  /** Shots judged this tick, applied together at its end (DECISIONS D-044). */
  private judged: JudgedShot[] = [];
  /** Who downed each body that is down now: they get the kill when it dies (research/core_mechanics.md §10.2). */
  private readonly downedBy = new Map<number, { ctrl: number; weapon: string }>();

  private constructor(
    readonly code: string,
    readonly sim: Sim,
    readonly levelId: string,
    /** Movement Lab rooms allow respawn / teleport tools. */
    readonly lab: boolean,
    /** Longest lag-compensation rewind, in ticks, counted from when a shot's input arrived. */
    readonly maxRewindTicks: number,
    /** Secret per room: spread and recoil randomness come from it (DECISIONS D-041). */
    private readonly seed: number,
  ) {
    this.history = new HitboxHistory(sim, 32);
    this.rules = sim.data.modes.get("lab")!;
    // A revive cut by what another body did (left, respawned, jumped, went down or died): the other side's
    // owner couldn't predict it.
    sim.onReviveCut = (p) => {
      const owner = p.ownerId !== null ? this.memberOf(p.ownerId) : null;
      if (owner) this.force(owner);
    };
    if (lab) for (const def of sim.level.def.dummies) this.addDummy(def);
  }

  /** A dummy's body: spawned like a player's (same ids for the same order), then put on its spot. */
  private addDummy(def: DummyDef) {
    const ctrl = this.sim.addPlayer(def.name ?? def.id, def.operator, 0, undefined, undefined, def.team);
    for (const id of ctrl.pawnIds) this.sim.pawns.get(id)!.state.rng = hash4(this.seed, id, 0x5eed, 1) || 1;
    const d: Dummy = { def, ctrl, diedAt: null };
    this.dummies.push(d);
    this.placeDummy(d);
  }

  /** On its spot, settled in its stance (and down, if it starts that way). */
  private placeDummy(d: Dummy) {
    const pawn = this.sim.pawns.get(d.ctrl.possessedPawnId)!;
    const [x, y, z] = d.def.pos;
    this.sim.teleport(pawn.id, x, y, z, d.def.yawDeg, DUMMY_STANCE[d.def.stance]);
    if (d.def.startDowned) applyDamage(this.sim, pawn, { amount: pawn.state.hp, kill: false }, this.rules);
    this.sim.refreshPawn(pawn.id);
    d.diedAt = null;
  }

  /** Back to life on its spot: the same pawn id, in a new life (HitboxHistory never rewinds into the old one). */
  private respawnDummy(d: Dummy) {
    const id = d.ctrl.possessedPawnId;
    this.downedBy.delete(id);
    this.sim.respawn(id, 0, d.def);
    this.placeDummy(d);
  }

  /** `seed`: the server passes a cryptographic one; tests pass a fixed one. */
  static async create(code: string, levelId: string, opts: { lab?: boolean; maxRewindTicks?: number; seed?: number } = {}): Promise<Room> {
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
    return new Room(code, await Sim.create(levelId), levelId, opts.lab ?? false, opts.maxRewindTicks ?? DEFAULT_MAX_REWIND_TICKS, seed >>> 0);
  }

  get size(): number {
    return this.members.size;
  }

  /** Add a connection. Returns its member id, or null (with an error sent) if the room is full. */
  join(name: string, client: RoomClient, operatorId = "sledge"): number | null {
    if (this.members.size >= MAX_ROOM_PLAYERS) {
      client.send(encodeError(ErrorCode.RoomFull, `Room ${this.code} is full`));
      return null;
    }
    if (!this.sim.data.operators.has(operatorId)) operatorId = "sledge";
    const m: Member = {
      id: this.nextMemberId++,
      name: name || "Player",
      client,
      ctrl: null,
      pick: defaultLoadoutPick(this.sim.data, operatorId),
      team: sideTeam(this.sim.data.operators.get(operatorId)!.side),
      queue: [],
      lastQueuedSeq: 0,
      lastSeq: 0,
      applied: null,
      lastApplied: null,
      idled: false,
      held: 0,
      lags: [],
      lagAt: 0,
      needCorrection: false,
      credit: 0,
      corrections: 0,
      forcedCorrections: 0,
      forced: false,
      events: [],
      teamDamage: 0,
      reflect: false,
      epoch: 0,
      newBody: true,
      confirmEpoch: null,
      encoder: new SnapshotEncoder(),
      sent: new SentRing(),
      panelStateAt: -Infinity,
    };
    this.members.set(m.id, m);
    this.spawn(m);
    client.send(encodeWelcome({ roomCode: this.code, tick: this.sim.tick, levelId: this.levelId, controllerId: m.ctrl!.id }));
    client.send(encodePanelState(this.sim.level.panels)); // the walls as they are now; every later op follows
    this.broadcastRoster();
    return m.id;
  }

  leave(memberId: number): void {
    const m = this.members.get(memberId);
    if (!m) return;
    if (m.ctrl) this.sim.removePlayer(m.ctrl.id);
    this.members.delete(memberId);
    this.broadcastRoster();
  }

  /**
   * A new body with this loadout (DECISIONS D-042): an invalid pick quietly becomes the operator's default,
   * and the roster tells everyone what the body really carries. The team follows the operator's side.
   * Its client gets an exact correction to start predicting.
   */
  pickLoadout(memberId: number, pick: LoadoutPick): void {
    const m = this.members.get(memberId);
    const op = this.sim.data.operators.get(pick.operator);
    if (!m || !op) return;
    m.pick = resolveLoadout(this.sim.data, pick).loadout.pick;
    m.team = sideTeam(op.side);
    this.spawn(m);
    this.broadcastRoster();
  }

  /** An operator with their default loadout. */
  pickOperator(memberId: number, operatorId: string): void {
    if (this.sim.data.operators.has(operatorId)) this.pickLoadout(memberId, defaultLoadoutPick(this.sim.data, operatorId));
  }

  private spawn(m: Member) {
    if (m.ctrl) this.sim.removePlayer(m.ctrl.id);
    m.ctrl = this.sim.addPlayer(m.name, m.pick.operator, 0, undefined, m.pick, m.team);
    for (const id of m.ctrl.pawnIds) this.sim.pawns.get(id)!.state.rng = hash4(this.seed, id, 0x5eed, 1) || 1;
    m.queue = [];
    this.force(m);
    m.newBody = true;
    m.credit = 0;
    m.held = 0;
  }

  /** The server changed this member's bodies outside their inputs: correct them at the next snapshot. */
  private force(m: Member) {
    m.needCorrection = true;
    m.forced = true;
  }

  onInput(memberId: number, msg: InputMsg): void {
    const m = this.members.get(memberId);
    if (!m || !m.ctrl) return;
    const seq = unwrap16(msg.cmd.seq, m.lastQueuedSeq);
    if (seq <= m.lastQueuedSeq) return; // duplicate or out of date
    m.lastQueuedSeq = seq;
    // Inputs for a body that has been replaced: the client discards them too.
    if (m.newBody) return;
    if (m.confirmEpoch !== null) {
      if (((msg.epoch - m.confirmEpoch) & 0xff) >= 128) return; // made before the new body's correction
      m.confirmEpoch = null;
    }
    const now = this.sim.tick;
    m.lags[m.lagAt] = Math.max(0, now - unwrap16(msg.snapTick, now));
    m.lagAt = (m.lagAt + 1) % LAG_WINDOW;
    m.queue.push({ ...msg, cmd: { ...msg.cmd, seq }, receivedTick: now });
  }

  /** Answer a ping at once (the client measures round-trip time from it). */
  onPing(memberId: number, clientTime: number): void {
    this.members.get(memberId)?.client.send(encodePong({ clientTime, serverTick: this.sim.tick }));
  }

  onResync(memberId: number): void {
    this.members.get(memberId)?.encoder.reset();
  }

  /** A client's panels disagree with ours: send it every changed panel's state (at most once a second). */
  onPanelResync(memberId: number): void {
    const m = this.members.get(memberId);
    if (!m || this.sim.tick - m.panelStateAt < TICK_HZ) return;
    m.panelStateAt = this.sim.tick;
    this.stats.panelResyncs++;
    m.client.send(encodePanelState(this.sim.level.panels));
  }

  /** A panel op from outside a tick (a lab tool, a test): applied and sent with the next tick's. */
  queuePanelOp(panel: number, op: PanelOp): void {
    if (this.sim.level.panels.list[panel]) this.queuedOps.push({ panel, op });
  }

  onLabTool(memberId: number, tool: LabTool): void {
    const m = this.members.get(memberId);
    if (!m || !m.ctrl || !this.lab) return;
    if (tool.kind === "respawn" || tool.kind === "team") {
      if (tool.kind === "team") m.team = tool.team;
      this.spawn(m);
      this.broadcastRoster(); // new pawn ids: everyone (the respawned client too) needs them
    } else if (tool.kind === "damage") {
      // Only your own bodies (try damage, death and the indicators alone) and the dummies.
      const mine = m.ctrl.pawnIds.includes(tool.pawnId) || this.dummies.some((d) => d.ctrl.pawnIds.includes(tool.pawnId));
      const pawn = mine ? this.sim.pawns.get(tool.pawnId) : undefined;
      if (pawn) this.hurt(pawn, { amount: tool.amount, kill: tool.kill }, { cause: Cause.Lab, attacker: null, headshot: false });
    } else if (tool.kind === "resetDummies") {
      for (const d of this.dummies) this.respawnDummy(d);
    } else if (tool.kind === "refill") {
      for (const id of m.ctrl.pawnIds) {
        const p = this.sim.pawns.get(id);
        if (!p?.loadout || p.state.mode === PawnMode.Dead) continue;
        const [a, b] = p.loadout.weapons.map(spawnAmmo);
        Object.assign(p.state, { loaded0: a.loaded, reserve0: a.reserve, loaded1: b.loaded, reserve1: b.reserve });
      }
      this.force(m);
    } else if (Math.abs(tool.x) <= MAX_COORD && Math.abs(tool.y) <= MAX_COORD && Math.abs(tool.z) <= MAX_COORD) {
      // Same body: inputs already queued or in flight still apply after the jump, exactly as the client
      // replays them on top of the correction.
      this.sim.teleport(m.ctrl.possessedPawnId, tool.x, tool.y, tool.z, tool.yawDeg);
      this.downedBy.delete(m.ctrl.possessedPawnId); // a downed body jumps back up: whoever downed it no longer counts
      this.force(m);
    }
  }

  /**
   * A shot the simulation fired while applying `applied` (the sim decides when shots happen: fire rate,
   * ammo, sprint exit; weapons/step.ts). Its pellets leave from where the eye was, inside the spread cone
   * the body had (drawn from the room's secret seed, D-041), and are judged against everyone else as they
   * were when that input was made. The view time comes from the input itself (its newest snapshot tick
   * minus how far behind it the client was drawing), bounded by the client's interpolation ceiling and by
   * the lag its connection has shown, and the rewind is capped at maxRewindTicks counted from when the input
   * arrived (time it then waits in our queue is ours, not the shooter's latency). The level stops pellets
   * where they hit it. Nothing is applied yet: the tick's shots are applied together, in order, at its end.
   */
  /**
   * The render time an input says its client was drawing, bounded as described at judgeShot, and the time
   * the room rewinds to for it (capped).
   */
  private viewTimeFor(m: Member, applied: QueuedInput): { now: number; viewTick: number; rewoundTick: number; panelTick: number } {
    const now = applied.receivedTick;
    const leastLag = Math.min(...m.lags);
    const snapTick = Math.max(Math.min(now, unwrap16(applied.snapTick, now)), now - leastLag - LAG_SLACK_TICKS);
    const viewTick = snapTick - Math.min(MAX_VIEW_BACK_TICKS, applied.viewBackQ8 / 256);
    // Panels as the client had them: every change up to the newest tick it had heard of (they arrive ahead
    // of that tick's snapshot), within the same cap.
    const panelTick = Math.max(snapTick, now - this.maxRewindTicks);
    return { now, viewTick, rewoundTick: HitboxHistory.rewound(viewTick, now, this.maxRewindTicks), panelTick };
  }

  private judgeShot(m: Member, applied: QueuedInput, shot: Extract<SimEvent, { kind: "shot" }>) {
    const shooter = this.sim.pawns.get(shot.pawnId);
    const w = shooter?.loadout?.weapons[shot.slot];
    if (!m.ctrl || !shooter || !w?.damage) return;
    const { now, viewTick, rewoundTick, panelTick } = this.viewTimeFor(m, applied);
    const origin = shot.origin;
    const dirs = pelletDirections(this.seed, m.ctrl.id, shot.seq, shot.pellets, shot.yaw, shot.pitch, shot.cone);
    // Your own bodies and the dead don't stop bullets.
    const ignore = new Set(m.ctrl.pawnIds);
    for (const p of this.sim.pawns.values()) if (p.state.mode === PawnMode.Dead) ignore.add(p.id);
    const through = { rule: w.destruction, view: { tick: panelTick, history: this.panelHistory } };
    const paths = tracePellets(this.sim, this.history, origin, dirs, rewoundTick, w.damage.penetration, ignore, m.sent, through);
    const bodies = shotOnBodies(this.sim.data.combat, w.damage, paths, (id) => {
      const v = this.sim.pawns.get(id)!;
      return { scale: v.team === shooter.team ? this.rules.friendlyFire.scale : 1, idleShell: isIdleShell(this.sim, v) };
    });
    this.stats.shots++;
    if (rewoundTick > viewTick) this.stats.cappedShots++;
    const panelOps = paths.flatMap((p) => p.ops);
    this.judged.push({ m, cause: Cause.Bullet, ctrlId: m.ctrl.id, team: shooter.team, seq: shot.seq, weaponId: w.id, receivedTick: now, rewoundTick, origin, bodies, panelOps });
    // Everyone sees and hears it (the shooter's own client draws its flash itself, but not where pellets went).
    const ends = paths.map((p): [number, number, number] => [origin[0] + p.dir[0] * p.end, origin[1] + p.dir[1] * p.end, origin[2] + p.dir[2] * p.end]);
    for (const other of this.members.values()) other.events.push({ kind: "shotFx", pawnId: shooter.id, slot: shot.slot, suppressed: w.suppressed, ends });
    if (!this.lab) return;
    // Lab rooms: the shooter's readout (what the first pellet entered first, how far the server rewound,
    // where every pellet went, and where it had the body the first pellet hit or nearly hit).
    const p0 = paths[0];
    m.client.send(
      encodeShotResult({
        seq: shot.seq & 0xffff,
        origin,
        dir: p0.dir,
        dirs: paths.map((p) => p.dir),
        ends: paths.map((p) => p.end),
        viewTick,
        rewoundTick,
        serverTick: now,
        hit: p0.first && { pawnId: p0.first.pawnId, part: p0.first.part, distance: p0.first.t },
        wallDistance: p0.wall !== null && !p0.first ? p0.wall : null,
        target: this.shotTarget(origin, p0.dir, p0.first?.pawnId ?? null, p0.wall ?? Infinity, rewoundTick, ignore, m.sent),
      }),
    );
  }

  /** The body a pellet entered, or else the one whose torso it passed closest to (within 2 m, before the wall), as rewound. */
  private shotTarget(origin: Vec3, dir: Vec3, hitId: number | null, wall: number, tick: number, ignore: ReadonlySet<number>, sent: SentRing): ShotResult["target"] {
    const posed = this.history.at(tick, sent);
    let best = hitId;
    if (best === null) {
      let bestGap = 2;
      for (const [id, boxes] of posed) {
        const torso = boxes.find((b) => b.part === "torso");
        if (ignore.has(id) || !torso) continue;
        const c = torso.a.map((v, i) => (v + torso.b[i]) / 2);
        const rel = c.map((v, i) => v - origin[i]);
        const along = rel[0] * dir[0] + rel[1] * dir[1] + rel[2] * dir[2];
        if (along <= 0 || along > wall) continue;
        const gap = Math.hypot(rel[0] - dir[0] * along, rel[1] - dir[1] * along, rel[2] - dir[2] * along);
        if (gap < bestGap) [best, bestGap] = [id, gap];
      }
    }
    const boxes = best === null ? undefined : posed.get(best);
    return best === null || !boxes ? null : { pawnId: best, boxes: boxes.map((b) => ({ part: b.part, a: [...b.a], b: [...b.b], radius: b.radius })) };
  }

  /**
   * The knife landing (DECISIONS D-050): judged like a shot, against everyone as the attacker saw them when
   * the input that swung (or, on a tick without one, the last input) was made; applied with the tick's shots.
   * With no body in reach it lands on the first panel in reach along the view instead (destruction/hits.ts).
   */
  private judgeMeleeImpact(m: Member, applied: QueuedInput, hit: Extract<SimEvent, { kind: "meleeImpact" }>) {
    const attacker = this.sim.pawns.get(hit.pawnId);
    if (!m.ctrl || !attacker) return;
    const { now, rewoundTick, panelTick } = this.viewTimeFor(m, applied);
    const ignore = new Set(m.ctrl.pawnIds);
    for (const p of this.sim.pawns.values()) if (p.state.mode === PawnMode.Dead) ignore.add(p.id);
    const target = judgeMelee(this.sim, hit.origin, attacker.state, hit.yaw, this.history.at(rewoundTick, m.sent), ignore);
    const base = { m, cause: Cause.Melee, ctrlId: m.ctrl.id, team: attacker.team, seq: hit.seq, weaponId: "knife", receivedTick: now, rewoundTick, origin: hit.origin };
    if (target) {
      const body: ShotOnBody = { pawnId: target.pawnId, kill: false, amount: 0, headshot: false, zone: target.zone, pellets: 1, distance: target.reach };
      this.judged.push({ ...base, bodies: [body], panelOps: [] });
      return;
    }
    const dir = viewDir(hit.yaw, hit.pitch);
    const reach = this.sim.data.combat.melee.reach;
    const ray = new this.sim.R.Ray({ x: hit.origin[0], y: hit.origin[1], z: hit.origin[2] }, { x: dir[0], y: dir[1], z: dir[2] });
    const plain = this.sim.world.castRay(ray, reach, true, undefined, QUERY_BULLET)?.timeOfImpact ?? reach;
    const onPanel = meleeOnPanels(this.sim.level.panels, this.sim.data.destruction, hit.origin, dir, reach, plain, { tick: panelTick, history: this.panelHistory });
    if (onPanel) this.judged.push({ ...base, bodies: [], panelOps: onPanel.ops.map(({ panel, op }) => ({ panel, op })) });
  }

  /**
   * Change a panel (a hole, wear, steel) at the end of this tick: applied to the room's level in its wire
   * form (exactly what clients will apply), remembered so later shots are judged against the panels as each
   * shooter had them, and sent to everyone with the tick's other ops.
   */
  private applyPanelOp(index: number, op: PanelOp): void {
    const e = this.sim.level.panels.list[index];
    if (!e) return;
    const wire = wireOp(op);
    const change = this.sim.level.panels.apply(index, wire);
    this.panelHistory.record(this.sim.tick, index, e.panel.w * e.panel.h, change);
    this.tickOps.push({ panel: index, op: wire });
    this.stats.panelOps++;
  }

  /** The tick's panel ops to everyone, with the panels' hash after them, ahead of the tick's snapshot. */
  private flushPanelOps() {
    if (this.tickOps.length === 0) return;
    const msg = encodePanelOps({ tick: this.sim.tick, ops: this.tickOps, hash: this.sim.level.panels.hash() });
    this.tickOps = [];
    for (const m of this.members.values()) m.client.send(msg);
  }

  /**
   * Apply the tick's judged shots (DECISIONS D-044): all of them were judged first, so two players who shoot
   * each other in the same tick both land; then they apply in a fixed order (rewound time, arrival, shooter,
   * input) to the bodies as they are now. A shot on a body already dead does nothing.
   */
  private resolveShots() {
    for (const { panel, op } of this.queuedOps.splice(0)) this.applyPanelOp(panel, op);
    const shots = this.judged.sort((a, b) => a.rewoundTick - b.rewoundTick || a.receivedTick - b.receivedTick || a.ctrlId - b.ctrlId || a.seq - b.seq);
    this.judged = [];
    for (const shot of shots) {
      for (const { panel, op } of shot.panelOps) this.applyPanelOp(panel, op);
      for (const body of shot.bodies) {
        const victim = this.sim.pawns.get(body.pawnId);
        if (!victim || victim.state.mode === PawnMode.Dead) continue;
        const friendly = victim.team === shot.team;
        if (friendly && !this.rules.friendlyFire.actionPhase) continue; // team damage off: no damage, no marker
        const by = { cause: shot.cause, attacker: shot, headshot: body.headshot };
        if (friendly && shot.m.reflect) {
          // Reverse friendly fire: the shooter takes it instead.
          const own = shot.m.ctrl && this.sim.pawns.get(shot.m.ctrl.possessedPawnId);
          if (own) this.hurt(own, body, { ...by, cause: Cause.Reflect, attacker: null });
          continue;
        }
        const r = this.hurt(victim, body, by);
        if (r.outcome === "ignored") continue;
        this.stats.hits++;
        shot.m.events.push({
          kind: "hitConfirm",
          seq: shot.seq & 0xffff,
          victimPawn: victim.id,
          zone: body.zone,
          headshot: body.headshot,
          downed: r.outcome === "downed",
          killed: r.outcome === "killed",
          friendly,
          damage: r.removed,
          pellets: body.pellets,
          hpAfter: this.lab ? (r.outcome === "hurt" && victim.state.mode === PawnMode.Downed ? Math.ceil(victim.state.downHp) : victim.state.hp) : null,
        });
        if (friendly) {
          shot.m.teamDamage += r.removed;
          if (this.rules.reverseFriendlyFire.enabled && shot.m.teamDamage >= this.rules.reverseFriendlyFire.thresholdHp) shot.m.reflect = true;
        }
      }
    }
  }

  /**
   * Damage one body now (combat/apply.ts) and tell those who need to know: its owner (an exact correction and
   * the damage indicator) and, if it died, everyone (the kill feed; Skopós's idle shell is "destroyed", not
   * an elimination).
   */
  private hurt(victim: Pawn, d: Damage, by: { cause: Cause; attacker: JudgedShot | null; headshot: boolean }) {
    const r = applyDamage(this.sim, victim, { ...d, cause: by.cause }, this.rules);
    if (r.outcome === "ignored") return r;
    const owner = victim.ownerId !== null ? this.memberOf(victim.ownerId) : null;
    if (owner) {
      this.force(owner);
      owner.events.push({ kind: "damageTaken", pawnId: victim.id, amount: r.removed, cause: by.cause, attackerCtrl: by.attacker?.ctrlId ?? 0, from: by.attacker?.origin ?? null });
    }
    const ctrl = by.attacker?.ctrlId ?? 0;
    const weapon = by.attacker?.weaponId ?? "";
    const friendly = by.attacker !== null && victim.team === by.attacker.team;
    if (r.outcome === "downed") {
      this.downedBy.set(victim.id, { ctrl, weapon });
      const e: GameEvent = { kind: "down", victimPawn: victim.id, victimCtrl: victim.ownerId ?? 0, downerCtrl: ctrl, weapon, cause: by.cause, friendly };
      for (const m of this.members.values()) m.events.push(e);
    }
    if (r.outcome === "killed") this.announceDeath(victim, ctrl, weapon, by.cause, by.headshot, friendly);
    return r;
  }

  /**
   * Everyone hears about a death. A body that was down credits whoever downed it, and whoever finished it
   * (if someone else) gets the assist (core_mechanics.md §10.2).
   */
  private announceDeath(victim: Pawn, finisherCtrl: number, weapon: string, cause: Cause, headshot: boolean, friendly: boolean) {
    this.stats.kills++;
    const ownerCtrl = victim.ownerId ?? 0;
    const downer = this.downedBy.get(victim.id);
    this.downedBy.delete(victim.id);
    // Downed by nobody (a lab tool, reflected damage): the kill is the finisher's.
    const killerCtrl = downer?.ctrl || finisherCtrl;
    const assistCtrl = downer?.ctrl && finisherCtrl !== downer.ctrl ? finisherCtrl : 0;
    const e: GameEvent = isIdleShell(this.sim, victim)
      ? { kind: "shellDestroyed", pawnId: victim.id, ownerCtrl, killerCtrl, weapon, headshot }
      : { kind: "kill", victimPawn: victim.id, victimCtrl: ownerCtrl, killerCtrl, assistCtrl, weapon: weapon || downer?.weapon || "", cause, headshot, friendly };
    for (const m of this.members.values()) m.events.push(e);
  }

  /**
   * What the simulation did on its own that clients need to hear about, before predictions are checked:
   * deaths (a lethal fall, bleeding out) and revives. A revive changes the downed body from someone else's
   * input, so its owner gets a correction (D-043); the reviver predicted it.
   */
  private simEvents() {
    for (const e of this.sim.events) {
      if (e.kind === "death") {
        const p = this.sim.pawns.get(e.pawnId);
        if (p) this.announceDeath(p, 0, "", e.cause === "bleed" ? Cause.Bleed : Cause.Fall, false, false);
      } else if (e.kind === "reviveStart" || e.kind === "reviveEnd") {
        const target = this.sim.pawns.get(e.targetPawn);
        const owner = target && target.ownerId !== null ? this.memberOf(target.ownerId) : null;
        if (owner && !owner.ctrl?.pawnIds.includes(e.reviverPawn)) this.force(owner);
        if (e.kind === "reviveEnd" && e.completed) this.downedBy.delete(e.targetPawn);
        for (const m of this.members.values()) m.events.push({ ...e });
      }
    }
  }

  /**
   * Server only: a body marked as being revived whose reviver no longer is (it left, went down, stopped
   * being stepped mid-revive by a lab tool) bleeds again; its owner gets a correction.
   */
  private checkReviveLinks() {
    for (const p of this.sim.pawns.values()) {
      const r = p.state.revivedBy;
      if (r === 0) continue;
      const reviver = this.sim.pawns.get(r);
      if (reviver && reviver.state.reviveTarget === p.id && reviver.state.mode === PawnMode.Walk && p.state.mode === PawnMode.Downed) continue;
      p.state.revivedBy = 0;
      const owner = p.ownerId !== null ? this.memberOf(p.ownerId) : null;
      if (owner) this.force(owner);
    }
  }

  private memberOf(controllerId: number): Member | null {
    for (const m of this.members.values()) if (m.ctrl?.id === controllerId) return m;
    return null;
  }

  /** Read-only facts about one connection (tools, tests, the stats endpoint). */
  memberInfo(memberId: number): { name: string; controllerId: number; lastSeq: number; queued: number; corrections: number; forcedCorrections: number } | null {
    const m = this.members.get(memberId);
    return m
      ? { name: m.name, controllerId: m.ctrl?.id ?? 0, lastSeq: m.lastSeq, queued: m.queue.length, corrections: m.corrections, forcedCorrections: m.forcedCorrections }
      : null;
  }

  roster(): RosterEntry[] {
    const players = [...this.members.values()]
      .filter((m) => m.ctrl)
      .map((m) => ({ controllerId: m.ctrl!.id, name: m.name, operatorId: m.ctrl!.operatorId, pawnIds: [...m.ctrl!.pawnIds], team: m.team, kind: 0, loadout: m.pick }));
    const dummies = this.dummies.map((d) => ({
      controllerId: d.ctrl.id,
      name: d.ctrl.name,
      operatorId: d.ctrl.operatorId,
      pawnIds: [...d.ctrl.pawnIds],
      team: d.def.team,
      kind: 1,
      loadout: defaultLoadoutPick(this.sim.data, d.def.operator),
    }));
    return [...players, ...dummies];
  }

  private broadcastRoster() {
    const entries = this.roster();
    for (const m of this.members.values()) m.client.send(encodeRoster(entries, m.ctrl?.id ?? 0));
  }

  private take(m: Member): QueuedInput | null {
    const next = m.queue.shift();
    if (!next) return null;
    m.lastApplied = next;
    m.credit--;
    // Down, nothing is earned back: however the inputs are trickled, holding a body still can delay its
    // bleed-out by at most the hold budget (D-048).
    const body = m.ctrl ? this.sim.pawns.get(m.ctrl.possessedPawnId) : undefined;
    if (body?.state.mode !== PawnMode.Downed) m.held = Math.max(0, m.held - HOLD_REFUND);
    m.lastSeq = next.cmd.seq;
    return next;
  }

  /**
   * After stepping an input: judge the prediction made with it (only if made after our latest correction,
   * and not while one is already on its way: a body the server just changed can't have been predicted).
   */
  private afterInput(m: Member, applied: QueuedInput) {
    if (!m.ctrl || m.needCorrection || applied.epoch !== (m.epoch & 0xff)) return;
    if (predictionHash(this.sim, m.ctrl) !== applied.predictedHash) m.needCorrection = true;
    else m.forced = false; // (stepped without input, but it still came out as predicted)
  }

  /** Judge the shots of the step just taken; `applied` is each member's input in that step. */
  private judgeEvents(applied: ReadonlyMap<number, { m: Member; input: QueuedInput }>) {
    for (const e of this.sim.events) {
      if (e.kind !== "shot" && e.kind !== "meleeImpact") continue;
      const owner = this.sim.pawns.get(e.pawnId)?.ownerId;
      if (owner === undefined || owner === null) continue;
      const a = applied.get(owner);
      // Shots only come from real inputs (weapons/step.ts), so the input is always there; a knife can land
      // on a tick without one (it was swung earlier), judged with the last input's view time.
      if (e.kind === "shot") {
        if (a) this.judgeShot(a.m, a.input, e);
      } else {
        const m = a?.m ?? this.memberOf(owner);
        const input = a?.input ?? m?.lastApplied;
        if (m && input) this.judgeMeleeImpact(m, input, e);
      }
    }
  }

  /**
   * Advance one tick: apply queued inputs, step, check predictions, send snapshots. A player whose next
   * input hasn't arrived is held still (not stepped at all) rather than moved with a guessed input: the
   * client only ever predicts the inputs it sent, so any guess would be a misprediction. The banked
   * credit then lets the late inputs catch up. Once the hold budget is spent the body is stepped without
   * input instead; that spends credit too, so catching up never puts a body ahead of room time.
   */
  step(): void {
    const inputs = new Map<number, InputCmd>();
    const active = new Set<number>();
    for (const m of this.members.values()) {
      m.applied = null;
      if (!m.ctrl) continue;
      // A new body waiting for its client to take it over (loading the level, a respawn in flight) is
      // neither held against the budget nor stepped without input: that would only cost a second correction.
      const settled = !m.newBody && m.confirmEpoch === null;
      if (settled) m.credit = Math.min(MAX_CREDIT, m.credit + 1);
      if (m.queue.length > MAX_QUEUE) {
        const drop = m.queue.length - MAX_QUEUE;
        m.queue.splice(0, drop);
        this.stats.droppedInputs += drop;
      }
      const next = this.take(m);
      if (!next) {
        m.idled = true;
        this.stats.idledTicks++;
        // Held still for a short stall; after that the body carries on without input (the client's next
        // prediction then misses and it gets a correction).
        if (settled && ++m.held > MAX_HOLD_TICKS) {
          m.held = MAX_HOLD_TICKS;
          m.credit = Math.max(0, m.credit - 1);
          active.add(m.ctrl.id);
          m.forced = true; // the client can't predict a tick it never sent (its correction comes with its next input)
        }
        continue;
      }
      inputs.set(m.ctrl.id, next.cmd);
      active.add(m.ctrl.id);
      m.applied = next;
    }
    for (const d of this.dummies) {
      const pawn = this.sim.pawns.get(d.ctrl.possessedPawnId);
      if (!pawn || pawn.state.mode === PawnMode.Dead) continue;
      inputs.set(d.ctrl.id, dummyInput(this.sim.tick, pawn.state, d.def));
      active.add(d.ctrl.id);
    }
    this.sim.step(inputs, active, true);
    this.simEvents();
    const applied = new Map<number, { m: Member; input: QueuedInput }>();
    for (const m of this.members.values()) {
      if (!m.applied || !m.ctrl) continue;
      this.afterInput(m, m.applied);
      applied.set(m.ctrl.id, { m, input: m.applied });
    }
    this.judgeEvents(applied);
    // Catch up after a stall: one extra input for a client that has a backlog and banked credit.
    for (const m of this.members.values()) {
      if (!m.ctrl || m.queue.length <= TARGET_QUEUE || m.credit < 1) continue;
      const extra = this.take(m)!;
      this.sim.step(new Map([[m.ctrl.id, extra.cmd]]), new Set([m.ctrl.id]));
      this.simEvents();
      this.afterInput(m, extra);
      this.judgeEvents(new Map([[m.ctrl.id, { m, input: extra }]]));
    }
    this.resolveShots();
    this.flushPanelOps();
    this.checkReviveLinks();
    this.reviveDummies();
    this.history.record();
    this.stats.ticks++;
    if (this.sim.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
    this.flushEvents();
  }

  /** Dead dummies come back dummyRespawnS after they died. */
  private reviveDummies() {
    const wait = Math.round(this.rules.dummyRespawnS * TICK_HZ);
    for (const d of this.dummies) {
      const pawn = this.sim.pawns.get(d.ctrl.possessedPawnId);
      if (!pawn || pawn.state.mode !== PawnMode.Dead) continue;
      d.diedAt ??= this.sim.tick;
      if (this.sim.tick - d.diedAt >= wait) this.respawnDummy(d);
    }
  }

  private flushEvents() {
    for (const m of this.members.values()) {
      if (m.events.length === 0) continue;
      if (m.client.buffered() > MAX_BUFFERED_EVENTS) {
        m.client.close?.(1008, "not reading"); // policy violation
        m.events = [];
        continue;
      }
      m.client.send(encodeEvents(this.sim.tick, m.events));
      m.events = [];
    }
  }

  private sendSnapshots() {
    const all = new Map<number, RemoteQ>();
    for (const p of this.sim.pawns.values()) all.set(p.id, quantizeRemote(p.state));
    for (const m of this.members.values()) {
      if (m.client.buffered() > MAX_BUFFERED) {
        this.stats.skippedSnapshots++;
        continue; // never encode a snapshot that isn't sent: deltas are against what was sent
      }
      const own = new Set(m.ctrl?.pawnIds ?? []);
      const remotes = new Map([...all].filter(([id]) => !own.has(id)));
      let correction = null;
      if (m.needCorrection && m.ctrl) {
        m.epoch++;
        if (m.newBody) {
          m.newBody = false;
          m.confirmEpoch = m.epoch & 0xff;
        }
        m.corrections++;
        this.stats.corrections++;
        if (m.forced) {
          m.forcedCorrections++;
          this.stats.forcedCorrections++;
        } else this.stats.mismatchCorrections++;
        m.forced = false;
        correction = { pawns: m.ctrl.pawnIds.map((id) => [id, this.sim.pawns.get(id)!.state] as [number, PawnState]), ctrl: controllerState(m.ctrl), epoch: m.epoch };
        m.needCorrection = false;
      }
      m.client.send(m.encoder.encode({ tick: this.sim.tick, ackSeq: m.lastSeq, idled: m.idled, queueDepth: m.queue.length }, correction, remotes));
      m.sent.add(this.sim.tick);
      m.idled = false;
    }
  }
}

/** Seconds of simulated time per room tick (for callers pacing a room loop). */
export const ROOM_TICK_SECONDS = DT;
