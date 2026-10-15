// Panels drawn from their cells (Phase 4 M3, render/panelView.ts), without a GPU: an intact wall is its two
// skins, together the exact size of its level solid; the studs show only around a hole; a hole redraws only
// that panel; steel sits on the side it went up from, over that side's skin; a reinforceable wall shows its
// section seams on both faces (Phase 5).
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { L_BACK, L_CORE, L_FRONT, Sim, type PanelOp } from "@redmond/shared";
import { PanelView } from "../src/render/panelView.js";

/** Each panel's group in the scene, by panel index (PanelView adds them first, in order). */
const groups = (scene: THREE.Scene) => scene.children.filter((c): c is THREE.Group => (c as THREE.Group).isGroup && c.children.every((m) => (m as THREE.Mesh).visible));
const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe("panel view", () => {
  it("an intact wall is its two skins in its solid's box; a hole shows the studs around it and redraws just that panel", async () => {
    const sim = await Sim.create("movement_lab");
    const scene = new THREE.Scene();
    const view = new PanelView(scene, sim.level.panels);
    const [soft, reinforceable] = groups(scene);
    // Two skins and the caps closing the gap between them at the edges (the studs inside can't be seen, and a
    // reinforceable wall that isn't reinforced draws no steel, only its section seams).
    expect(soft.children.length).toBe(3);
    expect(reinforceable.children.length).toBe(4);
    const b = box(soft);
    const s = sim.level.def.solids.find((x) => x.id === "sample_soft")!;
    for (let k = 0; k < 3; k++) {
      expect(b.min.getComponent(k)).toBeCloseTo(s.center[k] - s.size[k] / 2, 6);
      expect(b.max.getComponent(k)).toBeCloseTo(s.center[k] + s.size[k] / 2, 6);
    }
    // Not hollow: looking along it from its end, or down on its top, between the skins meets the wall.
    scene.updateMatrixWorld(true);
    const [lx, , lz] = s.size[0] >= s.size[2] ? [1, 0, 0] : [0, 0, 1];
    const end = new THREE.Vector3(s.center[0] - lx * (s.size[0] / 2 + 1), s.center[1], s.center[2] - lz * (s.size[2] / 2 + 1));
    const meets = (from: THREE.Vector3, dir: THREE.Vector3) => new THREE.Raycaster(from, dir).intersectObjects(soft.children)[0]?.distance;
    expect(meets(end, new THREE.Vector3(lx, 0, lz))).toBeCloseTo(1, 6);
    expect(meets(new THREE.Vector3(s.center[0], s.center[1] + s.size[1] / 2 + 1, s.center[2]), new THREE.Vector3(0, -1, 0))).toBeCloseTo(1, 6);
    const front = soft.children[0] as THREE.Mesh;
    const before = front.geometry.getAttribute("position").count;
    const otherGeometry = (reinforceable.children[0] as THREE.Mesh).geometry;
    const cut: PanelOp = { kind: "cut", layer: L_FRONT, shape: { kind: "rect", u0: 10, v0: 10, u1: 20, v1: 20 }, hard: false };
    sim.level.panels.apply(0, cut);
    view.update();
    expect((soft.children[0] as THREE.Mesh).geometry.getAttribute("position").count).toBeGreaterThan(before);
    expect(soft.children.length).toBe(4); // the stud behind the hole shows (cells 10–20 across: the one at 0.40 m)
    expect((reinforceable.children[0] as THREE.Mesh).geometry).toBe(otherGeometry);
    // Shot through every layer down to nothing: the skins and studs go, nothing is left to draw.
    for (const layer of [L_FRONT, L_CORE, L_BACK]) sim.level.panels.apply(0, { kind: "cut", layer, shape: { kind: "rect", u0: 0, v0: 0, u1: 40, v1: 50 }, hard: false });
    view.update();
    expect(soft.children.length).toBe(0);
  });

  it("a panel started over (a reset) is redrawn even at the version it was drawn at", async () => {
    const sim = await Sim.create("movement_lab");
    const scene = new THREE.Scene();
    const view = new PanelView(scene, sim.level.panels);
    const soft = groups(scene)[0];
    const cut: PanelOp = { kind: "cut", layer: L_FRONT, shape: { kind: "rect", u0: 0, v0: 0, u1: 40, v1: 50 }, hard: false };
    // Which skins are drawn, by where each mesh sits through the 20 cm wall (local z: the front skin is at −0.1…−0.08).
    const skins = () =>
      soft.children.map((m) => {
        const g = (m as THREE.Mesh).geometry;
        g.computeBoundingBox();
        return g.boundingBox!.max.z < -0.07 ? "front" : g.boundingBox!.min.z > 0.07 ? "back" : "core";
      });
    sim.level.panels.apply(0, cut);
    view.update();
    expect(skins()).toEqual(["core", "back"]);
    sim.level.panels.reset(0);
    sim.level.panels.apply(0, { kind: "cut", layer: L_BACK, shape: { kind: "rect", u0: 0, v0: 0, u1: 40, v1: 50 }, hard: false }); // version 1 again
    view.update();
    expect(skins()).toEqual(["front", "core"]);
  });

  it("redrawing a shot-up wall takes well under a frame on the main thread (PLAN §8.2 budget)", async () => {
    const sim = await Sim.create("destruction_lab");
    const scene = new THREE.Scene();
    const view = new PanelView(scene, sim.level.panels);
    const e = sim.level.panels.byId.get("reinforce_3")!; // 4.5 × 3 m, 90 × 60 cells
    e.panel.apply({ kind: "reinforce", section: 1, side: 0 });
    let seed = 5;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) >>> 0) % n);
    const index = e.panel.spec.index;
    const times: number[] = [];
    // 30 rounds of 10 holes in every layer (300 shots' worth), redrawing after each round.
    for (let round = 0; round < 30; round++) {
      for (let k = 0; k < 10; k++)
        for (const layer of [L_FRONT, L_CORE, L_BACK, 3]) sim.level.panels.apply(index, { kind: "cut", layer, shape: { kind: "disc", u4: rnd(360), v4: rnd(240), r4: 2 + rnd(4) }, hard: true });
      const t0 = performance.now();
      view.update();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1];
    console.log(`panel redraw: median ${median.toFixed(2)} ms, worst ${times[times.length - 1].toFixed(2)} ms`);
    expect(median).toBeLessThan(8); // a 60 Hz frame is 16.7 ms; a typical machine takes ~1 ms
  });

  it("steel is a plate on the side it went up from, proud of that face", async () => {
    const sim = await Sim.create("movement_lab");
    const scene = new THREE.Scene();
    const view = new PanelView(scene, sim.level.panels);
    const e = sim.level.panels.byId.get("sample_reinforceable")!;
    sim.level.panels.apply(e.panel.spec.index, { kind: "reinforce", section: 0, side: 1 });
    sim.level.panels.apply(e.panel.spec.index, { kind: "reinforce", section: 1, side: 0 });
    view.update();
    scene.updateMatrixWorld(true);
    const g = groups(scene)[1];
    expect(g.children.length).toBe(6); // each skin where no plate covers it, a plate on each side, the caps and the seams
    const [minus, plus] = g.children.slice(2).map(box);
    const face = e.frame.center[2] + e.frame.t / 2;
    expect(plus.max.z).toBeGreaterThan(face);
    expect(plus.max.x).toBeLessThanOrEqual(e.frame.center[0] + 1e-6); // section 0 is the −x half
    expect(minus.min.z).toBeLessThan(e.frame.center[2] - e.frame.t / 2);
    expect(minus.min.x).toBeGreaterThanOrEqual(e.frame.center[0] - 1e-6);
  });

  it("a reinforceable wall shows its section seams on both faces, reinforced or not; a hole takes them with it", async () => {
    const sim = await Sim.create("destruction_lab");
    const scene = new THREE.Scene();
    const view = new PanelView(scene, sim.level.panels);
    // Only walls built reinforceable with two sections or more have seams (the Reinforced wall too; not the
    // one-section Oregon wall, the hatch or the soft walls).
    for (const entry of sim.level.panels.list) {
      const { construction: c, sections, id } = entry.panel.spec;
      const has = (scene.children[entry.panel.spec.index] as THREE.Group).children.some((m) => m.name === "seam");
      expect(has, id).toBe(c.kind === "wall" && c.reinforceable && sections > 1);
    }
    const e = sim.level.panels.byId.get("reinforce_3")!; // 4.5 × 3 m at x 6, z −6, 0.2 m thick: sections of 30 cells
    const index = e.panel.spec.index;
    /** Each seam box: which face, where across (x), how high, and how far it stands off the wall's face. */
    const seams = () => {
      scene.updateMatrixWorld(true);
      const seam = (scene.children[index] as THREE.Group).children.find((m): m is THREE.Mesh => m.name === "seam")!;
      expect(seam.castShadow).toBe(false);
      const pos = seam.geometry.getAttribute("position");
      const out: string[] = [];
      for (let k = 0; k < pos.count; k += 8) {
        const b = new THREE.Box3();
        for (let c = 0; c < 8; c++) b.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, k + c).applyMatrix4(seam.matrixWorld));
        const front = b.max.z < -6;
        const off = front ? -6.1 - b.min.z : b.max.z + 5.9;
        expect(b.max.x - b.min.x).toBeCloseTo(0.03, 6);
        out.push(`${front ? "front" : "back"} x ${((b.min.x + b.max.x) / 2).toFixed(2)} y ${b.min.y.toFixed(2)}–${b.max.y.toFixed(2)} off ${(off * 1000).toFixed(0)} mm`);
      }
      return out.sort();
    };
    // Intact: a seam where each section meets the next, full height, a millimetre off each face.
    expect(seams()).toEqual(["back x 5.25 y 0.00–3.00 off 1 mm", "back x 6.75 y 0.00–3.00 off 1 mm", "front x 5.25 y 0.00–3.00 off 1 mm", "front x 6.75 y 0.00–3.00 off 1 mm"]);
    // A hole through the front skin across the first boundary takes that seam with it, there only.
    sim.level.panels.apply(index, { kind: "cut", layer: L_FRONT, shape: { kind: "rect", u0: 25, v0: 20, u1: 35, v1: 30 }, hard: false });
    expect(view.update()).toBe(true);
    expect(view.update()).toBe(false); // nothing new
    expect(seams()).toEqual([
      "back x 5.25 y 0.00–3.00 off 1 mm",
      "back x 6.75 y 0.00–3.00 off 1 mm",
      "front x 5.25 y 0.00–1.00 off 1 mm",
      "front x 5.25 y 1.50–3.00 off 1 mm",
      "front x 6.75 y 0.00–3.00 off 1 mm",
    ]);
    // Steel on the middle section from the front: the seams beside it lie on the plate (2.6 m of it) and stand
    // off it; where the skin beside the plate is holed there is still no seam.
    sim.level.panels.apply(index, { kind: "reinforce", section: 1, side: 0 });
    view.update();
    expect(seams()).toEqual([
      "back x 5.25 y 0.00–3.00 off 1 mm",
      "back x 6.75 y 0.00–3.00 off 1 mm",
      "front x 5.25 y 0.00–1.00 off 7 mm",
      "front x 5.25 y 1.50–2.60 off 7 mm",
      "front x 5.25 y 2.60–3.00 off 1 mm",
      "front x 6.75 y 0.00–2.60 off 7 mm",
      "front x 6.75 y 2.60–3.00 off 1 mm",
    ]);
    // The stats overlay's count: every mesh in every panel's group.
    expect(view.meshCount).toBe(sim.level.panels.list.reduce((n, entry) => n + scene.children[entry.panel.spec.index].children.length, 0));
  });
});
