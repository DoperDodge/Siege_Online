// Shunt's Arc Packs (Project Redmond R3, gadgets/R3_OPERATORS.md §2; anti hard breach, and tricking works, Ulo's): a
// pack on the floor by a reinforced wall section or a barricade makes it live. An attacker's device on a live surface is
// burnt out half a second after it's first found there, whether it went on while the surface was live or was there
// when a pack went live: so a pack picked up (Interact held) and put back catches a charge put on meanwhile ("tricking").
// Its detonator can't set off one on a live surface; one already set off isn't stopped. An EMP turns a pack off for its seconds. An attacker's knife on a live surface
// shocks him and does nothing to it; his drone by a pack is jammed. A bot playing Shunt puts his packs by the walls the
// site's plan reinforces.
import { describe, expect, it } from "vitest";
import {
  arcPanels,
  ATTACK,
  Btn,
  botLoadout,
  ByteReader,
  encodeLobbyAction,
  GFlag,
  handleRoomMessage,
  isFormat,
  kindId,
  kindOf,
  L_STEEL,
  liveSurfaces,
  loadGameData,
  PawnMode,
  Phase,
  Room,
  TICK_HZ,
  ticks,
  type FormatMode,
  type Gadget,
  type Vec3,
} from "../src/index.js";
import { LAB, scene, type Scene } from "./interactions/harness.js";

const data = loadGameData();
const k = data.gadgets.get("arc_pack")!.arc!;
const burn = ticks(k.burnS);

/** Thermite (client 0, attacking) and Shunt (client 1, defending) on the Gadget Lab, out of the way. */
async function lab() {
  const s = await scene(["thermite", "shunt"], "gadget_lab");
  s.park();
  return s;
}

/** At the reinforced wall's foot (its face toward +z at z −5.9), where Shunt puts his pack. */
const FOOT: Vec3 = [11.0, 0, -5.72];

/** Shunt (client 1) puts a pack down at the reinforced wall's foot from in front of it, as a player does, and steps away. */
function packDown(s: Scene): Gadget {
  s.teleport(1, 11.0, 0, -4.7);
  const g = s.plant(1, FOOT)!;
  expect(g).toBeDefined();
  s.teleport(1, ...LAB.away[1]);
  return g;
}

/** Thermite (client 0) puts his charge on the reinforced wall at x, as a player does, and steps back. */
function charge(s: Scene, x = 11.8): Gadget {
  s.teleport(0, x, 0, -5.0);
  const g = s.plant(0, [x, 1.4, -5.9])!;
  expect(g.panel).toBe(s.panel("reinforced").panel.spec.index);
  s.teleport(0, x, 0, -2.0);
  return g;
}

const gone = (s: Scene, g: Gadget) => s.sim.gadgets.get(g.id) === undefined;

/** An attackers' EMP at `at` (its radius and seconds), as the room sets one off. */
function emp(s: Scene, at: Vec3, seconds: number) {
  (s.room as unknown as { dseg(team: number, at: Vec3, r: number, sec: number): void }).dseg(ATTACK, at, 1.5, seconds);
}

describe("Shunt and his Arc Packs (R3)", () => {
  it("is a defender, 2 / 2, with four packs in slot 2", async () => {
    const op = data.operators.get("shunt")!;
    expect([op.name, op.side, op.healthRating, op.speedRating, op.ability.id, op.ability.name]).toEqual(["Shunt", "defender", 2, 2, "arc_pack", "Arc Packs"]);
    const s = await lab();
    expect(s.body(1).state.g2).toBe(4);
  });

  it("a pack at a reinforced wall's foot makes it live: a charge put on it can't be set off and is burnt out half a second later; the wall stands", async () => {
    const s = await lab();
    const pack = packDown(s);
    expect(arcPanels(s.sim, pack, k.reachM)).toEqual([s.panel("reinforced").panel.spec.index]);
    expect(s.body(1).state.g2).toBe(3);
    const before = s.clients[0].events.length;
    const g = charge(s);
    // Its detonator can't set it off meanwhile.
    s.detonate(0);
    expect([gone(s, g), s.sim.gadgets.get(g.id)!.flags & GFlag.Active]).toEqual([false, 0]);
    s.wait(burn);
    expect(gone(s, g)).toBe(true);
    // Everyone sees its sparks go; the wall's steel is all there.
    expect(s.clients[0].events.slice(before).some((e) => e.kind === "emp" && Math.abs(e.pos[0] - g.pos[0]) < 0.01)).toBe(true);
    expect(s.solidAt("reinforced", L_STEEL, [11.8, 1.4, -6])).toBe(true);
    // A pack a little further off doesn't reach it.
    const far = s.put("arc_pack", 1, [11.0, 0.075, -5.9 + k.reachM + 0.2]);
    expect(arcPanels(s.sim, far, k.reachM)).toEqual([]);
  });

  it("aimed at the floor up to a metre short of the wall, a pack goes against its foot, its prongs in; further off, it stays where it's put", async () => {
    const s = await lab();
    s.teleport(1, 11.3, 0, -4.0);
    const g = s.plant(1, [11.3, 0, -4.95])!;
    expect(g.pos[2]).toBeCloseTo(-5.9 + data.gadgets.get("arc_pack")!.sizeM[2] / 2 + 0.01, 2);
    expect(g.pos[0]).toBeCloseTo(11.3, 2);
    expect(Math.abs(Math.sin(g.yaw))).toBeLessThan(1e-3);
    expect(Math.cos(g.yaw)).toBeGreaterThan(0.99); // facing −z: into the wall
    expect(arcPanels(s.sim, g, k.reachM)).toEqual([s.panel("reinforced").panel.spec.index]);
    s.teleport(1, 11.9, 0, -3.85);
    const far = s.plant(1, [11.9, 0, -4.75])!;
    expect(far.pos[2]).toBeCloseTo(-4.75, 1);
    expect(arcPanels(s.sim, far, k.reachM)).toEqual([]);
  });

  it("tricking: picked up (Interact held), the wall's dead and a charge goes on; put back, the charge is burnt out", async () => {
    const s = await lab();
    const pack = packDown(s);
    s.teleport(1, 11.0, 0, -4.7);
    const look = s.aimAt(1, pack.pos);
    // His next pack out of its slot first (a press while it comes out does nothing).
    s.clients[1].cmd = { ...look };
    s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
    s.clients[1].cmd = { ...look, buttons: Btn.Interact };
    s.wait(ticks(s.sim.data.gadgetRules.pickUpS) + 8);
    s.clients[1].cmd = { ...look };
    expect([gone(s, pack), s.body(1).state.g2, liveSurfaces(s.sim).panels.size]).toEqual([true, 4, 0]);
    s.teleport(1, ...LAB.away[1]);
    const g = charge(s);
    s.wait(burn * 3);
    expect(gone(s, g)).toBe(false);
    // Back down before Thermite sets it off.
    packDown(s);
    s.wait(burn + 2);
    expect(gone(s, g)).toBe(true);
    expect(s.solidAt("reinforced", L_STEEL, [11.8, 1.4, -6])).toBe(true);
  });

  it("a charge already set off (burning) isn't stopped: the wall opens", async () => {
    const s = await lab();
    const g = charge(s);
    s.detonate(0);
    s.wait(2);
    expect(s.sim.gadgets.get(g.id)!.flags & GFlag.Active).toBe(GFlag.Active);
    s.put("arc_pack", 1, [11.0, 0.075, -5.72]);
    expect(liveSurfaces(s.sim).panels.size).toBe(1);
    s.wait(burn + 4);
    expect(gone(s, g)).toBe(false);
    s.wait(ticks(s.sim.data.gadgets.get("exothermic_charge")!.burnS!) + 8);
    expect(s.solidAt("reinforced", L_STEEL, [11.8, 1.0, -6])).toBe(false);
  });

  it("an EMP turns a pack off for its seconds: a charge put on meanwhile stays until it's on again", async () => {
    const s = await lab();
    const pack = s.put("arc_pack", 1, [11.0, 0.075, -5.72]);
    emp(s, [11.0, 0.4, -5.6], 6);
    s.wait(1);
    const off = s.sim.gadgets.get(pack.id)!;
    expect(off.flags & GFlag.Off).toBe(GFlag.Off);
    expect(liveSurfaces(s.sim).panels.size).toBe(0);
    const g = charge(s);
    s.wait(off.offEnd - s.sim.tick - 1);
    expect(gone(s, g)).toBe(false);
    s.wait(burn + 3);
    expect(gone(s, g)).toBe(true);
  });

  it("an attacker's knife on a live barricade shocks him back off it and does nothing to it; Shunt's own knife cuts it", async () => {
    const s = await lab();
    s.put("arc_pack", 1, [-10, 0.075, 5.75]);
    expect(liveSurfaces(s.sim).panels.has(s.panel("door_a").panel.spec.index)).toBe(true);
    s.teleport(0, -10, 0, 6.85);
    const hp = s.body(0).state.hp;
    const z = s.body(0).state.z;
    const hash = s.sim.level.panels.hash();
    s.knife(0, [-10, 1.2, 6.05]);
    expect(s.body(0).state.hp).toBe(hp - k.shock);
    expect(s.body(0).state.z).toBeGreaterThan(z + 0.3);
    expect(s.sim.level.panels.hash()).toBe(hash);
    // His own side's knife: no shock, and the barricade takes the cut.
    s.teleport(0, ...LAB.away[0]);
    s.teleport(1, -10, 0, 5.2);
    const own = s.body(1).state.hp;
    s.knife(1, [-10, 1.2, 5.95]);
    expect(s.body(1).state.hp).toBe(own);
    expect(s.sim.level.panels.hash()).not.toBe(hash);
  });

  it("an attacker's drone by a live pack is jammed; by one off under an EMP, not", async () => {
    const s = await lab();
    const pack = s.put("arc_pack", 1, [0, 0.075, 14]);
    s.room.spawnPilot(s.clients[0].id, null, 0, ATTACK);
    s.room.rosterChanged();
    s.wait(8);
    const drone = s.sim.dronesOf(s.ctrlOf(0)).find((p) => p.state.mode === PawnMode.Walk)!;
    s.sim.placeDrone(drone.id, 0.3, 0.02, 14, 0);
    s.wait(2);
    expect(drone.state.jammed).toBeGreaterThan(0);
    s.sim.placeDrone(drone.id, 4, 0.02, 14, 0);
    s.wait(ticks(k.droneJamS) + 2);
    expect(drone.state.jammed).toBe(0);
    emp(s, [0, 0.4, 14], 3);
    s.wait(1);
    expect(s.sim.gadgets.get(pack.id)!.flags & GFlag.Off).toBe(GFlag.Off);
    s.sim.placeDrone(drone.id, 0.3, 0.02, 14, 0);
    s.wait(2);
    expect(drone.state.jammed).toBe(0);
  });
});

describe("a bot playing Shunt (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  it("puts his packs at the feet of the walls the site's plan reinforces, in prep", async () => {
    const room = await Room.create("SHU", "millrace", { format: "bot_training", seed: 5 });
    const host = room.join("you", { send() {}, buffered: () => 0 })!;
    const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
    const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack: "blue", bots: { ...bt.match.bots!, size: [1, 5], site: "SITE_OFFICES" }, seconds: { ...bt.match.seconds, pick: 8, prep: 45, action: 180 } };
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
    const ops = ["shunt", "mute", "pulse", "lesion", "mira"];
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, i) => room.pickLoadout(p.id, botLoadout(data, ops[i])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    const shunt = room.bodyOf(bots[0].id)!;
    const packs = room.sim.gadgets.list.filter((g) => g.kind === kindOf("arc_pack") && g.owner === shunt.id);
    const walls = packs.map((g) => arcPanels(room.sim, g, k.reachM).filter((i) => room.sim.level.panels.list[i].panel.kind === "wall"));
    expect(packs.length, `doing ${room.botOf(bots[0].id)!.doing}`).toBeGreaterThanOrEqual(2);
    for (const w of walls) expect(w.length).toBeGreaterThan(0);
    // Each by a different wall.
    expect(new Set(walls.map((w) => w[0])).size).toBe(packs.length);
    expect(packs.every((g) => kindId(g.kind) === "arc_pack")).toBe(true);
  }, 300000);
});
