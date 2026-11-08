// Dressing (Phase 10 M6, render/DESIGN.md §9.2): what makes a room look lived in, drawn only — pictures, posters,
// clocks, shelves of books and jars, a cross, a board, a mirror, a pegboard of tools hung on its hard walls; rugs on its
// hard floor; a few low boxes, crates and buckets against its hard walls. How many of each a room gets is its style's
// kit (art.json `dressing`); where they go is worked out here from the level, the same every time (seeded by room):
//
// - Hard walls only (a soft or reinforceable wall can be blown away; a picture can't hang on nothing), found as runs
//   of wall face along each edge of the room's rectangles, solid at 1.25, 1.6 and 2 m (so a run stops at every door
//   and window).
// - Hard floors only (no rug or box on a soft floor or a hatch), the floor under every part checked.
// - Clear of every opening's approach: a box stands at least CLUTTER_END_M from the ends of its wall run (which stop at
//   each opening), and nothing a body could take for cover: floor clutter is at most CLUTTER_MAX_H tall; things on a
//   wall stand out of it a few centimetres (a shelf, high up, a little more).
// - Nothing in front of furniture, stairs or the ladder.
//
// Each placement is recorded (`placed`) for the validator (test/dressing.test.ts).
import type { BuiltLevel, DressingWall, MapArt, Renderable } from "@redmond/shared";
import { Kit, type V3 } from "./kit.js";
import type { LevelArt } from "./levelArt.js";

/** How tall floor clutter may be (no taller than nothing a body could hide behind), and how far from a run's ends. */
export const CLUTTER_MAX_H = 0.32;
export const CLUTTER_END_M = 0.9;
/** How far a wall item keeps from its run's ends (door casings, corners). */
const WALL_END_M = 0.22;
/** Along each edge, a sample every SAMPLE_M; the heights (over the floor) a wall must be solid at to hang things on. */
const SAMPLE_M = 0.1;
const WALL_HEIGHTS = [1.25, 1.6, 2.0];
/** How far either side of a room's rectangle edge its wall face is looked for. */
const FACE_LOOK_M = 0.35;

/** A run of hard wall facing into a room: its face's line along x or z, its extent, which way is into the room. */
export interface WallRun {
  room: string;
  floorY: number;
  ceilingY: number;
  along: "x" | "z";
  /** The face's coordinate on the other axis. */
  face: number;
  /** Into the room along the other axis. */
  into: 1 | -1;
  from: number;
  to: number;
}

/** A piece of dressing placed: what, in which room, its world box (axis-aligned), and its wall (if it's against one). */
export interface Placed {
  kind: DressingWall | "rug" | "clutter";
  room: string;
  min: V3;
  max: V3;
  run?: WallRun;
  /** A rug turned with the furniture it lies under: its centre, size and yaw (its box is then the bounds). */
  rug?: { center: V3; size: [number, number]; yaw: number };
}

type Box = { min: V3; max: V3; r: Renderable };

/** A seeded random number generator (mulberry32), seeded from a string. */
function seeded(id: string): () => number {
  let s = 0x2545f491;
  for (let i = 0; i < id.length; i++) s = Math.imul(s ^ id.charCodeAt(i), 0x85ebca6b) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A renderable's axis-aligned bounds (its box turned by its quaternion about y). */
export function boundsOf(r: Renderable): { min: V3; max: V3 } {
  const yaw = 2 * Math.atan2(r.quat[1], r.quat[3]);
  const [c, s] = [Math.abs(Math.cos(yaw)), Math.abs(Math.sin(yaw))];
  const hx = (r.size[0] * c + r.size[2] * s) / 2;
  const hz = (r.size[0] * s + r.size[2] * c) / 2;
  return { min: [r.center[0] - hx, r.center[1] - r.size[1] / 2, r.center[2] - hz], max: [r.center[0] + hx, r.center[1] + r.size[1] / 2, r.center[2] + hz] };
}

const overlaps = (a: { min: V3; max: V3 }, b: { min: V3; max: V3 }) =>
  a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1] && a.min[2] < b.max[2] && a.max[2] > b.min[2];

/** What the dressing needs of a level: its hard walls (a grid of them), floors, and what mustn't be covered. */
class Places {
  private readonly cells = new Map<string, Box[]>();
  readonly floors: Box[] = [];
  /** Soft floors and hatches: no rug or box on them. */
  readonly notFloor: Box[] = [];
  /** Furniture, stairs, ramps, the ladder, the gas pipes' runs: nothing hangs or stands in front of them. */
  readonly obstacles: Box[] = [];

  constructor(readonly level: BuiltLevel) {
    for (const r of level.renderables) {
      if (!r.visible) continue;
      const b = { ...boundsOf(r), r };
      const turned = Math.abs(r.quat[1]) > 1e-6;
      if (r.surface === "HARD_WALL" && r.kind === "solid" && !turned && !/^PROP_|^EXT_/.test(r.id)) {
        for (let x = Math.floor(b.min[0]); x <= Math.floor(b.max[0]); x++)
          for (let z = Math.floor(b.min[2]); z <= Math.floor(b.max[2]); z++) {
            const key = `${x},${z}`;
            const list = this.cells.get(key);
            if (list) list.push(b);
            else this.cells.set(key, [b]);
          }
      }
      if (r.surface === "HARD_FLOOR") this.floors.push(b);
      if (r.surface === "SOFT_FLOOR" || r.surface === "HATCH") this.notFloor.push(b);
      if (r.kind === "stair_step" || r.kind === "ramp" || r.kind === "ladder_rail" || r.kind === "ladder_rung" || r.surface === "PROP" || r.id.startsWith("PROP_")) this.obstacles.push(b);
    }
  }

  /** The hard walls near a point (its 1 m cell). */
  wallsNear(x: number, z: number): Box[] {
    return this.cells.get(`${Math.floor(x)},${Math.floor(z)}`) ?? [];
  }

  /** Whether a point is inside a hard wall. */
  inWall(x: number, y: number, z: number): boolean {
    return this.wallsNear(x, z).some((b) => x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2]);
  }

  /** Whether the floor at (x, z) at height floorY is hard (a hard floor's top there, no soft floor or hatch). */
  hardFloor(x: number, z: number, floorY: number): boolean {
    const on = (b: Box) => x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && Math.abs(b.max[1] - floorY) < 0.06;
    return this.floors.some(on) && !this.notFloor.some(on);
  }

  /** Whether a box is clear of every obstacle (a margin round it). */
  clear(min: V3, max: V3, margin = 0): boolean {
    const m = { min: [min[0] - margin, min[1], min[2] - margin] as V3, max: [max[0] + margin, max[1], max[2] + margin] as V3 };
    return !this.obstacles.some((o) => overlaps(m, o));
  }
}

/**
 * The runs of hard wall facing into a room: along each edge of its rectangles (not one it shares with another of its
 * own), every SAMPLE_M, where a hard wall's face is near the edge and solid at each of WALL_HEIGHTS.
 */
export function wallRuns(level: BuiltLevel, room: { id: string; storey: string; rects: readonly (readonly number[])[] }, places = new Places(level)): WallRun[] {
  const storey = level.def.storeys.find((s) => s.id === room.storey);
  if (!storey) return [];
  const { floorY, ceilingY } = storey;
  const inRoom = (x: number, z: number) => room.rects.some((r) => x > r[0] + 1e-6 && x < r[2] - 1e-6 && z > r[1] + 1e-6 && z < r[3] - 1e-6);
  const runs: WallRun[] = [];
  for (const r of room.rects) {
    const [x0, z0, x1, z1] = r;
    const edges: { along: "x" | "z"; at: number; into: 1 | -1; from: number; to: number }[] = [
      { along: "x", at: z0, into: 1, from: x0, to: x1 },
      { along: "x", at: z1, into: -1, from: x0, to: x1 },
      { along: "z", at: x0, into: 1, from: z0, to: z1 },
      { along: "z", at: x1, into: -1, from: z0, to: z1 },
    ];
    for (const e of edges) {
      let cur: WallRun | null = null;
      const flush = () => {
        if (cur && cur.to - cur.from >= 0.3) runs.push(cur);
        cur = null;
      };
      for (let t = e.from + SAMPLE_M / 2; t < e.to; t += SAMPLE_M) {
        // An edge the room shares with another of its rectangles isn't a wall.
        const [ox, oz] = e.along === "x" ? [t, e.at - e.into * 0.15] : [e.at - e.into * 0.15, t];
        let face: number | null = null;
        if (!inRoom(ox, oz)) {
          for (const h of WALL_HEIGHTS) {
            const y = floorY + h;
            // The face nearest into the room of the hard walls across the edge here.
            let best: number | null = null;
            const near = e.along === "x" ? places.wallsNear(t, e.at) : places.wallsNear(e.at, t);
            const also = e.along === "x" ? places.wallsNear(t, e.at - e.into * FACE_LOOK_M) : places.wallsNear(e.at - e.into * FACE_LOOK_M, t);
            for (const b of new Set([...near, ...also])) {
              if (y < b.min[1] || y > b.max[1]) continue;
              const [lo, hi] = e.along === "x" ? [b.min[0], b.max[0]] : [b.min[2], b.max[2]];
              if (t < lo || t > hi) continue;
              const [bLo, bHi] = e.along === "x" ? [b.min[2], b.max[2]] : [b.min[0], b.max[0]];
              const f = e.into > 0 ? bHi : bLo;
              if (Math.abs(f - e.at) > FACE_LOOK_M) continue;
              if (best === null || (e.into > 0 ? f > best : f < best)) best = f;
            }
            if (best === null || (face !== null && Math.abs(best - face) > 0.015)) {
              face = null;
              break;
            }
            face = best;
          }
        }
        if (face === null) {
          flush();
          continue;
        }
        const c: WallRun | null = cur;
        if (c && Math.abs(c.face - face) < 0.015 && t - c.to < SAMPLE_M) c.to = t + SAMPLE_M / 2;
        else {
          flush();
          cur = { room: room.id, floorY, ceilingY, along: e.along, face, into: e.into, from: t - SAMPLE_M / 2, to: t + SAMPLE_M / 2 };
        }
      }
      flush();
    }
  }
  return runs;
}

/** A wall item's size range and where it hangs (its centre's height over the floor), and how far it stands out. */
const WALL_ITEMS: Record<DressingWall, { w: [number, number]; h: [number, number]; y: number; deep: number }> = {
  picture: { w: [0.4, 0.9], h: [0.32, 0.7], y: 1.62, deep: 0.035 },
  poster: { w: [0.5, 0.65], h: [0.7, 0.9], y: 1.5, deep: 0.006 },
  clock: { w: [0.3, 0.3], h: [0.3, 0.3], y: 2.0, deep: 0.045 },
  shelf: { w: [0.8, 1.1], h: [0.5, 0.5], y: 1.8, deep: 0.22 },
  cross: { w: [0.42, 0.42], h: [0.75, 0.75], y: 1.72, deep: 0.04 },
  board: { w: [1.5, 2.0], h: [0.95, 0.95], y: 1.55, deep: 0.06 },
  mirror: { w: [0.5, 0.5], h: [0.7, 0.7], y: 1.55, deep: 0.025 },
  pegboard: { w: [1.1, 1.3], h: [0.8, 0.8], y: 1.45, deep: 0.06 },
};

/** Rugs that lie under a piece of furniture (r6calls' renders show them), by room. */
const RUG_UNDER: Record<string, string> = { "1F_DINING": "PROP_DINING_TABLE_N", "2F_GAME_ROOM": "PROP_GAME_SOFA" };

export interface Dressing {
  /** One geometry per storey (by `storeyOf` of a room's storey index). */
  kits: Map<number, Kit>;
  placed: Placed[];
}

/** The dressing of a level by its art (null without a `dressing` table): the walls and rugs, and with `all` the clutter. */
export function buildDressing(level: BuiltLevel, art: LevelArt, map: MapArt, all = true): Dressing | null {
  if (!map.dressing) return null;
  const places = new Places(level);
  const kits = new Map<number, Kit>();
  const placed: Placed[] = [];
  const m = (x: string) => art.fixedStyle(x);
  level.def.rooms.forEach((room) => {
    const style = map.rooms[room.id] ?? map.default;
    const kit = map.dressing?.[style];
    if (!kit) return;
    const storeyIx = level.def.storeys.findIndex((s) => s.id === room.storey);
    if (storeyIx < 0) return;
    let k = kits.get(storeyIx);
    if (!k) kits.set(storeyIx, (k = new Kit()));
    const rand = seeded(room.id);
    const runs = wallRuns(level, room, places);
    const inRoom = (x: number, z: number, pad: number) => room.rects.some((r) => x >= r[0] - pad && x <= r[2] + pad && z >= r[1] - pad && z <= r[3] + pad);
    const used = new Map<WallRun, [number, number][]>();
    const free = (run: WallRun, a: number, b: number) => !(used.get(run) ?? []).some(([u0, u1]) => a < u1 + 0.25 && b > u0 - 0.25);
    const take = (run: WallRun, a: number, b: number) => used.set(run, [...(used.get(run) ?? []), [a, b]]);
    /** A wall item's or a box's world bounds on a run at position u, from `back` to `front` out of the wall. */
    const boxOn = (run: WallRun, u: number, w: number, y0: number, y1: number, back: number, front: number): { min: V3; max: V3 } => {
      const n0 = run.face + run.into * back;
      const n1 = run.face + run.into * front;
      const [nl, nh] = [Math.min(n0, n1), Math.max(n0, n1)];
      return run.along === "x" ? { min: [u - w / 2, y0, nl], max: [u + w / 2, y1, nh] } : { min: [nl, y0, u - w / 2], max: [nh, y1, u + w / 2] };
    };
    /** Place the kit on a run: its frame's origin on the face at (u, y), x along the wall, z out of it. */
    const placeOn = (run: WallRun, u: number, y: number) => {
      const yaw = run.along === "x" ? (run.into > 0 ? 0 : Math.PI) : run.into > 0 ? Math.PI / 2 : -Math.PI / 2;
      const p: V3 = run.along === "x" ? [u, y, run.face] : [run.face, y, u];
      k.place(p, yaw);
    };

    // On the walls.
    for (const [kind, count] of Object.entries(kit.wall ?? {}) as [DressingWall, number][]) {
      const spec = WALL_ITEMS[kind];
      for (let n = 0; n < count; n++) {
        const w = spec.w[0] + rand() * (spec.w[1] - spec.w[0]);
        const h = spec.h[0] + rand() * (spec.h[1] - spec.h[0]);
        const cy = spec.y;
        const storey = level.def.storeys[storeyIx];
        if (cy + h / 2 + 0.12 > storey.ceilingY - storey.floorY) continue;
        for (let attempt = 0; attempt < 16; attempt++) {
          const run = runs[Math.floor(rand() * runs.length)];
          if (!run || run.to - run.from < w + 2 * WALL_END_M) continue;
          const u = run.from + WALL_END_M + w / 2 + rand() * (run.to - run.from - 2 * WALL_END_M - w);
          if (!free(run, u - w / 2, u + w / 2)) continue;
          const y0 = run.floorY + cy - h / 2;
          const y1 = run.floorY + cy + h / 2;
          // Nothing in front of it (furniture, stairs) within half a metre.
          const front = boxOn(run, u, w, y0, y1, 0.01, 0.5);
          if (!places.clear(front.min, front.max)) continue;
          take(run, u - w / 2, u + w / 2);
          placeOn(run, u, run.floorY + cy);
          wallItem(k, kind, w, h, m, rand);
          placed.push({ kind, room: room.id, ...boxOn(run, u, w, y0, y1, 0, spec.deep), run });
          break;
        }
      }
    }

    // Rugs: under the furniture the renders show on one, else in the middle of the room's biggest rectangle.
    for (let n = 0; n < (kit.rug ?? 0); n++) {
      const floorY = level.def.storeys[storeyIx].floorY;
      const under = n === 0 ? RUG_UNDER[room.id] : undefined;
      const prop = under ? level.renderables.find((r) => r.id === under) : undefined;
      let center: V3;
      let size: [number, number];
      let yaw = 0;
      if (prop) {
        yaw = 2 * Math.atan2(prop.quat[1], prop.quat[3]);
        center = [prop.center[0], floorY, prop.center[2]];
        size = [prop.size[0] + 1.0, prop.size[2] + 1.0];
      } else {
        const rects = [...room.rects].sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
        const r = rects[n % rects.length];
        const [rw, rd] = [r[2] - r[0], r[3] - r[1]];
        center = [(r[0] + r[2]) / 2 + (rand() - 0.5) * 0.3, floorY, (r[1] + r[3]) / 2 + (rand() - 0.5) * 0.3];
        size = rw >= rd ? [Math.min(2.6, rw - 1.4), Math.min(1.7, rd - 1.4)] : [Math.min(1.7, rw - 1.4), Math.min(2.6, rd - 1.4)];
      }
      for (let shrink = 0; shrink < 4; shrink++, size = [size[0] * 0.82, size[1] * 0.82]) {
        if (size[0] < 0.9 || size[1] < 0.7) break;
        if (!rugFits(places, room.rects, center, size, yaw)) continue;
        k.place(center, yaw);
        rug(k, size[0], size[1], m, rand);
        const [c, s] = [Math.abs(Math.cos(yaw)), Math.abs(Math.sin(yaw))];
        const hx = (size[0] * c + size[1] * s) / 2;
        const hz = (size[0] * s + size[1] * c) / 2;
        placed.push({ kind: "rug", room: room.id, min: [center[0] - hx, floorY, center[2] - hz], max: [center[0] + hx, floorY + 0.014, center[2] + hz], rug: { center, size: [size[0], size[1]], yaw } });
        break;
      }
    }

    // Low things against the walls, away from the runs' ends (and so from every opening).
    if (all)
      for (let n = 0; n < (kit.clutter ?? 0); n++) {
        for (let attempt = 0; attempt < 16; attempt++) {
          const run = runs[Math.floor(rand() * runs.length)];
          const w = 0.32 + rand() * 0.22;
          if (!run || run.to - run.from < w + 2 * CLUTTER_END_M) continue;
          const u = run.from + CLUTTER_END_M + w / 2 + rand() * (run.to - run.from - 2 * CLUTTER_END_M - w);
          if (!free(run, u - w / 2, u + w / 2)) continue;
          const deep = 0.26 + rand() * 0.08;
          const h = 0.18 + rand() * (CLUTTER_MAX_H - 0.18);
          const box = boxOn(run, u, w, run.floorY, run.floorY + h, 0.02, 0.02 + deep);
          if (!places.clear(box.min, box.max, 0.1)) continue;
          const corners: [number, number][] = [
            [box.min[0], box.min[2]],
            [box.max[0], box.min[2]],
            [box.min[0], box.max[2]],
            [box.max[0], box.max[2]],
          ];
          if (!corners.every(([x, z]) => places.hardFloor(x, z, run.floorY) && inRoom(x, z, 0.05))) continue;
          // The wall solid behind it right down to the floor (no drone hole there), a little past either side.
          const behind = run.face - run.into * 0.05;
          let solid = true;
          for (let t = u - w / 2 - 0.15; t <= u + w / 2 + 0.15 && solid; t += 0.05)
            for (const hy of [0.1, 0.25, 1.0]) {
              const [x, z] = run.along === "x" ? [t, behind] : [behind, t];
              if (!places.inWall(x, run.floorY + hy, z)) solid = false;
            }
          if (!solid) continue;
          take(run, u - w / 2, u + w / 2);
          placeOn(run, u, run.floorY);
          clutter(k, w, h, deep, m, rand);
          placed.push({ kind: "clutter", room: room.id, ...box, run });
          break;
        }
      }
  });
  return { kits, placed };
}

/** Whether a rug (centre, size, yaw) lies all on hard floor in its room, clear of furniture's neighbours and stairs. */
function rugFits(places: Places, rects: readonly (readonly number[])[], center: V3, size: [number, number], yaw: number): boolean {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  const inRoom = (x: number, z: number) => rects.some((r) => x >= r[0] - 0.05 && x <= r[2] + 0.05 && z >= r[1] - 0.05 && z <= r[3] + 0.05);
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 6; j++) {
      const lx = (i / 6 - 0.5) * size[0];
      const lz = (j / 6 - 0.5) * size[1];
      const x = center[0] + lx * c + lz * s;
      const z = center[2] - lx * s + lz * c;
      if (!inRoom(x, z) || !places.hardFloor(x, z, center[1])) return false;
    }
  // No stairs, ramp or ladder over it.
  const hx = (size[0] * Math.abs(c) + size[1] * Math.abs(s)) / 2;
  const hz = (size[0] * Math.abs(s) + size[1] * Math.abs(c)) / 2;
  const box = { min: [center[0] - hx, center[1], center[2] - hz] as V3, max: [center[0] + hx, center[1] + 0.05, center[2] + hz] as V3 };
  return !places.obstacles.some((o) => o.r.kind !== "solid" && overlaps(box, o));
}

// ---------------------------------------------------------------------------------------------------------------------
// The items, each in its frame: x along the wall, y up from its centre's height (a floor item: from the floor), z out
// of the wall into the room (the wall's face at z = 0).

type Mat = (x: string) => number;
const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

function wallItem(k: Kit, kind: DressingWall, w: number, h: number, m: Mat, rand: () => number): void {
  switch (kind) {
    case "picture": {
      const frame = m(pick(rand, ["wood_dark", "wood_stain", "paint_black", "wood_table"]));
      const F = 0.045;
      const D = 0.035;
      for (const [cx, cy, sw, sh] of [
        [0, h / 2 - F / 2, w, F],
        [0, -h / 2 + F / 2, w, F],
        [-w / 2 + F / 2, 0, F, h - 2 * F],
        [w / 2 - F / 2, 0, F, h - 2 * F],
      ])
        k.box([cx, cy, D / 2], [sw, sh, D], frame);
      // The picture: a landscape (sky, hills, fields), or blocks of colour.
      const iw = w - 2 * F;
      const ih = h - 2 * F;
      const z = 0.012;
      if (rand() < 0.65) {
        const sky = 0.45 + rand() * 0.2;
        const hill = 0.15 + rand() * 0.1;
        k.box([0, ih / 2 - (sky * ih) / 2, z], [iw, sky * ih, 0.006], m(pick(rand, ["plaster_blue", "plaster_cream", "plaster_rose"])));
        k.box([0, ih / 2 - sky * ih - (hill * ih) / 2, z], [iw, hill * ih, 0.006], m(pick(rand, ["fabric_green", "plaster_sage", "fabric_blue"])));
        const rest = ih * (1 - sky - hill);
        k.box([0, -ih / 2 + rest / 2, z], [iw, rest, 0.006], m(pick(rand, ["fabric_brown", "plaster_yellow", "fabric_green"])));
      } else {
        k.box([0, 0, z], [iw, ih, 0.006], m(pick(rand, ["plaster_cream", "paint_white", "plaster_grey"])));
        k.box([-iw * 0.15, ih * 0.1, z + 0.004], [iw * 0.45, ih * 0.5, 0.004], m(pick(rand, ["paint_red", "paint_blue", "fabric_green"])));
        k.box([iw * 0.22, -ih * 0.18, z + 0.006], [iw * 0.3, ih * 0.35, 0.004], m(pick(rand, ["plaster_yellow", "paint_black", "fabric_brown"])));
      }
      return;
    }
    case "poster": {
      k.box([0, 0, 0.003], [w, h, 0.004], m(pick(rand, ["paint_white", "plaster_cream", "plaster_yellow"])));
      k.box([0, h * 0.28, 0.0055], [w * 0.86, h * 0.34, 0.002], m(pick(rand, ["paint_red", "paint_blue", "paint_green", "paint_black"])));
      for (let i = 0; i < 4; i++) k.box([0, -h * 0.06 - i * h * 0.09, 0.0055], [w * (0.75 - (i % 2) * 0.2), h * 0.03, 0.002], m("paint_black"));
      return;
    }
    case "clock": {
      const r = w / 2;
      k.cylinder([0, 0, 0.02], r, 0.04, "z", m("paint_black"), 24);
      k.cylinder([0, 0, 0.041], r * 0.88, 0.004, "z", m("plastic_white"), 24);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        k.box([Math.sin(a) * r * 0.75, Math.cos(a) * r * 0.75, 0.044], [0.008, i % 3 ? 0.014 : 0.03, 0.002], m("paint_black"));
      }
      const t = rand() * Math.PI * 2;
      k.box([Math.sin(t) * r * 0.22, Math.cos(t) * r * 0.22, 0.046], [0.012, r * 0.45, 0.003], m("paint_black"));
      k.box([Math.cos(t * 3) * r * 0.3, Math.sin(t * 3) * r * 0.3, 0.048], [r * 0.62, 0.008, 0.003], m("paint_black"));
      return;
    }
    case "shelf": {
      const D = 0.22;
      const plank = -0.1;
      const wood = m(pick(rand, ["wood_stain", "wood_dark", "wood_ply"]));
      k.box([0, plank, D / 2], [w, 0.025, D], wood);
      for (const sx of [-1, 1]) k.box([sx * (w / 2 - 0.12), plank - 0.08, 0.06], [0.025, 0.14, 0.11], m("paint_black"));
      // Books and jars along it.
      let x = -w / 2 + 0.05;
      const top = plank + 0.0125;
      while (x < w / 2 - 0.08) {
        if (rand() < 0.3) {
          const r = 0.04 + rand() * 0.02;
          const jh = 0.1 + rand() * 0.08;
          k.cylinder([x + r, top + jh / 2, 0.11], r, jh, "y", m(pick(rand, ["glass_dark", "plastic_white", "steel", "cardboard"])), 10);
          x += 2 * r + 0.03;
        } else {
          const n = 3 + Math.floor(rand() * 6);
          for (let i = 0; i < n && x < w / 2 - 0.05; i++) {
            const bw = 0.025 + rand() * 0.025;
            const bh = 0.17 + rand() * 0.09;
            k.box([x + bw / 2, top + bh / 2, 0.1], [bw - 0.002, bh, 0.15 + rand() * 0.04], m(pick(rand, ["paint_red", "paint_blue", "paint_green", "fabric_brown", "cabinet_cream", "paint_black"])));
            x += bw;
          }
          x += 0.04;
        }
      }
      return;
    }
    case "cross": {
      const wood = m("wood_dark");
      k.box([0, 0, 0.02], [0.06, h, 0.04], wood);
      k.box([0, h * 0.18, 0.02], [w, 0.06, 0.04], wood);
      return;
    }
    case "board": {
      const frame = m("wood_stain");
      const F = 0.04;
      k.box([0, 0, 0.012], [w - 2 * F, h - 2 * F, 0.02], m(rand() < 0.5 ? "paint_green" : "plastic_white"));
      for (const [cx, cy, sw, sh] of [
        [0, h / 2 - F / 2, w, F],
        [0, -h / 2 + F / 2, w, F],
        [-w / 2 + F / 2, 0, F, h - 2 * F],
        [w / 2 - F / 2, 0, F, h - 2 * F],
      ])
        k.box([cx, cy, 0.0225], [sw, sh, 0.045], frame);
      k.box([0, -h / 2 + 0.01, 0.05], [w * 0.8, 0.02, 0.06], frame);
      return;
    }
    case "mirror": {
      k.box([0, 0, 0.012], [w, h, 0.024], m("wood_dark"));
      k.box([0, 0, 0.025], [w - 0.06, h - 0.06, 0.004], m("chrome"));
      return;
    }
    case "pegboard": {
      k.box([0, 0, 0.0125], [w, h, 0.025], m("wood_ply"));
      // Tools hung on it: a hammer, a saw, wrenches, a coil of rope.
      const metal = m("steel");
      k.box([-w * 0.35, 0.05, 0.035], [0.03, 0.3, 0.02], m("wood_stain"));
      k.box([-w * 0.35, 0.2, 0.035], [0.12, 0.035, 0.03], metal);
      k.box([-w * 0.1, 0.0, 0.03], [0.32, 0.12, 0.004], metal);
      k.box([-w * 0.1 + 0.2, 0.0, 0.035], [0.1, 0.04, 0.025], m("paint_red"));
      for (let i = 0; i < 4; i++) k.box([w * 0.12 + i * 0.06, -0.05 - i * 0.02, 0.032], [0.02, 0.16 + i * 0.04, 0.012], metal);
      k.cylinder([w * 0.38, -0.05, 0.04], 0.1, 0.05, "z", m("fabric_brown"), 14);
      return;
    }
  }
}

/** A rug lying on the floor: a border round its field. */
function rug(k: Kit, w: number, d: number, m: Mat, rand: () => number): void {
  const field = m(pick(rand, ["carpet_red", "carpet_brown", "plaid", "fabric_blue"]));
  const border = m(pick(rand, ["carpet_brown", "fabric_brown", "cabinet_cream"]));
  const B = 0.1;
  k.box([0, 0.006, 0], [w - 2 * B, 0.012, d - 2 * B], field);
  for (const [cx, cz, sw, sd] of [
    [0, d / 2 - B / 2, w, B],
    [0, -d / 2 + B / 2, w, B],
    [w / 2 - B / 2, 0, B, d - 2 * B],
    [-w / 2 + B / 2, 0, B, d - 2 * B],
  ])
    k.box([cx, 0.0065, cz], [sw, 0.013, sd], border);
}

/** A low thing against a wall: a cardboard box (or two side by side), a crate, a bucket. */
function clutter(k: Kit, w: number, h: number, deep: number, m: Mat, rand: () => number): void {
  const z = deep / 2;
  const kind = rand();
  if (kind < 0.45) {
    k.box([0, h / 2, z], [w, h, deep], m("cardboard"));
    k.box([0, h - 0.002, z], [w * 0.98, 0.006, 0.05], m("plaster_cream"));
  } else if (kind < 0.75) {
    const wood = m("wood_ply");
    k.box([0, h / 2, z], [w - 0.02, h - 0.02, deep - 0.02], m("wood_dark"));
    for (const yy of [0.03, h - 0.03]) {
      k.box([0, yy, deep - 0.01], [w, 0.05, 0.02], wood);
      k.box([0, yy, 0.01], [w, 0.05, 0.02], wood);
    }
    for (const sx of [-1, 1]) k.box([sx * (w / 2 - 0.01), h / 2, z], [0.02, h, deep], wood);
  } else {
    const r = Math.min(w, deep) / 2 - 0.01;
    k.cylinder([0, h / 2, z], r * 0.85, h, "y", m(pick(rand, ["metal_galvanized", "steel", "paint_blue"])), 14, true, r);
  }
}
