// The rules of a match as pure functions of its format (data/modes/*.json `match`; match/DESIGN.md §3, §5):
// who attacks in each round, when the match is won, overtime, ban phases, vote counting, which operators a
// player may pick, the reinforcement pool, the local rating and the MVP. No state and no simulation here.
import type { MatchRules, ModeData } from "../data/schemas.js";

/** A match team: Blue 0, Orange 1. */
export type Team = 0 | 1;
/** A side in a round: attackers 0, defenders 1 (the simulation's `pawn.team`, sim.ts sideTeam). */
export type Side = 0 | 1;
export const ATTACK: Side = 0;
export const DEFENSE: Side = 1;
export const TEAM_NAMES = ["Blue", "Orange"] as const;

export const other = <T extends 0 | 1>(t: T): T => (1 - t) as T;

/** A mode with match rules: a format (Quick Match, Ranked...). */
export type FormatMode = ModeData & { match: MatchRules };
export const isFormat = (m: ModeData): m is FormatMode => m.match !== undefined;

/** Wins that take the match in regulation (half the rounds plus one), or null when rounds go on (Practice). */
export const winAt = (m: MatchRules): number | null => (m.rounds === null ? null : m.rounds / 2 + 1);

/** Round `r` (from 1) is an overtime round. */
export const isOvertime = (m: MatchRules, r: number): boolean => m.rounds !== null && r > m.rounds;

/**
 * The team attacking in round `r`, given the team that attacked first: in regulation the sides swap every
 * `swapEvery` rounds; in overtime they swap going in, then every `overtime.swapEvery` rounds (D-121).
 */
export function attackersIn(m: MatchRules, first: Team, r: number): Team {
  if (!isOvertime(m, r)) return Math.floor((r - 1) / m.swapEvery) % 2 === 0 ? first : other(first);
  const last = attackersIn(m, first, m.rounds!);
  const k = r - m.rounds!;
  return Math.floor((k - 1) / (m.overtime?.swapEvery ?? 1)) % 2 === 0 ? other(last) : last;
}

/** How a match stands after `played` rounds with this score: still on, won by a team, or a draw (no overtime). */
export function matchResult(m: MatchRules, score: readonly [number, number], played: number): { over: false } | { over: true; winner: Team | null } {
  if (m.rounds === null) return { over: false };
  const need = winAt(m)!;
  if (played <= m.rounds) {
    if (score[0] >= need) return { over: true, winner: 0 };
    if (score[1] >= need) return { over: true, winner: 1 };
    if (played < m.rounds) return { over: false };
    // Regulation is over at a tie (an even number of rounds, so no one is ahead): overtime, or a draw.
    return m.overtime ? { over: false } : { over: true, winner: null };
  }
  const ot = m.overtime!;
  const diff = score[0] - score[1];
  if (Math.abs(diff) >= ot.winBy) return { over: true, winner: diff > 0 ? 0 : 1 };
  // After the last overtime round (an odd number of them) someone is ahead.
  if (ot.rounds !== null && played - m.rounds >= ot.rounds) return { over: true, winner: diff > 0 ? 0 : diff < 0 ? 1 : null };
  return { over: false };
}

/** Seconds on the planning screen in round `r`: Quick Match gives less when the sides didn't swap (research §2). */
export function pickSeconds(m: MatchRules, first: Team, r: number): number {
  const same = m.seconds.pickSameSides;
  if (same === null || r === 1) return m.seconds.pick;
  return attackersIn(m, first, r) === attackersIn(m, first, r - 1) ? same : m.seconds.pick;
}

/** The half a round is in: bans build up within one and clear at the swap. Overtime rounds belong to none. */
export const halfOf = (m: MatchRules, r: number): number | null => (isOvertime(m, r) ? null : Math.floor((r - 1) / m.swapEvery));

/**
 * Round `r` opens with a ban phase (D-119): bans are on, it's a regulation round, and it is one of the first
 * `maxPerSide` rounds of its half (each adds one ban per side to the half's stack).
 */
export function hasBanPhase(m: MatchRules, r: number): boolean {
  if (!m.bans || m.bans.maxPerSide === 0 || isOvertime(m, r)) return false;
  return (r - 1) % m.swapEvery < m.bans.maxPerSide;
}

/**
 * A team's choice from its players' votes (bans, the site; research §6): the most votes, a tie broken by
 * `roll` (0 ≤ roll < 1, from the room's seed) among the tied choices in sorted order; no votes, null.
 */
export function tally(votes: readonly (string | null)[], roll: number): string | null {
  const counts = new Map<string, number>();
  for (const v of votes) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  if (counts.size === 0) return null;
  const top = Math.max(...counts.values());
  const tied = [...counts].filter(([, n]) => n === top).map(([v]) => v).sort();
  return tied[Math.min(tied.length - 1, Math.floor(roll * tied.length))];
}

/**
 * A ban counts only if the side keeps at least as many operators as players will play it (PLAN §6.2): with
 * `alreadyBanned` of the side's `roster` operators banned and `players` on that side.
 */
export const banLeavesEnough = (roster: number, alreadyBanned: number, players: number): boolean => roster - (alreadyBanned + 1) >= players;

/**
 * The operators a player may pick: the side's roster in order, minus the bans, the ones teammates hold, and the
 * one attrition locks (1v1: the operator the player won the last round with).
 */
export function allowedOperators(roster: readonly string[], banned: ReadonlySet<string>, heldByTeammates: ReadonlySet<string>, locked: string | null): string[] {
  return roster.filter((id) => !banned.has(id) && !heldByTeammates.has(id) && id !== locked);
}

/** A pool too big to run out (Practice's endless reinforcements). */
export const ENDLESS_POOL = 9999;
/** D-015's floor: Siege's own 1v1 pool, and never less for a bigger team. */
const POOL_FLOOR = 6;
/** The team size Siege's pools are made for. */
const FULL_TEAM = 5;

/** The defenders' reinforcement pool for a round: Siege's scaled for small teams (D-015), as it is, or endless. */
export function reinforcementPool(mode: FormatMode, defenders: number): number {
  switch (mode.match.reinforcementScaling) {
    case "full":
      return mode.reinforcements;
    case "infinite":
      return ENDLESS_POOL;
    case "scaled":
      return Math.max(POOL_FLOOR, Math.round((mode.reinforcements * defenders) / FULL_TEAM));
  }
}

/** A local ranked rating's bounds and a new player's (D-124). */
export const RATING_MIN = 0;
export const RATING_MAX = 5000;
export const RATING_START = 1000;
const ELO_K = 32;

/**
 * Each player's new rating after a rated match (D-124): Elo with K = 32 on each team's average rating, the same
 * change for everyone on a team; a draw scores a half.
 */
export function ratingChanges(players: readonly { id: number; team: Team; rating: number }[], winner: Team | null): Map<number, number> {
  const avg = (t: Team) => {
    const rs = players.filter((p) => p.team === t).map((p) => p.rating);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : RATING_START;
  };
  const r: [number, number] = [avg(0), avg(1)];
  const out = new Map<number, number>();
  for (const p of players) {
    const expected = 1 / (1 + 10 ** ((r[other(p.team)] - r[p.team]) / 400));
    const scored = winner === null ? 0.5 : winner === p.team ? 1 : 0;
    out.set(p.id, Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(p.rating + ELO_K * (scored - expected)))));
  }
  return out;
}

/** The match MVP (D-124): most kills, then most assists, then fewest deaths, then who joined first; null with nobody. */
export function mvp(players: readonly { id: number; kills: number; assists: number; deaths: number; order: number }[]): number | null {
  const best = [...players].sort((a, b) => b.kills - a.kills || b.assists - a.assists || a.deaths - b.deaths || a.order - b.order)[0];
  return best?.id ?? null;
}
