// A match room: the authoritative simulation plus everyone connected to it (PLAN §5). Transport-free, so
// the Node server, the netsim harness and (later) offline Practice in a Web Worker all run this same code.
import { DT, TICK_HZ } from "../core/constants.js";
import type { Vec3 } from "../core/math.js";
import { eyePose } from "../player/hitboxes.js";
import type { PlayerController } from "../player/pawn.js";
import type { InputCmd, PawnState } from "../player/types.js";
import { QUERY_STATIC } from "../physics/rapier.js";
import { Sim } from "../sim.js";
import { ByteWriter, fnv1a } from "./bytes.js";
import { HitboxHistory } from "./lagComp.js";
import { controllerState, writeControllerState, writePawnState } from "./pawnState.js";
import { encodeError, encodePong, encodeRoster, encodeShotResult, encodeWelcome, ErrorCode, unwrap16, type InputMsg, type LabTool, type RosterEntry } from "./protocol.js";
import { quantizeRemote, SNAPSHOT_EVERY, SnapshotEncoder, type RemoteQ } from "./snapshot.js";

/** Inputs the server tries to keep queued per client (absorbs jitter); clients pace themselves to it. */
export const TARGET_QUEUE = 2;
/** More queued inputs than this and the oldest are dropped. */
export const MAX_QUEUE = 16;
/**
 * Input credit: every tick earns one, every applied input spends one, and up to MAX_CREDIT bank up while
 * a client's inputs aren't arriving (a TCP stall). Afterwards the backlog is applied at up to two inputs
 * per tick until the credit is spent, so nothing is lost; a client that sends inputs faster than real
 * time never has credit for the second one (PLAN §5: inputs per tick are capped against speed hacks).
 */
export const MAX_CREDIT = 16;
/** Longest rewind for lag compensation (PLAN §5: ~200 ms). */
export const MAX_REWIND_TICKS = 0.2 * TICK_HZ;
/** Don't queue more bytes than this on a slow connection; skip its snapshots until it drains. */
const MAX_BUFFERED = 16 * 1024;
export const MAX_ROOM_PLAYERS = 10;

/** One connection's view of the transport. */
export interface RoomClient {
  send(bytes: Uint8Array): void;
  /** Bytes queued but not yet sent (WebSocket bufferedAmount); 0 in-process. */
  buffered(): number;
}

interface Member {
  id: number;
  name: string;
  client: RoomClient;
  ctrl: PlayerController | null;
  queue: InputMsg[];
  credit: number;
  /** Corrections sent to this client (prediction mismatches, respawns). */
  corrections: number;
  /** Highest input seq received / applied (unwrapped from 16 bits). */
  lastQueuedSeq: number;
  lastSeq: number;
  /** The input applied this tick, whose predicted hash is checked after stepping. */
  applied: InputMsg | null;
  idled: boolean;
  needCorrection: boolean;
  epoch: number;
  encoder: SnapshotEncoder;
  /** View angles of the last applied input (the debug shot fires along these). */
  lastView: { yaw: number; pitch: number };
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
  private readonly members = new Map<number, Member>();
  private nextMemberId = 1;
  /** Performance counters for the /stats endpoint and the netsim. */
  readonly stats = { ticks: 0, corrections: 0, droppedInputs: 0, idledTicks: 0, skippedSnapshots: 0 };

  private constructor(
    readonly code: string,
    readonly sim: Sim,
    readonly levelId: string,
    /** Movement Lab rooms allow respawn / teleport tools. */
    readonly lab: boolean,
  ) {
    this.history = new HitboxHistory(sim, 32);
  }

  static async create(code: string, levelId: string, opts: { lab?: boolean } = {}): Promise<Room> {
    return new Room(code, await Sim.create(levelId), levelId, opts.lab ?? true);
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
    const m: Member = {
      id: this.nextMemberId++,
      name: name || "Player",
      client,
      ctrl: null,
      queue: [],
      lastQueuedSeq: 0,
      lastSeq: 0,
      applied: null,
      idled: false,
      needCorrection: false,
      credit: 0,
      corrections: 0,
      epoch: 0,
      encoder: new SnapshotEncoder(),
      lastView: { yaw: 0, pitch: 0 },
    };
    this.members.set(m.id, m);
    this.spawn(m, operatorId);
    client.send(encodeWelcome({ roomCode: this.code, tick: this.sim.tick, levelId: this.levelId, controllerId: m.ctrl!.id }));
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

  /** (Re)create a member's body with an operator; its client gets an exact correction to start predicting. */
  pickOperator(memberId: number, operatorId: string): void {
    const m = this.members.get(memberId);
    if (!m || !this.sim.data.operators.has(operatorId)) return;
    this.spawn(m, operatorId);
    this.broadcastRoster();
  }

  private spawn(m: Member, operatorId: string) {
    if (m.ctrl) this.sim.removePlayer(m.ctrl.id);
    m.ctrl = this.sim.addPlayer(m.name, operatorId);
    m.queue = [];
    m.needCorrection = true;
  }

  onInput(memberId: number, msg: InputMsg): void {
    const m = this.members.get(memberId);
    if (!m || !m.ctrl) return;
    const seq = unwrap16(msg.cmd.seq, m.lastQueuedSeq);
    if (seq <= m.lastQueuedSeq) return; // duplicate or out of date
    m.lastQueuedSeq = seq;
    m.queue.push({ ...msg, cmd: { ...msg.cmd, seq } });
  }

  /** Answer a ping at once (the client measures round-trip time from it). */
  onPing(memberId: number, clientTime: number): void {
    this.members.get(memberId)?.client.send(encodePong({ clientTime, serverTick: this.sim.tick }));
  }

  onResync(memberId: number): void {
    this.members.get(memberId)?.encoder.reset();
  }

  onLabTool(memberId: number, tool: LabTool): void {
    const m = this.members.get(memberId);
    if (!m || !m.ctrl || !this.lab) return;
    if (tool.kind === "respawn") this.spawn(m, m.ctrl.operatorId);
    else {
      this.sim.teleport(m.ctrl.possessedPawnId, tool.x, tool.y, tool.z, tool.yawDeg);
      m.queue = [];
      m.needCorrection = true;
    }
  }

  /**
   * A test shot along the member's current view, judged against everyone else as they were at render time
   * `viewTick` (lag compensation, capped at MAX_REWIND_TICKS). The level stops the ray where it's hit.
   */
  onDebugShot(memberId: number, viewTick: number): void {
    const m = this.members.get(memberId);
    if (!m || !m.ctrl) return;
    const pawn = this.sim.pawns.get(m.ctrl.possessedPawnId);
    if (!pawn) return;
    const origin = eyePose(this.sim.data.movement, this.sim.data.hitboxes, pawn.state).pos;
    const { yaw, pitch } = m.lastView;
    const dir: Vec3 = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const ray = new this.sim.R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] });
    const wall = this.sim.world.castRay(ray, 200, true, undefined, QUERY_STATIC);
    const maxDist = wall ? wall.timeOfImpact : 200;
    const now = this.sim.tick;
    const hit = this.history.raycast(origin, dir, maxDist, viewTick, now, MAX_REWIND_TICKS, new Set(m.ctrl.pawnIds));
    m.client.send(
      encodeShotResult({
        origin,
        dir,
        rewoundTick: Math.min(now, Math.max(viewTick, now - MAX_REWIND_TICKS)),
        hit: hit && { pawnId: hit.pawnId, part: hit.part, distance: hit.distance },
        wallDistance: wall && !hit ? wall.timeOfImpact : null,
      }),
    );
  }

  /** Read-only facts about one connection (tools, tests, the stats endpoint). */
  memberInfo(memberId: number): { name: string; controllerId: number; lastSeq: number; queued: number; corrections: number } | null {
    const m = this.members.get(memberId);
    return m ? { name: m.name, controllerId: m.ctrl?.id ?? 0, lastSeq: m.lastSeq, queued: m.queue.length, corrections: m.corrections } : null;
  }

  roster(): RosterEntry[] {
    return [...this.members.values()].filter((m) => m.ctrl).map((m) => ({ controllerId: m.ctrl!.id, name: m.name, operatorId: m.ctrl!.operatorId, pawnIds: [...m.ctrl!.pawnIds] }));
  }

  private broadcastRoster() {
    const entries = this.roster();
    for (const m of this.members.values()) m.client.send(encodeRoster(entries, m.ctrl?.id ?? 0));
  }

  private take(m: Member): InputMsg | null {
    const next = m.queue.shift();
    if (!next) return null;
    m.credit--;
    m.lastSeq = next.cmd.seq;
    m.lastView = { yaw: next.cmd.yaw, pitch: next.cmd.pitch };
    return next;
  }

  /** Only judge predictions made after the client applied our latest correction. */
  private check(m: Member, applied: InputMsg) {
    if (m.ctrl && applied.epoch === (m.epoch & 0xff) && predictionHash(this.sim, m.ctrl) !== applied.predictedHash) m.needCorrection = true;
  }

  /** Advance one tick: apply queued inputs, step, check predictions, send snapshots. */
  step(): void {
    const inputs = new Map<number, InputCmd>();
    for (const m of this.members.values()) {
      m.applied = null;
      if (!m.ctrl) continue;
      m.credit = Math.min(MAX_CREDIT, m.credit + 1);
      if (m.queue.length > MAX_QUEUE) {
        const drop = m.queue.length - MAX_QUEUE;
        m.queue.splice(0, drop);
        this.stats.droppedInputs += drop;
      }
      const next = this.take(m);
      if (!next) {
        m.idled = true;
        this.stats.idledTicks++;
        continue;
      }
      inputs.set(m.ctrl.id, next.cmd);
      m.applied = next;
    }
    this.sim.step(inputs);
    for (const m of this.members.values()) if (m.applied) this.check(m, m.applied);
    // Catch up after a stall: one extra input for a client that has a backlog and banked credit.
    for (const m of this.members.values()) {
      if (!m.ctrl || m.queue.length <= TARGET_QUEUE || m.credit < 1) continue;
      const extra = this.take(m)!;
      this.sim.step(new Map([[m.ctrl.id, extra.cmd]]), new Set([m.ctrl.id]));
      this.check(m, extra);
    }
    this.history.record();
    this.stats.ticks++;
    if (this.sim.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
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
        m.corrections++;
        this.stats.corrections++;
        correction = { pawns: m.ctrl.pawnIds.map((id) => [id, this.sim.pawns.get(id)!.state] as [number, PawnState]), ctrl: controllerState(m.ctrl), epoch: m.epoch };
        m.needCorrection = false;
      }
      m.client.send(m.encoder.encode({ tick: this.sim.tick, ackSeq: m.lastSeq, idled: m.idled, queueDepth: m.queue.length }, correction, remotes));
      m.idled = false;
    }
  }
}

/** Seconds of simulated time per room tick (for callers pacing a room loop). */
export const ROOM_TICK_SECONDS = DT;
