// The probe bake (Phase 10 M3, render/DESIGN.md §6.3, §6.4), without a GPU: the box hierarchy's rays (nearest box and
// its face, turned boxes, light let through glass, points inside), and the bake on small scenes built by hand — a
// closed room is dark and sees no sky; open its roof and the sky comes in; a lamp lights its own room and not the room
// behind the wall; a probe takes no light from a room it isn't in; and a face never goes black (L1 de-ringing).
import { describe, expect, it } from "vitest";
import { BOX_STRIDE, BoxBvh, BoxClass, type Hit } from "../src/render/probes/bvh.js";
import { Baker, evalField, OUTSIDE_CLASS, PROBE_STRIDE, probeCount, shIrradiance, type BakeScene, type GridSpec } from "../src/render/probes/bake.js";

/** An axis-aligned box: centre, size, class. */
function box(c: [number, number, number], s: [number, number, number], cls = 0): number[] {
  return [c[0], c[1], c[2], s[0] / 2, s[1] / 2, s[2] / 2, 1, 0, 0, 0, 1, 0, 0, 0, 1, cls];
}

/** A box turned about y by `deg`. */
function turned(c: [number, number, number], s: [number, number, number], deg: number): number[] {
  const a = (deg * Math.PI) / 180;
  return [c[0], c[1], c[2], s[0] / 2, s[1] / 2, s[2] / 2, Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a), 0];
}

const hit = (): Hit => ({ t: 0, nx: 0, ny: 0, nz: 0, box: -1 });

describe("the box hierarchy (probes/bvh.ts)", () => {
  it("finds the nearest box a ray enters and its face's normal, through a turned box too; lets glass through when asked", () => {
    const boxes = new Float32Array([...box([5, 0, 0], [1, 1, 1]), ...box([10, 0, 0], [1, 1, 1]), ...turned([0, 0, 5], [2, 1, 0.2], 90), ...box([3, 0, 0], [0.1, 2, 2], BoxClass.Glass)]);
    const bvh = new BoxBvh(boxes);
    const h = hit();
    expect(bvh.trace(0, 0, 0, 1, 0, 0, 100, h)).toBe(true);
    expect(h.box).toBe(3); // the glass, unless skipped
    const skipGlass = (b: number) => boxes[b * BOX_STRIDE + 15] === BoxClass.Glass;
    expect(bvh.trace(0, 0, 0, 1, 0, 0, 100, h, skipGlass)).toBe(true);
    expect([h.box, +h.t.toFixed(4), h.nx, h.ny, h.nz]).toEqual([0, 4.5, -1, 0, 0]);
    // The turned plank (2 m along z once turned): a ray along +z meets its near face at z = 5 - 1.
    expect(bvh.trace(0, 0, 0, 0, 0, 1, 100, h)).toBe(true);
    expect([h.box, +h.t.toFixed(4), +h.nz.toFixed(4)]).toEqual([2, 4, -1]);
    expect(bvh.trace(0, 0, 0, 0, 1, 0, 100, h)).toBe(false);
    expect(bvh.blocked(0, 0, 0, 1, 0, 0, 4.4, skipGlass)).toBe(false);
    expect(bvh.blocked(0, 0, 0, 1, 0, 0, 4.6, skipGlass)).toBe(true);
    expect(bvh.inside(5, 0.2, 0.3)).toBe(true);
    expect(bvh.inside(3, 0, 0)).toBe(false); // glass isn't solid to light
    expect(bvh.inside(7, 0, 0)).toBe(false);
  });

  it("answers the same as testing every box, over many boxes and rays", () => {
    const list: number[] = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) list.push(...box([rand() * 40 - 20, rand() * 10, rand() * 40 - 20], [0.2 + rand() * 4, 0.2 + rand() * 3, 0.2 + rand() * 4]));
    const boxes = new Float32Array(list);
    const bvh = new BoxBvh(boxes);
    const single = (i: number) => new BoxBvh(boxes.slice(i * BOX_STRIDE, (i + 1) * BOX_STRIDE));
    const singles = Array.from({ length: 300 }, (_, i) => single(i));
    const h = hit();
    const s = hit();
    for (let r = 0; r < 200; r++) {
      const o = [rand() * 40 - 20, rand() * 10, rand() * 40 - 20];
      const d = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const l = Math.hypot(d[0], d[1], d[2]);
      const [dx, dy, dz] = [d[0] / l, d[1] / l, d[2] / l];
      let best = Infinity;
      for (const one of singles) if (one.trace(o[0], o[1], o[2], dx, dy, dz, 100, s) && s.t < best) best = s.t;
      const got = bvh.trace(o[0], o[1], o[2], dx, dy, dz, 100, h) ? h.t : Infinity;
      expect(got).toBeCloseTo(best, 5);
    }
  });
});

/**
 * A scene round two 4 × 3 × 4 m rooms side by side (x 0..4 and 4..8, a wall between), walls 0.2 m, a floor and a roof:
 * room codes 1 and 2 on a 10 cm map. `open`: no roof over room 1. Sky radiance 1 everywhere; sun off unless given.
 */
function rooms(opts: { open?: boolean; lamp1?: number; sun?: number } = {}): BakeScene {
  const b: number[] = [];
  b.push(...box([4, -0.1, 2], [8.4, 0.2, 4.4])); // floor
  if (!opts.open) b.push(...box([2, 3.1, 2], [4.4, 0.2, 4.4])); // roof over room 1
  b.push(...box([6, 3.1, 2], [4.2, 0.2, 4.4])); // roof over room 2
  b.push(...box([4, 1.5, -0.1], [8.4, 3.2, 0.2]), ...box([4, 1.5, 4.1], [8.4, 3.2, 0.2])); // north, south
  b.push(...box([-0.1, 1.5, 2], [0.2, 3.2, 4.4]), ...box([8.1, 1.5, 2], [0.2, 3.2, 4.4]), ...box([4, 1.5, 2], [0.2, 3.2, 4.4])); // west, east, between
  const w = 80;
  const h = 40;
  const data = new Uint8Array(w * h);
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) data[v * w + u] = u < 40 ? 1 : 2;
  const roomStyle = new Int32Array(256);
  const grid: GridSpec = { origin: [0.5, 0.5, 0.5], spacing: [1, 1, 1], dims: [8, 3, 4] };
  const sky = new Float32Array(8 * 4 * 4).fill(1);
  const lamps = opts.lamp1 ? new Float32Array([2, 2.6, 2, opts.lamp1, opts.lamp1, opts.lamp1, 1]) : new Float32Array(0);
  return {
    boxes: new Float32Array(b),
    rooms: { data, x0: 0, z0: 0, cell: 0.1, w, h, layers: 1 },
    floors: [0],
    roomStyle,
    styles: new Int32Array([0, 0, 0]),
    albedo: new Float32Array([0.5, 0.5, 0.5]),
    sky: { w: 8, h: 4, data: sky, scale: 1 },
    sun: { dir: [0, 1, 0], irradiance: [opts.sun ?? 0, opts.sun ?? 0, opts.sun ?? 0] },
    lamps,
    grids: [grid],
    rays: 96,
  };
}

/** Bake every probe of the scene's grid, `passes` times. */
function bake(scene: BakeScene, passes = 1): { baker: Baker; field: Float32Array } {
  const baker = new Baker(scene);
  let field = new Float32Array(0);
  for (let p = 0; p < passes; p++) {
    field = new Float32Array(probeCount(scene.grids[0]) * PROBE_STRIDE);
    baker.bakeRange(0, 0, probeCount(scene.grids[0]), field);
    baker.fields = [field];
  }
  return { baker, field };
}

/** The probe at grid (i, j, k): its 16 floats. */
const probe = (scene: BakeScene, field: Float32Array, i: number, j: number, k: number) => {
  const [nx, ny] = scene.grids[0].dims;
  const o = (i + nx * (j + ny * k)) * PROBE_STRIDE;
  return field.subarray(o, o + PROBE_STRIDE);
};

/** The irradiance (green) the field gives a face at p facing n, of room class cls. */
function irradiance(scene: BakeScene, field: Float32Array, p: [number, number, number], n: [number, number, number], cls: number): number {
  const g = scene.grids[0];
  const out = new Float32Array(3);
  const ok = evalField(field, g, (p[0] - g.origin[0]) / g.spacing[0], (p[1] - g.origin[1]) / g.spacing[1], (p[2] - g.origin[2]) / g.spacing[2], p[0], p[1], p[2], n[0], n[1], n[2], cls, out);
  return ok ? out[1] : NaN;
}

describe("the probe bake (probes/bake.ts)", () => {
  it("a closed room with no lamp is dark and sees no sky; open its roof and the sky comes in", () => {
    const closed = rooms();
    const { field } = bake(closed);
    const p = probe(closed, field, 1, 1, 1); // (1.5, 1.5, 1.5): room 1
    expect(p[11]).toBe(1); // in the open
    expect(p[7]).toBe(1); // room 1's class
    expect(p[3]).toBe(0); // no sky
    expect(Math.max(p[0], p[1], p[2])).toBe(0);
    const open = rooms({ open: true });
    const o = probe(open, bake(open).field, 1, 1, 1);
    expect(o[3]).toBeGreaterThan(0.1);
    expect(irradiance(open, bake(open).field, [1.5, 0.01, 1.5], [0, 1, 0], 1)).toBeGreaterThan(0.5);
    // Room 2, still roofed, stays dark.
    expect(probe(open, bake(open).field, 6, 1, 1)[3]).toBe(0);
  });

  it("a lamp lights its own room, not the room behind the wall; the bounce adds to it", () => {
    const scene = rooms({ lamp1: 4 });
    const one = bake(scene, 1);
    const lit = irradiance(scene, one.field, [2, 0.01, 2], [0, 1, 0], 1);
    expect(lit).toBeGreaterThan(0.3);
    expect(irradiance(scene, one.field, [6, 0.01, 2], [0, 1, 0], 2)).toBe(0);
    const two = bake(scene, 2);
    expect(irradiance(scene, two.field, [2, 0.01, 2], [0, 1, 0], 1)).toBeGreaterThan(lit);
  });

  it("a face takes light only from probes of its own room: room 2's probes don't light room 1's wall by the wall between", () => {
    const scene = rooms({ lamp1: 4 });
    const { field } = bake(scene, 2);
    // Room 2's side of the wall between (x 4.1, facing +x), with room 2's class: dark although room 1's lit probes are
    // within the trilinear reach (the wall is thinner than the grid).
    expect(irradiance(scene, field, [4.1, 1.5, 2], [1, 0, 0], 2)).toBe(0);
    expect(irradiance(scene, field, [3.9, 1.5, 2], [-1, 0, 0], 1)).toBeGreaterThan(0.05);
    expect(irradiance(scene, field, [3.9, 1.5, 2], [-1, 0, 0], OUTSIDE_CLASS)).toBeNaN();
  });

  it("a hole in a wall lets the light through after the boxes change (a panel blown open: the rebake)", () => {
    const scene = rooms({ lamp1: 6 });
    const baker = new Baker(scene);
    const n = probeCount(scene.grids[0]);
    const before = new Float32Array(n * PROBE_STRIDE);
    baker.bakeRange(0, 0, n, before);
    // Room 2's probes see room 1's lit faces only through a hole: replace the wall between by two halves with a gap.
    const b = Array.from(scene.boxes);
    const wall = b.findIndex((_, i) => i % BOX_STRIDE === 0 && b[i] === 4 && b[i + 1] === 1.5 && b[i + 2] === 2);
    b.splice(wall, BOX_STRIDE, ...box([4, 1.5, 0.5], [0.2, 3.2, 1.2]), ...box([4, 1.5, 3.5], [0.2, 3.2, 1.2]));
    baker.setBoxes(new Float32Array(b));
    const after = new Float32Array(n * PROBE_STRIDE);
    baker.bakeRange(0, 0, n, after);
    const sum = (f: Float32Array) => probe(scene, f, 4, 1, 2).slice(0, 3).reduce((a, c) => a + c, 0); // (4.5, 1.5, 2.5): room 2, by the gap
    expect(sum(before)).toBe(0);
    expect(sum(after)).toBeGreaterThan(0);
  });

  it("L1 to irradiance never goes black: the dimmest facing keeps 15 % of the mean", () => {
    // A strong light from above: c0 and cy alike (a delta's projection).
    const c0 = 1;
    const cy = 0.488603 / 0.282095;
    const mean = Math.PI * 0.282095 * c0;
    expect(shIrradiance(c0, cy, 0, 0, 0, -1, 0)).toBeCloseTo(0.15 * mean, 5);
    expect(shIrradiance(c0, cy, 0, 0, 0, 1, 0)).toBeCloseTo(1.85 * mean, 5);
    // A soft one keeps its own shape.
    expect(shIrradiance(c0, 0.1, 0, 0, 0, -1, 0)).toBeCloseTo(mean - 2.0943951 * 0.488603 * 0.1, 5);
  });
});
