// Is the compiled level closed where the plan is? (DESIGN amendment 9.) The plan's rooms come from the
// authoring wall lines at their drawn widths with every opening closed; the compiled level is rasterised
// from its boxes at 1.2 m above the floor, where barricades and glass close doors and windows. A spot inside
// the plan's footprint that a flood from outside reaches is a gap to the outside; an open region of the
// compiled level that holds two of the plan's rooms is a gap between rooms.
import { PlanGrid } from "./grid.js";
import type { WallDef } from "./schema.js";

export interface Box {
  id: string;
  center: number[];
  size: number[];
  surface: string;
  bodiesOnly?: boolean;
}

/** Drawn band half-widths (u), as walls.ts reads the raster. */
const drawnHalf = (w: WallDef, k: number) => (typeof w.weight === "number" ? w.weight / k / 2 : w.weight === "int" ? 1.24 : 2.3);

/** The plan of one storey's wall lines (world u = the 1F frame), flooded from outside. */
export function planGrid(lines: WallDef[], k: number): PlanGrid {
  const plan = new PlanGrid(-40 / k, -15 / k, 85 / k, 75 / k, 0.5);
  for (const w of lines) {
    const h = drawnHalf(w, k) + 0.25;
    if (w.axis === "H") plan.fill(w.span[0] - 0.25, w.at - h, w.span[1] + 0.25, w.at + h);
    else plan.fill(w.at - h, w.span[0] - 0.25, w.at + h, w.span[1] + 0.25);
  }
  plan.floodOutside();
  return plan;
}

/**
 * Leaks in metres: rasterise `boxes` standing at 1.2 m above y = 0 and the declared passages (`passages`, closed
 * for this check) by cell centres over `area` [x0, z0, x1, z1], then compare with the plan.
 */
export function enclosureLeaks(boxes: Box[], passages: Box[], plan: PlanGrid, area: [number, number, number, number], cell: number, k: number) {
  const g = new PlanGrid(area[0], area[1], area[2], area[3], cell);
  const close = (b: Box) => g.fillCentres(b.center[0] - b.size[0] / 2, b.center[2] - b.size[2] / 2, b.center[0] + b.size[0] / 2, b.center[2] + b.size[2] / 2);
  for (const b of boxes) {
    if (b.bodiesOnly || b.surface === "HARD_FLOOR" || b.center[1] - b.size[1] / 2 > 1.2 || b.center[1] + b.size[1] / 2 < 1.2) continue;
    close(b);
  }
  for (const b of passages) close(b);
  g.floodOutside();
  const planRooms = plan.labelInside();
  const ours = g.labelInside();
  const toOutside: string[] = [];
  for (let j = 0; j < plan.h; j++) {
    for (let i = 0; i < plan.w; i++) {
      if (plan.cells[j * plan.w + i] !== 0) continue;
      const [x, z] = [(plan.x0 + (i + 0.5) * plan.cellU) * k, (plan.y0 + (j + 0.5) * plan.cellU) * k];
      if (x < area[0] || x >= area[2] || z < area[1] || z >= area[3]) continue;
      if (g.outside(x, z) && toOutside.length < 5) toOutside.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
  const roomOf = new Map<number, number>();
  const between: string[] = [];
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      const ourRoom = ours.labels[j * g.w + i];
      if (ourRoom === 0) continue;
      const [x, z] = [g.x0 + (i + 0.5) * g.cellU, g.y0 + (j + 0.5) * g.cellU];
      const pi = plan.index(x / k, z / k);
      const planRoom = pi < 0 ? 0 : planRooms.labels[pi];
      if (planRoom === 0) continue;
      const seen = roomOf.get(ourRoom);
      if (seen === undefined) roomOf.set(ourRoom, planRoom);
      else if (seen !== planRoom && between.length < 5) between.push(`(${x.toFixed(2)}, ${z.toFixed(2)}) joins plan rooms ${seen} and ${planRoom}`);
    }
  }
  return { toOutside, between, rooms: planRooms.count };
}
