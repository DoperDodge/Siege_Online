// A match over time (match/DESIGN.md §2–§8): the lobby, each round's phases and their timers, votes, operator
// picks, the defuser's carrier, the score, the round history and the result. Pure and deterministic: the room
// feeds it the tick, its players' choices and what happened in the simulation, and acts on what it reports back
// (bodies, panels, the wire). Its random draws come from the room's secret seed.
import type { LevelDef, OperatorData } from "../data/schemas.js";
import { hash4 } from "../weapons/spread.js";
import { ticks } from "../weapons/ticks.js";
import { roundOutcome, type WinReason } from "./outcome.js";
import {
  allowedOperators,
  ATTACK,
  attackersIn,
  banLeavesEnough,
  DEFENSE,
  halfOf,
  hasBanPhase,
  isOvertime,
  matchResult,
  other,
  pickSeconds,
  tally,
  type FormatMode,
  type Side,
  type Team,
} from "./rules.js";
import { applyHostChange, type HostChange } from "./settings.js";

export const Phase = { Lobby: 0, Ban: 1, Planning: 2, Prep: 3, Action: 4, PostPlant: 5, RoundEnd: 6, MatchEnd: 7 } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];
export const PHASE_NAMES = ["lobby", "ban", "planning", "prep", "action", "postPlant", "roundEnd", "matchEnd"] as const;

/** A phase with no timer (the lobby, the match end): it waits for the host. */
export const NO_END = 0xffffffff;

export interface MatchPlayer {
  /** The room's member id (a rejoin moves the player to the new connection's id). */
  id: number;
  name: string;
  team: Team;
  ready: boolean;
  connected: boolean;
  /** Join order: slots within a team, and who becomes host next. */
  order: number;
  /** This round's operator (null until picked; the timer picks for those who don't). */
  operator: string | null;
  /** The attackers' spawn group they'll come in at (level.json spawns[].group); kept from round to round. */
  spawn: string | null;
  banVote: string | null;
  siteVote: string | null;
  /** The operator played last round (the auto-pick keeps it when it can). */
  lastOperator: string | null;
  /** 1v1 attrition: the operator this player may not pick this round (won the last one with it). */
  attritionLock: string | null;
  kills: number;
  deaths: number;
  assists: number;
  /** Ranked: the local rating the player's browser sent (D-124), or null. */
  rating: number | null;
}

export interface RoundRecord {
  round: number;
  /** The team that attacked. */
  attackers: Team;
  winner: Team;
  reason: WinReason;
  site: string;
}

/** What changed, for the room to act on. */
export type MatchEvent =
  | { kind: "phase"; phase: Phase; round: number }
  | { kind: "round"; record: RoundRecord }
  | { kind: "match"; winner: Team | null; forfeit: boolean };

/** What the match needs from the level and the roster: the sites, the attackers' spawn groups, each side's operators. */
export interface MatchMap {
  sites: readonly string[];
  spawnGroups: readonly string[];
  /** Operator ids by side ([attackers, defenders]), in roster order (the auto-pick's order). */
  roster: readonly [readonly string[], readonly string[]];
}

/** A level's sites and attackers' spawn groups (level.json), and the operators of each side in data order. */
export function matchMapOf(level: LevelDef, operators: Iterable<OperatorData>): MatchMap {
  const ops = [...operators];
  const groups = level.spawns.filter((s) => s.side === "attack" && s.group).map((s) => s.group!);
  return {
    sites: level.sites.map((s) => s.id),
    spawnGroups: [...new Set(groups)],
    roster: [ops.filter((o) => o.side === "attacker").map((o) => o.id), ops.filter((o) => o.side === "defender").map((o) => o.id)],
  };
}

/** Purposes of the seeded draws (any fixed numbers). */
const ROLL = { first: 1, site: 2, banVote: 3, siteVote: 4 } as const;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class Match {
  readonly players = new Map<number, MatchPlayer>();
  /** The format as the data has it, and with the host's changes. */
  base: FormatMode;
  mode: FormatMode;
  hostId = 0;
  phase: Phase = Phase.Lobby;
  phaseStart = 0;
  phaseEnd = NO_END;
  /** The round being played (from 1); 0 in the lobby. */
  round = 0;
  firstAttackers: Team = 0;
  score: [number, number] = [0, 0];
  history: RoundRecord[] = [];
  /** This round's site, and whether the attackers know which it is. */
  site: string | null = null;
  siteRevealed = false;
  /** The attacker who takes the defuser in (member id), chosen on the planning screen or at action start. */
  carrier: number | null = null;
  /** The tick the defuser was planted, and whether it was then disabled or deactivated. */
  plantedAt: number | null = null;
  disabled = false;
  deactivated = false;
  /** Each side's players this round (member ids in slot order), fixed as the round starts. */
  sides: [number[], number[]] = [[], []];
  /** The result once the match is over: the winner (null: a draw) and whether the other team gave up. */
  winner: Team | null = null;
  forfeit = false;
  /** Each half's bans, by side ([attackers banned, defenders banned]). */
  private readonly halfBans = new Map<number, [string[], string[]]>();
  private nextOrder = 0;

  constructor(
    base: FormatMode,
    readonly map: MatchMap,
    private readonly seed: number,
  ) {
    this.base = base;
    this.mode = clone(base);
  }

  private get m() {
    return this.mode.match;
  }

  /** A seeded draw in [0, 1): the same every time for this match, round and purpose. */
  private roll(purpose: number, i = 0): number {
    return hash4(this.seed, this.round, purpose, i) / 2 ** 32;
  }

  // ------------------------------------------------------------------ players

  /** Players on a team (`connected`: only those still here), in slot order. */
  team(t: Team, connected = false): MatchPlayer[] {
    return [...this.players.values()].filter((p) => p.team === t && (!connected || p.connected)).sort((a, b) => a.order - b.order);
  }

  /**
   * A new player: onto the smaller team (Blue on a tie) if it has room. Joining during a match, they play from
   * the next round. Null when both teams are full.
   */
  addPlayer(id: number, name: string, rating: number | null = null): MatchPlayer | null {
    const max = this.m.teamSize.max;
    const sizes = [this.team(0).length, this.team(1).length];
    let team: Team = sizes[1] < sizes[0] ? 1 : 0;
    if (sizes[team] >= max) team = other(team);
    if (sizes[team] >= max) return null;
    const p: MatchPlayer = {
      id,
      name,
      team,
      ready: false,
      connected: true,
      order: this.nextOrder++,
      operator: null,
      spawn: null,
      banVote: null,
      siteVote: null,
      lastOperator: null,
      attritionLock: null,
      kills: 0,
      deaths: 0,
      assists: 0,
      rating,
    };
    this.players.set(id, p);
    if (!this.players.get(this.hostId)?.connected) this.hostId = id;
    return p;
  }

  /**
   * A player left. In the lobby (and after the match) they're gone; during a match their slot, team and stats stay
   * so they can come back (D-123), and the defuser they were to carry goes back. The host passes to whoever joined
   * first of those still here.
   */
  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === Phase.Lobby || this.phase === Phase.MatchEnd) this.players.delete(id);
    else {
      p.connected = false;
      p.ready = false;
    }
    if (this.carrier === id) this.carrier = null;
    if (this.hostId === id) this.hostId = [...this.players.values()].filter((q) => q.connected).sort((a, b) => a.order - b.order)[0]?.id ?? 0;
  }

  /** A player who left mid-match is back, on a new connection (member id). */
  rejoin(oldId: number, newId: number): MatchPlayer | null {
    const p = this.players.get(oldId);
    if (!p || p.connected || this.players.has(newId)) return null;
    this.players.delete(oldId);
    p.id = newId;
    p.connected = true;
    this.players.set(newId, p);
    for (const side of this.sides) for (let i = 0; i < side.length; i++) if (side[i] === oldId) side[i] = newId;
    if (!this.players.get(this.hostId)?.connected) this.hostId = newId;
    return p;
  }

  // ------------------------------------------------------------------ lobby (each returns why it can't, or null)

  private inLobby(): string | null {
    return this.phase === Phase.Lobby ? null : "The match has already started";
  }

  private hasRoom(t: Team): boolean {
    return this.team(t).length < this.m.teamSize.max;
  }

  setTeam(id: number, team: Team): string | null {
    const p = this.players.get(id);
    if (!p) return "Not in this room";
    if (this.inLobby()) return this.inLobby();
    if (p.team === team) return null;
    if (!this.hasRoom(team)) return `${team === 0 ? "Blue" : "Orange"} is full`;
    p.team = team;
    p.ready = false;
    return null;
  }

  setReady(id: number, ready: boolean): string | null {
    const p = this.players.get(id);
    if (!p) return "Not in this room";
    if (this.inLobby()) return this.inLobby();
    p.ready = ready;
    return null;
  }

  private byHost(host: number): string | null {
    return host === this.hostId ? null : "Only the host can do that";
  }

  /** The host moves a player to a team. */
  move(host: number, id: number, team: Team): string | null {
    return this.byHost(host) ?? this.setTeam(id, team);
  }

  /** The host swaps the two teams over. */
  swapTeams(host: number): string | null {
    const why = this.byHost(host) ?? this.inLobby();
    if (why) return why;
    for (const p of this.players.values()) {
      p.team = other(p.team);
      p.ready = false;
    }
    return null;
  }

  /** The host picks another format (a fresh copy of its rules). */
  setFormat(host: number, base: FormatMode): string | null {
    const why = this.byHost(host) ?? this.inLobby();
    if (why) return why;
    this.base = base;
    this.mode = clone(base);
    for (const p of this.players.values()) p.ready = false;
    return null;
  }

  /** The host changes a setting (match/settings.ts says which). */
  change(host: number, change: HostChange): string | null {
    const why = this.byHost(host) ?? this.inLobby();
    if (why) return why;
    const next = applyHostChange(this.base, this.mode, change);
    if (typeof next === "string") return next;
    this.mode = next;
    for (const p of this.players.values()) p.ready = false;
    return null;
  }

  /** Why the host can't start now (team sizes, who isn't ready), or null. The host's own start counts as ready. */
  canStart(host = this.hostId): string | null {
    if (this.inLobby()) return this.inLobby();
    const { min, max } = this.m.teamSize;
    const sizes = [this.team(0, true).length, this.team(1, true).length];
    if (sizes[0] + sizes[1] === 0) return "Nobody is here";
    if (sizes.some((n) => n > max)) return `At most ${max} a team`;
    if (sizes.some((n) => n < min)) return min === max ? `${min} a team` : `At least ${min} a team`;
    const waiting = [...this.players.values()].filter((p) => p.connected && !p.ready && p.id !== host).map((p) => p.name);
    return waiting.length ? `Waiting for ${waiting.join(", ")} to ready up` : null;
  }

  /** The host starts the match: the first attacking team is drawn from the seed. */
  start(host: number, tick: number): { error: string } | MatchEvent[] {
    const why = this.byHost(host) ?? this.canStart(host);
    if (why) return { error: why };
    for (const p of this.players.values()) if (!p.connected) this.players.delete(p.id);
    this.firstAttackers = (hash4(this.seed, 0, ROLL.first, 0) & 1) as Team;
    this.score = [0, 0];
    this.history = [];
    this.halfBans.clear();
    this.winner = null;
    this.forfeit = false;
    for (const p of this.players.values()) Object.assign(p, { operator: null, lastOperator: null, attritionLock: null, kills: 0, deaths: 0, assists: 0 });
    return this.beginRound(1, tick);
  }

  /** After the match: everyone back to the lobby on the same teams, not ready. */
  backToLobby(host: number): string | null {
    const why = this.byHost(host);
    if (why) return why;
    if (this.phase !== Phase.MatchEnd) return "The match isn't over";
    this.phase = Phase.Lobby;
    this.phaseStart = 0;
    this.phaseEnd = NO_END;
    this.round = 0;
    this.sides = [[], []];
    for (const p of this.players.values()) p.ready = false;
    return null;
  }

  // ------------------------------------------------------------------ the round

  /** The team attacking this round. */
  get attackers(): Team {
    return attackersIn(this.m, this.firstAttackers, Math.max(1, this.round));
  }

  /** The side a player plays this round, or null (not in it: joined late, or in the lobby). */
  sideOf(id: number): Side | null {
    return this.sides[ATTACK].includes(id) ? ATTACK : this.sides[DEFENSE].includes(id) ? DEFENSE : null;
  }

  private enter(phase: Phase, tick: number, seconds: number | null): MatchEvent {
    this.phase = phase;
    this.phaseStart = tick;
    this.phaseEnd = seconds === null ? NO_END : tick + ticks(seconds);
    return { kind: "phase", phase, round: this.round };
  }

  private beginRound(r: number, tick: number): MatchEvent[] {
    this.round = r;
    // A team with nobody here loses (not in Practice, where a side may be empty).
    if (this.m.rounds !== null) {
      const here = [this.team(0, true).length, this.team(1, true).length];
      if (here[0] === 0 || here[1] === 0) return this.endMatch(tick, here[0] === here[1] ? null : here[0] === 0 ? 1 : 0, true);
    }
    const atk = this.attackers;
    this.sides = [this.team(atk, true).map((p) => p.id), this.team(other(atk), true).map((p) => p.id)];
    this.site = this.m.site === "random" ? this.map.sites[Math.floor(this.roll(ROLL.site) * this.map.sites.length)] : null;
    this.siteRevealed = false;
    this.carrier = null;
    this.plantedAt = null;
    this.disabled = false;
    this.deactivated = false;
    for (const p of this.players.values()) {
      p.operator = null;
      p.banVote = null;
      p.siteVote = null;
      if (p.spawn === null || !this.map.spawnGroups.includes(p.spawn)) p.spawn = this.map.spawnGroups[0] ?? null;
    }
    const h = halfOf(this.m, r);
    if (h !== null && !this.halfBans.has(h)) this.halfBans.set(h, [[], []]);
    if (hasBanPhase(this.m, r)) return [this.enter(Phase.Ban, tick, this.m.bans!.voteSeconds)];
    return [this.enter(Phase.Planning, tick, pickSeconds(this.m, this.firstAttackers, r))];
  }

  private endRound(tick: number, side: Side, reason: WinReason): MatchEvent[] {
    const winner = side === ATTACK ? this.attackers : other(this.attackers);
    this.score[winner]++;
    const record: RoundRecord = { round: this.round, attackers: this.attackers, winner, reason, site: this.site ?? "" };
    this.history.push(record);
    for (const p of this.players.values()) {
      const played = this.sideOf(p.id) !== null;
      p.attritionLock = this.m.attrition === "winnerLastOperator" && played && p.team === winner ? p.operator : null;
      if (played) p.lastOperator = p.operator;
    }
    return [{ kind: "round", record }, this.enter(Phase.RoundEnd, tick, this.m.seconds.roundEnd)];
  }

  private endMatch(tick: number, winner: Team | null, forfeit: boolean): MatchEvent[] {
    this.winner = winner;
    this.forfeit = forfeit;
    return [this.enter(Phase.MatchEnd, tick, null), { kind: "match", winner, forfeit }];
  }

  /**
   * Advance to `tick`. In action and post-plant the room passes what it sees (`facts`): who is still up and whether
   * a plant is under way; the match adds the timers and the defuser's state and decides the round.
   */
  update(tick: number, facts?: { attackersUp: number; defendersUp: number; plantInProgress: boolean }): MatchEvent[] {
    const due = tick >= this.phaseEnd;
    switch (this.phase) {
      case Phase.Ban:
        if (!due) return [];
        this.tallyBans();
        return [this.enter(Phase.Planning, tick, pickSeconds(this.m, this.firstAttackers, this.round))];
      case Phase.Planning:
        if (!due) return [];
        if (this.m.site === "vote") this.site = this.tallySite();
        this.autoPick(this.sides[ATTACK]);
        this.autoPick(this.sides[DEFENSE]);
        if (this.m.siteReveal === "roundStart") this.siteRevealed = true;
        return [this.enter(Phase.Prep, tick, this.m.seconds.prep)];
      case Phase.Prep:
        if (!due) return [];
        this.autoPick(this.sides[ATTACK]);
        this.assignCarrier();
        return [this.enter(Phase.Action, tick, this.m.seconds.action)];
      case Phase.Action:
      case Phase.PostPlant: {
        if (!facts) return [];
        const planted = this.phase === Phase.PostPlant;
        const o = roundOutcome({
          ...facts,
          attackersPlaying: this.sides[ATTACK].length,
          defendersPlaying: this.sides[DEFENSE].length,
          planted,
          timeUp: !planted && due,
          fuseDone: planted && due,
          disabled: this.disabled,
          deactivated: this.deactivated,
        });
        return o ? this.endRound(tick, o.winner, o.reason) : [];
      }
      case Phase.RoundEnd: {
        if (!due) return [];
        const result = matchResult(this.m, this.score, this.round);
        return result.over ? this.endMatch(tick, result.winner, false) : this.beginRound(this.round + 1, tick);
      }
      default:
        return [];
    }
  }

  // ------------------------------------------------------------------ what happens in the simulation

  /** The defuser is planted: post-plant, with the fuse as its timer. A plant started before the timer ran out may finish after it. */
  planted(tick: number): MatchEvent[] {
    if (this.phase !== Phase.Action) return [];
    this.plantedAt = tick;
    this.siteRevealed = true;
    return [this.enter(Phase.PostPlant, tick, this.m.seconds.fuse)];
  }

  /** A defender finished disabling it: it counts only while the fuse is still running (research §2). */
  defuserDisabled(tick: number): void {
    if (this.phase === Phase.PostPlant && tick < this.phaseEnd) this.disabled = true;
  }

  /** The hatch it was planted on is gone (research §4 case 8). */
  defuserDeactivated(): void {
    if (this.phase === Phase.PostPlant) this.deactivated = true;
  }

  /** An attacker has the site in view (siteReveal "sight"): every attacker knows it now. */
  siteFound(): void {
    if (this.phase === Phase.Prep || this.phase === Phase.Action) this.siteRevealed = true;
  }

  /** A body died: its player's death, and the kill and assist (not for a teammate's). */
  recordKill(victim: number | null, killer: number | null, assist: number | null, friendly: boolean): void {
    const v = victim !== null ? this.players.get(victim) : undefined;
    if (v) v.deaths++;
    if (friendly) return;
    const k = killer !== null && killer !== victim ? this.players.get(killer) : undefined;
    if (k) k.kills++;
    const a = assist !== null && assist !== victim ? this.players.get(assist) : undefined;
    if (a) a.assists++;
  }

  // ------------------------------------------------------------------ choices

  /** The bans on a side this round: its half's stack, or in overtime the stack of the last half the same team attacked in. */
  banned(side: Side): Set<string> {
    const h = halfOf(this.m, this.round);
    if (h !== null) return new Set(this.halfBans.get(h)?.[side] ?? []);
    for (let r = this.m.rounds!; r >= 1; r -= this.m.swapEvery) {
      if (attackersIn(this.m, this.firstAttackers, r) === this.attackers) return new Set(this.halfBans.get(halfOf(this.m, r)!)?.[side] ?? []);
    }
    return new Set();
  }

  /** The operators a player may pick now: their side's, less bans, teammates' picks and attrition. */
  allowed(id: number): string[] {
    const p = this.players.get(id);
    const side = this.sideOf(id);
    if (!p || side === null) return [];
    const held = new Set(this.sides[side].filter((q) => q !== id).map((q) => this.players.get(q)?.operator).filter((o): o is string => !!o));
    return allowedOperators(this.map.roster[side], this.banned(side), held, p.attritionLock);
  }

  /** A ban vote (ban phase): for an operator of the side this player's team isn't playing, not already banned. */
  voteBan(id: number, operator: string | null): string | null {
    const side = this.sideOf(id);
    if (this.phase !== Phase.Ban || side === null) return "Not voting on bans now";
    const target = other(side);
    if (operator !== null && (!this.map.roster[target].includes(operator) || this.banned(target).has(operator))) return "Can't ban that operator";
    this.players.get(id)!.banVote = operator;
    return null;
  }

  /** A site vote (planning; defenders, where the format votes). */
  voteSite(id: number, site: string | null): string | null {
    if (this.phase !== Phase.Planning || this.sideOf(id) !== DEFENSE || this.m.site !== "vote") return "Not voting on the site now";
    if (site !== null && !this.map.sites.includes(site)) return "No such site";
    this.players.get(id)!.siteVote = site;
    return null;
  }

  /** An attacker's spawn (planning and prep). */
  chooseSpawn(id: number, group: string): string | null {
    if ((this.phase !== Phase.Planning && this.phase !== Phase.Prep) || this.sideOf(id) !== ATTACK) return "Not choosing a spawn now";
    if (!this.map.spawnGroups.includes(group)) return "No such spawn";
    this.players.get(id)!.spawn = group;
    return null;
  }

  /** An operator pick: anyone on the planning screen, attackers in prep too [Y7S1]. The first to take one has it. */
  pickOperator(id: number, operator: string): string | null {
    const side = this.sideOf(id);
    const open = this.phase === Phase.Planning || (this.phase === Phase.Prep && side === ATTACK);
    if (!open || side === null) return "Not picking operators now";
    const p = this.players.get(id)!;
    if (p.operator === operator) return null;
    if (!this.allowed(id).includes(operator)) return "That operator isn't available";
    p.operator = operator;
    return null;
  }

  /** An attacker takes the defuser in (planning and prep), or hands it back. Only one can have it. */
  takeDefuser(id: number, take: boolean): string | null {
    if ((this.phase !== Phase.Planning && this.phase !== Phase.Prep) || this.sideOf(id) !== ATTACK) return "Not choosing the defuser now";
    if (!take) {
      if (this.carrier === id) this.carrier = null;
      return null;
    }
    if (this.carrier !== null && this.carrier !== id && this.players.get(this.carrier)?.connected) return "A teammate has it";
    this.carrier = id;
    return null;
  }

  private tallyBans() {
    const stack = this.halfBans.get(halfOf(this.m, this.round)!)!;
    for (const side of [ATTACK, DEFENSE] as const) {
      // The team on `side` bans an operator of the other side.
      const target = other(side);
      const votes = this.sides[side].map((id) => this.players.get(id)?.banVote ?? null).filter((v) => v === null || !stack[target].includes(v));
      const pick = tally(votes, this.roll(ROLL.banVote, side));
      if (pick !== null && banLeavesEnough(this.map.roster[target].length, stack[target].length, this.sides[target].length)) stack[target].push(pick);
    }
  }

  private tallySite(): string {
    const votes = this.sides[DEFENSE].map((id) => this.players.get(id)?.siteVote ?? null);
    return tally(votes, this.roll(ROLL.siteVote)) ?? this.map.sites[Math.floor(this.roll(ROLL.site) * this.map.sites.length)];
  }

  /**
   * Players without an operator the timer can let them keep get one: last round's if allowed, else the first allowed
   * in roster order (Siege picks from personal stats, which we don't have). Should nothing be left (a Custom match
   * with attrition and bans), attrition gives way.
   */
  private autoPick(ids: readonly number[]) {
    for (const id of ids) {
      const p = this.players.get(id);
      if (!p) continue;
      let allowed = this.allowed(id);
      if (p.operator !== null && allowed.includes(p.operator)) continue;
      if (!allowed.length && p.attritionLock !== null) {
        p.attritionLock = null;
        allowed = this.allowed(id);
      }
      p.operator = p.lastOperator !== null && allowed.includes(p.lastOperator) ? p.lastOperator : (allowed[0] ?? null);
    }
  }

  /** At action start the defuser goes to its chosen carrier if still here, else the first attacker in slot order. */
  private assignCarrier() {
    const here = this.sides[ATTACK].filter((id) => this.players.get(id)?.connected);
    if (this.carrier === null || !here.includes(this.carrier)) this.carrier = here[0] ?? null;
  }

  /** Ticks left on the current phase's timer (0 once it has run out; NO_END while it waits for the host). */
  ticksLeft(tick: number): number {
    return this.phaseEnd === NO_END ? NO_END : Math.max(0, this.phaseEnd - tick);
  }

  /** Whether round `r` is overtime. */
  overtime(r = this.round): boolean {
    return isOvertime(this.m, r);
  }
}
