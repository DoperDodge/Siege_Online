// A bot's brain (Phase 9, bots/DESIGN.md §1, §5): each tick, the input a player's client would send for its body, and
// the choices a player makes on the planning screens, from what its team could know. M1: the choices, and a body
// that stands its ground looking about; moving, seeing and fighting come with M2 and M3.
import { TICK_HZ } from "../core/constants.js";
import { wrapAngle } from "../core/math.js";
import type { BotLevel } from "../data/schemas.js";
import { Phase, type Match } from "../match/match.js";
import { ATTACK, DEFENSE } from "../match/rules.js";
import type { GameEvent } from "../net/events.js";
import type { MatchAction } from "../net/matchWire.js";
import type { PlayerController } from "../player/pawn.js";
import { PawnMode, Stance, type InputCmd } from "../player/types.js";
import type { Sim } from "../sim.js";
import { defaultLoadoutPick, type LoadoutPick } from "../weapons/loadout.js";
import { BotRng } from "./rng.js";

/** What a bot's input is, less its sequence number (the room numbers it as it queues it). */
export type BotInput = Omit<InputCmd, "seq">;

/** What a bot may read and do, through its room (the same as its member's client could). */
export interface BotWorld {
  readonly sim: Sim;
  /** The match (a match room), or null in a lab room. */
  readonly match: Match | null;
  /** An operator and loadout, as PickLoadout would bring it. */
  pick(pick: LoadoutPick): void;
  /** A round's choice, as MatchAction would bring it. */
  act(a: MatchAction): void;
}

/** How often (ticks) a bot looks at the planning screens. */
const CHOOSE_EVERY = 8;
/** On a team with people, bots pick once those have, or this long before the timer ends (s): people choose first. */
const PICK_LATE_S = 5;

export class Bot {
  level: BotLevel;
  private readonly rng: BotRng;
  /** The round its planning choices were made for, and when it picks its operator (tick; 0: not drawn yet). */
  private round = -1;
  private pickAt = 0;
  private voted = false;
  private spawnChosen = false;
  /** Where it looks while it stands (M1): a yaw it turns toward, and when it picks the next. */
  private lookYaw: number | null = null;
  private lookUntil = 0;
  /** Events its client would have been told since it last thought (M3 reads them). */
  readonly heard: GameEvent[] = [];

  constructor(
    readonly memberId: number,
    level: BotLevel,
    seed: number,
  ) {
    this.level = level;
    this.rng = new BotRng(seed, memberId);
  }

  /** What its client would have been told this tick. */
  hear(events: readonly GameEvent[]): void {
    this.heard.push(...events);
    if (this.heard.length > 256) this.heard.splice(0, this.heard.length - 256);
  }

  /** This tick: the choices a player would make now, and the input for its body (null: no body to steer). */
  think(w: BotWorld, ctrl: PlayerController | null): BotInput | null {
    if (w.match && w.sim.tick % CHOOSE_EVERY === this.memberId % CHOOSE_EVERY) this.choose(w, w.match);
    const pawn = ctrl ? w.sim.pawns.get(ctrl.possessedPawnId) : undefined;
    if (!ctrl || !pawn || ctrl.drone !== 0) return null;
    const s = pawn.state;
    if (s.mode === PawnMode.Dead) return null;
    // M1: stand and look about, turning a little at a time.
    const now = w.sim.tick;
    if (this.lookYaw === null || now >= this.lookUntil) {
      this.lookYaw = wrapAngle(s.yaw + this.rng.range(-1.2, 1.2));
      this.lookUntil = now + Math.round(this.rng.range(1.5, 4) * TICK_HZ);
    }
    const d = wrapAngle(this.lookYaw - s.yaw);
    const turn = Math.sign(d) * Math.min(Math.abs(d), (1.5 * Math.PI) / TICK_HZ);
    return { forward: 0, strafe: 0, yaw: wrapAngle(s.yaw + turn), pitch: s.pitch * 0.9, buttons: 0, stance: Stance.Stand, lean: 0 };
  }

  // ------------------------------------------------------------------ the planning screens

  private choose(w: BotWorld, m: Match) {
    const me = m.players.get(this.memberId);
    const side = m.sideOf(this.memberId);
    if (!me || side === null) return;
    if (m.round !== this.round) {
      this.round = m.round;
      this.pickAt = 0;
      this.voted = false;
      this.spawnChosen = false;
    }
    if (m.phase === Phase.Planning) {
      this.pickOperator(w, m, side);
      if (side === DEFENSE && !this.voted && m.mode.match.site === "vote" && m.fixedSite() === null) {
        this.voted = true;
        // The team's bots agree (the first to vote chooses, the rest follow it): a site at random otherwise.
        const mates = m.sides[DEFENSE].map((id) => m.players.get(id)).filter((p) => p?.bot !== null && p?.siteVote);
        const site = mates[0]?.siteVote ?? this.rng.pick(m.map.sites) ?? null;
        if (site) w.act({ kind: "siteVote", site });
      }
    }
    if ((m.phase === Phase.Planning || m.phase === Phase.Prep) && side === ATTACK && !this.spawnChosen) {
      this.spawnChosen = true;
      const group = this.rng.pick(m.map.spawnGroups);
      if (group) w.act({ kind: "spawn", group });
    }
  }

  /** Its operator: at once on a team of bots; on a team with people, once they've picked or the timer is nearly out. */
  private pickOperator(w: BotWorld, m: Match, side: 0 | 1) {
    const me = m.players.get(this.memberId)!;
    if (me.operator !== null) return;
    const now = w.sim.tick;
    if (this.pickAt === 0) this.pickAt = now + Math.round(this.rng.range(1, 3) * TICK_HZ);
    if (now < this.pickAt) return;
    const people = m.sides[side].map((id) => m.players.get(id)).filter((p) => p && p.bot === null && p.connected);
    const waiting = people.some((p) => p!.operator === null);
    if (waiting && m.ticksLeft(now) > PICK_LATE_S * TICK_HZ) return;
    const allowed = m.allowed(this.memberId);
    const how = m.mode.match.bots?.picks ?? "random";
    const op = how === "fixed" ? allowed[0] : this.rng.pick(allowed);
    if (op) w.pick(defaultLoadoutPick(w.sim.data, op));
  }
}
