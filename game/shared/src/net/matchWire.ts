// The match messages (Phase 6, protocol 11; match/DESIGN.md §10): a new match room, the room list, the lobby's and
// a round's choices, and the match as each player may see it. Binary like the rest (net/protocol.ts); everything
// read from a client is untrusted (the server checks every choice against the match as well).
import { ByteReader, ByteWriter, ProtocolError } from "./bytes.js";
import { MAX_NAME, Msg, ROOM_CODE_LENGTH } from "./protocol.js";
import { Phase, type RoundRecord } from "../match/match.js";
import { WinReason } from "../match/outcome.js";
import type { HostChange } from "../match/settings.js";
import type { Team } from "../match/rules.js";
import type { BpCam } from "../intel/bpCamera.js";

/** Operator, site, spawn-group and format ids. */
const MAX_ID = 32;
/** A Custom match's rules as JSON. */
const MAX_RULES_JSON = 8192;
const MAX_PLAYERS = 16;
/** The last rounds a match state carries (Practice's go on without end). */
export const MAX_HISTORY = 64;
/** At most this many Bulletproof Cameras a round (a bit each where shots break them). */
const MAX_BP_CAMS = 32;
const MAX_ROOMS = 100;
const NO_RATING = 0xffff;

const team = (v: number): Team => {
  if (v > 1) throw new ProtocolError("bad team");
  return v as Team;
};
const phase = (v: number): Phase => {
  if (v > Phase.MatchEnd) throw new ProtocolError("bad phase");
  return v as Phase;
};
const reason = (v: number): WinReason => {
  if (v > WinReason.Deactivated) throw new ProtocolError("bad round result");
  return v as WinReason;
};
/** An optional id: the empty string is none. */
const optStr = (w: ByteWriter, v: string | null) => w.str((v ?? "").slice(0, MAX_ID));
const readOpt = (r: ByteReader) => r.str(MAX_ID) || null;

// ---------------------------------------------------------------- creating and listing rooms

/** Create a match room (on Oregon) running this format (a data/modes id), in its lobby, with the sender as host. */
export const encodeCreateMatch = (format: string) => new ByteWriter().u8(Msg.CreateMatch).str(format.slice(0, MAX_ID)).finish();
/** The server checks the id is a format. */
export const decodeCreateMatch = (r: ByteReader) => ({ format: r.str(MAX_ID) });
export const encodeListRooms = () => Uint8Array.of(Msg.ListRooms);

/** A listed match room: no names, only what helps pick one. */
export interface RoomListEntry {
  code: string;
  format: string;
  players: number;
  maxPlayers: number;
  phase: Phase;
  round: number;
}

export function encodeRoomList(rooms: readonly RoomListEntry[]): Uint8Array {
  const w = new ByteWriter().u8(Msg.RoomList).varu(Math.min(rooms.length, MAX_ROOMS));
  for (const e of rooms.slice(0, MAX_ROOMS)) w.str(e.code).str(e.format.slice(0, MAX_ID)).u8(e.players).u8(e.maxPlayers).u8(e.phase).u8(Math.min(255, e.round));
  return w.finish();
}
export function decodeRoomList(r: ByteReader): RoomListEntry[] {
  const n = r.varu();
  if (n > MAX_ROOMS) throw new ProtocolError("room list too long");
  return Array.from({ length: n }, () => ({ code: r.str(ROOM_CODE_LENGTH * 2), format: r.str(MAX_ID), players: r.u8(), maxPlayers: r.u8(), phase: phase(r.u8()), round: r.u8() }));
}

// ---------------------------------------------------------------- the lobby

/** A lobby choice: your team and ready; the host's moves, kicks, format and settings, start, back to the lobby. */
export type LobbyAction =
  | { kind: "team"; team: Team }
  | { kind: "ready"; ready: boolean }
  | { kind: "move"; member: number; team: Team }
  | { kind: "swapTeams" }
  | { kind: "kick"; member: number }
  | { kind: "format"; format: string }
  | { kind: "change"; change: HostChange }
  | { kind: "start" }
  | { kind: "backToLobby" }
  | { kind: "private"; private: boolean }
  /** Ranked: this browser's local rating (D-124). */
  | { kind: "rating"; rating: number }
  /** The host ends a match whose rounds go on without end (Practice). */
  | { kind: "end" };

const LOBBY = { team: 0, ready: 1, move: 2, swapTeams: 3, kick: 4, format: 5, change: 6, start: 7, backToLobby: 8, private: 9, rating: 10, end: 11 } as const;
const CHANGE = { bans: 0, reinforcementScaling: 1, rules: 2 } as const;
const SCALINGS = ["scaled", "full", "infinite"] as const;

export function encodeLobbyAction(a: LobbyAction): Uint8Array {
  const w = new ByteWriter().u8(Msg.LobbyAction).u8(LOBBY[a.kind]);
  if (a.kind === "team") w.u8(a.team);
  else if (a.kind === "ready") w.u8(a.ready ? 1 : 0);
  else if (a.kind === "move") w.varu(a.member).u8(a.team);
  else if (a.kind === "kick") w.varu(a.member);
  else if (a.kind === "format") w.str(a.format.slice(0, MAX_ID));
  else if (a.kind === "private") w.u8(a.private ? 1 : 0);
  else if (a.kind === "rating") w.u16(Math.max(0, Math.min(NO_RATING - 1, Math.round(a.rating))));
  else if (a.kind === "change") {
    const c = a.change;
    w.u8(CHANGE[c.kind]);
    if (c.kind === "bans") w.u8(c.maxPerSide);
    else if (c.kind === "reinforcementScaling") w.u8(SCALINGS.indexOf(c.value));
    else w.str(JSON.stringify(c.rules));
  }
  return w.finish();
}

export function decodeLobbyAction(r: ByteReader): LobbyAction {
  const k = r.u8();
  const bool = () => {
    const v = r.u8();
    if (v > 1) throw new ProtocolError("bad flag");
    return v === 1;
  };
  switch (k) {
    case LOBBY.team:
      return { kind: "team", team: team(r.u8()) };
    case LOBBY.ready:
      return { kind: "ready", ready: bool() };
    case LOBBY.move:
      return { kind: "move", member: r.varu(), team: team(r.u8()) };
    case LOBBY.swapTeams:
      return { kind: "swapTeams" };
    case LOBBY.kick:
      return { kind: "kick", member: r.varu() };
    case LOBBY.format:
      return { kind: "format", format: r.str(MAX_ID) };
    case LOBBY.change: {
      const c = r.u8();
      if (c === CHANGE.bans) return { kind: "change", change: { kind: "bans", maxPerSide: r.u8() } };
      if (c === CHANGE.reinforcementScaling) {
        const value = SCALINGS[r.u8()];
        if (!value) throw new ProtocolError("bad scaling");
        return { kind: "change", change: { kind: "reinforcementScaling", value } };
      }
      if (c === CHANGE.rules) {
        let rules: unknown;
        try {
          rules = JSON.parse(r.str(MAX_RULES_JSON));
        } catch {
          throw new ProtocolError("bad rules");
        }
        return { kind: "change", change: { kind: "rules", rules } };
      }
      throw new ProtocolError("bad change");
    }
    case LOBBY.start:
      return { kind: "start" };
    case LOBBY.backToLobby:
      return { kind: "backToLobby" };
    case LOBBY.private:
      return { kind: "private", private: bool() };
    case LOBBY.rating:
      return { kind: "rating", rating: r.u16() };
    case LOBBY.end:
      return { kind: "end" };
  }
  throw new ProtocolError("bad lobby action");
}

// ---------------------------------------------------------------- a round's choices

/** A round's choices (operators and loadouts ride PickLoadout): ban and site votes, the spawn, the defuser. */
export type MatchAction =
  | { kind: "banVote"; operator: string | null }
  | { kind: "siteVote"; site: string | null }
  | { kind: "spawn"; group: string }
  | { kind: "defuser"; take: boolean };

const ACTION = { banVote: 0, siteVote: 1, spawn: 2, defuser: 3 } as const;

export function encodeMatchAction(a: MatchAction): Uint8Array {
  const w = new ByteWriter().u8(Msg.MatchAction).u8(ACTION[a.kind]);
  if (a.kind === "banVote") optStr(w, a.operator);
  else if (a.kind === "siteVote") optStr(w, a.site);
  else if (a.kind === "spawn") w.str(a.group.slice(0, MAX_ID));
  else w.u8(a.take ? 1 : 0);
  return w.finish();
}

export function decodeMatchAction(r: ByteReader): MatchAction {
  const k = r.u8();
  if (k === ACTION.banVote) return { kind: "banVote", operator: readOpt(r) };
  if (k === ACTION.siteVote) return { kind: "siteVote", site: readOpt(r) };
  if (k === ACTION.spawn) return { kind: "spawn", group: r.str(MAX_ID) };
  if (k === ACTION.defuser) {
    const v = r.u8();
    if (v > 1) throw new ProtocolError("bad defuser choice");
    return { kind: "defuser", take: v === 1 };
  }
  throw new ProtocolError("bad match action");
}

// ---------------------------------------------------------------- the match as a player sees it

/** One player as the recipient may see them (match/DESIGN.md §10: votes and spawns only for teammates). */
export interface MatchViewPlayer {
  id: number;
  name: string;
  team: Team;
  ready: boolean;
  connected: boolean;
  /** Their side this round (0 attack, 1 defense), or null: not in this round. */
  side: 0 | 1 | null;
  /** Their body is alive this round (alive and down both count; dead or none don't). */
  alive: boolean;
  /** Their body takes no damage: Quick Match's Attacker Safeguard (until `MatchView.safeguardEnd`). */
  safe: boolean;
  /** This round's operator: teammates' always, the other team's once action starts. */
  operator: string | null;
  spawn: string | null;
  banVote: string | null;
  siteVote: string | null;
  /** 1v1 attrition: the operator they can't pick this round (they won the last one with it); teammates' only. */
  locked: string | null;
  kills: number;
  deaths: number;
  assists: number;
  /** Ranked: the local rating (D-124), or null. */
  rating: number | null;
  /** Ranked, at the match end: the rating after it (D-124), or null. */
  newRating: number | null;
}

/** The match as one player may see it (MatchState). */
export interface MatchView {
  /** The format (data/modes id) and its name. */
  format: string;
  phase: Phase;
  /** Server ticks: when this phase started and ends (NO_END: it waits for the host). */
  phaseStart: number;
  phaseEnd: number;
  round: number;
  /** The team attacking this round. */
  attackers: Team;
  overtime: boolean;
  score: [number, number];
  /** Member ids: the host and the recipient. */
  host: number;
  you: number;
  /** Not in the server's room list. */
  private: boolean;
  /** What the simulation must apply (Sim.matchRules). */
  redWalls: boolean;
  players: MatchViewPlayer[];
  /** Banned this round: [attackers, defenders]. */
  bans: [string[], string[]];
  /** The site: always for defenders, for attackers once revealed; else null. */
  site: string | null;
  siteRevealed: boolean;
  /** Who carries (or will carry) the defuser: attackers only, else 0. */
  carrier: number;
  /** The server tick Quick Match's Attacker Safeguard ends this round (players' `safe`), or 0: none. */
  safeguardEnd: number;
  /** The default cameras broken this round (Phase 7): a bit each, in the level's order. */
  camsBroken: number;
  /** The round's Bulletproof Cameras (Phase 7 M5), in the order they were placed. */
  bpCams: BpCam[];
  /** The cameras someone is watching (Phase 7): a bit each, the level's then the Bulletproof Cameras. */
  camsWatched: number;
  history: RoundRecord[];
  /** At the match end: the winner (null: a draw), whether by forfeit, and the MVP (0: none). */
  winner: Team | null;
  forfeit: boolean;
  mvp: number;
  /** Defenders detected outside (pawn ids): attackers only. */
  detected: number[];
  /**
   * The defuser this round as the simulation has it (Sim.objective; null outside prep, action and the round end):
   * its carrier's pawn and where it lies dropped (attackers only: 0 and null for defenders), where it is planted,
   * and the format's plant and disable holds in ticks.
   */
  defuser: { carrier: number; dropped: [number, number, number] | null; planted: [number, number, number] | null; canPlant: boolean; plantTicks: number; disableTicks: number } | null;
  /** The rules (JSON of the format with the host's changes), sent when they changed since the last state this player got; else null. */
  rules: string | null;
  /** Counts every change of the rules (a client keeps the JSON it has while this stays the same). */
  rulesVersion: number;
}

const F = { redWalls: 1, siteRevealed: 2, private: 4, overtime: 8, forfeit: 16, rules: 32 } as const;
const PF = { ready: 1, connected: 2, alive: 4, safe: 8 } as const;

export function encodeMatchState(v: MatchView): Uint8Array {
  const w = new ByteWriter(512).u8(Msg.MatchState).str(v.format.slice(0, MAX_ID)).u8(v.phase).u32(v.phaseStart >>> 0).u32(v.phaseEnd >>> 0).u8(Math.min(255, v.round)).u8(v.attackers);
  w.u8(Math.min(255, v.score[0])).u8(Math.min(255, v.score[1])).varu(v.host).varu(v.you);
  w.u8((v.redWalls ? F.redWalls : 0) | (v.siteRevealed ? F.siteRevealed : 0) | (v.private ? F.private : 0) | (v.overtime ? F.overtime : 0) | (v.forfeit ? F.forfeit : 0) | (v.rules !== null ? F.rules : 0));
  const players = v.players.slice(0, MAX_PLAYERS);
  w.u8(players.length);
  for (const p of players) {
    w.varu(p.id).str(p.name).u8(p.team).u8((p.ready ? PF.ready : 0) | (p.connected ? PF.connected : 0) | (p.alive ? PF.alive : 0) | (p.safe ? PF.safe : 0)).u8(p.side ?? 2);
    for (const s of [p.operator, p.spawn, p.banVote, p.siteVote, p.locked]) optStr(w, s);
    w.u16(Math.min(0xffff, p.kills)).u16(Math.min(0xffff, p.deaths)).u16(Math.min(0xffff, p.assists)).u16(p.rating ?? NO_RATING).u16(p.newRating ?? NO_RATING);
  }
  for (const side of v.bans) {
    w.u8(Math.min(6, side.length));
    for (const op of side.slice(0, 6)) w.str(op);
  }
  optStr(w, v.site);
  w.varu(v.carrier).u32(v.safeguardEnd >>> 0).u32(v.camsBroken >>> 0).u32(v.camsWatched >>> 0);
  w.u8(Math.min(MAX_BP_CAMS, v.bpCams.length));
  for (const c of v.bpCams.slice(0, MAX_BP_CAMS)) {
    w.f32(c.pos[0]).f32(c.pos[1]).f32(c.pos[2]).f32(c.yaw).u8((c.onFloor ? 1 : 0) | (c.broken ? 2 : 0) | (c.lost ? 4 : 0));
    w.varu(c.owner).u32(c.signalEnd >>> 0).u32(c.dartReady >>> 0).varu(c.panel + 1);
  }
  const history = v.history.slice(-MAX_HISTORY);
  w.u8(history.length);
  for (const h of history) w.u8(Math.min(255, h.round)).u8(h.attackers).u8(h.winner).u8(h.reason).str(h.site);
  w.u8(v.winner ?? 2).varu(v.mvp);
  w.u8(Math.min(MAX_PLAYERS, v.detected.length));
  for (const id of v.detected.slice(0, MAX_PLAYERS)) w.varu(id);
  const d = v.defuser;
  w.u8(d ? 1 | (d.dropped ? 2 : 0) | (d.planted ? 4 : 0) | (d.canPlant ? 8 : 0) : 0);
  if (d) {
    w.varu(d.carrier).u16(Math.min(0xffff, d.plantTicks)).u16(Math.min(0xffff, d.disableTicks));
    for (const p of [d.dropped, d.planted]) if (p) for (const c of p) w.f32(c);
  }
  w.varu(v.rulesVersion);
  if (v.rules !== null) w.str(v.rules);
  return w.finish();
}

export function decodeMatchState(r: ByteReader): MatchView {
  const format = r.str(MAX_ID);
  const ph = phase(r.u8());
  const phaseStart = r.u32();
  const phaseEnd = r.u32();
  const round = r.u8();
  const attackers = team(r.u8());
  const score: [number, number] = [r.u8(), r.u8()];
  const host = r.varu();
  const you = r.varu();
  const f = r.u8();
  if (f > 63) throw new ProtocolError("bad match flags");
  const n = r.u8();
  if (n > MAX_PLAYERS) throw new ProtocolError("too many players");
  const players: MatchViewPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const id = r.varu();
    const name = r.str(MAX_NAME * 4);
    const t = team(r.u8());
    const pf = r.u8();
    const side = r.u8();
    if (pf > 15 || side > 2) throw new ProtocolError("bad player");
    const [operator, spawn, banVote, siteVote, locked] = [readOpt(r), readOpt(r), readOpt(r), readOpt(r), readOpt(r)];
    const [kills, deaths, assists, rating, newRating] = [r.u16(), r.u16(), r.u16(), r.u16(), r.u16()];
    players.push({
      id,
      name,
      team: t,
      ready: (pf & PF.ready) !== 0,
      connected: (pf & PF.connected) !== 0,
      alive: (pf & PF.alive) !== 0,
      safe: (pf & PF.safe) !== 0,
      side: side === 2 ? null : (side as 0 | 1),
      operator,
      spawn,
      banVote,
      siteVote,
      locked,
      kills,
      deaths,
      assists,
      rating: rating === NO_RATING ? null : rating,
      newRating: newRating === NO_RATING ? null : newRating,
    });
  }
  const bans: [string[], string[]] = [[], []];
  for (const side of bans) {
    const k = r.u8();
    if (k > 6) throw new ProtocolError("too many bans");
    for (let i = 0; i < k; i++) side.push(r.str(MAX_ID));
  }
  const site = readOpt(r);
  const carrier = r.varu();
  const safeguardEnd = r.u32();
  const camsBroken = r.u32();
  const camsWatched = r.u32();
  const nb = r.u8();
  if (nb > MAX_BP_CAMS) throw new ProtocolError("too many cameras");
  const bpCams = Array.from({ length: nb }, (): BpCam => {
    const pos: [number, number, number] = [r.finite(), r.finite(), r.finite()];
    const yaw = r.finite();
    const fl = r.u8();
    if (fl > 7) throw new ProtocolError("bad camera");
    return { pos, yaw, onFloor: (fl & 1) !== 0, broken: (fl & 2) !== 0, lost: (fl & 4) !== 0, owner: r.varu(), signalEnd: r.u32(), dartReady: r.u32(), panel: r.varu() - 1 };
  });
  const h = r.u8();
  if (h > MAX_HISTORY) throw new ProtocolError("history too long");
  const history: RoundRecord[] = Array.from({ length: h }, () => ({ round: r.u8(), attackers: team(r.u8()), winner: team(r.u8()), reason: reason(r.u8()), site: r.str(MAX_ID) }));
  const wv = r.u8();
  if (wv > 2) throw new ProtocolError("bad winner");
  const mvp = r.varu();
  const d = r.u8();
  if (d > MAX_PLAYERS) throw new ProtocolError("too many detected");
  const detected = Array.from({ length: d }, () => r.varu());
  const df = r.u8();
  if (df > 15 || (df !== 0 && !(df & 1))) throw new ProtocolError("bad defuser");
  let defuser: MatchView["defuser"] = null;
  if (df & 1) {
    const carrier = r.varu();
    const plantTicks = r.u16();
    const disableTicks = r.u16();
    const v3 = (): [number, number, number] => [r.finite(), r.finite(), r.finite()];
    const dropped = df & 2 ? v3() : null;
    const planted = df & 4 ? v3() : null;
    defuser = { carrier, dropped, planted, canPlant: (df & 8) !== 0, plantTicks, disableTicks };
  }
  const rulesVersion = r.varu();
  const rules = f & F.rules ? r.str(MAX_RULES_JSON) : null;
  if (r.remaining !== 0) throw new ProtocolError("trailing bytes");
  return {
    format,
    phase: ph,
    phaseStart,
    phaseEnd,
    round,
    attackers,
    overtime: (f & F.overtime) !== 0,
    score,
    host,
    you,
    private: (f & F.private) !== 0,
    redWalls: (f & F.redWalls) !== 0,
    players,
    bans,
    site,
    siteRevealed: (f & F.siteRevealed) !== 0,
    carrier,
    safeguardEnd,
    camsBroken,
    bpCams,
    camsWatched,
    history,
    winner: wv === 2 ? null : (wv as Team),
    forfeit: (f & F.forfeit) !== 0,
    mvp,
    detected,
    defuser,
    rules,
    rulesVersion,
  };
}
