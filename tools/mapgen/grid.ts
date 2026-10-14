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

  /** Mark a rectangle [x0, y0, x1, y1] (u) as wall. */
  fill(x0: number, y0: number, x1: number, y1: number) {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.cellU));
    const i1 = Math.min(this.w - 1, Math.floor((x1 - this.x0) / this.cellU));
    const j0 = Math.max(0, Math.floor((y0 - this.y0) / this.cellU));
    const j1 = Math.min(this.h - 1, Math.floor((y1 - this.y0) / this.cellU));
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

  /** Is (x, y) outside every building (after floodOutside)? Off the grid counts as outside. */
  outside(x: number, y: number): boolean {
    const i = Math.floor((x - this.x0) / this.cellU);
    const j = Math.floor((y - this.y0) / this.cellU);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return true;
    return this.cells[j * this.w + i] === 2;
  }
}
