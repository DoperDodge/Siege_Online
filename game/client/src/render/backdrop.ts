// What lies past the play area (Phase 10 M5, render/DESIGN.md §8), drawn only: ground running on to the haze, pine
// woods in clumps all round past the bounds (none in the play area: a tree there would be cover that isn't), and a ring
// of low hills in the distance. All of it in the level's material (the ground blends as the yard does; the woods and
// hills in their own materials) and lit as the open sky lights it (probeField.ts: past the probes).
import * as THREE from "three";
import type { BuiltLevel } from "@redmond/shared";
import { Kit } from "./kit.js";
import type { LevelArt } from "./levelArt.js";

/** The ground plane's half size (m), and how far under the level's ground it lies (under the play area it's hidden). */
const GROUND_HALF_M = 700;
const GROUND_DROP_M = 0.04;
/** Woods: from this far past the bounds out to WOOD_OUT_M, about one tree a TREE_AREA_M2 where the noise says wood. */
const WOOD_IN_M = 4;
const WOOD_OUT_M = 95;
const TREE_AREA_M2 = 40;
/** Hills: a ring this far from the level's middle, this high at most. */
const HILL_R_M = [165, 230] as const;
const HILL_H_M = 38;

/** A seeded random number generator (mulberry32): the same woods every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 2-D value noise, 0..1. */
function noise(x: number, z: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

export interface Backdrop {
  meshes: THREE.Mesh[];
  trees: number;
  triangles: number;
}

/** The backdrop for a level with bounds (a lab gets none). */
export function buildBackdrop(level: BuiltLevel, art: LevelArt, keepClear: (x: number, z: number) => boolean): Backdrop | null {
  const b = level.def.bounds;
  if (!b) return null;
  const [x0, z0, x1, z1] = [b.min[0], b.min[2], b.max[0], b.max[2]];
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const meshes: THREE.Mesh[] = [];

  // The ground on to the horizon: one big quad (its style by the room maps: the outside, whose floor is the ground).
  const ground = new THREE.PlaneGeometry(GROUND_HALF_M * 2, GROUND_HALF_M * 2, 1, 1);
  ground.rotateX(-Math.PI / 2);
  ground.translate(cx, -GROUND_DROP_M, cz);
  ground.setAttribute("aArt", new THREE.Float32BufferAttribute(new Float32Array(4), 1));
  const groundMesh = new THREE.Mesh(ground, art.staticMaterial());
  groundMesh.name = "backdrop ground";
  groundMesh.receiveShadow = true;
  meshes.push(groundMesh);

  // Woods: trees on a jittered grid past the bounds, where the noise has woods, thinning toward the bounds.
  const kit = new Kit();
  const rand = rng(20261108);
  const bark = art.fixedStyle("bark");
  const needles = art.fixedStyle("foliage");
  const step = Math.sqrt(TREE_AREA_M2);
  let trees = 0;
  for (let x = x0 - WOOD_OUT_M; x <= x1 + WOOD_OUT_M; x += step)
    for (let z = z0 - WOOD_OUT_M; z <= z1 + WOOD_OUT_M; z += step) {
      const px = x + (rand() - 0.5) * step;
      const pz = z + (rand() - 0.5) * step;
      const out = Math.max(x0 - px, px - x1, z0 - pz, pz - z1); // how far past the bounds (negative inside)
      if (out < WOOD_IN_M || keepClear(px, pz)) continue;
      const wood = noise(px * 0.035, pz * 0.035) * 0.7 + noise(px * 0.12, pz * 0.12) * 0.3;
      const near = Math.min(1, (out - WOOD_IN_M) / 25); // fewer near the bounds
      if (wood < 0.62 - 0.25 * near) continue;
      const h = 9 + rand() * 9;
      kit.place([px, 0, pz], rand() * Math.PI * 2);
      pine(kit, h, 1.6 + rand() * 1.4, bark, needles);
      trees++;
    }
  const woods = new THREE.Mesh(kit.geometry(), art.staticMaterial());
  woods.name = "woods";
  meshes.push(woods);

  // Hills: a ring of low rises, flat-shaded, in the ground's grass.
  const hills = new Kit();
  const grass = art.fixedStyle("hill");
  const seg = 96;
  const rings = 6;
  const height = (a: number, t: number) => {
    const n = noise(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10) * 0.65 + noise(Math.cos(a) * 9, Math.sin(a) * 9) * 0.35;
    return Math.sin(Math.PI * t) * (0.35 + n) * HILL_H_M * (t < 0.15 ? t / 0.15 : 1);
  };
  hills.place([cx, -GROUND_DROP_M, cz]);
  const at = (i: number, j: number) => {
    const a = (i / seg) * Math.PI * 2;
    const t = j / rings;
    const r = HILL_R_M[0] + (HILL_R_M[1] - HILL_R_M[0]) * t;
    return [Math.cos(a) * r, height(a, t), Math.sin(a) * r] as const;
  };
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < rings; j++) {
      const p00 = at(i, j);
      const p10 = at(i + 1, j);
      const p01 = at(i, j + 1);
      const p11 = at(i + 1, j + 1);
      hills.facet(p00, p10, p11, grass);
      hills.facet(p00, p11, p01, grass);
    }
  const hillMesh = new THREE.Mesh(hills.geometry(), art.staticMaterial());
  hillMesh.name = "hills";
  meshes.push(hillMesh);
  for (const m of meshes) m.frustumCulled = false;
  return { meshes, trees, triangles: kit.triangles + hills.triangles + 2 };
}

/** A pine: a trunk, and tiers of needles narrowing to its top. */
function pine(k: Kit, h: number, r: number, bark: number, needles: number): void {
  k.cylinder([0, h * 0.2, 0], 0.18 * (h / 12), h * 0.4, "y", bark, 6);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t0 = 0.22 + i * 0.18;
    const len = h * 0.32;
    const rr = r * (1 - i * 0.2);
    k.cylinder([0, h * t0 + len / 2, 0], rr, len, "y", needles, 8, true, 0.02);
  }
}
