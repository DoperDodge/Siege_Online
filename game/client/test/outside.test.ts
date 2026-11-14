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
async function oregon() {
  level ??= (await Sim.create("oregon")).level;
  return { level, art: new LevelArt(level, sets(), loadArtData()) };
}

describe("the outside's models (render/outside.ts)", () => {
  it("every model keeps to its box and fills it at a body's height", async () => {
    const { level, art } = await oregon();
    const { ids } = buildOutside(level, art);
    expect(ids.size).toBeGreaterThan(50);
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

  it("the woods stand past the bounds, never in the play area", async () => {
    const { level, art } = await oregon();
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
});
