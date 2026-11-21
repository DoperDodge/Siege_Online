// Ohm's Brownout Pistol (Project Redmond R3, gadgets/R3_OPERATORS.md §2; Ulo's design): his slot 2 item fires one EMP
// round a magazine, 7 magazines a round, each reloaded quickly. A round flies straight (judged as a bullet, rewound),
// stops at the first wall, floor, body or shield in its range and bursts there: the defenders' electronics and bodies
// within its small reach, through walls, are off for its seconds; past its range it's spent. His scope marks every
// device a round could turn off with a dot (gadgets/electronics.ts empTargets). A bot playing Ohm shoots the devices
// his scope marks behind the plan's first hard breach wall.
import { describe, expect, it } from "vitest";
import {
  Btn,
  botLoadout,
  ByteReader,
  DEFENSE,
  defaultLoadoutPick,
  empTargets,
  encodeLobbyAction,
  GadgetAct,
  GFlag,
  Hand,
  handleRoomMessage,
  isFormat,
  kindId,
  kindOf,
  loadGameData,
  Phase,
  Room,
  shieldUp,
  sides,
  TICK_HZ,
  ticks,
  type FormatMode,
  type Gadget,
  type GameEvent,
  type Vec3,
} from "../src/index.js";
import { scene, type Scene } from "./interactions/harness.js";

const data = loadGameData();
const pistol = data.gadgets.get("brownout_pistol")!;
const use = pistol.use.kind === "shoot" ? pistol.use : null;
const RELOAD = ticks(use!.reloadS);
const EMP_S = pistol.emp!.seconds;

/** Ohm (client 0) 3.5 m in front of the reinforceable wall at z −6 (front face −5.9), facing it; Lull out of the way. */
async function atWall() {
  const s = await scene(["ohm", "lull"]);
  s.room.pickLoadout(s.clients[0].id, defaultLoadoutPick(s.sim.data, "ohm"));
  s.wait(8);
  s.teleport(0, 1, 0, -2.4, 0);
  s.teleport(1, 20, 0, 20, 0);
  return s;
}

/** Client 0 takes the pistol out (Z) looking `look`, and fires a round (Fire): the room's word on where it went. */
function fire(s: Scene, look: { yaw: number; pitch: number }) {
  if (s.body(0).state.hand !== Hand.Ability) s.handOut(0, Hand.Ability, look);
  const before = s.clients[0].events.length;
  s.press(0, Btn.Fire, look);
  s.wait(2);
  return s.clients[0].events.slice(before).filter((e): e is Extract<GameEvent, { kind: "gshot" }> => e.kind === "gshot");
}

describe("Ohm's Brownout Pistol (R3)", () => {
  it("is his slot 2 item: 7 rounds, one a magazine", async () => {
    const op = data.operators.get("ohm")!;
    expect([op.name, op.side, op.ability.id, op.ability.name]).toEqual(["Ohm", "attacker", "brownout_pistol", "Brownout Pistol"]);
    const s = await atWall();
    expect(s.body(0).state.g2).toBe(7);
  });

  it("fires one round a press, can't fire again while it reloads, and is put away after the seventh", async () => {
    const s = await atWall();
    const look = { yaw: 0, pitch: 0 };
    expect(fire(s, look).length).toBe(1);
    expect([s.body(0).state.g2, s.body(0).state.gAct]).toEqual([6, GadgetAct.Shoot]);
    // Pressed again mid-reload: nothing.
    expect(fire(s, look).length).toBe(0);
    expect(s.body(0).state.g2).toBe(6);
    s.wait(RELOAD);
    expect(s.body(0).state.gAct).toBe(GadgetAct.Ready);
    for (let n = 5; n >= 0; n--) {
      expect(fire(s, look).length).toBe(1);
      expect(s.body(0).state.g2).toBe(n);
      s.wait(RELOAD);
    }
    expect(s.body(0).state.hand).toBe(Hand.Weapon);
  });

  it("a round stops at the wall and bursts there: a Damper 1 m behind it is off for its seconds, one 2.5 m behind isn't", async () => {
    const s = await atWall();
    const near = s.put("damper", 1, [1, 0.06, -6.9]);
    const far = s.put("damper", 1, [1, 0.06, -8.5]);
    const own = s.put("claymore", 0, [2.2, 0.05, -5.2]);
    const [shot] = fire(s, s.aimAt(0, [1, 0.5, -5.9]));
    expect(shot.burst).toBe(true);
    expect(shot.end[2]).toBeGreaterThan(-5.95); // just short of the wall, this side
    expect(shot.end[2]).toBeLessThan(-5.7);
    const g = (id: number) => s.sim.gadgets.get(id)!;
    expect([g(near.id).flags & GFlag.Off, g(far.id).flags & GFlag.Off, g(own.id).flags & GFlag.Off]).toEqual([GFlag.Off, 0, 0]);
    s.wait(ticks(EMP_S) + 2);
    expect(g(near.id).flags & GFlag.Off).toBe(0);
  });

  it("a round stops in a defender's body and jams him; one that meets nothing in its range is spent", async () => {
    const s = await atWall();
    s.teleport(1, 1, 0, -5.0, 180);
    const [hit] = fire(s, s.aimAt(0, [1, 1.2, -5.0]));
    expect(hit.burst).toBe(true);
    expect(s.body(1).state.jammed).toBeGreaterThan(ticks(EMP_S) - 8);
    s.wait(RELOAD);
    const [sky] = fire(s, { yaw: 0, pitch: 1.4 }); // up into the open sky
    expect(sky.burst).toBe(false);
  });
});

describe("Ohm's scope (R3): what it marks", () => {
  it("the other side's electronic devices in range, through walls; not their mechanical ones, nor his own side's", async () => {
    const s = await atWall();
    const damper = s.put("damper", 1, [1, 0.06, -7.5]);
    s.put("barbed_wire", 1, [3, 0.225, -7.5]);
    s.put("claymore", 0, [2, 0.05, -4]);
    const cam = s.put("armoured_camera", 1, [-2, 1.5, -6.2]);
    const far = s.put("proximity_alarm", 1, [1, 0.05, 25]); // 27 m behind him, within its 40 m
    const out = s.put("proximity_alarm", 1, [30, 0.05, 30]); // past its range
    const eye: Vec3 = [1, 1.6, -2.4];
    const marks = empTargets(s.sim, s.body(0).team, eye, use!.rangeM);
    const at = (p: readonly number[]) => marks.some((m) => Math.hypot(m[0] - p[0], m[1] - p[1], m[2] - p[2]) < 1e-6);
    expect([at(damper.pos), at(cam.pos), at(far.pos), at(out.pos)]).toEqual([true, true, true, false]);
    expect(marks.length).toBe(3);
    // Nearest first: the camera (4.8 m), the Damper (5.3 m), the alarm (27 m).
    const dist = (p: readonly number[]) => Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    expect(marks.map(dist)).toEqual([...marks.map(dist)].sort((a, b) => a - b));
    expect(marks[0]).toEqual(cam.pos);
    // A defender's scope (were one to look) marks the attackers' electronics instead: the claymore.
    expect(empTargets(s.sim, DEFENSE, eye, use!.rangeM).length).toBe(1);
  });
});

describe("a bot playing Ohm (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  it("shoots the Damper behind the Mill's first hard breach wall from the Warping side", async () => {
    const room = await Room.create("OHM", "millrace", { format: "bot_training", seed: 4 });
    const host = room.join("you", { send() {}, buffered: () => 0 })!;
    const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
    const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack: "orange", bots: { ...bt.match.bots!, size: [1, 5], site: "SITE_MILL" }, seconds: { ...bt.match.seconds, pick: 8, prep: 45, action: 180 } };
    send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: rules } } } as Parameters<typeof encodeLobbyAction>[0]));
    room.step();
    send(encodeLobbyAction({ kind: "start" }));
    room.step();
    const m = room.director!.match;
    const step = (done: () => boolean, seconds: number) => {
      for (let i = 0; i < seconds * TICK_HZ && !done(); i++) room.step();
      return done();
    };
    expect(step(() => m.phase === Phase.Planning, 5)).toBe(true);
    const ops = ["ohm", "kiln", "pointman", "cleave", "hail"];
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, k) => room.pickLoadout(p.id, botLoadout(data, ops[k])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    // The person (defending alone) out of the way: in the Coal Store, in the basement at the other end.
    const you = [...m.players.values()].find((p) => p.bot === null)!;
    const yourBody = room.sim.pawns.get(room.bodyOf(you.id)!.possessedPawnId)!;
    room.sim.teleport(yourBody.id, 11, -3.2, 35.5, 0);
    // A Damper of the defenders' 0.8 m behind the wall, on the site's side.
    const wall = room.sim.level.panels.byId.get("SW-1F-01")!;
    const site = room.sim.level.def.sites.find((x) => x.id === "SITE_MILL")!;
    const behind = sides(room.sim.level.def, wall, 0.8).find((x) => x.room !== null && site.rooms.includes(x.room))!;
    const damper = room.sim.gadgets.add({ kind: kindOf("damper"), owner: you.id, team: yourBody.team, pos: [behind.pos[0], behind.pos[1] + 0.06, behind.pos[2]], yaw: 0, vel: [0, 0, 0], flags: GFlag.OnFloor, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: 0 });
    const ohm = room.sim.pawns.get(room.bodyOf(bots[0].id)!.possessedPawnId)!;
    let off = false;
    const ok = step(() => (off ||= ((room.sim.gadgets.get(damper.id)?.flags ?? 0) & GFlag.Off) !== 0), 90);
    const jobs = room.attackPlan!.jobList().filter((j) => j.task.kind === "gadget" && j.task.tag.startsWith("emp") && j.by === bots[0].id);
    expect(ok, `${JSON.stringify(jobs)} ohm g2 ${ohm.state.g2}`).toBe(true);
    expect(ohm.state.g2).toBeLessThan(7);
  }, 300000);
});

describe("Ohm's rounds and the other R3 operators (R3_OPERATORS.md §3)", () => {
  it("a round turns off Shunt's pack, Bailiff's set-down (its shock with it) and an armoured camera in reach, and shocks Bailiff with her shield up; not Latch's snare, nor Rivet's salvo; his scope marks exactly what it turns off", async () => {
    const s = await scene(["ohm", "shunt", "bailiff", "latch", "rivet"], "gadget_lab");
    s.room.pickLoadout(s.clients[0].id, defaultLoadoutPick(s.sim.data, "ohm"));
    s.wait(8);
    s.park();
    for (const sim of [s.sim, ...s.clients.map((c) => c.session.sim!)]) sim.matchRules.cameras = true;
    // About the plain soft wall's middle (x −8, its front face z −5.9), most of them behind it.
    const pack = s.put("arc_pack", 1, [-7.6, 0.05, -6.4]);
    const post = s.put("bailiff_post", 2, [-8.4, 0.05, -6.4], { flags: GFlag.OnFloor | GFlag.Active });
    const armoured = s.put("armoured_camera", 1, [-7.3, 1.6, -6.2]);
    const snare = s.put("snare_latch", 3, [-8, 0.3, -6.4]);
    const salvo = s.put("stud_ring", 4, [-9.2, 1.0, -5.9], s.onPanel("soft_plain", [-9.2, 1.0, -5.9]));
    s.teleport(2, -8.9, 0, -6.7, 0); // Bailiff, her shield up, behind the wall
    s.teleport(0, -8, 0, -2.4, 0);
    expect(shieldUp(s.body(2).state)).toBe(true);
    const lit = (p: readonly number[]) => (m: readonly number[]) => Math.hypot(m[0] - p[0], m[1] - p[1], m[2] - p[2]) < 1e-6;
    const marks = empTargets(s.sim, s.body(0).team, [-8, 1.6, -2.4], use!.rangeM);
    for (const g of [pack, post, armoured]) expect(marks.some(lit(g.pos)), kindId(g.kind)).toBe(true);
    for (const g of [snare, salvo]) expect(marks.some(lit(g.pos)), kindId(g.kind)).toBe(false);
    const [shot] = fire(s, s.aimAt(0, [-8, 1.2, -5.9]));
    expect(shot.burst).toBe(true);
    s.wait(2);
    const now = (g: Gadget) => s.sim.gadgets.get(g.id)!;
    expect([pack, post, armoured, snare, salvo].map((g) => now(g).flags & GFlag.Off)).toEqual([GFlag.Off, GFlag.Off, GFlag.Off, 0, 0]);
    expect(now(post).flags & GFlag.Active).toBe(0);
    expect(s.body(2).state.shocked).toBeGreaterThan(0);
    // Exactly: every entry within the burst's reach is off if and only if the scope marked it.
    const reach = pistol.emp!.radiusM;
    const near = s.sim.gadgets.list.filter((g) => Math.hypot(g.pos[0] - shot.end[0], g.pos[1] - shot.end[1], g.pos[2] - shot.end[2]) <= reach);
    expect(near.length).toBeGreaterThanOrEqual(5);
    for (const g of near) expect((g.flags & GFlag.Off) !== 0, kindId(g.kind)).toBe(marks.some(lit(g.pos)));
  });

  it("a round under the level's camera turns it off (his scope marks it, cameras on)", async () => {
    const s = await scene(["ohm", "shunt"], "gadget_lab");
    s.room.pickLoadout(s.clients[0].id, defaultLoadoutPick(s.sim.data, "ohm"));
    s.wait(8);
    s.park();
    for (const sim of [s.sim, ...s.clients.map((c) => c.session.sim!)]) sim.matchRules.cameras = true;
    const cam = s.sim.level.def.cameras[0].pos; // over the door wall's inner face (z 5.9)
    s.teleport(0, -8, 0, 2, 180);
    expect(empTargets(s.sim, s.body(0).team, [-8, 1.6, 2], use!.rangeM).some((m) => Math.hypot(m[0] - cam[0], m[1] - cam[1], m[2] - cam[2]) < 1e-6)).toBe(true);
    expect(s.sim.matchRules.camsOff & 1).toBe(0);
    const [shot] = fire(s, s.aimAt(0, [cam[0], cam[1] - 0.7, 5.9]));
    expect(shot.burst).toBe(true);
    expect(s.sim.matchRules.camsOff & 1).toBe(1);
  });
});

describe("Ohm's reload can't be skipped (the review, R3)", () => {
  it("putting the pistol away and out again doesn't load the next round any sooner", async () => {
    const s = await atWall();
    const look = { yaw: 0, pitch: 0 };
    expect(fire(s, look)).toHaveLength(1);
    const t0 = s.sim.tick;
    let early = 0;
    while (s.sim.tick - t0 < RELOAD - 40) {
      s.press(0, Btn.Ability, look); // away
      s.press(0, Btn.Ability, look); // out again
      s.wait(ticks(data.gadgetRules.equipS) + 2);
      early += fire(s, look).length;
    }
    expect(early).toBe(0);
    s.wait(RELOAD);
    expect(fire(s, look)).toHaveLength(1);
  });

  it("nor does a knife", async () => {
    const s = await atWall();
    const look = { yaw: 0, pitch: 0 };
    expect(fire(s, look)).toHaveLength(1);
    s.press(0, Btn.Melee, look);
    for (let n = 0; n < 200 && s.body(0).state.meleeTicks > 0; n++) s.wait(1);
    expect(fire(s, look)).toHaveLength(0);
    s.wait(RELOAD);
    expect(fire(s, look)).toHaveLength(1);
  });
});
