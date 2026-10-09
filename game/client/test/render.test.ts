// Presentation pieces that run without a GPU (Phase 3 M9): placeholder guns for every weapon and attachment
// in the data, the effects bus's pools, and that a correction's replay never repeats an effect.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BARRELS,
  Btn,
  ByteReader,
  ClientSession,
  decodeInput,
  decodeLabTool,
  DT,
  encodeLabTool,
  GRIPS,
  isGun,
  L_FRONT,
  loadGameData,
  Msg,
  offerId,
  QUERY_BULLET,
  Room,
  SIGHTS,
  Sim,
  Stance,
  UNDERBARRELS,
  type GameEvent,
  type IndexedOp,
  type SimEvent,
  type Vec3,
} from "@redmond/shared";
import { FxBus, type AudioSink } from "../src/render/fxBus.js";
import { buildGun, gunKey, type GunLook } from "../src/render/gunKit.js";

const data = loadGameData();

describe("placeholder guns (gun_kit.json)", () => {
  it("every weapon builds bare and with each attachment it offers; the muzzle is ahead of the sight", () => {
    let built = 0;
    for (const w of data.weapons.values()) {
      if (!isGun(w)) continue; // the shield has its own look (Phase 8)
      const offers = { sight: w.attachments.sights.map(offerId), barrel: w.attachments.barrels.map(offerId), grip: w.attachments.grips.map(offerId), underbarrel: w.attachments.underbarrel.map(offerId) };
      const bare: GunLook["pick"] = { sight: null, barrel: null, grip: null, underbarrel: null };
      const looks: GunLook[] = [{ class: w.class, pick: bare }, ...(Object.entries(offers) as [keyof GunLook["pick"], string[]][]).flatMap(([slot, ids]) => ids.map((id) => ({ class: w.class, pick: { ...bare, [slot]: id } })))];
      for (const look of looks) {
        const g = buildGun(look);
        expect(g.group.children.length).toBeGreaterThan(3);
        expect(g.muzzle.z).toBeLessThan(g.sight.z);
        expect(g.laser !== null).toBe(look.pick.underbarrel === "laser");
        // A barrel attachment sits on the end: the muzzle moves forward.
        if (look.pick.barrel) expect(g.muzzle.z).toBeLessThan(buildGun({ ...look, pick: bare }).muzzle.z);
        g.dispose();
        expect(g.group.parent).toBeNull();
        built++;
      }
    }
    expect(built).toBeGreaterThan(data.weapons.size * 2);
  });

  it("every attachment token and weapon class has a look; the sights show what they should", () => {
    const pick = (sight: string) => buildGun({ class: "assault_rifle", pick: { sight, barrel: null, grip: null, underbarrel: null } });
    for (const s of SIGHTS) expect(() => pick(s)).not.toThrow();
    expect(pick("iron").reticle).toBe("posts");
    expect(pick("nonmag").reticle).not.toBe("posts");
    for (const b of BARRELS) buildGun({ class: "smg", pick: { sight: null, barrel: b, grip: null, underbarrel: null } });
    for (const g of GRIPS) buildGun({ class: "lmg", pick: { sight: null, barrel: null, grip: g, underbarrel: null } });
    for (const u of UNDERBARRELS) expect(buildGun({ class: "handgun", pick: { sight: null, barrel: null, grip: null, underbarrel: u } }).laser).not.toBeNull();
    // A different weapon or attachment is a different model.
    const a: GunLook = { class: "smg", pick: { sight: "nonmag", barrel: null, grip: null, underbarrel: null } };
    expect(gunKey(a)).not.toBe(gunKey({ ...a, pick: { ...a.pick, barrel: "suppressor" } }));
    expect(gunKey(a)).not.toBe(gunKey({ ...a, class: "lmg" }));
  });
});

/** Counts what the effects bus asks to be heard: one sound per effect it fires. */
function ear(): AudioSink & { heard: string[] } {
  const heard: string[] = [];
  return { heard, play: (name) => void heard.push(name) };
}

/** A level with its queries ready, and a point on a wall straight ahead of (0, 1.2, 4) along +Z. */
async function level() {
  const sim = await Sim.create("movement_lab");
  sim.step(new Map());
  const hit = sim.world.castRay(new sim.R.Ray({ x: 0, y: 1.2, z: 4 }, { x: 0, y: 0, z: 1 }), 100, true, undefined, QUERY_BULLET)!;
  const wall: Vec3 = [0, 1.2, 4 + hit.timeOfImpact];
  return { sim, wall };
}

describe("effects bus", () => {
  it("pools never grow: a thousand shots later the scene holds the same objects", async () => {
    const { sim, wall } = await level();
    const scene = new THREE.Scene();
    const fx = new FxBus(scene, sim);
    const objects = scene.children.length;
    const before = fx.counts;
    const muzzle = () => new THREE.Vector3(0, 1.2, 4);
    // Shots into the outer wall (bullet marks) and into the open (none), from others and from us.
    for (let i = 0; i < 1000; i++) {
      const end: Vec3 = i % 3 === 0 ? [0, 30, 4] : [wall[0] + (i % 7) * 0.1, wall[1], wall[2]]; // into the sky, or onto the wall
      fx.server(i, [{ kind: "shotFx", pawnId: i % 2 ? 5 : 1, slot: 0, suppressed: i % 5 === 0, ends: [end, end] }]);
      fx.own([{ kind: "shot", pawnId: 1, slot: 0, seq: i, origin: [0, 1.2, 4], yaw: 0, pitch: 0, cone: 0, pellets: 1 } as SimEvent], [1], muzzle, i * 16, () => false);
      fx.update(i * 16, i + 1, [1], muzzle, () => muzzle());
    }
    expect(scene.children.length).toBe(objects);
    const after = fx.counts;
    expect([after.decals, after.tracers, after.flashes, after.lights]).toEqual([before.decals, before.tracers, before.flashes, before.lights]);
    expect(after.decalsShown).toBeGreaterThan(0);
    expect(after.decalsShown).toBeLessThanOrEqual(after.decals);
    expect(after.pending).toBe(0);
    // Long after, the short-lived ones are gone; the marks stay.
    fx.update(1e9, 1e9, [1], muzzle, () => muzzle());
    expect([fx.counts.tracersShown, fx.counts.flashesShown, fx.counts.lightsOn]).toEqual([0, 0, 0]);
    expect(fx.counts.decalsShown).toBe(after.decalsShown);
  });

  it("a remote shot shows when the frame on screen reaches its tick; a suppressed one leaves no flash or tracer", async () => {
    const { sim, wall } = await level();
    const audio = ear();
    const fx = new FxBus(new THREE.Scene(), sim, audio);
    const at = () => new THREE.Vector3(0, 1.2, 4);
    fx.server(100, [{ kind: "shotFx", pawnId: 5, slot: 0, suppressed: false, ends: [wall] }]);
    fx.update(0, 95, [1], at, at);
    expect(fx.counts).toMatchObject({ pending: 1, tracersShown: 0 });
    fx.update(16, 100, [1], at, at);
    expect(fx.counts).toMatchObject({ pending: 0, tracersShown: 1, flashesShown: 1, lightsOn: 1, decalsShown: 1 });
    fx.server(200, [{ kind: "shotFx", pawnId: 5, slot: 0, suppressed: true, ends: [[wall[0] + 0.3, wall[1], wall[2]]] }]);
    fx.update(1000, 200, [1], at, at);
    expect(fx.counts).toMatchObject({ tracersShown: 0, flashesShown: 0, lightsOn: 0, decalsShown: 2 });
    expect(audio.heard).toEqual(["shot"]); // the suppressed one: no sound hook until audio arrives (Phase 11)
  });

  it("a hidden tab (no frames) keeps only the newest shots, and draws none over a second old when it comes back", async () => {
    const { sim, wall } = await level();
    const audio = ear();
    const fx = new FxBus(new THREE.Scene(), sim, audio);
    const at = () => new THREE.Vector3(0, 1.2, 4);
    for (let t = 0; t < 1000; t++) fx.server(t, [{ kind: "shotFx", pawnId: 5, slot: 0, suppressed: false, ends: [wall] }]);
    expect(fx.counts.pending).toBe(256);
    fx.update(0, 1000 + 64 + 1, [1], at, at); // back: the frame on screen is well past all of them
    expect(fx.counts).toMatchObject({ pending: 0, tracersShown: 0, flashesShown: 0, decalsShown: 0 });
    expect(audio.heard).toEqual([]);
  });
});

describe("no repeated effects when a correction replays our inputs", () => {
  it("a shot predicted once is drawn once, though a correction re-simulates its tick", async () => {
    // Room and client in one process, 3 ticks each way (≈ 100 ms round trip).
    const room = await Room.create("TEST1", "movement_lab", { lab: true, seed: 1 });
    const clock = { t: 0, tick: 0 };
    const toClient: { at: number; b: Uint8Array }[] = [];
    const toServer: { at: number; b: Uint8Array }[] = [];
    const local: SimEvent[][] = [];
    const audio = ear();
    let fx: FxBus | null = null;
    const session = new ClientSession({
      send: (b) => toServer.push({ at: clock.tick + 3, b }),
      now: () => clock.t,
      onLocalEvents: (evs) => {
        local.push([...evs]);
        fx?.own(evs, session.ctrl!.pawnIds, () => new THREE.Vector3(), clock.t, () => false);
      },
      onEvents: (_t: number, _e: GameEvent[]) => {},
    });
    const id = room.join("p0", { send: (b) => toClient.push({ at: clock.tick + 3, b }), buffered: () => 0 }, "sledge")!;
    const due = (q: { at: number; b: Uint8Array }[]) => {
      const n = q.findIndex((m) => m.at > clock.tick);
      return q.splice(0, n < 0 ? q.length : n).map((m) => m.b);
    };
    const step = (buttons = 0) => {
      clock.t += DT * 1000;
      clock.tick++;
      if (session.ready) session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons, stance: Stance.Stand, lean: 0 });
      for (const b of due(toServer)) {
        const r = new ByteReader(b.subarray(1));
        if (b[0] === Msg.Input) room.onInput(id, decodeInput(r));
        else if (b[0] === Msg.LabTool) room.onLabTool(id, decodeLabTool(r));
      }
      room.step();
      for (const b of due(toClient)) session.handle(b);
    };
    for (let i = 0; i < 4; i++) step();
    await session.loaded();
    const sim = session.sim!;
    fx = new FxBus(new THREE.Scene(), sim, audio);
    for (let i = 0; i < 60; i++) step();
    expect(session.ready).toBe(true);
    // Count every shot the client's simulation produces, replays included.
    let simulated = 0;
    const realStep = sim.step.bind(sim);
    sim.step = (inputs) => {
      realStep(inputs);
      simulated += sim.events.filter((e) => e.kind === "shot").length;
    };
    // The server hurts us, and we fire two ticks later: its forced correction, made before our shot reached
    // it, arrives after we predicted the shot, and we replay the shot's tick on top of it.
    toServer.push({ at: clock.tick + 3, b: encodeLabTool({ kind: "damage", pawnId: session.ctrl!.possessedPawnId, amount: 5, kill: false }) });
    const corrections = session.stats.corrections;
    step();
    step(Btn.Fire);
    for (let i = 0; i < 20; i++) step();
    expect(session.stats.corrections).toBe(corrections + 1);
    expect(simulated).toBeGreaterThanOrEqual(2); // predicted, then simulated again in the correction's replay
    expect(local.flat().filter((e) => e.kind === "shot")).toHaveLength(1);
    expect(audio.heard.filter((n) => n === "shot")).toHaveLength(1);
  });

  it("a broken panel throws a few chunks that fall and are gone within a second; the pool never grows", async () => {
    const { sim } = await level();
    const scene = new THREE.Scene();
    const fx = new FxBus(scene, sim);
    const objects = scene.children.length;
    const ops: IndexedOp[] = [{ panel: 0, op: { kind: "cut", layer: L_FRONT, shape: { kind: "rect", u0: 5, v0: 5, u1: 25, v1: 25 }, hard: false } }];
    for (let k = 0; k < 50; k++) fx.panels(ops, [sim.level.panels.apply(0, { kind: "cut", layer: L_FRONT, shape: { kind: "rect", u0: k % 30, v0: 0, u1: (k % 30) + 2, v1: 40 }, hard: false })], 1000);
    fx.update(1000, 0, [], () => new THREE.Vector3(), () => null);
    const shown = fx.counts.debrisShown;
    expect(shown).toBeGreaterThan(0);
    expect(fx.counts.debris).toBe(96);
    expect(scene.children.length).toBe(objects);
    const chunk = scene.children.find((c) => c.visible && (c as THREE.Mesh).geometry?.type === "BoxGeometry")!;
    const y0 = chunk.position.y;
    for (let t = 1016; t < 1600; t += 16) fx.update(t, 0, [], () => new THREE.Vector3(), () => null);
    expect(chunk.position.y).toBeLessThan(y0);
    for (let t = 1600; t < 2100; t += 16) fx.update(t, 0, [], () => new THREE.Vector3(), () => null);
    expect(fx.counts.debrisShown).toBe(0);
  });
});
