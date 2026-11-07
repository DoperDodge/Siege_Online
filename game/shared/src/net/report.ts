// Training feedback (Phase 9 M9, bots/DESIGN.md §11; PLAN §15.5): what happened to each person in a round, sent to
// them as it ends (a RoundReport message): where they died, to whom and with what; who saw them first (bots log who
// noticed them, when and from where); the damage they dealt and took, by whom; their time to plant or disable; the
// gadgets they used; and their drill's score. The room feeds a RoundReporter as things happen; the client shows the
// report and keeps stats from it (per drill and per operator).
import { TICK_HZ } from "../core/constants.js";
import type { Vec3 } from "../core/math.js";
import { ByteReader, ByteWriter, ProtocolError } from "./bytes.js";
import { Msg } from "./protocol.js";

/** One person's round. Times are seconds from the action phase's start; damage in hit points. */
export interface RoundReport {
  round: number;
  /** The format (a drill's id, or "bot_training"…) and the drill's kind, if one. */
  format: string;
  drill: string | null;
  side: "attack" | "defense";
  operator: string;
  won: boolean;
  /** How long the round's action (and post-plant) lasted. */
  seconds: number;
  death: { t: number; at: Vec3; room: string | null; by: string; weapon: string; headshot: boolean } | null;
  /** The first enemy who noticed you: who, when, from where and how far. */
  firstSeen: { t: number; by: string; at: Vec3; room: string | null; distM: number } | null;
  dealt: { to: string; hp: number }[];
  taken: { from: string; hp: number }[];
  kills: number;
  /** Seconds from the action's start to your plant; from the plant to your disable. */
  plantS: number | null;
  disableS: number | null;
  /** The gadgets you used (thrown, placed, swung), how many of each. */
  utility: { gadget: string; n: number }[];
  /** The drill's own numbers: the duel's time to kill, defenders found of all, time to clear… (−1: not done). */
  score: Record<string, number>;
}

/** A report's JSON is at most this long. */
const MAX_REPORT_JSON = 16384;

export function encodeRoundReport(r: RoundReport): Uint8Array {
  const json = JSON.stringify(r);
  if (json.length > MAX_REPORT_JSON) throw new Error("round report too long");
  return new ByteWriter(json.length + 8).u8(Msg.RoundReport).str(json).finish();
}

export function decodeRoundReport(r: ByteReader): RoundReport {
  let v: unknown;
  try {
    v = JSON.parse(r.str(MAX_REPORT_JSON));
  } catch {
    throw new ProtocolError("bad round report");
  }
  const o = v as RoundReport;
  if (!o || typeof o !== "object" || typeof o.round !== "number" || !Array.isArray(o.dealt) || !Array.isArray(o.taken) || !Array.isArray(o.utility) || typeof o.score !== "object") throw new ProtocolError("bad round report");
  return o;
}

/** What a round did to each controller (a body's player), as the room tells it; read back as each person's report. */
export class RoundReporter {
  /** The tick the action phase started (times count from it), the plant's tick. */
  actionAt = 0;
  plantedAt: number | null = null;
  private readonly firstSeen = new Map<number, { by: number; tick: number; at: Vec3; target: Vec3 }>();
  private readonly dealt = new Map<number, Map<number, number>>();
  private readonly taken = new Map<number, Map<number, number>>();
  private readonly deaths = new Map<number, { tick: number; at: Vec3; killer: number; weapon: string; headshot: boolean }>();
  private readonly kills = new Map<number, number[]>();
  private readonly used = new Map<number, Map<string, number>>();
  private readonly plants = new Map<number, number>();
  private readonly disables = new Map<number, number>();

  /** A new round's action: nothing remembered. */
  reset(tick: number): void {
    this.actionAt = tick;
    this.plantedAt = null;
    for (const m of [this.firstSeen, this.dealt, this.taken, this.deaths, this.kills, this.used, this.plants, this.disables]) m.clear();
  }

  damage(victimCtrl: number, attackerCtrl: number, hp: number): void {
    if (hp <= 0 || victimCtrl === attackerCtrl) return;
    const add = (map: Map<number, Map<number, number>>, a: number, b: number) => {
      let m = map.get(a);
      if (!m) map.set(a, (m = new Map()));
      m.set(b, (m.get(b) ?? 0) + hp);
    };
    if (attackerCtrl) add(this.dealt, attackerCtrl, victimCtrl);
    add(this.taken, victimCtrl, attackerCtrl);
  }

  death(victimCtrl: number, at: Vec3, tick: number, killerCtrl: number, weapon: string, headshot: boolean): void {
    if (!this.deaths.has(victimCtrl)) this.deaths.set(victimCtrl, { tick, at: [at[0], at[1], at[2]], killer: killerCtrl, weapon, headshot });
    if (killerCtrl && killerCtrl !== victimCtrl) {
      const k = this.kills.get(killerCtrl) ?? [];
      k.push(tick);
      this.kills.set(killerCtrl, k);
    }
  }

  /** An enemy (bot member `by`, standing at `at`) noticed the body of controller `ctrl` (standing at `target`). */
  seen(ctrl: number, by: number, tick: number, at: Vec3, target: Vec3): void {
    if (!this.firstSeen.has(ctrl)) this.firstSeen.set(ctrl, { by, tick, at: [at[0], at[1], at[2]], target: [target[0], target[1], target[2]] });
  }

  gadget(ctrl: number, gadget: string): void {
    let m = this.used.get(ctrl);
    if (!m) this.used.set(ctrl, (m = new Map()));
    m.set(gadget, (m.get(gadget) ?? 0) + 1);
  }

  plant(ctrl: number, tick: number): void {
    this.plants.set(ctrl, tick);
    this.plantedAt = tick;
  }

  disable(ctrl: number, tick: number): void {
    this.disables.set(ctrl, tick);
  }

  /** When a controller's first kill came (tick), or null. */
  firstKill(ctrl: number): number | null {
    return this.kills.get(ctrl)?.[0] ?? null;
  }

  died(ctrl: number): boolean {
    return this.deaths.has(ctrl);
  }

  /**
   * The report for controller `ctrl`, the round over at `endTick`: `name` names a controller (or a member, for a
   * bot that noticed), `roomOf` a point's room; the rest is what the room knows of the round.
   */
  build(
    ctrl: number,
    endTick: number,
    o: { round: number; format: string; drill: string | null; side: "attack" | "defense"; operator: string; won: boolean; score: Record<string, number> },
    name: (ctrl: number) => string,
    memberName: (memberId: number) => string,
    roomOf: (p: Vec3) => string | null,
  ): RoundReport {
    const t = (tick: number) => Math.round(((tick - this.actionAt) / TICK_HZ) * 10) / 10;
    const d = this.deaths.get(ctrl);
    const s = this.firstSeen.get(ctrl);
    const list = (m: Map<number, number> | undefined) => [...(m ?? new Map<number, number>())].sort((a, b) => b[1] - a[1]).map(([c, hp]) => ({ c, hp: Math.round(hp) }));
    const plant = this.plants.get(ctrl);
    const disable = this.disables.get(ctrl);
    return {
      round: o.round,
      format: o.format,
      drill: o.drill,
      side: o.side,
      operator: o.operator,
      won: o.won,
      seconds: t(endTick),
      death: d ? { t: t(d.tick), at: d.at, room: roomOf(d.at), by: d.killer ? name(d.killer) : "", weapon: d.weapon, headshot: d.headshot } : null,
      firstSeen: s ? { t: t(s.tick), by: memberName(s.by), at: s.at, room: roomOf(s.at), distM: Math.round(Math.hypot(s.at[0] - s.target[0], s.at[1] - s.target[1], s.at[2] - s.target[2]) * 10) / 10 } : null,
      dealt: list(this.dealt.get(ctrl)).map(({ c, hp }) => ({ to: name(c), hp })),
      taken: list(this.taken.get(ctrl)).map(({ c, hp }) => ({ from: c ? name(c) : "", hp })),
      kills: this.kills.get(ctrl)?.length ?? 0,
      plantS: plant !== undefined ? t(plant) : null,
      disableS: disable !== undefined && this.plantedAt !== null ? Math.round(((disable - this.plantedAt) / TICK_HZ) * 10) / 10 : null,
      utility: [...(this.used.get(ctrl) ?? new Map<string, number>())].map(([gadget, n]) => ({ gadget, n })),
      score: o.score,
    };
  }
}
