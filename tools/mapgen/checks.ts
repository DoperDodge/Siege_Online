// Checks on a compiled level (DESIGN §9.2 items 4 and 5): hard geometry never overlaps a panel (a soft wall
// behind a hard box would be bulletproof), panels never overlap each other, and the budgets the engine was
// sized for hold. Errors fail `npm run mapgen` and the tests.

interface Box {
  id: string;
  center: [number, number, number];
  size: [number, number, number];
  surface: string;
  bodiesOnly?: boolean;
}

/** Surfaces built as panels (data/destruction.json surfaces). */
export const PANEL_SURFACES = new Set(["SOFT_WALL", "REINFORCEABLE", "REINFORCED_WALL", "SOFT_FLOOR", "HATCH", "BARRICADE", "WINDOW"]);
export const BUDGET = { colliders: 2500, panels: 300, cellsPerLayer: 600_000, panelCells: 6400, cellM: 0.05, overlapM: 0.01 } as const;

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
  const cellsPerLayer = panels.reduce((a, p) => a + panelCells(p), 0);
  if (panels.length > BUDGET.panels) errors.push(`${panels.length} panels, over the ${BUDGET.panels} budget`);
  if (solids.length > BUDGET.colliders) errors.push(`${solids.length} solids, over the ${BUDGET.colliders} collider budget`);
  if (cellsPerLayer > BUDGET.cellsPerLayer) errors.push(`${cellsPerLayer} panel cells per layer, over the ${BUDGET.cellsPerLayer} budget`);
  return { errors, panels: panels.length, colliders: solids.length, cellsPerLayer };
}
