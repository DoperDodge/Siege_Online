// The outside (DESIGN §5.9): exterior.json's items, placed by hand from the r6calls background in world u (or
// a floor's frame), as boxes, fences, rails, ramps and steps. A box, fence or rail's rectangle is its footprint
// before it turns `yawDeg` about its middle (positive turns left, as a body's yaw: east toward north). A ramp
// or a flight of steps faces a whole quarter: its rectangle is where it stands, rising toward `yawDeg` (0 north,
// 90 west) by `hM`. Heights are metres: `baseY` is where it stands (default the floor of its level, the ground
// outside). The play area's edge and the ground itself are built by compile.ts and floors.ts.
import type { Frames } from "./frames.js";
import type { Ramp } from "./roofs.js";
import type { ExteriorPart, Layout } from "./schema.js";
import type { Flight } from "./stairs.js";
import type { Solid } from "./walls.js";

/** A rail's bar, drawn on its blocker (as a wall line's rail, walls.ts). */
const BAR_M = 0.05;

export interface ExteriorResult {
  solids: Solid[];
  ramps: Ramp[];
  /** Outdoor steps: solid blocks, not open flights (nothing under them to walk into). */
  flights: (Omit<Flight, "solid"> & { solid: true })[];
  /** Every item's id, for the plans to leave out (they draw the storeys). */
  ids: Set<string>;
  errors: string[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function compileExterior(layout: Layout, fr: Frames, exterior: ExteriorPart): ExteriorResult {
  const k = layout.units.mPerU;
  const out: ExteriorResult = { solids: [], ramps: [], flights: [], ids: new Set(), errors: [] };
  const ground = layout.storeys.find((s) => !s.underground)!.floorY;
  const levelY = (level: string) => (level === "EXT" ? ground : layout.storeys.find((s) => s.id === level)!.floorY);
  for (const item of [...exterior.items, ...exterior.props]) {
    if (out.ids.has(item.id)) out.errors.push(`exterior.json: the id "${item.id}" is used twice`);
    out.ids.add(item.id);
    const [ax, ay] = fr.toWorld(item.frame, item.rect[0], item.rect[1]);
    const [bx, by] = fr.toWorld(item.frame, item.rect[2], item.rect[3]);
    const [x0, z0, x1, z1] = [Math.min(ax, bx) * k, Math.min(ay, by) * k, Math.max(ax, bx) * k, Math.max(ay, by) * k];
    const [cx, cz, w, d] = [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0];
    const y0 = item.baseY ?? levelY(item.level);
    if (w <= 0 || d <= 0 || item.hM <= 0) {
      out.errors.push(`exterior.json ${item.id}: an empty rectangle or height`);
      continue;
    }
    const box = (id: string, yLo: number, yHi: number, extra: Partial<Solid> & Pick<Solid, "surface">): Solid => ({
      id,
      center: [r4(cx), r4((yLo + yHi) / 2), r4(cz)],
      size: [r4(w), r4(yHi - yLo), r4(d)],
      ...(item.yawDeg ? { yawDeg: item.yawDeg } : {}),
      ...extra,
    });
    if (item.kind === "box" || item.kind === "fence") {
      const surface = item.surface as Solid["surface"];
      out.solids.push(box(item.id, y0, y0 + item.hM, { surface, ...(item.vaultable ? { vaultable: true } : {}), ...(item.label ? { label: item.label } : {}) }));
      continue;
    }
    if (item.kind === "rail") {
      // A blocker for bodies (bullets and sight pass), vaultable, with a bar drawn on top.
      out.solids.push(box(item.id, y0, y0 + item.hM, { surface: "HARD_WALL", vaultable: true, bodiesOnly: true }));
      const bar = box(`${item.id}.bar`, y0 + item.hM - BAR_M, y0 + item.hM, { surface: "HARD_WALL", drawOnly: true });
      bar.size = [r4(Math.min(w, d) === w ? BAR_M : w), BAR_M, r4(Math.min(w, d) === d ? BAR_M : d)];
      out.solids.push(bar);
      continue;
    }
    // Ramps and steps rise toward a quarter: run along it, width across.
    const yaw = (((item.yawDeg % 360) + 360) % 360) as number;
    if (yaw % 90 !== 0) {
      out.errors.push(`exterior.json ${item.id}: a ${item.kind} faces north, west, south or east (yawDeg ${item.yawDeg})`);
      continue;
    }
    const [fx, fz] = [-Math.sin((yaw * Math.PI) / 180), -Math.cos((yaw * Math.PI) / 180)].map((v) => Math.round(v));
    const [run, width] = fx !== 0 ? [w, d] : [d, w];
    // The low edge's middle: the side the way up leaves.
    const [lx, lz] = [cx - (fx * w) / 2, cz - (fz * d) / 2];
    if (item.kind === "ramp") {
      const angle = item.angleDeg ?? (Math.atan2(item.hM, run) * 180) / Math.PI;
      const rad = (angle * Math.PI) / 180;
      out.ramps.push({
        id: item.id,
        start: [r4(lx), r4(y0), r4(lz)],
        yawDeg: yaw,
        length: r4(run / Math.cos(rad)),
        angleDeg: r4(angle),
        width: r4(width),
        surface: "HARD_FLOOR",
        ...(item.label ? { label: item.label } : {}),
      });
      continue;
    }
    const steps = Math.ceil(item.hM / layout.defaults.stairs.riserMaxM - 1e-9);
    out.flights.push({ id: item.id, start: [r4(lx), r4(y0), r4(lz)], yawDeg: yaw, steps, rise: r4(item.hM / steps), run: r4(run / steps), width: r4(width), surface: "HARD_FLOOR", solid: true });
  }
  return out;
}
