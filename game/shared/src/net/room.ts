// A match room: the authoritative simulation plus everyone connected to it (PLAN §5). Transport-free, so
// the Node server, the netsim harness and (later) offline Practice in a Web Worker all run this same code.
import { DT, TICK_HZ } from "../core/constants.js";
import { applyDamage, isIdleShell, type Damage } from "../combat/apply.js";
import { shotOnBodies, tracePellets, type ShotOnBody } from "../combat/hitreg.js";
import type { ModeData } from "../data/schemas.js";
import { spawnAmmo, type Pawn, type PlayerController } from "../player/pawn.js";
import { PawnMode, type InputCmd, type PawnState } from "../player/types.js";
import { Sim } from "../sim.js";
import { ByteWriter, fnv1a } from "./bytes.js";
import { HitboxHistory, SentRing } from "./lagComp.js";
import { controllerState, writeControllerState, writePawnState } from "./pawnState.js";
import type { SimEvent } from "../weapons/step.js";
import { defaultLoadoutPick, resolveLoadout, type LoadoutPick } from "../weapons/loadout.js";
import { hash4, pelletDirections } from "../weapons/spread.js";
import { sideTeam } from "../sim.js";
import { Cause, encodeEvents, type GameEvent } from "./events.js";
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
/**
 * Default longest rewind for lag compensation (PLAN §5 says ~200 ms; DECISIONS D-045): 250 ms, because the
 * rewind is round trip + interpolation delay, which at 100 ms round trip is already 160–250 ms. A room
 * option, so tests and later match modes can set their own.
 */
export const DEFAULT_MAX_REWIND_TICKS = 0.25 * TICK_HZ;
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
}

/** A shot judged against the world as its shooter saw it, waiting to be applied with the rest of the tick's. */
interface JudgedShot {
  m: Member;
  ctrlId: number;
  team: number;
  seq: number;
  weaponId: string;
  receivedTick: number;
  rewoundTick: number;
  origin: [number, number, number];
  bodies: ShotOnBody[];
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
  };
  /** Damage rules (friendly fire): the lab mode preset until match modes arrive (Phase 6). */
  readonly rules: ModeData;
  /** Shots judged this tick, applied together at its end (DECISIONS D-044). */
  private judged: JudgedShot[] = [];

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
    };
    this.members.set(m.id, m);
    this.spawn(m);
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

  onLabTool(memberId: number, tool: LabTool): void {
    const m = this.members.get(memberId);
    if (!m || !m.ctrl || !this.lab) return;
    if (tool.kind === "respawn" || tool.kind === "team") {
      if (tool.kind === "team") m.team = tool.team;
      this.spawn(m);
      this.broadcastRoster(); // new pawn ids: everyone (the respawned client too) needs them
    } else if (tool.kind === "damage") {
      // Only your own bodies (try damage, death and the indicators alone); dummies join in M10.
      const pawn = m.ctrl.pawnIds.includes(tool.pawnId) ? this.sim.pawns.get(tool.pawnId) : undefined;
      if (pawn) this.hurt(pawn, { amount: tool.amount, kill: tool.kill }, { cause: Cause.Lab, attacker: null, headshot: false });
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
  private judgeShot(m: Member, applied: QueuedInput, shot: Extract<SimEvent, { kind: "shot" }>) {
    const shooter = this.sim.pawns.get(shot.pawnId);
    const w = shooter?.loadout?.weapons[shot.slot];
    if (!m.ctrl || !shooter || !w?.damage) return;
    const now = applied.receivedTick;
    const leastLag = Math.min(...m.lags);
    const snapTick = Math.max(Math.min(now, unwrap16(applied.snapTick, now)), now - leastLag - LAG_SLACK_TICKS);
    const viewTick = snapTick - Math.min(MAX_VIEW_BACK_TICKS, applied.viewBackQ8 / 256);
    const rewoundTick = HitboxHistory.rewound(viewTick, now, this.maxRewindTicks);
    const origin = shot.origin;
    const dirs = pelletDirections(this.seed, m.ctrl.id, shot.seq, shot.pellets, shot.yaw, shot.pitch, shot.cone);
    // Your own bodies and the dead don't stop bullets.
    const ignore = new Set(m.ctrl.pawnIds);
    for (const p of this.sim.pawns.values()) if (p.state.mode === PawnMode.Dead) ignore.add(p.id);
    const paths = tracePellets(this.sim, this.history, origin, dirs, rewoundTick, w.damage.penetration, ignore, m.sent);
    const bodies = shotOnBodies(this.sim.data.combat, w.damage, paths, (id) => {
      const v = this.sim.pawns.get(id)!;
      return { scale: v.team === shooter.team ? this.rules.friendlyFire.scale : 1, idleShell: isIdleShell(this.sim, v) };
    });
    this.stats.shots++;
    if (rewoundTick > viewTick) this.stats.cappedShots++;
    this.judged.push({ m, ctrlId: m.ctrl.id, team: shooter.team, seq: shot.seq, weaponId: w.id, receivedTick: now, rewoundTick, origin, bodies });
    // Everyone sees and hears it (the shooter's own client draws its flash itself, but not where pellets went).
    const ends = paths.map((p): [number, number, number] => [origin[0] + p.dir[0] * p.end, origin[1] + p.dir[1] * p.end, origin[2] + p.dir[2] * p.end]);
    for (const other of this.members.values()) other.events.push({ kind: "shotFx", pawnId: shooter.id, slot: shot.slot, suppressed: w.suppressed, ends });
    if (!this.lab) return;
    // Lab rooms: the shooter's readout of the first pellet (what it entered first, how far it rewound).
    const p0 = paths[0];
    m.client.send(
      encodeShotResult({
        seq: shot.seq & 0xffff,
        origin,
        dir: p0.dir,
        viewTick,
        rewoundTick,
        serverTick: now,
        hit: p0.first && { pawnId: p0.first.pawnId, part: p0.first.part, distance: p0.first.t },
        wallDistance: p0.wall !== null && !p0.first ? p0.wall : null,
      }),
    );
  }

  /**
   * Apply the tick's judged shots (DECISIONS D-044): all of them were judged first, so two players who shoot
   * each other in the same tick both land; then they apply in a fixed order (rewound time, arrival, shooter,
   * input) to the bodies as they are now. A shot on a body already dead does nothing.
   */
  private resolveShots() {
    const shots = this.judged.sort((a, b) => a.rewoundTick - b.rewoundTick || a.receivedTick - b.receivedTick || a.ctrlId - b.ctrlId || a.seq - b.seq);
    this.judged = [];
    for (const shot of shots) {
      for (const body of shot.bodies) {
        const victim = this.sim.pawns.get(body.pawnId);
        if (!victim || victim.state.mode === PawnMode.Dead) continue;
        const friendly = victim.team === shot.team;
        if (friendly && !this.rules.friendlyFire.actionPhase) continue; // team damage off: no damage, no marker
        const by = { cause: Cause.Bullet, attacker: shot, headshot: body.headshot };
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
          killed: r.outcome === "killed",
          friendly,
          damage: r.removed,
          pellets: body.pellets,
          hpAfter: this.lab ? victim.state.hp : null,
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
    const r = applyDamage(this.sim, victim, d);
    if (r.outcome === "ignored") return r;
    const owner = victim.ownerId !== null ? this.memberOf(victim.ownerId) : null;
    if (owner) {
      this.force(owner);
      owner.events.push({ kind: "damageTaken", pawnId: victim.id, amount: r.removed, cause: by.cause, attackerCtrl: by.attacker?.ctrlId ?? 0, from: by.attacker?.origin ?? null });
    }
    if (r.outcome === "killed") this.announceDeath(victim, by.attacker?.ctrlId ?? 0, by.attacker?.weaponId ?? "", by.cause, by.headshot, by.attacker !== null && victim.team === by.attacker.team);
    return r;
  }

  private announceDeath(victim: Pawn, killerCtrl: number, weapon: string, cause: Cause, headshot: boolean, friendly: boolean) {
    this.stats.kills++;
    const ownerCtrl = victim.ownerId ?? 0;
    const e: GameEvent = isIdleShell(this.sim, victim)
      ? { kind: "shellDestroyed", pawnId: victim.id, ownerCtrl, killerCtrl, weapon, headshot }
      : { kind: "kill", victimPawn: victim.id, victimCtrl: ownerCtrl, killerCtrl, weapon, cause, headshot, friendly };
    for (const m of this.members.values()) m.events.push(e);
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
    return [...this.members.values()]
      .filter((m) => m.ctrl)
      .map((m) => ({ controllerId: m.ctrl!.id, name: m.name, operatorId: m.ctrl!.operatorId, pawnIds: [...m.ctrl!.pawnIds], team: m.team, kind: 0, loadout: m.pick }));
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

  /**
   * After stepping an input: judge the prediction made with it (only if made after our latest correction,
   * and not while one is already on its way: a body the server just changed can't have been predicted).
   */
  private afterInput(m: Member, applied: QueuedInput) {
    if (m.ctrl && !m.needCorrection && applied.epoch === (m.epoch & 0xff) && predictionHash(this.sim, m.ctrl) !== applied.predictedHash) m.needCorrection = true;
  }

  /**
   * Judge the shots of the step just taken (`applied` is each member's input in that step), and report the
   * bodies the step itself killed (falls): `alive` is who was alive before it.
   */
  private judgeEvents(applied: ReadonlyMap<number, { m: Member; input: QueuedInput }>, alive: ReadonlySet<number>) {
    for (const e of this.sim.events) {
      if (e.kind !== "shot") continue;
      const owner = this.sim.pawns.get(e.pawnId)?.ownerId;
      const a = owner !== undefined && owner !== null ? applied.get(owner) : undefined;
      // Shots only come from real inputs (weapons/step.ts), so the input is always there.
      if (a) this.judgeShot(a.m, a.input, e);
    }
    for (const id of alive) {
      const p = this.sim.pawns.get(id);
      if (p?.state.mode === PawnMode.Dead) this.announceDeath(p, 0, "", Cause.Fall, false, false);
    }
  }

  private aliveIds(): Set<number> {
    const out = new Set<number>();
    for (const p of this.sim.pawns.values()) if (p.state.mode !== PawnMode.Dead) out.add(p.id);
    return out;
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
    let alive = this.aliveIds();
    this.sim.step(inputs, active, true);
    const applied = new Map<number, { m: Member; input: QueuedInput }>();
    for (const m of this.members.values()) {
      if (!m.applied || !m.ctrl) continue;
      this.afterInput(m, m.applied);
      applied.set(m.ctrl.id, { m, input: m.applied });
    }
    this.judgeEvents(applied, alive);
    // Catch up after a stall: one extra input for a client that has a backlog and banked credit.
    for (const m of this.members.values()) {
      if (!m.ctrl || m.queue.length <= TARGET_QUEUE || m.credit < 1) continue;
      const extra = this.take(m)!;
      alive = this.aliveIds();
      this.sim.step(new Map([[m.ctrl.id, extra.cmd]]), new Set([m.ctrl.id]));
      this.afterInput(m, extra);
      this.judgeEvents(new Map([[m.ctrl.id, { m, input: extra }]]), alive);
    }
    this.resolveShots();
    this.history.record();
    this.stats.ticks++;
    if (this.sim.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
    this.flushEvents();
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
