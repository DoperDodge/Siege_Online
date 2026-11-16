// Lofted shapes (Phase 10 M8): a model built from smooth parts, each a skin over a run of cross-sections (rings),
// with balls, soft-edged boxes, bars and straps made the same way. Faces are turned outward by each part's volume and
// normals are smooth along it; colour and roughness are per vertex, so a whole model is one material and one draw;
// each vertex notes the bone it rides (a body's: bodyModel.ts; the first-person arms': fpArms.ts).
import * as THREE from "three";

export type V3 = readonly [number, number, number];

/** One cross-section of a lofted part: its centre, its two half axes, and how square it is (2 round … 8 a box). */
export interface Ring {
  c: V3;
  u: V3;
  v: V3;
  n: number;
  color?: string;
}

export interface RingOpts {
  x?: number;
  y?: number;
  z?: number;
  n?: number;
  /** A ring across y: how much lower its back (+z) is than its front, per metre of depth (a helmet's rim). */
  tilt?: number;
  color?: string;
}

/** A ring across y (a limb's, the trunk's): half sizes rx across and rz deep, centred at (x, y, z). */
export const ringY = (y: number, rx: number, rz: number, o: RingOpts = {}): Ring => ({ c: [o.x ?? 0, y, o.z ?? 0], u: [rx, 0, 0], v: [0, -(o.tilt ?? 0) * rz, rz], n: o.n ?? 2, color: o.color });
/** A ring across z (a boot's, a snout's): half sizes rx across and ry up, centred at (x, y, z). */
export const ringZ = (z: number, rx: number, ry: number, o: RingOpts = {}): Ring => ({ c: [o.x ?? 0, o.y ?? 0, z], u: [rx, 0, 0], v: [0, ry, 0], n: o.n ?? 2, color: o.color });

const COLORS = new Map<string, THREE.Color>();
const colorOf = (hex: string): THREE.Color => {
  let c = COLORS.get(hex);
  if (!c) COLORS.set(hex, (c = new THREE.Color(hex)));
  return c;
};

const A = new THREE.Vector3();
const B = new THREE.Vector3();
const C = new THREE.Vector3();
const N = new THREE.Vector3();

/** Collects a model's parts: positions, smooth normals, colours, roughness and the bone each vertex rides. */
export class Shaper {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly rough: number[] = [];
  readonly bone: number[] = [];
  readonly index: number[] = [];
  private b = 0;
  private color = "#808080";
  private r = 0.85;
  private m: THREE.Matrix4 | null = null;

  /** Parts from here on ride this bone (its index; a model with no bones leaves it at 0). */
  on(bone: number): this {
    this.b = bone;
    return this;
  }

  /** Parts from here on are this colour, this rough (cloth 0.85 … a lens 0.15). */
  paint(color: string, rough = 0.85): this {
    this.color = color;
    this.r = rough;
    return this;
  }

  /** Parts added by `fn` are turned and moved by `m` (in the bone's frame). */
  with(m: THREE.Matrix4, fn: () => void): void {
    const was = this.m;
    this.m = was ? was.clone().multiply(m) : m;
    fn();
    this.m = was;
  }

  /** A skin over the rings in order, `segs` round; its ends closed flat if asked. Normals are smooth along it. */
  loft(rings: readonly Ring[], segs = 12, cap0 = false, cap1 = false): void {
    const pts: THREE.Vector3[] = [];
    const cols: string[] = [];
    const tris: number[] = [];
    const add = (p: THREE.Vector3, color: string) => {
      if (this.m) p.applyMatrix4(this.m);
      pts.push(p);
      cols.push(color);
      return pts.length - 1;
    };
    const ringPoint = (ring: Ring, j: number): THREE.Vector3 => {
      const a = (j / segs) * Math.PI * 2;
      const e = 2 / ring.n;
      const cu = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** e;
      const cv = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** e;
      return new THREE.Vector3(ring.c[0] + ring.u[0] * cu + ring.v[0] * cv, ring.c[1] + ring.u[1] * cu + ring.v[1] * cv, ring.c[2] + ring.u[2] * cu + ring.v[2] * cv);
    };
    rings.forEach((ring) => {
      for (let j = 0; j < segs; j++) add(ringPoint(ring, j), ring.color ?? this.color);
    });
    for (let i = 0; i + 1 < rings.length; i++)
      for (let j = 0; j < segs; j++) {
        const a = i * segs + j;
        const b = i * segs + ((j + 1) % segs);
        const c = (i + 1) * segs + ((j + 1) % segs);
        const d = (i + 1) * segs + j;
        tris.push(a, b, c, a, c, d);
      }
    // The ends: their own vertices (a hard edge), wound as the sides' edges ask.
    const cap = (ring: Ring, start: boolean) => {
      const centre = add(new THREE.Vector3(ring.c[0], ring.c[1], ring.c[2]), ring.color ?? this.color);
      const first = pts.length;
      for (let j = 0; j < segs; j++) add(ringPoint(ring, j), ring.color ?? this.color);
      for (let j = 0; j < segs; j++) {
        const p = first + j;
        const q = first + ((j + 1) % segs);
        if (start) tris.push(centre, q, p);
        else tris.push(centre, p, q);
      }
    };
    if (cap0) cap(rings[0], true);
    if (cap1) cap(rings[rings.length - 1], false);
    this.emit(pts, cols, tris);
  }

  /** Vertices and triangles into the body: faces turned outward (by the part's volume), normals summed per vertex. */
  private emit(pts: readonly THREE.Vector3[], cols: readonly string[], tris: number[]): void {
    const g = new THREE.Vector3();
    for (const p of pts) g.add(p);
    g.divideScalar(pts.length);
    let vol = 0;
    for (let t = 0; t < tris.length; t += 3) {
      A.subVectors(pts[tris[t]], g);
      B.subVectors(pts[tris[t + 1]], g);
      C.subVectors(pts[tris[t + 2]], g);
      vol += A.dot(N.crossVectors(B, C));
    }
    if (vol < 0) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]];
    const normals = pts.map(() => new THREE.Vector3());
    for (let t = 0; t < tris.length; t += 3) {
      A.subVectors(pts[tris[t + 1]], pts[tris[t]]);
      B.subVectors(pts[tris[t + 2]], pts[tris[t]]);
      N.crossVectors(A, B);
      normals[tris[t]].add(N);
      normals[tris[t + 1]].add(N);
      normals[tris[t + 2]].add(N);
    }
    const base = this.pos.length / 3;
    pts.forEach((p, i) => {
      const n = normals[i];
      if (n.lengthSq() < 1e-20) n.subVectors(p, g);
      if (n.lengthSq() < 1e-20) n.set(0, 1, 0);
      n.normalize();
      const c = colorOf(cols[i]);
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(c.r, c.g, c.b);
      this.rough.push(this.r);
      this.bone.push(this.b);
    });
    for (const i of tris) this.index.push(base + i);
  }

  /** A ball (or an egg: a radius per axis). */
  ball(c: V3, r: number | V3, segs = 10, stacks = 6): void {
    const [rx, ry, rz] = typeof r === "number" ? [r, r, r] : r;
    const rings: Ring[] = [];
    for (let k = 0; k <= stacks; k++) {
      const phi = -Math.PI / 2 + (Math.PI * k) / stacks;
      const w = Math.max(1e-4, Math.cos(phi));
      rings.push({ c: [c[0], c[1] + ry * Math.sin(phi), c[2]], u: [rx * w, 0, 0], v: [0, 0, rz * w], n: 2 });
    }
    this.loft(rings, segs);
  }

  /** A box with soft edges, centred at c: skinned along its thinnest side, its outline rounded (n: 2 an oval … 8 square). */
  box(c: V3, size: V3, n = 5, bevel = 0.004, segs = 12): void {
    const t = size[0] <= size[1] && size[0] <= size[2] ? 0 : size[1] <= size[2] ? 1 : 2;
    const [ua, va] = t === 0 ? [1, 2] : t === 1 ? [0, 2] : [0, 1];
    const h = size[t] / 2;
    const bv = Math.min(bevel, h * 0.9, size[ua] * 0.3, size[va] * 0.3);
    const ring = (at: number, inset: number): Ring => {
      const cc = [c[0], c[1], c[2]];
      cc[t] += at;
      const u = [0, 0, 0];
      const v = [0, 0, 0];
      u[ua] = size[ua] / 2 - inset;
      v[va] = size[va] / 2 - inset;
      return { c: cc as unknown as V3, u: u as unknown as V3, v: v as unknown as V3, n };
    };
    this.loft([ring(-h, bv), ring(-h + bv, 0), ring(h - bv, 0), ring(h, bv)], segs, true, true);
  }

  /** A round bar from a to b (r at a, r1 at b). */
  bar(a: V3, b: V3, r: number, r1 = r, segs = 8, caps = true): void {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u);
    const ring = (p: V3, rr: number): Ring => ({ c: p, u: [u.x * rr, u.y * rr, u.z * rr], v: [v.x * rr, v.y * rr, v.z * rr], n: 2 });
    this.loft([ring(a, r), ring(b, r1)], segs, caps, caps);
  }

  /** A flat strap along a path: `width` across it (a vector), `thick` through it. */
  strap(path: readonly V3[], width: V3, thick: number): void {
    const w = new THREE.Vector3(width[0], width[1], width[2]);
    const rings: Ring[] = path.map((p, k) => {
      const a = path[Math.max(0, k - 1)];
      const b = path[Math.min(path.length - 1, k + 1)];
      const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const out = new THREE.Vector3().crossVectors(t, w).normalize().multiplyScalar(thick / 2);
      return { c: p, u: [w.x / 2, w.y / 2, w.z / 2], v: [out.x, out.y, out.z], n: 6 };
    });
    this.loft(rings, 8, true, true);
  }

  get triangles(): number {
    return this.index.length / 3;
  }

  /** The parts as one geometry; `skinned`: each vertex bound whole to its bone. */
  geometry(skinned: boolean): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aRough", new THREE.Float32BufferAttribute(this.rough, 1));
    if (skinned) {
      const n = this.bone.length;
      const idx = new Uint16Array(n * 4);
      const w = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        idx[i * 4] = this.bone[i];
        w[i * 4] = 1;
      }
      g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(w, 4));
    }
    g.setIndex(this.index);
    return g;
  }
}
