// The match rules as pure functions (match/rules.ts, outcome.ts, settings.ts) against the formats in data/modes.
import { describe, expect, it } from "vitest";
import {
  allowedOperators,
  applyHostChange,
  ATTACK,
  attackersIn,
  banLeavesEnough,
  DEFENSE,
  ENDLESS_POOL,
  hasBanPhase,
  isFormat,
  loadGameData,
  matchResult,
  mvp,
  pickSeconds,
  ratingChanges,
  reinforcementPool,
  roundOutcome,
  tally,
  winAt,
  WinReason,
  type FormatMode,
  type RoundFacts,
} from "../src/index.js";

const data = loadGameData();
const format = (id: string): FormatMode => {
  const m = data.modes.get(id);
  if (!m || !isFormat(m)) throw new Error(`no format ${id}`);
  return m;
};
const ranked = format("ranked");
const qm = format("quick_match");
const oneVOne = format("one_v_one");
const practice = format("practice");
const custom = format("custom");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("formats (data/modes)", () => {
  it("every match format loads, in lobby order, and the lab preset isn't one", () => {
    const ids = [...data.modes.values()].filter(isFormat).map((m) => m.id);
    expect(ids).toEqual(["quick_match", "unranked", "ranked", "one_v_one", "custom", "practice"]);
    expect(isFormat(data.modes.get("lab")!)).toBe(false);
  });

  it("follow research/round_flow.md: rounds, swaps, overtime, bans, timers", () => {
    expect([winAt(qm.match), winAt(ranked.match), winAt(oneVOne.match), winAt(practice.match)]).toEqual([3, 4, 4, null]);
    expect(qm.match.overtime).toEqual({ rounds: 1, winBy: 1, swapEvery: 1 });
    expect(ranked.match.overtime).toEqual({ rounds: 3, winBy: 2, swapEvery: 1 });
    expect(qm.match.bans).toBeNull();
    expect(ranked.match.bans).toEqual({ maxPerSide: 1, voteSeconds: 15 });
    expect(qm.match.seconds).toMatchObject({ pick: 20, pickSameSides: 15, prep: 45, action: 180, plant: 7, fuse: 45, disable: 7, attackerSafeguard: 10, redWallExtension: 10 });
    expect(ranked.match.seconds).toMatchObject({ prep: 45, action: 180, plant: 7, fuse: 45, disable: 7, runoutGrace: 1, attackerSafeguard: 0 });
    expect(oneVOne.match).toMatchObject({ teamSize: { min: 1, max: 1 }, attrition: "winnerLastOperator", bans: null });
    expect(oneVOne.match.seconds.prep).toBe(15);
    expect(practice.match.teamSize.min).toBe(0);
    // Team damage: on in action, off in prep (core_mechanics.md §11); off in Practice.
    expect(ranked.friendlyFire).toMatchObject({ actionPhase: true, prepPhase: false });
    expect(practice.friendlyFire.actionPhase).toBe(false);
    expect(ranked.match.stats).toBe("rated");
    expect(custom.match.host).toBe("all");
  });
});

describe("sides, rounds and overtime", () => {
  const sides = (f: FormatMode, n: number) => Array.from({ length: n }, (_, i) => attackersIn(f.match, 0, i + 1));

  it("Ranked: three rounds a side, then overtime swapping every round (in too, D-121)", () => {
    expect(sides(ranked, 9)).toEqual([0, 0, 0, 1, 1, 1, 0, 1, 0]);
    expect(attackersIn(ranked.match, 1, 1)).toBe(1);
  });

  it("Quick Match swaps after round 2; 1v1 at round 4; Practice every round", () => {
    expect(sides(qm, 5)).toEqual([0, 0, 1, 1, 0]);
    expect(sides(oneVOne, 7)).toEqual([0, 0, 0, 1, 1, 1, 0]);
    expect(sides(practice, 4)).toEqual([0, 1, 0, 1]);
  });

  it("the match ends at the format's wins, goes to overtime at a tie, and overtime ends by its lead or its last round", () => {
    const r = ranked.match;
    expect(matchResult(r, [4, 0], 4)).toEqual({ over: true, winner: 0 });
    expect(matchResult(r, [2, 4], 6)).toEqual({ over: true, winner: 1 });
    expect(matchResult(r, [3, 2], 5)).toEqual({ over: false });
    expect(matchResult(r, [3, 3], 6)).toEqual({ over: false });
    expect(matchResult(r, [4, 3], 7)).toEqual({ over: false });
    expect(matchResult(r, [5, 3], 8)).toEqual({ over: true, winner: 0 });
    expect(matchResult(r, [4, 4], 8)).toEqual({ over: false });
    expect(matchResult(r, [4, 5], 9)).toEqual({ over: true, winner: 1 });
    expect(matchResult(qm.match, [2, 2], 4)).toEqual({ over: false });
    expect(matchResult(qm.match, [3, 2], 5)).toEqual({ over: true, winner: 0 });
    expect(matchResult(oneVOne.match, [3, 4], 7)).toEqual({ over: true, winner: 1 });
    // Without overtime a tie after regulation is a draw; Practice never ends.
    const noOt = { ...clone(custom.match), overtime: null };
    expect(matchResult(noOt, [3, 3], 6)).toEqual({ over: true, winner: null });
    expect(matchResult(practice.match, [40, 0], 40)).toEqual({ over: false });
  });

  it("Quick Match's planning screen is 15 s when the sides didn't swap, else 20 s", () => {
    expect([1, 2, 3, 4, 5].map((r) => pickSeconds(qm.match, 0, r))).toEqual([20, 15, 20, 15, 20]);
    expect([1, 2, 4, 7].map((r) => pickSeconds(ranked.match, 0, r))).toEqual([30, 30, 30, 30]);
  });
});

describe("bans (D-119)", () => {
  it("one ban phase a half at the default cap, two with 2, none at 0, in overtime or without bans", () => {
    const phases = (maxPerSide: number) => {
      const m = clone(ranked.match);
      m.bans!.maxPerSide = maxPerSide;
      return Array.from({ length: 9 }, (_, i) => i + 1).filter((r) => hasBanPhase(m, r));
    };
    expect(phases(1)).toEqual([1, 4]);
    expect(phases(2)).toEqual([1, 2, 4, 5]);
    expect(phases(0)).toEqual([]);
    expect([1, 2, 3, 4, 5].filter((r) => hasBanPhase(qm.match, r))).toEqual([]);
  });

  it("a vote is the most-voted choice, a tie broken by the roll, and nothing with no votes", () => {
    expect(tally(["mute", "pulse", "mute", null], 0.9)).toBe("mute");
    expect(tally(["pulse", "mute"], 0)).toBe("mute");
    expect(tally(["pulse", "mute"], 0.99)).toBe("pulse");
    expect(tally([null, null], 0.5)).toBeNull();
    expect(tally([], 0.5)).toBeNull();
  });

  it("a ban never leaves a side fewer operators than its players", () => {
    expect(banLeavesEnough(6, 0, 5)).toBe(true);
    expect(banLeavesEnough(6, 1, 5)).toBe(false);
    expect(banLeavesEnough(6, 1, 4)).toBe(true);
  });
});

describe("operators, pools, rating, MVP", () => {
  it("the operators left to pick keep the roster's order, without bans, teammates' picks and attrition", () => {
    const roster = ["brava", "fuze", "thermite", "striker", "dokkaebi", "sledge"];
    expect(allowedOperators(roster, new Set(["fuze"]), new Set(["sledge"]), "brava")).toEqual(["thermite", "striker", "dokkaebi"]);
  });

  it("reinforcements: D-015's scaling (6, 6, 6, 8, 10), Siege's 10, or endless", () => {
    expect([1, 2, 3, 4, 5].map((n) => reinforcementPool(ranked, n))).toEqual([6, 6, 6, 8, 10]);
    expect(reinforcementPool(oneVOne, 1)).toBe(6);
    const full = clone(ranked);
    full.match.reinforcementScaling = "full";
    expect(reinforcementPool(full, 1)).toBe(10);
    full.match.reinforcementScaling = "infinite";
    expect(reinforcementPool(full, 3)).toBe(ENDLESS_POOL);
  });

  it("local rating: Elo with K = 32 on team averages, the same change for a whole team (D-124)", () => {
    const even = ratingChanges(
      [
        { id: 1, team: 0, rating: 1000 },
        { id: 2, team: 0, rating: 1000 },
        { id: 3, team: 1, rating: 1000 },
      ],
      0,
    );
    expect([...even]).toEqual([
      [1, 1016],
      [2, 1016],
      [3, 984],
    ]);
    const draw = ratingChanges([{ id: 1, team: 0, rating: 1200 }, { id: 2, team: 1, rating: 1000 }], null);
    expect(draw.get(1)).toBeLessThan(1200);
    expect(draw.get(2)).toBeGreaterThan(1000);
    const upset = ratingChanges([{ id: 1, team: 0, rating: 800 }, { id: 2, team: 1, rating: 1600 }], 0);
    expect(upset.get(1)! - 800).toBeGreaterThan(16);
    expect(ratingChanges([{ id: 1, team: 0, rating: 0 }, { id: 2, team: 1, rating: 0 }], 1).get(1)).toBe(0);
  });

  it("MVP: kills, then assists, then fewest deaths, then who joined first", () => {
    const p = (id: number, kills: number, assists: number, deaths: number) => ({ id, kills, assists, deaths, order: id });
    expect(mvp([p(1, 2, 0, 3), p(2, 3, 0, 5)])).toBe(2);
    expect(mvp([p(1, 2, 1, 3), p(2, 2, 2, 5)])).toBe(2);
    expect(mvp([p(1, 2, 2, 3), p(2, 2, 2, 1)])).toBe(2);
    expect(mvp([p(2, 0, 0, 0), p(1, 0, 0, 0)])).toBe(1);
    expect(mvp([])).toBeNull();
  });
});

describe("who wins a round (research/round_flow.md §4)", () => {
  const facts = (f: Partial<RoundFacts>): RoundFacts => ({
    attackersUp: 2,
    defendersUp: 3,
    attackersPlaying: 2,
    defendersPlaying: 3,
    planted: false,
    plantInProgress: false,
    timeUp: false,
    fuseDone: false,
    disabled: false,
    deactivated: false,
    ...f,
  });
  const win = (side: number, reason: WinReason) => ({ winner: side, reason });

  it("plays on while both sides are up and time remains", () => {
    expect(roundOutcome(facts({}))).toBeNull();
  });
  it("1: attackers all out before a plant: defenders", () => {
    expect(roundOutcome(facts({ attackersUp: 0 }))).toEqual(win(DEFENSE, WinReason.Elimination));
  });
  it("2: time runs out with no plant: defenders", () => {
    expect(roundOutcome(facts({ timeUp: true }))).toEqual(win(DEFENSE, WinReason.Time));
  });
  it("3 and 4: a plant under way when time runs out plays on; if it stops, defenders win on time", () => {
    expect(roundOutcome(facts({ timeUp: true, plantInProgress: true }))).toBeNull();
    expect(roundOutcome(facts({ timeUp: true, plantInProgress: false }))).toEqual(win(DEFENSE, WinReason.Time));
  });
  it("5: the fuse runs out: attackers", () => {
    expect(roundOutcome(facts({ planted: true, fuseDone: true }))).toEqual(win(ATTACK, WinReason.Detonated));
  });
  it("6: defenders all out, before or after the plant: attackers", () => {
    expect(roundOutcome(facts({ defendersUp: 0 }))).toEqual(win(ATTACK, WinReason.Elimination));
    expect(roundOutcome(facts({ defendersUp: 0, planted: true }))).toEqual(win(ATTACK, WinReason.Elimination));
  });
  it("7: disabled in time: defenders, even with the attackers all out", () => {
    expect(roundOutcome(facts({ planted: true, disabled: true, attackersUp: 0 }))).toEqual(win(DEFENSE, WinReason.Disabled));
  });
  it("8: the hatch under the defuser destroyed: defenders", () => {
    expect(roundOutcome(facts({ planted: true, deactivated: true }))).toEqual(win(DEFENSE, WinReason.Deactivated));
  });
  it("9: both sides out at once: attackers if planted, else defenders", () => {
    expect(roundOutcome(facts({ attackersUp: 0, defendersUp: 0 }))).toEqual(win(DEFENSE, WinReason.Elimination));
    expect(roundOutcome(facts({ attackersUp: 0, defendersUp: 0, planted: true }))).toEqual(win(ATTACK, WinReason.Elimination));
  });
  it("planted, the attackers all out isn't the end: the defenders must disable", () => {
    expect(roundOutcome(facts({ planted: true, attackersUp: 0 }))).toBeNull();
  });
  it("an empty side (Practice) can't be eliminated", () => {
    expect(roundOutcome(facts({ defendersUp: 0, defendersPlaying: 0 }))).toBeNull();
    expect(roundOutcome(facts({ attackersUp: 0, attackersPlaying: 0, timeUp: true }))).toEqual(win(DEFENSE, WinReason.Time));
  });
});

describe("what the host may change (match/settings.ts)", () => {
  it("the fixed formats' toggles: bans 0–2 where there are bans, scaling on or off", () => {
    const r = applyHostChange(ranked, ranked, { kind: "bans", maxPerSide: 2 });
    expect(typeof r === "string" ? r : r.match.bans?.maxPerSide).toBe(2);
    expect(applyHostChange(ranked, ranked, { kind: "bans", maxPerSide: 3 })).toMatch(/0, 1 or 2/);
    expect(applyHostChange(qm, qm, { kind: "bans", maxPerSide: 1 })).toMatch(/can't be changed/);
    const full = applyHostChange(qm, qm, { kind: "reinforcementScaling", value: "full" });
    expect(typeof full === "string" ? full : full.match.reinforcementScaling).toBe("full");
    expect(applyHostChange(qm, qm, { kind: "reinforcementScaling", value: "infinite" })).toMatch(/Custom and Practice/);
    expect(applyHostChange(ranked, ranked, { kind: "rules", rules: { match: ranked.match } })).toMatch(/Only Custom and Practice/);
  });

  it("Custom: any rule within bounds; the format's name, team size, stats and host rights stay", () => {
    const rules = clone(custom.match) as Record<string, unknown> & typeof custom.match;
    rules.seconds.prep = 20;
    rules.seconds.action = 60;
    rules.name = "Mine";
    rules.stats = "rated";
    rules.teamSize = { min: 0, max: 5 };
    const r = applyHostChange(custom, custom, { kind: "rules", rules: { match: rules, friendlyFire: { actionPhase: false, prepPhase: false, scale: 1 } } });
    if (typeof r === "string") throw new Error(r);
    expect(r.match.seconds).toMatchObject({ prep: 20, action: 60 });
    expect(r.match).toMatchObject({ name: "Custom", stats: "none", teamSize: { min: 1, max: 5 } });
    expect(r.friendlyFire.actionPhase).toBe(false);
    const bad = clone(custom.match);
    bad.seconds.action = 5;
    expect(applyHostChange(custom, custom, { kind: "rules", rules: { match: bad } })).toMatch(/action must be 30–600/);
    const endless = { ...clone(custom.match), rounds: null, overtime: null };
    expect(applyHostChange(custom, custom, { kind: "rules", rules: { match: endless } })).toMatch(/needs a number of rounds/);
    expect(applyHostChange(custom, custom, { kind: "rules", rules: { match: { ...clone(custom.match), rounds: 5 } } })).toMatch(/Bad rules/);
    expect(applyHostChange(custom, custom, { kind: "rules", rules: "nope" })).toBe("Bad rules");
    const inf = applyHostChange(practice, practice, { kind: "reinforcementScaling", value: "infinite" });
    expect(typeof inf === "string" ? inf : inf.match.reinforcementScaling).toBe("infinite");
  });
});
