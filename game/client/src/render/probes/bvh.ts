// A bounding-volume hierarchy over the level's boxes, for the probe bake's rays (render/DESIGN.md §6.3). Plain arrays,
// no three.js: it runs in a worker and in Node tests. Boxes may be turned (outside items at a yaw, roof slopes): a ray
// meets one in the box's own frame.

/** Floats per box: centre (3), half sizes (3), the box-to-world rotation's rows (9), its material class (1). */
export const BOX_STRIDE = 16;

/** What a ray hit: the distance, the face's world normal, and the box. */
export interface Hit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  box: number;
}

/** A box's material class (its last float): what light does at it. */
export const enum BoxClass {
  /** Solid: an explicit style's index + 1, or 0 (its face's room decides). */
  Solid = 0,
  /** Glass: light passes. */
  Glass = -1,
  /** A barricade's planks: half the light passes, through the gaps. */
  Barricade = -2,
}

/** Boxes from a flat array (BOX_STRIDE floats each). */
export class BoxBvh {
  readonly boxes: Float32Array;
  readonly count: number;
  /** Per node: min xyz, max xyz. */
  private nodeBounds = new Float32Array(0);
  /** Per node: left child (or first box index into `order`), count (0 for an inner node: right = left + 1). */
  private nodeLeft = new Int32Array(0);
  private nodeCount = new Int32Array(0);
  private order = new Int32Array(0);
  /** Per box: its world bounds, and whether it's axis-aligned (no rotation to undo). */
  private bounds = new Float32Array(0);
  private aligned = new Uint8Array(0);
  private nodes = 0;

  constructor(boxes: Float32Array) {
    this.boxes = boxes;
    this.count = Math.floor(boxes.length / BOX_STRIDE);
    this.build();
  }

  private build(): void {
    const n = this.count;
    const b = this.boxes;
    this.bounds = new Float32Array(n * 6);
    this.aligned = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * BOX_STRIDE;
      const [cx, cy, cz, hx, hy, hz] = [b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5]];
      // The world extent of a turned box: |R| times its half sizes.
      const ex = Math.abs(b[o + 6]) * hx + Math.abs(b[o + 7]) * hy + Math.abs(b[o + 8]) * hz;
      const ey = Math.abs(b[o + 9]) * hx + Math.abs(b[o + 10]) * hy + Math.abs(b[o + 11]) * hz;
      const ez = Math.abs(b[o + 12]) * hx + Math.abs(b[o + 13]) * hy + Math.abs(b[o + 14]) * hz;
      this.bounds.set([cx - ex, cy - ey, cz - ez, cx + ex, cy + ey, cz + ez], i * 6);
      this.aligned[i] = b[o + 6] === 1 && b[o + 10] === 1 && b[o + 14] === 1 ? 1 : 0;
    }
    const maxNodes = Math.max(1, 2 * n);
    this.nodeBounds = new Float32Array(maxNodes * 6);
    this.nodeLeft = new Int32Array(maxNodes);
    this.nodeCount = new Int32Array(maxNodes);
    this.order = Int32Array.from({ length: n }, (_, i) => i);
    this.nodes = 0;
    if (n) this.split(this.alloc(), 0, n);
  }

  private alloc(): number {
    return this.nodes++;
  }

  /**
   * Node `node` over order[from, to): split where the surface area heuristic says (12 bins of box centres per axis),
   * or a leaf when no split pays (or two boxes or fewer).
   */
  private split(node: number, from: number, to: number): void {
    const nb = this.nodeBounds;
    const bb = this.bounds;
    let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    let [c0x, c0y, c0z, c1x, c1y, c1z] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = from; i < to; i++) {
      const o = this.order[i] * 6;
      x0 = Math.min(x0, bb[o]);
      y0 = Math.min(y0, bb[o + 1]);
      z0 = Math.min(z0, bb[o + 2]);
      x1 = Math.max(x1, bb[o + 3]);
      y1 = Math.max(y1, bb[o + 4]);
      z1 = Math.max(z1, bb[o + 5]);
      const cx = (bb[o] + bb[o + 3]) / 2;
      const cy = (bb[o + 1] + bb[o + 4]) / 2;
      const cz = (bb[o + 2] + bb[o + 5]) / 2;
      c0x = Math.min(c0x, cx);
      c0y = Math.min(c0y, cy);
      c0z = Math.min(c0z, cz);
      c1x = Math.max(c1x, cx);
      c1y = Math.max(c1y, cy);
      c1z = Math.max(c1z, cz);
    }
    nb.set([x0, y0, z0, x1, y1, z1], node * 6);
    const count = to - from;
    const leaf = () => {
      this.nodeLeft[node] = from;
      this.nodeCount[node] = count;
    };
    if (count <= 2) return leaf();
    const area = (a: number, b: number, c: number) => (a > 0 && b > 0 && c > 0 ? a * b + b * c + c * a : 0);
    const BINS = 12;
    let bestCost = Infinity;
    let bestAxis = -1;
    let bestSplit = 0;
    const cmin = [c0x, c0y, c0z];
    const cmax = [c1x, c1y, c1z];
    const binCount = new Int32Array(BINS);
    const binBox = new Float64Array(BINS * 6);
    for (let axis = 0; axis < 3; axis++) {
      const extent = cmax[axis] - cmin[axis];
      if (extent < 1e-6) continue;
      binCount.fill(0);
      for (let k = 0; k < BINS; k++) binBox.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], k * 6);
      for (let i = from; i < to; i++) {
        const o = this.order[i] * 6;
        const c = (bb[o + axis] + bb[o + axis + 3]) / 2;
        const k = Math.min(BINS - 1, Math.floor(((c - cmin[axis]) / extent) * BINS));
        binCount[k]++;
        for (let q = 0; q < 3; q++) {
          binBox[k * 6 + q] = Math.min(binBox[k * 6 + q], bb[o + q]);
          binBox[k * 6 + 3 + q] = Math.max(binBox[k * 6 + 3 + q], bb[o + 3 + q]);
        }
      }
      // Sweep from the left, then from the right, for each of the BINS - 1 planes.
      const leftArea = new Float64Array(BINS);
      const leftCount = new Int32Array(BINS);
      let lb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      let n = 0;
      for (let k = 0; k < BINS - 1; k++) {
        n += binCount[k];
        if (binCount[k]) for (let q = 0; q < 3; q++) {
          lb[q] = Math.min(lb[q], binBox[k * 6 + q]);
          lb[3 + q] = Math.max(lb[3 + q], binBox[k * 6 + 3 + q]);
        }
        leftCount[k] = n;
        leftArea[k] = area(lb[3] - lb[0], lb[4] - lb[1], lb[5] - lb[2]);
      }
      lb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      n = 0;
      for (let k = BINS - 1; k > 0; k--) {
        n += binCount[k];
        if (binCount[k]) for (let q = 0; q < 3; q++) {
          lb[q] = Math.min(lb[q], binBox[k * 6 + q]);
          lb[3 + q] = Math.max(lb[3 + q], binBox[k * 6 + 3 + q]);
        }
        const nl = leftCount[k - 1];
        if (!nl || !n) continue;
        const cost = leftArea[k - 1] * nl + area(lb[3] - lb[0], lb[4] - lb[1], lb[5] - lb[2]) * n;
        if (cost < bestCost) {
          bestCost = cost;
          bestAxis = axis;
          bestSplit = k;
        }
      }
    }
    const nodeArea = area(x1 - x0, y1 - y0, z1 - z0);
    // A leaf costs its box count; a split, one node test plus its children by area.
    if (bestAxis < 0 || (count <= 6 && bestCost / Math.max(nodeArea, 1e-9) + 1 >= count)) return leaf();
    // Partition by bin.
    const extent = cmax[bestAxis] - cmin[bestAxis];
    let i = from;
    let j = to - 1;
    while (i <= j) {
      const o = this.order[i] * 6;
      const c = (bb[o + bestAxis] + bb[o + bestAxis + 3]) / 2;
      const k = Math.min(BINS - 1, Math.floor(((c - cmin[bestAxis]) / extent) * BINS));
      if (k < bestSplit) i++;
      else {
        const t = this.order[i];
        this.order[i] = this.order[j];
        this.order[j] = t;
        j--;
      }
    }
    const mid = i === from || i === to ? (from + to) >> 1 : i;
    const left = this.alloc();
    this.alloc(); // its sibling, right after it
    this.nodeLeft[node] = left;
    this.nodeCount[node] = 0;
    this.split(left, from, mid);
    this.split(left + 1, mid, to);
  }

  /** The ray's entry distance into a node's bounds (Infinity if it misses or enters past tMax). */
  private enter(node: number, ox: number, oy: number, oz: number, ix: number, iy: number, iz: number, tMax: number): number {
    const nb = this.nodeBounds;
    const o = node * 6;
    let t0 = (nb[o] - ox) * ix;
    let t1 = (nb[o + 3] - ox) * ix;
    let lo = Math.min(t0, t1);
    let hi = Math.max(t0, t1);
    t0 = (nb[o + 1] - oy) * iy;
    t1 = (nb[o + 4] - oy) * iy;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    t0 = (nb[o + 2] - oz) * iz;
    t1 = (nb[o + 5] - oz) * iz;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    return hi >= Math.max(lo, 0) && lo < tMax ? Math.max(lo, 0) : Infinity;
  }

  /**
   * Where the ray meets box `i` (its entry distance, > 0) or Infinity; the entry face's world normal in `out` (when
   * given). A ray starting inside the box exits it: that counts as no hit (the box's own faces face away).
   */
  private boxHit(i: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: Hit | null): number {
    const b = this.boxes;
    const o = i * BOX_STRIDE;
    let px = ox - b[o];
    let py = oy - b[o + 1];
    let pz = oz - b[o + 2];
    let qx = dx;
    let qy = dy;
    let qz = dz;
    const turned = !this.aligned[i];
    if (turned) {
      // Into the box's frame: the rotation's transpose.
      const tx = b[o + 6] * px + b[o + 9] * py + b[o + 12] * pz;
      const ty = b[o + 7] * px + b[o + 10] * py + b[o + 13] * pz;
      const tz = b[o + 8] * px + b[o + 11] * py + b[o + 14] * pz;
      px = tx;
      py = ty;
      pz = tz;
      const ux = b[o + 6] * dx + b[o + 9] * dy + b[o + 12] * dz;
      const uy = b[o + 7] * dx + b[o + 10] * dy + b[o + 13] * dz;
      const uz = b[o + 8] * dx + b[o + 11] * dy + b[o + 14] * dz;
      qx = ux;
      qy = uy;
      qz = uz;
    }
    const hx = b[o + 3];
    const hy = b[o + 4];
    const hz = b[o + 5];
    let lo = -Infinity;
    let hi = Infinity;
    let axis = -1;
    let sign = 0;
    // x
    if (Math.abs(qx) < 1e-12) {
      if (Math.abs(px) > hx) return Infinity;
    } else {
      const inv = 1 / qx;
      let t0 = (-hx - px) * inv;
      let t1 = (hx - px) * inv;
      let s = -1;
      if (t0 > t1) {
        const t = t0;
        t0 = t1;
        t1 = t;
        s = 1;
      }
      if (t0 > lo) {
        lo = t0;
        axis = 0;
        sign = s;
      }
      if (t1 < hi) hi = t1;
    }
    // y
    if (Math.abs(qy) < 1e-12) {
      if (Math.abs(py) > hy) return Infinity;
    } else {
      const inv = 1 / qy;
      let t0 = (-hy - py) * inv;
      let t1 = (hy - py) * inv;
      let s = -1;
      if (t0 > t1) {
        const t = t0;
        t0 = t1;
        t1 = t;
        s = 1;
      }
      if (t0 > lo) {
        lo = t0;
        axis = 1;
        sign = s;
      }
      if (t1 < hi) hi = t1;
    }
    // z
    if (Math.abs(qz) < 1e-12) {
      if (Math.abs(pz) > hz) return Infinity;
    } else {
      const inv = 1 / qz;
      let t0 = (-hz - pz) * inv;
      let t1 = (hz - pz) * inv;
      let s = -1;
      if (t0 > t1) {
        const t = t0;
        t0 = t1;
        t1 = t;
        s = 1;
      }
      if (t0 > lo) {
        lo = t0;
        axis = 2;
        sign = s;
      }
      if (t1 < hi) hi = t1;
    }
    if (lo > hi || lo <= 1e-6 || axis < 0) return Infinity;
    if (out) {
      // The local normal (±axis) back to the world: a column of the rotation.
      if (turned) {
        out.nx = b[o + 6 + axis] * sign;
        out.ny = b[o + 9 + axis] * sign;
        out.nz = b[o + 12 + axis] * sign;
      } else {
        out.nx = axis === 0 ? sign : 0;
        out.ny = axis === 1 ? sign : 0;
        out.nz = axis === 2 ? sign : 0;
      }
    }
    return lo;
  }

  private readonly stack = new Int32Array(128);
  private readonly stackT = new Float64Array(128);
  private readonly scratch: Hit = { t: 0, nx: 0, ny: 0, nz: 0, box: -1 };

  /**
   * The nearest box the ray (unit direction) enters within `tMax`, written to `out` (true), or false. `skip(box)`
   * true lets a ray through a box (glass; a barricade's gaps, by chance).
   */
  trace(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMax: number, out: Hit, skip?: (box: number) => boolean): boolean {
    if (!this.count) return false;
    const ix = 1 / dx;
    const iy = 1 / dy;
    const iz = 1 / dz;
    let best = tMax;
    let found = -1;
    const stack = this.stack;
    const stackT = this.stackT;
    let sp = 0;
    const root = this.enter(0, ox, oy, oz, ix, iy, iz, best);
    if (root === Infinity) return false;
    stack[sp] = 0;
    stackT[sp++] = root;
    const s = this.scratch;
    while (sp) {
      sp--;
      if (stackT[sp] >= best) continue;
      const node = stack[sp];
      const count = this.nodeCount[node];
      const left = this.nodeLeft[node];
      if (count) {
        for (let k = left; k < left + count; k++) {
          const i = this.order[k];
          const t = this.boxHit(i, ox, oy, oz, dx, dy, dz, s);
          if (t < best && !(skip && skip(i))) {
            best = t;
            found = i;
            out.nx = s.nx;
            out.ny = s.ny;
            out.nz = s.nz;
          }
        }
      } else {
        // Nearer child last, so it's popped first.
        const a = this.enter(left, ox, oy, oz, ix, iy, iz, best);
        const b = this.enter(left + 1, ox, oy, oz, ix, iy, iz, best);
        if (sp + 2 > stack.length) continue;
        if (a <= b) {
          if (b !== Infinity) {
            stack[sp] = left + 1;
            stackT[sp++] = b;
          }
          if (a !== Infinity) {
            stack[sp] = left;
            stackT[sp++] = a;
          }
        } else {
          if (a !== Infinity) {
            stack[sp] = left;
            stackT[sp++] = a;
          }
          if (b !== Infinity) {
            stack[sp] = left + 1;
            stackT[sp++] = b;
          }
        }
      }
    }
    if (found < 0) return false;
    out.t = best;
    out.box = found;
    return true;
  }

  /** Whether anything (but what `skip` lets through) lies on the ray within `tMax`. */
  blocked(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMax: number, skip?: (box: number) => boolean): boolean {
    if (!this.count) return false;
    const ix = 1 / dx;
    const iy = 1 / dy;
    const iz = 1 / dz;
    const stack = this.stack;
    let sp = 0;
    stack[sp++] = 0;
    while (sp) {
      const node = stack[--sp];
      if (this.enter(node, ox, oy, oz, ix, iy, iz, tMax) === Infinity) continue;
      const count = this.nodeCount[node];
      const left = this.nodeLeft[node];
      if (count) {
        for (let k = left; k < left + count; k++) {
          const i = this.order[k];
          if (this.boxHit(i, ox, oy, oz, dx, dy, dz, null) < tMax && !(skip && skip(i))) return true;
        }
      } else if (sp + 2 <= stack.length) {
        stack[sp++] = left;
        stack[sp++] = left + 1;
      }
    }
    return false;
  }

  /** Whether the point is inside a box (of a class that blocks light). */
  inside(x: number, y: number, z: number): boolean {
    if (!this.count) return false;
    const stack = this.stack;
    let sp = 0;
    stack[sp++] = 0;
    const nb = this.nodeBounds;
    const b = this.boxes;
    while (sp) {
      const node = stack[--sp];
      const o = node * 6;
      if (x < nb[o] || y < nb[o + 1] || z < nb[o + 2] || x > nb[o + 3] || y > nb[o + 4] || z > nb[o + 5]) continue;
      const count = this.nodeCount[node];
      const left = this.nodeLeft[node];
      if (count) {
        for (let k = left; k < left + count; k++) {
          const i = this.order[k];
          const q = i * BOX_STRIDE;
          if (b[q + 15] === BoxClass.Glass) continue;
          const px = x - b[q];
          const py = y - b[q + 1];
          const pz = z - b[q + 2];
          // In the box's frame (the rotation's transpose).
          const lx = b[q + 6] * px + b[q + 9] * py + b[q + 12] * pz;
          const ly = b[q + 7] * px + b[q + 10] * py + b[q + 13] * pz;
          const lz = b[q + 8] * px + b[q + 11] * py + b[q + 14] * pz;
          if (Math.abs(lx) < b[q + 3] && Math.abs(ly) < b[q + 4] && Math.abs(lz) < b[q + 5]) return true;
        }
      } else if (sp + 2 <= stack.length) {
        stack[sp++] = left;
        stack[sp++] = left + 1;
      }
    }
    return false;
  }
}
