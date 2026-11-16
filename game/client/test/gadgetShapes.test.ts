// The gadgets' and the drone's shaped models (Phase 10 M7, render/DESIGN.md §10), without a GPU: every gadget either
// has a shape or is one of the kinds drawn their own way; each shape keeps to the box it's hit and placed by (its
// data's size) and fills it; what's held is no bigger than a hand holds; the drone keeps to its size where it's shot.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { loadGameData } from "@redmond/shared";
import { droneShape, gadgetShape, heldShape, knifeShape, shapeModel, type ShapeMat } from "../src/render/gadgetShapes.js";

const data = loadGameData();
/** Drawn their own way: the Black Mirror's frame and glass, the Bulletproof Camera, Skopós's shell (its parts), a dropped phone, Brava's drone (a pawn). */
const OTHERWISE = new Set(["black_mirror", "bulletproof_camera", "shell_shield", "dropped_phone", "kludge_drone"]);

function bounds(parts: Map<ShapeMat, THREE.BufferGeometry>): THREE.Box3 {
  const box = new THREE.Box3();
  for (const g of parts.values()) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

function triangles(parts: Map<ShapeMat, THREE.BufferGeometry>): number {
  let n = 0;
  for (const g of parts.values()) n += g.getAttribute("position").count / 3;
  return n;
}

describe("the gadgets' shapes (render/gadgetShapes.ts)", () => {
  it("every gadget has a shape (or is drawn its own way) that keeps to its box and fills it", () => {
    const problems: string[] = [];
    let shaped = 0;
    for (const g of data.gadgets.values()) {
      const parts = gadgetShape(g.id, g.sizeM);
      if (!parts) {
        if (!OTHERWISE.has(g.id)) problems.push(`${g.id}: no shape`);
        continue;
      }
      shaped++;
      const b = bounds(parts);
      const size = b.getSize(new THREE.Vector3());
      const axes = ["x", "y", "z"] as const;
      axes.forEach((a, i) => {
        const half = g.sizeM[i] / 2;
        // Within its box (5 mm of slack: a band proud of a face).
        if (b.min[a] < -half - 0.005 || b.max[a] > half + 0.005) problems.push(`${g.id}: past its box along ${a} (${b.min[a].toFixed(3)}..${b.max[a].toFixed(3)} of ±${half.toFixed(3)})`);
        // And most of it (a hammer's head is narrower than its swing's box; a tablet is thin).
        if (size[a] < g.sizeM[i] * 0.5) problems.push(`${g.id}: only ${size[a].toFixed(3)} of ${g.sizeM[i]} along ${a}`);
      });
      const longest = Math.max(...g.sizeM);
      const at = g.sizeM.indexOf(longest);
      if (size[axes[at]] < longest * 0.9) problems.push(`${g.id}: ${size[axes[at]].toFixed(3)} of its length ${longest}`);
      expect(triangles(parts), `${g.id}'s triangles`).toBeLessThan(4000);
      for (const geo of parts.values()) geo.dispose();
    }
    expect(problems.join("\n")).toBe("");
    expect(shaped).toBe(data.gadgets.size - OTHERWISE.size);
  });

  it("what's held is at most a hand's size, a big placed gadget packed", () => {
    for (const g of data.gadgets.values()) {
      const cap = g.use.kind === "swing" ? 0.6 : 0.3;
      const held = heldShape(g.id, g.sizeM, cap);
      const size = bounds(held.parts).getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.y, size.z), g.id).toBeLessThanOrEqual(cap + 1e-6);
      expect(Math.max(size.x, size.y, size.z), g.id).toBeGreaterThan(0.05);
      expect(held.size[0]).toBeCloseTo(size.x, 5);
      const model = shapeModel(held.parts);
      expect(model.group.children.length).toBeGreaterThan(0);
      model.dispose();
    }
    const det = bounds(heldShape("detonator", [0.05, 0.09, 0.03], 0.3).parts).getSize(new THREE.Vector3());
    expect(det.y).toBeLessThan(0.12);
    // A breach charge is carried rolled: nothing like its 1.6 m frame scaled down.
    const roll = bounds(heldShape("breach_charge", data.gadgets.get("breach_charge")!.sizeM, 0.3).parts).getSize(new THREE.Vector3());
    expect(roll.x).toBeGreaterThan(roll.y);
    expect(bounds(knifeShape()).getSize(new THREE.Vector3()).z).toBeGreaterThan(0.25);
  });

  it("the drones keep to their size where they're shot (the antenna stands over it)", () => {
    for (const [size, kludge] of [
      [data.intel.drone.sizeM, false],
      [data.gadgets.get("kludge_drone")!.sizeM, true],
    ] as const) {
      const [w, h, l] = size;
      const shape = droneShape(size, kludge);
      const hull = bounds(shape.hull);
      const wheel = bounds(shape.wheel);
      // The hull within the width between the tyres and the length; under it nothing lower than the wheels.
      expect(hull.min.x).toBeGreaterThanOrEqual(-w / 2 - 1e-6);
      expect(hull.max.x).toBeLessThanOrEqual(w / 2 + 1e-6);
      expect(hull.min.z).toBeGreaterThanOrEqual(-l / 2 - 0.006);
      expect(hull.max.z).toBeLessThanOrEqual(l / 2 + 0.006);
      expect(hull.min.y).toBeGreaterThanOrEqual(-h / 2 - 1e-6);
      // Its antenna (and Brava's spike) may stand over its box; the body itself doesn't.
      expect(hull.max.y).toBeLessThan(h * 1.6);
      // A wheel: the height of the box, a tyre's width.
      expect(wheel.max.y - wheel.min.y).toBeGreaterThan(h * 0.9);
      expect(wheel.max.y - wheel.min.y).toBeLessThanOrEqual(h * 1.08);
      expect(wheel.max.x - wheel.min.x).toBeLessThan(w * 0.25);
      expect(triangles(shape.hull) + 2 * triangles(shape.wheel)).toBeLessThan(3000);
    }
  });
});
