// A plan raster (world u) for the questions the generator asks of a whole storey: which side of a wall is
// outside the building, and later which rooms are closed. Coarse on purpose: half a u is 7.5 cm.
export class PlanGrid {
  readonly w: number;
  readonly h: number;
  /** 1 = wall, 2 = reached from outside by the flood, 0 = enclosed (inside a building). */
  readonly cells: Uint8Array;

  constructor(
    readonly x0: number,
    readonly y0: number,
    x1: number,
    y1: number,
    readonly cellU: number,
  ) {
    this.w = Math.ceil((x1 - x0) / cellU);
    this.h = Math.ceil((y1 - y0) / cellU);
    this.cells = new Uint8Array(this.w * this.h);
  }

  /** An empty grid over the same cells (x0 + w·cell would round to an extra column now and then). */
  blank(): PlanGrid {
    return new PlanGrid(this.x0, this.y0, this.x0 + (this.w - 0.5) * this.cellU, this.y0 + (this.h - 0.5) * this.cellU, this.cellU);
  }

  /** Mark a rectangle [x0, y0, x1, y1] (u) as wall. */
  fill(x0: number, y0: number, x1: number, y1: number) {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.cellU));
    const i1 = Math.min(this.w - 1, Math.floor((x1 - this.x0) / this.cellU));
    const j0 = Math.max(0, Math.floor((y0 - this.y0) / this.cellU));
    const j1 = Math.min(this.h - 1, Math.floor((y1 - this.y0) / this.cellU));
    for (let j = j0; j <= j1; j++) this.cells.fill(1, j * this.w + i0, j * this.w + i1 + 1);
  }

  /**
   * Mark as wall the cells whose centre lies inside [x0, x1) x [y0, y1): no rounding outward, so two boxes
   * a cell apart leave that cell open (a slot as narrow as two cells always shows).
   */
  fillCentres(x0: number, y0: number, x1: number, y1: number) {
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / this.cellU - 0.5));
    const i1 = Math.min(this.w - 1, Math.ceil((x1 - this.x0) / this.cellU - 0.5) - 1);
    const j0 = Math.max(0, Math.ceil((y0 - this.y0) / this.cellU - 0.5));
    const j1 = Math.min(this.h - 1, Math.ceil((y1 - this.y0) / this.cellU - 0.5) - 1);
    if (i1 < i0) return;
    for (let j = j0; j <= j1; j++) this.cells.fill(1, j * this.w + i0, j * this.w + i1 + 1);
  }

  /** Flood from every border cell through cells that aren't wall: what it reaches is outside. */
  floodOutside() {
    const { w, h, cells } = this;
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    const push = (i: number) => {
      if (cells[i] !== 0) return;
      cells[i] = 2;
      queue[tail++] = i;
    };
    for (let i = 0; i < w; i++) {
      push(i);
      push((h - 1) * w + i);
    }
    for (let j = 0; j < h; j++) {
      push(j * w);
      push(j * w + w - 1);
    }
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < (h - 1) * w) push(i + w);
    }
  }

  /** Number the enclosed regions (after floodOutside): 1, 2, … per cell inside; 0 for wall and outside. */
  labelInside(): { labels: Int32Array; count: number } {
    const { w, h, cells } = this;
    const labels = new Int32Array(w * h);
    const queue = new Int32Array(w * h);
    let count = 0;
    for (let start = 0; start < cells.length; start++) {
      if (cells[start] !== 0 || labels[start] !== 0) continue;
      const id = ++count;
      let head = 0;
      let tail = 0;
      labels[start] = id;
      queue[tail++] = start;
      const visit = (n: number) => {
        if (cells[n] !== 0 || labels[n] !== 0) return;
        labels[n] = id;
        queue[tail++] = n;
      };
      while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (i >= w) visit(i - w);
        if (i < (h - 1) * w) visit(i + w);
      }
    }
    return { labels, count };
  }

  /** The cell index at (x, y), or -1 off the grid. */
  index(x: number, y: number): number {
    const i = Math.floor((x - this.x0) / this.cellU);
    const j = Math.floor((y - this.y0) / this.cellU);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }

  /** Is (x, y) outside every building (after floodOutside)? Off the grid counts as outside. */
  outside(x: number, y: number): boolean {
    const i = Math.floor((x - this.x0) / this.cellU);
    const j = Math.floor((y - this.y0) / this.cellU);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return true;
    return this.cells[j * this.w + i] === 2;
  }
}

/** [x0, y0, x1, y1] in whatever units the caller works in. */
export type Rect = [number, number, number, number];

/**
 * Cover the cells of a w × h grid where `keep(i)` holds with rectangles, greedily: from the first cell not yet
 * covered in reading order, as wide as its run goes, then as deep as every row of that width allows. Cell
 * ranges [i0, j0, i1, j1), end-exclusive. Deterministic: the same mask gives the same rectangles.
 */
export function greedyRects(w: number, h: number, keep: (i: number) => boolean): Rect[] {
  const done = new Uint8Array(w * h);
  const free = (i: number) => done[i] === 0 && keep(i);
  const out: Rect[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!free(j * w + i)) continue;
      let i1 = i + 1;
      while (i1 < w && free(j * w + i1)) i1++;
      let j1 = j + 1;
      for (; j1 < h; j1++) {
        let row = true;
        for (let x = i; x < i1 && row; x++) row = free(j1 * w + x);
        if (!row) break;
      }
      for (let y = j; y < j1; y++) done.fill(1, y * w + i, y * w + i1);
      out.push([i, j, i1, j1]);
    }
  }
  return out;
}

/**
 * A rectangle minus holes, as few rectangles as vertical strips allow: cut at every hole's x edges, take what
 * each strip keeps, and merge neighbouring strips that keep the same intervals. Holes may overlap each other
 * or poke out of `outer`.
 */
export function subtractRects(outer: Rect, holes: Rect[]): Rect[] {
  const [ox0, oy0, ox1, oy1] = outer;
  const inside = holes.filter((r) => r[2] > ox0 && r[0] < ox1 && r[3] > oy0 && r[1] < oy1);
  const xs = [...new Set([ox0, ox1, ...inside.flatMap((r) => [Math.max(ox0, r[0]), Math.min(ox1, r[2])])])].sort((a, b) => a - b);
  const strips: { x0: number; x1: number; keep: [number, number][] }[] = [];
  for (let s = 0; s + 1 < xs.length; s++) {
    const [x0, x1] = [xs[s], xs[s + 1]];
    if (x1 - x0 <= 1e-9) continue;
    const cuts = inside
      .filter((r) => r[0] < x1 - 1e-9 && r[2] > x0 + 1e-9)
      .map((r): [number, number] => [Math.max(oy0, r[1]), Math.min(oy1, r[3])])
      .sort((a, b) => a[0] - b[0]);
    const keep: [number, number][] = [];
    let y = oy0;
    for (const [c0, c1] of cuts) {
      if (c0 > y + 1e-9) keep.push([y, c0]);
      y = Math.max(y, c1);
    }
    if (oy1 > y + 1e-9) keep.push([y, oy1]);
    const last = strips[strips.length - 1];
    if (last && Math.abs(last.x1 - x0) < 1e-9 && JSON.stringify(last.keep) === JSON.stringify(keep)) last.x1 = x1;
    else strips.push({ x0, x1, keep });
  }
  return strips.flatMap((s) => s.keep.map(([y0, y1]): Rect => [s.x0, y0, s.x1, y1]));
}

/** The largest value of a per-cell array (`w` cells a row) inside a cell rectangle [i0, j0, i1, j1). */
export function maxIn(a: ArrayLike<number>, w: number, r: Rect): number {
  let m = -Infinity;
  for (let j = r[1]; j < r[3]; j++) for (let i = r[0]; i < r[2]; i++) m = Math.max(m, a[j * w + i]);
  return m;
}

/**
 * Chessboard distance, in cells, from each cell where `inside(i)` holds to the nearest cell where it doesn't
 * (the grid's edge counts as outside); 0 outside. Two passes.
 */
export function distanceInside(w: number, h: number, inside: (i: number) => boolean): Int32Array {
  const d = new Int32Array(w * h);
  const big = w + h;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = j * w + i;
      if (!inside(c)) continue;
      const up = j > 0 ? d[c - w] : 0;
      const left = i > 0 ? d[c - 1] : 0;
      const ul = i > 0 && j > 0 ? d[c - w - 1] : 0;
      const ur = i < w - 1 && j > 0 ? d[c - w + 1] : 0;
      d[c] = Math.min(big, up, left, ul, ur) + 1;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const c = j * w + i;
      if (d[c] === 0) continue;
      const down = j < h - 1 ? d[c + w] : 0;
      const right = i < w - 1 ? d[c + 1] : 0;
      const dr = i < w - 1 && j < h - 1 ? d[c + w + 1] : 0;
      const dl = i > 0 && j < h - 1 ? d[c + w - 1] : 0;
      d[c] = Math.min(d[c], down + 1, right + 1, dr + 1, dl + 1);
    }
  }
  return d;
}
