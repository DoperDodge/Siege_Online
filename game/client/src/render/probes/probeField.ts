// The probe field on a page (render/DESIGN.md §6.3, §6.4): bakes the level's probes in workers (bake.ts) — a first
// pass of direct light, then a pass with its bounce — uploads them as 3D textures the level's materials read (the GLSL
// below), and bakes again round any panel that changes (a hole lets light in). Before the first pass is in, the shader
// is told to leave the light as it was (uProbeOn 0).
import * as THREE from "three";
import type { BuiltLevel } from "@redmond/shared";
import { BOX_STRIDE } from "./bvh.js";
import { evalField, PROBE_STRIDE, probeCount, SH_Y0, SH_Y1, type BakeScene, type GridSpec } from "./bake.js";
import { bakeGrids, joinBoxes, panelBoxes } from "./scene.js";

/** Probes per job a worker takes. */
const CHUNK = 1536;
/** How far round a changed panel probes are baked again (m). */
const REBAKE_M = 4;

/** The GLSL a material adds to read the probes: probeLight(P, Ng, N, cls) → irradiance (rgb) and sky seen (a). */
export function probeGlsl(): string {
  const grid = (S: string) => /* glsl */ `
uniform highp sampler3D tProbe${S}0;
uniform highp sampler3D tProbe${S}1;
uniform highp sampler3D tProbe${S}2;
uniform highp sampler3D tProbe${S}3;
uniform vec3 uProbe${S}Origin;
uniform vec3 uProbe${S}Spacing;
uniform vec3 uProbe${S}Dims;
// The probes round P in grid ${S} that are in the open, of room class cls (any if cls < 0) and not behind the face
// (normal Ng), trilinearly weighted; their irradiance for the face's shading normal N, and the sky they see.
vec4 probeGrid${S}( vec3 P, vec3 Ng, vec3 N, float cls ) {
  vec3 g = ( P + Ng * 0.1 - uProbe${S}Origin ) / uProbe${S}Spacing;
  // Within a cell of the grid's edge, read its edge (a floor under the lowest layer); farther out, not this grid.
  if ( any( lessThan( g, vec3( -1.0 ) ) ) || any( greaterThan( g, uProbe${S}Dims ) ) ) return vec4( -1.0 );
  g = clamp( g, vec3( 0.0 ), uProbe${S}Dims - 1.0 );
  vec3 bf = min( floor( g ), uProbe${S}Dims - 2.0 );
  ivec3 b = ivec3( bf );
  vec3 f = g - bf;
  vec3 c0 = vec3( 0.0 );
  vec3 cy = vec3( 0.0 );
  vec3 cz = vec3( 0.0 );
  vec3 cx = vec3( 0.0 );
  float sky = 0.0;
  float wsum = 0.0;
  for ( int c = 0; c < 8; c++ ) {
    ivec3 o = ivec3( c & 1, ( c >> 1 ) & 1, ( c >> 2 ) & 1 );
    ivec3 q = b + o;
    vec4 a2 = texelFetch( tProbe${S}2, q, 0 );
    if ( a2.w < 0.5 ) continue;
    vec4 a1 = texelFetch( tProbe${S}1, q, 0 );
    if ( cls >= 0.0 && abs( a1.w - cls ) > 0.5 ) continue;
    vec3 pp = uProbe${S}Origin + vec3( q ) * uProbe${S}Spacing - P;
    if ( dot( pp, Ng ) < -0.05 ) continue;
    vec3 wv = mix( 1.0 - f, f, vec3( o ) );
    float w = wv.x * wv.y * wv.z;
    if ( w <= 0.0 ) continue;
    vec4 a0 = texelFetch( tProbe${S}0, q, 0 );
    vec4 a3 = texelFetch( tProbe${S}3, q, 0 );
    c0 += a0.rgb * w;
    sky += a0.a * w;
    cy += a1.rgb * w;
    cz += a2.rgb * w;
    cx += a3.rgb * w;
    wsum += w;
  }
  if ( wsum < 1e-4 ) return vec4( -1.0 );
  return vec4( shIrradiance( c0, cy, cz, cx, N ) / wsum, sky / wsum );
}
`;
  return /* glsl */ `
uniform float uProbeOn;
// The open sky's light (L1: c0, then y, z, x), the ground under it included: what lights a face past every probe.
uniform vec3 uSkySH[ 4 ];
// L1 spherical harmonics to irradiance for normal N, per channel: the mean (π Y0 c0) plus the directional part, that
// part limited so the dimmest facing keeps 15 % of the mean (a lamp right over a probe would make the face under it
// pitch black: L1 rings).
vec3 shIrradiance( vec3 c0, vec3 cy, vec3 cz, vec3 cx, vec3 N ) {
  vec3 mean = PI * 0.282095 * c0;
  vec3 amp = 2.0943951 * 0.488603 * sqrt( cy * cy + cz * cz + cx * cx );
  vec3 k = min( vec3( 1.0 ), 0.85 * max( mean, vec3( 0.0 ) ) / max( amp, vec3( 1e-6 ) ) );
  vec3 e = mean + k * 2.0943951 * 0.488603 * ( cy * N.y + cz * N.z + cx * N.x );
  return max( e, vec3( 0.0 ) );
}
${grid("A")}
${grid("B")}
// The light the probes give a face at P (geometric normal Ng, shading normal N) in room class cls: the fine grid, then
// the coarse one; failing both (a face whose room has no probe near), any room's; past them all, the open sky's.
vec4 probeLight( vec3 P, vec3 Ng, vec3 N, float cls ) {
  vec4 r = probeGridA( P, Ng, N, cls );
  if ( r.x < 0.0 ) r = probeGridB( P, Ng, N, cls );
  if ( r.x < 0.0 ) r = probeGridA( P, Ng, N, -1.0 );
  if ( r.x < 0.0 ) r = probeGridB( P, Ng, N, -1.0 );
  // (Half the sphere is sky out in the open: the ground hides the rest, as the yard's probes find.)
  if ( r.x < 0.0 ) r = vec4( shIrradiance( uSkySH[ 0 ], uSkySH[ 1 ], uSkySH[ 2 ], uSkySH[ 3 ], N ), 0.5 );
  return r;
}
`;
}

/** A point's grid coordinates, clamped to the grid within a cell of its edge (as the shader reads it); null farther out. */
export function gridCoords(grid: GridSpec, x: number, y: number, z: number): [number, number, number] | null {
  const out: [number, number, number] = [0, 0, 0];
  const p = [x, y, z];
  for (let k = 0; k < 3; k++) {
    const g = (p[k] - grid.origin[k]) / grid.spacing[k];
    if (g < -1 || g > grid.dims[k]) return null;
    out[k] = Math.max(0, Math.min(grid.dims[k] - 1, g));
  }
  return out;
}

/** The sky the nearest open probe sees, round grid coordinates (gx, gy, gz). */
function skySeen(f: Float32Array, grid: GridSpec, gx: number, gy: number, gz: number): number {
  const [dx, dy] = grid.dims;
  let best = -1;
  let bestD = Infinity;
  for (let c = 0; c < 8; c++) {
    const i = Math.min(grid.dims[0] - 1, Math.floor(gx) + (c & 1));
    const j = Math.min(grid.dims[1] - 1, Math.floor(gy) + ((c >> 1) & 1));
    const k = Math.min(grid.dims[2] - 1, Math.floor(gz) + ((c >> 2) & 1));
    const o = (k * dx * dy + j * dx + i) * PROBE_STRIDE;
    if (f[o + 11] < 0.5) continue;
    const d = (i - gx) ** 2 + (j - gy) ** 2 + (k - gz) ** 2;
    if (d < bestD) {
      bestD = d;
      best = f[o + 3];
    }
  }
  return Math.max(0, best);
}

/**
 * The open sky's light as L1 spherical harmonics (c0, cy, cz, cx per channel: probes/bake.ts's layout): the sky's
 * radiance above the horizon (`env`: RGBA floats, rows from the zenith), and below it the ground, lit by the sky and the
 * sun (`sunIrradiance` on a face up) with albedo `groundAlbedo`.
 */
export function openSkySH(env: Float32Array, w: number, h: number, sunIrradiance: readonly number[], groundAlbedo: number): THREE.Vector3[] {
  const sh = [0, 1, 2, 3].map(() => [0, 0, 0]);
  // The sky's irradiance on a face up, for the ground's light.
  const skyUp = [0, 0, 0];
  for (let y = 0; y < h / 2; y++) {
    const el = (0.5 - (y + 0.5) / h) * Math.PI;
    const dOmega = ((2 * Math.PI) / w) * (Math.PI / h) * Math.cos(el);
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) skyUp[k] += env[(y * w + x) * 4 + k] * Math.sin(el) * dOmega;
  }
  const ground = [0, 1, 2].map((k) => (groundAlbedo * (skyUp[k] + sunIrradiance[k])) / Math.PI);
  for (let y = 0; y < h; y++) {
    const el = (0.5 - (y + 0.5) / h) * Math.PI;
    const dOmega = ((2 * Math.PI) / w) * (Math.PI / h) * Math.cos(el);
    for (let x = 0; x < w; x++) {
      const az = ((x + 0.5) / w - 0.5) * 2 * Math.PI;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      for (let k = 0; k < 3; k++) {
        const L = el >= 0 ? env[(y * w + x) * 4 + k] : ground[k];
        sh[0][k] += L * SH_Y0 * dOmega;
        sh[1][k] += L * SH_Y1 * d[1] * dOmega;
        sh[2][k] += L * SH_Y1 * d[2] * dOmega;
        sh[3][k] += L * SH_Y1 * d[0] * dOmega;
      }
    }
  }
  return sh.map((c) => new THREE.Vector3(c[0], c[1], c[2]));
}

/** A grid's four textures (16 floats a probe split four ways) from its field. */
function gridTextures(grid: GridSpec, field: Float32Array | null): THREE.Data3DTexture[] {
  const [w, h, d] = grid.dims;
  const n = w * h * d;
  return [0, 1, 2, 3].map((t) => {
    const data = new Float32Array(n * 4);
    if (field) for (let p = 0; p < n; p++) data.set(field.subarray(p * PROBE_STRIDE + t * 4, p * PROBE_STRIDE + t * 4 + 4), p * 4);
    const tex = new THREE.Data3DTexture(data, w, h, d);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.FloatType;
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return tex;
  });
}

/** A field's floats into its textures' data (the same split), for a new upload. */
function refill(textures: THREE.Data3DTexture[], field: Float32Array): void {
  textures.forEach((tex, t) => {
    const data = tex.image.data as Float32Array;
    const n = data.length / 4;
    for (let p = 0; p < n; p++) {
      const o = p * PROBE_STRIDE + t * 4;
      data[p * 4] = field[o];
      data[p * 4 + 1] = field[o + 1];
      data[p * 4 + 2] = field[o + 2];
      data[p * 4 + 3] = field[o + 3];
    }
    tex.needsUpdate = true;
  });
}

interface Job {
  grid: number;
  probes: Int32Array;
}

export class ProbeField {
  /** The uniforms every lit material reads (the same objects in each). */
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly grids: GridSpec[];
  /** Each grid's probes as last baked (null before the first pass). */
  readonly fields: (Float32Array | null)[];
  /** The first pass is in (the materials read the probes). */
  ready = false;
  /** Passes finished, and how long the first and all took (ms). */
  passes = 0;
  timing = { first: 0, all: 0 };
  private readonly textures: THREE.Data3DTexture[][];
  private readonly workers: Worker[] = [];
  private readonly statics: Float32Array;
  private readonly panels: number[][];
  private busy = false;
  private pending = new Set<number>();
  private disposed = false;

  constructor(
    private readonly level: BuiltLevel,
    /** The scene's art parts: probes/scene.ts's statics and the level art's bake scene for given boxes and grids. */
    private readonly makeScene: (boxes: Float32Array, grids: GridSpec[]) => BakeScene,
    statics: Float32Array,
    private readonly workerCount = Math.max(1, Math.min(6, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1)),
  ) {
    this.grids = bakeGrids(level);
    this.statics = statics;
    this.panels = level.panels.list.map((e) => panelBoxes(e));
    this.fields = this.grids.map(() => null);
    // Two grids always (a lab's one grid serves twice): the shader reads A then B.
    const A = this.grids[0];
    const B = this.grids[1] ?? this.grids[0];
    this.textures = [gridTextures(A, null), this.grids[1] ? gridTextures(B, null) : []];
    const u = (S: string, g: GridSpec, tex: THREE.Data3DTexture[]) => ({
      [`tProbe${S}0`]: { value: tex[0] },
      [`tProbe${S}1`]: { value: tex[1] },
      [`tProbe${S}2`]: { value: tex[2] },
      [`tProbe${S}3`]: { value: tex[3] },
      [`uProbe${S}Origin`]: { value: new THREE.Vector3(...g.origin) },
      [`uProbe${S}Spacing`]: { value: new THREE.Vector3(...g.spacing) },
      [`uProbe${S}Dims`]: { value: new THREE.Vector3(...g.dims) },
    });
    this.uniforms = {
      uProbeOn: { value: 0 },
      uSkySH: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      ...u("A", A, this.textures[0]),
      ...u("B", B, this.textures[1].length ? this.textures[1] : this.textures[0]),
    };
  }

  private boxes(): Float32Array {
    return joinBoxes(this.statics, this.panels);
  }

  /** Start the workers with the scene. */
  private start(): void {
    if (this.workers.length) return;
    const scene = this.makeScene(this.boxes(), this.grids);
    for (let i = 0; i < this.workerCount; i++) {
      const w = new Worker(new URL("./probes.worker.ts", import.meta.url), { type: "module" });
      w.postMessage({ kind: "init", scene });
      this.workers.push(w);
    }
  }

  /** Run the jobs on the workers; each result lands in its grid's field. */
  private async run(jobs: Job[]): Promise<void> {
    let next = 0;
    let id = 0;
    const fields = this.fields.map((f, g) => f ?? new Float32Array(probeCount(this.grids[g]) * PROBE_STRIDE));
    this.grids.forEach((_, g) => (this.fields[g] = fields[g]));
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((resolve) => {
            const take = () => {
              if (this.disposed || next >= jobs.length) return resolve();
              const job = jobs[next++];
              const mine = ++id;
              const on = (e: MessageEvent<{ id: number; out: Float32Array }>) => {
                if (e.data.id !== mine) return;
                w.removeEventListener("message", on);
                const f = fields[job.grid];
                for (let i = 0; i < job.probes.length; i++) f.set(e.data.out.subarray(i * PROBE_STRIDE, (i + 1) * PROBE_STRIDE), job.probes[i] * PROBE_STRIDE);
                take();
              };
              w.addEventListener("message", on);
              w.postMessage({ kind: "bake", id: mine, grid: job.grid, probes: job.probes });
            };
            take();
          }),
      ),
    );
  }

  /** Every probe of every grid, in jobs. */
  private allJobs(): Job[] {
    const jobs: Job[] = [];
    this.grids.forEach((g, gi) => {
      const n = probeCount(g);
      for (let from = 0; from < n; from += CHUNK) jobs.push({ grid: gi, probes: Int32Array.from({ length: Math.min(CHUNK, n - from) }, (_, i) => from + i) });
    });
    return jobs;
  }

  /** The fields to every worker, for the next pass's bounce. */
  private shareFields(): void {
    for (const w of this.workers) w.postMessage({ kind: "fields", fields: this.fields.map((f) => f && f.slice()) });
  }

  private upload(): void {
    this.fields.forEach((f, g) => {
      if (f && this.textures[g]?.length) refill(this.textures[g], f);
    });
  }

  /** Bake every probe: the direct pass (the materials switch to the probes when it's in: `onFirst`), then the bounce. */
  async bake(passes = 2, onFirst?: () => void): Promise<void> {
    const t0 = performance.now();
    this.start();
    this.busy = true;
    for (let p = 0; p < passes && !this.disposed; p++) {
      if (p > 0) this.shareFields();
      await this.run(this.allJobs());
      this.upload();
      this.passes = p + 1;
      if (p === 0) {
        this.timing.first = performance.now() - t0;
        this.ready = true;
        onFirst?.();
      }
    }
    this.shareFields();
    this.timing.all = performance.now() - t0;
    this.busy = false;
    if (this.pending.size) void this.rebake();
  }

  /** Panels that changed (PanelView): their boxes anew, and the probes round them baked again (soon after, together). */
  panelsChanged(indices: Iterable<number>): void {
    for (const i of indices) this.pending.add(i);
    if (!this.busy && this.ready && this.pending.size) void this.rebake();
  }

  private async rebake(): Promise<void> {
    this.busy = true;
    // Gather what changed in the next few frames too (an explosion opens several panels).
    await new Promise((r) => setTimeout(r, 120));
    const changed = [...this.pending];
    this.pending.clear();
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const i of changed) {
      const e = this.level.panels.list[i];
      this.panels[i] = panelBoxes(e);
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], e.min[k] - REBAKE_M);
        hi[k] = Math.max(hi[k], e.max[k] + REBAKE_M);
      }
    }
    const boxes = this.boxes();
    for (const w of this.workers) w.postMessage({ kind: "boxes", boxes });
    const jobs: Job[] = [];
    this.grids.forEach((g, gi) => {
      const list: number[] = [];
      const [nx, ny, nz] = g.dims;
      const range = (k: number, n: number) => [Math.max(0, Math.floor((lo[k] - g.origin[k]) / g.spacing[k])), Math.min(n - 1, Math.ceil((hi[k] - g.origin[k]) / g.spacing[k]))];
      const [i0, i1] = range(0, nx);
      const [j0, j1] = range(1, ny);
      const [k0, k1] = range(2, nz);
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) list.push(i + nx * (j + ny * k));
      for (let from = 0; from < list.length; from += CHUNK) jobs.push({ grid: gi, probes: Int32Array.from(list.slice(from, from + CHUNK)) });
    });
    await this.run(jobs);
    this.upload();
    this.shareFields();
    this.busy = false;
    if (this.pending.size) void this.rebake();
  }

  /**
   * The probes' light at a point: the mean irradiance (luminance) over the four level facings — what lights the walls
   * round you; a lamp straight overhead doesn't make the room look brighter — and the mean of the sky they see (for the
   * gun in hand and the exposure: artView.ts). Null where no probe reaches (over the grids: the open sky).
   */
  lightAt(x: number, y: number, z: number, cls: number): { irradiance: number; sky: number } | null {
    const out = new Float32Array(3);
    let sum = 0;
    let sky = 0;
    let found = 0;
    for (const [nx, ny, nz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      out.fill(0);
      for (let g = 0; g < this.grids.length; g++) {
        const f = this.fields[g];
        const grid = this.grids[g];
        if (!f) continue;
        const g3 = gridCoords(grid, x, y, z);
        if (!g3) continue;
        const [gx, gy, gz] = g3;
        if (evalField(f, grid, gx, gy, gz, x, y, z, nx, ny, nz, cls, out) || evalField(f, grid, gx, gy, gz, x, y, z, nx, ny, nz, -1, out)) {
          sky += skySeen(f, grid, gx, gy, gz);
          found++;
          break;
        }
      }
      sum += 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
    }
    return found ? { irradiance: sum / found, sky: sky / found } : null;
  }

  /** Boxes the bake sees now (tests). */
  get boxCount(): number {
    return this.boxes().length / BOX_STRIDE;
  }

  dispose(): void {
    this.disposed = true;
    for (const w of this.workers) w.terminate();
    for (const set of this.textures) for (const t of set) t.dispose();
  }
}
