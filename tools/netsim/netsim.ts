// Headless multi-client harness (PLAN §17 Phase 2, §19): one Room and N ClientSessions over a simulated
// network with latency, jitter, TCP-style stalls and client clock drift, all in virtual time so a
// 30-second match runs in about a second and is repeatable from its seed.
import {
  Btn,
  bulletDamage,
  ByteReader,
  ClientSession,
  decodeInput,
  decodeLabTool,
  decodePickLoadout,
  decodePing,
  DT,
  eyePose,
  Msg,
  PawnMode,
  penetrationChain,
  poseHitboxes,
  QUERY_BULLET,
  rayCapsule,
  Room,
  Stance,
  type BodyEntry,
  type GameEvent,
  type InputCmd,
  type ShotResult,
  type SimEvent,
} from "@redmond/shared";
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
    /** All corrections, and those the server caused (damage, respawns, teleports; DECISIONS D-043). */
    corrections: number;
    forced: number;
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

/**
 * A scripted player: changes what it's doing every second or so (moving, sprinting, crouching, leaning,
 * firing, reloading, swapping weapons, switching fire modes), and heads for the middle when crowding.
 */
function bot(rng: Rng, crowd: boolean, home: { x: number; z: number } | null = null) {
  let until = 0;
  let cmd: Omit<InputCmd, "seq"> = { forward: 1, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 };
  let turn = 0;
  /** One-tick presses at the start of a segment. */
  let pulse = 0;
  return (tick: number, pos: { x: number; z: number } | null): Omit<InputCmd, "seq"> => {
    if (tick >= until) {
      until = tick + 32 + Math.floor(rng.next() * 96);
      const r = rng.next();
      cmd = {
        forward: r < 0.8 ? 1 : r < 0.9 ? -1 : 0,
        strafe: rng.next() < 0.3 ? (rng.next() < 0.5 ? -1 : 1) : 0,
        yaw: cmd.yaw,
        pitch: (rng.next() - 0.5) * 0.8,
        buttons: (rng.next() < 0.35 ? Btn.Sprint : 0) | (rng.next() < 0.1 ? Btn.Ads : 0) | (rng.next() < 0.3 ? Btn.Fire : 0),
        stance: rng.next() < 0.12 ? Stance.Crouch : rng.next() < 0.05 ? Stance.Prone : Stance.Stand,
        lean: rng.next() < 0.15 ? (rng.next() < 0.5 ? -1 : 1) : 0,
      };
      pulse = (rng.next() < 0.15 ? Btn.Reload : 0) | (rng.next() < 0.1 ? Btn.Swap : 0) | (rng.next() < 0.05 ? Btn.FireMode : 0);
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
    let out = pulse ? { ...cmd, buttons: cmd.buttons | pulse } : cmd;
    // Spread out: never more than 1.5 m from its own spot, so no two bodies ever touch.
    if (home && pos && Math.hypot(pos.x - home.x, pos.z - home.z) > 1.5) {
      out = { ...out, forward: 1, strafe: 0, yaw: Math.atan2(-(home.x - pos.x), -(home.z - pos.z)) };
    }
    pulse = 0;
    return out;
  };
}

/** Spread-out spots along the open south side of the lab, 6 m apart. */
const spreadSpot = (i: number) => ({ x: -27 + (i % 10) * 6, z: 26 - Math.floor(i / 10) * 4 });

/** The body this member drives is dead on the server. */
function isDead(room: Room, memberId: number): boolean {
  const ctrl = room.sim.controllers.get(room.memberInfo(memberId)?.controllerId ?? 0);
  return ctrl !== undefined && room.sim.pawns.get(ctrl.possessedPawnId)?.state.mode === PawnMode.Dead;
}

export async function runNetsim(partial: Partial<NetsimOptions> = {}): Promise<NetsimReport> {
  const o: NetsimOptions = { ...DEFAULTS, ...partial };
  const rng = new Rng(o.seed);
  const clock = new Clock();
  const room = await Room.create("SIM00", "movement_lab", { lab: true });
  /** Corrections that were real mispredictions (not damage or respawns). */
  const mismatches = (memberId: number) => {
    const i = room.memberInfo(memberId);
    return i ? i.corrections - i.forcedCorrections : 0;
  };
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
      const home = o.spread ? spreadSpot(i) : null;
      return { name, session, down, up, memberId, drift, brain: bot(new Rng(o.seed * 1000 + i), o.crowd, home), nextTickAt: 0, ticks: 0 };
    }),
  );

  function serverReceive(memberId: number, b: Uint8Array) {
    const r = new ByteReader(b.subarray(1));
    if (b[0] === Msg.Input) room.onInput(memberId, decodeInput(r));
    else if (b[0] === Msg.Resync) room.onResync(memberId);
    else if (b[0] === Msg.Ping) room.onPing(memberId, decodePing(r).clientTime);
    else if (b[0] === Msg.LabTool) room.onLabTool(memberId, decodeLabTool(r));
    else if (b[0] === Msg.PickLoadout) room.pickLoadout(memberId, decodePickLoadout(r));
  }

  // Deliver the join messages, then load every client's level.
  clock.runUntil(o.oneWayMs * 3 + o.jitterMs);
  await Promise.all(clients.map((c) => c.session.loaded()));
  const place = (i: number) => room.onLabTool(clients[i].memberId, { kind: "teleport", ...spreadSpot(i), y: 0, yawDeg: 90 * i });
  if (o.spread) clients.forEach((_, i) => place(i));

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
    if (!correctionsAtQuiet && t >= quietFrom) correctionsAtQuiet = clients.map((c) => mismatches(c.memberId));
    if (t === serverNext) {
      const t0 = performance.now();
      room.step();
      serverTimes.push(performance.now() - t0);
      serverNext += tickMs;
      // Bots shoot each other now (Phase 3 M6): the dead come straight back, as with the lab's respawn.
      clients.forEach((c, i) => {
        if (!isDead(room, c.memberId)) return;
        room.onLabTool(c.memberId, { kind: "respawn" });
        if (o.spread) place(i);
      });
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
    const late = mismatches(c.memberId) - (correctionsAtQuiet?.[i] ?? 0);
    if (late > 0) desyncs.push(`${c.name}: ${late} correction(s) while standing still`);
  });
  const sorted = [...serverTimes].sort((a, b) => a - b);
  const secs = o.seconds;
  return {
    options: o,
    perClient: clients.map((c) => ({
      name: c.name,
      corrections: room.memberInfo(c.memberId)?.corrections ?? 0,
      forced: room.memberInfo(c.memberId)?.forcedCorrections ?? 0,
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

// ---------------------------------------------------------------- hit registration (Phase 3, M0)

export interface HitregOptions {
  seconds: number;
  oneWayMs: number;
  jitterMs: number;
  /** Lag-compensation cap for the room (ticks); 0 turns rewinding off (the control run). */
  maxRewindTicks: number;
  seed: number;
  /** Ticks between shots. */
  shotEvery: number;
}

export const HITREG_DEFAULTS: HitregOptions = { seconds: 30, oneWayMs: 50, jitterMs: 10, maxRewindTicks: 16, seed: 1, shotEvery: 20 };

export interface HitregReport {
  options: HitregOptions;
  shots: number;
  /** Shots the server judged (every shot fired should be). */
  judged: number;
  /** The server hit the same pawn and part the shooter's own ray hit on what it drew (both misses count). */
  agree: number;
  /** Shots whose rewind the room's cap shortened, and how many of the others agree. */
  capped: number;
  uncappedAgree: number;
  /** Server-judged headshots (the shooter always aims at a drawn head). */
  headHits: number;
  /**
   * Shots whose damage the server confirmed exactly as the shooter's own view predicts it: the same bodies,
   * zones (penetration rules included) and damage, or a kill.
   */
  damageAgree: number;
  kills: number;
  /** Rewind (server tick − rewound tick) in ms. */
  rewindMs: { mean: number; p95: number; max: number };
  /** Share of shots whose claimed view would be past a 200 ms and a 250 ms cap. */
  over200: number;
  over250: number;
  corrections: number;
  disagreements: string[];
}

type Mode = "strafe" | "sprint" | "lean" | "crouch" | "prone" | "vault";

/** Where each target lives, and the movements it cycles through (6 s each). Facing the shooter or across its view. */
const TARGETS: { home: [number, number, number]; modes: Mode[] }[] = [
  { home: [12, 0, 21], modes: ["strafe", "lean", "crouch"] },
  { home: [9, 0, 25], modes: ["sprint", "prone", "strafe"] },
  { home: [13, 0, 28], modes: ["crouch", "strafe", "lean"] },
  { home: [-6, 0, 9.5], modes: ["vault", "vault", "sprint"] },
];
const SHOOTER: [number, number, number] = [24, 0, 24];
const MODE_TICKS = 384;

function targetInput(mode: Mode, t: number): Omit<InputCmd, "seq"> {
  const base = { forward: 0, strafe: 0, yaw: -Math.PI / 2, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 as -1 | 0 | 1 };
  const flip = (period: number) => (Math.floor(t / period) % 2 === 0 ? 1 : -1);
  switch (mode) {
    case "strafe": // across the shooter's view, back and forth
      return { ...base, strafe: flip(40) };
    case "sprint": // north and south at full sprint
      return { ...base, forward: 1, yaw: flip(48) > 0 ? 0 : Math.PI, buttons: Btn.Sprint };
    case "lean":
      return { ...base, lean: flip(10) as -1 | 1, strafe: flip(64) * 0.5 };
    case "crouch":
      return { ...base, stance: flip(24) > 0 ? Stance.Crouch : Stance.Stand, strafe: flip(56) };
    case "prone": // crawl back and forth, facing north
      return { ...base, yaw: 0, stance: Stance.Prone, forward: t % 192 < 40 ? 0 : flip(70) };
    case "vault": // over the 0.5 m and 0.9 m obstacles at x = −6 and back
      return { ...base, yaw: flip(96) > 0 ? 0 : Math.PI, forward: 1, buttons: Btn.Vault };
  }
}

export async function runHitreg(partial: Partial<HitregOptions> = {}): Promise<HitregReport> {
  const o: HitregOptions = { ...HITREG_DEFAULTS, ...partial };
  const rng = new Rng(o.seed);
  const clock = new Clock();
  const room = await Room.create("HIT00", "movement_lab", { lab: true, maxRewindTicks: o.maxRewindTicks });
  const tickMs = DT * 1000;
  const linkOpts: NetsimOptions = { ...DEFAULTS, oneWayMs: o.oneWayMs, jitterMs: o.jitterMs, stallsPerSecond: 0 };

  interface Expect {
    viewTick: number;
    hit: { pawnId: number; part: string } | null;
    /** What each body hit should take (penetration rules applied to the shooter's own ray). */
    damage: { pawnId: number; zone: string; kill: boolean; amount: number }[];
  }
  /** The server's hit confirmations, by input seq. */
  const confirms = new Map<number, Extract<GameEvent, { kind: "hitConfirm" }>[]>();
  const onEvents = (_tick: number, events: GameEvent[]) => {
    for (const e of events) if (e.kind === "hitConfirm") confirms.set(e.seq, [...(confirms.get(e.seq) ?? []), e]);
  };
  const expected = new Map<number, Expect>();
  const expectedDamage = new Map<number, Expect["damage"]>();
  const report: HitregReport = {
    options: o,
    shots: 0,
    judged: 0,
    agree: 0,
    capped: 0,
    uncappedAgree: 0,
    headHits: 0,
    damageAgree: 0,
    kills: 0,
    rewindMs: { mean: 0, p95: 0, max: 0 },
    over200: 0,
    over250: 0,
    corrections: 0,
    disagreements: [],
  };
  const rewinds: number[] = [];
  const claimed: number[] = [];
  /** The shot our own prediction fired this tick (the sim decides: ammo, reloads, fire rate). */
  let localShot: SimEvent | null = null;

  const onShot = (s: ShotResult) => {
    const e = expected.get(s.seq);
    if (!e) return;
    expected.delete(s.seq);
    report.judged++;
    const capped = s.rewoundTick > s.viewTick + 1e-9;
    if (capped) report.capped++;
    rewinds.push(((s.serverTick - s.rewoundTick) * 1000) / 64);
    claimed.push(((s.serverTick - s.viewTick) * 1000) / 64);
    if (s.hit?.part === "head") report.headHits++;
    const same = (s.hit?.pawnId ?? 0) === (e.hit?.pawnId ?? 0) && (s.hit?.part ?? "") === (e.hit?.part ?? "") && Math.abs(s.viewTick - e.viewTick) < 1e-9;
    if (same) {
      report.agree++;
      if (!capped) report.uncappedAgree++;
    } else if (report.disagreements.length < 20) {
      report.disagreements.push(
        `seq ${s.seq}: server ${s.hit ? `${s.hit.pawnId}/${s.hit.part}` : "miss"} at ${s.viewTick.toFixed(3)}${capped ? ` (capped to ${s.rewoundTick.toFixed(3)})` : ""}, client ${e.hit ? `${e.hit.pawnId}/${e.hit.part}` : "miss"} at ${e.viewTick.toFixed(3)}`,
      );
    }
  };

  const clients = await Promise.all(
    [SHOOTER, ...TARGETS.map((t) => t.home)].map(async (_, i) => {
      let session!: ClientSession;
      let memberId = 0;
      const down = new Link(clock, rng, linkOpts, (b) => session.handle(b));
      const up = new Link(clock, rng, linkOpts, (b) => serverReceive(memberId, b));
      session = new ClientSession({
        send: (b) => up.send(b),
        now: () => clock.now,
        onShot: i === 0 ? onShot : undefined,
        onEvents: i === 0 ? onEvents : undefined,
        onLocalEvents: i === 0 ? (evs) => (localShot = evs.find((e) => e.kind === "shot") ?? localShot) : undefined,
      });
      memberId = room.join(i === 0 ? "shooter" : `target${i}`, { send: (b) => down.send(b), buffered: () => 0 }, i === 0 ? "sledge" : ["mute", "pulse", "sentry", "sledge"][i - 1])!;
      return { session, memberId, nextTickAt: 0, ticks: 0, drift: 1 + ((rng.next() * 2 - 1) * 0.5) / 100 };
    }),
  );
  function serverReceive(memberId: number, b: Uint8Array) {
    const r = new ByteReader(b.subarray(1));
    if (b[0] === Msg.Input) room.onInput(memberId, decodeInput(r));
    else if (b[0] === Msg.Resync) room.onResync(memberId);
    else if (b[0] === Msg.Ping) room.onPing(memberId, decodePing(r).clientTime);
    else if (b[0] === Msg.LabTool) room.onLabTool(memberId, decodeLabTool(r));
  }
  clock.runUntil(o.oneWayMs * 3 + o.jitterMs);
  await Promise.all(clients.map((c) => c.session.loaded()));
  const home = (i: number) => {
    const [x, y, z] = i === 0 ? SHOOTER : TARGETS[i - 1].home;
    room.onLabTool(clients[i].memberId, { kind: "teleport", x, y, z, yawDeg: i === 0 ? 90 : -90 });
  };
  clients.forEach((_, i) => home(i));

  const shooter = clients[0];
  const sim = () => shooter.session.sim!;
  const m = () => sim().data.movement;
  const hb = () => sim().data.hitboxes;
  let aim = { yaw: Math.PI / 2, pitch: 0 };
  let nextTarget = 0;
  const warmup = 2000; // let positions, clocks and interpolation settle
  const startAt = clock.now;
  const endAt = startAt + o.seconds * 1000;
  let serverNext = clock.now;

  /**
   * The shooter's own verdict: its ray against what it drew at `viewTick`, stopped by the level; the first
   * part it enters, and the damage each body should take by the weapon's rules.
   */
  const ownRay = (viewTick: number, origin: [number, number, number], yaw: number, pitch: number, slot: number): Omit<Expect, "viewTick"> => {
    const s = sim();
    const dir: [number, number, number] = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const wall = s.world.castRay(new s.R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] }), 200, true, undefined, QUERY_BULLET);
    const bodies: BodyEntry[] = [];
    for (const id of shooter.session.remoteIds()) {
      const st = shooter.session.remoteAt(id, viewTick);
      if (!st || st.mode === PawnMode.Dead) continue;
      const parts: BodyEntry["parts"] = [];
      for (const h of poseHitboxes(m(), hb(), st)) {
        const t = rayCapsule(origin, dir, h.a, h.b, h.radius);
        if (t !== null && t <= (wall ? wall.timeOfImpact : 200)) parts.push({ part: h.part, t });
      }
      if (parts.length) bodies.push({ id, parts: parts.sort((a, b) => a.t - b.t) });
    }
    bodies.sort((a, b) => a.parts[0].t - b.parts[0].t || a.id - b.id);
    const w = s.pawns.get(shooter.session.ctrl!.possessedPawnId)!.loadout!.weapons[slot];
    const damage = penetrationChain(s.data.combat, w.damage!.penetration, bodies).map((h) => {
      const o = bulletDamage(s.data.combat, w.damage!, h.t, h.zone, { mult: h.mult });
      return { pawnId: h.id, zone: h.zone, kill: o.kill, amount: o.kill ? 0 : o.amount };
    });
    return { hit: bodies[0] ? { pawnId: bodies[0].id, part: bodies[0].parts[0].part } : null, damage };
  };

  while (clock.now < endAt) {
    const nextClient = Math.min(...clients.map((c) => c.nextTickAt));
    const t = Math.min(serverNext, nextClient);
    clock.runUntil(t);
    if (t === serverNext) {
      room.step();
      serverNext += tickMs;
      // Headshots kill now (Phase 3 M6): a dead target comes straight back at its spot.
      for (let i = 1; i < clients.length; i++) {
        if (!isDead(room, clients[i].memberId)) continue;
        report.kills++;
        room.onLabTool(clients[i].memberId, { kind: "respawn" });
        home(i);
      }
    }
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      if (c.nextTickAt > t) continue;
      c.nextTickAt = t + tickMs * c.drift * c.session.tickScale();
      if (c.ticks % 64 === 0) c.session.ping();
      if (!c.session.ready) continue;
      const tick = c.ticks++;
      if (i > 0) {
        const modes = TARGETS[i - 1].modes;
        if (tick > 0 && tick % MODE_TICKS === 0) home(i); // back to its spot for the next movement
        c.session.tick(targetInput(modes[Math.floor(tick / MODE_TICKS) % modes.length], tick % MODE_TICKS));
        c.session.frame();
        continue;
      }
      // The shooter: looks at the frame it draws, and on a shot tick aims at a drawn head and fires.
      const renderTick = c.session.frame();
      let fire = false;
      if (clock.now - startAt > warmup && tick % o.shotEvery === 0) {
        const ids = c.session.remoteIds();
        const id = ids[nextTarget++ % ids.length];
        const st = id !== undefined ? c.session.remoteAt(id, renderTick) : null;
        const head = st && st.mode !== PawnMode.Dead ? poseHitboxes(m(), hb(), st).find((h) => h.part === "head") : undefined;
        if (head) {
          const me = sim().pawns.get(c.session.ctrl!.possessedPawnId)!.state;
          const eye = eyePose(m(), hb(), me).pos;
          const tgt = [(head.a[0] + head.b[0]) / 2, (head.a[1] + head.b[1]) / 2, (head.a[2] + head.b[2]) / 2];
          const d = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]];
          aim = { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) };
          fire = true;
        }
      }
      localShot = null;
      // Aiming down sights the whole time: a rifle's ADS spread is 0, so the shot goes exactly where it aims.
      c.session.tick({ forward: 0, strafe: 0, yaw: aim.yaw, pitch: aim.pitch, buttons: Btn.Ads | (fire ? Btn.Fire : 0), stance: Stance.Stand, lean: 0 }, renderTick);
      const shot = localShot as SimEvent | null;
      if (shot?.kind === "shot") {
        report.shots++;
        const viewTick = c.session.lastViewTick;
        const e = { viewTick, ...ownRay(viewTick, shot.origin, shot.yaw, shot.pitch, shot.slot) };
        expected.set(shot.seq & 0xffff, e);
        expectedDamage.set(shot.seq & 0xffff, e.damage);
      }
    }
  }
  clock.runUntil(clock.now + 500);
  for (const [seq, want] of expectedDamage) {
    const got = confirms.get(seq) ?? [];
    const same =
      got.length === want.length &&
      want.every((w, k) => {
        const g = got[k];
        // HitConfirm reports the health removed: all of it on a kill, or a lethal amount.
        return g.victimPawn === w.pawnId && g.zone === w.zone && (w.kill ? g.killed : g.killed ? g.damage <= w.amount : g.damage === w.amount);
      });
    if (same) report.damageAgree++;
    else if (report.disagreements.length < 20) report.disagreements.push(`seq ${seq} damage: server ${JSON.stringify(got.map((g) => [g.victimPawn, g.zone, g.damage, g.killed]))}, client ${JSON.stringify(want)}`);
  }
  const sorted = [...rewinds].sort((a, b) => a - b);
  report.rewindMs = { mean: sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length), p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, max: sorted.at(-1) ?? 0 };
  report.over200 = claimed.filter((v) => v > 200 + 1e-6).length / Math.max(1, claimed.length);
  report.over250 = claimed.filter((v) => v > 250 + 1e-6).length / Math.max(1, claimed.length);
  report.corrections = room.memberInfo(shooter.memberId)?.corrections ?? 0;
  return report;
}
