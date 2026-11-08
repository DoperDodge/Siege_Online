// Oregon's cover props as furniture (Phase 10 M6, render/DESIGN.md §9.1), without a GPU: what's drawn is what collides.
// Each of the 29 props gets a model that keeps to its box (within 3 cm round its footprint; only small things stand on
// its top) and fills it; rays at a drone's or a foot's height from every side meet the model before they're through
// the box (nothing reads as room to drive or see under it), rays from above meet it, and a metal prop (bullets stop at
// it) shows no gap at any height.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { loadArtData, Sim, type BuiltLevel, type Renderable } from "@redmond/shared";
import { buildFurniture, fitFurniture, wallsAround } from "../src/render/furniture.js";
import { LevelArt } from "../src/render/levelArt.js";
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

/** A model's triangles in its box's own frame (the box centred on the origin, unturned). */
function localTriangles(r: Renderable, pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const yaw = 2 * Math.atan2(r.quat[1], r.quat[3]);
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [dx, dy, dz] = [pos.getX(i) - r.center[0], pos.getY(i) - r.center[1], pos.getZ(i) - r.center[2]];
    out[i * 3] = dx * c - dz * s;
    out[i * 3 + 1] = dy;
    out[i * 3 + 2] = dx * s + dz * c;
  }
  return out;
}

/** How far a ray from o along dir goes before it meets a triangle (Möller–Trumbore); Infinity if it meets none. */
function hitAt(tris: Float32Array, o: readonly number[], dir: readonly number[]): number {
  let best = Infinity;
  for (let i = 0; i < tris.length; i += 9) {
    const e1 = [tris[i + 3] - tris[i], tris[i + 4] - tris[i + 1], tris[i + 5] - tris[i + 2]];
    const e2 = [tris[i + 6] - tris[i], tris[i + 7] - tris[i + 1], tris[i + 8] - tris[i + 2]];
    const p = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const t0 = [o[0] - tris[i], o[1] - tris[i + 1], o[2] - tris[i + 2]];
    const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) * inv;
    if (u < 0 || u > 1) continue;
    const q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
    const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
    if (t > 0 && t < best) best = t;
  }
  return best;
}

/** Points along a span, `step` apart, kept `inset` from its ends. */
function along(from: number, to: number, step: number, inset: number): number[] {
  const out: number[] = [];
  const n = Math.max(1, Math.floor((to - from - 2 * inset) / step));
  for (let i = 0; i <= n; i++) out.push(from + inset + ((to - from - 2 * inset) * i) / n);
  return out;
}

describe("the cover props as furniture (render/furniture.ts)", () => {
  it("every prop has a model, built per storey, and the boxes it stands for are listed", async () => {
    const { level, art } = await oregon();
    const props = level.renderables.filter((r) => r.kind === "solid" && r.id.startsWith("PROP_"));
    expect(props.length).toBe(29);
    const { kits, ids } = buildFurniture(level, art, (r) => (r.center[1] < -0.5 ? 0 : r.center[1] < 3 ? 1 : 2));
    expect([...ids].sort()).toEqual(props.map((r) => r.id).sort());
    expect([...kits.keys()].sort()).toEqual([0, 1, 2]);
    let triangles = 0;
    for (const kit of kits.values()) triangles += kit.triangles;
    expect(triangles).toBeLessThan(60_000);
  });

  it("pieces know how far each side is from a wall (they face away from the nearer)", async () => {
    const { level } = await oregon();
    const at = (id: string) => wallsAround(level, level.renderables.find((r) => r.id === id)!);
    // The kitchen's long counter stands along the north wall (−z); the island stands free.
    expect(at("PROP_KITCHEN_COUNTER_N").nz).toBeLessThanOrEqual(0.3);
    expect(Math.min(...Object.values(at("PROP_KITCHEN_ISLAND")))).toBeGreaterThan(0.3);
  });

  it("each model keeps to its box, fills it, and is closed where a drone or a foot could look under it", async () => {
    const { level, art } = await oregon();
    const problems: string[] = [];
    const check = (ok: boolean, what: string) => {
      if (!ok && !problems.some((p) => p.split(":")[0] === what.split(":")[0] && p.split(":")[1].slice(0, 12) === what.split(":")[1].slice(0, 12))) problems.push(what);
    };
    for (const r of level.renderables.filter((x) => x.kind === "solid" && x.id.startsWith("PROP_"))) {
      const kit = fitFurniture(level, r, art)!;
      const tris = localTriangles(r, kit.geometry().getAttribute("position"));
      const [hx, hy, hz] = [r.size[0] / 2, r.size[1] / 2, r.size[2] / 2];
      let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (let i = 0; i < tris.length; i += 3) {
        const [x, y, z] = [tris[i], tris[i + 1], tris[i + 2]];
        const where = `${r.id}: a part at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`;
        check(Math.abs(x) <= hx + 0.03 && Math.abs(z) <= hz + 0.03, `${where} is past its footprint`);
        check(y >= -hy - 0.005 && y <= hy + 0.35, `${where} is under the floor or far over its top`);
        if (y > hy + 0.01) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      check(x1 - x0 > r.size[0] - 0.06, `${r.id}: fills its width (${(x1 - x0).toFixed(2)} of ${r.size[0].toFixed(2)})`);
      check(z1 - z0 > r.size[2] - 0.06, `${r.id}: fills its depth (${(z1 - z0).toFixed(2)} of ${r.size[2].toFixed(2)})`);

      // In from each side, a drone's front (22 × 12 cm) at a time: some ray of it meets the model within 20 cm of the
      // box's face — nothing under or in it a drone could drive into or a foot be seen in. Low (a drone, a foot) for every
      // prop; at every height for a metal one, where no single ray may get through either (bullets stop at it).
      const metal = [...level.solids.values()].find((x) => x.id === r.id)?.prop === "metal";
      const top = metal ? hy - 0.06 : Math.min(-hy + 0.3, hy - 0.06);
      const DEEP = 0.2;
      const sides: { name: string; half: number; span: number; ray: (a: number, y: number) => [number[], number[]] }[] = [
        { name: "+x", half: hx, span: hz, ray: (a, y) => [[hx + 0.1, y, a], [-1, 0, 0]] },
        { name: "−x", half: hx, span: hz, ray: (a, y) => [[-hx - 0.1, y, a], [1, 0, 0]] },
        { name: "+z", half: hz, span: hx, ray: (a, y) => [[a, y, hz + 0.1], [0, 0, -1]] },
        { name: "−z", half: hz, span: hx, ray: (a, y) => [[a, y, -hz - 0.1], [0, 0, 1]] },
      ];
      for (const side of sides)
        for (const y of along(-hy + 0.02, top + 0.05, 0.06, 0.03))
          for (const a of along(-side.span, side.span, 0.08, 0.1)) {
            let nearest = Infinity;
            for (const da of [-0.1, -0.05, 0, 0.05, 0.1])
              for (const dy of [-0.05, 0, 0.05]) {
                const along = Math.max(-side.span + 0.01, Math.min(side.span - 0.01, a + da));
                const [o, dir] = side.ray(along, Math.min(hy - 0.02, Math.max(-hy + 0.01, y + dy)));
                const t = hitAt(tris, o, dir) - 0.1;
                nearest = Math.min(nearest, t);
                // Right through a metal piece: a gap (but not along a plinth's recess or past its very edges).
                if (metal && o[1] > -hy + 0.06 && Math.abs(along) < side.span - 0.05) check(t < 2 * side.half, `${r.id}: a gap right through from ${side.name} at y ${(o[1] + hy).toFixed(2)}, ${along.toFixed(2)}`);
              }
            check(nearest < DEEP, `${r.id}: an opening from ${side.name} at y ${(y + hy).toFixed(2)}, ${a.toFixed(2)} (${nearest.toFixed(2)} m in)`);
          }
      // From above: something to stand a drone on everywhere over it.
      for (const x of along(-hx, hx, 0.15, 0.06))
        for (const z of along(-hz, hz, 0.15, 0.06)) check(hitAt(tris, [x, hy + 0.5, z], [0, -1, 0]) < 0.5 + 2 * hy - 0.03, `${r.id}: a hole from above at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
    expect(problems.slice(0, 40).join("\n")).toBe("");
  }, 60_000);
});
