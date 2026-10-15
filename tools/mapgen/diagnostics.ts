// Frame diagnostics (DESIGN §3.2, amendment 2): a floor whose frame has an alternative (B: as drawn, or scaled
// about the 2F fixed point) is compiled both ways, and each hatch that drops onto that floor is checked against
// its bottom room either way: how much of the hatch lies over the room, and how far its edge stays from the
// room's walls. An answer from Ulo flips one field; this says what each choice does.
import { frames as framesOf } from "./frames.js";
import { distanceInside } from "./grid.js";
import type { Floor } from "./research.js";
import { CELL_M, compileRooms } from "./rooms.js";
import type { Layout, WallsPart } from "./schema.js";
import { compileWalls } from "./walls.js";

export interface HatchLanding {
  hatch: string;
  bottom: string;
  /** Share of the hatch's cells over the bottom room. */
  over: number;
  /** The closest the hatch comes to the room's walls, metres (0 when part of it isn't over the room). */
  clearM: number;
}

export function frameDiagnostics(layout: Layout, walls: WallsPart[], playable: [number, number, number, number], hatches: { id: string; rect: [number, number, number, number] }[]): Record<string, Record<"main" | "alt", HatchLanding[]>> {
  const out: Record<string, Record<"main" | "alt", HatchLanding[]>> = {};
  for (const [frame, f] of Object.entries(layout.frames)) {
    if (!f.alt) continue;
    const floor = frame as Floor;
    const part = walls.find((p) => p.floor === floor);
    const drops = layout.hatches.filter((h) => layout.rooms.find((r) => r.id === h.bottom)?.floor === floor);
    if (!part || drops.length === 0) continue;
    const both = {} as Record<"main" | "alt", HatchLanding[]>;
    for (const use of ["main", "alt"] as const) {
      const variant: Layout = { ...layout, emit: [floor], frames: { ...layout.frames, [frame]: { ...f, use } } };
      const fr = framesOf(variant);
      const rooms = compileRooms(variant, fr, compileWalls(variant, fr, [part], playable).solids);
      const plan = rooms.plans.get(floor)!;
      const g = plan.grid;
      both[use] = drops.map((h) => {
        const index = rooms.rooms.findIndex((r) => r.id === h.bottom);
        const dist = distanceInside(g.w, g.h, (c) => plan.room[c] === index);
        const rect = hatches.find((x) => x.id === h.id)!.rect;
        let cells = 0;
        let over = 0;
        let clear = Infinity;
        for (let j = Math.ceil((rect[1] - g.y0) / CELL_M - 0.5); j < Math.ceil((rect[3] - g.y0) / CELL_M - 0.5); j++) {
          for (let i = Math.ceil((rect[0] - g.x0) / CELL_M - 0.5); i < Math.ceil((rect[2] - g.x0) / CELL_M - 0.5); i++) {
            const c = j * g.w + i;
            cells++;
            if (index >= 0 && plan.room[c] === index) over++;
            clear = Math.min(clear, i < 0 || j < 0 || i >= g.w || j >= g.h ? 0 : dist[c]);
          }
        }
        return { hatch: h.id, bottom: h.bottom, over: cells ? Math.round((over / cells) * 1000) / 1000 : 0, clearM: over === cells ? Math.round(Math.max(0, clear - 1) * CELL_M * 100) / 100 : 0 };
      });
    }
    out[frame] = both;
  }
  return out;
}
