// What a match's host may change about its format (PLAN §6.1, §6.2; match/DESIGN.md §3, §4): the toggles of the
// fixed formats (bans 0–2, reinforcement scaling), and in Custom and Practice every rule, within bounds that keep a
// round playable. The bounds are ours, not Siege's.
import { modeSchema, type MatchRules } from "../data/schemas.js";
import { isFormat, type FormatMode } from "./rules.js";

/** A host's change: one of the toggles, or (Custom, Practice) the rules as edited. */
export type HostChange =
  | { kind: "bans"; maxPerSide: number }
  | { kind: "reinforcementScaling"; value: MatchRules["reinforcementScaling"] }
  | { kind: "rules"; rules: unknown };

/** Seconds the host may set each timer to (inclusive). */
export const SECONDS_BOUNDS: Record<keyof MatchRules["seconds"], [number, number]> = {
  pick: [5, 120],
  pickSameSides: [5, 120],
  prep: [5, 180],
  action: [30, 600],
  plant: [1, 30],
  fuse: [10, 120],
  disable: [1, 30],
  roundEnd: [2, 20],
  runoutGrace: [0, 10],
  attackerSafeguard: [0, 30],
  redWallExtension: [0, 60],
};
export const BAN_VOTE_BOUNDS: [number, number] = [5, 60];

/** What "rules" may set: the whole match block except what makes the format what it is, plus the damage rules. */
const LOCKED = ["name", "teamSize", "stats", "host"] as const;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Problems with rules a host set (empty: fine): the schema's, then our bounds. */
export function hostRulesProblems(mode: FormatMode): string[] {
  const out: string[] = [];
  const s = mode.match.seconds;
  for (const [k, [lo, hi]] of Object.entries(SECONDS_BOUNDS) as [keyof MatchRules["seconds"], [number, number]][]) {
    const v = s[k];
    if (v !== null && (v < lo || v > hi)) out.push(`${k} must be ${lo}–${hi} s`);
  }
  const b = mode.match.bans;
  if (b && (b.voteSeconds < BAN_VOTE_BOUNDS[0] || b.voteSeconds > BAN_VOTE_BOUNDS[1])) out.push(`the ban vote must be ${BAN_VOTE_BOUNDS[0]}–${BAN_VOTE_BOUNDS[1]} s`);
  if (mode.friendlyFire.scale > 1) out.push("friendly fire scale must be at most 1");
  return out;
}

/**
 * The format's rules after the host's change, or why it can't be made. `base` is the format as the data has it
 * (what can't change comes from there), `current` the rules as they are now.
 */
export function applyHostChange(base: FormatMode, current: FormatMode, change: HostChange): FormatMode | string {
  const host = base.match.host;
  const next = clone(current);
  if (change.kind === "bans") {
    if (host !== "all" && !host.includes("bans")) return "This format's bans can't be changed";
    if (!next.match.bans) return "This format has no bans";
    if (!Number.isInteger(change.maxPerSide) || change.maxPerSide < 0 || change.maxPerSide > 2) return "Bans: 0, 1 or 2 per side";
    next.match.bans.maxPerSide = change.maxPerSide;
    return next;
  }
  if (change.kind === "reinforcementScaling") {
    if (host !== "all" && !host.includes("reinforcementScaling")) return "This format's reinforcements can't be changed";
    if (change.value === "infinite" && host !== "all") return "Endless reinforcements are for Custom and Practice";
    if (!["scaled", "full", "infinite"].includes(change.value)) return "Unknown reinforcement setting";
    next.match.reinforcementScaling = change.value;
    return next;
  }
  if (host !== "all") return "Only Custom and Practice let the host change the rules";
  const raw = change.rules;
  if (typeof raw !== "object" || raw === null) return "Bad rules";
  const r = raw as Record<string, unknown>;
  // The rules a host can edit: the match block (less what is locked) and the damage rules; the rest stays the format's.
  const candidate: Record<string, unknown> = {
    ...clone(base),
    friendlyFire: r.friendlyFire ?? next.friendlyFire,
    reverseFriendlyFire: r.reverseFriendlyFire ?? next.reverseFriendlyFire,
    lastAliveDies: r.lastAliveDies ?? next.lastAliveDies,
    match: { ...(typeof r.match === "object" && r.match !== null ? (r.match as object) : next.match) },
  };
  const match = candidate.match as Record<string, unknown>;
  for (const k of LOCKED) match[k] = clone(base.match[k]);
  const parsed = modeSchema.safeParse(candidate);
  if (!parsed.success || !isFormat(parsed.data)) return `Bad rules: ${parsed.error?.issues[0]?.message ?? "not a format"}`;
  // Endless rounds only where the format has them (Practice): a Custom match has a winner.
  if ((parsed.data.match.rounds === null) !== (base.match.rounds === null)) return base.match.rounds === null ? "Practice rounds go on without end" : "A Custom match needs a number of rounds";
  const problems = hostRulesProblems(parsed.data);
  return problems.length ? `Bad rules: ${problems[0]}` : parsed.data;
}
