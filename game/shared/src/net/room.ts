// A match room: the authoritative simulation plus everyone connected to it (PLAN §5). Transport-free, so
// the Node server, the netsim harness and (later) offline Practice in a Web Worker all run this same code.
import { DT, TICK_HZ } from "../core/constants.js";
import { DEG, forwardXZ, wrapAngle, type Vec3 } from "../core/math.js";
import { applyDamage, Cause, isIdleShell, type Damage } from "../combat/apply.js";
import { shotOnBodies, tracePellets, type ShotOnBody } from "../combat/hitreg.js";
import { judgeMelee } from "../combat/melee.js";
import { DeployKind } from "../destruction/deploy.js";
import { PanelHistory } from "../destruction/history.js";
import { explosiveOps, explosiveReach } from "../destruction/explosives.js";
import { meleeOnPanels } from "../destruction/hits.js";
import { L_STEEL, type PanelChange, type PanelOp } from "../destruction/panel.js";
import type { IndexedOp } from "../destruction/panels.js";
import type { BlastData, BotLevel, DummyDef, GadgetData, ModeData } from "../data/schemas.js";
import { Bot, type BotWorld } from "../bots/bot.js";
import { NavWorld } from "../bots/nav/world.js";
import { TeamBoard } from "../bots/perceive.js";
import { AttackPlanner, DefensePlanner } from "../bots/plan.js";
import { BotRng } from "../bots/rng.js";
import { DUMMY_STANCE, dummyInput } from "../lab/dummies.js";
import { spawnAmmo, type Pawn, type PlayerController } from "../player/pawn.js";
import { eyePose } from "../player/hitboxes.js";
import { currentHeight } from "../player/stance.js";
import { knockShield, shieldHit, shieldUp } from "../player/shield.js";
import { Btn, GadgetAct, Hand, PawnKind, PawnMode, type InputCmd, type PawnState } from "../player/types.js";
import { Sim } from "../sim.js";
import { ByteWriter, fnv1a } from "./bytes.js";
import { HitboxHistory, rayCapsule, SentRing } from "./lagComp.js";
import { controllerState, writeControllerState, writePawnState } from "./pawnState.js";
import type { SimEvent } from "../weapons/step.js";
import { defaultLoadoutPick, resolveLoadout, type LoadoutPick } from "../weapons/loadout.js";
import { hash4, pelletDirections, viewDir } from "../weapons/spread.js";
import { QUERY_FLASH, QUERY_SIGHT } from "../physics/rapier.js";
import { sideTeam } from "../sim.js";
import { encodeEvents, type GameEvent } from "./events.js";
import { MatchDirector, type DirectorHost } from "./matchDirector.js";
import type { LobbyAction, MatchAction, RoomListEntry } from "./matchWire.js";
import { ATTACK, DEFENSE, isFormat, type FormatMode, type Side, type Team } from "../match/rules.js";
import { Phase } from "../match/match.js";
import { camerasOnRay } from "../intel/cameras.js";
import { raycastLevel } from "../level/raycast.js";
import { dartBurst } from "../intel/bpCamera.js";
import { bpCamsBroken, gadgetOnRay } from "../gadgets/hits.js";
import { mirrorOf, sightPast } from "../gadgets/mirror.js";
import { hackTargetFor, hackTargetPos, kludgeOf, type HackTarget, type KludgeData } from "../gadgets/hack.js";
import { pawnJammed, pointJammed } from "../gadgets/jammers.js";
import { heartOf } from "../gadgets/sensor.js";
import { GadgetServer, type IngredientStage } from "../gadgets/serve.js";
import { blastEffects, isCloud, pawnDistance } from "../gadgets/blast.js";
import { hammerOps } from "../gadgets/hammer.js";
import { zoneOf } from "../combat/damage.js";
import { barrierOf, smokeOnSegment, crossesBarrier } from "../gadgets/areas.js";
import { isIngredient, kindId, kindOf } from "../gadgets/kinds.js";
import { GFlag, type Gadget } from "../gadgets/table.js";
import { deviceLost, emptySlots, slotGadget, stockSlots } from "../gadgets/hands.js";
import { encodeGadgetOps, encodeGadgetState } from "./gadgetWire.js";
import { ticks, ticksOrZero } from "../weapons/ticks.js";
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
  /**
   * A bot's brain (Phase 9, bots/DESIGN.md §1), or null: a person. A bot's client sends nothing and drops what it's
   * sent: its brain queues its input each tick, the room never predicts or corrects it, and its events go to the brain.
   */
  bot: Bot | null;
  /** What a bot reads and does through the room (made once with it). */
  botWorld?: BotWorld;
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
  /** Stepped without input since the last input applied (one stall, however many ticks). */
  stalled: boolean;
  /**
   * Intel (Phase 7): the tick of the last ping and callout, how long Fire has been held on a drone or camera, and
   * whether the gadget key was down (a Bulletproof Camera's dart fires on its press).
   */
  lastPing: number;
  lastPingDanger: boolean;
  lastCallout: number;
  scanTicks: number;
  gadgetHeld: boolean;
  /** A Kludge drone's hack under way (Phase 8 M8): which Kludge, on what, how many ticks it has run. */
  hack: { kludge: number; target: HackTarget; ticks: number } | null;
  /** Fire held since a hack ended: it's let go before the next starts. */
  hackHeld: boolean;
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
  /**
   * Panel ops go out with snapshots (D-066): how many of the ops waiting to go this member already has (a
   * panel state sent since covers them), and ops held back with a snapshot it wasn't sent (null: too many to
   * send as ops; it gets the panels' whole state with its next snapshot instead).
   */
  opsHad: number;
  opsHeld: IndexedOp[] | null;
  /**
   * The gadget table (Phase 8): when we last sent it whole because it asked, and whether it missed ops with a snapshot
   * it wasn't sent (it gets the whole table with its next one).
   */
  gadgetStateAt: number;
  gadgetsStale: boolean;
}

/** A bot's "connection" (Phase 9): nothing is ever sent down it. */
const NO_CLIENT: RoomClient = { send() {}, buffered: () => 0 };

/** More ops than this held back for one client: send it the panels' state instead (a message carries at most 4096). */
const MAX_HELD_OPS = 2048;

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
  /** Each body's life when the shot was judged (Pawn.life): a body back in a new life by the time it applies is spared. */
  lives: Map<number, number>;
  /** What it did to panels (holes, wear), in order: applied with its damage. */
  panelOps: IndexedOp[];
}

/** Who hurt a body, as the kill feed and the damage indicator tell it: a shot, the knife, or a gadget's blast. */
type Attacker = Pick<JudgedShot, "ctrlId" | "team" | "weaponId" | "origin">;
/** The team of what belongs to nobody (the level's ingredients, Phase 8 M3): never friendly to anyone. */
const NEUTRAL = 2;
type StunData = NonNullable<GadgetData["stun"]>;
type JegeoData = NonNullable<GadgetData["jegeo"]>;

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

export class Room implements DirectorHost {
  readonly history: HitboxHistory;
  /** Recent panel changes: shots are judged against the panels as their shooter had them (destruction/history.ts). */
  panelHistory = new PanelHistory();
  /** Panel ops from between ticks (lab tools), applied with the next tick's. */
  private queuedOps: IndexedOp[] = [];
  /** Panel ops applied since the last snapshot, sent to everyone just ahead of the next one. */
  private unsentOps: IndexedOp[] = [];
  private readonly members = new Map<number, Member>();
  private nextMemberId = 1;
  /** Its step threw, and it closed (fail()). */
  private failed = false;
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
    /**
     * Stalls: a body stepped on without input once its hold budget ran out (D-048), counted once however
     * many ticks it lasts. Each costs its player at most one correction (a forced one: its next prediction
     * misses unless the steps changed nothing).
     */
    stalls: 0,
    skippedSnapshots: 0,
    shots: 0,
    cappedShots: 0,
    hits: 0,
    kills: 0,
    /** Panel ops applied (holes, wear, reinforcements). */
    panelOps: 0,
    /** Panel states sent because a client's panels disagreed. */
    panelResyncs: 0,
    gadgetResyncs: 0,
  };
  /** The lab preset: a lab room's damage rules. */
  private readonly labRules: ModeData;
  /** A match room's match (Phase 6); null in a lab room. */
  readonly director: MatchDirector | null;
  /** The gadget table's server side (Phase 8, gadgets/serve.ts): events into entries, flights, fuses. */
  readonly gadgetServer: GadgetServer;
  /** Shots judged this tick, applied together at its end (DECISIONS D-044). */
  private judged: JudgedShot[] = [];
  /** Bots' navigation (Phase 9 M2): made with the first bot, kept up with the walls and gadgets each tick. */
  nav: NavWorld | null = null;
  /** What each team's bots have seen, shared among them (Phase 9 M3: voice comms). */
  readonly botBoards: [TeamBoard, TeamBoard] = [new TeamBoard(), new TeamBoard()];
  /** The defending bots' planner this round (Phase 9 M4), made as prep starts; the round it's for. */
  defensePlan: DefensePlanner | null = null;
  /** The attacking bots' planner this round (Phase 9 M5). */
  attackPlan: AttackPlanner | null = null;
  private planRound = -1;
  /**
   * Who downed each body that is down now, and in which of its lives (Pawn.life): they get the kill when it
   * dies (research/core_mechanics.md §10.2). A body that came back since (a teleport, the kill plane in the
   * middle of a step, a respawn) is in a new life, and the entry no longer counts.
   */
  private readonly downedBy = new Map<number, { ctrl: number; weapon: string; life: number }>();

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
    format: FormatMode | null,
  ) {
    this.history = new HitboxHistory(sim, 32);
    this.gadgetServer = new GadgetServer(sim, (g, at) => this.goOff(g, at));
    // Phase 8 M3: wire and fire hurt over time, alarms sound, ingredients go through their stages; no alarm outdoors in prep.
    this.gadgetServer.hurt = (g, pawn, amount) => this.gadgetHurt(g, pawn, amount);
    this.gadgetServer.onAlarm = (g, by) => this.alarm(g, by);
    // A Gu needle (Phase 8 M10) changes the body: its owner's next correction carries it.
    this.gadgetServer.onNeedle = (pawn) => {
      const owner = pawn.ownerId !== null ? this.memberOf(pawn.ownerId) : null;
      if (owner) this.force(owner);
    };
    this.gadgetServer.onIngredient = (g, stage) => this.ingredientStage(g, stage);
    this.gadgetServer.inPrep = () => this.director?.match.phase === Phase.Prep;
    // Phase 8 M5: a cluster charge's hole goes in with this tick's panel ops.
    this.gadgetServer.cut = (ops) => {
      for (const o of ops) this.queuePanelOp(o.panel, o.op);
    };
    // A remote device gone without its detonator (destroyed, cleared): its owner has one fewer waiting; told at once.
    this.gadgetServer.onLost = (g, d) => {
      const c = sim.controllers.get(g.owner);
      const owner = c ? this.memberOf(c.id) : null;
      for (const id of c?.pawnIds ?? []) {
        const p = sim.pawns.get(id);
        if (p && deviceLost(sim.data, p, d.id)) {
          if (owner) this.force(owner);
          return;
        }
      }
    };
    this.labRules = sim.data.modes.get("lab")!;
    this.director = format ? new MatchDirector(this, format, seed) : null;
    // Reinforcing and barricades (Phase 4 M6): each team's pool; lab rooms let attackers do it too, and let
    // defenders rappel (Phase 5 M8). A match sets its pools each round (prep).
    const r = this.rules;
    sim.deployRules = { anyone: r.defenderToolsForAll, rappel: r.attackerToolsForAll, pools: this.director ? [0, 0] : [r.reinforcements, r.reinforcements] };
    // A revive cut by what another body did (left, respawned, jumped, went down or died): the other side's
    // owner couldn't predict it.
    sim.onReviveCut = (p) => {
      const owner = p.ownerId !== null ? this.memberOf(p.ownerId) : null;
      if (owner) this.force(owner);
    };
    if (lab) for (const def of sim.level.def.dummies) this.addDummy(def);
    this.placeIngredients();
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

  /**
   * `seed`: the server passes a cryptographic one; tests pass a fixed one. `format`: a match room running this
   * format (a data/modes id with match rules), in its lobby.
   */
  static async create(code: string, levelId: string, opts: { lab?: boolean; maxRewindTicks?: number; seed?: number; format?: string } = {}): Promise<Room> {
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
    const sim = await Sim.create(levelId);
    let format: FormatMode | null = null;
    if (opts.format !== undefined) {
      const m = sim.data.modes.get(opts.format);
      if (!m || !isFormat(m)) throw new Error(`"${opts.format}" is not a match format`);
      format = m;
    }
    return new Room(code, sim, levelId, (opts.lab ?? false) && !format, opts.maxRewindTicks ?? DEFAULT_MAX_REWIND_TICKS, seed >>> 0, format);
  }

  /** The damage rules: the match's format (with the host's changes), or the lab preset. */
  get rules(): ModeData {
    return this.director?.mode ?? this.labRules;
  }

  /** Team damage now: the match's rule for the phase, or a lab's action-phase rule. */
  private friendlyFireOn(): boolean {
    return this.director ? this.director.friendlyFireOn() : this.rules.friendlyFire.actionPhase;
  }

  /** The room-list entry of a listed match room, else null. */
  listing(): RoomListEntry | null {
    return this.director?.listing() ?? null;
  }

  /** People connected (bots aren't counted: a room with only bots in it is empty, and the server drops it). */
  get size(): number {
    return this.people;
  }

  /**
   * Add a connection. Returns its member id, or null (with an error sent) if the room is full. In a lab room the
   * member gets a body at once; in a match room they join the match (its lobby, or a team mid-match) with none.
   */
  join(name: string, client: RoomClient, operatorId = "sledge"): number | null {
    // A person takes a bot's place in a full lobby (the lobby's sizes then put the bots right).
    if (this.members.size >= MAX_ROOM_PLAYERS && this.director?.match.phase === Phase.Lobby) {
      const bot = [...this.members.values()].reverse().find((b) => b.bot);
      if (bot) this.removeBot(bot.id);
    }
    if (this.members.size >= MAX_ROOM_PLAYERS) {
      client.send(encodeError(ErrorCode.RoomFull, `Room ${this.code} is full`));
      return null;
    }
    if (!this.sim.data.operators.has(operatorId)) operatorId = "sledge";
    const m = this.newMember(this.nextMemberId++, name || "Player", client, operatorId);
    if (this.director && !this.director.join(m.id, m.name)) {
      client.send(encodeError(ErrorCode.RoomFull, `Room ${this.code}'s teams are full`));
      return null;
    }
    this.members.set(m.id, m);
    if (!this.director) this.spawn(m);
    client.send(encodeWelcome({ roomCode: this.code, tick: this.sim.tick, levelId: this.levelId, controllerId: m.ctrl?.id ?? 0 }));
    client.send(encodePanelState(this.sim.level.panels)); // the walls as they are now (ops waiting to go included); every later op follows
    client.send(encodeGadgetState(this.sim.gadgets.list)); // the gadgets too (the ops waiting to go are already in it, and redo nothing)
    m.events.push(this.deployRulesEvent());
    this.broadcastRoster();
    this.director?.syncBots();
    return m.id;
  }

  /**
   * A bot (Phase 9) on a match team, at a difficulty: a member with no connection, named from the callsigns no bot
   * here has. Null when the room or the team is full.
   */
  addBot(team: Team, level: BotLevel): number | null {
    if (this.members.size >= MAX_ROOM_PLAYERS) return null;
    const id = this.nextMemberId++;
    const names = this.sim.data.bots.names;
    const used = new Set([...this.members.values()].map((m) => m.name));
    const free = names.filter((n) => !used.has(`BOT ${n}`));
    const name = `BOT ${new BotRng(this.seed, id).pick(free.length ? free : names)}`;
    this.nav ??= new NavWorld(this.sim);
    const m: Member = { ...this.newMember(id, name, NO_CLIENT), bot: new Bot(id, level, this.seed) };
    m.botWorld = this.botWorld(m);
    if (this.director) {
      if (!this.director.seatBot(id, name, team, level)) return null;
      this.members.set(id, m);
    } else {
      // A lab room (tests, a lab page): a body at once, the side's first operator.
      const op = [...this.sim.data.operators.values()].find((o) => sideTeam(o.side) === team)!;
      m.pick = defaultLoadoutPick(this.sim.data, op.id);
      m.team = team;
      this.members.set(id, m);
      this.spawn(m);
    }
    this.broadcastRoster();
    return id;
  }

  /** A bot member's brain (tests, the overlay), or null. */
  botOf(memberId: number): Bot | null {
    return this.members.get(memberId)?.bot ?? null;
  }

  /** Take a bot out of the room (the lobby's sizes shrank, a person took its place, the host removed it). */
  removeBot(memberId: number): void {
    if (this.members.get(memberId)?.bot) this.leave(memberId);
  }

  /** People connected (bots aren't): the server drops a room nobody is in. */
  get people(): number {
    let n = 0;
    for (const m of this.members.values()) if (!m.bot) n++;
    return n;
  }

  /** A member's starting state (a person's connection, or a bot's dead end). */
  private newMember(id: number, name: string, client: RoomClient, operatorId = "sledge"): Member {
    return {
      id,
      name,
      client,
      bot: null,
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
      stalled: false,
      lastPing: -1e9,
      lastPingDanger: false,
      lastCallout: -1e9,
      scanTicks: 0,
      gadgetHeld: false,
      hack: null,
      hackHeld: false,
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
      opsHad: this.unsentOps.length,
      opsHeld: [],
      gadgetStateAt: -Infinity,
      gadgetsStale: false,
    };
  }

  leave(memberId: number): void {
    const m = this.members.get(memberId);
    if (!m) return;
    if (this.failed) return void this.members.delete(memberId); // nothing more to tell anyone
    this.director?.leave(memberId);
    if (m.ctrl) this.sim.removePlayer(m.ctrl.id);
    this.members.delete(memberId);
    this.broadcastRoster();
    // A person leaving the lobby frees a place a bot may take (bots leaving don't start this again).
    if (!m.bot) this.director?.syncBots();
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
    // A match room: this round's pick, which the body carries when it spawns.
    if (this.director) return this.director.pick(memberId, pick);
    m.pick = resolveLoadout(this.sim.data, pick).loadout.pick;
    m.team = sideTeam(op.side);
    this.spawn(m);
    this.broadcastRoster();
  }

  /** An operator with their default loadout. */
  pickOperator(memberId: number, operatorId: string): void {
    if (this.sim.data.operators.has(operatorId)) this.pickLoadout(memberId, defaultLoadoutPick(this.sim.data, operatorId));
  }

  /** A lobby choice (match rooms; a lab room has no lobby). */
  onLobby(memberId: number, a: LobbyAction): void {
    if (this.members.has(memberId)) this.director?.lobby(memberId, a);
  }

  /** A round's choice (match rooms). */
  onMatchAction(memberId: number, a: MatchAction): void {
    if (this.members.has(memberId)) this.director?.action(memberId, a);
  }

  private spawn(m: Member, spawnIndex = 0) {
    // An attacker's drones (Phase 7) outlive the body: prep's pilot stands up at action start with them.
    const drones = m.ctrl ? this.sim.dronesOf(m.ctrl) : [];
    if (m.ctrl) {
      m.ctrl.pawnIds = m.ctrl.pawnIds.filter((id) => !drones.some((d) => d.id === id));
      this.sim.removePlayer(m.ctrl.id);
    }
    m.ctrl = null; // until the new body stands (addPlayer throws when there's no room for it)
    try {
      m.ctrl = this.sim.addPlayer(m.name, m.pick.operator, spawnIndex, undefined, m.pick, m.team);
    } catch (e) {
      for (const d of drones) this.sim.removePawn(d.id);
      throw e;
    }
    for (const id of m.ctrl.pawnIds) this.sim.pawns.get(id)!.state.rng = hash4(this.seed, id, 0x5eed, 1) || 1;
    for (const d of drones) {
      d.ownerId = m.ctrl.id;
      m.ctrl.pawnIds.push(d.id);
    }
    // Brava's Kludge drones (Phase 8 M8) come with her body (prep's pilot has only her drones).
    const kludge = slotGadget(this.sim.data, this.sim.pawns.get(m.ctrl.possessedPawnId)?.loadout ?? null, 2);
    if (kludge?.kludge && !drones.some((d) => d.kludge)) for (let i = 0; i < kludge.count; i++) this.sim.addDrone(m.ctrl.id, undefined, true);
    m.queue = [];
    this.force(m);
    m.newBody = m.bot === null;
    m.credit = 0;
    m.held = 0;
    m.stalled = false;
  }

  // ------------------------------------------------------------------ for the match director (DirectorHost)

  bodyOf(memberId: number): PlayerController | null | undefined {
    return this.members.get(memberId)?.ctrl;
  }

  spawnBody(memberId: number, pick: LoadoutPick, spawnIndex: number, side: Side): void {
    const m = this.members.get(memberId);
    if (!m) return;
    m.pick = resolveLoadout(this.sim.data, pick).loadout.pick;
    m.team = side;
    this.spawn(m, spawnIndex);
  }

  spawnPilot(memberId: number, pick: LoadoutPick | null, spawnIndex: number, side: Side): void {
    const m = this.members.get(memberId);
    if (!m) return;
    if (pick) m.pick = resolveLoadout(this.sim.data, pick).loadout.pick; // this round's operator, in prep already
    if (m.ctrl) {
      for (const id of m.ctrl.pawnIds) this.downedBy.delete(id);
      this.sim.removePlayer(m.ctrl.id);
    }
    m.team = side;
    m.ctrl = this.sim.addPilot(m.name, m.pick.operator, side);
    for (let i = 0; i < this.sim.data.intel.drone.perAttacker; i++) this.sim.addDrone(m.ctrl.id);
    const spawns = this.sim.level.def.spawns;
    const sp = spawns[spawnIndex % spawns.length];
    const first = this.sim.dronesOf(m.ctrl)[0];
    if (first) this.sim.placeDrone(first.id, sp.pos[0], sp.pos[1] + 0.02, sp.pos[2], sp.yawDeg);
    m.queue = [];
    this.force(m);
    m.newBody = m.bot === null;
    m.credit = 0;
    m.held = 0;
    m.stalled = false;
  }

  removeBody(memberId: number): void {
    const m = this.members.get(memberId);
    if (!m?.ctrl) return;
    for (const id of m.ctrl.pawnIds) this.downedBy.delete(id);
    this.sim.removePlayer(m.ctrl.id);
    m.ctrl = null;
    m.queue = [];
    m.needCorrection = false;
  }

  rosterChanged(): void {
    this.broadcastRoster();
  }

  killBody(pawnId: number, cause: Cause): void {
    const p = this.sim.pawns.get(pawnId);
    if (p && p.state.mode !== PawnMode.Dead) this.hurt(p, { amount: 0, kill: true }, { cause, attacker: null, headshot: false });
  }

  correct(memberId: number): void {
    const m = this.members.get(memberId);
    if (m?.ctrl) this.force(m);
  }

  send(memberId: number, bytes: Uint8Array): void {
    this.members.get(memberId)?.client.send(bytes);
  }

  /**
   * The room broke (its step threw: a bug). Everyone is told and dropped; the server has already let go of it.
   * Nothing here touches the simulation, which may be half-way through a tick.
   */
  fail(): void {
    this.failed = true;
    for (const [id, m] of [...this.members]) {
      m.client.send(encodeError(ErrorCode.RoomFailed, `Room ${this.code} hit a server error and was closed. Make a new room to play on.`));
      // The server's connection leaves as its socket closes; an in-process one has no socket.
      if (m.client.close) m.client.close(1011, "room failed");
      else this.members.delete(id);
    }
  }

  kick(memberId: number): void {
    const m = this.members.get(memberId);
    if (!m) return;
    m.client.send(encodeError(ErrorCode.Kicked, "The host removed you from the room"));
    // The server's connection leaves the room as its socket closes; an in-process one has no socket.
    if (m.client.close) m.client.close(1000, "kicked");
    else this.leave(memberId);
  }

  refuse(memberId: number, why: string): void {
    this.send(memberId, encodeError(ErrorCode.Refused, why));
  }

  /** The server changed this member's bodies outside their inputs: correct them at the next snapshot. */
  private force(m: Member) {
    if (m.bot) return this.settleBot(m);
    m.needCorrection = true;
    m.forced = true;
  }

  /** A bot's body is the server's from the start: nothing to correct, and its next input counts. */
  private settleBot(m: Member) {
    m.newBody = false;
    m.confirmEpoch = null;
    m.needCorrection = false;
    m.forced = false;
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
    this.sendPanelState(m, encodePanelState(this.sim.level.panels));
  }

  /** A client's gadget table disagrees with ours (its hash): send it the whole table (at most once a second). */
  onGadgetResync(memberId: number): void {
    const m = this.members.get(memberId);
    if (!m || this.sim.tick - m.gadgetStateAt < TICK_HZ) return;
    m.gadgetStateAt = this.sim.tick;
    this.stats.gadgetResyncs++;
    m.client.send(encodeGadgetState(this.sim.gadgets.list));
  }

  /** Every changed panel's state, which covers every op this member was still to be sent. */
  private sendPanelState(m: Member, state: Uint8Array) {
    m.client.send(state);
    m.opsHad = this.unsentOps.length;
    m.opsHeld = [];
  }

  /**
   * Every panel as the level built it and the reinforcement pools set (a lab tool: full again; a match's prep:
   * the round's). Everyone is sent the panels' state (with nothing changed, it puts theirs back too) and the
   * pools. History before now is dropped: a shot judged across the reset sees the panels as they are.
   */
  resetPanels(pools: [number, number] = [this.rules.reinforcements, this.rules.reinforcements]): void {
    const panels = this.sim.level.panels;
    for (const e of panels.list) if (e.panel.modified) panels.reset(e.panel.spec.index);
    this.queuedOps = [];
    this.panelHistory = new PanelHistory();
    this.sim.deployRules.pools = [pools[0], pools[1]];
    const state = encodePanelState(panels);
    for (const m of this.members.values()) {
      this.sendPanelState(m, state);
      m.events.push(this.deployRulesEvent());
    }
    // The walls as built again: the bots' grid too (gadgets are reset first, D-158).
    this.nav?.reset();
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
      // Ammo, and the gadgets in both slots (Phase 8).
      for (const id of m.ctrl.pawnIds) {
        const p = this.sim.pawns.get(id);
        if (!p?.loadout || p.state.mode === PawnMode.Dead) continue;
        const [a, b] = p.loadout.weapons.map(spawnAmmo);
        Object.assign(p.state, { loaded0: a.loaded, reserve0: a.reserve, loaded1: b.loaded, reserve1: b.reserve });
        // (Skopós's gadgets are one pool, in the shell she's in.)
        if (m.ctrl.pawnIds.length > 1 && id !== m.ctrl.possessedPawnId) emptySlots(p.state);
        else stockSlots(this.sim.data, p.state, p.loadout);
      }
      this.force(m);
    } else if (tool.kind === "clearGadgets") {
      this.resetGadgets();
    } else if (tool.kind === "explosive") {
      // Its cut where your body looks along the view you sent, applied with the next tick's ops. The id is the
      // client's: only the data's own keys name an explosive (not "constructor" or "__proto__").
      const all = this.sim.data.destruction.explosives;
      const ex = Object.hasOwn(all, tool.id) ? all[tool.id] : undefined;
      const body = this.sim.pawns.get(m.ctrl.possessedPawnId);
      if (!ex || !body || body.state.mode === PawnMode.Dead) return;
      const eye = eyePose(this.sim.data.movement, this.sim.data.hitboxes, body.state).pos;
      const dir = viewDir(tool.yaw, tool.pitch);
      const reach = explosiveReach(ex);
      const ray = new this.sim.R.Ray({ x: eye[0], y: eye[1], z: eye[2] }, { x: dir[0], y: dir[1], z: dir[2] });
      const plain = this.sim.world.castRay(ray, reach, true, undefined, QUERY_SIGHT)?.timeOfImpact ?? reach;
      for (const o of explosiveOps(this.sim.level.panels, this.sim.data.destruction, ex, eye, dir, plain)) this.queuePanelOp(o.panel, o.op);
    } else if (tool.kind === "resetPanels") {
      this.resetPanels();
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
    const paths = tracePellets(this.sim, this.history, origin, dirs, rewoundTick, w.damage.penetration, ignore, this.sentOf(m), through);
    const bodies = shotOnBodies(this.sim.data.combat, w.damage, paths, (id) => {
      const v = this.sim.pawns.get(id)!;
      return { scale: v.team === shooter.team ? this.rules.friendlyFire.scale : 1, idleShell: isIdleShell(this.sim, v) };
    });
    this.stats.shots++;
    if (rewoundTick > viewTick) this.stats.cappedShots++;
    const panelOps = paths.flatMap((p) => p.ops);
    // Default cameras on a pellet's way, short of what stopped it, break (Phase 7: any hit, either side's), and so do
    // Bulletproof Cameras hit from the side or the back (the gadget table's, in any room).
    const cams = this.sim.bpCams();
    for (const p of paths) {
      const end = Math.min(p.end, p.first?.t ?? Infinity);
      if (this.sim.matchRules.cameras) {
        const broke = camerasOnRay(this.sim.level.def, origin, p.dir, end, this.sim.matchRules.camsBroken);
        // (A lab has its cameras on only in tests: there they break as an EMP turns them off, camsOffNow.)
        if (broke && this.director) this.director.camerasBroken(broke);
        else if (broke) this.sim.matchRules.camsBroken |= broke;
      }
      if (cams.length) this.gadgetServer.breakCams(bpCamsBroken(this.sim.bpCams(), this.sim.data, origin, p.dir, end));
      // The first gadget on its way a bullet destroys (a fragile one: research/gadgets.md; no blast) or sets off (an
      // ingredient, Phase 8 M3).
      const struck = gadgetOnRay(this.sim.gadgets, this.sim.data, origin, p.dir, end, (g) => this.fragile(g) || this.ignitable(g));
      if (struck) this.strike(struck.g);
      // A pellet Fuze's shield stopped (Phase 8 M11): no damage, one more toward its bearer's suppression (not a
      // teammate's with friendly fire off, as a blow wouldn't do anything: the review, M12).
      const bearer = p.shield ? this.sim.pawns.get(p.shield.pawnId) : undefined;
      if (bearer && (bearer.team !== shooter.team || this.friendlyFireOn())) {
        shieldHit(bearer);
        const owner = bearer.ownerId !== null ? this.memberOf(bearer.ownerId) : null;
        if (owner) this.force(owner);
      }
    }
    this.judged.push({ m, cause: Cause.Bullet, ctrlId: m.ctrl.id, team: shooter.team, seq: shot.seq, weaponId: w.id, receivedTick: now, rewoundTick, origin, bodies, lives: this.livesOf(bodies), panelOps });
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
        target: this.shotTarget(origin, p0.dir, p0.first?.pawnId ?? null, p0.wall ?? Infinity, rewoundTick, ignore, this.sentOf(m)),
      }),
    );
  }

  /** The body a pellet entered, or else the one whose torso it passed closest to (within 2 m, before the wall), as rewound. */
  private shotTarget(origin: Vec3, dir: Vec3, hitId: number | null, wall: number, tick: number, ignore: ReadonlySet<number>, sent: SentRing | undefined): ShotResult["target"] {
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
    const target = judgeMelee(this.sim, hit.origin, attacker.state, hit.yaw, this.history.at(rewoundTick, this.sentOf(m)), ignore);
    const base = { m, cause: Cause.Melee, ctrlId: m.ctrl.id, team: attacker.team, seq: hit.seq, weaponId: "knife", receivedTick: now, rewoundTick, origin: hit.origin };
    // Fuze's melee with his shield up is a bash (Phase 8 M11): no damage (Y9S4), the body it meets pushed back.
    const bash = attacker.loadout?.shield && shieldUp(attacker.state) ? attacker.loadout.shield : null;
    const struckBody = target ? this.sim.pawns.get(target.pawnId) : undefined;
    if (target && struckBody && bash) {
      if (this.blowLands(attacker, struckBody)) this.bashed(attacker, struckBody, bash, target.shield);
      return;
    }
    // A knife meeting a shield's plate stops there: held up, it's knocked aside (a guard break, Y9S1).
    if (target?.shield && struckBody?.loadout?.shield) {
      if (this.blowLands(attacker, struckBody)) this.guardBreak(struckBody);
      return;
    }
    if (target) {
      const body: ShotOnBody = { pawnId: target.pawnId, kill: false, amount: 0, headshot: false, zone: target.zone, pellets: 1, distance: target.reach };
      this.judged.push({ ...base, bodies: [body], lives: this.livesOf([body]), panelOps: [] });
      return;
    }
    const dir = viewDir(hit.yaw, hit.pitch);
    const reach = this.sim.data.combat.melee.reach;
    const ray = new this.sim.R.Ray({ x: hit.origin[0], y: hit.origin[1], z: hit.origin[2] }, { x: dir[0], y: dir[1], z: dir[2] });
    const plain = this.sim.world.castRay(ray, reach, true, undefined, QUERY_SIGHT)?.timeOfImpact ?? reach;
    // A Bulletproof Camera in reach: the knife breaks its glass, any face (Phase 7; for us its feed is gone, broken).
    const knifed = bpCamsBroken(this.sim.bpCams(), this.sim.data, hit.origin, dir, plain, true);
    if (knifed.length) {
      this.gadgetServer.breakCams(knifed);
      return;
    }
    // A gadget in reach (Phase 8 M2, M3): a fragile one is destroyed, barbed wire takes a hit (the next destroys it), a
    // deployable shield's glass goes opaque, a fire extinguisher bursts, a metal detector is destroyed.
    const struck = gadgetOnRay(this.sim.gadgets, this.sim.data, hit.origin, dir, plain + 0.02, (g) => this.knifeable(g));
    if (struck) {
      this.knifed(struck.g);
      return;
    }
    // Skopós's knife makes a bigger hole, through the studs, and breaks a barricade at once (Phase 8 M10: `meleeHole`).
    const large = this.sim.data.operators.get(attacker.operatorId)?.combat.meleeHole === "large";
    const d = this.sim.data.destruction;
    const onPanel = meleeOnPanels(this.sim.level.panels, d, hit.origin, dir, reach, plain, { tick: panelTick, history: this.panelHistory }, large ? d.meleeLarge : d.melee);
    if (onPanel) this.judged.push({ ...base, bodies: [], lives: new Map(), panelOps: onPanel.ops.map(({ panel, op }) => ({ panel, op })) });
  }

  /**
   * A swing's blow (Phase 8 M4, Sledge's hammer; research/operators/sledge.md §3), judged like the knife against
   * everyone as its swinger saw them: the first thing along the view within its reach that the level and panels
   * don't hide. A body dies (a kill costs `killCharges` charges in all); an enemy gadget is destroyed as a blast
   * destroys it, an ingredient set off; otherwise the first panel takes the blow (gadgets/hammer.ts).
   */
  private judgeSwing(m: Member, applied: QueuedInput, e: Extract<SimEvent, { kind: "swing" }>) {
    const pawn = this.sim.pawns.get(e.pawnId);
    const g = this.sim.data.gadgets.get(e.gadget);
    if (!m.ctrl || !pawn || g?.use.kind !== "swing") return;
    const u = g.use;
    const { now, rewoundTick } = this.viewTimeFor(m, applied);
    const origin = e.origin;
    const dir = viewDir(e.yaw, e.pitch);
    const ray = new this.sim.R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] });
    const plain = this.sim.world.castRay(ray, u.reachM, true, undefined, QUERY_SIGHT)?.timeOfImpact ?? u.reachM;
    const wall = Math.min(plain, this.sim.level.panels.firstSolid(origin, dir, plain)?.crossing.face ?? plain);
    const base = { m, cause: Cause.Gadget, ctrlId: m.ctrl.id, team: pawn.team, seq: e.seq, weaponId: g.id, receivedTick: now, rewoundTick, origin };
    // Bodies first, as the swinger saw them (not their own, not the dead).
    const ignore = new Set(m.ctrl.pawnIds);
    for (const p of this.sim.pawns.values()) if (p.state.mode === PawnMode.Dead) ignore.add(p.id);
    let hit: { id: number; t: number; zone: ReturnType<typeof zoneOf>; shield: boolean } | null = null;
    for (const [id, boxes] of this.history.at(rewoundTick, this.sentOf(m))) {
      if (ignore.has(id)) continue;
      for (const h of boxes) {
        const t = rayCapsule(origin, dir, h.a, h.b, h.radius);
        if (t !== null && t <= wall && (!hit || t < hit.t)) hit = { id, t, zone: h.part === "shield" ? "torso" : zoneOf(h.part), shield: h.part === "shield" };
      }
    }
    // What a blow on a body or a drone costs (the room's to charge: the simulation only charged the level, a panel or a
    // gadget in reach, `e.spent`): `killCharges` in all for a body, one for a drone or a shield's plate.
    const charge = (total: number) => {
      const extra = total - (e.spent ? 1 : 0);
      if (extra <= 0) return;
      const s = pawn.state;
      if (e.slot === 1) s.g1 = Math.max(0, s.g1 - extra);
      else s.g2 = Math.max(0, s.g2 - extra);
      this.force(m);
    };
    // A blow on Fuze's shield's plate knocks him to the ground, unhurt (Phase 8 M11; Y10S2: "knocks the shield aside and
    // the operator to the ground", the research CSV; D-156).
    const knocked = hit?.shield ? this.sim.pawns.get(hit.id) : undefined;
    if (knocked?.loadout?.shield) {
      charge(1);
      // (Not on his feet, on a rope or a ladder: the shield's only knocked aside.)
      if (this.blowLands(pawn, knocked) && !this.knockOver(knocked, pawn)) this.guardBreak(knocked);
      return;
    }
    if (hit) {
      const body: ShotOnBody = { pawnId: hit.id, kill: true, amount: 0, headshot: false, zone: hit.zone, pellets: 1, distance: hit.t };
      this.judged.push({ ...base, bodies: [body], lives: this.livesOf([body]), panelOps: [] });
      charge(this.sim.pawns.get(hit.id)?.kind === PawnKind.Drone ? 1 : u.killCharges);
      return;
    }
    // A gadget on the way: an enemy's (not a smoke cloud) or an ingredient.
    const struck = gadgetOnRay(this.sim.gadgets, this.sim.data, origin, dir, wall + 0.02, (x) =>
      isIngredient(x.kind) ? this.ignitable(x) : !(x.flags & GFlag.Flying) && x.team !== pawn.team && !isCloud(this.sim, x),
    );
    if (struck) {
      // A Black Mirror's glass shatters as to a knife (Phase 8 M7; UNVERIFIED for the hammer); the rest as to a blast.
      if (mirrorOf(this.sim.data, struck.g)) this.sim.gadgets.update(struck.g.id, { flags: struck.g.flags | GFlag.Hit });
      // A Gu mine goes off under the hammer, as under a knife (Phase 8 M10; the CSV's trigger_sting).
      else if (this.sim.data.gadgets.get(kindId(struck.g.kind) ?? "")?.gu) this.gadgetServer.sting(struck.g);
      else this.gadgetServer.blastHit(struck.g);
      return;
    }
    const ops = hammerOps(this.sim.level.panels, origin, dir, plain, u);
    if (ops.length) this.judged.push({ ...base, bodies: [], lives: new Map(), panelOps: ops });
  }

  /** The life each body hit is in now (Pawn.life), kept with a judged shot until it applies. */
  private livesOf(bodies: readonly ShotOnBody[]): Map<number, number> {
    return new Map(bodies.map((b) => [b.pawnId, this.sim.pawns.get(b.pawnId)?.life ?? -1]));
  }

  /**
   * Change a panel (a hole, wear, steel) at the end of this tick: applied to the room's level in its wire
   * form (exactly what clients will apply), remembered so later shots are judged against the panels as each
   * shooter had them, and sent to everyone with the tick's other ops.
   */
  private applyPanelOp(index: number, op: PanelOp): PanelChange | null {
    const e = this.sim.level.panels.list[index];
    const wire = wireOp(op);
    // Never an op a client would refuse to read (it would drop every connection in the room).
    if (!e || (wire.kind === "damage" && !Number.isFinite(wire.amount))) return null;
    const change = this.sim.level.panels.apply(index, wire);
    this.panelHistory.record(this.sim.tick, index, e.panel.w * e.panel.h, change);
    this.unsentOps.push({ panel: index, op: wire });
    this.stats.panelOps++;
    // A Black Mirror falls with its wall (Phase 8 M7).
    this.gadgetServer.panelChanged(index);
    return change;
  }

  /**
   * A reinforcement or barricade hold completed in the simulation (it checked who, where and what): put the
   * steel up from that side, using one of the team's reinforcements, or the barricade up or off.
   */
  private completeDeploy(e: Extract<SimEvent, { kind: "deploy" }>) {
    const pawn = this.sim.pawns.get(e.pawnId);
    if (!pawn) return;
    if (e.action !== DeployKind.Reinforce) {
      this.applyPanelOp(e.panel, { kind: "barricade", up: e.action === DeployKind.BarricadeUp });
      return;
    }
    const pools = this.sim.deployRules.pools;
    if (pools[pawn.team] <= 0) return;
    if (!this.applyPanelOp(e.panel, { kind: "reinforce", section: e.section, side: e.side })?.added[L_STEEL].length) return;
    pools[pawn.team]--;
    this.gadgetServer.reinforced(e.panel, e.section);
    for (const m of this.members.values()) m.events.push(this.deployRulesEvent());
  }

  /**
   * A rappel breach's swing ended (Phase 5 M8; the simulation chose the panels): through, the glass and
   * barricades break; bounced back, the glass breaks and each barricade takes the kick.
   */
  private completeBreach(e: Extract<SimEvent, { kind: "rappelBreach" }>) {
    const kick = this.sim.data.destruction.barricade.rappelKickDamage;
    for (const index of e.panels) {
      const p = this.sim.level.panels.list[index]?.panel;
      if (!p) continue;
      this.applyPanelOp(index, { kind: "damage", amount: e.through || p.kind === "glass" ? Math.max(1, p.hp) : kick, hard: false });
    }
  }

  private deployRulesEvent(): GameEvent {
    const r = this.sim.deployRules;
    return { kind: "deployRules", anyone: r.anyone, rappel: r.rappel, pools: [r.pools[0], r.pools[1]] };
  }


  /**
   * Apply the tick's judged shots (DECISIONS D-044): all of them were judged first, so two players who shoot
   * each other in the same tick both land; then they apply in a fixed order (rewound time, arrival, shooter,
   * input) to the bodies as they are now. A shot on a body already dead, or back in a new life since it was
   * judged (a catch-up step can cross the kill plane in between), does nothing.
   */
  private resolveShots() {
    for (const { panel, op } of this.queuedOps.splice(0)) this.applyPanelOp(panel, op);
    const shots = this.judged.sort((a, b) => a.rewoundTick - b.rewoundTick || a.receivedTick - b.receivedTick || a.ctrlId - b.ctrlId || a.seq - b.seq);
    this.judged = [];
    for (const shot of shots) {
      for (const { panel, op } of shot.panelOps) this.applyPanelOp(panel, op);
      for (const body of shot.bodies) {
        const victim = this.sim.pawns.get(body.pawnId);
        if (!victim || victim.state.mode === PawnMode.Dead || victim.life !== shot.lives.get(body.pawnId)) continue;
        const friendly = victim.team === shot.team;
        if (friendly && !this.friendlyFireOn()) continue; // team damage off: no damage, no marker
        if (this.director?.safeguarded(victim)) continue; // Quick Match's Attacker Safeguard: the same
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
  private hurt(victim: Pawn, d: Damage, by: { cause: Cause; attacker: Attacker | null; headshot: boolean }) {
    const r = applyDamage(this.sim, victim, { ...d, cause: by.cause }, this.rules);
    if (r.outcome === "ignored") return r;
    const owner = victim.ownerId !== null ? this.memberOf(victim.ownerId) : null;
    if (owner) {
      this.force(owner);
      // (A drone isn't its owner getting hurt: they hear of it as a drone destroyed.)
      if (victim.kind === PawnKind.Body)
        owner.events.push({ kind: "damageTaken", pawnId: victim.id, amount: r.removed, cause: by.cause, attackerCtrl: by.attacker?.ctrlId ?? 0, from: by.attacker?.origin ?? null });
    }
    const ctrl = by.attacker?.ctrlId ?? 0;
    const weapon = by.attacker?.weaponId ?? "";
    const friendly = by.attacker !== null && victim.team === by.attacker.team;
    if (r.outcome === "downed") {
      this.director?.onBodyDown(victim); // a carrier drops the defuser
      this.downedBy.set(victim.id, { ctrl, weapon, life: victim.life });
      const e: GameEvent = { kind: "down", victimPawn: victim.id, victimCtrl: victim.ownerId ?? 0, downerCtrl: ctrl, weapon, cause: by.cause, friendly };
      for (const m of this.members.values()) m.events.push(e);
    }
    if (r.outcome === "killed") this.announceDeath(victim, ctrl, weapon, by.cause, by.headshot, friendly);
    return r;
  }

  /**
   * Everyone hears about a death. A body that was down credits whoever downed it, and whoever finished it
   * (if someone else) gets the assist (core_mechanics.md §10.2). `life`: the life it died in (a death inside
   * the step is announced after it, when the kill plane may already have brought the body back).
   */
  private announceDeath(victim: Pawn, finisherCtrl: number, weapon: string, cause: Cause, headshot: boolean, friendly: boolean, life = victim.life) {
    const ownerCtrl = victim.ownerId ?? 0;
    if (victim.kind === PawnKind.Drone) {
      // A drone (Phase 7) isn't anyone's death: no kill feed, no score.
      const e: GameEvent = { kind: "droneDestroyed", pawnId: victim.id, ownerCtrl, killerCtrl: finisherCtrl };
      for (const m of this.members.values()) m.events.push(e);
      return;
    }
    this.stats.kills++;
    const entry = this.downedBy.get(victim.id);
    this.downedBy.delete(victim.id);
    const downer = entry?.life === life ? entry : undefined;
    // Downed by nobody (a lab tool, reflected damage) or in an earlier life: the kill is the finisher's.
    const killerCtrl = downer?.ctrl || finisherCtrl;
    const assistCtrl = downer?.ctrl && finisherCtrl !== downer.ctrl ? finisherCtrl : 0;
    // Skopós's shell she was transferring out of (crouched, going idle: Ulo's test) is her inactive one: she lands in
    // the other, and her client is told.
    const leftBehind = this.sim.shellLeftBehind(victim);
    if (leftBehind) {
      const owner = this.memberOf(ownerCtrl);
      if (owner) this.force(owner);
    }
    const idle = leftBehind || isIdleShell(this.sim, victim);
    // An eliminated defender drops his phone (Phase 8 M9; Skopós: his circuit board), for Dokkaebi to hack.
    if (!idle && victim.team === DEFENSE) this.dropPhone(victim);
    const e: GameEvent = idle
      ? { kind: "shellDestroyed", pawnId: victim.id, ownerCtrl, killerCtrl, weapon, headshot }
      : { kind: "kill", victimPawn: victim.id, victimCtrl: ownerCtrl, killerCtrl, assistCtrl, weapon: weapon || downer?.weapon || "", cause, headshot, friendly };
    for (const m of this.members.values()) m.events.push(e);
    this.director?.onBodyDown(victim); // a carrier drops the defuser
    // Skopós's idle shell isn't an elimination (research/operators/skopos.md): only a body's death counts.
    if (!idle) this.director?.onDeath(ownerCtrl, killerCtrl, assistCtrl, friendly);
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
        if (p) this.announceDeath(p, 0, "", e.cause === "bleed" ? Cause.Bleed : Cause.Fall, false, false, e.life);
      } else if (e.kind === "deploy") {
        this.completeDeploy(e);
      } else if (e.kind === "throw" || e.kind === "place" || e.kind === "detonate" || e.kind === "pickUpGadget") {
        this.gadgetServer.onEvent(e);
      } else if (e.kind === "rappelBreach") {
        this.completeBreach(e);
      } else if (e.kind === "plant" || e.kind === "disable" || e.kind === "pickup" || e.kind === "drop") {
        this.director?.onSimEvent(e);
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
      .map((m) => ({
        controllerId: m.ctrl!.id,
        name: m.name,
        operatorId: m.ctrl!.operatorId,
        pawnIds: this.sim.bodyIds(m.ctrl!),
        drones: this.sim.dronesOf(m.ctrl!).map((d) => d.id),
        kludges: this.sim.dronesOf(m.ctrl!).filter((d) => d.kludge).map((d) => d.id),
        team: m.team,
        kind: 0,
        loadout: m.pick,
      }));
    const dummies = this.dummies.map((d) => ({
      controllerId: d.ctrl.id,
      name: d.ctrl.name,
      operatorId: d.ctrl.operatorId,
      pawnIds: [...d.ctrl.pawnIds],
      drones: [],
      kludges: [],
      team: d.def.team,
      kind: 1,
      loadout: defaultLoadoutPick(this.sim.data, d.def.operator),
    }));
    return [...players, ...dummies];
  }

  private broadcastRoster() {
    const entries = this.roster();
    for (const m of this.members.values()) if (!m.bot) m.client.send(encodeRoster(entries, m.ctrl?.id ?? 0));
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
    m.stalled = false;
    return next;
  }

  /**
   * After stepping an input: judge the prediction made with it (only if made after our latest correction,
   * and not while one is already on its way: a body the server just changed can't have been predicted).
   */
  private afterInput(m: Member, applied: QueuedInput) {
    if (!m.ctrl || m.bot || m.needCorrection || applied.epoch !== (m.epoch & 0xff)) return;
    if (predictionHash(this.sim, m.ctrl) !== applied.predictedHash) m.needCorrection = true;
    else m.forced = false; // (stepped without input, but it still came out as predicted)
  }

  /**
   * A ping (Phase 7, intel/DESIGN.md §6) goes to the pinger's team for data/intel.json `ping.seconds`: yellow, or danger
   * when it follows their last (a yellow one) within `doubleTapS` (a double tap, in place of that one); otherwise none
   * within `cooldownS` of the last, so a held or hammered key sends a few a second at most.
   */
  private ping(ctrlId: number, pos: Vec3, gadget: number, heart: boolean) {
    const m = this.memberOf(ctrlId);
    if (!m) return;
    const k = this.sim.data.intel.ping;
    const since = this.sim.tick - m.lastPing;
    const danger = !m.lastPingDanger && since <= ticksOrZero(k.doubleTapS);
    if (!danger && since < ticksOrZero(k.cooldownS)) return;
    m.lastPing = this.sim.tick;
    m.lastPingDanger = danger;
    const team = this.teamOf(m);
    // On an enemy body (the first thing the view's ray meets), it spots him: a red ping (Phase 8 M9; research/intel.md §2).
    const body = gadget < 0 && !heart && m.ctrl ? this.pingedBody(m.ctrl, team, pos) : null;
    if (body) {
      this.spotted(body, ctrlId, team);
      return;
    }
    const e: GameEvent = { kind: "ping", ctrl: ctrlId, pos, danger, ticks: ticks(k.seconds), gadget, heart };
    for (const o of this.members.values()) if (this.teamOf(o) === team) o.events.push(e);
  }

  /** The enemy body (of the other team than `team`) a ping's ray from the view meets before where it landed, or null. */
  private pingedBody(c: PlayerController, team: number, landed: Vec3): Pawn | null {
    const view = this.sim.viewOf(c);
    if (!view) return null;
    const d: Vec3 = [landed[0] - view.pos[0], landed[1] - view.pos[1], landed[2] - view.pos[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-3) return null;
    const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
    const r = this.sim.data.movement.stance.collisionRadius;
    let best: { p: Pawn; t: number } | null = null;
    for (const p of this.sim.pawns.values()) {
      const s = p.state;
      if (p.kind !== PawnKind.Body || p.team === team || p.proxy || s.mode === PawnMode.Dead || s.mode === PawnMode.Held) continue;
      const top = s.y + Math.max(2 * r, currentHeight(this.sim.data.movement, s)) - r;
      const t = rayCapsule(view.pos, dir, [s.x, s.y + r, s.z], [s.x, top, s.z], r);
      if (t !== null && t <= len + 0.05 && (!best || t < best.t)) best = { p, t };
    }
    return best?.p ?? null;
  }

  /** An enemy body spotted (a scan, a red ping): a red mark for the spotter's team, and he's told. */
  private spotted(p: Pawn, byCtrl: number, team: number) {
    const e: GameEvent = { kind: "spotted", pawnId: p.id, by: byCtrl, ticks: ticks(this.sim.data.intel.ping.seconds) };
    this.spot(p.id, this.sim.data.intel.ping.seconds);
    for (const o of this.members.values()) if (this.teamOf(o) === team || o.ctrl?.id === p.ownerId) o.events.push(e);
  }

  /**
   * A member's team for team-only news (pings, spotted enemies, callouts) and a scan's or a dart's enemies: in a match
   * their side (one who joined mid-round has no body yet to say so), else their body's.
   */
  private teamOf(m: Member): number {
    return this.director?.match.sideOf(m.id) ?? m.team;
  }

  /**
   * Scans (Phase 7, intel/DESIGN.md §6): Fire held for data/intel.json `scan.holdS` while on a drone or a camera spots
   * every enemy body within `rangeM` and `coneDeg` of the view, in sight: a red mark for the scanner's team (and the
   * one spotted is told). Fire is let go before the next scan.
   */
  private scans(applied: ReadonlyMap<number, { m: Member; input: QueuedInput }>) {
    const k = this.sim.data.intel.scan;
    for (const { m, input } of applied.values()) {
      const c = m.ctrl;
      // Not from a Kludge drone (Phase 8 M8): its Fire hacks.
      const viewed = c ? this.sim.pawns.get(this.sim.viewedPawnId(c.id)) : undefined;
      const onFeed = c !== null && (c.cam !== 0 || (viewed?.kind === PawnKind.Drone && !viewed.kludge));
      if (!onFeed || !(input.cmd.buttons & Btn.Fire)) {
        m.scanTicks = 0;
        continue;
      }
      if (++m.scanTicks !== ticks(k.holdS)) continue;
      const view = this.sim.viewOf(c!);
      if (!view) continue;
      const look = viewDir(view.yaw, view.pitch);
      const cos = Math.cos(k.coneDeg * DEG);
      const team = this.teamOf(m);
      const thermal = c!.cam !== 0 && this.sim.bpCamAt(c!.cam - 1) !== null;
      for (const p of this.sim.pawns.values()) {
        if (p.kind !== PawnKind.Body || p.team === team || p.state.mode === PawnMode.Dead || p.proxy) continue;
        const at = eyePose(this.sim.data.movement, this.sim.data.hitboxes, p.state).pos;
        const d: Vec3 = [at[0] - view.pos[0], at[1] - view.pos[1], at[2] - view.pos[2]];
        const dist = Math.hypot(d[0], d[1], d[2]);
        if (dist > k.rangeM || dist < 1e-3 || (d[0] * look[0] + d[1] * look[1] + d[2] * look[2]) / dist < cos) continue;
        // A Black Mirror is seen through from its placer's side (Phase 8 M7).
        const wall = sightPast(this.sim, view.pos, [d[0] / dist, d[1] / dist, d[2] / dist], dist);
        if (wall && wall.t < dist - 0.05) continue;
        // Smoke hides them (a Bulletproof Camera sees through it), and so does the other side's observation blocker (Phase 8 M3).
        if (!thermal && smokeOnSegment(this.sim.data, this.sim.gadgets, view.pos, at) !== null) continue;
        if (this.barrierBetween(team, view.pos, at)) continue;
        this.spotted(p, c!.id, team);
      }
    }
  }

  /** Who has been spotted (identified: a scan, a red ping), until when (Phase 8 M9: Dokkaebi's payload targets them). */
  private readonly spottedUntil = new Map<number, number>();

  /** A body spotted (identified) for `seconds` (a scan's or a red ping's mark; Phase 8 M9). */
  spot(pawnId: number, seconds: number): void {
    this.spottedUntil.set(pawnId, Math.max(this.spottedUntil.get(pawnId) ?? 0, this.sim.tick + ticks(seconds)));
  }

  /**
   * Dokkaebi's call ringing on a player's phone (Phase 8 M9; the review, M12): `ringing` on the body he's in, so his
   * simulation leaves a fresh Interact press to the dismissal, and off on his others; his owner corrected on a change.
   */
  private ringing(tm: Member | null, called: Pawn | undefined, on: boolean) {
    const ids = tm?.ctrl ? tm.ctrl.pawnIds : called ? [called.id] : [];
    let changed = false;
    for (const id of ids) {
      const p = this.sim.pawns.get(id);
      const want = on && (!tm?.ctrl || id === tm.ctrl.possessedPawnId);
      if (!p || p.state.ringing === want) continue;
      p.state.ringing = want;
      changed = true;
    }
    if (changed && tm) this.force(tm);
  }

  /** Dokkaebi's tablet (Phase 8 M9), by her body's pawn id: her charges, when the next comes, the upload under way, her phone hacks. */
  private readonly jegeoState = new Map<number, { charges: number; next: number; upload: { target: number; start: number; dismiss: number } | null; held: boolean; hacks: number }>();
  /** Each defender's next tick Dokkaebi may send to him again. */
  private readonly jegeoCooldown = new Map<number, number>();
  /** Dead defenders' phones (and Skopós's circuit boards) hacked already, by their entries' ids. */
  private readonly phonesHacked = new Set<number>();
  /** The tick the attackers' look at the defenders' cameras ends (0: none). */
  private camsLentUntil = 0;
  /** Phones' fires burning: where, until when, its next bite, its numbers. */
  private fires: { pos: Vec3; end: number; next: number; k: JegeoData["fire"] }[] = [];

  /**
   * Dokkaebi's tablet (Phase 8 M9; research/operators/dokkaebi.md §3): her charges come back over time; with it up,
   * Fire sends the payload to the identified defender nearest her crosshair (one of her charges), or with none, hacks a
   * dead defender's phone (the attackers watch the defenders' cameras for a while). An upload runs over a constant
   * connection: her tablet put away, her going down, a jammer or an EMP on either of them, or his dismissal cut it;
   * done, his phone explodes (jegeoDone). The phones' fires burn whoever's in them.
   */
  private jegeo(applied: ReadonlyMap<number, { m: Member; input: QueuedInput }>) {
    const tick = this.sim.tick;
    for (const m of this.members.values()) {
      const c = m.ctrl;
      const body = c ? this.sim.pawns.get(c.possessedPawnId) : undefined;
      const t = body && body.kind === PawnKind.Body ? slotGadget(this.sim.data, body.loadout, 2)?.jegeo : undefined;
      if (!c || !body || !t) continue;
      let st = this.jegeoState.get(body.id);
      if (!st) {
        st = { charges: t.startCharges, next: tick + ticks(t.regenS), upload: null, held: false, hacks: 0 };
        this.jegeoState.set(body.id, st);
      }
      if (st.charges >= t.maxCharges) st.next = tick + ticks(t.regenS);
      else if (tick >= st.next) {
        st.charges++;
        st.next = tick + ticks(t.regenS);
      }
      const s = body.state;
      const alive = s.mode !== PawnMode.Dead && s.mode !== PawnMode.Held && s.mode !== PawnMode.Downed;
      // Up: in her hands and ready, and her view her own (on a camera or a drone, Fire scans).
      const up = alive && s.hand === Hand.Ability && s.gAct !== GadgetAct.Equip && c.cam === 0 && c.drone === 0;
      const tell = (stage: 0 | 1 | 2 | 3 | 4, pawnId: number, n: number) => m.events.push({ kind: "jegeo", stage, pawnId, ticks: n, charges: st!.charges });
      if (st.upload) {
        const u = st.upload;
        const called = this.sim.pawns.get(u.target);
        const tm = called && called.ownerId !== null ? this.memberOf(called.ownerId) : null;
        // The phone is the player's: on Skopós, in whichever shell he is now.
        const target = tm?.ctrl ? this.sim.pawns.get(tm.ctrl.possessedPawnId) : called;
        const ti = tm?.ctrl ? applied.get(tm.ctrl.id)?.input : undefined;
        if (ti) u.dismiss = ti.cmd.buttons & Btn.Interact ? u.dismiss + 1 : 0;
        const heart = target ? heartOf(this.sim, target) : null;
        const cut =
          !up ||
          s.jammed > 0 ||
          pawnJammed(this.sim, body) ||
          !target ||
          !heart ||
          target.state.mode === PawnMode.Dead ||
          target.state.jammed > 0 ||
          (tm?.ctrl?.phoneLost ?? false) ||
          pointJammed(this.sim, body.team, heart) ||
          u.dismiss >= ticks(t.dismissS);
        if (cut) {
          st.upload = null;
          this.ringing(tm ?? null, called, false);
          this.jegeoCooldown.set(u.target, tick + ticks(t.cooldownS));
          tell(2, u.target, 0);
          tm?.events.push({ kind: "jegeo", stage: 2, pawnId: u.target, ticks: 0, charges: 0 });
          continue;
        }
        // (By the tick it started: this runs again for every catch-up step, the review found, M12.)
        this.ringing(tm ?? null, called, tick - u.start < ticks(t.uploadS));
        if (tick - u.start < ticks(t.uploadS)) continue;
        st.upload = null;
        this.jegeoCooldown.set(u.target, tick + ticks(t.cooldownS));
        this.jegeoDone(c, body, target!, tm ?? null, t);
        tell(1, u.target, 0);
        continue;
      }
      // Her Fire as of an input of hers this step (a catch-up step for someone else has none: that's not a let-go).
      const input = applied.get(c.id)?.input;
      if (!input) continue;
      const fire = (input.cmd.buttons & Btn.Fire) !== 0;
      if (!fire) st.held = false;
      if (!fire || st.held || !up) continue;
      st.held = true;
      const target = this.jegeoTarget(body, t);
      if (target) {
        // Not while she's jammed or EMP'd herself (the connection would be cut at once).
        if (st.charges <= 0 || s.jammed > 0 || pawnJammed(this.sim, body)) continue;
        st.charges--;
        st.upload = { target: target.id, start: tick, dismiss: 0 };
        tell(0, target.id, ticks(t.uploadS));
        const tm = target.ownerId !== null ? this.memberOf(target.ownerId) : null;
        this.ringing(tm, target, true);
        tm?.events.push({ kind: "jegeo", stage: 3, pawnId: target.id, ticks: ticks(t.uploadS), charges: 0 });
        continue;
      }
      // No live target: a dead defender's phone (Skopós's circuit board), the oldest not hacked yet, from anywhere (a
      // jammer doesn't stop it: research/interactions.csv, ours).
      if (st.hacks >= t.camHacks) continue;
      const phoneKind = kindOf("dropped_phone");
      const phone = this.sim.gadgets.list.find((g) => g.kind === phoneKind && g.team !== body.team && !this.phonesHacked.has(g.id));
      if (!phone) continue;
      this.phonesHacked.add(phone.id);
      st.hacks++;
      this.camsLentUntil = tick + ticks(t.camS);
      if (this.director) this.director.camerasLent(true);
      else this.sim.matchRules.camsLent = true;
      tell(4, phone.id, ticks(t.camS));
    }
    if (this.camsLentUntil && tick >= this.camsLentUntil) {
      this.camsLentUntil = 0;
      if (this.director) this.director.camerasLent(false);
      else this.sim.matchRules.camsLent = false;
    }
    // The phones' fires (team-neutral, as the level's are): a bite every `everyS` for whoever stands in one.
    this.fires = this.fires.filter((f) => tick < f.end);
    for (const f of this.fires) {
      if (tick < f.next) continue;
      f.next = tick + ticks(f.k.everyS);
      const attacker: Attacker = { ctrlId: 0, team: NEUTRAL, weaponId: "jegeo_payload", origin: [f.pos[0], f.pos[1], f.pos[2]] };
      for (const p of [...this.sim.pawns.values()]) {
        const ps = p.state;
        if (p.kind !== PawnKind.Body || ps.mode === PawnMode.Dead || ps.mode === PawnMode.Held) continue;
        if (Math.hypot(ps.x - f.pos[0], ps.z - f.pos[2]) <= f.k.radiusM && Math.abs(ps.y - f.pos[1]) <= 1.0) this.hurt(p, { amount: f.k.damage, kill: false }, { cause: Cause.Gadget, attacker, headshot: false });
      }
    }
  }

  /**
   * An eliminated defender's phone (Phase 8 M9; gadgets/DESIGN.md §9; Skopós's circuit board): an entry on the floor
   * under where his body fell, his side's, until any damage destroys it (data/gadgets/dropped_phone.json).
   */
  private dropPhone(victim: Pawn) {
    const d = this.sim.data.gadgets.get("dropped_phone");
    if (!d) return;
    const s = victim.state;
    const down = raycastLevel(this.sim, [s.x, s.y + 0.3, s.z], [0, -1, 0], 4);
    const floor = down ? s.y + 0.3 - down.t : s.y;
    this.sim.gadgets.add({ kind: kindOf(d.id), owner: victim.ownerId ?? 0, team: victim.team, pos: [s.x, floor + d.sizeM[1] / 2, s.z], yaw: s.yaw, vel: [0, 0, 0], flags: GFlag.OnFloor, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: 0 });
  }

  /**
   * The identified defender Dokkaebi's tablet sends to: the one nearest her crosshair within `aimDeg`, through anything
   * (spotted by her team's scans, alive and not Skopós's idle shell, his phone whole, not on his cooldown, not inside a
   * jammer of his side's), or null.
   */
  private jegeoTarget(body: Pawn, t: JegeoData): Pawn | null {
    const eye = eyePose(this.sim.data.movement, this.sim.data.hitboxes, body.state).pos;
    const look = viewDir(body.state.yaw, body.state.pitch);
    const cone = Math.cos(t.aimDeg * DEG);
    let best: { p: Pawn; cos: number } | null = null;
    for (const p of this.sim.pawns.values()) {
      if (p.kind !== PawnKind.Body || p.team === body.team || p.state.mode === PawnMode.Dead || isIdleShell(this.sim, p)) continue;
      if ((this.spottedUntil.get(p.id) ?? 0) <= this.sim.tick || (this.jegeoCooldown.get(p.id) ?? 0) > this.sim.tick) continue;
      // No phone left to call (another payload blew it up).
      if (p.ownerId !== null && this.sim.controllers.get(p.ownerId)?.phoneLost) continue;
      const h = heartOf(this.sim, p);
      if (pointJammed(this.sim, body.team, h)) continue;
      const d = [h[0] - eye[0], h[1] - eye[1], h[2] - eye[2]];
      const len = Math.hypot(d[0], d[1], d[2]);
      const cos = len < 1e-6 ? 1 : (d[0] * look[0] + d[1] * look[1] + d[2] * look[2]) / len;
      if (cos >= cone && (!best || cos > best.cos)) best = { p, cos };
    }
    return best?.p ?? null;
  }

  /**
   * A payload's upload done (Phase 8 M9): his phone explodes in his hands (its damage, credited to Dokkaebi), a fire
   * burns where he stood for its seconds, and he has no observation tools for the rest of the round (corrected now).
   */
  private jegeoDone(c: PlayerController, body: Pawn, target: Pawn, tm: Member | null, t: JegeoData) {
    const at = heartOf(this.sim, target);
    this.hurt(target, { amount: t.damage, kill: false }, { cause: Cause.Explosive, attacker: { ctrlId: c.id, team: body.team, weaponId: "jegeo_payload", origin: at }, headshot: false });
    this.fires.push({ pos: [target.state.x, target.state.y, target.state.z], end: this.sim.tick + ticks(t.fire.seconds), next: this.sim.tick + ticks(t.fire.everyS), k: t.fire });
    this.tellBlast(kindOf("jegeo_payload"), at);
    if (tm?.ctrl) {
      tm.ctrl.phoneLost = true;
      tm.ctrl.cam = 0;
      tm.ctrl.shellCam = false;
      tm.events.push({ kind: "jegeo", stage: 1, pawnId: target.id, ticks: 0, charges: 0 });
      this.force(tm);
    }
  }

  /**
   * Fuze's bash (Phase 8 M11; weapons_notes.md §5; D-156): on a raised shield's plate it knocks the shield aside (a
   * guard break: any melee does, Y9S1); a body on its feet it knocks down, shoved back onto its back (Fandom: like
   * Oryx's dash and Nomad's Airjab), with its `bashDamage` (none since Y9S4); anything else it meets (a drone, an idle
   * Skopós shell, a body down or on a rope) it shoves back as far.
   */
  private bashed(by: Pawn, target: Pawn, k: NonNullable<Pawn["loadout"]>["shield"] & object, onPlate: boolean) {
    if (onPlate && shieldUp(target.state)) {
      this.guardBreak(target);
      return;
    }
    if (this.knockOver(target, by)) {
      if (k.bashDamage > 0) this.hurt(target, { amount: k.bashDamage, kill: false }, { cause: Cause.Melee, attacker: { ctrlId: by.ownerId ?? 0, team: by.team, weaponId: "ballistic_shield", origin: [by.state.x, by.state.y, by.state.z] }, headshot: false });
      return;
    }
    const s = target.state;
    const kd = this.sim.data.combat.knockdown;
    const dx = s.x - by.state.x;
    const dz = s.z - by.state.z;
    const len = Math.hypot(dx, dz) || 1;
    s.vx = Math.fround(s.vx + (dx / len) * (kd.pushM / kd.fallS));
    s.vz = Math.fround(s.vz + (dz / len) * (kd.pushM / kd.fallS));
    this.guardBreak(target);
    const owner = target.ownerId !== null ? this.memberOf(target.ownerId) : null;
    if (owner) this.force(owner);
  }

  /**
   * Knock a body to the ground from `by` (D-156: Fuze's bash, Sledge's hammer on Fuze's raised shield): only one on its
   * feet that its player is in (an idle Skopós shell crouches behind its barrier, a gadget's); its player corrected.
   * False when it wasn't.
   */
  private knockOver(target: Pawn, by: Pawn): boolean {
    const ctrl = target.ownerId !== null ? this.sim.controllers.get(target.ownerId) : undefined;
    if (!ctrl || ctrl.possessedPawnId !== target.id || !this.sim.knockDown(target, [by.state.x, by.state.y, by.state.z])) return false;
    const owner = this.memberOf(ctrl.id);
    if (owner) this.force(owner);
    return true;
  }

  /**
   * Whether a blow (a knife, a bash, the hammer) does anything to a body: not to a teammate while friendly fire is off,
   * as its damage wouldn't (Phase 8 M11). A blast or a stun knocks a shield aside whoever's it is, as a stun flashes
   * either side.
   */
  private blowLands(by: Pawn, target: Pawn): boolean {
    return target.team !== by.team || this.friendlyFireOn();
  }

  /** A guard break (Phase 8 M11): a body's shield held up is knocked aside for `guardBreak.seconds`. */
  private guardBreak(pawn: Pawn) {
    const k = pawn.loadout?.shield;
    if (k && shieldUp(pawn.state)) this.knockAside(pawn, k.guardBreak.seconds);
  }

  /** Fuze's shield knocked aside (a guard break) or down (the hammer) for `seconds` (Phase 8 M11): its owner corrected. */
  private knockAside(pawn: Pawn, seconds: number) {
    knockShield(pawn, seconds);
    const owner = pawn.ownerId !== null ? this.memberOf(pawn.ownerId) : null;
    if (owner) this.force(owner);
  }

  /**
   * Fuze's shield dash (Phase 8 M11; weapons_notes.md §5): a body sprinting with its shield up into a barricade already
   * worn below its full hit points breaks through it; a fresh one stops it (Y11S1: no dashing through undamaged ones).
   */
  private shieldDashes() {
    for (const pawn of this.sim.pawns.values()) {
      const s = pawn.state;
      const k = pawn.loadout?.shield;
      if (pawn.kind !== PawnKind.Body || !k || !s.sprinting || !shieldUp(s)) continue;
      const eye = eyePose(this.sim.data.movement, this.sim.data.hitboxes, s).pos;
      const [fx, fz] = forwardXZ(s.yaw);
      // (Any crossing of it, a hole's too: a worn barricade is still one.)
      const along = this.sim.level.panels.crossings([s.x, eye[1] - 0.6, s.z], [fx, 0, fz], k.plate.frontM + 0.25);
      const p = along.find((c) => c.entry.panel.kind === "barricade")?.entry.panel;
      if (!p || p.kind !== "barricade" || p.broken || p.hp >= p.spec.hp) continue;
      this.applyPanelOp(p.spec.index, { kind: "damage", amount: Math.max(1, p.hp), hard: false });
    }
  }

  /** Skopós's idle shells' barriers (Phase 8 M10): the entry standing in front of each, by the shell's pawn id. */
  private readonly barriers = new Map<number, number>();

  /**
   * Skopós's idle shells' barriers (Phase 8 M10; skopos.md §3.3; data/gadgets/shell_shield.json): every living shell she
   * isn't in has one standing in front of it (its camera for the defence too); the one she wakes loses it, the one she
   * leaves gets one, and a dead shell's goes. One a blast broke stays (broken: the shell's camera still).
   */
  private shellShields() {
    const d = this.sim.data.gadgets.get("shell_shield");
    if (!d) return;
    const idle = new Set<number>();
    for (const c of this.sim.controllers.values()) {
      const bodies = this.sim.bodyIds(c);
      if (bodies.length < 2) continue;
      for (const id of bodies) if (id !== c.possessedPawnId && this.sim.pawns.get(id)?.state.mode !== PawnMode.Dead) idle.add(id);
    }
    // Built round the crouched shell (its entry at the shell's centre, data `parts`); a plain one in front, clear of it.
    const out = d.parts ? 0 : this.sim.data.movement.stance.collisionRadius + 0.15 + d.sizeM[2] / 2;
    const spot = (p: Pawn): Vec3 => {
      const [fx, fz] = forwardXZ(p.state.yaw);
      return [p.state.x + fx * out, p.state.y + d.sizeM[1] / 2, p.state.z + fz * out];
    };
    for (const [shell, entry] of this.barriers) {
      const g = this.sim.gadgets.get(entry);
      if (idle.has(shell) && g) {
        // A shell moved (a lab tool, a test) takes its barrier with it.
        const p = this.sim.pawns.get(shell)!;
        const at = spot(p);
        if (Math.hypot(at[0] - g.pos[0], at[1] - g.pos[1], at[2] - g.pos[2]) > 0.05 || Math.abs(wrapAngle(p.state.yaw - g.yaw)) > 0.01) this.sim.gadgets.update(entry, { pos: at, yaw: p.state.yaw });
        continue;
      }
      if (!idle.has(shell)) this.sim.gadgets.remove(entry);
      this.barriers.delete(shell);
    }
    for (const id of idle) {
      if (this.barriers.has(id)) continue;
      const p = this.sim.pawns.get(id)!;
      const s = p.state;
      const g = this.sim.gadgets.add({
        kind: kindOf(d.id),
        owner: p.ownerId ?? 0,
        team: p.team,
        pos: spot(p),
        yaw: s.yaw,
        vel: [0, 0, 0],
        flags: GFlag.OnFloor,
        panel: -1,
        launchTick: 0,
        fuseEnd: 0,
        signalEnd: 0,
        readyAt: 0,
        offEnd: 0,
        seq: 0,
      });
      this.barriers.set(id, g.id);
    }
  }

  /** Each Kludge drone's hacks left (Phase 8 M8; by its pawn id, from its data's `charges`). */
  private readonly kludgeCharges = new Map<number, number>();
  /** Skopós's idle shells a Kludge's hack has overheating (Phase 8 M8): the tick each burns out, and who did it. */
  private readonly overheats = new Map<number, { end: number; by: Attacker }>();

  /**
   * Kludge drones' hacks (Phase 8 M8; research/operators/brava.md §3; gadgets/hack.ts): driving her own Kludge, Fire held
   * on the other side's device in view within range starts one (not while it's jammed or EMP'd, nor with no hacks
   * left); it runs while Fire is held, the Kludge stays within range of it (it needn't see it), and isn't jammed,
   * EMP'd or destroyed; done after `hackS`, its result (hackDone) and one hack spent. Fire is let go before the next.
   */
  private hacks(applied: ReadonlyMap<number, { m: Member; input: QueuedInput }>) {
    for (const { m, input } of applied.values()) {
      const c = m.ctrl;
      const fire = (input.cmd.buttons & Btn.Fire) !== 0;
      const kludge = c && c.drone && c.pawnIds.includes(c.drone) ? this.sim.pawns.get(c.drone) : undefined;
      const k = kludge ? kludgeOf(this.sim.data, kludge) : null;
      const working = kludge !== undefined && k !== null && kludge.state.mode === PawnMode.Walk && kludge.state.jammed === 0 && !pawnJammed(this.sim, kludge);
      const left = (id: number) => this.kludgeCharges.get(id) ?? k?.charges ?? 0;
      const tell = (stage: 0 | 1 | 2, id: number, n: number) => m.events.push({ kind: "hack", stage, kludge: id, ticks: n, left: left(id) });
      if (m.hack) {
        const h = m.hack;
        const at = working && kludge.id === h.kludge ? hackTargetPos(this.sim, h.target, kludge.team) : null;
        const s = kludge?.state;
        const near = at !== null && s !== undefined && Math.hypot(at[0] - s.x, at[1] - s.y, at[2] - s.z) <= k!.rangeM;
        if (!fire || !near) {
          m.hack = null;
          m.hackHeld = fire;
          tell(2, h.kludge, 0);
          continue;
        }
        if (++h.ticks < ticks(k!.hackS)) continue;
        m.hack = null;
        m.hackHeld = true;
        this.kludgeCharges.set(kludge!.id, left(kludge!.id) - 1);
        this.hackDone(kludge!, k!, h.target, { ctrlId: c!.id, team: kludge!.team, weaponId: "kludge_drone", origin: [s!.x, s!.y, s!.z] });
        tell(1, kludge!.id, 0);
        continue;
      }
      if (!fire) m.hackHeld = false;
      if (!fire || m.hackHeld || !working || left(kludge.id) <= 0) continue;
      const view = this.sim.viewOf(c!);
      if (!view) continue;
      const team = kludge.team;
      const target = hackTargetFor(this.sim, kludge, k, view, (from, to) => smokeOnSegment(this.sim.data, this.sim.gadgets, from, to) !== null || this.barrierBetween(team, from, to));
      if (!target) continue;
      m.hack = { kludge: kludge.id, target, ticks: 0 };
      tell(0, kludge.id, ticks(k.hackS));
    }
  }

  /**
   * A Kludge's hack done (Phase 8 M8; research/operators/brava.md §4): a device of the other side's that can be controlled
   * switches sides (a default camera's bit in `matchRules.camsHacked`, an entry's team); one that can't (a Nitro Cell)
   * is disabled and fizzles `destroyS` later; Skopós's idle shell overheats, `overheatS` from now unless she wakes it.
   */
  private hackDone(kludge: Pawn, k: KludgeData, t: HackTarget, by: Attacker) {
    if (t.kind === "camera") {
      const bits = 1 << t.index;
      if (this.director) this.director.camerasHacked(bits);
      else this.sim.matchRules.camsHacked |= bits;
      return;
    }
    if (t.kind === "shell") {
      const shell = this.sim.pawns.get(t.pawnId);
      if (!shell) return;
      this.overheats.set(shell.id, { end: this.sim.tick + ticks(k.overheatS), by });
      const owner = shell.ownerId !== null ? this.memberOf(shell.ownerId) : null;
      owner?.events.push({ kind: "overheat", pawnId: shell.id, ticks: ticks(k.overheatS) });
      return;
    }
    const g = this.sim.gadgets.get(t.id);
    const how = g && this.sim.data.gadgets.get(kindId(g.kind) ?? "")?.hack;
    if (!g || !how) return;
    if (how === "convert") this.sim.gadgets.update(g.id, { team: kludge.team, flags: g.flags & ~GFlag.Active });
    else this.gadgetServer.fizzle(g, ticks(k.destroyS));
  }

  /**
   * Skopós's idle shells overheating (Phase 8 M8): woken (she swapped into it) the overheat's over; still idle when it
   * burns out, it's destroyed (she lives on in the other, but can't swap any more).
   */
  private overheating() {
    for (const [id, o] of this.overheats) {
      const shell = this.sim.pawns.get(id);
      if (!shell || shell.state.mode === PawnMode.Dead || !isIdleShell(this.sim, shell)) {
        this.overheats.delete(id);
        continue;
      }
      if (this.sim.tick < o.end) continue;
      this.overheats.delete(id);
      this.hurt(shell, { amount: shell.state.hp, kill: true }, { cause: Cause.Gadget, attacker: o.by, headshot: false });
    }
  }

  /**
   * EMP darts (Phase 7 M5, intel/DESIGN.md §4): the gadget key pressed on a working Bulletproof Camera whose dart is
   * ready, by a defender still alive (the dead watch but don't fire: research/intel.md §4), fires it along the view.
   * It bursts on the first enemy drone or surface it meets (or at `dartRangeM`), jams every enemy drone within
   * `dartRadiusM` for `disableS` (their owners get a correction), and is ready again `dartRechargeS` later. Everyone
   * sees the burst.
   */
  private darts(applied: ReadonlyMap<number, { m: Member; input: QueuedInput }>) {
    const k = this.sim.data.intel.bulletproofCamera;
    const size = this.sim.data.intel.drone.sizeM;
    for (const { m, input } of applied.values()) {
      const down = (input.cmd.buttons & Btn.Gadget) !== 0;
      const pressed = down && !m.gadgetHeld;
      m.gadgetHeld = down;
      const c = m.ctrl;
      if (!pressed || !c?.cam) continue;
      const i = c.cam - 1;
      const cam = this.sim.bpCamAt(i);
      const body = this.sim.pawns.get(c.possessedPawnId);
      // Only a defender's own: attackers watching one a Kludge hacked can't fire it (Phase 8 M8; Fandom's BP camera page).
      if (!cam || !this.sim.camWorks(i) || this.sim.tick < cam.readyAt || !body || body.state.mode === PawnMode.Dead || cam.team !== DEFENSE || body.team !== DEFENSE) continue;
      const view = this.sim.viewOf(c)!;
      const team = this.teamOf(m);
      const drones = [...this.sim.pawns.values()].filter((p) => p.kind === PawnKind.Drone && p.state.mode === PawnMode.Walk && p.team !== team);
      const centre = (p: Pawn): Vec3 => [p.state.x, p.state.y + size[1] / 2, p.state.z];
      const burst = dartBurst(this.sim, k, view.pos, viewDir(view.yaw, view.pitch), drones.map(centre), size[0] / 2);
      // Its burst is an EMP (DSEG, Phase 8 M3): the attackers' drones, bodies and electronic gadgets in it.
      this.dseg(team, burst, k.dartRadiusM, k.disableS);
      this.sim.gadgets.update(cam.id, { readyAt: this.sim.tick + ticksOrZero(k.dartRechargeS) });
      const e: GameEvent = { kind: "emp", pos: burst };
      for (const o of this.members.values()) o.events.push(e);
    }
  }

  /**
   * A gadget went off where it is (Phase 8 M2, M3; gadgets/DESIGN.md §5, §6): its blast, its flash, its EMP (smoke stays
   * as a cloud, gadgets/serve.ts). Everyone sees and hears it.
   */
  private goOff(g: Gadget, at: Vec3) {
    const data = this.sim.data.gadgets.get(kindId(g.kind) ?? "");
    if (!data) return;
    if (data.blast) this.explode(g, data.blast, this.creditOf(data), at);
    if (data.stun) this.flash(data.stun, at);
    if (data.emp) this.dseg(g.team, at, data.emp.radiusM, data.emp.seconds);
    this.tellBlast(g.kind, at);
  }

  /** The weapon a gadget's blast is credited to: a cluster charge's grenade's to the charge (Phase 8 M5). */
  private creditOf(data: GadgetData): string {
    for (const d of this.sim.data.gadgets.values()) if (d.cluster?.grenade === data.id) return d.id;
    return data.id;
  }

  /** Everyone sees and hears a gadget (or an ingredient) go off there (the client's effects, by its kind). */
  private tellBlast(kind: number, at: Vec3) {
    const ev: GameEvent = { kind: "blast", gadget: kind, pos: [at[0], at[1], at[2]] };
    for (const m of this.members.values()) m.events.push(ev);
  }

  /**
   * A blast (gadgets/blast.ts): its damage now, credited to its gadget's owner (their own bodies always; teammates by
   * the friendly fire rules, as bullets: off, scaled, or reflected on its owner; an ingredient's belongs to nobody; a
   * drone is a gadget to it, either side's, Phase 8 M5), its cuts with this tick's panel ops, and what it destroys.
   */
  private explode(g: Gadget, blast: BlastData, weaponId: string, at: Vec3) {
    const fx = blastEffects(this.sim, g, blast, at);
    const owner = g.owner ? this.memberOf(g.owner) : null;
    const attacker: Attacker = { ctrlId: g.owner, team: g.owner ? g.team : NEUTRAL, weaponId, origin: [at[0], at[1], at[2]] };
    for (const { pawn, damage, guard } of fx.bodies) {
      // Fuze's shield knocked aside by it (Phase 8 M11), whoever's blast it is.
      if (guard) this.guardBreak(pawn);
      const own = g.owner !== 0 && pawn.ownerId === g.owner;
      const friendly = !own && pawn.team === attacker.team && pawn.kind !== PawnKind.Drone;
      if (friendly && !this.friendlyFireOn()) continue;
      if (this.director?.safeguarded(pawn)) continue;
      const amount = friendly ? Math.round(damage * this.rules.friendlyFire.scale) : damage;
      if (amount <= 0) continue;
      if (friendly && owner?.reflect) {
        const body = owner.ctrl && this.sim.pawns.get(owner.ctrl.possessedPawnId);
        if (body) this.hurt(body, { amount, kill: false }, { cause: Cause.Reflect, attacker: null, headshot: false });
        continue;
      }
      const r = this.hurt(pawn, { amount, kill: false }, { cause: Cause.Explosive, attacker, headshot: false });
      if (friendly && owner && r.outcome !== "ignored") {
        owner.teamDamage += r.removed;
        if (this.rules.reverseFriendlyFire.enabled && owner.teamDamage >= this.rules.reverseFriendlyFire.thresholdHp) owner.reflect = true;
      }
    }
    for (const o of fx.panelOps) this.queuePanelOp(o.panel, o.op);
    for (const e of fx.gadgets) this.gadgetServer.blastHit(e);
  }

  /**
   * A stun's flash (Phase 8 M3; research/gadgets.md §3.5), for everyone in sight of it, either side's, but not those on
   * a camera, a drone or Skopós's shell camera: facing it, blinded fully within `fullM` and less out to `maxM`; facing
   * away, half within `behindM`; ears ringing within `ringM`, whatever the facing. Each one's own client is told.
   */
  private flash(k: StunData, at: Vec3) {
    for (const m of this.members.values()) {
      const c = m.ctrl;
      if (!c || c.cam !== 0 || c.drone !== 0 || c.shellCam || c.swapPhase !== 0) continue;
      const body = this.sim.pawns.get(c.possessedPawnId);
      if (!body || body.kind !== PawnKind.Body || body.state.mode === PawnMode.Dead) continue;
      const eye = eyePose(this.sim.data.movement, this.sim.data.hitboxes, body.state).pos;
      const d: Vec3 = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
      const dist = Math.hypot(d[0], d[1], d[2]);
      let blind = 0;
      if (dist <= k.maxM && this.flashSeen(eye, at)) {
        const look = viewDir(body.state.yaw, body.state.pitch);
        const facing = dist < 1e-6 || (d[0] * look[0] + d[1] * look[1] + d[2] * look[2]) / dist > 0;
        if (facing) blind = dist <= k.fullM ? 1 : (k.maxM - dist) / Math.max(1e-6, k.maxM - k.fullM);
        else if (dist <= k.behindM) blind = 0.5;
      }
      const ring = dist <= k.ringM;
      if (blind > 0 || ring) m.events.push({ kind: "stunned", seconds: k.seconds, blind, ring, concuss: false });
      // A stun always knocks Fuze's shield aside (a concussion's guard break is 100%, weapons_notes.md §5; Phase 8 M11).
      if (blind > 0 || ring) this.guardBreak(body);
    }
  }

  /** Whether a flash at `at` reaches an eye: the level, props and panels' material stop it; a deployable shield's slits don't. */
  private flashSeen(eye: Vec3, at: Vec3): boolean {
    const d: Vec3 = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) return true;
    const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
    const ray = new this.sim.R.Ray({ x: eye[0], y: eye[1], z: eye[2] }, { x: dir[0], y: dir[1], z: dir[2] });
    if (this.sim.world.castRay(ray, len - 0.05, true, undefined, QUERY_FLASH)) return false;
    return this.sim.level.panels.firstSolid(eye, dir, len - 0.05) === null;
  }

  /**
   * An EMP's DSEG (Phase 8 M3, gadgets/electronics.ts): applied; those whose bodies or drones it jammed get a
   * correction; the default cameras it reached are off for its time.
   */
  private dseg(team: number, at: Vec3, radiusM: number, seconds: number) {
    const hit = this.gadgetServer.emp(team, at, radiusM, seconds);
    for (const p of hit.pawns) {
      const owner = p.ownerId !== null ? this.memberOf(p.ownerId) : null;
      if (owner) this.force(owner);
    }
    const end = this.sim.tick + ticks(seconds);
    for (let i = 0; i < 32; i++) if (hit.cams & (1 << i)) this.camOffEnd[i] = Math.max(this.camOffEnd[i] ?? 0, end);
    this.camsOffNow();
  }

  /** When an EMP turned each default camera off until (server ticks; Phase 8 M3). */
  private camOffEnd: number[] = [];

  /** The default cameras an EMP has off now: in a match everyone's told when that changes. */
  private camsOffNow() {
    let bits = 0;
    this.camOffEnd.forEach((end, i) => void (end > this.sim.tick && (bits |= 1 << i)));
    if (this.director) this.director.camerasOff(bits);
    else this.sim.matchRules.camsOff = bits;
  }

  /** Whether the other side's observation blocker (on, not in flight) stands between an observation tool and a point. */
  private barrierBetween(team: number, from: Vec3, to: Vec3): boolean {
    for (const g of this.sim.gadgets.list) {
      const d = this.sim.data.gadgets.get(kindId(g.kind) ?? "");
      if (!d?.barrier || g.team === team || g.flags & (GFlag.Flying | GFlag.Off)) continue;
      if (crossesBarrier(barrierOf(this.sim, d.barrier, g, d.sizeM), from, to) !== null) return true;
    }
    return false;
  }

  /** Damage from a gadget over time (barbed wire, a gas pipe's jet or fire), credited to its owner (an ingredient's to nobody). */
  private gadgetHurt(g: Gadget, pawn: Pawn, amount: number) {
    if (this.director?.safeguarded(pawn)) return;
    const attacker: Attacker = { ctrlId: g.owner, team: g.owner ? g.team : NEUTRAL, weaponId: kindId(g.kind) ?? "", origin: [g.pos[0], g.pos[1], g.pos[2]] };
    this.hurt(pawn, { amount, kill: false }, { cause: Cause.Gadget, attacker, headshot: false });
  }

  /** An alarm (or a metal detector) started or stopped sounding: everyone hears it; the body that set it off sees it marked. */
  private alarm(g: Gadget, by: Pawn | null) {
    const e: GameEvent = { kind: "alarm", gadget: g.id, pos: [g.pos[0], g.pos[1], g.pos[2]], on: by !== null, pawnId: by?.id ?? 0 };
    for (const m of this.members.values()) m.events.push(e);
  }

  /**
   * An ingredient's stage (Phase 8 M3, gadgets/DESIGN.md §9): a fire extinguisher's burst concusses those close by; a
   * gas pipe goes off. Everyone sees and hears it.
   */
  private ingredientStage(g: Gadget, stage: IngredientStage) {
    const k = this.sim.data.gadgetRules.ingredients;
    if (stage === "burst") this.concuss(g.pos, k.fire_extinguisher.concuss.radiusM, k.fire_extinguisher.concuss.seconds);
    if (stage === "blast") this.explode(g, k.gas_pipe.blast, "gas_pipe", g.pos);
    // (A jet is drawn from the table, for as long as it lasts.)
    if (stage !== "jet") this.tellBlast(g.kind, g.pos);
  }

  /** Bodies within `radiusM` of `at` and in sight of it are concussed for `seconds`: their own clients are told. */
  private concuss(at: Vec3, radiusM: number, seconds: number) {
    for (const m of this.members.values()) {
      const body = m.ctrl ? this.sim.pawns.get(m.ctrl.possessedPawnId) : undefined;
      if (!body || body.kind !== PawnKind.Body || body.state.mode === PawnMode.Dead || pawnDistance(this.sim, body, at) > radiusM) continue;
      if (!this.flashSeen(eyePose(this.sim.data.movement, this.sim.data.hitboxes, body.state).pos, at)) continue;
      m.events.push({ kind: "stunned", seconds, blind: 0, ring: true, concuss: true });
      this.guardBreak(body);
    }
  }

  /** No gadget left but the level's ingredients, put back as new (a match's prep, the lab's Clear gadgets). */
  resetGadgets(): void {
    this.gadgetServer.clear();
    this.camOffEnd = [];
    this.camsOffNow();
    this.placeIngredients();
    // Dokkaebi's (Phase 8 M9): no call or phone hack left over, no fire burning (a match's director lends no cameras now).
    for (const st of this.jegeoState.values()) {
      const called = st.upload ? this.sim.pawns.get(st.upload.target) : undefined;
      if (called) this.ringing(called.ownerId !== null ? this.memberOf(called.ownerId) : null, called, false);
    }
    this.jegeoState.clear();
    this.jegeoCooldown.clear();
    this.spottedUntil.clear();
    this.phonesHacked.clear();
    this.fires = [];
    this.camsLentUntil = 0;
    if (!this.director) this.sim.matchRules.camsLent = false;
  }

  /** The level's ingredients (Phase 8 M3) into the table, each owned by nobody (a metal detector is the defenders' to an EMP). */
  private placeIngredients() {
    for (const ing of this.sim.level.def.ingredients) {
      const team = ing.kind === "metal_detector" ? DEFENSE : 0;
      const base = { owner: 0, team, vel: [0, 0, 0] as Vec3, flags: 0, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: 0 };
      this.sim.gadgets.add({ ...base, kind: kindOf(ing.kind), pos: [ing.pos[0], ing.pos[1], ing.pos[2]], yaw: ing.yawDeg * DEG });
    }
  }

  /** Whether one bullet or a knife destroys this entry (its data's `fragile`; not in the air). */
  private fragile(g: Gadget): boolean {
    return !(g.flags & GFlag.Flying) && (this.sim.data.gadgets.get(kindId(g.kind) ?? "")?.fragile ?? false);
  }

  /** Whether a bullet sets this entry off: a level ingredient not yet going or spent; a metal detector (destroyed), beeping or not. */
  private ignitable(g: Gadget): boolean {
    if (!isIngredient(g.kind)) return false;
    return kindId(g.kind) === "metal_detector" || !(g.flags & (GFlag.Active | GFlag.Broken));
  }

  /** A bullet's (or a knife's) gadget: an ingredient set off, the rest destroyed. */
  private strike(g: Gadget) {
    if (isIngredient(g.kind)) this.gadgetServer.ignite(g);
    else this.gadgetServer.destroy(g);
  }

  /** What a knife does something to: a fragile gadget, barbed wire, a solid one's clear glass, a fire extinguisher or a metal detector. */
  private knifeable(g: Gadget): boolean {
    if (g.flags & GFlag.Flying) return false;
    const d = this.sim.data.gadgets.get(kindId(g.kind) ?? "");
    if (d) return d.fragile || d.wire !== undefined || (d.solid && !(g.flags & (GFlag.Hit | GFlag.Broken)));
    return this.ignitable(g) && kindId(g.kind) !== "gas_pipe";
  }

  /** A knife hit on a gadget (research/gadgets.md §4): wire takes `knifeHits` of them; a shield's glass goes opaque. */
  private knifed(g: Gadget) {
    const d = this.sim.data.gadgets.get(kindId(g.kind) ?? "");
    // A Gu mine knifed goes off: whoever's close (the knifer, surely) is needled (Phase 8 M10; lesion.md).
    if (d?.gu) this.gadgetServer.sting(g);
    else if (d?.wire) {
      if (d.wire.knifeHits <= 1 || g.flags & GFlag.Hit) this.gadgetServer.destroy(g);
      else this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Hit });
    } else if (d?.solid) this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Hit });
    else this.strike(g);
  }

  /** A callout off the comm wheel (Phase 7): to the caller's team, at most two a second. */
  onCallout(memberId: number, id: number): void {
    const m = this.members.get(memberId);
    if (!m || id >= this.sim.data.intel.callouts.length || this.sim.tick - m.lastCallout < ticksOrZero(0.5)) return;
    m.lastCallout = this.sim.tick;
    const e: GameEvent = { kind: "callout", name: m.name, id };
    const team = this.teamOf(m);
    for (const o of this.members.values()) if (this.teamOf(o) === team) o.events.push(e);
  }

  /** Judge the shots of the step just taken; `applied` is each member's input in that step. */
  private judgeEvents(applied: ReadonlyMap<number, { m: Member; input: QueuedInput }>) {
    this.scans(applied);
    this.darts(applied);
    this.hacks(applied);
    this.overheating();
    this.jegeo(applied);
    this.shellShields();
    for (const e of this.sim.events) {
      if (e.kind === "ping") this.ping(e.ctrlId, e.pos, e.gadget, e.heart ?? false);
      if (e.kind !== "shot" && e.kind !== "meleeImpact" && e.kind !== "swing") continue;
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
        if (m && input && e.kind === "meleeImpact") this.judgeMeleeImpact(m, input, e);
        else if (m && input && e.kind === "swing") this.judgeSwing(m, input, e);
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
    // Bots (Phase 9): the navigation caught up with last tick's walls and gadgets (a chunk or so a tick), then each
    // brain's input for this tick, queued as a client's would arrive (it sees the present).
    this.nav?.step();
    this.plans();
    for (const m of this.members.values()) if (m.bot) this.botInput(m);
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
          if (!m.stalled) this.stats.stalls++;
          m.stalled = true;
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
    this.shieldDashes();
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
    this.checkReviveLinks();
    this.reviveDummies();
    // Gadgets in flight, fuses and outdoor signals (Phase 8), then a match's clock and what its phases do with bodies;
    // its state goes out before this tick's snapshot.
    this.gadgetServer.step();
    this.camsOffNow();
    this.director?.step();
    this.history.record();
    this.stats.ticks++;
    if (this.sim.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
    this.flushEvents();
  }

  /** The bots' team planners: a defense plan as each round's prep starts (Phase 9 M4), kept through its action. */
  private plans() {
    const m = this.director?.match;
    if (!m || !this.nav) return;
    const live = m.phase === Phase.Prep || m.phase === Phase.Action || m.phase === Phase.PostPlant;
    if (!live) {
      if (m.phase !== Phase.RoundEnd) this.defensePlan = this.attackPlan = null;
      return;
    }
    if (this.planRound !== m.round) {
      this.planRound = m.round;
      const ctrlOf = (id: number) => this.members.get(id)?.ctrl?.id ?? 0;
      const bots = m.sides[DEFENSE].filter((id) => this.members.get(id)?.bot);
      const strat = this.sim.data.bots.strats.get(this.levelId)?.sites[m.site ?? ""] ?? null;
      this.defensePlan = bots.length && m.site ? new DefensePlanner(this.sim, this.nav, m, m.site, strat, bots, new BotRng(this.seed, 0xd3f + m.round), ctrlOf) : null;
      const attackers = m.sides[ATTACK].filter((id) => this.members.get(id)?.bot);
      this.attackPlan = attackers.length ? new AttackPlanner(this.sim, this.nav, m, attackers, new BotRng(this.seed, 0xa7c + m.round), ctrlOf) : null;
    }
    this.defensePlan?.step();
  }

  /**
   * The snapshots a member's shots are judged against (lag compensation: only those its client drew from); a bot has
   * none sent and sees the world as the room records it (Phase 9).
   */
  private sentOf(m: Member): SentRing | undefined {
    return m.bot ? undefined : m.sent;
  }

  /** A bot's input for this tick, queued as its client's would arrive, made with the newest state (no view lag). */
  private botInput(m: Member) {
    const bot = m.bot!;
    const cmd = bot.think(m.botWorld ??= this.botWorld(m), m.ctrl);
    if (!cmd || !m.ctrl) return;
    const now = this.sim.tick;
    m.lastQueuedSeq++;
    m.lags[m.lagAt] = 0;
    m.lagAt = (m.lagAt + 1) % LAG_WINDOW;
    m.queue.push({ cmd: { ...cmd, seq: m.lastQueuedSeq }, predictedHash: 0, epoch: m.epoch & 0xff, snapTick: now & 0xffff, viewBackQ8: 0, receivedTick: now });
  }

  /** What a bot reads and does through the room: the same choices its member's client could send. */
  private botWorld(m: Member): BotWorld {
    const room = this;
    return {
      sim: this.sim,
      get match() {
        return room.director?.match ?? null;
      },
      get nav() {
        return room.nav;
      },
      board: (team) => this.botBoards[team === 1 ? 1 : 0],
      taskOf: () => {
        const side = this.director?.match.sideOf(m.id);
        return side === DEFENSE ? (this.defensePlan?.taskOf(m.id) ?? null) : side === ATTACK ? (this.attackPlan?.taskOf(m.id) ?? null) : null;
      },
      report: (ok) => this.defensePlan?.report(m.id, ok),
      pick: (pick) => this.pickLoadout(m.id, pick),
      act: (a) => this.onMatchAction(m.id, a),
    };
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
      if (m.bot) {
        m.bot.hear(m.events);
        m.events = [];
        continue;
      }
      if (m.client.buffered() > MAX_BUFFERED_EVENTS) {
        m.client.close?.(1008, "not reading"); // policy violation
        m.events = [];
        continue;
      }
      m.client.send(encodeEvents(this.sim.tick, m.events));
      m.events = [];
    }
  }

  /**
   * Each member's snapshot, just after the panel ops applied since the last one (with the panels' hash
   * after them). Ops ride with snapshots (D-066): the newest snapshot tick a client's input names is then
   * also the newest panel state it had, which its shots are judged against. A member not sent its snapshot
   * isn't sent the ops either, until it is.
   */
  private sendSnapshots() {
    const all = new Map<number, RemoteQ>();
    // A drone in its owner's hand (Phase 7) isn't in the world: nobody else hears of it until it's thrown.
    for (const p of this.sim.pawns.values()) if (p.state.mode !== PawnMode.Held) all.set(p.id, quantizeRemote(p.state));
    const tick = this.sim.tick;
    const hash = this.unsentOps.length ? this.sim.level.panels.hash() : 0;
    let shared: Uint8Array | null = null;
    const ops = this.unsentOps;
    this.unsentOps = [];
    // The gadget table's ops since the last snapshot (Phase 8), the same message for everyone who had every op before.
    const gadgetOps = this.sim.gadgets.takeOps();
    let gadgetMsg: Uint8Array | null = null;
    for (const m of this.members.values()) {
      if (m.bot) {
        // Nothing goes down a bot's connection: it reads the room itself.
        m.opsHad = 0;
        m.opsHeld = [];
        m.idled = false;
        continue;
      }
      const fresh = m.opsHad ? ops.slice(m.opsHad) : ops;
      const mine = m.opsHeld === null ? null : m.opsHeld.length ? m.opsHeld.concat(fresh) : fresh;
      m.opsHad = 0;
      if (m.client.buffered() > MAX_BUFFERED) {
        this.stats.skippedSnapshots++;
        m.opsHeld = mine && mine.length <= MAX_HELD_OPS ? mine : null;
        if (gadgetOps.length) m.gadgetsStale = true;
        continue; // never encode a snapshot that isn't sent: deltas are against what was sent
      }
      m.opsHeld = [];
      if (mine === null) m.client.send(encodePanelState(this.sim.level.panels));
      else if (mine === ops && ops.length) m.client.send((shared ??= encodePanelOps({ tick, ops, hash })));
      else if (mine.length) m.client.send(encodePanelOps({ tick, ops: mine, hash: this.sim.level.panels.hash() }));
      if (m.gadgetsStale) {
        m.gadgetsStale = false;
        m.client.send(encodeGadgetState(this.sim.gadgets.list));
      } else if (gadgetOps.length) m.client.send((gadgetMsg ??= encodeGadgetOps({ tick, ops: gadgetOps, hash: this.sim.gadgets.hash() })));
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
