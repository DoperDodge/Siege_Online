// Checks on a compiled level (DESIGN §9.2 items 4 and 5): hard geometry never overlaps a panel (a soft wall
// behind a hard box would be bulletproof), panels never overlap each other, no two visible faces of different
// colours lie in one plane (they would flicker), and the budgets the engine was sized for hold. Errors fail
// `npm run mapgen` and the tests.

interface Box {
  id: string;
  center: [number, number, number];
  size: [number, number, number];
  surface: string;
  bodiesOnly?: boolean;
  yawDeg?: number;
}

/** Surfaces built as panels (data/destruction.json surfaces). */
export const PANEL_SURFACES = new Set(["SOFT_WALL", "REINFORCEABLE", "REINFORCED_WALL", "SOFT_FLOOR", "HATCH", "BARRICADE", "WINDOW"]);
export const BUDGET = { colliders: 2500, panels: 300, cellsPerLayer: 600_000, panelCells: 6400, cellM: 0.05, overlapM: 0.01, levelBytes: 500_000 } as const;

export interface CheckReport {
  errors: string[];
  panels: number;
  colliders: number;
  cellsPerLayer: number;
}

/** How deep two boxes overlap on their shallowest axis (≤ 0 when apart). */
export function overlapDepth(a: Box, b: Box): number {
  let depth = Infinity;
  for (let i = 0; i < 3; i++) {
    const d = Math.min(a.center[i] + a.size[i] / 2, b.center[i] + b.size[i] / 2) - Math.max(a.center[i] - a.size[i] / 2, b.center[i] - b.size[i] / 2);
    depth = Math.min(depth, d);
  }
  return depth;
}

/** Cells per layer of a panel: a wall's width runs along its longer side, a floor lies flat. */
export function panelCells(b: Box): number {
  const flat = b.surface === "SOFT_FLOOR" || b.surface === "HATCH";
  const [w, h] = flat ? [b.size[0], b.size[2]] : [Math.max(b.size[0], b.size[2]), b.size[1]];
  return Math.max(1, Math.round(w / BUDGET.cellM)) * Math.max(1, Math.round(h / BUDGET.cellM));
}

/** A box's corners, [min, max] per axis, turned by its yaw when that is a quarter turn; null for any other yaw. */
function extent(b: Box): [number[], number[]] | null {
  const yaw = (((b.yawDeg ?? 0) % 180) + 180) % 180;
  if (yaw !== 0 && yaw !== 90) return null;
  const size = yaw === 90 ? [b.size[2], b.size[1], b.size[0]] : b.size;
  return [b.center.map((c, i) => c - size[i] / 2), b.center.map((c, i) => c + size[i] / 2)];
}

/**
 * Faces two visible boxes of different surfaces share (DESIGN §9.2 item 4's lint): in one plane (1 mm), looking
 * the same way, overlapping more than 1 cm both ways. Drawn in different colours, they flicker. A face another
 * box lies flat against (a bottom on the ground) can't be seen and doesn't count. Boxes turned by anything but
 * a quarter turn aren't checked.
 */
export function coplanarFaces(solids: Box[]): string[] {
  const E = 0.001;
  const boxes = solids.filter((s) => !s.bodiesOnly).flatMap((b) => {
    const e = extent(b);
    return e ? [{ b, lo: e[0], hi: e[1] }] : [];
  });
  type Ext = (typeof boxes)[number];
  /** Does a box lie against the face (axis `ax`, plane `at`, looking `dir`) over all of [r0, r1] in the other axes? */
  const covered = (ax: number, dir: number, at: number, r0: number[], r1: number[], skip: Ext[]) =>
    boxes.some((c) => !skip.includes(c) && Math.abs((dir > 0 ? c.lo : c.hi)[ax] - at) < E && [0, 1, 2].every((k) => k === ax || (c.lo[k] <= r0[k] + E && c.hi[k] >= r1[k] - E)));
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (a.b.surface === b.b.surface || [0, 1, 2].some((k) => a.hi[k] < b.lo[k] - E || b.hi[k] < a.lo[k] - E)) continue;
      const r0 = [0, 1, 2].map((k) => Math.max(a.lo[k], b.lo[k]));
      const r1 = [0, 1, 2].map((k) => Math.min(a.hi[k], b.hi[k]));
      for (let ax = 0; ax < 3; ax++) {
        if ([0, 1, 2].some((k) => k !== ax && r1[k] - r0[k] <= BUDGET.overlapM)) continue;
        for (const dir of [-1, 1]) {
          const [pa, pb] = dir < 0 ? [a.lo[ax], b.lo[ax]] : [a.hi[ax], b.hi[ax]];
          if (Math.abs(pa - pb) >= E || covered(ax, dir, pa, r0, r1, [a, b])) continue;
          out.push(`${a.b.id} (${a.b.surface}) and ${b.b.id} (${b.b.surface}) share a face looking ${dir < 0 ? "-" : "+"}${"xyz"[ax]} at ${pa.toFixed(3)} m`);
        }
      }
    }
  }
  return out;
}

export function checkLevel(solids: Box[]): CheckReport {
  const errors: string[] = [];
  const panels = solids.filter((s) => PANEL_SURFACES.has(s.surface) && !s.bodiesOnly);
  const plain = solids.filter((s) => !PANEL_SURFACES.has(s.surface) && !s.bodiesOnly);
  // Bucket the plain boxes on a 4 m plan grid so each panel only meets its neighbours.
  const cell = 4;
  const buckets = new Map<string, Box[]>();
  const keys = (b: Box) => {
    const out: string[] = [];
    for (let x = Math.floor((b.center[0] - b.size[0] / 2) / cell); x <= Math.floor((b.center[0] + b.size[0] / 2) / cell); x++) {
      for (let z = Math.floor((b.center[2] - b.size[2] / 2) / cell); z <= Math.floor((b.center[2] + b.size[2] / 2) / cell); z++) out.push(`${x},${z}`);
    }
    return out;
  };
  for (const b of [...plain, ...panels]) {
    if (b.size[0] * b.size[2] > 400) continue; // the ground slab under everything: checked on its own below
    for (const key of keys(b)) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(b);
    }
  }
  const seen = new Set<string>();
  for (const p of panels) {
    for (const key of keys(p)) {
      for (const b of buckets.get(key) ?? []) {
        if (b === p) continue;
        const pair = p.id < b.id ? `${p.id}|${b.id}` : `${b.id}|${p.id}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        const depth = overlapDepth(p, b);
        if (depth > BUDGET.overlapM) errors.push(`${p.id} (${p.surface}) and ${b.id} (${b.surface}) overlap by ${depth.toFixed(3)} m`);
      }
    }
    if (panelCells(p) > BUDGET.panelCells) errors.push(`${p.id}: ${panelCells(p)} cells per layer, over the ${BUDGET.panelCells} cap`);
  }
  for (const big of plain.filter((b) => b.size[0] * b.size[2] > 400)) {
    for (const p of panels) {
      const depth = overlapDepth(p, big);
      if (depth > BUDGET.overlapM) errors.push(`${p.id} (${p.surface}) and ${big.id} overlap by ${depth.toFixed(3)} m`);
    }
  }
  errors.push(...coplanarFaces(solids));
  const cellsPerLayer = panels.reduce((a, p) => a + panelCells(p), 0);
  if (panels.length > BUDGET.panels) errors.push(`${panels.length} panels, over the ${BUDGET.panels} budget`);
  if (solids.length > BUDGET.colliders) errors.push(`${solids.length} solids, over the ${BUDGET.colliders} collider budget`);
  if (cellsPerLayer > BUDGET.cellsPerLayer) errors.push(`${cellsPerLayer} panel cells per layer, over the ${BUDGET.cellsPerLayer} budget`);
  return { errors, panels: panels.length, colliders: solids.length, cellsPerLayer };
}
