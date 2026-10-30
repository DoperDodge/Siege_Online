// A match room (Phase 6 M2; match/DESIGN.md §2, §4–§7) with in-process clients: the lobby, the round's phases with
// bodies (defenders at the site for prep, attackers at their spawns for action), red walls, run-outs, the kill plane,
// leaving, the score and the end — driven through the room's real messages, as the server's are.
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  ATTACK,
  Btn,
  eyePose,
  loadedOf,
  poseHitboxes,
  ByteReader,
  Cause,
  ClientSession,
  DEFENSE,
  DEG,
  DT,
  encodeLobbyAction,
  encodeMatchAction,
  encodePickLoadout,
  defaultLoadoutPick,
  ErrorCode,
  handleRoomMessage,
  hash4,
  isFormat,
  loadGameData,
  Phase,
  PawnKind,
  PawnMode,
  Room,
  Stance,
  WinReason,
  type GameEvent,
  type InputCmd,
  type LobbyAction,
  type MatchAction,
} from "../src/index.js";

const data = loadGameData();
const custom = data.modes.get("custom")!;
if (!isFormat(custom)) throw new Error("custom");

/** Custom with short timers: a match plays in seconds of test time. */
const quick = (over: Record<string, unknown> = {}) => ({
  match: {
    ...custom.match,
    rounds: 2,
    swapEvery: 1,
    overtime: { rounds: 1, winBy: 1, swapEvery: 1 },
    bans: null,
    seconds: { ...custom.match.seconds, pick: 5, prep: 5, action: 30, roundEnd: 2 },
    ...over,
  },
});

async function matchRoom(format = "custom", seed = 5) {
  const room = await Room.create("MATCH", "oregon", { format, seed });
  const clock = { t: 0 };
  /** `cmd`: this client's input for the next ticks (as roomHarness.ts has it). */
  type Client = { name: string; session: ClientSession; id: number; toServer: Uint8Array[]; events: GameEvent[]; errors: { code: number; message: string }[]; cmd: Partial<Omit<InputCmd, "seq">> };
  const clients: Client[] = [];
  const add = async (name: string) => {
    const toServer: Uint8Array[] = [];
    const events: GameEvent[] = [];
    const errors: Client["errors"] = [];
    const session = new ClientSession({
      send: (b) => toServer.push(b),
      now: () => clock.t,
      onEvents: (_t, evs) => events.push(...evs),
      onError: (code, message) => errors.push({ code, message }),
      trackMispredictions: true,
    });
    const c: Client = { name, session, id: 0, toServer, events, errors, cmd: {} };
    const id = room.join(name, { send: (b) => session.handle(b), buffered: () => 0 });
    if (id === null) throw new Error(`${name} couldn't join`);
    c.id = id;
    await session.loaded();
    clients.push(c);
    return c;
  };
  const tick = () => {
    clock.t += DT * 1000;
    for (const c of clients) if (c.session.ready) c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...c.cmd });
    for (const c of clients)
      for (const b of c.toServer.splice(0)) {
        if (!handleRoomMessage(room, c.id, b[0], new ByteReader(b.subarray(1)))) throw new Error(`unexpected message ${b[0]}`);
      }
    room.step();
  };
  const lobby = (c: Client, a: LobbyAction) => c.toServer.push(encodeLobbyAction(a));
  const act = (c: Client, a: MatchAction) => c.toServer.push(encodeMatchAction(a));
  const match = room.director!.match;
  /** Tick until `done` (at most `seconds` of match time). */
  const until = (done: () => boolean, seconds: number, what: string) => {
    for (let i = 0; i < seconds / DT; i++) {
      if (done()) return;
      tick();
    }
    throw new Error(`timed out waiting for ${what} (phase ${match.phase}, round ${match.round})`);
  };
  const bodyOf = (c: Client) => {
    const ctrl = room.bodyOf(c.id);
    return ctrl ? room.sim.pawns.get(ctrl.possessedPawnId)! : null;
  };
  /** Put a member's body somewhere (the server moves it; its client is corrected) and let it settle. */
  const place = (c: Client, x: number, y: number, z: number, yawDeg: number) => {
    const body = bodyOf(c)!;
    room.sim.teleport(body.id, x, y, z, yawDeg);
    room.correct(c.id);
    c.cmd = { yaw: yawDeg * DEG };
    for (let i = 0; i < 20; i++) tick();
  };
  /** Start a quick match with these players (the first is host) and these rules; returns once planning is on. */
  const start = async (names: string[], rules: Record<string, unknown>) => {
    const cs: Client[] = [];
    for (const n of names) cs.push(await add(n));
    tick();
    lobby(cs[0], { kind: "change", change: { kind: "rules", rules } });
    tick();
    for (const c of cs.slice(1)) lobby(c, { kind: "ready", ready: true });
    tick();
    lobby(cs[0], { kind: "start" });
    tick();
    return cs;
  };
  return { room, match, clients, add, tick, lobby, act, until, bodyOf, place, start };
}

describe("match rooms", () => {
  it("1v1 (first to 3): lobby, prep with the defender at the voted site behind red walls, action with the attacker at their spawn, rounds won both ways, overtime and the end", async () => {
    const t = await matchRoom();
    const host = await t.add("host");
    const guest = await t.add("guest");
    t.tick();
    // Joining: no bodies, and each player sees the lobby with both of them.
    expect([t.room.bodyOf(host.id), t.room.bodyOf(guest.id)]).toEqual([null, null]);
    expect(host.session.match).toMatchObject({ phase: Phase.Lobby, host: host.id, you: host.id, format: "custom" });
    expect(host.session.match!.players.map((p) => p.name)).toEqual(["host", "guest"]);
    expect(host.session.matchRules).not.toBeNull();
    // Only the host changes the rules; the guest's start is refused and so is starting before everyone is ready.
    t.lobby(guest, { kind: "change", change: { kind: "rules", rules: quick({ rounds: 4 }) } });
    t.lobby(host, { kind: "start" });
    t.tick();
    expect(guest.errors.at(-1)).toMatchObject({ code: ErrorCode.Refused, message: "Only the host can do that" });
    expect(host.errors.at(-1)?.message).toMatch(/Waiting for guest/);
    // A change of rules un-readies everyone; then the guest readies and the host starts.
    t.lobby(host, { kind: "change", change: { kind: "rules", rules: quick({ rounds: 4 }) } });
    t.tick();
    t.lobby(guest, { kind: "ready", ready: true });
    t.tick();
    t.lobby(host, { kind: "start" });
    t.tick();
    expect(t.match.phase).toBe(Phase.Planning);
    expect(JSON.parse(guest.session.matchRules!).match.seconds.prep).toBe(5);

    const [atk, def] = t.match.attackers === t.match.players.get(host.id)!.team ? [host, guest] : [guest, host];
    t.lobby(atk, { kind: "ready", ready: false }); // the lobby is over: refused, harmlessly
    atk.toServer.push(encodePickLoadout(defaultLoadoutPick(data, "thermite")));
    def.toServer.push(encodePickLoadout(defaultLoadoutPick(data, "mute")));
    t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
    t.act(atk, { kind: "spawn", group: "C_CONSTRUCTION" });
    t.act(atk, { kind: "siteVote", site: "SITE_DORMS" }); // attackers don't vote
    t.tick();
    expect(atk.errors.at(-1)?.message).toMatch(/Not voting on the site/);
    // The attacker doesn't know the site; the defender does once it's chosen.
    t.until(() => t.match.phase === Phase.Prep, 10, "prep");
    t.tick();
    expect(atk.session.match!.site).toBeNull();
    expect(def.session.match!.site).toBe("SITE_LAUNDRY");
    expect(def.session.match!.redWalls).toBe(true);
    expect(t.room.sim.matchRules.redWalls).toBe(true);
    expect(def.session.sim!.matchRules.redWalls).toBe(true);
    const defBody = t.bodyOf(def)!;
    expect(defBody.operatorId).toBe("mute");
    expect(defBody.team).toBe(DEFENSE);
    const laundry = t.room.sim.level.def.spawns.filter((s) => s.group === "SITE_LAUNDRY")[0];
    expect(Math.hypot(defBody.state.x - laundry.pos[0], defBody.state.z - laundry.pos[2])).toBeLessThan(1.5);
    // The attacker has no body in prep: they drive their first drone, out at their spawn (Phase 7).
    const prepDrone = t.bodyOf(atk)!;
    expect(prepDrone.kind).toBe(PawnKind.Drone);
    const chosen = t.room.sim.level.def.spawns.filter((s) => s.group === "C_CONSTRUCTION")[0];
    expect(Math.hypot(prepDrone.state.x - chosen.pos[0], prepDrone.state.z - chosen.pos[2])).toBeLessThan(0.5);
    expect(t.room.sim.deployRules.pools).toEqual([0, 6]);

    // Action: the attacker at C Construction; the red walls come down.
    t.until(() => t.match.phase === Phase.Action, 10, "action");
    t.tick();
    const atkBody = t.bodyOf(atk)!;
    const construction = t.room.sim.level.def.spawns.find((s) => s.group === "C_CONSTRUCTION")!;
    expect(atkBody.operatorId).toBe("thermite");
    expect(Math.hypot(atkBody.state.x - construction.pos[0], atkBody.state.z - construction.pos[2])).toBeLessThan(1.5);
    expect(t.room.sim.matchRules.redWalls).toBe(false);
    expect(def.session.match!.players.find((p) => p.id === atk.id)!.operator).toBe("thermite");
    // The defender goes down and, the last one up, dies: the attackers win by elimination.
    t.room.killBody(t.bodyOf(def)!.id, Cause.Lab);
    t.tick();
    expect(t.match.history[0]).toMatchObject({ round: 1, winner: t.match.players.get(atk.id)!.team, reason: WinReason.Elimination, site: "SITE_LAUNDRY" });
    expect(t.match.phase).toBe(Phase.RoundEnd);

    // Round 2: the sides swap (nobody picks: the timer does). Time runs out: the defenders win.
    t.until(() => t.match.phase === Phase.Prep, 15, "round 2's prep");
    expect([t.match.round, t.match.sideOf(atk.id)]).toEqual([2, DEFENSE]);
    expect(t.bodyOf(atk)!.team).toBe(DEFENSE);
    t.until(() => t.match.phase === Phase.Action, 10, "round 2's action");
    t.until(() => t.match.phase === Phase.RoundEnd, 35, "round 2's end");
    const A = t.match.players.get(atk.id)!.team;
    const D = t.match.players.get(def.id)!.team;
    expect(t.match.history[1]).toMatchObject({ round: 2, reason: WinReason.Time, winner: A });
    // Rounds 3 and 4: the other player wins both, as defender then attacker: 2–2.
    for (const r of [3, 4]) {
      t.until(() => t.match.phase === Phase.Action && t.match.round === r, 20, `round ${r}'s action`);
      t.tick();
      t.room.killBody(t.bodyOf(atk)!.id, Cause.Lab);
      t.tick();
      expect(t.match.history[r - 1]).toMatchObject({ round: r, reason: WinReason.Elimination, winner: D });
    }
    expect(t.match.score[A]).toBe(2);
    expect(t.match.score[D]).toBe(2);

    // Overtime: the side swaps going in; the attacker leaves mid-action and dies there: the defenders win the match.
    t.until(() => t.match.phase === Phase.Action && t.match.round === 5, 20, "overtime's action");
    t.tick();
    expect(t.match.overtime()).toBe(true);
    const leaver = t.match.sideOf(host.id) === ATTACK ? host : guest;
    const stayer = leaver === host ? guest : host;
    const leaverBody = t.bodyOf(leaver)!;
    t.room.leave(leaver.id);
    t.tick();
    expect(leaverBody.state.mode).toBe(PawnMode.Dead);
    expect(stayer.events.some((e) => e.kind === "kill" && e.cause === Cause.Left)).toBe(true);
    t.until(() => t.match.phase === Phase.MatchEnd, 5, "the match end");
    expect(t.match.winner).toBe(t.match.players.get(stayer.id)!.team);
    expect(stayer.session.match).toMatchObject({ phase: Phase.MatchEnd, winner: t.match.winner, host: stayer.id });
    expect(stayer.session.match!.history.map((h) => h.reason)).toEqual([WinReason.Elimination, WinReason.Time, WinReason.Elimination, WinReason.Elimination, WinReason.Elimination]);
    expect(t.room.bodyOf(stayer.id)).toBeNull();
    // Back to the lobby (the new host is the one still here).
    t.lobby(stayer, { kind: "backToLobby" });
    t.tick();
    expect(t.match.phase).toBe(Phase.Lobby);
  }, 60_000);

  it("2v3: uneven teams spawn and play; a defender outside in action is detected (attackers see it); out of the map is death", async () => {
    const t = await matchRoom("custom", 9);
    const cs = [];
    for (const name of ["a", "b", "c", "d", "e"]) cs.push(await t.add(name));
    // Blue 2, Orange 3: the joiners alternate, so move one.
    t.tick();
    const blue = cs.filter((c) => t.match.players.get(c.id)!.team === 0);
    expect(blue.length).toBe(3);
    t.lobby(cs[0], { kind: "move", member: blue[2].id, team: 1 });
    t.lobby(cs[0], { kind: "change", change: { kind: "rules", rules: quick({ rounds: 4 }) } });
    t.tick();
    for (const c of cs.slice(1)) t.lobby(c, { kind: "ready", ready: true });
    t.tick();
    t.lobby(cs[0], { kind: "start" });
    t.tick();
    expect(t.match.phase).toBe(Phase.Planning);
    expect([t.match.team(0).length, t.match.team(1).length]).toEqual([2, 3]);
    const attackers = cs.filter((c) => t.match.sideOf(c.id) === ATTACK);
    const defenders = cs.filter((c) => t.match.sideOf(c.id) === DEFENSE);
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    expect(attackers.every((c) => t.bodyOf(c)?.team === ATTACK)).toBe(true);
    expect(defenders.every((c) => t.bodyOf(c)?.team === DEFENSE)).toBe(true);
    // Every operator is unique within a team.
    for (const side of [attackers, defenders]) expect(new Set(side.map((c) => t.bodyOf(c)!.operatorId)).size).toBe(side.length);
    // A defender outside the building: detected after the grace second, by the attackers only.
    const runner = t.bodyOf(defenders[0])!;
    const out = t.room.sim.level.def.spawns.find((s) => s.group === "B_STREET")!;
    t.room.sim.teleport(runner.id, out.pos[0] + 2, out.pos[1], out.pos[2]);
    for (let i = 0; i < 1.2 / DT + 10; i++) t.tick();
    expect(attackers[0].session.match!.detected).toEqual([runner.id]);
    expect(defenders[1].session.match!.detected).toEqual([]);
    // Below the kill plane: dead.
    const faller = t.bodyOf(attackers[0])!;
    t.room.sim.teleport(faller.id, out.pos[0], t.room.sim.level.def.bounds!.killY - 5, out.pos[2]);
    t.tick();
    expect(faller.state.mode).toBe(PawnMode.Dead);
    expect(t.match.players.get(attackers[0].id)!.deaths).toBe(1);
    // The other attackers die too: the defenders win the round by elimination.
    for (const c of attackers.slice(1, -1)) t.room.killBody(t.bodyOf(c)!.id, Cause.Lab);
    t.tick();
    expect(t.match.phase).toBe(Phase.Action);
    t.room.killBody(t.bodyOf(attackers.at(-1)!)!.id, Cause.Lab);
    t.tick();
    expect(t.match.history[0]).toMatchObject({ reason: WinReason.Elimination, winner: t.match.players.get(defenders[0].id)!.team });
  }, 60_000);
});

describe("the defuser (match/DESIGN.md §8)", () => {
  /** The attacker and the defender of a 1v1 round. */
  const sides = <C extends { id: number }>(t: Awaited<ReturnType<typeof matchRoom>>, cs: C[]) => {
    const atk = cs.find((c) => t.match.sideOf(c.id) === ATTACK)!;
    const def = cs.find((c) => t.match.sideOf(c.id) === DEFENSE)!;
    return [atk, def] as const;
  };
  /** In the Laundry, 0.5 m and more from its walls and clear of its table: the site's first defender spawn. */
  const LAUNDRY: [number, number, number] = [39.345, -3.2, 32.805];

  it("its carrier plants it in the site (7 s held, predicted), the fuse runs out: attackers; next round a defender disables it in time: defenders", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    let [atk, def] = sides(t, cs);
    t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    const carrier = t.bodyOf(atk)!;
    expect(t.room.sim.objective).toMatchObject({ carrier: carrier.id, site: "SITE_LAUNDRY", canPlant: true, planted: null });
    const [atkClient, defClient] = [atk, def];
    expect(atkClient.session.match!.defuser!.carrier).toBe(carrier.id);
    expect(defClient.session.match!.defuser!.carrier).toBe(0); // defenders don't see the carrier
    // Outside the site there's no plant; inside, the prompt and a 7 s hold, the body held still.
    const atkCtrl = t.room.bodyOf(atk.id)!;
    expect(t.room.sim.prompt(atkCtrl.id)).not.toBe("plant");
    t.place(atkClient, ...LAUNDRY, 0);
    expect(t.room.sim.prompt(atkCtrl.id)).toBe("plant");
    const missedBefore = atkClient.session.mispredictions.length;
    const stood = { ...t.bodyOf(atk)!.state };
    atkClient.cmd = { yaw: 0, forward: 1, buttons: Btn.Interact };
    // The planter crouches for the plant (data/objective.json plantCrouches), with the stance key still on stand.
    t.until(() => t.bodyOf(atk)!.state.stance === Stance.Crouch, 1, "crouching to plant");
    t.until(() => t.match.phase === Phase.PostPlant, 8, "the plant");
    expect(t.match.phase).toBe(Phase.PostPlant);
    const planted = t.room.sim.objective!.planted!;
    expect(Math.hypot(planted[0] - stood.x, planted[2] - stood.z)).toBeLessThan(0.01); // held still while planting, W held
    expect(t.room.sim.objective!.carrier).toBe(0);
    expect(atkClient.session.mispredictions.length).toBe(missedBefore); // the hold was predicted
    t.tick();
    expect(defClient.session.match!.defuser!.planted).not.toBeNull();
    t.until(() => t.bodyOf(atk)!.state.stance === Stance.Stand, 1, "standing up after the plant");
    atkClient.cmd = {};
    // The fuse (45 s): the attackers win.
    t.until(() => t.match.phase === Phase.RoundEnd, 47, "the fuse");
    expect(t.match.history[0]).toMatchObject({ reason: WinReason.Detonated, winner: t.match.players.get(atk.id)!.team });

    // Round 2, sides swapped: plant again, then the defender disables it facing it from 1 m.
    t.until(() => t.match.phase === Phase.Planning && t.match.round === 2, 5, "round 2");
    [atk, def] = sides(t, cs);
    t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
    t.until(() => t.match.phase === Phase.Action, 15, "round 2's action");
    t.tick();
    const [a2, d2] = [atk, def];
    t.place(a2, ...LAUNDRY, 0);
    a2.cmd = { yaw: 0, buttons: Btn.Interact };
    t.until(() => t.match.phase === Phase.PostPlant, 8, "round 2's plant");
    a2.cmd = {};
    const p2 = t.room.sim.objective!.planted!;
    t.place(d2, p2[0] + 1, -3.2, p2[2], 90); // facing −x, toward it
    expect(t.room.sim.prompt(t.room.bodyOf(def.id)!.id)).toBe("disable");
    d2.cmd = { yaw: 90 * DEG, buttons: Btn.Interact };
    t.until(() => t.match.phase === Phase.RoundEnd, 8, "the disable");
    expect(t.match.history[1]).toMatchObject({ reason: WinReason.Disabled, winner: t.match.players.get(def.id)!.team });
  }, 120_000);

  it("drops where its carrier goes down, and a teammate picks it up from 1 m by pressing Use", async () => {
    // A seed whose first attackers are Blue, the team of two.
    let seed = 1;
    while ((hash4(seed, 0, 1, 0) & 1) !== 0) seed++;
    const t = await matchRoom("custom", seed);
    const cs = await t.start(["a", "b", "c"], quick({ siteReveal: "roundStart" }));
    expect(t.match.attackers).toBe(0);
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    const [first, second] = t.match.sides[ATTACK].map((id) => cs.find((c) => c.id === id)!);
    const body = t.bodyOf(first)!;
    expect(t.room.sim.objective!.carrier).toBe(body.id);
    t.place(first, ...LAUNDRY, 0);
    t.room.killBody(body.id, Cause.Lab);
    t.tick();
    const dropped = t.room.sim.objective!.dropped!;
    expect(t.room.sim.objective!.carrier).toBe(0);
    expect(Math.hypot(dropped[0] - LAUNDRY[0], dropped[2] - LAUNDRY[2])).toBeLessThan(0.1);
    expect(second.session.match!.defuser!.dropped).not.toBeNull();
    // 0.8 m away, looking the other way: a press picks it up.
    t.place(second, LAUNDRY[0] + 0.8, LAUNDRY[1], LAUNDRY[2], 90);
    expect(t.room.sim.prompt(t.room.bodyOf(second.id)!.id)).toBe("pickUp");
    second.cmd = { yaw: 90 * DEG, buttons: Btn.Interact };
    t.tick();
    t.tick();
    expect(t.room.sim.objective!.carrier).toBe(t.bodyOf(second)!.id);
    expect(t.room.sim.objective!.dropped).toBeNull();
    t.tick();
    expect(second.session.match!.carrier).toBe(second.id);
  }, 60_000);

  it("a plant under way when the timer runs out finishes and counts; let go after it, the defenders win on time", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    for (const round of [1, 2]) {
      const [a, def] = sides(t, cs);
      t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
      t.until(() => t.match.phase === Phase.Action && t.match.round === round, 20, `round ${round}'s action`);
      t.place(a, ...LAUNDRY, 0);
      // Start the 7 s plant 3 s before the 30 s run out.
      t.until(() => t.room.sim.tick >= t.match.phaseEnd - 3 * 64, 31, "3 s left");
      a.cmd = { yaw: 0, buttons: Btn.Interact };
      t.until(() => t.room.sim.tick >= t.match.phaseEnd + 64, 5, "a second past the timer");
      expect(t.match.phase).toBe(Phase.Action); // the plant under way keeps the round going
      if (round === 1) {
        t.until(() => t.match.phase === Phase.PostPlant, 4, "the late plant");
        a.cmd = {};
        t.until(() => t.match.phase === Phase.RoundEnd, 47, "the fuse");
        expect(t.match.history[0].reason).toBe(WinReason.Detonated);
      } else {
        a.cmd = {}; // let go before it's done
        t.tick();
        t.tick();
        expect(t.match.phase).toBe(Phase.RoundEnd);
        expect(t.match.history[1]).toMatchObject({ reason: WinReason.Time, winner: t.match.players.get(def.id)!.team });
      }
      t.until(() => t.match.phase === Phase.Planning || t.match.phase === Phase.MatchEnd, 5, "the next round");
    }
  }, 120_000);

  it("let go of in the air (the Drop key, or its carrier killed off a rope or a ladder), it falls to the floor under them, where a teammate picks it up", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b", "c"], quick({ siteReveal: "roundStart", firstAttack: "blue" }));
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    const [first, second] = t.match.sides[ATTACK].map((id) => cs.find((c) => c.id === id)!);
    expect(t.room.sim.objective!.carrier).toBe(t.bodyOf(first)!.id);
    /** A member's body 1.2 m over the Laundry's floor at `x` (in the air, under its ceiling). */
    const lift = (c: (typeof cs)[number], x: number) => {
      const body = t.bodyOf(c)!;
      t.room.sim.teleport(body.id, x, LAUNDRY[1] + 1.2, LAUNDRY[2], 0);
      t.room.correct(c.id);
      return body;
    };
    const onFloorAt = (x: number) => {
      const d = t.room.sim.objective!.dropped!;
      expect(Math.hypot(d[0] - x, d[2] - LAUNDRY[2])).toBeLessThan(0.1);
      expect(d[1]).toBeCloseTo(LAUNDRY[1], 1);
    };
    t.place(first, ...LAUNDRY, 0);
    const body = lift(first, LAUNDRY[0]);
    first.cmd = { buttons: Btn.Drop };
    t.until(() => t.room.sim.objective!.carrier === 0, 0.25, "the drop");
    first.cmd = {};
    expect(body.state.y).toBeGreaterThan(LAUNDRY[1] + 0.8); // let go of in the air
    onFloorAt(LAUNDRY[0]);
    // From the floor, 0.8 m away: a press picks it up.
    t.place(second, LAUNDRY[0] + 0.8, LAUNDRY[1], LAUNDRY[2], 90);
    expect(t.room.sim.prompt(t.room.bodyOf(second.id)!.id)).toBe("pickUp");
    second.cmd = { yaw: 90 * DEG, buttons: Btn.Interact };
    t.until(() => t.room.sim.objective!.carrier === t.bodyOf(second)!.id, 0.25, "the pickup");
    second.cmd = {};
    t.room.killBody(lift(second, LAUNDRY[0] + 0.8).id, Cause.Lab);
    t.tick();
    expect(t.room.sim.objective!.carrier).toBe(0);
    onFloorAt(LAUNDRY[0] + 0.8);
  }, 60_000);

  it("an attacker who walks into the site finds it (under \"sight\" too) at once: in the Laundry, facing away from both its bombs", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick());
    expect(t.match.mode.match.siteReveal).toBe("sight");
    const [atk, def] = sides(t, cs);
    t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
    // In prep, the defender out of the way: they start where the attacker goes.
    t.until(() => t.match.phase === Phase.Prep, 15, "prep");
    t.tick();
    t.place(def, LAUNDRY[0] + 1, LAUNDRY[1], LAUNDRY[2], 90);
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    expect([t.match.siteRevealed, atk.session.match!.site]).toEqual([false, null]);
    // Just after the action phase went out to the clients, the attacker in, facing away from its bomb: the news
    // reaches them in the same tick, not up to STATE_EVERY ticks later.
    const bomb = t.room.sim.level.def.sites.find((s) => s.id === "SITE_LAUNDRY")!.bombs.find((b) => b.room === "B_LAUNDRY")!.pos;
    const away = Math.atan2(-(LAUNDRY[0] - bomb[0]), -(LAUNDRY[2] - bomb[2])) / DEG; // the Supply's is behind walls
    const body = t.bodyOf(atk)!;
    t.room.sim.teleport(body.id, ...LAUNDRY, away);
    t.room.correct(atk.id);
    atk.cmd = { yaw: away * DEG };
    t.tick();
    t.tick();
    expect(t.match.siteRevealed).toBe(true);
    expect(atk.session.match!.site).toBe("SITE_LAUNDRY");
    // Its carrier, settled there, plants: the hold predicted.
    for (let i = 0; i < 18; i++) t.tick();
    const missed = atk.session.mispredictions.length;
    atk.cmd = { yaw: away * DEG, buttons: Btn.Interact };
    t.until(() => t.match.phase === Phase.PostPlant, 8, "the plant");
    expect(atk.session.mispredictions.length).toBe(missed);
  }, 60_000);
});

describe("the defuser's edge cases", () => {
  it("planted on a hatch that is then destroyed: deactivated, the defenders win; and once planted, the last attacker up goes down instead of dying", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    const atk = cs.find((c) => t.match.sideOf(c.id) === ATTACK)!;
    const def = cs.find((c) => t.match.sideOf(c.id) === DEFENSE)!;
    t.act(def, { kind: "siteVote", site: "SITE_DORMS" });
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    // H4, in the Kids' Dorms' floor (one of the site's rooms).
    const h4 = t.room.sim.level.panels.byId.get("H4")!;
    const top = h4.max[1];
    const [hx, hz] = [(h4.min[0] + h4.max[0]) / 2, (h4.min[2] + h4.max[2]) / 2];
    t.place(atk, hx, top, hz, 0);
    atk.cmd = { yaw: 0, buttons: Btn.Interact };
    t.until(() => t.match.phase === Phase.PostPlant, 8, "the plant on the hatch");
    atk.cmd = {};
    // The last attacker standing goes down, not out: the defuser is planted (core_mechanics.md §10.1).
    const body = t.bodyOf(atk)!;
    expect(applyDamage(t.room.sim, body, { amount: body.state.hp, kill: false }, t.room.rules).outcome).toBe("downed");
    t.room.sim.refreshPawn(body.id);
    t.tick();
    expect(t.match.phase).toBe(Phase.PostPlant);
    // The hatch breaks under it: deactivated.
    t.room.queuePanelOp(h4.panel.spec.index, { kind: "damage", amount: 1e6, hard: false });
    t.tick();
    t.tick();
    expect(h4.panel.broken).toBe(true);
    expect(t.match.history[0]).toMatchObject({ reason: WinReason.Deactivated, winner: t.match.players.get(def.id)!.team });
  }, 60_000);
});

describe("each format's details (Phase 6 M5)", () => {
  /** The view from `shooter`'s eye to `target`'s head (the server's states). */
  const aimAt = (shooter: { state: Parameters<typeof eyePose>[2] }, target: { state: Parameters<typeof eyePose>[2] }) => {
    const head = poseHitboxes(data.movement, data.hitboxes, target.state).find((h) => h.part === "head")!;
    const eye = eyePose(data.movement, data.hitboxes, shooter.state).pos;
    const d = [0, 1, 2].map((i) => (head.a[i] + head.b[i]) / 2 - eye[i]);
    return { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) };
  };

  it("Quick Match: prep puts the site's pre-setup up on top of the pool (every client's walls the server's); in action the attackers are safe for 10 s unless they go in", async () => {
    const t = await matchRoom("quick_match", 4);
    const cs = [];
    for (const name of ["a", "b", "c", "d"]) cs.push(await t.add(name));
    t.tick();
    for (const c of cs.slice(1)) t.lobby(c, { kind: "ready", ready: true });
    t.tick();
    t.lobby(cs[0], { kind: "start" });
    t.tick();
    expect(t.match.phase).toBe(Phase.Planning);
    const [a1, a2] = cs.filter((c) => t.match.sideOf(c.id) === ATTACK);
    const [d1] = cs.filter((c) => t.match.sideOf(c.id) === DEFENSE);

    // Prep: the drawn site's walls are steel from its side and its holes are cut; the pool is the scaled 6 for two.
    t.until(() => t.match.phase === Phase.Prep, 25, "prep");
    for (let i = 0; i < 10; i++) t.tick();
    const site = t.room.sim.level.def.sites.find((x) => x.id === t.match.site)!;
    const panels = t.room.sim.level.panels;
    for (const r of site.preSetup!.reinforce) expect(panels.byId.get(r.panel)!.panel.reinforced, r.panel).toBe((1 << panels.byId.get(r.panel)!.panel.sectionCount) - 1);
    for (const h of site.preSetup!.holes) expect(panels.byId.get(h.panel)!.panel.modified, h.panel).toBe(true);
    expect(t.room.sim.deployRules.pools[DEFENSE]).toBe(6);
    for (const c of cs) expect(c.session.sim!.level.panels.hash(), c.name).toBe(panels.hash());

    // Action: both attackers safe; one goes into the building, which ends their own safeguard.
    t.until(() => t.match.phase === Phase.Action, 50, "action");
    t.tick();
    const start = t.room.sim.tick;
    const v = a1.session.match!;
    expect(v.safeguardEnd).toBe(start - 1 + 10 * 64);
    expect(v.players.filter((p) => p.side === ATTACK).map((p) => p.safe)).toEqual([true, true]);
    const lobby = t.room.sim.level.def.rooms.find((r) => r.id === "1F_LOBBY")!.anchor;
    t.place(a2, lobby[0], lobby[1], lobby[2], 0);
    expect(t.room.director!.safeguarded(t.bodyOf(a2)!)).toBe(false);
    expect(a1.session.match!.players.find((p) => p.id === a2.id)!.safe).toBe(false);

    // A defender outside, 4 m in front of the first attacker, shoots its head down the sights: no damage while it is safe.
    const target = t.bodyOf(a1)!;
    const yaw = target.state.yaw;
    t.place(d1, target.state.x - Math.sin(yaw) * 4, target.state.y, target.state.z - Math.cos(yaw) * 4, (yaw / DEG + 180) % 360);
    const shoot = () => {
      const aim = aimAt(t.bodyOf(d1)!, target);
      d1.cmd = { yaw: aim.yaw, pitch: aim.pitch, buttons: Btn.Ads };
      for (let i = 0; i < 64; i++) t.tick();
      d1.cmd = { yaw: aim.yaw, pitch: aim.pitch, buttons: Btn.Ads | Btn.Fire };
      t.tick();
      d1.cmd = { yaw: aim.yaw, pitch: aim.pitch, buttons: Btn.Ads };
      for (let i = 0; i < 16; i++) t.tick();
    };
    const hp = target.state.hp;
    const rounds = loadedOf(t.bodyOf(d1)!.state);
    shoot();
    expect(loadedOf(t.bodyOf(d1)!.state)).toBe(rounds - 1); // it fired
    expect(t.room.sim.tick).toBeLessThan(v.safeguardEnd);
    expect([target.state.mode, target.state.hp]).toEqual([PawnMode.Walk, hp]);
    expect(d1.events.some((e) => e.kind === "hitConfirm")).toBe(false);
    // Once the 10 s are over, the same shot kills.
    t.until(() => t.room.sim.tick >= v.safeguardEnd, 12, "the safeguard's end");
    expect(t.room.director!.safeguarded(target)).toBe(false);
    shoot();
    expect(target.state.mode).toBe(PawnMode.Dead);
  }, 60_000);

  /** End the current phase's timer on the next tick (the timers are the match logic's, tested on their own). */
  const skip = (t: Awaited<ReturnType<typeof matchRoom>>) => {
    t.match.phaseEnd = Math.min(t.match.phaseEnd, t.room.sim.tick + 1);
    t.tick();
    t.tick();
  };
  /** Through the timers to this round's action. */
  const toAction = (t: Awaited<ReturnType<typeof matchRoom>>) => {
    for (let i = 0; i < 10 && t.match.phase !== Phase.Action; i++) skip(t);
    expect(t.match.phase).toBe(Phase.Action);
  };

  it("Ranked: each browser's rating goes in from the lobby (once mid-match for a joiner), and the match end sends everyone the new one, theirs back in the lobby", async () => {
    const t = await matchRoom("ranked", 2);
    const host = await t.add("host");
    const guest = await t.add("guest");
    t.tick();
    t.lobby(host, { kind: "rating", rating: 1200 });
    t.lobby(guest, { kind: "rating", rating: 1000 });
    t.tick();
    expect(host.session.match!.players.map((p) => [p.name, p.rating, p.newRating])).toEqual([["host", 1200, null], ["guest", 1000, null]]);
    t.lobby(guest, { kind: "ready", ready: true });
    t.tick();
    t.lobby(host, { kind: "start" });
    t.tick();
    // Mid-match a rating no longer changes, but one who joins without one sends theirs once.
    t.lobby(guest, { kind: "rating", rating: 3000 });
    const late = await t.add("late");
    t.lobby(late, { kind: "rating", rating: 1400 });
    t.tick();
    t.lobby(late, { kind: "rating", rating: 1500 });
    t.tick();
    expect(t.match.players.get(guest.id)!.rating).toBe(1000);
    expect(t.match.players.get(late.id)!.rating).toBe(1400);
    t.room.leave(late.id); // gone before playing a round: not rated
    // Blue wins four rounds.
    const blue = t.match.players.get(host.id)!.team === 0 ? host : guest;
    for (let r = 1; r <= 4; r++) {
      toAction(t);
      const loser = [host, guest].find((c) => c !== blue)!;
      t.room.killBody(t.bodyOf(loser)!.id, Cause.Lab);
      t.tick();
      expect(t.match.history.at(-1)!.winner).toBe(t.match.players.get(blue.id)!.team);
      skip(t);
    }
    expect(t.match.phase).toBe(Phase.MatchEnd);
    // 1200 against 1000 (Blue, the host, expected to win 76 %): +8 and −8.
    const want = [["host", 1200, 1208], ["guest", 1000, 992]];
    for (const c of [host, guest]) expect(c.session.match!.players.filter((p) => p.connected).map((p) => [p.name, p.rating, p.newRating])).toEqual(want);
    t.lobby(host, { kind: "backToLobby" });
    t.tick();
    expect(guest.session.match!.players.filter((p) => p.connected).map((p) => [p.name, p.rating, p.newRating])).toEqual([["host", 1208, null], ["guest", 992, null]]);
  }, 60_000);

  it("1v1 attrition: the round's winner sees the operator they won with locked next round, and a pick of it is refused", async () => {
    const t = await matchRoom("one_v_one", 6);
    const host = await t.add("host");
    const guest = await t.add("guest");
    t.tick();
    t.lobby(guest, { kind: "ready", ready: true });
    t.tick();
    t.lobby(host, { kind: "start" });
    t.tick();
    const atk = t.match.sideOf(host.id) === ATTACK ? host : guest;
    const def = atk === host ? guest : host;
    atk.toServer.push(encodePickLoadout(defaultLoadoutPick(data, "thermite")));
    def.toServer.push(encodePickLoadout(defaultLoadoutPick(data, "pulse")));
    toAction(t);
    t.room.killBody(t.bodyOf(def)!.id, Cause.Lab);
    t.tick();
    skip(t);
    // Round 2 (same sides): the winner can't take Thermite again; the loser keeps Pulse.
    expect([t.match.round, t.match.phase, t.match.sideOf(atk.id)]).toEqual([2, Phase.Planning, ATTACK]);
    const me = (c: typeof atk) => c.session.match!.players.find((p) => p.id === c.id)!;
    expect([me(atk).locked, me(def).locked]).toEqual(["thermite", null]);
    // The lock is the winner's own business (and their team's): the other side isn't sent it.
    expect(def.session.match!.players.find((p) => p.id === atk.id)!.locked).toBeNull();
    atk.toServer.push(encodePickLoadout(defaultLoadoutPick(data, "thermite")));
    t.tick();
    expect(atk.errors.at(-1)?.message).toBe("That operator isn't available");
    def.toServer.push(encodePickLoadout(defaultLoadoutPick(data, "pulse")));
    for (let i = 0; i < 10; i++) t.tick(); // a pick goes out with the next state, within 8 ticks
    expect(me(def).operator).toBe("pulse");
  }, 60_000);

  it("Practice: one side may be empty, rounds go on swapping sides, and only the host ends it (no winner)", async () => {
    const t = await matchRoom("practice", 8);
    const host = await t.add("host");
    t.tick();
    t.lobby(host, { kind: "start" });
    t.tick();
    expect(t.match.phase).toBe(Phase.Planning);
    const sides: (0 | 1 | null)[] = [];
    for (let r = 1; r <= 3; r++) {
      sides.push(t.match.sideOf(host.id));
      toAction(t);
      // Alone: nobody to fight, so the round runs to its timer.
      skip(t);
      skip(t);
      expect(t.match.round).toBe(r + 1);
    }
    expect(sides).toEqual([sides[0], 1 - sides[0]!, sides[0]]);
    // A guest can't end it; the host can, from any phase.
    const guest = await t.add("guest");
    t.lobby(guest, { kind: "end" });
    t.tick();
    expect(guest.errors.at(-1)?.message).toBe("Only the host can do that");
    t.lobby(host, { kind: "end" });
    t.tick();
    expect([t.match.phase, t.match.winner, host.session.match!.phase]).toEqual([Phase.MatchEnd, null, Phase.MatchEnd]);
    expect(t.bodyOf(host)).toBeNull();
    t.lobby(host, { kind: "backToLobby" });
    t.tick();
    expect(host.session.match!.phase).toBe(Phase.Lobby);
  }, 60_000);

  it("one who leaves mid-match and comes back by the same name gets their slot, team and stats back, even in a full 1v1", async () => {
    const t = await matchRoom("one_v_one", 3);
    const host = await t.add("host");
    const guest = await t.add("guest");
    t.tick();
    t.lobby(guest, { kind: "ready", ready: true });
    t.tick();
    t.lobby(host, { kind: "start" });
    t.tick();
    const team = t.match.players.get(guest.id)!.team;
    t.match.recordKill(host.id, guest.id, null, false);
    t.room.leave(guest.id);
    t.tick();
    expect(t.match.players.get(guest.id)!.connected).toBe(false);
    // Both teams' one slot is taken (the guest's is kept): only the guest's name gets it back.
    const back = await t.add("guest");
    t.tick();
    expect(t.match.players.has(guest.id)).toBe(false);
    expect(t.match.players.get(back.id)).toMatchObject({ name: "guest", team, kills: 1, connected: true });
    expect(back.session.match!.players.map((p) => p.name)).toEqual(["host", "guest"]);
  }, 60_000);

  it("the history a state carries is the last 64 rounds (Practice's go on without end)", async () => {
    const t = await matchRoom("practice", 8);
    const host = await t.add("host");
    t.tick();
    for (let r = 1; r <= 70; r++) t.match.history.push({ round: r, attackers: 0, winner: 1, reason: WinReason.Time, site: "SITE_DINING" });
    expect(t.room.director!.view(host.id).history.map((h) => h.round)).toEqual(Array.from({ length: 64 }, (_, i) => i + 7));
  });
});


describe("drones in a match (Phase 7 M1)", () => {
  const sidesOf = <C extends { id: number }>(t: Awaited<ReturnType<typeof matchRoom>>, cs: C[]) =>
    [cs.find((c) => t.match.sideOf(c.id) === ATTACK)!, cs.find((c) => t.match.sideOf(c.id) === DEFENSE)!] as const;
  const dist = (p: { state: { x: number; z: number } }, q: { x: number; z: number }) => Math.hypot(p.state.x - q.x, p.state.z - q.z);
  /** Facing of the spawn point nearest (x, z). */
  const spawnYaw = (t: Awaited<ReturnType<typeof matchRoom>>, x: number, z: number) =>
    t.room.sim.level.def.spawns.reduce((a, b) => (Math.hypot(b.pos[0] - x, b.pos[2] - z) < Math.hypot(a.pos[0] - x, a.pos[2] - z) ? b : a)).yawDeg * DEG;

  it("an attacker drives their first drone through prep (predicted: no corrections), the defender sees it; at action the body stands at the spawn and the drone stays where it was left; Observe throws the second", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    const [atk, def] = sidesOf(t, cs);
    t.until(() => t.match.phase === Phase.Prep, 15, "prep");
    t.tick();
    const pilot = t.room.bodyOf(atk.id)!;
    const [d1, d2] = t.room.sim.dronesOf(pilot);
    expect([pilot.possessedPawnId, d1.state.mode, d2.state.mode]).toEqual([d1.id, PawnMode.Walk, PawnMode.Held]);
    expect(atk.session.ctrl!.pawnIds).toEqual([d1.id, d2.id]);
    const yaw = spawnYaw(t, d1.state.x, d1.state.z);
    atk.cmd = { yaw };
    for (let i = 0; i < 16; i++) t.tick();
    const missed = atk.session.mispredictions.length;
    const from = { x: d1.state.x, z: d1.state.z };
    atk.cmd = { yaw, forward: 1 };
    for (let i = 0; i < 64; i++) t.tick();
    atk.cmd = { yaw };
    for (let i = 0; i < 16; i++) t.tick();
    expect(dist(d1, from)).toBeGreaterThan(1);
    expect(atk.session.mispredictions.length).toBe(missed);
    expect(dist(atk.session.sim!.pawns.get(d1.id)!, d1.state)).toBeLessThan(0.001);
    // Everyone else gets it as a drone; the one held isn't sent.
    expect(def.session.sim!.pawns.get(d1.id)?.kind).toBe(PawnKind.Drone);
    expect(def.session.sim!.pawns.has(d2.id)).toBe(false);

    const parked = { x: d1.state.x, z: d1.state.z };
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    const ctrl = t.room.bodyOf(atk.id)!;
    expect(t.room.sim.pawns.get(ctrl.possessedPawnId)!.kind).toBe(PawnKind.Body);
    expect(ctrl.pawnIds.slice(1)).toEqual([d1.id, d2.id]);
    expect(dist(d1, parked)).toBeLessThan(0.01);
    expect(atk.session.ctrl!.pawnIds).toEqual(ctrl.pawnIds);
    for (let i = 0; i < 16; i++) t.tick();
    const missed2 = atk.session.mispredictions.length;
    atk.cmd = { yaw, buttons: Btn.Observe };
    t.tick();
    atk.cmd = { yaw };
    t.until(() => ctrl.drone === d2.id, 0.5, "the throw");
    for (let i = 0; i < 64; i++) t.tick();
    expect(d2.state.mode).toBe(PawnMode.Walk);
    expect(atk.session.mispredictions.length).toBe(missed2);
    expect(def.session.sim!.pawns.get(d2.id)?.kind).toBe(PawnKind.Drone);
  }, 60_000);

  it("a defender's shot destroys a drone, in prep too: no kill, nobody's death", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    const [atk, def] = sidesOf(t, cs);
    t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
    t.until(() => t.match.phase === Phase.Prep, 15, "prep");
    t.tick();
    // The defender in the Laundry facing −x; the drone 3 m ahead of them.
    const LAUNDRY: [number, number, number] = [39.345, -3.2, 32.805];
    t.place(def, ...LAUNDRY, 90);
    const [d1] = t.room.sim.dronesOf(t.room.bodyOf(atk.id)!);
    t.room.sim.placeDrone(d1.id, LAUNDRY[0] - 3, LAUNDRY[1] + 0.02, LAUNDRY[2], 90);
    t.room.correct(atk.id);
    for (let i = 0; i < 16; i++) t.tick();
    const shooter = t.bodyOf(def)!;
    const eye = eyePose(data.movement, data.hitboxes, shooter.state).pos;
    const mid = [d1.state.x, d1.state.y + data.intel.drone.sizeM[1] / 2, d1.state.z];
    const dv = [0, 1, 2].map((i) => mid[i] - eye[i]);
    const aim = { yaw: Math.atan2(-dv[0], -dv[2]), pitch: Math.atan2(dv[1], Math.hypot(dv[0], dv[2])) };
    def.cmd = { ...aim, buttons: Btn.Ads };
    for (let i = 0; i < 64; i++) t.tick();
    def.cmd = { ...aim, buttons: Btn.Ads | Btn.Fire };
    t.tick();
    def.cmd = { ...aim };
    for (let i = 0; i < 16; i++) t.tick();
    expect(d1.state.mode).toBe(PawnMode.Dead);
    expect(def.events.some((e) => e.kind === "droneDestroyed" && e.pawnId === d1.id)).toBe(true);
    expect(def.events.some((e) => e.kind === "kill")).toBe(false);
    expect(t.match.players.get(atk.id)!.deaths).toBe(0);
    expect(t.match.phase).toBe(Phase.Prep);
  }, 60_000);

  it("a dead attacker drives a drone they have out (Observe), and leaves it the same way", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    const [atk] = sidesOf(t, cs);
    t.until(() => t.match.phase === Phase.Action, 25, "action");
    t.tick();
    const ctrl = t.room.bodyOf(atk.id)!;
    const body = t.bodyOf(atk)!;
    const yaw = body.state.yaw;
    const press = () => {
      atk.cmd = { yaw, buttons: Btn.Observe };
      t.tick();
      atk.cmd = { yaw };
      for (let i = 0; i < 4; i++) t.tick();
    };
    press(); // throw drone 2 (drone 1 is out from prep)
    press(); // back to the body
    expect(ctrl.drone).toBe(0);
    t.room.killBody(body.id, Cause.Lab);
    t.tick();
    expect(body.state.mode).toBe(PawnMode.Dead);
    press();
    const driven = t.room.sim.pawns.get(ctrl.drone);
    expect(driven?.kind).toBe(PawnKind.Drone);
    const from = { x: driven!.state.x, z: driven!.state.z };
    atk.cmd = { yaw: driven!.state.yaw, forward: 1 };
    for (let i = 0; i < 32; i++) t.tick();
    expect(dist(driven!, from)).toBeGreaterThan(0.5);
    atk.cmd = { yaw: driven!.state.yaw };
    press();
    expect(ctrl.drone).toBe(0);
  }, 60_000);
});

describe("default cameras in a match (Phase 7 M3)", () => {
  const sidesOf = <C extends { id: number }>(t: Awaited<ReturnType<typeof matchRoom>>, cs: C[]) =>
    [cs.find((c) => t.match.sideOf(c.id) === ATTACK)!, cs.find((c) => t.match.sideOf(c.id) === DEFENSE)!] as const;

  it("a defender watches them in prep, predicted; a shot breaks one: every client hears, and its feed is skipped", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    const [atk, def] = sidesOf(t, cs);
    t.until(() => t.match.phase === Phase.Prep, 15, "prep");
    t.tick();
    const cams = t.room.sim.level.def.cameras;
    const ctrl = t.room.bodyOf(def.id)!;
    const missed = def.session.mispredictions.length;
    def.cmd = { yaw: cams[0].yawDeg * DEG, buttons: Btn.Observe };
    t.tick();
    def.cmd = { yaw: cams[0].yawDeg * DEG };
    t.until(() => ctrl.cam === 1, 0.5, "the first camera");
    def.cmd = { yaw: cams[0].yawDeg * DEG, lean: 1 };
    t.until(() => ctrl.cam === 2, 0.5, "the next camera");
    def.cmd = { yaw: cams[1].yawDeg * DEG };
    for (let i = 0; i < 32; i++) t.tick();
    expect(def.session.ctrl!.cam).toBe(2);
    expect(def.session.mispredictions.length).toBe(missed);
    def.cmd = { yaw: cams[1].yawDeg * DEG, buttons: Btn.Observe };
    t.tick();
    def.cmd = {};
    t.until(() => ctrl.cam === 0, 0.5, "closed");

    // Under camera 4 (the basement's), 1.5 m out along its facing: one shot at it, down the sights.
    const i = 3;
    const cam = cams[i];
    const [fx, fz] = [-Math.sin(cam.yawDeg * DEG), -Math.cos(cam.yawDeg * DEG)];
    t.place(def, cam.pos[0] + fx * 1.5, cam.pos[1] - 2.7, cam.pos[2] + fz * 1.5, cam.yawDeg + 180);
    const eye = eyePose(data.movement, data.hitboxes, t.bodyOf(def)!.state).pos;
    const dv = [0, 1, 2].map((k) => cam.pos[k] - eye[k]);
    const aim = { yaw: Math.atan2(-dv[0], -dv[2]), pitch: Math.atan2(dv[1], Math.hypot(dv[0], dv[2])) };
    def.cmd = { ...aim, buttons: Btn.Ads };
    for (let k = 0; k < 64; k++) t.tick();
    def.cmd = { ...aim, buttons: Btn.Ads | Btn.Fire };
    t.tick();
    def.cmd = { ...aim };
    for (let k = 0; k < 4; k++) t.tick();
    expect(t.room.sim.matchRules.camsBroken).toBe(1 << i);
    expect([def.session.match!.camsBroken, atk.session.match!.camsBroken]).toEqual([1 << i, 1 << i]);
    // Going round, the broken one is skipped: 3 → 5.
    def.cmd = { ...aim, buttons: Btn.Observe };
    t.tick();
    def.cmd = { ...aim };
    t.until(() => ctrl.cam === 1, 0.5, "the first camera");
    for (const want of [2, 3, 5]) {
      def.cmd = { ...aim, lean: 0 };
      t.tick();
      def.cmd = { ...aim, lean: 1 };
      t.until(() => ctrl.cam === want, 0.5, `camera ${want}`);
    }
  }, 60_000);

  it("a dead defender watches them too; an attacker's Observe never opens them", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    const [atk, def] = sidesOf(t, cs);
    t.until(() => t.match.phase === Phase.Action, 25, "action");
    t.tick();
    const body = t.bodyOf(def)!;
    t.room.killBody(body.id, Cause.Lab);
    t.tick();
    const ctrl = t.room.bodyOf(def.id)!;
    def.cmd = { buttons: Btn.Observe };
    t.tick();
    def.cmd = {};
    t.until(() => ctrl.cam === 1, 0.5, "the first camera");
    expect(t.room.bodyOf(atk.id)!.cam).toBe(0);
  }, 60_000);
});
