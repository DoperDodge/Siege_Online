// Headless multi-client harness (PLAN §17 Phase 2, §19): one Room and N ClientSessions over a simulated
// network with latency, jitter, TCP-style stalls and client clock drift, all in virtual time so a
// 30-second match runs in about a second and is repeatable from its seed.
import { Btn, ByteReader, ClientSession, decodeInput, decodeLabTool, decodePickOperator, decodePing, DT, Msg, Room, Stance, type InputCmd } from "@redmond/shared";
import { performance } from "node:perf_hooks";

export interface NetsimOptions {
  clients: number;
  seconds: number;
  /** One-way latency (ms); 100 ms simulated latency in PLAN §17 means a 100 ms round trip → 50. */
  oneWayMs: number;
  jitterMs: number;
  /** Chance per second of a TCP retransmit stall on a link, and its length. */
  stallsPerSecond: number;
  stallMs: number;
  /** Client clocks run up to this fraction fast or slow. */
  driftPct: number;
  seed: number;
  /** Bots steer toward the middle so they bump into each other. */
  crowd: boolean;
  /** Teleport bots 6 m apart first (no contact: every correction then means a determinism bug). */
  spread: boolean;
  operators?: string[];
}

export const DEFAULTS: NetsimOptions = {
  clients: 10,
  seconds: 30,
  oneWayMs: 50,
  jitterMs: 10,
  stallsPerSecond: 0.05,
  stallMs: 200,
  driftPct: 0.5,
  seed: 1,
  crowd: true,
  spread: false,
};

export interface NetsimReport {
  options: NetsimOptions;
  perClient: {
    name: string;
    corrections: number;
    snapshots: number;
    resyncs: number;
    downKbps: number;
    upKbps: number;
    rttMs: number;
    interpDelayMs: number;
  }[];
  room: Room["stats"];
  serverTickMs: { mean: number; p99: number; max: number };
  /** Every client's predicted state equals the server's once all inputs are applied. */
  desyncs: string[];
  /** Render frames where a remote pawn had no snapshot to interpolate toward (buffer ran dry). */
  starvedRemoteFrames: number;
}

class Rng {
  constructor(private s: number) {}
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 2 ** 32;
  }
}

/** A queue of timed events in virtual milliseconds. */
class Clock {
  now = 0;
  private events: { at: number; n: number; fn: () => void }[] = [];
  private n = 0;
  at(time: number, fn: () => void) {
    this.events.push({ at: time, n: this.n++, fn });
  }
  runUntil(t: number) {
    for (;;) {
      let best = -1;
      for (let i = 0; i < this.events.length; i++) {
        const e = this.events[i];
        if (e.at <= t && (best < 0 || e.at < this.events[best].at || (e.at === this.events[best].at && e.n < this.events[best].n))) best = i;
      }
      if (best < 0) break;
      const [e] = this.events.splice(best, 1);
      this.now = e.at;
      e.fn();
    }
    this.now = t;
  }
}

/** One direction of a TCP connection: in-order delivery, latency + jitter, and occasional stalls. */
class Link {
  private lastDelivery = 0;
  private stalledUntil = 0;
  /** No new stalls from this time on (the quiet end of a run). */
  calmAfter = Infinity;
  bytes = 0;
  constructor(
    private readonly clock: Clock,
    private readonly rng: Rng,
    private readonly o: NetsimOptions,
    private readonly deliver: (b: Uint8Array) => void,
  ) {}
  send(b: Uint8Array) {
    this.bytes += b.length;
    const now = this.clock.now;
    if (now >= this.stalledUntil && now < this.calmAfter && this.rng.next() < this.o.stallsPerSecond * DT) this.stalledUntil = now + this.o.stallMs;
    // During a stall nothing gets through until it ends; TCP then delivers everything in order.
    const from = now < this.stalledUntil ? this.stalledUntil : now;
    const arrive = Math.max(from + this.o.oneWayMs + this.rng.next() * this.o.jitterMs, this.lastDelivery);
    this.lastDelivery = arrive;
    const copy = b.slice();
    this.clock.at(arrive, () => this.deliver(copy));
  }
}

/** A scripted player: changes what it's doing every second or so, and heads for the middle when crowding. */
function bot(rng: Rng, crowd: boolean) {
  let until = 0;
  let cmd: Omit<InputCmd, "seq"> = { forward: 1, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 };
  let turn = 0;
  return (tick: number, pos: { x: number; z: number } | null): Omit<InputCmd, "seq"> => {
    if (tick >= until) {
      until = tick + 32 + Math.floor(rng.next() * 96);
      const r = rng.next();
      cmd = {
        forward: r < 0.8 ? 1 : r < 0.9 ? -1 : 0,
        strafe: rng.next() < 0.3 ? (rng.next() < 0.5 ? -1 : 1) : 0,
        yaw: cmd.yaw,
        pitch: (rng.next() - 0.5) * 0.8,
        buttons: (rng.next() < 0.35 ? Btn.Sprint : 0) | (rng.next() < 0.1 ? Btn.Ads : 0),
        stance: rng.next() < 0.12 ? Stance.Crouch : rng.next() < 0.05 ? Stance.Prone : Stance.Stand,
        lean: rng.next() < 0.15 ? (rng.next() < 0.5 ? -1 : 1) : 0,
      };
      turn = (rng.next() - 0.5) * 0.08;
    }
    let yaw = cmd.yaw + turn;
    if (crowd && pos) {
      // Steer back toward the spawn area so players keep running into each other.
      const home = Math.atan2(pos.x, 10 - pos.z) + Math.PI; // facing the spawn area around (0, 10)
      const d = Math.atan2(Math.sin(home - yaw), Math.cos(home - yaw));
      if (Math.hypot(pos.x, pos.z - 10) > 4) yaw += Math.sign(d) * Math.min(Math.abs(d), 0.06);
    }
    cmd = { ...cmd, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)) };
    return cmd;
  };
}

export async function runNetsim(partial: Partial<NetsimOptions> = {}): Promise<NetsimReport> {
  const o: NetsimOptions = { ...DEFAULTS, ...partial };
  const rng = new Rng(o.seed);
  const clock = new Clock();
  const room = await Room.create("SIM00", "movement_lab", { lab: true });
  const tickMs = DT * 1000;
  const serverTimes: number[] = [];

  const clients = await Promise.all(
    Array.from({ length: o.clients }, async (_, i) => {
      const name = `bot${i}`;
      let memberId = 0;
      let session!: ClientSession;
      const down = new Link(clock, rng, o, (b) => session.handle(b));
      const up = new Link(clock, rng, o, (b) => deliverToServer(b));
      session = new ClientSession({ send: (b) => up.send(b), now: () => clock.now });
      const deliverToServer = (b: Uint8Array) => serverReceive(memberId, b);
      memberId = room.join(name, { send: (b) => down.send(b), buffered: () => 0 }, o.operators?.[i % o.operators.length] ?? (i === 3 ? "skopos" : "sledge"))!;
      const drift = 1 + ((rng.next() * 2 - 1) * o.driftPct) / 100;
      return { name, session, down, up, memberId, drift, brain: bot(new Rng(o.seed * 1000 + i), o.crowd), nextTickAt: 0, ticks: 0 };
    }),
  );

  function serverReceive(memberId: number, b: Uint8Array) {
    const r = new ByteReader(b.subarray(1));
    if (b[0] === Msg.Input) room.onInput(memberId, decodeInput(r));
    else if (b[0] === Msg.Resync) room.onResync(memberId);
    else if (b[0] === Msg.Ping) room.onPing(memberId, decodePing(r).clientTime);
    else if (b[0] === Msg.LabTool) room.onLabTool(memberId, decodeLabTool(r));
    else if (b[0] === Msg.PickOperator) room.pickOperator(memberId, decodePickOperator(r).operatorId);
  }

  // Deliver the join messages, then load every client's level.
  clock.runUntil(o.oneWayMs * 3 + o.jitterMs);
  await Promise.all(clients.map((c) => c.session.loaded()));
  if (o.spread) {
    // Along the open south side of the lab, 6 m apart.
    clients.forEach((c, i) => room.onLabTool(c.memberId, { kind: "teleport", x: -27 + (i % 10) * 6, y: 0, z: 26 - Math.floor(i / 10) * 4, yawDeg: 90 * i }));
  }

  const endAt = clock.now + o.seconds * 1000;
  let serverNext = clock.now;
  // The last two seconds are hands-off (neutral input every tick): bodies come to rest, and during the
  // final second no client may need a correction. A correction there means client and server disagree
  // about a body standing still: a real desync, not a collision misprediction.
  const inputsStopAt = endAt - 2000;
  const quietFrom = endAt - 1000;
  let correctionsAtQuiet: number[] | null = null;
  for (const c of clients) c.up.calmAfter = c.down.calmAfter = quietFrom - 500 - o.stallMs; // stalls cause genuine corrections
  while (clock.now < endAt) {
    // Next event: a server tick or some client's tick, whichever is sooner.
    const nextClient = Math.min(...clients.map((c) => c.nextTickAt));
    const t = Math.min(serverNext, nextClient);
    clock.runUntil(t);
    if (!correctionsAtQuiet && t >= quietFrom) correctionsAtQuiet = clients.map((c) => room.memberInfo(c.memberId)?.corrections ?? 0);
    if (t === serverNext) {
      const t0 = performance.now();
      room.step();
      serverTimes.push(performance.now() - t0);
      serverNext += tickMs;
    }
    for (const c of clients) {
      if (c.nextTickAt > t) continue;
      c.nextTickAt = t + tickMs * c.drift * c.session.tickScale();
      if (c.session.ready) {
        // The last second is hands-off (neutral input) so every body comes to rest before the desync check.
        const own = c.session.sim?.pawns.get(c.session.ctrl!.possessedPawnId)?.state ?? null;
        const cmd = c.brain(c.ticks++, own);
        c.session.tick(clock.now < inputsStopAt ? cmd : { ...cmd, forward: 0, strafe: 0, buttons: 0, lean: 0, stance: Stance.Stand });
      }
      if (c.ticks % 64 === 0) c.session.ping();
      // A render frame (one per client tick here).
      if (c.session.ready) c.session.frame();
    }
  }
  const desyncs: string[] = [];
  clients.forEach((c, i) => {
    const late = (room.memberInfo(c.memberId)?.corrections ?? 0) - (correctionsAtQuiet?.[i] ?? 0);
    if (late > 0) desyncs.push(`${c.name}: ${late} correction(s) while standing still`);
  });
  const sorted = [...serverTimes].sort((a, b) => a - b);
  const secs = o.seconds;
  return {
    options: o,
    perClient: clients.map((c) => ({
      name: c.name,
      corrections: room.memberInfo(c.memberId)?.corrections ?? 0,
      snapshots: c.session.stats.snapshots,
      resyncs: c.session.stats.resyncs,
      downKbps: (c.down.bytes * 8) / secs / 1000,
      upKbps: (c.up.bytes * 8) / secs / 1000,
      rttMs: c.session.rttMs,
      interpDelayMs: c.session.interpDelayMs,
    })),
    room: room.stats,
    serverTickMs: {
      mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p99: sorted[Math.floor(sorted.length * 0.99)],
      max: sorted[sorted.length - 1],
    },
    desyncs,
    starvedRemoteFrames: clients.reduce((n, c) => n + c.session.starvedFrames, 0),
  };
}
