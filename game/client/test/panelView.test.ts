// Panels drawn from their cells (Phase 4 M3, render/panelView.ts), without a GPU: an intact wall is one box
// per layer the exact size of its level solid, a hole redraws only that panel, and steel sits on the side
// it went up from.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { L_BACK, L_CORE, L_FRONT, Sim, type PanelOp } from "@redmond/shared";
import { PanelView } from "../src/render/panelView.js";

/** Each panel's group in the scene, by panel index (PanelView adds them first, in order). */
const groups = (scene: THREE.Scene) => scene.children.filter((c): c is THREE.Group => (c as THREE.Group).isGroup && c.children.every((m) => (m as THREE.Mesh).visible));
const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe("panel view", () => {
  it("an intact wall is skins and studs inside its solid's box; a hole redraws just that panel", async () => {
    const sim = await Sim.create("movement_lab");
    const scene = new THREE.Scene();
    const view = new PanelView(scene, sim.level.panels);
    const [soft, reinforceable] = groups(scene);
    // Two skins and the studs (a reinforceable wall that isn't reinforced draws no steel).
    expect(soft.children.length).toBe(3);
    expect(reinforceable.children.length).toBe(3);
    const b = box(soft);
    const s = sim.level.def.solids.find((x) => x.id === "sample_soft")!;
    for (let k = 0; k < 3; k++) {
      expect(b.min.getComponent(k)).toBeCloseTo(s.center[k] - s.size[k] / 2, 6);
      expect(b.max.getComponent(k)).toBeCloseTo(s.center[k] + s.size[k] / 2, 6);
    }
    const front = soft.children[0] as THREE.Mesh;
    const before = front.geometry.getAttribute("position").count;
    const otherGeometry = (reinforceable.children[0] as THREE.Mesh).geometry;
    const cut: PanelOp = { kind: "cut", layer: L_FRONT, shape: { kind: "rect", u0: 10, v0: 10, u1: 20, v1: 20 }, hard: false };
    sim.level.panels.apply(0, cut);
    view.update();
    expect((soft.children[0] as THREE.Mesh).geometry.getAttribute("position").count).toBeGreaterThan(before);
    expect((reinforceable.children[0] as THREE.Mesh).geometry).toBe(otherGeometry);
    // Shot through every layer down to nothing: the skins and studs go, nothing is left to draw.
    for (const layer of [L_FRONT, L_CORE, L_BACK]) sim.level.panels.apply(0, { kind: "cut", layer, shape: { kind: "rect", u0: 0, v0: 0, u1: 40, v1: 50 }, hard: false });
    view.update();
    expect(soft.children.length).toBe(0);
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
    expect(g.children.length).toBe(5); // skins, studs, and a plate on each side
    const [minus, plus] = g.children.slice(3).map(box);
    const face = e.frame.center[2] + e.frame.t / 2;
    expect(plus.max.z).toBeGreaterThan(face);
    expect(plus.max.x).toBeLessThanOrEqual(e.frame.center[0] + 1e-6); // section 0 is the −x half
    expect(minus.min.z).toBeLessThan(e.frame.center[2] - e.frame.t / 2);
    expect(minus.min.x).toBeGreaterThanOrEqual(e.frame.center[0] - 1e-6);
  });
});
