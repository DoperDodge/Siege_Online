// A match room's director (match/DESIGN.md §2, §4–§7): it runs the match (match/match.ts) inside a room and does
// what each phase needs with the room's bodies, panels and messages: nobody has a body on the planning screen,
// defenders spawn at the site for prep (red walls up), attackers at their spawns for action; it tells the match who
// is still up and who died, detects run-outs, kills bodies that fall out of the map, and sends each player the
// match as they may see it.
import { Cause } from "../combat/apply.js";
import { isDowned } from "../player/downed.js";
import { PawnMode } from "../player/types.js";
import type { PlayerController } from "../player/pawn.js";
import { defaultLoadoutPick, resolveLoadout, type LoadoutPick } from "../weapons/loadout.js";
import type { Sim } from "../sim.js";
import { ticksOrZero } from "../weapons/ticks.js";
import { Match, matchMapOf, NO_END, Phase, type MatchEvent } from "../match/match.js";
import { ATTACK, DEFENSE, isFormat, mvp, reinforcementPool, type FormatMode, type Side } from "../match/rules.js";
import { encodeMatchState, type LobbyAction, type MatchAction, type MatchView, type RoomListEntry } from "./matchWire.js";

/** What the director needs from its room (net/room.ts implements it). */
export interface DirectorHost {
  readonly sim: Sim;
  readonly code: string;
  /** A member's body (null: none), or undefined for no such member. */
  bodyOf(memberId: number): PlayerController | null | undefined;
  /** A new body for a member at this level spawn, carrying `pick`, on `side` (its client gets a correction). */
  spawnBody(memberId: number, pick: LoadoutPick, spawnIndex: number, side: Side): void;
  /** Take a member's body away. */
  removeBody(memberId: number): void;
  /** Tell everyone who has which body (after spawning or removing some). */
  rosterChanged(): void;
  /** Every panel as the level built it, with these reinforcement pools ([attackers, defenders]). */
  resetPanels(pools: [number, number]): void;
  /** Kill a body now (it left, it fell out of the map). */
  killBody(pawnId: number, cause: Cause): void;
  /** The server changed this member's body outside their inputs: correct their client. */
  correct(memberId: number): void;
  send(memberId: number, bytes: Uint8Array): void;
  /** Close a member's connection (a kick). */
  kick(memberId: number): void;
  /** Tell one player why a choice of theirs didn't go through. */
  refuse(memberId: number, why: string): void;
}

/** How often (ticks) the match state goes out when only scores, votes or run-outs changed; phase changes go at once. */
const STATE_EVERY = 8;

export class MatchDirector {
  readonly match: Match;
  /** Each member's loadout pick for their operator (PickLoadout), kept across rounds. */
  private readonly loadouts = new Map<number, LoadoutPick>();
  private readonly formats: Map<string, FormatMode>;
  private prevPhase: Phase = Phase.Lobby;
  /** Ticks each defender's body has been outside the building this round, and who is detected (pawn ids). */
  private readonly outside = new Map<number, number>();
  private detected: number[] = [];
  private dirty = true;
  private urgent = false;
  private lastSent = -Infinity;
  /** Rules versions: bumped whenever the rules change; each member's copy is the version last sent to them. */
  private rulesVersion = 1;
  private readonly rulesSent = new Map<number, number>();
  /** Not in the server's room list. */
  private hidden = false;

  constructor(
    private readonly host: DirectorHost,
    format: FormatMode,
    seed: number,
  ) {
    const data = host.sim.data;
    this.formats = new Map([...data.modes.values()].filter(isFormat).map((m) => [m.id, m]));
    this.match = new Match(format, matchMapOf(host.sim.level.def, data.operators.values()), seed);
    host.sim.matchRules = { redWalls: false, killPlaneKills: true };
  }

  get mode(): FormatMode {
    return this.match.mode;
  }

  /** A new member joins the match's lobby (or a team mid-match, playing from the next round). False when full. */
  join(memberId: number, name: string): boolean {
    if (!this.match.addPlayer(memberId, name)) return false;
    this.changed(true);
    return true;
  }

  /** A member left: their body dies where it is (D-123), and the match keeps their slot. */
  leave(memberId: number) {
    const body = this.host.bodyOf(memberId);
    const pawn = body ? this.host.sim.pawns.get(body.possessedPawnId) : undefined;
    if (pawn && pawn.state.mode !== PawnMode.Dead) this.host.killBody(pawn.id, Cause.Left);
    this.match.removePlayer(memberId);
    this.rulesSent.delete(memberId);
    this.loadouts.delete(memberId);
    this.changed(true);
  }

  /** The room-list entry, or null for a private room. */
  listing(): RoomListEntry | null {
    if (this.hidden) return null;
    const max = this.mode.match.teamSize.max * 2;
    return { code: this.host.code, format: this.mode.id, players: [...this.match.players.values()].filter((p) => p.connected).length, maxPlayers: max, phase: this.match.phase, round: this.match.round };
  }

  /** Team damage now: off in prep, the format's rule in action (core_mechanics.md §11). */
  friendlyFireOn(): boolean {
    const ff = this.mode.friendlyFire;
    return this.match.phase === Phase.Prep ? ff.prepPhase : ff.actionPhase;
  }

  // ------------------------------------------------------------------ choices from the wire

  lobby(memberId: number, a: LobbyAction) {
    const m = this.match;
    let why: string | null = null;
    switch (a.kind) {
      case "team":
        why = m.setTeam(memberId, a.team);
        break;
      case "ready":
        why = m.setReady(memberId, a.ready);
        break;
      case "move":
        why = m.move(memberId, a.member, a.team);
        break;
      case "swapTeams":
        why = m.swapTeams(memberId);
        break;
      case "kick":
        if (memberId !== m.hostId) why = "Only the host can do that";
        else if (a.member === memberId || !m.players.has(a.member)) why = "Can't kick that player";
        else this.host.kick(a.member);
        break;
      case "format": {
        const f = this.formats.get(a.format);
        why = f ? m.setFormat(memberId, f) : "No such format";
        if (!why) this.rulesVersion++;
        break;
      }
      case "change":
        why = m.change(memberId, a.change);
        if (!why) this.rulesVersion++;
        break;
      case "start": {
        const r = m.start(memberId, this.host.sim.tick);
        if ("error" in r) why = r.error;
        else this.apply(r);
        break;
      }
      case "backToLobby":
        why = m.backToLobby(memberId);
        if (!why) this.toLobby();
        break;
      case "private":
        if (memberId !== m.hostId) why = "Only the host can do that";
        else this.hidden = a.private;
        break;
      case "rating": {
        const p = m.players.get(memberId);
        if (p && m.phase === Phase.Lobby && this.mode.match.stats === "rated") p.rating = Math.max(0, Math.min(5000, a.rating));
        break;
      }
    }
    if (why) this.host.refuse(memberId, why);
    this.changed(true);
  }

  action(memberId: number, a: MatchAction) {
    const m = this.match;
    const why =
      a.kind === "banVote"
        ? m.voteBan(memberId, a.operator)
        : a.kind === "siteVote"
          ? m.voteSite(memberId, a.site)
          : a.kind === "spawn"
            ? m.chooseSpawn(memberId, a.group)
            : m.takeDefuser(memberId, a.take);
    if (why) this.host.refuse(memberId, why);
    this.changed(false);
  }

  /** An operator and loadout (PickLoadout): this round's pick, if the match allows it; the loadout is kept for later rounds. */
  pick(memberId: number, pick: LoadoutPick) {
    const data = this.host.sim.data;
    if (!data.operators.has(pick.operator)) return;
    const why = this.match.pickOperator(memberId, pick.operator);
    if (why) {
      this.host.refuse(memberId, why);
      return;
    }
    this.loadouts.set(memberId, resolveLoadout(data, pick).loadout.pick);
    this.changed(false);
  }

  // ------------------------------------------------------------------ every tick

  /** After the room's step: run-outs, the kill plane, who is up, the match's clock, and the state going out. */
  step() {
    const sim = this.host.sim;
    const m = this.match;
    const live = m.phase === Phase.Action || m.phase === Phase.PostPlant;
    this.killBelowMap();
    if (live) this.runouts();
    const facts = live ? { attackersUp: this.up(ATTACK), defendersUp: this.up(DEFENSE), plantInProgress: false } : undefined;
    this.apply(m.update(sim.tick, facts));
    this.redWalls();
    this.sendState();
  }

  /** A body died (the room's announceDeath): the match counts the death, the kill and the assist. */
  onDeath(victimCtrl: number, killerCtrl: number, assistCtrl: number, friendly: boolean) {
    const member = (ctrl: number) => {
      if (!ctrl) return null;
      for (const id of this.match.players.keys()) if (this.host.bodyOf(id)?.id === ctrl) return id;
      return null;
    };
    this.match.recordKill(member(victimCtrl), member(killerCtrl), member(assistCtrl), friendly);
    this.changed(false);
  }

  /** Players of a side with their active body alive and not down (Skopós: her active shell; DESIGN §7). */
  private up(side: Side): number {
    let n = 0;
    for (const id of this.match.sides[side]) {
      const body = this.host.bodyOf(id);
      const p = body ? this.host.sim.pawns.get(body.possessedPawnId) : undefined;
      if (p && p.state.mode !== PawnMode.Dead && !isDowned(p.state)) n++;
    }
    return n;
  }

  /** Below the level's kill plane a body dies (labs put it back at spawn instead). */
  private killBelowMap() {
    const sim = this.host.sim;
    const killY = sim.level.def.bounds?.killY;
    if (killY === undefined) return;
    for (const p of sim.pawns.values()) if (!p.proxy && p.state.mode !== PawnMode.Dead && p.state.y < killY) this.host.killBody(p.id, Cause.Fall);
  }

  /** Run-outs (research §8): a defender outside the building for the grace time is detected until back in or dead. */
  private runouts() {
    const sim = this.host.sim;
    const grace = ticksOrZero(this.mode.match.seconds.runoutGrace);
    const detected: number[] = [];
    for (const id of this.match.sides[DEFENSE]) {
      const body = this.host.bodyOf(id);
      const p = body ? sim.pawns.get(body.possessedPawnId) : undefined;
      if (!p || p.state.mode === PawnMode.Dead || sim.insideBuilding(p.state.x, p.state.y, p.state.z)) {
        this.outside.delete(id);
        continue;
      }
      const t = (this.outside.get(id) ?? 0) + 1;
      this.outside.set(id, t);
      if (t > grace) detected.push(p.id);
    }
    if (detected.join() !== this.detected.join()) {
      this.detected = detected;
      this.changed(false);
    }
  }

  /** Red walls: up through prep, and the format's extension into action (Quick Match: 10 s). Defenders are corrected when they come down. */
  private redWalls() {
    const m = this.match;
    const ext = ticksOrZero(this.mode.match.seconds.redWallExtension);
    const on = m.phase === Phase.Prep || (m.phase === Phase.Action && this.host.sim.tick < m.phaseStart + ext);
    const rules = this.host.sim.matchRules;
    if (rules.redWalls === on) return;
    rules.redWalls = on;
    if (!on) for (const id of m.sides[DEFENSE]) this.host.correct(id);
    this.changed(true);
  }

  // ------------------------------------------------------------------ what each phase does

  private apply(events: readonly MatchEvent[]) {
    for (const e of events) {
      if (e.kind !== "phase") {
        this.changed(true);
        continue;
      }
      const roundStart = e.phase === Phase.Ban || (e.phase === Phase.Planning && this.prevPhase !== Phase.Ban);
      if (roundStart || e.phase === Phase.MatchEnd) this.clearBodies();
      if (e.phase === Phase.Prep) this.startPrep();
      if (e.phase === Phase.Action) this.startAction();
      this.prevPhase = e.phase;
      this.changed(true);
    }
  }

  private clearBodies() {
    for (const id of this.match.players.keys()) if (this.host.bodyOf(id)) this.host.removeBody(id);
    this.outside.clear();
    this.detected = [];
    this.host.rosterChanged();
  }

  private toLobby() {
    this.clearBodies();
    this.host.resetPanels([0, 0]);
    this.prevPhase = Phase.Lobby;
  }

  /** The loadout a player takes in: theirs if it's for the operator the match gave them, else that operator's default. */
  private loadoutFor(memberId: number): LoadoutPick | null {
    const op = this.match.players.get(memberId)?.operator;
    if (!op) return null;
    const mine = this.loadouts.get(memberId);
    return mine?.operator === op ? mine : defaultLoadoutPick(this.host.sim.data, op);
  }

  /** The level spawns (indices into level.def.spawns) of a group, in file order. */
  private spawnsOf(group: string): number[] {
    return this.host.sim.level.def.spawns.flatMap((s, i) => (s.group === group ? [i] : []));
  }

  /** Prep: the panels as built with the round's pools, and the defenders at the site's spawns in slot order. */
  private startPrep() {
    const defenders = this.match.sides[DEFENSE];
    this.host.resetPanels([0, reinforcementPool(this.mode, defenders.length)]);
    const spots = this.spawnsOf(this.match.site ?? "");
    defenders.forEach((id, k) => this.spawnOne(id, spots[k % Math.max(1, spots.length)] ?? 0, DEFENSE));
    this.host.rosterChanged();
  }

  /** Action: each attacker at their spawn group's next free point, in slot order. */
  private startAction() {
    const used = new Map<string, number>();
    for (const id of this.match.sides[ATTACK]) {
      const group = this.match.players.get(id)?.spawn ?? this.match.map.spawnGroups[0] ?? "";
      const spots = this.spawnsOf(group);
      const k = used.get(group) ?? 0;
      used.set(group, k + 1);
      this.spawnOne(id, spots[k % Math.max(1, spots.length)] ?? 0, ATTACK);
    }
    this.host.rosterChanged();
  }

  private spawnOne(memberId: number, spawnIndex: number, side: Side) {
    const p = this.match.players.get(memberId);
    const pick = this.loadoutFor(memberId);
    if (!p?.connected || !pick) return;
    this.host.spawnBody(memberId, pick, spawnIndex, side);
  }

  // ------------------------------------------------------------------ the match state on the wire

  /** Something players see changed; `urgent` (phase changes, the lobby) goes out this tick, the rest within STATE_EVERY. */
  private changed(urgent: boolean) {
    this.dirty = true;
    this.urgent ||= urgent;
  }

  /** Send every member the match as they may see it, when it changed (now if urgent, else at most every STATE_EVERY ticks). */
  sendState(force = false) {
    const tick = this.host.sim.tick;
    if (!force && (!this.dirty || (!this.urgent && tick - this.lastSent < STATE_EVERY))) return;
    this.dirty = false;
    this.urgent = false;
    this.lastSent = tick;
    for (const id of this.match.players.keys()) if (this.match.players.get(id)!.connected) this.host.send(id, encodeMatchState(this.view(id)));
  }

  /** The match as one member may see it (match/DESIGN.md §10). */
  view(you: number): MatchView {
    const m = this.match;
    const me = m.players.get(you);
    const mySide = m.sideOf(you);
    const onTeam = (id: number) => me !== undefined && m.players.get(id)?.team === me.team;
    const enemiesShown = m.phase >= Phase.Action;
    const attacker = mySide === ATTACK || (mySide === null && me !== undefined && me.team === m.attackers);
    const players = [...m.players.values()]
      .sort((a, b) => a.order - b.order)
      .map((p) => {
        const mate = onTeam(p.id);
        const body = this.host.bodyOf(p.id);
        const pawn = body ? this.host.sim.pawns.get(body.possessedPawnId) : undefined;
        return {
          id: p.id,
          name: p.name,
          team: p.team,
          ready: p.ready,
          connected: p.connected,
          side: m.sideOf(p.id),
          alive: pawn !== undefined && pawn.state.mode !== PawnMode.Dead,
          operator: mate || enemiesShown ? p.operator : null,
          spawn: mate ? p.spawn : null,
          banVote: mate ? p.banVote : null,
          siteVote: mate ? p.siteVote : null,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          rating: p.rating,
        };
      });
    const rulesFresh = this.rulesSent.get(you) === this.rulesVersion;
    if (!rulesFresh) this.rulesSent.set(you, this.rulesVersion);
    return {
      format: this.mode.id,
      phase: m.phase,
      phaseStart: m.phaseStart,
      phaseEnd: m.phaseEnd === NO_END ? NO_END : m.phaseEnd,
      round: m.round,
      attackers: m.attackers,
      overtime: m.round > 0 && m.overtime(),
      score: [m.score[0], m.score[1]],
      host: m.hostId,
      you,
      private: this.hidden,
      redWalls: this.host.sim.matchRules.redWalls,
      players,
      bans: [[...m.banned(ATTACK)], [...m.banned(DEFENSE)]],
      site: attacker && !m.siteRevealed ? null : m.site,
      siteRevealed: m.siteRevealed,
      carrier: attacker ? (m.carrier ?? 0) : 0,
      history: m.history.map((h) => ({ ...h })),
      winner: m.winner,
      forfeit: m.forfeit,
      mvp: m.phase === Phase.MatchEnd ? (mvp([...m.players.values()]) ?? 0) : 0,
      detected: attacker ? [...this.detected] : [],
      rules: rulesFresh ? null : JSON.stringify({ id: this.mode.id, friendlyFire: this.mode.friendlyFire, reverseFriendlyFire: this.mode.reverseFriendlyFire, lastAliveDies: this.mode.lastAliveDies, reinforcements: this.mode.reinforcements, match: this.mode.match }),
      rulesVersion: this.rulesVersion,
    };
  }
}
