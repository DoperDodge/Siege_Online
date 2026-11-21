// Shunt's Arc Packs (Project Redmond R3, gadgets/R3_OPERATORS.md §2; anti hard breach, and tricking works, Ulo's): a
// pack on the floor by a reinforced wall section or a barricade makes it live. An attacker's device on a live surface is
// burnt out half a second after it's first found there, whether it went on while the surface was live or was there
// when a pack went live: so a pack picked up (Interact held) and put back catches a charge put on meanwhile ("tricking").
// Its detonator can't set off one on a live surface; one already set off isn't stopped. An EMP turns a pack off for its seconds. An attacker's knife on a live surface
// shocks him and does nothing to it; his drone by a pack is jammed. A bot playing Shunt puts his packs by the walls the
// site's plan reinforces.
import { describe, expect, it, vi } from "vitest";
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
  liveSpans,
  liveSurfaces,
  loadGameData,
  PawnMode,
  Phase,
  Room,
  TICK_HZ,
  ticks,
  type FormatMode,
  type Gadget,
  type Pawn,
  type Vec3,
} from "../src/index.js";
import { LAB, scene, type Scene } from "./interactions/harness.js";

const data = loadGameData();
const k = data.gadgets.get("arc_pack")!.arc!;
const burn = ticks(k.burnS);

/** Kiln (client 0, attacking) and Shunt (client 1, defending) on the Gadget Lab, out of the way. */
async function lab() {
  const s = await scene(["kiln", "shunt"], "gadget_lab");
  s.park();
  return s;
}

/**
 * At the reinforced wall's foot (its face toward +z at z −5.9), where Shunt puts his pack: by its right section (x 11.5
 * to 13), the one the charges go on (a pack makes only its own section live).
 */
const FOOT: Vec3 = [12.2, 0, -5.72];

/** Shunt (client 1) puts a pack down at the reinforced wall's foot from in front of it, as a player does, and steps away. */
function packDown(s: Scene): Gadget {
  s.teleport(1, 12.2, 0, -4.7);
  const g = s.plant(1, FOOT)!;
  expect(g).toBeDefined();
  s.teleport(1, ...LAB.away[1]);
  return g;
}

/** Kiln (client 0) puts his charge on the reinforced wall at x, as a player does, and steps back. */
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
    const far = s.put("arc_pack", 1, [12.2, 0.075, -5.9 + k.reachM + 0.2]);
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
    s.teleport(1, 12.2, 0, -4.7);
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
    // Back down before Kiln sets it off.
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
    s.put("arc_pack", 1, [12.2, 0.075, -5.72]);
    expect(liveSurfaces(s.sim).panels.size).toBe(1);
    s.wait(burn + 4);
    expect(gone(s, g)).toBe(false);
    s.wait(ticks(s.sim.data.gadgets.get("burn_frame")!.burnS!) + 8);
    expect(s.solidAt("reinforced", L_STEEL, [11.8, 1.0, -6])).toBe(false);
  });

  it("an EMP turns a pack off for its seconds: a charge put on meanwhile stays until it's on again", async () => {
    const s = await lab();
    const pack = s.put("arc_pack", 1, [12.2, 0.075, -5.72]);
    emp(s, [12.2, 0.4, -5.6], 6);
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
    const ops = ["shunt", "lull", "murmur", "thistle", "vista"];
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

describe("Shunt's packs and the attackers' other charges (R3_OPERATORS.md §3)", () => {
  it("burn out every attacker device on a live surface, there before the pack or put on after: a Breach Charge on a barricade; a Heavy Breach Charge, a Hailstone Drill and Rivet's salvo on the reinforced wall", async () => {
    const s = await lab();
    const on = (kind: string, id: string, at: Vec3) => s.put(kind, 0, at, s.onPanel(id, at));
    // Before any pack: a Heavy Breach Charge on the reinforced wall, a Breach Charge on the barricaded door's outside.
    const heavy = on("heavy_breach_charge", "reinforced", [12.6, 1.2, -5.9]);
    const breach = on("breach_charge", "door_a", [-10, 1.2, 6.05]);
    s.wait(burn + 8);
    expect([gone(s, heavy), gone(s, breach)]).toEqual([false, false]);
    packDown(s);
    s.put("arc_pack", 1, [-10, 0, 5.77]); // at the door's foot, inside
    expect(liveSurfaces(s.sim).panels.has(s.panel("door_a").panel.spec.index)).toBe(true);
    // After: a Hailstone Drill and a Spine on the live wall.
    const drill = on("hailstone_drill", "reinforced", [11.9, 1.2, -5.9]);
    const spine = on("stud_spine", "reinforced", [12.3, 0.95, -5.9]);
    s.wait(burn + 8);
    expect([heavy, breach, drill, spine].map((g) => gone(s, g))).toEqual([true, true, true, true]);
  });
});

describe("a drone stopped by a live pack (the review, R3)", () => {
  it("is jammed its 2 s, then can be driven off; no correction while it's there is counted as its pilot's misprediction", async () => {
    const s = await lab();
    s.put("arc_pack", 1, [0, 0.075, 14]);
    s.room.spawnPilot(s.clients[0].id, null, 0, ATTACK);
    s.room.rosterChanged();
    s.wait(8);
    const drone = s.sim.dronesOf(s.ctrlOf(0)).find((p) => p.state.mode === PawnMode.Walk)!;
    s.clients[0].cmd = { yaw: -Math.PI / 2 };
    s.sim.placeDrone(drone.id, 0.3, 0.02, 14, -90); // facing away from the pack (+x)
    s.wait(8);
    expect(drone.state.jammed).toBeGreaterThan(0);
    const mismatch = s.room.stats.mismatchCorrections;
    s.wait(ticks(k.droneJamS));
    const x0 = drone.state.x;
    s.clients[0].cmd = { forward: 1, yaw: -Math.PI / 2 };
    s.wait(TICK_HZ * 2);
    s.clients[0].cmd = { yaw: -Math.PI / 2 };
    expect(drone.state.x - x0).toBeGreaterThan(0.5);
    expect(s.room.stats.mismatchCorrections).toBe(mismatch);
  });
});

describe("a pack by a wall reinforced in part (the review, R3)", () => {
  /** The section of the Gadget Lab's 3 m reinforceable wall (reinforce_2: x −0.5 to 2.5, its face toward +z at z −5.9) at x. */
  const sectionAtX = (s: Scene, x: number) => {
    const e = s.panel("reinforce_2");
    const f = e.frame;
    return e.panel.sectionOf(Math.floor(((x - f.center[0]) * f.u[0] + (-5.9 - f.center[2]) * f.u[2] + f.w / 2) / e.panel.cellU));
  };

  it("electrifies the section it stands by, not the wall: a charge on the soft section stays and a knife there cuts it; by the soft one, it electrifies nothing", async () => {
    const s = await lab();
    const e = s.panel("reinforce_2");
    const on = (kind: string, at: Vec3) => s.put(kind, 0, at, s.onPanel("reinforce_2", at));
    // Steel up on its left half (x −0.5 to 1) only, and a pack at that half's foot.
    expect(sectionAtX(s, 0.2)).not.toBe(sectionAtX(s, 1.8));
    e.panel.apply({ kind: "reinforce", section: sectionAtX(s, 0.2), side: 1 });
    s.teleport(1, 0.2, 0, -4.7);
    const pack = s.plant(1, [0.2, 0, -5.72])!;
    s.teleport(1, ...LAB.away[1]);
    expect(arcPanels(s.sim, pack, k.reachM)).toEqual([e.panel.spec.index]);
    // What the clients draw live: that half only (its middle 0.75 m left of the wall's, 1.5 m wide; the face's u is +x).
    const spans = liveSpans(e, liveSurfaces(s.sim).panels.get(e.panel.spec.index)!);
    expect(spans.map(([mid, w]) => [+mid.toFixed(3), +w.toFixed(3)])).toEqual([[-0.75, 1.5]]);
    // An attacker's knife on the steel half shocks him; on the soft half, it doesn't, and cuts it.
    const hp = s.body(0).state.hp;
    s.teleport(0, 0.6, 0, -5.1);
    s.knife(0, [0.6, 1.2, -5.9]);
    expect(s.body(0).state.hp).toBe(hp - k.shock);
    s.teleport(0, 2.2, 0, -5.1);
    const hash = s.sim.level.panels.hash();
    s.knife(0, [2.2, 1.2, -5.9]);
    expect(s.body(0).state.hp).toBe(hp - k.shock);
    expect(s.sim.level.panels.hash()).not.toBe(hash);
    s.teleport(0, ...LAB.away[0]);
    // A Heavy Breach Charge on the steel half is burnt out; a Breach Charge on the soft half isn't.
    const steel = on("heavy_breach_charge", [0.2, 1.2, -5.9]);
    const soft = on("breach_charge", [1.8, 1.2, -5.9]);
    s.wait(burn + 8);
    expect([gone(s, steel), gone(s, soft)]).toEqual([true, false]);
    // A pack at the soft half's foot electrifies nothing: a charge on the steel half stays.
    s.sim.gadgets.remove(pack.id);
    s.teleport(1, 1.8, 0, -4.7);
    const by = s.plant(1, [1.8, 0, -5.72])!;
    s.teleport(1, ...LAB.away[1]);
    expect([arcPanels(s.sim, by, k.reachM), liveSurfaces(s.sim).panels.size]).toEqual([[], 0]);
    const later = on("heavy_breach_charge", [0.2, 1.2, -5.9]);
    s.wait(burn + 8);
    expect(gone(s, later)).toBe(false);
  });
});

describe("a charge on a live deployable shield (the review, R3)", () => {
  it("can't be set off and is burnt out, as on a live wall", async () => {
    const s = await scene(["hail", "shunt"], "destruction_lab");
    s.park();
    const shield = s.put("deployable_shield", 1, [0, 0.5, 13], { yaw: Math.PI });
    s.put("arc_pack", 1, [0.7, 0.075, 12.8]);
    expect(liveSurfaces(s.sim).gadgets.has(shield.id)).toBe(true);
    // Hail's Hailstone Drill on its face, from in front of it.
    s.teleport(0, 0, 0, 14.2);
    const g = s.plant(0, [0, 0.6, 13.06])!;
    expect([kindId(g.kind), g.panel]).toEqual(["hailstone_drill", -1]);
    s.detonate(0);
    expect([gone(s, g), s.sim.gadgets.get(g.id)!.flags & GFlag.Active]).toEqual([false, 0]);
    s.wait(burn);
    expect(gone(s, g)).toBe(true);
  });
});

describe("a knife on a live surface under the Attacker Safeguard (the review, R3)", () => {
  it("does nothing to the attacker (no damage, not thrown back), and nothing to the surface", async () => {
    const s = await lab();
    // Quick Match's safeguard (the director's; a lab has none) said to cover Kiln.
    vi.spyOn(s.room as unknown as { safeguarded(p: Pawn): boolean }, "safeguarded").mockImplementation((p) => p === s.body(0));
    s.put("arc_pack", 1, [-10, 0.075, 5.75]);
    s.teleport(0, -10, 0, 6.85);
    const hp = s.body(0).state.hp;
    const z = s.body(0).state.z;
    const hash = s.sim.level.panels.hash();
    s.knife(0, [-10, 1.2, 6.05]);
    expect(s.body(0).state.hp).toBe(hp);
    expect(s.body(0).state.z).toBeLessThan(z + 0.1);
    expect(s.sim.level.panels.hash()).toBe(hash);
  });
});
