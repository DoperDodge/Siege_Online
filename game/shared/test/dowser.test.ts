// Dowser's Divining Coil (Project Redmond R3, gadgets/R3_OPERATORS.md §2): held up out of slot 2 (Z), it shows him alone
// the other side's electronic devices within 18 m of his eye through anything, within a 100° fan ahead of him: their
// gadgets marked electronic (Dampers, Arc Packs, armoured cameras, alarms...), the level's cameras, drones, Twain's idle
// frame; never a mechanical one (Latch's snares, barbed wire) nor his own side's. A ping while it's up marks the one
// nearest his crosshair (within 20°) for his team. An EMP on him empties it. A bot playing Dowser pings what it shows.
import { describe, expect, it } from "vitest";
import { botLoadout, Btn, coilMarks, encodeLobbyAction, Hand, handleRoomMessage, isFormat, kindOf, Phase, Room, ByteReader, TICK_HZ, type FormatMode, type GameEvent } from "../src/index.js";
import { scene, type Scene } from "./interactions/harness.js";
import { loadGameData } from "../src/index.js";

const data = loadGameData();
const k = data.gadgets.get("divining_coil")!.coil!;

/** Dowser (client 0, attacking) and Mute (client 1, defending) on the Gadget Lab, out of the way. */
async function lab() {
  const s = await scene(["dowser", "mute"], "gadget_lab");
  s.park();
  return s;
}

/** Dowser at (x, z) facing `yawDeg`, his coil up (Z). */
function coilUp(s: Scene, x: number, z: number, yawDeg = 0) {
  const look = { yaw: (yawDeg * Math.PI) / 180, pitch: 0 };
  s.teleport(0, x, 0, z, yawDeg);
  s.clients[0].cmd = { ...look };
  s.wait(2);
  s.handOut(0, Hand.Ability, look);
}

const keys = (s: Scene) => coilMarks(s.sim, s.body(0)).map((m) => m.key);

describe("Dowser and his Divining Coil (R3)", () => {
  it("is an attacker, 1 / 3, his coil in slot 2", async () => {
    const op = data.operators.get("dowser")!;
    expect([op.name, op.side, op.healthRating, op.speedRating, op.ability.id, op.ability.name]).toEqual(["Dowser", "attacker", 1, 3, "divining_coil", "Divining Coil"]);
    expect(k).toEqual({ rangeM: 18, fanDeg: 100, pingDeg: 20 });
  });

  it("up, it shows the defenders' electronic devices through walls within its range and fan, nothing mechanical, none of his side's", async () => {
    const s = await lab();
    // Behind the soft walls (z −6), from in front of them (z 2), facing them (−z).
    const damper = s.put("signal_disruptor", 1, [-8, 0.1, -8]);
    const alarm = s.put("proximity_alarm", 1, [-4, 0.05, -9]);
    const wire = s.put("barbed_wire", 1, [-6, 0.2, -8]);
    const snare = s.put("snare_latch", 1, [-12, 0.3, -8]);
    const far = s.put("signal_disruptor", 1, [-8, 0.1, -17.5]);
    const behind = s.put("signal_disruptor", 1, [-8, 0.1, 10]);
    const mine = s.put("claymore", 0, [-7, 0.1, -3]);
    // Not up: nothing.
    s.teleport(0, -8, 0, 2, 0);
    expect(keys(s)).toEqual([]);
    coilUp(s, -8, 2, 0);
    const shown = keys(s);
    expect(shown).toContain(`g${damper.id}`);
    expect(shown).toContain(`g${alarm.id}`);
    for (const g of [wire, snare, far, behind, mine]) expect(shown, `entry ${g.id}`).not.toContain(`g${g.id}`);
    // The level's camera over the door wall (z 5.8) is behind him; turned round, it shows.
    expect(shown).not.toContain("c0");
    coilUp(s, -8, 2, 180);
    expect(keys(s)).toContain("c0");
    // Nearest first.
    coilUp(s, -8, 2, 0);
    const marks = coilMarks(s.sim, s.body(0));
    expect(marks.map((m) => m.dist)).toEqual([...marks.map((m) => m.dist)].sort((a, b) => a - b));
  });

  it("an EMP on him empties it while it lasts", async () => {
    const s = await lab();
    const damper = s.put("signal_disruptor", 1, [-8, 0.1, -8]);
    coilUp(s, -8, 2, 0);
    expect(keys(s)).toContain(`g${damper.id}`);
    s.body(0).state.jammed = 3 * TICK_HZ;
    expect(keys(s)).toEqual([]);
  });

  it("a ping with it up marks the device nearest his crosshair for his team, its kind with it", async () => {
    const s = await lab();
    const pings = () => s.clients[0].events.filter((e): e is Extract<GameEvent, { kind: "ping" }> => e.kind === "ping");
    const damper = s.put("signal_disruptor", 1, [-8, 0.1, -8]);
    const alarm = s.put("proximity_alarm", 1, [-4, 0.05, -9]);
    coilUp(s, -8, 2, 0);
    // Aimed at the wall a little off the Damper (within the coil's 20°): the Damper's marked, where it is.
    s.press(0, Btn.Ping, s.aimAt(0, [-7.6, 1.0, -6]));
    expect(pings().map((e) => [e.gadget, e.pos])).toEqual([[kindOf("signal_disruptor"), damper.pos]]);
    // Toward the alarm: the alarm.
    s.wait(40);
    s.press(0, Btn.Ping, s.aimAt(0, alarm.pos));
    expect(pings().at(-1)!.gadget).toBe(kindOf("proximity_alarm"));
  });
});

describe("a bot playing Dowser (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  it("holds his coil up on his way in and pings the devices it shows for his team", async () => {
    const room = await Room.create("DOWSER", "millrace", { format: "bot_training", seed: 4 });
    const heard: GameEvent[] = [];
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
    const ops = ["dowser", "thermite", "striker", "sledge", "fuze"];
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, i) => room.pickLoadout(p.id, botLoadout(data, ops[i])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    // The person (defending alone) out of the way, in the basement; Dampers of his round the Mill's walls.
    const you = [...m.players.values()].find((p) => p.bot === null)!;
    const yourBody = room.sim.pawns.get(room.bodyOf(you.id)!.possessedPawnId)!;
    room.sim.teleport(yourBody.id, 11, -3.2, 35.5, 0);
    for (const e of room.sim.level.panels.list.filter((x) => x.panel.kind === "wall").slice(0, 40)) {
      const f = e.frame;
      room.sim.gadgets.add({ kind: kindOf("signal_disruptor"), owner: you.id, team: yourBody.team, pos: [f.center[0] + f.n[0] * 0.6, f.center[1] - f.h / 2 + 0.06, f.center[2] + f.n[2] * 0.6], yaw: 0, vel: [0, 0, 0], flags: 2, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: 0 });
    }
    // What a teammate of his hears: his pings.
    const mate = room.botOf(bots[1].id)!;
    const hear = mate.hear.bind(mate);
    mate.hear = (ev) => {
      heard.push(...ev);
      hear(ev);
    };
    const ok = step(() => heard.some((e) => e.kind === "ping" && e.gadget === kindOf("signal_disruptor")), 150);
    expect(ok).toBe(true);
  }, 300000);
});

describe("Dowser's coil and the other R3 operators (R3_OPERATORS.md §3)", () => {
  it("shows Shunt's packs, Bailiff's set-down, armoured cameras and Twain's idle frame; not Twain herself, nor Latch's snares", async () => {
    const s = await scene(["dowser", "skopos"], "gadget_lab");
    s.park();
    // Behind the soft walls (z −6), in his fan from in front of them.
    const pack = s.put("arc_pack", 1, [-9, 0.05, -8]);
    const post = s.put("bailiff_post", 1, [-7, 0.05, -8.5]);
    const armoured = s.put("bulletproof_camera", 1, [-8, 1.6, -6.2]);
    const snare = s.put("snare_latch", 1, [-6, 0.3, -8]);
    const twain = s.ctrlOf(1);
    const idle = twain.pawnIds.find((id) => id !== twain.possessedPawnId)!;
    expect(idle).toBeDefined();
    s.sim.teleport(idle, -10, 0, -9, 180);
    s.teleport(1, -12, 0, -9, 180); // her body she's in, there too
    coilUp(s, -8, 2, 0);
    const shown = keys(s);
    for (const g of [pack, post, armoured]) expect(shown, `entry ${g.id}`).toContain(`g${g.id}`);
    expect(shown).toContain(`p${idle}`);
    expect(shown).not.toContain(`g${snare.id}`);
    expect(shown).not.toContain(`p${twain.possessedPawnId}`);
  });
});
