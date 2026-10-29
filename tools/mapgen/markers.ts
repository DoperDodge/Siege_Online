// Sites, cameras and ingredients (DESIGN §5.11, P30–P32): r6calls' markers (extracted.json's points, in the
// frame they were drawn in) placed in the compiled level. A bomb stands on its room's floor at the marker. A
// camera goes on the wall face nearest its marker that faces into the marker's room, under the ceiling, looking
// down at the room's middle; outside (level EXT), on the building face nearest it, looking out from it, or on a
// post where none is near, looking at the building. An extinguisher or a gas pipe goes on the nearest wall face
// of its room (outside: of the building), facing out of it. A marker inside on no room's floor, or outside but
// inside the building, is reported.
import type { Frames } from "./frames.js";
import type { Floor } from "./research.js";
import type { CompiledRoom, RoomsResult } from "./rooms.js";
import { storeyOfBox } from "./rooms.js";
import type { Layout } from "./schema.js";
import type { Solid } from "./walls.js";

/** A marker stands this far off its wall face, and this far from the face's ends (metres). */
const OFF_M = 0.05;
const EDGE_M = 0.1;
/** A marker on a wall line belongs to the nearest room this close (metres). */
const ROOM_NEAR_M = 1.5;
/** An exterior camera's post: a square this wide (metres). */
const POST_W_M = 0.15;

type V3 = [number, number, number];

export interface MarkersResult {
  sites: { id: string; name: string; rooms: string[]; bombs: { id: string; pos: V3; room: string }[]; plantMarginM: number }[];
  cameras: { id: string; pos: V3; yawDeg: number; pitchDeg: number; room?: string }[];
  ingredients: { id: string; kind: "fire_extinguisher" | "gas_pipe"; pos: V3; yawDeg: number; room?: string }[];
  /** Posts for the cameras outside with no building wall near. */
  solids: Solid[];
  errors: string[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Yaw (degrees; 0 faces −z, north, and 90 faces −x, west) looking along (dx, dz). */
const yawOf = (dx: number, dz: number) => r1((Math.atan2(-dx, -dz) * 180) / Math.PI);

const inRect = (r: [number, number, number, number], x: number, z: number, eps = 0.02) =>
  x >= Math.min(r[0], r[2]) - eps && x <= Math.max(r[0], r[2]) + eps && z >= Math.min(r[1], r[3]) - eps && z <= Math.max(r[1], r[3]) + eps;
export const inRoom = (room: Pick<CompiledRoom, "rects">, x: number, z: number, eps = 0.02) => room.rects.some((r) => inRect(r, x, z, eps));
/** How far (x, z) is from a room's floor (0 inside it). */
const roomDistance = (room: CompiledRoom, x: number, z: number) =>
  Math.min(
    ...room.rects.map((r) => Math.hypot(Math.max(Math.min(r[0], r[2]) - x, 0, x - Math.max(r[0], r[2])), Math.max(Math.min(r[1], r[3]) - z, 0, z - Math.max(r[1], r[3])))),
  );
/** The middle of a room's floor (its rectangles' centroid by area). */
export function roomMiddle(room: Pick<CompiledRoom, "rects">): [number, number] {
  let [a, sx, sz] = [0, 0, 0];
  for (const r of room.rects) {
    const w = Math.abs(r[2] - r[0]) * Math.abs(r[3] - r[1]);
    a += w;
    sx += w * ((r[0] + r[2]) / 2);
    sz += w * ((r[1] + r[3]) / 2);
  }
  return [sx / a, sz / a];
}

export function compileMarkers(layout: Layout, fr: Frames, wallSolids: Solid[], rooms: RoomsResult, centre: [number, number]): MarkersResult {
  const k = layout.units.mPerU;
  const d = layout.defaults;
  const out: MarkersResult = { sites: [], cameras: [], ingredients: [], solids: [], errors: [] };
  const ground = layout.storeys.find((s) => !s.underground)!.id;
  const storeyOf = (level: string): Floor => (level === "EXT" ? ground : (level as Floor));
  const floorY = (f: Floor) => layout.storeys.find((s) => s.id === f)!.floorY;
  /** The underside of what covers a storey: the next one's floor less its slab, or the wall height on top. */
  const ceilingY = (f: Floor) => {
    const i = layout.storeys.findIndex((s) => s.id === f);
    const next = layout.storeys[i + 1];
    return next ? next.floorY - next.slabM : floorY(f) + d.wallHeightM;
  };
  const roomById = new Map(rooms.rooms.map((r) => [r.id, r]));
  /** Is (x, z) inside the building's walls on storey f (not on a wall, not outside)? */
  const insideBuilding = (f: Floor, x: number, z: number) => {
    const g = rooms.plans.get(f)?.grid;
    const i = g ? g.index(x, z) : -1;
    return g !== undefined && i >= 0 && g.cells[i] === 0;
  };
  /** The room a marker of `level` is in (null outside), or an error for a marker where its level says it isn't. */
  const markerRoom = (what: string, level: string, f: Floor, x: number, z: number, named?: string): CompiledRoom | null | "bad" => {
    const at = `its marker at (${x.toFixed(2)}, ${z.toFixed(2)})`;
    if (level === "EXT") {
      if (!insideBuilding(f, x, z)) return null;
      out.errors.push(`${what}: ${at} is inside the building, but its level is EXT`);
      return "bad";
    }
    const room = roomFor(what, f, x, z, named);
    if (room) return room;
    out.errors.push(`${what}: ${at} is in no room on ${f}`);
    return "bad";
  };
  // The walls markers mount on, by storey: upright solid boxes (soft walls too), not frames' barricades or glass.
  const walls = new Map<Floor, Solid[]>();
  for (const b of wallSolids) {
    if (b.drawOnly || b.bodiesOnly || b.surface === "BARRICADE" || b.surface === "WINDOW" || b.surface === "HARD_FLOOR" || b.surface === "SOFT_FLOOR" || b.surface === "HATCH") continue;
    const f = storeyOfBox(layout, b);
    if (f) (walls.get(f) ?? walls.set(f, []).get(f)!).push(b);
  }
  const lo = (b: Solid, a: number) => b.center[a] - b.size[a] / 2;
  const hi = (b: Solid, a: number) => b.center[a] + b.size[a] / 2;
  const inside = (b: Solid, x: number, y: number, z: number) => x > lo(b, 0) && x < hi(b, 0) && y > lo(b, 1) && y < hi(b, 1) && z > lo(b, 2) && z < hi(b, 2);

  /** The world position (metres) of a marker drawn at `at` in `frame`. */
  const place = (frame: Parameters<Frames["toWorld"]>[0], at: [number, number]): [number, number] => {
    const [wx, wy] = fr.toWorld(frame, at[0], at[1]);
    return [wx * k, wy * k];
  };
  /** The room a marker is in: `named`, else the one whose floor holds it, else the nearest within ROOM_NEAR_M. */
  const roomFor = (what: string, f: Floor, x: number, z: number, named?: string): CompiledRoom | null => {
    if (named) {
      const r = roomById.get(named);
      if (!r || r.storey !== f) out.errors.push(`${what}: its room "${named}" isn't a room on ${f}`);
      return r && r.storey === f ? r : null;
    }
    const here = rooms.rooms.filter((r) => r.storey === f);
    const holding = here.find((r) => inRoom(r, x, z, 0));
    if (holding) return holding;
    let best: CompiledRoom | null = null;
    let bestD = ROOM_NEAR_M;
    for (const r of here) {
      const dist = roomDistance(r, x, z);
      if (dist < bestD) [best, bestD] = [r, dist];
    }
    return best;
  };
  /**
   * The wall face nearest (x, z) that reaches height y and faces into `room` (null: the outside of the building),
   * within `reach`: the point OFF_M in front of it and the face's outward normal.
   */
  const mount = (f: Floor, x: number, z: number, y: number, room: CompiledRoom | null, reach: number) => {
    const plan = rooms.plans.get(f)!;
    const accept = (px: number, pz: number) => (room ? inRoom(room, px, pz) : plan.grid.outside(px, pz));
    const all = walls.get(f) ?? [];
    let best: { x: number; z: number; nx: number; nz: number; dist: number } | null = null;
    for (const b of all) {
      if (y <= lo(b, 1) || y >= hi(b, 1)) continue;
      const [x0, x1, z0, z1] = [lo(b, 0), hi(b, 0), lo(b, 2), hi(b, 2)];
      const along = (v: number, a: number, c: number) => (c - a < 2 * EDGE_M ? (a + c) / 2 : Math.min(Math.max(v, a + EDGE_M), c - EDGE_M));
      const faces: [number, number, number, number][] = [
        [x0 - OFF_M, along(z, z0, z1), -1, 0],
        [x1 + OFF_M, along(z, z0, z1), 1, 0],
        [along(x, x0, x1), z0 - OFF_M, 0, -1],
        [along(x, x0, x1), z1 + OFF_M, 0, 1],
      ];
      for (const [px, pz, nx, nz] of faces) {
        const dist = Math.hypot(px - x, pz - z);
        if (dist > reach || (best && dist >= best.dist) || !accept(px, pz)) continue;
        if (all.some((o) => o !== b && inside(o, px, y, pz))) continue;
        best = { x: px, z: pz, nx, nz, dist };
      }
    }
    return best;
  };

  // ---- Sites: the bombs on their rooms' floors.
  for (const s of layout.sites) {
    const rs = s.rooms.map((id) => roomById.get(id));
    if (rs.some((r) => !r)) {
      out.errors.push(`site ${s.id}: no room ${s.rooms.filter((id) => !roomById.has(id)).join(", ")}`);
      continue;
    }
    const bombs = s.bombs.map((b) => {
      const room = roomById.get(b.room);
      const [x, z] = place(b.frame, b.at);
      if (!s.rooms.includes(b.room) || !room) out.errors.push(`site ${s.id}: bomb ${b.id}'s room ${b.room} isn't one of the site's`);
      else if (!inRoom(room, x, z, 0)) out.errors.push(`site ${s.id}: bomb ${b.id} at (${x.toFixed(2)}, ${z.toFixed(2)}) isn't in ${b.room}`);
      // On the room's floor (its anchor's height: a dropped floor's is lower).
      return { id: b.id, pos: [r4(x), room ? room.anchor[1] : 0, r4(z)] as V3, room: b.room };
    });
    out.sites.push({ id: s.id, name: s.name, rooms: s.rooms, bombs, plantMarginM: d.site.plantMarginM });
  }

  // ---- Cameras: on a wall of their room, under the ceiling, looking at its middle.
  const cam = d.camera;
  for (const c of layout.cameras) {
    const f = storeyOf(c.level);
    const [x, z] = place(c.frame, c.at);
    const room = markerRoom(`camera ${c.id}`, c.level, f, x, z, c.room);
    if (room === "bad") continue;
    const y = c.level === "EXT" ? floorY(f) + cam.postM - cam.belowCeilingM : ceilingY(f) - cam.belowCeilingM;
    let at = mount(f, x, z, y, room, cam.reachM);
    if (!at && c.level === "EXT") {
      // No building wall near: a post at the marker, the camera on its side toward the building.
      const [dx, dz] = [centre[0] - x, centre[1] - z];
      const n = Math.hypot(dx, dz) || 1;
      out.solids.push({ id: `${c.id}.post`, center: [r4(x), r4(floorY(f) + cam.postM / 2), r4(z)], size: [POST_W_M, cam.postM, POST_W_M], surface: "HARD_WALL" });
      at = { x: x + (dx / n) * (POST_W_M / 2 + OFF_M), z: z + (dz / n) * (POST_W_M / 2 + OFF_M), nx: dx / n, nz: dz / n, dist: 0 };
    }
    if (!at) {
      out.errors.push(`camera ${c.id}: no wall of ${room!.id} within ${cam.reachM} m of its marker reaches ${y.toFixed(2)} m`);
      continue;
    }
    // Inside, at the room's middle; outside, out from the face it is on (a post's faces the building).
    const middle = room ? roomMiddle(room) : null;
    out.cameras.push({
      id: c.id,
      pos: [r4(at.x), r4(y), r4(at.z)],
      yawDeg: c.yawDeg ?? (middle ? yawOf(middle[0] - at.x, middle[1] - at.z) : yawOf(at.nx, at.nz)),
      pitchDeg: c.pitchDeg ?? cam.pitchDeg,
      ...(room ? { room: room.id } : {}),
    });
  }

  // ---- Ingredients: on a wall of their room (or outside), facing out of it.
  const ing = d.ingredient;
  for (const g of layout.ingredients) {
    const f = storeyOf(g.level);
    const [x, z] = place(g.frame, g.at);
    const room = markerRoom(`${g.kind} ${g.id}`, g.level, f, x, z, g.room);
    if (room === "bad") continue;
    const y = (room ? room.anchor[1] : floorY(f)) + (g.kind === "gas_pipe" ? ing.gasPipeM : ing.fireExtinguisherM);
    const at = mount(f, x, z, y, room, ing.reachM);
    if (!at) {
      out.errors.push(`${g.kind} ${g.id}: no wall ${room ? `of ${room.id}` : "outside"} within ${ing.reachM} m of its marker reaches ${y.toFixed(2)} m`);
      continue;
    }
    out.ingredients.push({ id: g.id, kind: g.kind, pos: [r4(at.x), r4(y), r4(at.z)], yawDeg: yawOf(at.nx, at.nz), ...(room ? { room: room.id } : {}) });
  }
  return out;
}
