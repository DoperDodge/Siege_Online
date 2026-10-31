// Point tests on a level's zones (level.json `zones`, D-105): is a spot inside the building? A match's red walls
// keep defenders inside during prep, and a defender outside it in action is a run-out (match/DESIGN.md §6).
import type { LevelDef } from "../data/schemas.js";
import { DEG } from "../core/math.js";

/** One zone box: centre, half sizes and its turn about the vertical. */
export interface ZoneBox {
  c: [number, number, number];
  h: [number, number, number];
  cos: number;
  sin: number;
}

export type ZoneKind = LevelDef["zones"][number]["kind"];

/** Every box of the level's zones of one kind. */
export function zoneBoxes(def: LevelDef, kind: ZoneKind): ZoneBox[] {
  return def.zones
    .filter((z) => z.kind === kind)
    .flatMap((z) =>
      z.boxes.map((b) => ({
        c: [b.center[0], b.center[1], b.center[2]] as [number, number, number],
        h: [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2] as [number, number, number],
        cos: Math.cos(b.yawDeg * DEG),
        sin: Math.sin(b.yawDeg * DEG),
      })),
    );
}

/** The point is inside (or on the edge of) one of the boxes. A box turned by yaw is turned back first (yaw turns x toward −z, as the scene's rotation.y does). */
export function insideAny(boxes: readonly ZoneBox[], x: number, y: number, z: number): boolean {
  for (const b of boxes) {
    const dx = x - b.c[0];
    const dz = z - b.c[2];
    const lx = dx * b.cos - dz * b.sin;
    const lz = dx * b.sin + dz * b.cos;
    if (Math.abs(lx) <= b.h[0] && Math.abs(y - b.c[1]) <= b.h[1] && Math.abs(lz) <= b.h[2]) return true;
  }
  return false;
}

/** How far above the feet a body's spot is tested (a body standing on a floor is on that storey's box). */
export const ZONE_TEST_HEIGHT = 0.1;
