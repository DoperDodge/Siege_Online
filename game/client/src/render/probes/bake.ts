// The probe bake (render/DESIGN.md §6.3): grids of points, each holding the light arriving from every direction as L1
// spherical harmonics, found by tracing rays against the level's boxes (bvh.ts): the sky where a ray escapes, and
// where it hits a face, that face's albedo times the light on it — the sun (if the face sees it), the room's lamps,
// and, from the second pass on, the light the probes found in the pass before (a bounce). Each probe also keeps how
// much of the sky it sees (the page dims sky reflections by it), the room it's in (by the art's room maps, so a face
// takes light only from probes of its own room: walls are thinner than the grid), and whether it's in the open (not
// inside a box). Plain arrays, no three.js: it runs in workers and Node tests.
import { BOX_STRIDE, BoxBvh, BoxClass, type Hit } from "./bvh.js";

/** Floats per probe: c0.rgb, sky seen, cy.rgb, room class, cz.rgb, open (1) or not (0), cx.rgb, 0. */
export const PROBE_STRIDE = 16;
/** SH basis constants: Y0, and Y1 (times the direction's y, z or x). */
export const SH_Y0 = 0.282095;
export const SH_Y1 = 0.488603;
/** A face's room is read this far off it, along its normal (as the shader reads it: levelArt.ts). */
const ROOM_OFFSET_M = 0.15;
/** Room codes (levelArt.ts): rooms below ZONE_CODE; anything from it up is outside, one class. */
const ZONE_CODE = 200;
const OUTSIDE_CODE = 240;
export const OUTSIDE_CLASS = 255;

export interface GridSpec {
  origin: [number, number, number];
  spacing: [number, number, number];
  dims: [number, number, number];
}

export interface RoomMaps {
  data: Uint8Array;
  x0: number;
  z0: number;
  cell: number;
  w: number;
  h: number;
  layers: number;
}

export interface BakeScene {
  boxes: Float32Array;
  rooms: RoomMaps;
  /** Each storey's floor height (the room map layer a height is on: the last whose floor is within 10 cm under it). */
  floors: number[];
  /** Room code (0–255) → style index (code 0 is read as OUTSIDE_CODE + storey first). */
  roomStyle: Int32Array;
  /** Per style: the wall, floor and ceiling materials. */
  styles: Int32Array;
  /** Per material: linear albedo r, g, b. */
  albedo: Float32Array;
  /** The sky, RGBA floats, rows from straight up, `w` columns around (u = atan(z, x) / 2π + 0.5), times `scale`. */
  sky: { w: number; h: number; data: Float32Array; scale: number };
  /** Toward the sun (unit), and its irradiance at normal incidence (linear rgb). */
  sun: { dir: [number, number, number]; irradiance: [number, number, number] };
  /** Per lamp: x, y, z, intensity r, g, b (irradiance at 1 m), its room class. */
  lamps: Float32Array;
  grids: GridSpec[];
  rays: number;
}

export const LAMP_STRIDE = 7;
/** A lamp's light falls off with distance squared, but no faster than from a metre away (a fixture's size and shade). */
const LAMP_NEAR_M2 = 1.5;
/**
 * How much of a lamp's direction a probe keeps (1: all). A fixture is a shaded, sizeable source in a room whose walls
 * spread its light: taken as a point, the probes just under it see only "from above", and the ceiling over each lamp
 * goes dark in blotches.
 */
const LAMP_DIRECTIONAL = 0.5;

/** A grid's probe count. */
export const probeCount = (g: GridSpec) => g.dims[0] * g.dims[1] * g.dims[2];

/** The room class of a room code: the room's code, or OUTSIDE_CLASS for the outside, its zones and anything off the map. */
export const roomClass = (code: number) => (code > 0 && code < ZONE_CODE ? code : OUTSIDE_CLASS);

/** Directions spread evenly over the sphere (a spherical Fibonacci set). */
export function sphereDirections(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = golden * i;
    out.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
  }
  return out;
}

/** A small, fast, seeded random number generator (mulberry32). */
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

export class Baker {
  readonly bvh: BoxBvh;
  private readonly dirs: Float32Array;
  private readonly hit: Hit = { t: 0, nx: 0, ny: 0, nz: 0, box: -1 };
  private random = rng(1);
  /** Each grid's probes after the last pass (null before any). */
  fields: (Float32Array | null)[];
  private readonly skip = (box: number) => {
    const c = this.scene.boxes[box * BOX_STRIDE + 15];
    return c === BoxClass.Glass || (c === BoxClass.Barricade && this.random() < 0.5);
  };

  constructor(private scene: BakeScene) {
    this.bvh = new BoxBvh(scene.boxes);
    this.dirs = sphereDirections(scene.rays);
    this.fields = scene.grids.map(() => null);
  }

  /** Replace the boxes (a panel changed): the hierarchy is rebuilt; the fields stay for the next bounce. */
  setBoxes(boxes: Float32Array): void {
    this.scene = { ...this.scene, boxes };
    (this as { bvh: BoxBvh }).bvh = new BoxBvh(boxes);
  }

  /** The room code at a point: its storey's room map, or OUTSIDE_CODE + the storey off the rooms. */
  codeAt(x: number, y: number, z: number): number {
    const fl = this.scene.floors;
    let s = 0;
    for (let i = 0; i < Math.min(8, fl.length); i++) if (fl[i] - 0.1 <= y) s = i;
    const r = this.scene.rooms;
    const u = Math.floor((x - r.x0) / r.cell);
    const v = Math.floor((z - r.z0) / r.cell);
    const code = u < 0 || v < 0 || u >= r.w || v >= r.h || s >= r.layers ? 0 : r.data[s * r.w * r.h + v * r.w + u];
    return code || OUTSIDE_CODE + s;
  }

  /** The albedo of the face at h with normal n, written to `out`. */
  private albedo(box: number, hx: number, hy: number, hz: number, nx: number, ny: number, nz: number, out: Float32Array): void {
    const sc = this.scene;
    const cls = sc.boxes[box * BOX_STRIDE + 15];
    const style = cls > 0 ? cls - 1 : sc.roomStyle[this.codeAt(hx + nx * ROOM_OFFSET_M, hy + ny * ROOM_OFFSET_M, hz + nz * ROOM_OFFSET_M)];
    const slot = ny > 0.7 ? 1 : ny < -0.7 ? 2 : 0;
    const m = sc.styles[style * 3 + slot];
    out[0] = sc.albedo[m * 3];
    out[1] = sc.albedo[m * 3 + 1];
    out[2] = sc.albedo[m * 3 + 2];
  }

  /** The sky's radiance toward unit direction d (bilinear), written to `out`. */
  sky(dx: number, dy: number, dz: number, out: Float32Array): void {
    const s = this.scene.sky;
    const u = (Math.atan2(dz, dx) / (2 * Math.PI) + 0.5) * s.w - 0.5;
    const v = ((Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, dy)))) / Math.PI) * s.h - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.max(0, Math.min(s.h - 1, Math.floor(v)));
    const y1 = Math.min(s.h - 1, y0 + 1);
    const fx = u - x0;
    const fy = Math.max(0, Math.min(1, v - y0));
    const xa = ((x0 % s.w) + s.w) % s.w;
    const xb = (xa + 1) % s.w;
    for (let k = 0; k < 3; k++) {
      const a = s.data[(y0 * s.w + xa) * 4 + k] * (1 - fx) + s.data[(y0 * s.w + xb) * 4 + k] * fx;
      const b = s.data[(y1 * s.w + xa) * 4 + k] * (1 - fx) + s.data[(y1 * s.w + xb) * 4 + k] * fx;
      out[k] = (a * (1 - fy) + b * fy) * s.scale;
    }
  }

  /**
   * The direct light on a face: the sun (with its shadow) and the lamps of its room, added to `out`. A lamp's light on a
   * face is taken as unshadowed: its room is the face's room (walls between rooms cut it off), and the furniture's
   * shadows are left to the screen-space occlusion.
   */
  private direct(hx: number, hy: number, hz: number, nx: number, ny: number, nz: number, cls: number, out: Float32Array): void {
    const sc = this.scene;
    const [sx, sy, sz] = sc.sun.dir;
    const cosS = nx * sx + ny * sy + nz * sz;
    const ex = hx + nx * 1e-3;
    const ey = hy + ny * 1e-3;
    const ez = hz + nz * 1e-3;
    if (cosS > 0 && !this.bvh.blocked(ex, ey, ez, sx, sy, sz, 400, this.skip)) {
      out[0] += sc.sun.irradiance[0] * cosS;
      out[1] += sc.sun.irradiance[1] * cosS;
      out[2] += sc.sun.irradiance[2] * cosS;
    }
    const L = sc.lamps;
    for (let i = 0; i < L.length; i += LAMP_STRIDE) {
      if (L[i + 6] !== cls) continue;
      let lx = L[i] - hx;
      let ly = L[i + 1] - hy;
      let lz = L[i + 2] - hz;
      const d2 = lx * lx + ly * ly + lz * lz;
      const d = Math.sqrt(d2);
      lx /= d;
      ly /= d;
      lz /= d;
      const c = nx * lx + ny * ly + nz * lz;
      if (c <= 0) continue;
      const k = c / Math.max(d2, LAMP_NEAR_M2);
      out[0] += L[i + 3] * k;
      out[1] += L[i + 4] * k;
      out[2] += L[i + 5] * k;
    }
  }

  private readonly tmpA = new Float32Array(3);
  private readonly tmpE = new Float32Array(3);
  private readonly tmpL = new Float32Array(3);
  private readonly tmpF = new Float32Array(12);

  /**
   * One pass over the probes of grid `g` in [from, to): each probe's 16 floats into `out` (indexed by probe). The
   * bounce comes from `this.fields` (the last pass), when there is one.
   */
  bakeRange(g: number, from: number, to: number, out: Float32Array): void {
    for (let p = from; p < to; p++) this.bakeProbe(g, p, out, p * PROBE_STRIDE);
  }

  /** One probe (index `p` of grid `g`) into out[o, o + PROBE_STRIDE). */
  bakeProbe(g: number, p: number, out: Float32Array, o: number): void {
    const grid = this.scene.grids[g];
    const [nx, ny] = [grid.dims[0], grid.dims[1]];
    const n = this.scene.rays;
    const dirs = this.dirs;
    const hit = this.hit;
    const A = this.tmpA;
    const E = this.tmpE;
    const L = this.tmpL;
    const bounce = this.fields.some((f) => f !== null);
    {
      const i = p % nx;
      const j = Math.floor(p / nx) % ny;
      const k = Math.floor(p / (nx * ny));
      const px = grid.origin[0] + i * grid.spacing[0];
      const py = grid.origin[1] + j * grid.spacing[1];
      const pz = grid.origin[2] + k * grid.spacing[2];
      const cls = roomClass(this.codeAt(px, py, pz));
      out.fill(0, o, o + PROBE_STRIDE);
      out[o + 7] = cls;
      if (this.bvh.inside(px, py, pz)) return;
      out[o + 11] = 1;
      // A random turn of the directions per probe (seeded by it: the same bake every time).
      this.random = rng(p * 7919 + g * 104729 + 1);
      const [qx, qy, qz, qw] = randomQuat(this.random);
      let seen = 0;
      const sh = this.tmpF;
      sh.fill(0);
      for (let r = 0; r < n; r++) {
        // The direction turned by the quaternion (v + 2w(q×v) + 2q×(q×v)).
        const vx = dirs[r * 3];
        const vy = dirs[r * 3 + 1];
        const vz = dirs[r * 3 + 2];
        const tx = 2 * (qy * vz - qz * vy);
        const ty = 2 * (qz * vx - qx * vz);
        const tz = 2 * (qx * vy - qy * vx);
        const dx = vx + qw * tx + (qy * tz - qz * ty);
        const dy = vy + qw * ty + (qz * tx - qx * tz);
        const dz = vz + qw * tz + (qx * ty - qy * tx);
        if (this.bvh.trace(px, py, pz, dx, dy, dz, 300, hit, this.skip)) {
          // Hitting a face from behind: inside a solid (a probe skimming a box): no light that way.
          if (hit.nx * dx + hit.ny * dy + hit.nz * dz > 0) continue;
          const hx = px + dx * hit.t;
          const hy = py + dy * hit.t;
          const hz = pz + dz * hit.t;
          E.fill(0);
          const hcls = roomClass(this.codeAt(hx + hit.nx * ROOM_OFFSET_M, hy + hit.ny * ROOM_OFFSET_M, hz + hit.nz * ROOM_OFFSET_M));
          this.direct(hx, hy, hz, hit.nx, hit.ny, hit.nz, hcls, E);
          if (bounce) this.irradiance(hx + hit.nx * 0.3, hy + hit.ny * 0.3, hz + hit.nz * 0.3, hit.nx, hit.ny, hit.nz, hcls, E);
          this.albedo(hit.box, hx, hy, hz, hit.nx, hit.ny, hit.nz, A);
          L[0] = (A[0] * E[0]) / Math.PI;
          L[1] = (A[1] * E[1]) / Math.PI;
          L[2] = (A[2] * E[2]) / Math.PI;
        } else {
          this.sky(dx, dy, dz, L);
          seen++;
        }
        for (let c = 0; c < 3; c++) {
          sh[c] += L[c] * SH_Y0;
          sh[3 + c] += L[c] * SH_Y1 * dy;
          sh[6 + c] += L[c] * SH_Y1 * dz;
          sh[9 + c] += L[c] * SH_Y1 * dx;
        }
      }
      const w = (4 * Math.PI) / n;
      // The room's lamps, straight onto the probe: a point of light in its direction.
      const lamps = this.scene.lamps;
      for (let l = 0; l < lamps.length; l += LAMP_STRIDE) {
        if (lamps[l + 6] !== cls) continue;
        let lx = lamps[l] - px;
        let ly = lamps[l + 1] - py;
        let lz = lamps[l + 2] - pz;
        const d2 = lx * lx + ly * ly + lz * lz;
        const d = Math.sqrt(d2);
        lx /= d;
        ly /= d;
        lz /= d;
        if (this.bvh.blocked(px, py, pz, lx, ly, lz, d - 0.05, this.skip)) continue;
        const k = 1 / Math.max(d2, LAMP_NEAR_M2) / w; // added before the weight below
        const kd = k * LAMP_DIRECTIONAL;
        for (let c = 0; c < 3; c++) {
          sh[c] += lamps[l + 3 + c] * k * SH_Y0;
          sh[3 + c] += lamps[l + 3 + c] * kd * SH_Y1 * ly;
          sh[6 + c] += lamps[l + 3 + c] * kd * SH_Y1 * lz;
          sh[9 + c] += lamps[l + 3 + c] * kd * SH_Y1 * lx;
        }
      }
      for (let c = 0; c < 3; c++) {
        out[o + c] = sh[c] * w;
        out[o + 4 + c] = sh[3 + c] * w;
        out[o + 8 + c] = sh[6 + c] * w;
        out[o + 12 + c] = sh[9 + c] * w;
      }
      out[o + 3] = seen / n;
    }
  }

  /**
   * The irradiance the last pass's probes give a face at (x, y, z) facing n, of room class `cls`, added to `out`:
   * the probes round it that are in the open, of its room, and not behind it, trilinearly weighted (the shader's
   * rule: probeField.ts).
   */
  irradiance(x: number, y: number, z: number, nx: number, ny: number, nz: number, cls: number, out: Float32Array): void {
    const grids = this.scene.grids;
    for (let g = 0; g < grids.length; g++) {
      const f = this.fields[g];
      if (!f) continue;
      const grid = grids[g];
      // Within a cell of the grid's edge, its edge (as the shader reads it: probeField.ts).
      const p = [x, y, z];
      const g3 = [0, 0, 0];
      let inGrid = true;
      for (let q = 0; q < 3; q++) {
        const gq = (p[q] - grid.origin[q]) / grid.spacing[q];
        if (gq < -1 || gq > grid.dims[q]) inGrid = false;
        g3[q] = Math.max(0, Math.min(grid.dims[q] - 1, gq));
      }
      if (!inGrid) continue;
      if (evalField(f, grid, g3[0], g3[1], g3[2], x, y, z, nx, ny, nz, cls, out)) return;
    }
  }
}

/** Sample a field at grid coordinates (gx, gy, gz) for a face at (x, y, z), normal n, room class cls (any if negative); add its irradiance to `out`. False if no probe counts. */
export function evalField(f: Float32Array, grid: GridSpec, gx: number, gy: number, gz: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, cls: number, out: Float32Array): boolean {
  const [dx, dy, dz] = grid.dims;
  const i0 = Math.min(dx - 2, Math.max(0, Math.floor(gx)));
  const j0 = Math.min(dy - 2, Math.max(0, Math.floor(gy)));
  const k0 = Math.min(dz - 2, Math.max(0, Math.floor(gz)));
  const fx = gx - i0;
  const fy = gy - j0;
  const fz = gz - k0;
  let wsum = 0;
  const acc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let c = 0; c < 8; c++) {
    const ci = i0 + (c & 1);
    const cj = j0 + ((c >> 1) & 1);
    const ck = k0 + ((c >> 2) & 1);
    const o = (ck * dx * dy + cj * dx + ci) * PROBE_STRIDE;
    if (f[o + 11] < 0.5 || (cls >= 0 && f[o + 7] !== cls)) continue;
    const ppx = grid.origin[0] + ci * grid.spacing[0] - x;
    const ppy = grid.origin[1] + cj * grid.spacing[1] - y;
    const ppz = grid.origin[2] + ck * grid.spacing[2] - z;
    if (ppx * nx + ppy * ny + ppz * nz < -0.05) continue;
    const w = (c & 1 ? fx : 1 - fx) * ((c >> 1) & 1 ? fy : 1 - fy) * ((c >> 2) & 1 ? fz : 1 - fz);
    if (w <= 0) continue;
    wsum += w;
    for (let q = 0; q < 3; q++) {
      acc[q] += f[o + q] * w;
      acc[3 + q] += f[o + 4 + q] * w;
      acc[6 + q] += f[o + 8 + q] * w;
      acc[9 + q] += f[o + 12 + q] * w;
    }
  }
  if (wsum < 1e-4) return false;
  for (let q = 0; q < 3; q++) out[q] += shIrradiance(acc[q], acc[3 + q], acc[6 + q], acc[9 + q], nx, ny, nz) / wsum;
  return true;
}

/**
 * L1 spherical harmonics (c0, then the y, z and x coefficients) to irradiance for normal n: the mean plus the
 * directional part, limited so the dimmest facing keeps 15 % of the mean (L1 rings: a lamp right over a probe would
 * make the face under it pitch black). The shader does the same (probeField.ts).
 */
export function shIrradiance(c0: number, cy: number, cz: number, cx: number, nx: number, ny: number, nz: number): number {
  const mean = Math.PI * SH_Y0 * c0;
  const l1 = ((2 * Math.PI) / 3) * SH_Y1;
  const amp = l1 * Math.sqrt(cy * cy + cz * cz + cx * cx);
  const k = Math.min(1, (0.85 * Math.max(mean, 0)) / Math.max(amp, 1e-6));
  return Math.max(0, mean + k * l1 * (cy * ny + cz * nz + cx * nx));
}

/** A uniformly random rotation (a unit quaternion: Shoemake's method). */
function randomQuat(rand: () => number): [number, number, number, number] {
  const u1 = rand();
  const u2 = rand() * 2 * Math.PI;
  const u3 = rand() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}
