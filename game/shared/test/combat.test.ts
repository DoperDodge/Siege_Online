// Damage, death and events through a whole room (Phase 3 M6; DECISIONS D-043, D-044, D-051): Room and
// ClientSessions in one process, messages delivered once per tick (zero latency).
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  ClientSession,
  decodeInput,
  decodeLabTool,
  decodePing,
  DT,
  encodeLabTool,
  Msg,
  PawnMode,
  Room,
  Stance,
  type GameEvent,
  type InputCmd,
} from "../src/index.js";

type Cmd = Partial<Omit<InputCmd, "seq">>;

async function harness(operators: string[], opts: { seed?: number } = {}) {
  const room = await Room.create("TEST1", "movement_lab", { lab: true, seed: opts.seed ?? 7 });
  const clock = { t: 0 };
  const clients = operators.map((op, i) => {
    const toClient: Uint8Array[] = [];
    const toServer: Uint8Array[] = [];
    const events: GameEvent[] = [];
    const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onEvents: (_t, evs) => events.push(...evs) });
    const id = room.join(`p${i}`, { send: (b) => toClient.push(b), buffered: () => 0 }, op)!;
    return { session, id, toClient, toServer, events };
  });
  const flush = () => {
    for (const c of clients) {
      for (const b of c.toServer.splice(0)) {
        const r = new ByteReader(b.subarray(1));
        if (b[0] === Msg.Input) room.onInput(c.id, decodeInput(r));
        else if (b[0] === Msg.Ping) room.onPing(c.id, decodePing(r).clientTime);
        else if (b[0] === Msg.LabTool) room.onLabTool(c.id, decodeLabTool(r));
      }
    }
  };
  const deliver = () => {
    for (const c of clients) for (const b of c.toClient.splice(0)) c.session.handle(b);
  };
  deliver();
  await Promise.all(clients.map((c) => c.session.loaded()));
  const tick = (cmds: Cmd[] = []) => {
    clock.t += DT * 1000;
    clients.forEach((c, i) => c.session.ready && c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmds[i] }));
    flush();
    room.step();
    deliver();
  };
  const ticks = (n: number, cmds: Cmd[] = []) => {
    for (let i = 0; i < n; i++) tick(cmds);
  };
  ticks(8);
  const pawnOf = (c: (typeof clients)[number]) => room.sim.pawns.get(c.session.ctrl!.possessedPawnId)!;
  const info = (c: (typeof clients)[number]) => room.memberInfo(c.id)!;
  /** Two players 8 m apart on the open floor, facing each other. */
  const faceOff = () => {
    clients[0].toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 0, z: 4, yawDeg: 180 }));
    clients[1].toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 0, z: 12, yawDeg: 0 }));
  };
  return { room, clients, tick, ticks, pawnOf, info, faceOff };
}

const kinds = (evs: GameEvent[], kind: GameEvent["kind"]) => evs.filter((e) => e.kind === kind);
// Aiming down sights (a rifle's ADS spread is 0): a torso shot at 8 m, or one at the head.
const A_TORSO = { yaw: Math.PI, pitch: -0.05, buttons: Btn.Ads };
const A_HEAD = { yaw: Math.PI, pitch: 0, buttons: Btn.Ads };
const B_HEAD = { yaw: 0, pitch: 0, buttons: Btn.Ads };

describe("damage and death through the room", () => {
  it("a body hit costs the victim its health and exactly one forced correction, never a misprediction", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a, b] = h.clients;
    h.faceOff();
    h.ticks(40, [A_TORSO]);
    const before = { ...h.info(b) };
    h.tick([{ ...A_TORSO, buttons: Btn.Ads | Btn.Fire }]);
    h.ticks(4, [A_TORSO]);
    const hit = kinds(a.events, "hitConfirm") as Extract<GameEvent, { kind: "hitConfirm" }>[];
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ victimPawn: h.pawnOf(b).id, zone: "torso", killed: false, friendly: false });
    expect(h.pawnOf(b).state.hp).toBe(110 - hit[0].damage);
    expect(hit[0].hpAfter).toBe(h.pawnOf(b).state.hp);
    // The victim's own client has the new health (an exact correction) and was told where it came from.
    expect(b.session.sim!.pawns.get(b.session.ctrl!.possessedPawnId)!.state.hp).toBe(h.pawnOf(b).state.hp);
    const taken = kinds(b.events, "damageTaken")[0] as Extract<GameEvent, { kind: "damageTaken" }>;
    expect(taken).toMatchObject({ amount: hit[0].damage, attackerCtrl: a.session.ctrl!.id });
    expect(taken.from![2]).toBeCloseTo(4, 1);
    expect(h.info(b).forcedCorrections - before.forcedCorrections).toBe(1);
    expect(h.info(b).corrections - before.corrections).toBe(1);
    // Everyone else sees the shot: muzzle flash and where it ended (at the torso, 8 m away).
    const fx = kinds(b.events, "shotFx")[0] as Extract<GameEvent, { kind: "shotFx" }>;
    expect(fx.pawnId).toBe(h.pawnOf(a).id);
    expect(fx.ends[0][2]).toBeGreaterThan(11.4);
    expect(fx.ends[0][2]).toBeLessThan(12);
  });

  it("ten hits in a second: ten forced corrections at most, still no mispredictions", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    const before = { ...h.info(a) };
    for (let i = 0; i < 10; i++) {
      a.toServer.push(encodeLabTool({ kind: "damage", pawnId: h.pawnOf(a).id, amount: 1, kill: false }));
      h.ticks(6, [{ forward: i % 2, strafe: 1 }]);
    }
    expect(h.pawnOf(a).state.hp).toBe(100);
    const forced = h.info(a).forcedCorrections - before.forcedCorrections;
    expect(forced).toBeGreaterThan(0);
    expect(forced).toBeLessThanOrEqual(10);
    expect(h.info(a).corrections - before.corrections).toBe(forced);
    expect(kinds(a.events, "damageTaken")).toHaveLength(10);
  });

  it("a headshot kills: everyone gets the kill, and the dead can't fire what they had queued", async () => {
    const h = await harness(["sledge", "mute", "pulse"]);
    const [a, b, c] = h.clients;
    h.faceOff();
    h.ticks(40, [A_HEAD, B_HEAD]);
    h.tick([{ ...A_HEAD, buttons: Btn.Ads | Btn.Fire }, B_HEAD]);
    h.ticks(2, [A_HEAD, B_HEAD]);
    expect(h.pawnOf(b).state.mode).toBe(PawnMode.Dead);
    for (const who of [a, b, c]) {
      const kill = kinds(who.events, "kill") as Extract<GameEvent, { kind: "kill" }>[];
      expect(kill).toHaveLength(1);
      expect(kill[0]).toMatchObject({ victimPawn: h.pawnOf(b).id, victimCtrl: b.session.ctrl!.id, killerCtrl: a.session.ctrl!.id, weapon: "l85a2", headshot: true });
    }
    expect((kinds(a.events, "hitConfirm")[0] as Extract<GameEvent, { kind: "hitConfirm" }>).killed).toBe(true);
    // B keeps pulling the trigger: nothing is fired and A is untouched.
    const shotsBefore = h.room.stats.shots;
    h.ticks(30, [A_HEAD, { ...B_HEAD, buttons: Btn.Ads | Btn.Fire }]);
    expect(h.room.stats.shots).toBe(shotsBefore);
    expect(h.pawnOf(a).state.hp).toBe(110);
  });

  it("two players who shoot each other in the same tick both die, whoever joined first", async () => {
    for (const order of [["sledge", "mute"], ["mute", "sledge"]]) {
      const h = await harness(order);
      const [a, b] = h.clients;
      h.faceOff();
      h.ticks(40, [A_HEAD, B_HEAD]);
      h.tick([
        { ...A_HEAD, buttons: Btn.Ads | Btn.Fire },
        { ...B_HEAD, buttons: Btn.Ads | Btn.Fire },
      ]);
      h.ticks(2);
      expect([h.pawnOf(a).state.mode, h.pawnOf(b).state.mode]).toEqual([PawnMode.Dead, PawnMode.Dead]);
      expect(kinds(a.events, "kill")).toHaveLength(2);
    }
  });

  it("friendly fire is on in lab rooms (D-051): a teammate takes the hit, flagged friendly", async () => {
    const h = await harness(["sledge", "thermite"]); // both attackers
    const [a, b] = h.clients;
    h.faceOff();
    h.ticks(40, [A_TORSO]);
    h.tick([{ ...A_TORSO, buttons: Btn.Ads | Btn.Fire }]);
    h.ticks(2, [A_TORSO]);
    const hit = kinds(a.events, "hitConfirm")[0] as Extract<GameEvent, { kind: "hitConfirm" }>;
    expect(hit.friendly).toBe(true);
    expect(h.pawnOf(b).state.hp).toBeLessThan(h.pawnOf(b).state.maxHp);
  });

  it("reverse friendly fire, once past the threshold, reflects team damage onto the shooter", async () => {
    const h = await harness(["sledge", "thermite"]);
    const [a, b] = h.clients;
    Object.assign(h.room.rules.reverseFriendlyFire, { enabled: true, thresholdHp: 30 });
    try {
      h.faceOff();
      h.ticks(40, [A_TORSO]);
      h.tick([{ ...A_TORSO, buttons: Btn.Ads | Btn.Fire }]); // over the 30 HP threshold in one hit
      h.ticks(12, [A_TORSO]);
      const bHp = h.pawnOf(b).state.hp;
      h.tick([{ ...A_TORSO, buttons: Btn.Ads | Btn.Fire }]);
      h.ticks(2, [A_TORSO]);
      expect(h.pawnOf(b).state.hp).toBe(bHp); // the teammate is spared...
      expect(h.pawnOf(a).state.hp).toBe(110 - (110 - bHp)); // ...the shooter takes the same damage
      expect((kinds(a.events, "damageTaken")[0] as Extract<GameEvent, { kind: "damageTaken" }>).cause).toBe(5); // Reflect
    } finally {
      Object.assign(h.room.rules.reverseFriendlyFire, { enabled: false, thresholdHp: 100 });
    }
  });

  it("Skopós: losing the idle shell isn't an elimination (and ends swapping); losing the one she's in is", async () => {
    const h = await harness(["sledge", "skopos"]);
    const [a, b] = h.clients;
    const ctrl = h.room.sim.controllers.get(b.session.ctrl!.id)!;
    const [active, idle] = [ctrl.possessedPawnId, ctrl.pawnIds.find((id) => id !== ctrl.possessedPawnId)!];
    // Put the idle shell 8 m in front of A, the active one off to the side.
    h.room.sim.teleport(idle, 0, 0, 12, 0);
    h.room.sim.teleport(active, 6, 0, 12, 0);
    a.toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 0, z: 4, yawDeg: 180 }));
    h.ticks(40, [A_TORSO]);
    for (let i = 0; i < 6 && h.room.sim.pawns.get(idle)!.state.mode !== PawnMode.Dead; i++) {
      h.tick([{ ...A_TORSO, buttons: Btn.Ads | Btn.Fire }]);
      h.ticks(10, [A_TORSO]);
    }
    expect(h.room.sim.pawns.get(idle)!.state.mode).toBe(PawnMode.Dead);
    expect(kinds(a.events, "kill")).toHaveLength(0);
    expect(kinds(a.events, "shellDestroyed")[0]).toMatchObject({ pawnId: idle, ownerCtrl: ctrl.id, killerCtrl: a.session.ctrl!.id });
    expect(h.room.sim.otherPawn(ctrl.id)).toBeNull(); // nothing left to swap to
    // A headshot on the shell she's in eliminates her.
    a.toServer.push(encodeLabTool({ kind: "teleport", x: 6, y: 0, z: 4, yawDeg: 180 }));
    h.ticks(40, [A_HEAD]);
    h.tick([{ ...A_HEAD, buttons: Btn.Ads | Btn.Fire }]);
    h.ticks(2, [A_HEAD]);
    expect(kinds(a.events, "kill")[0]).toMatchObject({ victimPawn: active, victimCtrl: ctrl.id });
  });

  it("the lab damage tool only hurts your own bodies", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a, b] = h.clients;
    a.toServer.push(encodeLabTool({ kind: "damage", pawnId: h.pawnOf(b).id, amount: 50, kill: false }));
    h.ticks(2);
    expect(h.pawnOf(b).state.hp).toBe(110);
    a.toServer.push(encodeLabTool({ kind: "damage", pawnId: h.pawnOf(a).id, amount: 0, kill: true }));
    h.ticks(2);
    expect(h.pawnOf(a).state.mode).toBe(PawnMode.Dead);
    expect(kinds(b.events, "kill")[0]).toMatchObject({ victimPawn: h.pawnOf(a).id, killerCtrl: 0, cause: 4 });
  });

  it("the same inputs into two rooms with the same seed give the same events, spread and all", async () => {
    const run = async () => {
      const h = await harness(["sledge", "mute"], { seed: 99 });
      h.faceOff();
      h.ticks(10);
      for (let i = 0; i < 120; i++) h.tick([{ yaw: Math.PI + Math.sin(i / 9) * 0.05, pitch: -0.03, buttons: i % 30 < 12 ? Btn.Fire : 0 }]);
      return JSON.stringify(h.clients.map((c) => c.events));
    };
    const one = await run();
    expect(one).toContain("hitConfirm");
    expect(await run()).toBe(one);
  });
});

describe("down but not out through the room (Phase 3 M7)", () => {
  /**
   * Bring a player's own body down to `hp` with the lab tool: three 47-damage rifle shots on 110 HP would
   * overshoot 0 by more than 20 and kill outright (the overkill placeholder), one from 40 HP downs.
   */
  const weaken = (h: Awaited<ReturnType<typeof harness>>, c: (typeof h.clients)[number], hp: number, aim: Cmd = A_TORSO) => {
    c.toServer.push(encodeLabTool({ kind: "damage", pawnId: h.pawnOf(c).id, amount: h.pawnOf(c).state.hp - hp, kill: false }));
    h.ticks(4, [aim]);
    expect(h.pawnOf(c).state.hp).toBe(hp);
  };
  /** Fire one aimed shot from client 0 (sights already up), then let it land. */
  const shoot = (h: Awaited<ReturnType<typeof harness>>, aim: Cmd, others: Cmd[] = []) => {
    h.tick([{ ...aim, buttons: Btn.Ads | Btn.Fire }, ...others]);
    h.ticks(12, [aim, ...others]);
  };

  it("going down costs the victim one forced correction and then none while crawling; everyone hears of it", async () => {
    const h = await harness(["sledge", "mute", "pulse"]);
    const [a, b, c] = h.clients;
    h.faceOff();
    h.ticks(40, [A_TORSO]);
    weaken(h, b, 40);
    shoot(h, A_TORSO);
    expect(h.pawnOf(b).state.mode).toBe(PawnMode.Downed);
    const down = kinds(c.events, "down")[0] as Extract<GameEvent, { kind: "down" }>;
    expect(down).toMatchObject({ victimPawn: h.pawnOf(b).id, downerCtrl: a.session.ctrl!.id, weapon: "l85a2" });
    expect(kinds(a.events, "hitConfirm").some((e) => (e as Extract<GameEvent, { kind: "hitConfirm" }>).downed)).toBe(true);
    const before = { ...h.info(b) };
    // Crawl about for 5 s: predicted exactly, bleed and all.
    for (let i = 0; i < 320; i++) h.tick([A_TORSO, { forward: i % 100 < 60 ? 1 : 0, strafe: i % 50 < 25 ? 1 : -1, yaw: (i / 40) % 6 }]);
    expect(h.info(b).corrections - before.corrections).toBe(0);
    expect(b.session.sim!.pawns.get(b.session.ctrl!.possessedPawnId)!.state.downHp).toBe(h.pawnOf(b).state.downHp);
    expect(h.pawnOf(b).state.downHp).toBeLessThan(20);
  });

  it("a revive: the downed player's client gets two corrections (start, end), the reviver's none", async () => {
    // Sledge and Thermite are teammates; Pulse shoots Sledge down.
    const h = await harness(["pulse", "sledge", "thermite"]);
    const [a, b, c] = h.clients;
    h.faceOff();
    h.ticks(40, [A_TORSO]);
    for (let i = 0; i < 6 && h.pawnOf(b).state.mode === PawnMode.Walk; i++) shoot(h, A_TORSO);
    expect(h.pawnOf(b).state.mode).toBe(PawnMode.Downed);
    h.ticks(80, [{}]); // lies down
    // C kneels in 0.8 m to B's side, facing B, and holds Interact.
    const bs = h.pawnOf(b).state;
    c.toServer.push(encodeLabTool({ kind: "teleport", x: bs.x + 0.8, y: 0, z: bs.z, yawDeg: 90 }));
    h.ticks(20, [{}, {}, { yaw: Math.PI / 2 }]);
    const before = { b: { ...h.info(b) }, c: { ...h.info(c) } };
    const hold = { yaw: Math.PI / 2, buttons: Btn.Interact };
    for (let i = 0; i < 280 && h.pawnOf(b).state.mode === PawnMode.Downed; i++) h.tick([{}, {}, hold]);
    h.ticks(10, [{}, {}, hold]);
    expect(h.pawnOf(b).state).toMatchObject({ mode: PawnMode.Walk, hp: 20 });
    expect(h.info(b).corrections - before.b.corrections).toBeLessThanOrEqual(2);
    expect(h.info(b).corrections - h.info(b).forcedCorrections - (before.b.corrections - before.b.forcedCorrections)).toBe(0);
    expect(h.info(c).corrections - before.c.corrections).toBe(0);
    expect(kinds(a.events, "reviveEnd").at(-1)).toMatchObject({ targetPawn: h.pawnOf(b).id, reviverPawn: h.pawnOf(c).id, completed: true });
  });

  it("the player who downed someone gets the kill; whoever finishes them gets the assist", async () => {
    const h = await harness(["sledge", "mute", "thermite"]);
    const [a, b, c] = h.clients;
    h.faceOff();
    c.toServer.push(encodeLabTool({ kind: "teleport", x: 2, y: 0, z: 4, yawDeg: 180 }));
    h.ticks(40, [A_TORSO]);
    weaken(h, b, 40);
    shoot(h, A_TORSO);
    expect(h.pawnOf(b).state.mode).toBe(PawnMode.Downed);
    h.ticks(80, [A_TORSO]);
    // C finishes B lying on the floor (aim down at the body from 2 m to the side, 8 m away).
    const bs = h.pawnOf(b).state;
    const cs = h.pawnOf(c).state;
    const eyeY = cs.y + 1.6;
    const yaw = Math.atan2(-(bs.x - cs.x), -(bs.z - cs.z));
    const pitch = Math.atan2(bs.y + 0.2 - eyeY, Math.hypot(bs.x - cs.x, bs.z - cs.z));
    const aimC = { yaw, pitch, buttons: Btn.Ads };
    h.ticks(40, [A_TORSO, {}, aimC]);
    for (let i = 0; i < 6 && h.pawnOf(b).state.mode !== PawnMode.Dead; i++) {
      h.tick([A_TORSO, {}, { ...aimC, buttons: Btn.Ads | Btn.Fire }]);
      h.ticks(12, [A_TORSO, {}, aimC]);
    }
    expect(h.pawnOf(b).state.mode).toBe(PawnMode.Dead);
    expect(kinds(b.events, "kill").at(-1)).toMatchObject({ victimPawn: h.pawnOf(b).id, killerCtrl: a.session.ctrl!.id, assistCtrl: c.session.ctrl!.id });
  });

  it("bleeding out is credited to whoever downed you", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a, b] = h.clients;
    h.faceOff();
    h.ticks(40, [A_TORSO]);
    weaken(h, b, 40);
    shoot(h, A_TORSO);
    expect(h.pawnOf(b).state.mode).toBe(PawnMode.Downed);
    // Crawl until it's over (fast bleed: 30 s).
    for (let i = 0; i < 64 * 31 && h.pawnOf(b).state.mode !== PawnMode.Dead; i++) h.tick([{}, { forward: 1, strafe: i % 128 < 64 ? 1 : -1 }]);
    expect(h.pawnOf(b).state.mode).toBe(PawnMode.Dead);
    expect(kinds(a.events, "kill").at(-1)).toMatchObject({ victimPawn: h.pawnOf(b).id, killerCtrl: a.session.ctrl!.id, cause: 6 });
  });
});
