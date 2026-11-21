// The outside's models (Phase 10 M5, render/DESIGN.md §8), without a GPU: every model keeps to its box at a body's
// height (up to 2 m over its bottom) and fills it there (most of its width and depth), so what's drawn is what collides
// where a player meets it; the woods stand past the bounds only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { loadArtData, Sim, type BuiltLevel } from "@redmond/shared";
import { buildBackdrop } from "../src/render/backdrop.js";
import { Kit } from "../src/render/kit.js";
import { LevelArt } from "../src/render/levelArt.js";
import { buildOutside, modelFor } from "../src/render/outside.js";
import type { TextureManifest, TextureSets } from "../src/render/textures.js";

const manifest = JSON.parse(readFileSync(new URL("../public/art/textures/manifest.json", import.meta.url), "utf8")) as TextureManifest;
const tex = () => new THREE.DataArrayTexture(new Uint8Array(4 * manifest.sets.length), 1, 1, manifest.sets.length);
const sets = (): TextureSets => ({
  color: tex(),
  normal: tex(),
  orm: tex(),
  layer: new Map(manifest.sets.map((s, i) => [s.id, i])),
  sizeM: new Map(manifest.sets.map((s) => [s.id, s.sizeM])),
  mean: new Map(manifest.sets.map((s) => [s.id, s.mean ?? ([0.5, 0.5, 0.5] as [number, number, number])])),
  size: 1,
  gpuBytes: 0,
});

let level: BuiltLevel | null = null;
async function millrace() {
  level ??= (await Sim.create("millrace")).level;
  return { level, art: new LevelArt(level, sets(), loadArtData()) };
}

describe("the outside's models (render/outside.ts)", () => {
  it("every model keeps to its box and fills it at a body's height", async () => {
    const { level, art } = await millrace();
    const { ids } = buildOutside(level, art);
    // Every one of Millrace's outside items has its model.
    expect([...ids].sort()).toEqual(level.renderables.filter((r) => r.visible && r.kind === "solid" && r.id.startsWith("EXT_")).map((r) => r.id).sort());
    const m = (material: string) => art.fixedStyle(material);
    for (const r of level.renderables.filter((x) => ids.has(x.id))) {
      const kit = new Kit().place([0, 0, 0]);
      modelFor(r.id)!(kit, [r.size[0], r.size[1], r.size[2]], m, { ...r, center: [0, 0, 0], quat: [0, 0, 0, 1] });
      const pos = kit.geometry().getAttribute("position");
      const [hx, hy, hz] = [r.size[0] / 2, r.size[1] / 2, r.size[2] / 2];
      const top = Math.min(hy, -hy + 2);
      let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
        if (y > top + 1e-6) continue;
        expect(Math.abs(x) <= hx + 0.06 && Math.abs(z) <= hz + 0.06, `${r.id}: a part past its box at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`).toBe(true);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      // Most of it, or all but 10 cm (a fence's 15 cm box).
      expect(x1 - x0, `${r.id}: fills its width`).toBeGreaterThan(Math.min(0.8 * r.size[0], r.size[0] - 0.1));
      expect(z1 - z0, `${r.id}: fills its depth`).toBeGreaterThan(Math.min(0.8 * r.size[2], r.size[2] - 0.1));
    }
  });

  it("closed down to the ground where its box stops bullets and drones: nothing shows under or through an item low down", async () => {
    const { level } = await millrace();
    const solid = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const problems: string[] = [];
    let checked = 0;
    for (const r of level.renderables) {
      if (!r.visible || r.kind !== "solid") continue;
      const model = modelFor(r.id);
      if (!model) continue;
      // In its own frame: the kit at the origin, unturned (a lengthwise model still turns itself to its box).
      const local = { ...r, center: [0, 0, 0], quat: [0, 0, 0, 1] } as typeof r;
      const s = [r.size[0], r.size[1], r.size[2]] as const;
      const kit = new Kit().place([0, 0, 0]);
      model(kit, s, () => 1, local);
      const mesh = new THREE.Mesh(kit.geometry(), solid);
      mesh.updateMatrixWorld(true);
      const half = [s[0] / 2, s[1] / 2, s[2] / 2];
      // Level rays along and across it, through its middle half, from 5 to 50 cm over the ground: where feet, a drone
      // or a body lying down would show under or through it. (Higher, a car's box stands over its hood and the
      // excavator's over its arm: shapes the boxes are coarser than, which only a change of the boxes would fix.)
      for (const axis of [0, 2]) {
        const other = 2 - axis;
        for (const up of [0.05, 0.2, 0.35, 0.5]) {
          if (up > s[1] - 0.05) continue;
          const y = -half[1] + up;
          for (const f of [-0.25, 0, 0.25]) {
            const from = new THREE.Vector3();
            from.setComponent(axis, -half[axis] - 1);
            from.setComponent(1, y);
            from.setComponent(other, f * s[other]);
            const dir = new THREE.Vector3().setComponent(axis, 1);
            const hit = new THREE.Raycaster(from, dir).intersectObject(mesh)[0];
            checked++;
            if (!hit || hit.point.getComponent(axis) > half[axis] + 0.06) problems.push(`${r.id}: through it along ${axis ? "z" : "x"} at ${(y + half[1]).toFixed(2)} m up, ${(f * s[other]).toFixed(2)} across`);
          }
        }
      }
      mesh.geometry.dispose();
    }
    expect(problems.slice(0, 15).join("\n")).toBe("");
    expect(checked).toBeGreaterThan(400);
  });

  it("an item of no depth still ends (and draws a sensible amount)", () => {
    for (const id of ["EXT_BALES_1", "EXT_BOOTH_GATE", "EXT_CONTAINER_1", "EXT_DOCK", "EXT_SHED", "EXT_TRUCK", "EXT_WALL_RIVER"])
      for (const depth of [0, 0.001]) {
        const kit = new Kit().place([0, 0, 0]);
        const r = { id, kind: "solid", visible: true, center: [0, 0, 0], quat: [0, 0, 0, 1], size: [3, 1, depth] } as unknown as Parameters<NonNullable<ReturnType<typeof modelFor>>>[3];
        modelFor(id)!(kit, [3, 1, depth], () => 1, r);
        expect(kit.triangles, `${id} ${depth}`).toBeGreaterThan(0);
        expect(kit.triangles, `${id} ${depth}`).toBeLessThan(20000);
      }
  });

  it("the woods stand past the bounds, never in the play area", async () => {
    const { level, art } = await millrace();
    const b = level.def.bounds!;
    const back = buildBackdrop(level, art, () => false)!;
    expect(back.trees).toBeGreaterThan(100);
    const woods = back.meshes.find((x) => x.name === "woods")!;
    const pos = woods.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += 7) {
      const [x, z] = [pos.getX(i), pos.getZ(i)];
      const inside = x > b.min[0] - 1 && x < b.max[0] + 1 && z > b.min[2] - 1 && z < b.max[2] + 1;
      expect(inside, `a tree's part at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(false);
    }
  });

  it("the far ground lies round the bounds, not under them: openings below the level's ground stay open", async () => {
    const { level, art } = await millrace();
    const b = level.def.bounds!;
    const back = buildBackdrop(level, art, () => false)!;
    const ground = back.meshes.find((x) => x.name === "backdrop ground")!;
    ground.updateMatrixWorld(true);
    const down = (x: number, z: number) => new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0)).intersectObject(ground)[0]?.point.y ?? null;
    const [mx, mz] = [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
    // Inside: none (the bunker's outside stairs, the middle, the corners).
    for (const [x, z] of [[54, 19], [mx, mz], [b.min[0] + 0.5, b.min[2] + 0.5], [b.max[0] - 0.5, b.max[2] - 0.5]]) expect(down(x, z), `(${x}, ${z})`).toBeNull();
    // Just past each side, and far out: the ground, 4 cm under the level's.
    for (const [x, z] of [[b.min[0] - 0.5, mz], [b.max[0] + 0.5, mz], [mx, b.min[2] - 0.5], [mx, b.max[2] + 0.5], [b.min[0] - 300, b.max[2] + 300]]) expect(down(x, z), `(${x}, ${z})`).toBeCloseTo(-0.04, 5);
  });
});
