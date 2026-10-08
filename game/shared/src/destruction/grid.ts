// Grid helpers for panels (Phase 4 M2): greedy rectangles over a cell mask, and the cells a flood from
// anchor cells reaches. Pure and deterministic: the same mask gives the same answer on every machine.

/** A rectangle of cells, [u0, u1) × [v0, v1). */
export interface CellRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * Cover every set cell of a w×h mask (row-major, v rows of u cells) with few rectangles: each new rectangle
 * starts at the first uncovered set cell in row order, runs as far along u as it can, then grows along v
 * while the whole run is set and uncovered below. Not the minimum, but stable and fast.
 */
export function greedyRects(mask: Uint8Array, w: number, h: number): CellRect[] {
  const used = new Uint8Array(w * h);
  const out: CellRect[] = [];
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const i = v * w + u;
      if (!mask[i] || used[i]) continue;
      let u1 = u + 1;
      while (u1 < w && mask[v * w + u1] && !used[v * w + u1]) u1++;
      let v1 = v + 1;
      grow: while (v1 < h) {
        for (let x = u; x < u1; x++) if (!mask[v1 * w + x] || used[v1 * w + x]) break grow;
        v1++;
      }
      for (let y = v; y < v1; y++) for (let x = u; x < u1; x++) used[y * w + x] = 1;
      out.push({ u0: u, v0: v, u1, v1 });
    }
  }
  return out;
}

/**
 * The set cells of `mask` that a 4-connected flood from the set cells `anchored` reaches (1) and the rest
 * (0). Scratch arrays are reused between calls.
 */
export function reachable(mask: Uint8Array, w: number, h: number, anchored: (u: number, v: number) => boolean, out: Uint8Array, stack: Int32Array): Uint8Array {
  out.fill(0);
  let top = 0;
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      const i = v * w + u;
      if (mask[i] && anchored(u, v)) {
        out[i] = 1;
        stack[top++] = i;
      }
    }
  while (top > 0) {
    const i = stack[--top];
    const u = i % w;
    const v = (i - u) / w;
    if (u > 0 && mask[i - 1] && !out[i - 1]) (out[i - 1] = 1), (stack[top++] = i - 1);
    if (u < w - 1 && mask[i + 1] && !out[i + 1]) (out[i + 1] = 1), (stack[top++] = i + 1);
    if (v > 0 && mask[i - w] && !out[i - w]) (out[i - w] = 1), (stack[top++] = i - w);
    if (v < h - 1 && mask[i + w] && !out[i + w]) (out[i + w] = 1), (stack[top++] = i + w);
  }
  return out;
}
