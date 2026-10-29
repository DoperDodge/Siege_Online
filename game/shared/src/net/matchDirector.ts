// A match room's director (match/DESIGN.md §2, §4–§7): it runs the match (match/match.ts) inside a room and does
// what each phase needs with the room's bodies, panels and messages: nobody has a body on the planning screen,
// defenders spawn at the site for prep (red walls up), attackers at their spawns for action; it tells the match who
// is still up and who died, detects run-outs, kills bodies that fall out of the map, and sends each player the
// match as they may see it.
import { Cause } from "../combat/apply.js";
import { DEG, type Vec3 } from "../core/math.js";
import { DeployKind } from "../destruction/deploy.js";
import { QUERY_SIGHT } from "../physics/rapier.js";
import { isDowned } from "../player/downed.js";
import { eyePose } from "../player/hitboxes.js";
import { PawnMode } from "../player/types.js";
import type { Pawn, PlayerController } from "../player/pawn.js";
import { defaultLoadoutPick, resolveLoadout, type LoadoutPick } from "../weapons/loadout.js";
import type { Sim } from "../sim.js";
import { viewDir } from "../weapons/spread.js";
import type { SimEvent } from "../weapons/step.js";
import { ticks, ticksOrZero } from "../weapons/ticks.js";
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
  /** The hatch the defuser was planted on (a panel index), or null: destroying it deactivates the defuser (research §4 case 8). */
  private plantHatch: number | null = null;

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
    if ((m.phase === Phase.Prep || m.phase === Phase.Action) && !m.siteRevealed && this.mode.match.siteReveal === "sight" && this.siteInView()) {
      m.siteFound();
      this.changed(false);
    }
    if (m.phase === Phase.PostPlant && this.plantHatch !== null && sim.level.panels.list[this.plantHatch]?.panel.broken) m.defuserDeactivated();
    const facts = live ? { attackersUp: this.up(ATTACK), defendersUp: this.up(DEFENSE), plantInProgress: this.planting() } : undefined;
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

  /** The simulation's defuser events (the room's step): planted, disabled, picked up, dropped. */
  onSimEvent(e: SimEvent) {
    const tick = this.host.sim.tick;
    if (e.kind === "plant") {
      this.apply(this.match.planted(tick));
      this.plantHatch = this.hatchUnder(e.pos);
    } else if (e.kind === "disable") this.match.defuserDisabled(tick);
    else if (e.kind !== "pickup" && e.kind !== "drop") return;
    this.changed(true);
  }

  /** A body went down or died: if it carried the defuser, it falls there (research §5). */
  onBodyDown(pawn: Pawn) {
    const o = this.host.sim.objective;
    if (!o || o.carrier !== pawn.id) return;
    o.carrier = 0;
    o.dropped = [pawn.state.x, pawn.state.y, pawn.state.z];
    this.changed(true);
  }

  /** An attacker is holding the plant (a plant under way when the timer runs out plays on, research §4 case 3). */
  private planting(): boolean {
    for (const id of this.match.sides[ATTACK]) {
      const body = this.host.bodyOf(id);
      if (body && this.host.sim.pawns.get(body.possessedPawnId)?.state.deployKind === DeployKind.Plant) return true;
    }
    return false;
  }

  /** The hatch under a spot (the panel a downward ray from just above it crosses first, if a hatch), or null. */
  private hatchUnder(pos: Vec3): number | null {
    const hit = this.host.sim.level.panels.crossings([pos[0], pos[1] + 0.3, pos[2]], [0, -1, 0], 0.6)[0];
    return hit && hit.entry.panel.kind === "hatch" ? hit.entry.panel.spec.index : null;
  }

  /**
   * Finding the site (D-120): an attacker's eye has one of its bombs in view, within data/objective.json's range and
   * angle off the view, with no level geometry in the way.
   */
  private siteInView(): boolean {
    const sim = this.host.sim;
    const site = sim.level.def.sites.find((x) => x.id === this.match.site);
    if (!site) return false;
    const { rangeM, coneDeg } = sim.data.objective.siteSight;
    const cos = Math.cos(coneDeg * DEG);
    for (const id of this.match.sides[ATTACK]) {
      const body = this.host.bodyOf(id);
      const p = body ? sim.pawns.get(body.possessedPawnId) : undefined;
      if (!p || p.state.mode === PawnMode.Dead) continue;
      const eye = eyePose(sim.data.movement, sim.data.hitboxes, p.state).pos;
      const look = viewDir(p.state.yaw, p.state.pitch);
      for (const b of site.bombs) {
        const d = [b.pos[0] - eye[0], b.pos[1] + 0.2 - eye[1], b.pos[2] - eye[2]];
        const dist = Math.hypot(d[0], d[1], d[2]);
        if (dist > rangeM || dist < 1e-3 || (d[0] * look[0] + d[1] * look[1] + d[2] * look[2]) / dist < cos) continue;
        const ray = new sim.R.Ray({ x: eye[0], y: eye[1], z: eye[2] }, { x: d[0] / dist, y: d[1] / dist, z: d[2] / dist });
        const wall = sim.world.castRay(ray, dist, true, undefined, QUERY_SIGHT)?.timeOfImpact ?? Infinity;
        const panel = sim.level.panels.firstSolid(eye, [d[0] / dist, d[1] / dist, d[2] / dist], dist);
        if (wall >= dist - 0.05 && !panel) return true;
      }
    }
    return false;
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
      if (roundStart || e.phase === Phase.MatchEnd) {
        this.clearBodies();
        this.host.sim.objective = null;
        this.plantHatch = null;
      }
      if (e.phase === Phase.Prep) this.startPrep();
      if (e.phase === Phase.Action) this.startAction();
      // The round is decided: no more plants (a planted defuser stays where it is until the next round).
      if (e.phase === Phase.RoundEnd && this.host.sim.objective) this.host.sim.objective.canPlant = false;
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
    this.host.sim.objective = null;
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
    const sec = this.mode.match.seconds;
    this.host.sim.objective = { carrier: 0, dropped: null, planted: null, site: this.match.site, canPlant: false, plantTicks: ticks(sec.plant), disableTicks: ticks(sec.disable) };
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
    // The defuser comes in on its carrier (the match chose one as action started).
    const o = this.host.sim.objective;
    const carrier = this.match.carrier !== null ? this.host.bodyOf(this.match.carrier) : null;
    if (o) Object.assign(o, { carrier: carrier?.possessedPawnId ?? 0, canPlant: true });
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

  /** Who carries the defuser: the owner of its carrier pawn once the round is under way, else the planning screen's choice. */
  private carrierMember(): number {
    const o = this.host.sim.objective;
    if (!o || this.match.phase < Phase.Action) return this.match.carrier ?? 0;
    for (const id of this.match.players.keys()) if (o.carrier !== 0 && this.host.bodyOf(id)?.pawnIds.includes(o.carrier)) return id;
    return 0;
  }

  /** The defuser as a side may see it: its carrier and a dropped one for attackers only (D-120). */
  private defuserView(attacker: boolean): MatchView["defuser"] {
    const o = this.host.sim.objective;
    if (!o) return null;
    const v3 = (p: [number, number, number] | null): [number, number, number] | null => (p ? [p[0], p[1], p[2]] : null);
    return { carrier: attacker ? o.carrier : 0, dropped: attacker ? v3(o.dropped) : null, planted: v3(o.planted), canPlant: o.canPlant, plantTicks: o.plantTicks, disableTicks: o.disableTicks };
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
      carrier: attacker ? this.carrierMember() : 0,
      history: m.history.map((h) => ({ ...h })),
      winner: m.winner,
      forfeit: m.forfeit,
      mvp: m.phase === Phase.MatchEnd ? (mvp([...m.players.values()]) ?? 0) : 0,
      detected: attacker ? [...this.detected] : [],
      defuser: this.defuserView(attacker),
      rules: rulesFresh ? null : JSON.stringify({ id: this.mode.id, friendlyFire: this.mode.friendlyFire, reverseFriendlyFire: this.mode.reverseFriendlyFire, lastAliveDies: this.mode.lastAliveDies, reinforcements: this.mode.reinforcements, match: this.mode.match }),
      rulesVersion: this.rulesVersion,
    };
  }
}
