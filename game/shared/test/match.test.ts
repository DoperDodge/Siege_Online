// The match state machine (match/match.ts): the lobby, a round's phases and timers, votes, picks, the defuser's
// carrier, outcomes, the score, overtime and the end, against the formats in data/modes and Oregon's sites.
import { describe, expect, it } from "vitest";
import {
  ATTACK,
  DEFENSE,
  isFormat,
  loadGameData,
  Match,
  matchMapOf,
  NO_END,
  Phase,
  TICK_HZ,
  WinReason,
  type FormatMode,
  type MatchEvent,
  type Team,
} from "../src/index.js";

const data = loadGameData();
const map = matchMapOf(data.levels.get("oregon")!, data.operators.values());
const format = (id: string): FormatMode => {
  const m = data.modes.get(id)!;
  if (!isFormat(m)) throw new Error(id);
  return m;
};

/** A match with players already in it: `blue` and `orange` names, everyone ready; the first is the host. */
function lobby(id: string, blue: number, orange: number, seed = 7) {
  const match = new Match(format(id), map, seed);
  let next = 1;
  for (let i = 0; i < Math.max(blue, orange); i++) {
    if (i < blue) match.addPlayer(next++, `b${i}`);
    if (i < orange) match.addPlayer(next++, `o${i}`);
  }
  // addPlayer balances; put each where the test wants it.
  const ids = [...match.players.keys()];
  ids.forEach((pid, i) => (match.players.get(pid)!.team = (i < blue + orange && match.players.get(pid)!.name.startsWith("b") ? 0 : 1) as Team));
  for (const p of match.players.values()) match.setReady(p.id, true);
  return match;
}

/** Run the clock to the end of the current phase (with everyone up, nothing planted). */
function finishPhase(match: Match, at: { tick: number }, facts = { attackersUp: 1, defendersUp: 1, plantInProgress: false }): MatchEvent[] {
  at.tick = match.phaseEnd;
  return match.update(at.tick, facts);
}

function started(id: string, blue: number, orange: number, seed = 7) {
  const match = lobby(id, blue, orange, seed);
  const at = { tick: 100 };
  const r = match.start(match.hostId, at.tick);
  if ("error" in r) throw new Error(r.error);
  return { match, at };
}

/** From a round's start to its action phase. */
function toAction(match: Match, at: { tick: number }) {
  while (match.phase !== Phase.Action) finishPhase(match, at);
}

/** Win the current round for a team by eliminating the other side. */
function winRound(match: Match, at: { tick: number }, team: Team) {
  toAction(match, at);
  at.tick++;
  const attackersWin = team === match.attackers;
  match.update(at.tick, { attackersUp: attackersWin ? 1 : 0, defendersUp: attackersWin ? 0 : 1, plantInProgress: false });
  expect(match.phase).toBe(Phase.RoundEnd);
  finishPhase(match, at);
}

describe("lobby", () => {
  it("joiners balance the teams, the first is host, and the host passes on when they leave", () => {
    const m = new Match(format("unranked"), map, 1);
    expect([1, 2, 3].map((id) => m.addPlayer(id, `p${id}`)!.team)).toEqual([0, 1, 0]);
    expect(m.hostId).toBe(1);
    m.removePlayer(1);
    expect(m.players.has(1)).toBe(false);
    expect(m.hostId).toBe(2);
  });

  it("a team takes at most 5 (1 in 1v1), and a full room turns joiners away", () => {
    const m = new Match(format("one_v_one"), map, 1);
    expect(m.addPlayer(1, "a")!.team).toBe(0);
    expect(m.addPlayer(2, "b")!.team).toBe(1);
    expect(m.addPlayer(3, "c")).toBeNull();
    expect(m.setTeam(1, 1)).toMatch(/full/);
    const u = new Match(format("unranked"), map, 1);
    for (let i = 1; i <= 10; i++) expect(u.addPlayer(i, `p${i}`)).not.toBeNull();
    expect(u.addPlayer(11, "x")).toBeNull();
  });

  it("starts only when the teams fit the format and everyone else is ready; only the host starts", () => {
    const m = new Match(format("unranked"), map, 1);
    m.addPlayer(1, "host");
    expect(m.canStart()).toMatch(/At least 1 a team/);
    m.addPlayer(2, "guest");
    expect(m.canStart()).toMatch(/Waiting for guest/);
    m.setReady(2, true);
    expect(m.canStart()).toBeNull();
    expect(m.start(2, 0)).toEqual({ error: "Only the host can do that" });
    expect(Array.isArray(m.start(1, 0))).toBe(true);
    expect(m.setTeam(2, 0)).toMatch(/already started/);
  });

  it("Practice may leave a side empty; uneven teams play everywhere else", () => {
    const p = new Match(format("practice"), map, 1);
    p.addPlayer(1, "solo");
    expect(p.canStart()).toBeNull();
    const two = lobby("unranked", 2, 3);
    expect(two.canStart()).toBeNull();
    expect([two.team(0).length, two.team(1).length]).toEqual([2, 3]);
  });

  it("the host moves players, swaps the teams and changes settings; anyone changing them un-readies everyone", () => {
    const m = lobby("ranked", 1, 2);
    const guest = m.team(1)[0].id;
    expect(m.move(guest, guest, 0)).toMatch(/Only the host/);
    expect(m.move(m.hostId, guest, 0)).toBeNull();
    expect(m.players.get(guest)!.team).toBe(0);
    expect(m.swapTeams(m.hostId)).toBeNull();
    expect(m.players.get(guest)!.team).toBe(1);
    expect(m.change(m.hostId, { kind: "bans", maxPerSide: 0 })).toBeNull();
    expect(m.mode.match.bans!.maxPerSide).toBe(0);
    expect(m.base.match.bans!.maxPerSide).toBe(1);
    expect([...m.players.values()].some((p) => p.ready)).toBe(false);
  });
});

describe("a round's phases (Ranked)", () => {
  it("ban 15 s, planning 30 s, prep 45 s, action 180 s, the result 6 s, then the next round without a ban phase", () => {
    const { match, at } = started("ranked", 1, 1);
    const seconds = () => (match.phaseEnd - match.phaseStart) / TICK_HZ;
    expect([match.round, match.phase, seconds()]).toEqual([1, Phase.Ban, 15]);
    finishPhase(match, at);
    expect([match.phase, seconds()]).toEqual([Phase.Planning, 30]);
    finishPhase(match, at);
    expect([match.phase, seconds()]).toEqual([Phase.Prep, 45]);
    finishPhase(match, at);
    expect([match.phase, seconds()]).toEqual([Phase.Action, 180]);
    // Time runs out: the defenders win on time.
    const ev = finishPhase(match, at);
    expect(ev[0]).toMatchObject({ kind: "round", record: { round: 1, winner: match.history[0].winner, reason: WinReason.Time } });
    expect(match.history[0].winner).not.toBe(match.history[0].attackers);
    expect([match.phase, seconds()]).toEqual([Phase.RoundEnd, 6]);
    finishPhase(match, at);
    expect([match.round, match.phase]).toEqual([2, Phase.Planning]);
  });

  it("the first attacking team comes from the seed: the same seed, the same team", () => {
    const firsts = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => started("ranked", 1, 1, seed).match.firstAttackers);
    expect(new Set(firsts).size).toBe(2);
    expect(started("ranked", 1, 1, 3).match.firstAttackers).toBe(started("ranked", 1, 1, 3).match.firstAttackers);
  });

  it("a plant under way when time runs out plays on; the plant starts post-plant with the 45 s fuse; the fuse wins it", () => {
    const { match, at } = started("ranked", 1, 1);
    toAction(match, at);
    at.tick = match.phaseEnd;
    expect(match.update(at.tick, { attackersUp: 1, defendersUp: 1, plantInProgress: true })).toEqual([]);
    expect(match.phase).toBe(Phase.Action);
    at.tick += 10;
    match.planted(at.tick);
    expect([match.phase, (match.phaseEnd - at.tick) / TICK_HZ]).toEqual([Phase.PostPlant, 45]);
    expect(match.siteRevealed).toBe(true);
    // All attackers out after the plant: the round goes on.
    expect(match.update(at.tick + 1, { attackersUp: 0, defendersUp: 1, plantInProgress: false })).toEqual([]);
    finishPhase(match, at, { attackersUp: 0, defendersUp: 1, plantInProgress: false });
    expect(match.history[0]).toMatchObject({ winner: match.history[0].attackers, reason: WinReason.Detonated });
  });

  it("a disable counts only before the fuse ends", () => {
    const { match, at } = started("ranked", 1, 1);
    toAction(match, at);
    match.planted(++at.tick);
    match.defuserDisabled(match.phaseEnd);
    expect(match.disabled).toBe(false);
    match.defuserDisabled(match.phaseEnd - 1);
    match.update(match.phaseEnd - 1, { attackersUp: 1, defendersUp: 1, plantInProgress: false });
    expect(match.history[0]).toMatchObject({ reason: WinReason.Disabled });
    expect(match.history[0].winner).not.toBe(match.history[0].attackers);
  });
});

describe("bans, sites and picks", () => {
  it("each team bans one operator of the other side; banned operators can't be picked; bans clear at the swap and come back in overtime", () => {
    const { match, at } = started("ranked", 2, 2);
    const [atk1, atk2] = match.sides[ATTACK];
    const [def1, def2] = match.sides[DEFENSE];
    expect(match.voteBan(atk1, "sledge")).toMatch(/Can't ban/); // attackers ban defenders
    expect(match.voteBan(atk1, "mute")).toBeNull();
    expect(match.voteBan(atk2, "mute")).toBeNull();
    expect(match.voteBan(def1, "thermite")).toBeNull();
    finishPhase(match, at);
    expect([...match.banned(DEFENSE)]).toEqual(["mute"]);
    expect([...match.banned(ATTACK)]).toEqual(["thermite"]);
    expect(match.allowed(def1)).not.toContain("mute");
    expect(match.pickOperator(atk1, "thermite")).toMatch(/isn't available/);
    // Uniqueness: the first to pick an operator has it.
    expect(match.pickOperator(def1, "pulse")).toBeNull();
    expect(match.pickOperator(def2, "pulse")).toMatch(/isn't available/);
    const firstAttackers = match.attackers;
    // Rounds 2 and 3 have no ban phase; round 4 (the swap) starts a new half with no bans.
    for (let r = 1; r <= 3; r++) winRound(match, at, r === 2 ? firstAttackers : (1 - firstAttackers) as Team);
    expect([match.round, match.phase]).toEqual([4, Phase.Ban]);
    expect(match.banned(DEFENSE).size + match.banned(ATTACK).size).toBe(0);
    finishPhase(match, at); // nobody votes: no bans
    expect(match.banned(DEFENSE).size).toBe(0);
    // To 3–3 and overtime: round 7's attackers are the team that attacked first, with the first half's bans.
    winRound(match, at, firstAttackers);
    winRound(match, at, (1 - firstAttackers) as Team);
    winRound(match, at, firstAttackers);
    expect(match.score).toEqual([3, 3]);
    expect([match.round, match.phase, match.attackers]).toEqual([7, Phase.Planning, firstAttackers]);
    expect([...match.banned(DEFENSE)]).toEqual(["mute"]);
    expect([...match.banned(ATTACK)]).toEqual(["thermite"]);
  });

  it("at two bans per side, a 5-player side keeps 5 operators: the second ban on it doesn't count", () => {
    const m = lobby("ranked", 5, 5);
    m.change(m.hostId, { kind: "bans", maxPerSide: 2 });
    for (const p of m.players.values()) m.setReady(p.id, true);
    const at = { tick: 0 };
    m.start(m.hostId, 0);
    for (const id of m.sides[ATTACK]) m.voteBan(id, "mute");
    finishPhase(m, at);
    expect(m.banned(DEFENSE).size).toBe(1);
    finishPhase(m, at); // planning
    while (m.phase !== Phase.Ban) finishPhase(m, at);
    expect(m.round).toBe(2);
    for (const id of m.sides[ATTACK]) m.voteBan(id, "pulse");
    finishPhase(m, at);
    expect([...m.banned(DEFENSE)]).toEqual(["mute"]);
  });

  it("defenders vote the site (no votes: at random); Quick Match draws it at the round's start and reveals it at prep", () => {
    const { match, at } = started("ranked", 2, 2);
    finishPhase(match, at); // bans
    const [d1, d2] = match.sides[DEFENSE];
    expect(match.voteSite(match.sides[ATTACK][0], "SITE_DORMS")).toMatch(/Not voting/);
    expect(match.voteSite(d1, "SITE_LAUNDRY")).toBeNull();
    expect(match.voteSite(d2, "SITE_LAUNDRY")).toBeNull();
    finishPhase(match, at);
    expect([match.site, match.siteRevealed]).toEqual(["SITE_LAUNDRY", false]);
    match.siteFound();
    expect(match.siteRevealed).toBe(true);
    const q = started("quick_match", 1, 1);
    expect(map.sites).toContain(q.match.site);
    expect(q.match.siteRevealed).toBe(false);
    finishPhase(q.match, q.at);
    expect([q.match.phase, q.match.siteRevealed]).toEqual([Phase.Prep, true]);
  });

  it("the timer picks for those who didn't (last round's operator if allowed); attackers may repick in prep, defenders can't", () => {
    const { match, at } = started("unranked", 1, 1);
    finishPhase(match, at); // bans
    const atk = match.sides[ATTACK][0];
    const def = match.sides[DEFENSE][0];
    expect(match.pickOperator(def, "mira")).toBeNull();
    finishPhase(match, at);
    expect(match.players.get(atk)!.operator).toBe(map.roster[ATTACK][0]);
    expect(match.players.get(def)!.operator).toBe("mira");
    expect(match.pickOperator(atk, "sledge")).toBeNull();
    expect(match.chooseSpawn(atk, "B_STREET")).toBeNull();
    expect(match.pickOperator(def, "mute")).toMatch(/Not picking/);
    winRound(match, at, match.attackers);
    // Round 2: same sides, nobody picks; each keeps last round's operator.
    finishPhase(match, at);
    expect(match.players.get(atk)!.operator).toBe("sledge");
    expect(match.players.get(atk)!.spawn).toBe("B_STREET");
    expect(match.players.get(def)!.operator).toBe("mira");
  });

  it("the defuser: one attacker takes it on the planning screen; nobody, and the first attacker gets it at action start", () => {
    const { match, at } = started("quick_match", 2, 2);
    const [a1, a2] = match.sides[ATTACK];
    expect(match.takeDefuser(a2, true)).toBeNull();
    expect(match.takeDefuser(a1, true)).toMatch(/teammate has it/);
    expect(match.takeDefuser(match.sides[DEFENSE][0], true)).toMatch(/Not choosing/);
    expect(match.takeDefuser(a2, false)).toBeNull();
    toAction(match, at);
    expect(match.carrier).toBe(a1);
  });
});

describe("whole matches", () => {
  it("Quick Match 2v3: first to 3, sides swap after round 2, a sudden-death round at 2–2", () => {
    const { match, at } = started("quick_match", 2, 3);
    const first = match.firstAttackers;
    const second = (1 - first) as Team;
    const sides: Team[] = [];
    // The attackers win each regulation round.
    for (let r = 1; r <= 4; r++) {
      sides.push(match.attackers);
      winRound(match, at, match.attackers);
    }
    expect(sides).toEqual([first, first, second, second]);
    expect(match.score).toEqual([2, 2]);
    expect([match.round, match.overtime(), match.attackers]).toEqual([5, true, first]);
    winRound(match, at, second);
    expect([match.phase, match.winner, match.forfeit, match.phaseEnd]).toEqual([Phase.MatchEnd, second, false, NO_END]);
    expect(match.history.map((h) => h.winner)).toEqual([first, first, second, second, second]);
    expect(match.backToLobby(match.hostId)).toBeNull();
    expect([match.phase, match.round]).toEqual([Phase.Lobby, 0]);
    expect(match.team(0).length + match.team(1).length).toBe(5);
  });

  it("Ranked 1v1-sized: overtime to 5, first to lead by 2 or ahead after 3 rounds (max 9)", () => {
    const { match, at } = started("ranked", 1, 1);
    const x = match.firstAttackers;
    const y = (1 - x) as Team;
    for (const w of [x, y, x, y, x, y, x, y, y]) winRound(match, at, w);
    expect(match.round).toBe(9);
    expect([match.phase, match.winner, match.score[y]]).toEqual([Phase.MatchEnd, y, 5]);
  });

  it("1v1 attrition: a round's winner can't pick the operator they won it with next round; the loser can", () => {
    const { match, at } = started("one_v_one", 1, 1);
    const atk = match.sides[ATTACK][0];
    const def = match.sides[DEFENSE][0];
    expect(match.pickOperator(atk, "thermite")).toBeNull();
    expect(match.pickOperator(def, "pulse")).toBeNull();
    winRound(match, at, match.players.get(atk)!.team);
    expect(match.allowed(atk)).not.toContain("thermite");
    expect(match.allowed(def)).toContain("pulse");
    finishPhase(match, at);
    expect(match.players.get(atk)!.operator).toBe(map.roster[ATTACK][0]);
    expect(match.players.get(def)!.operator).toBe("pulse");
  });

  it("a team with nobody left loses at the next round's start; Practice plays on", () => {
    const { match, at } = started("unranked", 1, 2);
    const loner = match.team(0)[0].id;
    match.removePlayer(loner);
    expect(match.players.get(loner)!.connected).toBe(false);
    winRound(match, at, 1);
    expect([match.phase, match.winner, match.forfeit]).toEqual([Phase.MatchEnd, 1, true]);
    const p = started("practice", 1, 0);
    expect(p.match.sides[p.match.attackers === 0 ? ATTACK : DEFENSE].length).toBe(1);
    for (let i = 0; i < 4; i++) {
      toAction(p.match, p.at);
      finishPhase(p.match, p.at, { attackersUp: 1, defendersUp: 0, plantInProgress: false });
      finishPhase(p.match, p.at);
    }
    expect([p.match.round, p.match.phase]).toEqual([5, Phase.Planning]);
  });

  it("Ranked: whoever played gets a new rating at the end (Elo on the teams' averages, D-124), theirs back in the lobby; a late joiner who never played isn't rated", () => {
    const { match, at } = started("ranked", 2, 2);
    const [b0, b1] = match.team(0).map((p) => p.id);
    const [o0, o1] = match.team(1).map((p) => p.id);
    match.players.get(b0)!.rating = 1200;
    match.players.get(b1)!.rating = 1000;
    // o0 never sent one: a new player's; o1's is the same.
    match.players.get(o1)!.rating = 1000;
    for (let r = 0; r < 3; r++) winRound(match, at, 0);
    // Joining during the last round: they would play from the next one.
    const late = match.addPlayer(50, "late")!;
    late.rating = 1500;
    winRound(match, at, 0);
    expect([match.phase, match.winner]).toEqual([Phase.MatchEnd, 0]);
    // 1100 against 1000: Blue was expected to win 64 %, so it gains 12 and Orange loses 12.
    expect([b0, b1, o0, o1].map((id) => match.players.get(id)!.newRating)).toEqual([1212, 1012, 988, 988]);
    expect(match.players.get(50)!.newRating).toBeNull();
    expect(match.backToLobby(match.hostId)).toBeNull();
    expect([b0, o0, 50].map((id) => [match.players.get(id)!.rating, match.players.get(id)!.newRating])).toEqual([[1212, null], [988, null], [1500, null]]);
    // Unranked keeps no rating.
    const u = started("unranked", 1, 1);
    for (let r = 0; r < 4; r++) winRound(u.match, u.at, 0);
    expect([...u.match.players.values()].map((p) => p.newRating)).toEqual([null, null]);
  });

  it("Custom: the host may pick the team that attacks first; otherwise the seed draws it", () => {
    for (const [first, team] of [["blue", 0], ["orange", 1]] as const) {
      for (const seed of [1, 2, 3]) {
        const match = lobby("custom", 1, 1, seed);
        expect(match.change(match.hostId, { kind: "rules", rules: { match: { ...match.mode.match, firstAttack: first } } })).toBeNull();
        for (const p of match.players.values()) match.setReady(p.id, true);
        expect("error" in match.start(match.hostId, 10)).toBe(false);
        expect([match.firstAttackers, match.attackers]).toEqual([team, team]);
      }
    }
    // The fixed formats draw it.
    expect(new Set([1, 2, 3, 4, 5, 6].map((seed) => started("unranked", 1, 1, seed).match.firstAttackers))).toEqual(new Set([0, 1]));
    expect(format("quick_match").match.firstAttack).toBe("random");
  });

  it("Practice: only its host ends it, with no winner; a format whose rounds end can't be ended", () => {
    const { match, at } = started("practice", 1, 1);
    winRound(match, at, 0);
    const guest = [...match.players.keys()].find((id) => id !== match.hostId)!;
    expect(match.end(guest, at.tick)).toEqual({ error: "Only the host can do that" });
    const r = match.end(match.hostId, at.tick);
    expect("error" in r ? r.error : r.map((e) => e.kind)).toEqual(["phase", "match"]);
    expect([match.phase, match.winner, match.forfeit, match.history.length]).toEqual([Phase.MatchEnd, null, false, 1]);
    expect(match.end(match.hostId, at.tick)).toEqual({ error: "No match is being played" });
    const q = started("quick_match", 1, 1);
    expect(q.match.end(q.match.hostId, q.at.tick)).toEqual({ error: "Only a Practice match can be ended" });
  });

  it("back in the lobby, players who left during the match are gone and their slots free", () => {
    const { match, at } = started("one_v_one", 1, 1);
    const orange = match.team(1)[0].id;
    match.removePlayer(orange);
    // Orange has nobody when the next round starts: it forfeits.
    winRound(match, at, 0);
    expect([match.phase, match.winner, match.forfeit]).toEqual([Phase.MatchEnd, 0, true]);
    expect(match.backToLobby(match.hostId)).toBeNull();
    expect(match.players.has(orange)).toBe(false);
    expect(match.addPlayer(77, "new")?.team).toBe(1);
  });

  it("a player who left comes back on a new connection with the same team and stats", () => {
    const { match } = started("unranked", 2, 2);
    const [a, mate] = match.sides[ATTACK];
    const [d] = match.sides[DEFENSE];
    match.recordKill(d, a, null, false);
    match.removePlayer(a);
    expect(match.rejoin(a, 99)).not.toBeNull();
    expect(match.players.get(99)).toMatchObject({ kills: 1, connected: true });
    expect(match.sides[ATTACK]).toContain(99);
    expect(match.players.get(d)!.deaths).toBe(1);
    // A teammate's death is a death, but no kill.
    match.recordKill(mate, 99, null, true);
    expect([match.players.get(99)!.kills, match.players.get(mate)!.deaths]).toEqual([1, 1]);
  });
});
