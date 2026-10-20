// Presentation pieces that run without a GPU (Phase 3 M9): placeholder guns for every weapon and attachment
// in the data, the effects bus's pools, and that a correction's replay never repeats an effect. The level's
// scene (Phase 5): static boxes instanced per material and storey, labels per scene and storey, the sun
// fitted to the level, and nothing that moves casting a shadow.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  BARRELS,
  Btn,
  buildLevel,
  ByteReader,
  ClientSession,
  decodeInput,
  decodeLabTool,
  defaultLoadoutPick,
  DT,
  encodeLabTool,
  GRIPS,
  initialPawnState,
  initRapier,
  isGun,
  L_FRONT,
  levelSchema,
  loadGameData,
  Msg,
  offerId,
  QUERY_BULLET,
  resolveLoadout,
  Room,
  SIGHTS,
  Sim,
  Stance,
  UNDERBARRELS,
  type BuiltLevel,
  type GameEvent,
  type IndexedOp,
  type Renderable,
  type SimEvent,
  type Vec3,
} from "@redmond/shared";
import { FxBus, type AudioSink } from "../src/render/fxBus.js";
import { buildGun, gunKey, type GunLook } from "../src/render/gunKit.js";
import { createLabScene, PawnView, storeyOf, SURFACE_COLORS, updateLabels, type LabScene } from "../src/render/labScene.js";

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

/** createLabScene draws its labels and the labs' floor texture on canvases, which Node lacks: these draw nothing. */
function stubCanvases() {
  const g = new Proxy({}, { get: (_t, key) => (key === "measureText" ? (text: string) => ({ width: 12 * text.length }) : () => {}) });
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
}

/** A small map built as the game builds one: three storeys with boxes of each kind on each, panels, and bounds. */
async function storeyLevel(): Promise<BuiltLevel> {
  const R = await initRapier();
  const def = levelSchema.parse({
    id: "storeys",
    name: "Storeys",
    spawns: [{ id: "s0", pos: [0, 0, 0], yawDeg: 0 }],
    bounds: { min: [-60, -12, -30], max: [60, 10, 30], killY: -20 },
    storeys: [
      { id: "B", floorY: -3.2, ceilingY: -0.2 },
      { id: "1F", floorY: 0, ceilingY: 3 },
      { id: "2F", floorY: 3.2, ceilingY: 6 },
    ],
    solids: [
      { id: "floor", center: [0, -0.1, 0], size: [40, 0.2, 40], surface: "HARD_FLOOR" },
      { id: "b_slab", center: [10, -3.3, 0], size: [8, 0.2, 8], surface: "HARD_FLOOR" },
      { id: "b_wall", center: [10, -1.7, 4], size: [8, 3, 0.2], surface: "HARD_WALL", label: "B wall" },
      { id: "deep", center: [0, -10, 0], size: [1, 1, 1], surface: "PROP" },
      { id: "f1_slab", center: [10, -0.1, 10], size: [6, 0.2, 6], surface: "HARD_FLOOR" },
      { id: "f1_wall", center: [10, 1.5, 14], size: [6, 3, 0.2], yawDeg: 30, surface: "HARD_WALL", label: "1F wall" },
      { id: "f2_slab", center: [10, 3.1, 10], size: [6, 0.2, 6], surface: "HARD_FLOOR" },
      { id: "f2_wall", center: [-10, 4.7, 0], size: [0.2, 3, 6], yawDeg: 90, surface: "HARD_WALL" },
      { id: "f2_prop", center: [-10, 3.7, 3], size: [1, 1, 1], yawDeg: 45, surface: "PROP", label: "2F prop" },
      { id: "blocker", center: [0, 1, -15], size: [4, 2, 0.2], surface: "HARD_WALL", bodiesOnly: true },
      { id: "soft", center: [-5, 1.5, -10], size: [3, 3, 0.2], surface: "SOFT_WALL", label: "Soft" },
      { id: "reinf_3", center: [0, 1.5, -10], size: [4.5, 3, 0.2], surface: "REINFORCEABLE", panel: { sections: 3 } },
      { id: "reinf_1", center: [5, 1.5, -10], size: [1.5, 3, 0.2], surface: "REINFORCEABLE", label: "Kitchen", panel: { sections: 1 } },
    ],
    ramps: [{ id: "ramp", start: [-15, 0, 10], yawDeg: 20, length: 4, angleDeg: 20, width: 2, surface: "HARD_FLOOR" }],
    stairs: [{ id: "st", start: [15, 0, -15], yawDeg: 90, steps: 4, rise: 0.2, run: 0.3, width: 1.2, surface: "HARD_FLOOR" }],
    ladders: [{ id: "lad", base: [-15, 0, -15], height: 2.5, yawDeg: 0, width: 0.5 }],
  });
  return buildLevel(R, new R.World({ x: 0, y: -9.81, z: 0 }), def, data.destruction);
}

const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5));
/** A renderable's eight corners in the world, worked out from its box (not through a matrix). */
const corners = (r: Renderable) =>
  CORNERS.map((c) => c.clone().multiply(new THREE.Vector3(...r.size)).applyQuaternion(new THREE.Quaternion(...r.quat)).add(new THREE.Vector3(...r.center)));
/** Instance `k`'s corners: the unit box through its matrix. */
const instanceCorners = (mesh: THREE.InstancedMesh, k: number) => {
  const m = mesh.getMatrixAt(k, new THREE.Matrix4());
  return CORNERS.map((c) => c.clone().applyMatrix4(m));
};
const sameBox = (a: THREE.Vector3[], b: THREE.Vector3[]) => a.every((p, i) => p.distanceTo(b[i]) < 1e-4);
const instanced = (g: THREE.Object3D) => g.children.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh);

describe("level scene", () => {
  beforeAll(stubCanvases);
  afterAll(() => vi.unstubAllGlobals());

  it("bins a box by its bottom: the last storey whose floor, less 0.25 m, is at or below it, else the first", () => {
    const storeys = [{ floorY: -3.2 }, { floorY: 0 }, { floorY: 3.2 }];
    expect(storeyOf(storeys, -10)).toBe(0);
    expect(storeyOf(storeys, -3.4)).toBe(0);
    expect(storeyOf(storeys, -0.2)).toBe(1); // 1F's own slab, hanging under its floor
    expect(storeyOf(storeys, -0.3)).toBe(0);
    expect(storeyOf(storeys, 2.96)).toBe(2);
    expect(storeyOf(storeys, 2.9)).toBe(1);
    expect(storeyOf(storeys, 50)).toBe(2);
    expect(storeyOf([], 5)).toBe(0);
  });

  it("draws every static box instanced, one mesh per material and storey, each instance exactly its box", async () => {
    const level = await storeyLevel();
    const lab = createLabScene(level);
    expect(lab.storeys.map((g) => g.name)).toEqual(["storey:B", "storey:1F", "storey:2F"]);
    for (const g of lab.storeys) expect(g.parent).toBe(lab.scene);
    // Under B's floor or on it; on 2F; everything else (steps, ramp, ladder too) on 1F.
    const storeyOfBox: Record<string, string> = { b_slab: "B", b_wall: "B", deep: "B", f2_slab: "2F", f2_wall: "2F", f2_prop: "2F" };
    const drawn = level.renderables.filter((r) => r.visible && r.kind !== "panel" && r.id !== "floor");
    expect(drawn.map((r) => r.kind)).toEqual(expect.arrayContaining(["solid", "stair_step", "ramp", "ladder_rail", "ladder_rung"]));
    const left = new Map(lab.storeys.flatMap(instanced).map((m) => [m, new Set(Array.from({ length: m.count }, (_, k) => k))]));
    for (const r of drawn) {
      const storey = lab.storeys.find((g) => g.name === `storey:${storeyOfBox[r.id] ?? "1F"}`)!;
      const mesh = instanced(storey).find((m) => m.name === r.surface);
      expect(mesh, r.id).toBeDefined();
      expect((mesh!.material as THREE.MeshStandardMaterial).color.getHex()).toBe(new THREE.Color(SURFACE_COLORS[r.surface]).getHex());
      const k = [...left.get(mesh!)!].find((i) => sameBox(instanceCorners(mesh!, i), corners(r)));
      expect(k, `${r.id}'s instance`).toBeDefined();
      left.get(mesh!)!.delete(k!);
    }
    // Nothing else is drawn: not the invisible blocker or the stairs' ramp, not the panels.
    for (const rest of left.values()) expect(rest.size).toBe(0);
    expect(lab.staticBoxes).toBe(drawn.length);
    for (const g of lab.storeys) {
      const meshes = instanced(g);
      expect(new Set(meshes.map((m) => m.material)).size).toBe(meshes.length);
      for (const m of meshes) {
        expect([m.castShadow, m.receiveShadow]).toEqual([true, true]);
        // Frustum culling tests a sphere that holds all of the mesh's boxes.
        expect(m.boundingSphere).not.toBeNull();
        for (let k = 0; k < m.count; k++) for (const c of instanceCorners(m, k)) expect(m.boundingSphere!.distanceToPoint(c)).toBeLessThanOrEqual(1e-4);
      }
    }
    // The textured floor: a plain mesh of its own on its storey, its texture repeated to its size, casting
    // nothing (there's nothing under it).
    const plain = lab.storeys.flatMap((g) => g.children.filter((m) => !(m instanceof THREE.InstancedMesh)));
    expect(plain).toHaveLength(1);
    const floor = plain[0] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
    expect(floor.parent!.name).toBe("storey:1F");
    expect(floor.geometry.parameters).toMatchObject({ width: 40, height: 0.2, depth: 40 });
    expect(floor.position.toArray()).toEqual([0, -0.1, 0]);
    expect(floor.material.map!.repeat.toArray()).toEqual([20, 20]);
    expect([floor.castShadow, floor.receiveShadow]).toEqual([false, true]);
    expect(lab.staticMeshes).toBe(lab.storeys.flatMap(instanced).length + 1);
  });

  it("a lab without storeys draws in one group: a few instanced meshes and its textured floor", async () => {
    const sim = await Sim.create("movement_lab");
    const lab = createLabScene(sim.level);
    expect(lab.storeys.map((g) => g.name)).toEqual(["storey:all"]);
    const drawn = sim.level.renderables.filter((r) => r.visible && r.kind !== "panel" && r.id !== "floor");
    const meshes = instanced(lab.storeys[0]);
    expect(meshes.reduce((n, m) => n + m.count, 0)).toBe(drawn.length);
    expect(new Set(meshes.map((m) => m.name))).toEqual(new Set(drawn.map((r) => r.surface)));
    expect(meshes.length).toBeLessThan(drawn.length / 4);
    const floor = lab.storeys[0].children.filter((m) => !(m instanceof THREE.InstancedMesh)) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[];
    expect(floor).toHaveLength(1);
    expect(floor[0].material.map).not.toBeNull();
  });

  it("each scene owns its labels, each with its storey; a reinforceable wall's label says how many sections it has", async () => {
    const level = await storeyLevel();
    const a = createLabScene(level);
    const b = createLabScene(level);
    const names = (lab: LabScene) => lab.labels.map((l) => l.name).sort();
    expect(names(a)).toEqual(["1F wall", "2F prop", "3 sections", "B wall", "Kitchen · 1 section", "Soft"]);
    // Building a second scene took nothing from the first, and the two share no sprite.
    expect(names(b)).toEqual(names(a));
    // A label goes in its storey's label group (a map shows only the storey you're on), as its box is binned.
    expect(a.labelGroups.map((g) => g.name)).toEqual(["labels:B", "labels:1F", "labels:2F"]);
    const storeyOfLabel: Record<string, string> = { "B wall": "B", "2F prop": "2F" };
    for (const lab of [a, b])
      for (const l of lab.labels) {
        expect(l.parent!.name).toBe(`labels:${storeyOfLabel[l.name] ?? "1F"}`);
        expect(l.parent!.parent).toBe(lab.scene);
      }
    expect(a.labels.some((l) => b.labels.includes(l))).toBe(false);
    // No rooms, no callouts; a lab without storeys keeps all its labels in one group.
    expect(a.callouts).toEqual([]);
    const lab = createLabScene((await Sim.create("destruction_lab")).level);
    expect(lab.labelGroups.map((g) => g.name)).toEqual(["labels:all"]);
    expect(lab.labels.length).toBeGreaterThan(5);
    for (const l of lab.labels) expect(l.parent).toBe(lab.labelGroups[0]);
    // Hiding the labels next to the camera touches only the scene asked about.
    const soft = a.labels.find((l) => l.name === "Soft")!;
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(soft.position).add(new THREE.Vector3(0, 0, 1));
    updateLabels(a.labels, camera);
    expect(a.labels.filter((l) => !l.visible).map((l) => l.name)).toEqual(["Soft"]);
    expect(b.labels.every((l) => l.visible)).toBe(true);
  });

  it("every reinforceable wall in the Destruction Lab counts its sections, from its built panel", async () => {
    const sim = await Sim.create("destruction_lab");
    const names = createLabScene(sim.level).labels.map((l) => l.name);
    const walls = sim.level.def.solids.filter((s) => s.surface === "REINFORCEABLE" || s.surface === "REINFORCED_WALL");
    expect(walls.length).toBeGreaterThan(5);
    for (const s of walls) {
      const n = sim.level.panels.byId.get(s.id)!.panel.spec.sections;
      expect(names).toContain(`${s.label} · ${n} section${n === 1 ? "" : "s"}`);
    }
    expect(names).toContain("Reinforceable · 3 sections");
    expect(names).toContain("Reinforceable · 2 sections");
    expect(names).toContain("Oregon: Dining | Kitchen · 1 section");
    // Every other label is as the level gives it.
    for (const s of sim.level.def.solids) if (s.label && !walls.includes(s)) expect(names).toContain(s.label);
  });

  it("fits the sun's shadow to the level and keeps its direction: a lab's boxes, a map's bounds", async () => {
    const sunOf = (lab: LabScene) => lab.scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
    /** Every point inside the shadow camera's box, and the sun in its usual direction. */
    const covers = (sun: THREE.DirectionalLight, points: THREE.Vector3[]) => {
      const cam = sun.shadow.camera;
      for (const p of points) {
        const v = p.clone().applyMatrix4(cam.matrixWorldInverse);
        expect(v.x).toBeGreaterThanOrEqual(cam.left);
        expect(v.x).toBeLessThanOrEqual(cam.right);
        expect(v.y).toBeGreaterThanOrEqual(cam.bottom);
        expect(v.y).toBeLessThanOrEqual(cam.top);
        expect(-v.z).toBeGreaterThanOrEqual(cam.near);
        expect(-v.z).toBeLessThanOrEqual(cam.far);
      }
      expect(sun.position.clone().sub(sun.target.position).normalize().distanceTo(new THREE.Vector3(18, 30, 12).normalize())).toBeLessThan(1e-9);
      expect(sun.target.parent).toBe(sun.parent); // in the scene, so the shadow pass aims where we measured from
    };
    const sim = await Sim.create("movement_lab");
    const lab = sunOf(createLabScene(sim.level));
    covers(lab, sim.level.renderables.filter((r) => r.visible).flatMap(corners));
    expect(lab.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    // A map: its bounds (120 m across, so a 4096 map), even where nothing stands near their corners.
    const level = await storeyLevel();
    const map = sunOf(createLabScene(level));
    const b = level.def.bounds!;
    covers(map, CORNERS.map((c) => new THREE.Vector3(c.x < 0 ? b.min[0] : b.max[0], c.y < 0 ? b.min[1] : b.max[1], c.z < 0 ? b.min[2] : b.max[2])));
    expect(map.shadow.mapSize.toArray()).toEqual([4096, 4096]);
    // The bias is the same distance whatever the depth the camera spans.
    const biasM = (sun: THREE.DirectionalLight) => sun.shadow.bias * (sun.shadow.camera.far - sun.shadow.camera.near);
    expect(biasM(map)).toBeCloseTo(biasM(lab), 9);
  });
});

describe("shadows", () => {
  it("nothing that moves casts one: bodies, the guns they hold, effects; in first person the body isn't drawn", async () => {
    const scene = new THREE.Scene();
    const view = new PawnView(scene, 0x3b82f6);
    const { loadout } = resolveLoadout(data, defaultLoadoutPick(data, "sledge"));
    const w = loadout.weapons[0];
    view.setWeapon({ class: w.class, pick: { sight: w.pick.sight, barrel: w.pick.barrel, grip: w.pick.grip, underbarrel: "laser" } });
    view.update(data, initialPawnState(0, 0, 0, 0, 100, loadout));
    new FxBus(scene, await Sim.create("movement_lab"));
    let meshes = 0;
    scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      meshes++;
      expect(o.castShadow).toBe(false);
    });
    expect(meshes).toBeGreaterThan(100);
    const drawnMeshes = () => {
      const out: THREE.Object3D[] = [];
      view.body.traverseVisible((o) => void ((o as THREE.Mesh).isMesh && out.push(o)));
      return out;
    };
    expect(drawnMeshes().length).toBeGreaterThan(20);
    // First person: neither the capsules nor the gun it holds are drawn, but the body stays, laser and all.
    view.setFirstPerson(true);
    expect(drawnMeshes()).toEqual([]);
    expect(view.body.visible).toBe(true);
    expect(view.laserOrigin()).not.toBeNull();
  });
});
