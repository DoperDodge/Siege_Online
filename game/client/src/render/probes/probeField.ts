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

/**
 * The GLSL a material adds to read the probes: probeLight(P, Ng, N, cls) → irradiance (rgb) and sky seen (a).
 *
 * One texture a grid (two samplers in all): a fragment shader may use only 16 textures on most GPUs (WebGL2's
 * guaranteed minimum; Chrome and Edge on Windows and most phones give exactly that), and the level's material needs
 * its own, the shadow map and the environment besides. A probe's 16 floats are four texels, their quarters stacked
 * along the texture's y (gridTexture). Every read is a texelFetch: no filtering, so float textures work everywhere.
 */
export function probeGlsl(): string {
  const grid = (S: string) => /* glsl */ `
uniform highp sampler3D tProbe${S};
uniform vec3 uProbe${S}Origin;
uniform vec3 uProbe${S}Spacing;
uniform vec3 uProbe${S}Dims;
// The probes round P in grid ${S} that are in the open and not behind the face (normal Ng), trilinearly weighted:
// rSame from those of room class cls (all of them if cls < 0), rAny from all of them. Each is the irradiance for the
// face's shading normal N (rgb) and the sky they see (a); x < 0 when there are none.
void probeGrid${S}( vec3 P, vec3 Ng, vec3 N, float cls, out vec4 rSame, out vec4 rAny ) {
  rSame = vec4( -1.0 );
  rAny = vec4( -1.0 );
  vec3 g = ( P + Ng * 0.1 - uProbe${S}Origin ) / uProbe${S}Spacing;
  // Within a cell of the grid's edge, read its edge (a floor under the lowest layer); farther out, not this grid.
  if ( any( lessThan( g, vec3( -1.0 ) ) ) || any( greaterThan( g, uProbe${S}Dims ) ) ) return;
  g = clamp( g, vec3( 0.0 ), uProbe${S}Dims - 1.0 );
  vec3 bf = min( floor( g ), uProbe${S}Dims - 2.0 );
  ivec3 b = ivec3( bf );
  vec3 f = g - bf;
  int ny = int( uProbe${S}Dims.y + 0.5 );
  vec3 s0 = vec3( 0.0 );
  vec3 sy = vec3( 0.0 );
  vec3 sz = vec3( 0.0 );
  vec3 sx = vec3( 0.0 );
  float sSky = 0.0;
  float sW = 0.0;
  vec3 a0 = vec3( 0.0 );
  vec3 ay = vec3( 0.0 );
  vec3 az = vec3( 0.0 );
  vec3 ax = vec3( 0.0 );
  float aSky = 0.0;
  float aW = 0.0;
  for ( int c = 0; c < 8; c++ ) {
    ivec3 o = ivec3( c & 1, ( c >> 1 ) & 1, ( c >> 2 ) & 1 );
    ivec3 q = b + o;
    vec4 t2 = texelFetch( tProbe${S}, ivec3( q.x, q.y + 2 * ny, q.z ), 0 );
    if ( t2.w < 0.5 ) continue;
    vec3 pp = uProbe${S}Origin + vec3( q ) * uProbe${S}Spacing - P;
    if ( dot( pp, Ng ) < -0.05 ) continue;
    vec3 wv = mix( 1.0 - f, f, vec3( o ) );
    float w = wv.x * wv.y * wv.z;
    if ( w <= 0.0 ) continue;
    vec4 t0 = texelFetch( tProbe${S}, q, 0 );
    vec4 t1 = texelFetch( tProbe${S}, ivec3( q.x, q.y + ny, q.z ), 0 );
    vec4 t3 = texelFetch( tProbe${S}, ivec3( q.x, q.y + 3 * ny, q.z ), 0 );
    a0 += t0.rgb * w;
    aSky += t0.a * w;
    ay += t1.rgb * w;
    az += t2.rgb * w;
    ax += t3.rgb * w;
    aW += w;
    if ( cls < 0.0 || abs( t1.w - cls ) <= 0.5 ) {
      s0 += t0.rgb * w;
      sSky += t0.a * w;
      sy += t1.rgb * w;
      sz += t2.rgb * w;
      sx += t3.rgb * w;
      sW += w;
    }
  }
  if ( sW >= 1e-4 ) rSame = vec4( shIrradiance( s0, sy, sz, sx, N ) / sW, sSky / sW );
  if ( aW >= 1e-4 ) rAny = vec4( shIrradiance( a0, ay, az, ax, N ) / aW, aSky / aW );
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
// The light the probes give a face at P (geometric normal Ng, shading normal N) in room class cls: the fine grid's
// probes of its room, then the coarse one's; failing both (a face whose room has no probe near), any room's; past them
// all, the open sky's.
vec4 probeLight( vec3 P, vec3 Ng, vec3 N, float cls ) {
  vec4 sameA;
  vec4 anyA;
  probeGridA( P, Ng, N, cls, sameA, anyA );
  if ( sameA.x >= 0.0 ) return sameA;
  vec4 sameB;
  vec4 anyB;
  probeGridB( P, Ng, N, cls, sameB, anyB );
  if ( sameB.x >= 0.0 ) return sameB;
  if ( anyA.x >= 0.0 ) return anyA;
  if ( anyB.x >= 0.0 ) return anyB;
  // (Half the sphere is sky out in the open: the ground hides the rest, as the yard's probes find.)
  return vec4( shIrradiance( uSkySH[ 0 ], uSkySH[ 1 ], uSkySH[ 2 ], uSkySH[ 3 ], N ), 0.5 );
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

/** How many texels a probe's record takes (PROBE_STRIDE floats, four a texel). */
const QUARTERS = PROBE_STRIDE / 4;

/**
 * A grid's texture from its field: w × (4 h) × d texels, the probe at (i, j, k) at (i, j + q h, k) for its record's
 * quarter q (the shader's probeGrid reads them so). Floats, read texel by texel (no filtering).
 */
function gridTexture(grid: GridSpec, field: Float32Array | null): THREE.Data3DTexture {
  const [w, h, d] = grid.dims;
  const tex = new THREE.Data3DTexture(new Float32Array(w * h * QUARTERS * d * 4), w, h * QUARTERS, d);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.FloatType;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  if (field) refill(tex, grid, field);
  tex.needsUpdate = true;
  return tex;
}

/** A field's floats into its grid's texture (gridTexture's layout), for a new upload. */
export function refill(tex: THREE.Data3DTexture, grid: GridSpec, field: Float32Array): void {
  const [w, h, d] = grid.dims;
  const data = tex.image.data as Float32Array;
  for (let k = 0; k < d; k++)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const o = (k * w * h + j * w + i) * PROBE_STRIDE;
        for (let q = 0; q < QUARTERS; q++) {
          const t = ((k * h * QUARTERS + (j + q * h)) * w + i) * 4;
          data[t] = field[o + q * 4];
          data[t + 1] = field[o + q * 4 + 1];
          data[t + 2] = field[o + q * 4 + 2];
          data[t + 3] = field[o + q * 4 + 3];
        }
      }
  tex.needsUpdate = true;
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
  /** A texture a grid (the labs' one grid serves both of the shader's). */
  private readonly textures: THREE.Data3DTexture[];
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
    this.textures = this.grids.slice(0, 2).map((g) => gridTexture(g, null));
    const u = (S: string, g: GridSpec, tex: THREE.Data3DTexture) => ({
      [`tProbe${S}`]: { value: tex },
      [`uProbe${S}Origin`]: { value: new THREE.Vector3(...g.origin) },
      [`uProbe${S}Spacing`]: { value: new THREE.Vector3(...g.spacing) },
      [`uProbe${S}Dims`]: { value: new THREE.Vector3(...g.dims) },
    });
    this.uniforms = {
      uProbeOn: { value: 0 },
      uSkySH: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      ...u("A", A, this.textures[0]),
      ...u("B", B, this.textures[1] ?? this.textures[0]),
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
      if (f && this.textures[g]) refill(this.textures[g], this.grids[g], f);
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
    for (const t of this.textures) t.dispose();
  }
}
