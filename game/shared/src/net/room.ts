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
import { Btn } from "../player/types.js";
import { encodeError, encodePong, encodeRoster, encodeShotResult, encodeWelcome, ErrorCode, unwrap16, type InputMsg, type LabTool, type RosterEntry } from "./protocol.js";
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
/** Longest rewind for lag compensation (PLAN §5: ~200 ms). */
export const MAX_REWIND_TICKS = 0.2 * TICK_HZ;
/** How far behind its newest snapshot a client can claim to be drawing others (its interpolation ceiling). */
const MAX_VIEW_BACK_TICKS = (MAX_INTERP_MS / 1000) * TICK_HZ + 0.5;
/**
 * A player whose inputs stop arriving is held still (a short stall costs no correction) for up to this
 * many ticks, then simulated without input (gravity, a vault in progress), so nobody can hang in the air
 * or on a ledge by withholding inputs. The hold is a budget: each tick without input spends one, each
 * applied input earns back HOLD_REFUND, so withholding most inputs (a trickle) runs it out too.
 */
export const MAX_HOLD_TICKS = 16;
const HOLD_REFUND = 0.25;
/** Fewest client ticks (input sequence numbers) between two test shots from one player. */
const SHOT_INTERVAL_TICKS = 8;
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
export const MAX_ROOM_PLAYERS = 10;
/** Lab teleports beyond this distance from the origin (metres) are ignored: no level is that big. */
const MAX_COORD = 1000;

/** One connection's view of the transport. */
export interface RoomClient {
  send(bytes: Uint8Array): void;
  /** Bytes queued but not yet sent (WebSocket bufferedAmount); 0 in-process. */
  buffered(): number;
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
  queue: QueuedInput[];
  credit: number;
  /** Corrections sent to this client (prediction mismatches, respawns). */
  corrections: number;
  /** Highest input seq received / applied (unwrapped from 16 bits). */
  lastQueuedSeq: number;
  lastSeq: number;
  /** The input applied this tick, whose predicted hash is checked after stepping. */
  applied: QueuedInput | null;
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
  /** Buttons of the last applied input (to see the fire button go down), and the input that last fired. */
  lastButtons: number;
  lastShotSeq: number;
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
    return new Room(code, await Sim.create(levelId), levelId, opts.lab ?? false);
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
      held: 0,
      lags: [],
      lagAt: 0,
      needCorrection: false,
      credit: 0,
      corrections: 0,
      epoch: 0,
      newBody: true,
      confirmEpoch: null,
      encoder: new SnapshotEncoder(),
      lastButtons: 0,
      lastShotSeq: -Infinity,
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
    m.newBody = true;
    m.lastButtons = 0;
    m.credit = 0;
    m.held = 0;
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

  onLabTool(memberId: number, tool: LabTool): void {
    const m = this.members.get(memberId);
    if (!m || !m.ctrl || !this.lab) return;
    if (tool.kind === "respawn") {
      this.spawn(m, m.ctrl.operatorId);
      this.broadcastRoster(); // new pawn ids: everyone (the respawned client too) needs them
    } else if (Math.abs(tool.x) <= MAX_COORD && Math.abs(tool.y) <= MAX_COORD && Math.abs(tool.z) <= MAX_COORD) {
      // Same body: inputs already queued or in flight still apply after the jump, exactly as the client
      // replays them on top of the correction.
      this.sim.teleport(m.ctrl.possessedPawnId, tool.x, tool.y, tool.z, tool.yawDeg);
      m.needCorrection = true;
    }
  }

  /**
   * The fire button went down in an applied input: a test shot along that input's view from the body's
   * eye, judged against everyone else as they were when that input was made. The view time comes from
   * the input itself (its newest snapshot tick minus how far behind it the client was drawing), bounded
   * by the client's interpolation ceiling and by the lag its connection has shown, and the rewind is
   * capped at MAX_REWIND_TICKS counted from when the input arrived (time it then waits in our queue is
   * ours, not the shooter's latency). The level stops the ray where it's hit.
   */
  private fire(m: Member, applied: QueuedInput) {
    const pressed = applied.cmd.buttons & ~m.lastButtons;
    m.lastButtons = applied.cmd.buttons;
    if (!(pressed & Btn.Fire) || !m.ctrl) return;
    if (m.ctrl.shellCam || m.ctrl.swapPhase !== 0) return; // Skopós looking through a shell's camera can't shoot
    if (applied.cmd.seq - m.lastShotSeq < SHOT_INTERVAL_TICKS) return;
    m.lastShotSeq = applied.cmd.seq;
    const pawn = this.sim.pawns.get(m.ctrl.possessedPawnId);
    if (!pawn) return;
    const now = applied.receivedTick;
    const leastLag = Math.min(...m.lags);
    const snapTick = Math.max(Math.min(now, unwrap16(applied.snapTick, now)), now - leastLag - LAG_SLACK_TICKS);
    const viewTick = snapTick - Math.min(MAX_VIEW_BACK_TICKS, applied.viewBackQ8 / 256);
    const origin = eyePose(this.sim.data.movement, this.sim.data.hitboxes, pawn.state).pos;
    const { yaw, pitch } = applied.cmd;
    const dir: Vec3 = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const ray = new this.sim.R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] });
    const wall = this.sim.world.castRay(ray, 200, true, undefined, QUERY_STATIC);
    const maxDist = wall ? wall.timeOfImpact : 200;
    const hit = this.history.raycast(origin, dir, maxDist, viewTick, now, MAX_REWIND_TICKS, new Set(m.ctrl.pawnIds));
    m.client.send(
      encodeShotResult({
        origin,
        dir,
        rewoundTick: Math.min(now, Math.max(viewTick, now - MAX_REWIND_TICKS)),
        serverTick: now,
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

  private take(m: Member): QueuedInput | null {
    const next = m.queue.shift();
    if (!next) return null;
    m.credit--;
    m.held = Math.max(0, m.held - HOLD_REFUND);
    m.lastSeq = next.cmd.seq;
    return next;
  }

  /** After stepping an input: judge the prediction made with it (only if made after our latest correction), then any shot. */
  private afterInput(m: Member, applied: QueuedInput) {
    if (m.ctrl && applied.epoch === (m.epoch & 0xff) && predictionHash(this.sim, m.ctrl) !== applied.predictedHash) m.needCorrection = true;
    this.fire(m, applied);
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
        }
        continue;
      }
      inputs.set(m.ctrl.id, next.cmd);
      active.add(m.ctrl.id);
      m.applied = next;
    }
    this.sim.step(inputs, active, true);
    for (const m of this.members.values()) if (m.applied) this.afterInput(m, m.applied);
    // Catch up after a stall: one extra input for a client that has a backlog and banked credit.
    for (const m of this.members.values()) {
      if (!m.ctrl || m.queue.length <= TARGET_QUEUE || m.credit < 1) continue;
      const extra = this.take(m)!;
      this.sim.step(new Map([[m.ctrl.id, extra.cmd]]), new Set([m.ctrl.id]));
      this.afterInput(m, extra);
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
        if (m.newBody) {
          m.newBody = false;
          m.confirmEpoch = m.epoch & 0xff;
        }
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
