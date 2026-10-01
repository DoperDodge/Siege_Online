// The client side of a match (PLAN §5): predicts its own player with the shared simulation, reconciles
// with the server's corrections, and interpolates everyone else. Transport- and DOM-free, so the browser
// and the headless netsim clients run the same code.
import { TICK_HZ } from "../core/constants.js";
import type { PlayerController } from "../player/pawn.js";
import { quantizeInput, type InputCmd, type PawnState } from "../player/types.js";
import { Sim } from "../sim.js";
import { ByteReader, ProtocolError } from "./bytes.js";
import {
  decodeError,
  decodePong,
  decodeRoster,
  decodeShotResult,
  decodeWelcome,
  encodeInput,
  encodePing,
  encodeResync,
  Msg,
  PROTOCOL_VERSION,
  unwrap16,
  type RosterEntry,
  type ShotResult,
} from "./protocol.js";
import { predictionHash, TARGET_QUEUE } from "./room.js";
import { interpolateRemote, MAX_INTERP_MS, remoteState, SNAPSHOT_EVERY, SnapshotDecoder, type Snapshot } from "./snapshot.js";

const SNAPSHOT_MS = (1000 * SNAPSHOT_EVERY) / TICK_HZ;
/** Interpolation delay bounds (ms): at least two snapshot intervals, at most MAX_INTERP_MS. */
const MIN_INTERP_MS = 2 * SNAPSHOT_MS;
/** Keep a second of remote history (render time never goes further back than the interpolation delay). */
const REMOTE_HISTORY_TICKS = TICK_HZ;

export interface ClientSessionOptions {
  send(bytes: Uint8Array): void;
  /** Monotonic milliseconds (performance.now()). */
  now(): number;
  onWelcome?(roomCode: string): void;
  onRoster?(entries: RosterEntry[], you: number): void;
  onShot?(shot: ShotResult): void;
  onError?(code: number, message: string): void;
}

interface Sample {
  tick: number;
  state: PawnState;
}

export class ClientSession {
  sim: Sim | null = null;
  roomCode = "";
  roster: RosterEntry[] = [];
  /** Our controller id (it changes when the server respawns us). */
  you = 0;
  /** Last correction epoch applied; inputs carry it so the server only judges fresh predictions. */
  epoch = 0;
  /** True once the server's exact state for our current body has arrived: only then do we predict. */
  corrected = false;
  rttMs = 0;
  /** Current remote interpolation delay. */
  interpDelayMs = 100;
  readonly stats = { snapshots: 0, corrections: 0, resyncs: 0, bytesIn: 0, bytesOut: 0, replayedTicks: 0 };

  private readonly decoder = new SnapshotDecoder();
  private pending: { seq: number; cmd: InputCmd }[] = [];
  private seq = 0;
  private readonly remotes = new Map<number, Sample[]>();
  private readonly operatorOf = new Map<number, string>();
  private lastSnapTick = 0;
  private lastSnapAt = 0;
  private lastArrival = 0;
  /** When the last snapshot arrived (ms, from `now`): the page can tell a silent connection from a live one. */
  get lastSnapshotAt(): number {
    return this.lastArrival;
  }
  private jitterMs = 0;
  private queueEwma = TARGET_QUEUE;
  private awaitingReset = false;
  private resyncSentAt = 0;
  private backlog: Uint8Array[] = [];
  private creating: Promise<void> | null = null;
  private markLoaded: () => void = () => {};
  private readonly loadedPromise = new Promise<void>((resolve) => (this.markLoaded = resolve));

  constructor(private readonly opts: ClientSessionOptions) {}

  private send(bytes: Uint8Array) {
    this.stats.bytesOut += bytes.length;
    this.opts.send(bytes);
  }

  get ctrl(): PlayerController | null {
    return this.sim?.controllers.get(this.you) ?? null;
  }

  /** Predicting and sending inputs. */
  get ready(): boolean {
    return this.ctrl !== null && this.corrected;
  }

  /**
   * Feed one message from the server. Messages arriving while the level loads are replayed after it,
   * except errors (a wrong room code is answered before any Welcome).
   */
  handle(bytes: Uint8Array): void {
    this.stats.bytesIn += bytes.length;
    if (bytes[0] !== Msg.Welcome && bytes[0] !== Msg.Error && (!this.sim || this.creating)) {
      this.backlog.push(bytes);
      return;
    }
    const r = new ByteReader(bytes.subarray(1));
    switch (bytes[0]) {
      case Msg.Welcome: {
        const w = decodeWelcome(r);
        if (w.version !== PROTOCOL_VERSION) throw new ProtocolError(`server speaks protocol ${w.version}, we speak ${PROTOCOL_VERSION}`);
        this.roomCode = w.roomCode;
        this.creating = Sim.create(w.levelId).then((sim) => {
          this.sim = sim;
          this.creating = null;
          this.opts.onWelcome?.(w.roomCode);
          const queued = this.backlog;
          this.backlog = [];
          for (const b of queued) this.handle(b);
          this.markLoaded();
        });
        return;
      }
      case Msg.Roster: {
        const { you, entries } = decodeRoster(r);
        this.applyRoster(entries, you);
        return;
      }
      case Msg.Snapshot:
        this.applySnapshot(this.decoder.decode(bytes));
        return;
      case Msg.Pong: {
        const p = decodePong(r);
        const sample = this.opts.now() - p.clientTime;
        this.rttMs = this.rttMs === 0 ? sample : this.rttMs + (sample - this.rttMs) / 8;
        return;
      }
      case Msg.ShotResult:
        this.opts.onShot?.(decodeShotResult(r));
        return;
      case Msg.Error: {
        const e = decodeError(r);
        this.opts.onError?.(e.code, e.message);
        return;
      }
      default:
        throw new ProtocolError(`unknown message ${bytes[0]}`);
    }
  }

  /** Resolves once the level from Welcome is loaded and any queued messages are applied. */
  loaded(): Promise<void> {
    return this.loadedPromise;
  }

  private applyRoster(entries: RosterEntry[], you: number) {
    const sim = this.sim!;
    this.roster = entries;
    this.operatorOf.clear();
    for (const e of entries) for (const id of e.pawnIds) this.operatorOf.set(id, e.operatorId);
    const mine = entries.find((e) => e.controllerId === you);
    const current = this.ctrl;
    if (!mine || !current || current.id !== you || current.pawnIds.join() !== mine.pawnIds.join()) {
      // A new body (join, operator pick, respawn): rebuild ours with the server's ids, then wait for its
      // exact state (the server always sends a correction for a new body) before predicting again.
      if (this.you && sim.controllers.has(this.you)) sim.removePlayer(this.you);
      for (const id of mine?.pawnIds ?? []) {
        sim.removePawn(id); // in case it was a proxy
        this.remotes.delete(id);
      }
      this.you = you;
      this.corrected = false;
      this.pending = [];
      if (mine) sim.addPlayer(mine.name, mine.operatorId, 0, { controller: mine.controllerId, pawns: mine.pawnIds });
    }
    this.opts.onRoster?.(entries, you);
  }

  private applySnapshot(snap: Snapshot) {
    const sim = this.sim!;
    const now = this.opts.now();
    this.stats.snapshots++;
    if (this.lastArrival) {
      // Adaptive interpolation delay: enough buffer to ride out the observed arrival jitter. (Running dry
      // raises it further, see frame(); it only comes back down slowly.)
      this.jitterMs += (Math.abs(now - this.lastArrival - SNAPSHOT_MS) - this.jitterMs) / 16;
      const target = Math.min(MAX_INTERP_MS, Math.max(MIN_INTERP_MS, SNAPSHOT_MS + 3 * this.jitterMs));
      if (target > this.interpDelayMs) this.interpDelayMs += (target - this.interpDelayMs) * 0.25;
    }
    this.lastArrival = now;
    this.lastSnapTick = snap.tick;
    this.lastSnapAt = now;
    this.queueEwma += (snap.queueDepth - this.queueEwma) / 8;

    // Inputs the server has applied are done; a correction is the exact state after all of them.
    const ack = unwrap16(snap.ackSeq, this.seq);
    this.pending = this.pending.filter((p) => p.seq > ack);
    const ctrl = this.ctrl;
    // A correction is for the body in our roster; one for another body (its roster not here yet) waits.
    if (snap.correction && ctrl && snap.correction.pawns.every(([id]) => ctrl.pawnIds.includes(id))) {
      for (const [id, state] of snap.correction.pawns) if (sim.pawns.has(id)) sim.setPawnState(id, state);
      Object.assign(ctrl, snap.correction.ctrl);
      this.epoch = snap.correction.epoch;
      this.corrected = true;
      this.stats.corrections++;
      for (const p of this.pending) sim.step(new Map([[ctrl.id, p.cmd]]));
      this.stats.replayedTicks += this.pending.length;
    }

    // Everyone else: keep a short history per pawn for interpolation, and put their collision proxies at
    // the newest known position (what our own prediction collides with).
    if (snap.baselineReset) this.awaitingReset = false;
    if (!this.awaitingReset) {
      const own = new Set(ctrl?.pawnIds ?? []);
      for (const id of snap.removed) {
        sim.removePawn(id);
        this.remotes.delete(id);
      }
      if (snap.baselineReset) {
        // Everyone the server still has is in this snapshot; removals we skipped while waiting for it
        // are gone for good, so drop anyone it doesn't list.
        for (const id of [...this.remotes.keys()])
          if (!this.decoder.have.has(id) && !own.has(id)) {
            this.remotes.delete(id);
            if (sim.pawns.get(id)?.proxy) sim.removePawn(id);
          }
        for (const p of [...sim.pawns.values()]) if (p.proxy && !this.decoder.have.has(p.id)) sim.removePawn(p.id);
      }
      for (const [id, q] of this.decoder.have) {
        if (own.has(id)) continue;
        const state = remoteState(q);
        let buf = this.remotes.get(id);
        if (!buf) this.remotes.set(id, (buf = []));
        buf.push({ tick: snap.tick, state });
        while (buf.length > 2 && buf[0].tick < snap.tick - REMOTE_HISTORY_TICKS) buf.shift();
        if (sim.pawns.get(id)?.proxy) sim.setPawnState(id, state);
        else if (!sim.pawns.has(id)) sim.addProxy(id, this.operatorOf.get(id) ?? "sledge", state);
      }
      if (!this.decoder.verify(snap)) {
        // Our baselines drifted from the server's: ask for a full resend and ignore deltas until it comes.
        this.stats.resyncs++;
        this.awaitingReset = true;
        this.resyncSentAt = now;
        this.send(encodeResync());
      }
    } else if (now - this.resyncSentAt > 1000) {
      this.resyncSentAt = now; // the request may have been lost to a rate limit: ask again
      this.send(encodeResync());
    }
  }

  /** The server tick we believe is current (last snapshot, advanced by the time since it arrived). */
  serverTick(): number {
    return this.lastSnapTick + ((this.opts.now() - this.lastSnapAt) / 1000) * TICK_HZ;
  }

  private lastFrameAt = 0;
  private lastStarveAt = -Infinity;
  /** Render frames where some remote pawn had no newer snapshot to move toward (buffer ran dry). */
  starvedFrames = 0;

  /**
   * Call once per rendered frame: returns the render tick for remote players, and adapts the
   * interpolation delay (one snapshot interval more whenever the buffer runs dry; −1 ms per second
   * while it doesn't, down to what the jitter needs).
   */
  frame(): number {
    const now = this.opts.now();
    const dt = this.lastFrameAt ? Math.min(1000, now - this.lastFrameAt) : 0;
    this.lastFrameAt = now;
    let tick = this.renderTick();
    let starved = false;
    for (const [, buf] of this.remotes) if (buf.length && tick > buf[buf.length - 1].tick) starved = true;
    if (starved) {
      this.starvedFrames++;
      if (now - this.lastStarveAt > SNAPSHOT_MS) this.interpDelayMs = Math.min(MAX_INTERP_MS, this.interpDelayMs + SNAPSHOT_MS);
      this.lastStarveAt = now;
      tick = this.renderTick();
    } else {
      const floor = Math.min(MAX_INTERP_MS, Math.max(MIN_INTERP_MS, SNAPSHOT_MS + 3 * this.jitterMs));
      this.interpDelayMs = Math.max(floor, this.interpDelayMs - dt / 1000);
    }
    return tick;
  }

  /** The (fractional) server tick remote players are drawn at: now minus the interpolation delay. */
  renderTick(): number {
    return this.serverTick() - (this.interpDelayMs / 1000) * TICK_HZ;
  }

  /** A remote pawn as it should be drawn at `tick` (between the two snapshots around it), or null. */
  remoteAt(pawnId: number, tick = this.renderTick()): PawnState | null {
    const buf = this.remotes.get(pawnId);
    if (!buf || buf.length === 0) return null;
    if (tick <= buf[0].tick) return buf[0].state;
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1];
      const b = buf[i];
      if (tick >= a.tick) return tick >= b.tick ? b.state : interpolateRemote(a.state, b.state, (tick - a.tick) / (b.tick - a.tick));
    }
    return buf[buf.length - 1].state;
  }

  /** Pawn ids we have remote history for. */
  remoteIds(): number[] {
    return [...this.remotes.keys()];
  }

  /** Newest snapshot tick we hold for a remote pawn (render time past it means the buffer ran dry). */
  remoteNewestTick(pawnId: number): number | null {
    const buf = this.remotes.get(pawnId);
    return buf && buf.length ? buf[buf.length - 1].tick : null;
  }

  /**
   * Multiplier for the client's tick period: >1 slows down (the server's queue for us is growing),
   * <1 speeds up (it's running dry), so our inputs arrive just ahead of when the server needs them.
   */
  tickScale(): number {
    return 1 + Math.max(-0.05, Math.min(0.05, 0.02 * (this.queueEwma - TARGET_QUEUE)));
  }

  /** One client tick: predict our own movement locally and send the input. Returns the quantized input. */
  tick(cmd: Omit<InputCmd, "seq">): InputCmd | null {
    const sim = this.sim;
    const ctrl = this.ctrl;
    if (!sim || !ctrl || !this.corrected) return null;
    const q = quantizeInput({ ...cmd, seq: ++this.seq });
    sim.step(new Map([[ctrl.id, q]]));
    this.pending.push({ seq: this.seq, cmd: q });
    const viewBack = Math.max(0, this.lastSnapTick - this.renderTick());
    this.send(encodeInput({ cmd: q, predictedHash: predictionHash(sim, ctrl), epoch: this.epoch, snapTick: this.lastSnapTick, viewBackQ8: viewBack * 256 }));
    return q;
  }

  ping(): void {
    this.send(encodePing(this.opts.now()));
  }

  /** Sequence number of the last input sent. */
  get lastSeq(): number {
    return this.seq;
  }

  /** Inputs sent but not yet acknowledged. */
  get unacked(): number {
    return this.pending.length;
  }
}
