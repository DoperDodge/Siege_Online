// The walk's checklist (DESIGN §9.4, M6): what we built, room by room and outside, read off the compiled level
// for Ulo to hold against the game (research/oregon/walkthrough.md, between its checklist markers). Everything is
// listed where it was built, not where the research puts it: a span's two sides, and a split's, are looked up on
// its storey's room plan (the raster the rooms were flooded on), so a door shows in both rooms it joins, or as
// "to the outside" or "onto" a roof; a hatch, soft floor, stair or ladder shows in the rooms at both ends; a bomb,
// defender spawn, camera, extinguisher, gas pipe or prop in the room it stands in, with where in the room. What
// stands in no room goes to the outside list, with the spawns, outside cameras, roofs and outside items.
// `npm run mapgen` writes it, `--check` fails when it is stale, and a tick ([x]) on a line survives a rewrite.
import type { Compiled, Inputs } from "./compile.js";
import type { Floor } from "./research.js";
import { CELL_M } from "./rooms.js";

export const CHECKLIST_START = "<!-- checklist: npm run mapgen writes everything down to the end marker (tools/mapgen/checklist.ts); ticks are kept -->";
export const CHECKLIST_END = "<!-- checklist end -->";

/**
 * One thing to check: in a room (its id), or outside (null). `ref` is what it was built from (the coverage test);
 * an item with no text is named in one of the outside lines.
 */
export interface CheckItem {
  room: string | null;
  text: string;
  ref: string;
  /** Sort key within the room: kind, then side. */
  order: number;
}

export interface Checklist {
  items: CheckItem[];
  /** The markdown between the markers. */
  lines: string[];
}

type V3 = [number, number, number];
interface LBox {
  id: string;
  center: V3;
  size: V3;
  surface: string;
  label?: string;
  panel?: { region?: string };
}
interface LRoom {
  id: string;
  callout: string;
  storey: Floor;
  rects: [number, number, number, number][];
  anchor: V3;
}
interface LLevel {
  solids: LBox[];
  rooms: LRoom[];
  storeys: { id: Floor; floorY: number }[];
  stairs: { id: string; start: V3; yawDeg: number; steps: number; rise: number; run: number }[];
  ramps: { id: string; start: V3; yawDeg: number; length: number; angleDeg: number; width: number }[];
  ladders: { id: string; base: V3; height: number; yawDeg: number }[];
  sites: { id: string; name: string; bombs: { id: string; pos: V3 }[] }[];
  cameras: { id: string; pos: V3 }[];
  ingredients: { id: string; kind: string; pos: V3 }[];
  spawns: { id: string; pos: V3; yawDeg: number; side?: string; group?: string }[];
}

/** What is at a spot of a storey's plan: a room (its index in level.rooms), or why there is none. */
type Place = number | "outside" | "well" | "pocket" | "wall";

const DEG = Math.PI / 180;
/** Forward on the ground for a yaw (yaw 0 faces −z, north; 90 faces −x, west). */
const forward = (yawDeg: number): [number, number] => [-Math.sin(yawDeg * DEG), -Math.cos(yawDeg * DEG)];
const COMPASS = ["north", "north-west", "west", "south-west", "south", "south-east", "east", "north-east"];
/** The compass point from (x0, z0) to (x, z). */
const compass = (x0: number, z0: number, x: number, z: number) => COMPASS[(((Math.round(Math.atan2(-(x - x0), -(z - z0)) / (Math.PI / 4)) % 8) + 8) % 8)];
/** Sides in the order a room's line lists them. */
const SIDE_ORDER = ["north", "east", "south", "west"];
const KIND_WORD = { SOFT: "soft wall", DOOR: "door", WINDOW: "window", OPEN: "opening", DRONE_HOLE: "drone hole" } as const;
/** Where a thing in a room is, from the room's middle (its anchor). */
const whereIn = (r: LRoom, x: number, z: number) => (Math.hypot(x - r.anchor[0], z - r.anchor[2]) < 1.5 ? "in the middle" : `in the ${compass(r.anchor[0], r.anchor[2], x, z)}`);
const m1 = (x: number) => `${+x.toFixed(1)} m`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "N1–4" for runs of numbered ids: EXT_FENCE_N1, EXT_FENCE_N2 ... → EXT_FENCE_N1–2. */
export function idList(ids: string[]): string {
  const runs = new Map<string, number[]>();
  const out: string[] = [];
  for (const id of [...new Set(ids)].sort()) {
    const m = /^(.*?)(\d+)$/.exec(id);
    if (!m) out.push(id);
    else (runs.get(m[1]) ?? runs.set(m[1], []).get(m[1])!).push(Number(m[2]));
  }
  for (const [stem, ns] of runs) {
    ns.sort((a, b) => a - b);
    let i = 0;
    while (i < ns.length) {
      let j = i;
      while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
      out.push(j > i ? `${stem}${ns[i]}–${ns[j]}` : `${stem}${ns[i]}`);
      i = j + 1;
    }
  }
  return out.sort().join(", ");
}

export function walkChecklist(inputs: Inputs, compiled: Compiled): Checklist {
  const level = compiled.level as unknown as LLevel;
  const { layout, exterior } = inputs;
  const { spans, splits, plans } = compiled.walk;
  const rooms = level.rooms;
  const items: CheckItem[] = [];
  const storeys = [...level.storeys].sort((a, b) => a.floorY - b.floorY);
  /** The storey whose floor a height is on or just above, or just under where a room's floor drops (layout.drops, at most 0.3 m). */
  const storeyAt = (y: number) => [...storeys].reverse().find((s) => s.floorY <= y + 0.31) ?? storeys[0];
  const storeyById = new Map(storeys.map((s) => [s.id, s]));
  const below = (f: Floor) => storeys[storeys.findIndex((s) => s.id === f) - 1];

  const onSplit = (floor: Floor, x: number, z: number) =>
    splits.some((s) => s.floor === floor && Math.abs((s.axis === "H" ? z : x) - s.at) <= 2 * CELL_M && (s.axis === "H" ? x : z) >= Math.min(s.a0, s.a1) && (s.axis === "H" ? x : z) <= Math.max(s.a0, s.a1));
  const at = (floor: Floor, x: number, z: number): Place => {
    const p = plans.get(floor);
    if (!p) return "outside";
    const i = p.grid.index(x, z);
    if (i < 0 || p.grid.cells[i] === 2) return "outside";
    if (p.room[i] >= 0) return p.room[i];
    if (p.grid.cells[i] === 1) return "wall";
    if (p.split[i]) return onSplit(floor, x, z) ? "wall" : "well";
    return "pocket";
  };
  /** The place at a spot, or the room nearest it within `r` metres when the spot is in a wall, a well or a pocket. */
  const near = (floor: Floor, x: number, z: number, r = 1): Place => {
    const p = at(floor, x, z);
    if (typeof p === "number" || p === "outside") return p;
    for (let d = 0.1; d <= r + 1e-9; d += 0.1) {
      for (let k = 0; k < 16; k++) {
        const q = at(floor, x + d * Math.cos((k * Math.PI) / 8), z + d * Math.sin((k * Math.PI) / 8));
        if (typeof q === "number") return q;
      }
    }
    return p;
  };
  /** The places either side of a stretch of line, [−z or −x side, +z or +x side]: a vote of three spots along it. */
  const sidesOf = (floor: Floor, axis: "H" | "V", line: number, half: number, a0: number, a1: number) =>
    ([-1, 1] as const).map((sign) => {
      const votes = new Map<Place, number>();
      for (const f of [0.25, 0.5, 0.75]) {
        const a = a0 + f * (a1 - a0);
        for (const dist of [0.3, 0.6, 1]) {
          const o = line + sign * (half + dist);
          const p = axis === "H" ? at(floor, a, o) : at(floor, o, a);
          if (p === "wall") continue;
          votes.set(p, (votes.get(p) ?? 0) + 1);
          break;
        }
      }
      let best: Place = "wall";
      let n = 0;
      for (const [p, c] of votes) if (c > n || (c === n && typeof p === "number")) [best, n] = [p, c];
      // The spot it was decided on, for a roof outside or a well's floor below.
      const a = (a0 + a1) / 2;
      const o = line + sign * (half + 0.6);
      return { place: best, x: axis === "H" ? a : o, z: axis === "H" ? o : a };
    });

  // ---- Roofs: the flat slabs and the sloped ramps of layout.roofs, by height at a spot.
  const roofCallout = new Map(layout.roofs.map((r) => [r.id, r.callout]));
  /** Every roof surface over a spot: its name and height (a flat roof's slab, a sloped one's ramp there). */
  const roofsOver = (x: number, z: number) => {
    const out: { callout: string; y: number }[] = [];
    for (const s of level.solids) {
      const callout = s.surface === "HARD_FLOOR" ? roofCallout.get(s.id.split("#")[0]) : undefined;
      if (callout && Math.abs(x - s.center[0]) <= s.size[0] / 2 && Math.abs(z - s.center[2]) <= s.size[2] / 2) out.push({ callout, y: s.center[1] + s.size[1] / 2 });
    }
    for (const r of level.ramps) {
      const callout = roofCallout.get(r.id.split(".")[0]);
      if (!callout) continue;
      const [fx, fz] = forward(r.yawDeg);
      const [dx, dz] = [x - r.start[0], z - r.start[2]];
      const along = dx * fx + dz * fz;
      if (along >= 0 && along <= r.length * Math.cos(r.angleDeg * DEG) && Math.abs(dx * fz - dz * fx) <= r.width / 2) out.push({ callout, y: r.start[1] + along * Math.tan(r.angleDeg * DEG) });
    }
    return out;
  };
  /** The roof you step out onto from a floor at height y: one within 0.6 m below it to 1.2 m above. */
  const roofAt = (x: number, z: number, y: number): string | null => roofsOver(x, z).find((r) => r.y - y >= -0.6 && r.y - y <= 1.2)?.callout ?? null;
  /** The highest roof further down, within a 4 m drop. */
  const roofUnder = (x: number, z: number, y: number) =>
    roofsOver(x, z)
      .filter((r) => r.y < y - 0.6 && r.y >= y - 4)
      .sort((a, b) => b.y - a.y)[0];

  /** A roof at a spot or within `r` metres of it. */
  const roofNear = (x: number, z: number, y: number, r: number) => {
    for (let d = 0; d <= r + 1e-9; d += 0.25) {
      for (let k = 0; k < (d ? 16 : 1); k++) {
        const roof = roofAt(x + d * Math.cos((k * Math.PI) / 8), z + d * Math.sin((k * Math.PI) / 8), y);
        if (roof) return roof;
      }
    }
    return null;
  };
  const name = (i: number, from?: Floor) => (from && rooms[i].storey !== from ? `${rooms[i].storey} ${rooms[i].callout}` : rooms[i].callout);
  /** The roof outside a span above the ground, at the spot its side was decided on. */
  const roofOf = (p: { place: Place; x: number; z: number }, floor: Floor) => {
    const y = storeyById.get(floor)!.floorY;
    return p.place === "outside" && y > 0.5 ? roofAt(p.x, p.z, y) : null;
  };
  /** How a place on the far side of something reads from this side ("to the Kitchen", "onto the Dining Roof"). */
  const toPlace = (p: { place: Place; x: number; z: number }, floor: Floor): string => {
    if (typeof p.place === "number") return `to ${name(p.place, floor)}`;
    if (p.place === "outside") {
      const roof = roofOf(p, floor);
      const y = storeyById.get(floor)!.floorY;
      const under = !roof && y > 0.5 ? roofUnder(p.x, p.z, y) : undefined;
      return roof ? `onto the ${roof}` : under ? `to the outside, ${m1(y - under.y)} above the ${under.callout}` : "to the outside";
    }
    if (p.place === "well") {
      const down = below(floor);
      const r = down ? near(down.id, p.x, p.z) : "outside";
      return `over the well, open down to ${typeof r === "number" ? name(r, floor) : "the storey below"}`;
    }
    if (p.place === "pocket") {
      const r = near(floor, p.x, p.z, 2);
      return `into an enclosed space that is no room${typeof r === "number" ? ` (beside ${name(r, floor)})` : ""}`;
    }
    return "into a wall";
  };
  const add = (room: number | null, order: number, text: string, ref: string) => items.push({ room: room === null ? null : rooms[room].id, text, ref, order });
  // Rooms whose floor drops (layout.drops): the step at each way between such a room and one that doesn't.
  const dropOf = new Map(layout.drops.map((x) => [x.room, x.dropM]));
  const stepTo = (me: Place, other: Place) => {
    if (typeof me !== "number" || typeof other !== "number") return "";
    const d = (dropOf.get(rooms[me].id) ?? 0) - (dropOf.get(rooms[other].id) ?? 0);
    return Math.abs(d) < 0.005 ? "" : `, a ${m1(Math.abs(d))} step ${d > 0 ? "up" : "down"}`;
  };
  const onRoofs: string[] = [];

  // ---- Spans: soft walls, doors, windows, passages, gaps in rails, drone holes, and openings built as wall.
  // A room's line: stairs, ladder, hatches, then its walls side by side (north, east, south, west), soft floors and
  // ceilings, then what stands in it.
  const ORDER = { stairs: 0, ladder: 10, hatch: 20, SOFT: 30, DOOR: 40, WINDOW: 50, OPEN: 60, hard: 70, DRONE_HOLE: 80, floor: 90, ceiling: 100, bomb: 110, spawn: 120, camera: 130, ingredient: 140, prop: 150, none: 900 } as const;
  const SIDE = { H: ["south", "north"], V: ["east", "west"] } as const;
  /** Something the outside list names (spawns, cameras, stairs, roofs, items): no line of its own. */
  const listedOutside = (ref: string) => items.push({ room: null, text: "", ref, order: ORDER.none });
  for (const s of spans) {
    const both = sidesOf(s.floor, s.axis, s.at, s.t / 2, s.a0, s.a1);
    both.forEach((me, k) => {
      const other = both[1 - k];
      const side = SIDE[s.axis][k];
      const to = toPlace(other, s.floor);
      const kindOpen = s.unverified.includes("kind") ? "; door or window UNVERIFIED" : "";
      let text: string;
      if (s.hard) text = `${side}: the ${s.kind === "OPEN" ? "opening" : s.kind.toLowerCase()} r6calls draws ${to} is built as wall (${s.id}; P36)`;
      else if (s.kind === "SOFT") text = `soft wall **${s.id}** ${side}, ${to}: ${plural(s.sections ?? 1, "reinforcement")}${s.unverified.includes("sections") ? " (UNVERIFIED)" : ""}`;
      else if (s.kind === "DRONE_HOLE") text = `drone hole ${side}, ${to} (${s.id})`;
      else if (s.kind === "OPEN") text = `${s.rail ? "gap in the rail" : "open"} ${side}, ${to}${stepTo(me.place, other.place)} (${s.id})`;
      else text = `${s.kind === "DOOR" ? "door" : "window"} ${side} ${to}${s.kind === "DOOR" ? stepTo(me.place, other.place) : ""} (${s.id}${kindOpen})`;
      if (typeof me.place === "number") {
        add(me.place, ORDER[s.hard ? "hard" : s.kind] + SIDE_ORDER.indexOf(side), text, `span:${s.id}`);
        if (!s.hard && (s.kind === "DOOR" || s.kind === "WINDOW" || s.kind === "OPEN") && other.place === "outside" && /^(onto|to the outside, )/.test(to)) {
          onRoofs.push(`from ${s.floor} ${name(me.place)}, the ${s.kind === "OPEN" ? "opening" : s.kind.toLowerCase()} ${side} (${s.id})${to.startsWith("onto") ? " " : ", "}${to.replace(/^to the outside, /, "")}`);
        }
      }
    });
    if (both.every((p) => typeof p.place !== "number")) add(null, ORDER.none, `${KIND_WORD[s.kind]} **${s.id}** on ${s.floor}, ${toPlace(both[0], s.floor)} on one side and ${toPlace(both[1], s.floor)} on the other`, `span:${s.id}`);
  }
  // Splits: rooms the plan shows as one space, parted by a line with nothing built on it.
  splits.forEach((sp, n) => {
    const both = sidesOf(sp.floor, sp.axis, sp.at, 2 * CELL_M, sp.a0, sp.a1);
    both.forEach((me, k) => {
      if (typeof me.place !== "number") return;
      const side = SIDE[sp.axis][k];
      add(me.place, ORDER.OPEN + SIDE_ORDER.indexOf(side), `open ${side}, ${toPlace(both[1 - k], sp.floor)}${stepTo(me.place, both[1 - k].place)}, no wall between`, `split:${n}`);
    });
    if (both.every((p) => typeof p.place !== "number")) add(null, ORDER.none, `a split on ${sp.floor} with no room either side`, `split:${n}`);
  });

  for (const x of layout.drops) {
    const i = rooms.findIndex((r) => r.id === x.room);
    if (i >= 0) add(i, ORDER.ladder + 5, `the floor lies ${m1(x.dropM)} below the rest of ${rooms[i].storey}`, `drop:${x.room}`);
    else add(null, ORDER.none, `a dropped floor for ${x.room}, which isn't built`, `drop:${x.room}`);
  }

  // ---- Stairs: each run's foot and top (flights share an id up to their "#").
  const stairName = new Map(layout.stairs.map((s) => [s.id, s.names[0]]));
  const runs = new Map<string, LLevel["stairs"]>();
  for (const f of level.stairs) {
    const key = f.id.split("#")[0];
    (runs.get(key) ?? runs.set(key, []).get(key)!).push(f);
  }
  const outsideStairs: string[] = [];
  const centre = (() => {
    const xs = rooms.flatMap((r) => r.rects.flatMap((q) => [q[0], q[2]]));
    const zs = rooms.flatMap((r) => r.rects.flatMap((q) => [q[1], q[3]]));
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2] as const;
  })();
  for (const [key, flights] of runs) {
    const id = key.split(":")[0];
    const label = `stairs **${id}** (${stairName.get(id) ?? id})`;
    const foot = flights.reduce((a, b) => (b.start[1] < a.start[1] ? b : a));
    const top = flights.reduce((a, b) => (b.start[1] + b.steps * b.rise > a.start[1] + a.steps * a.rise ? b : a));
    const [ffx, ffz] = forward(foot.yawDeg);
    const [tfx, tfz] = forward(top.yawDeg);
    const footAt = { x: foot.start[0] - 0.4 * ffx, z: foot.start[2] - 0.4 * ffz, y: foot.start[1] };
    const topAt = { x: top.start[0] + (top.steps * top.run + 0.4) * tfx, z: top.start[2] + (top.steps * top.run + 0.4) * tfz, y: top.start[1] + top.steps * top.rise };
    const [fs, ts] = [storeyAt(footAt.y), storeyAt(topAt.y)];
    const [fp, tp] = [near(fs.id, footAt.x, footAt.z), near(ts.id, topAt.x, topAt.z)];
    // An end outside: a roof beside the top's landing, else the ground or the storey's level.
    const roofEnd = (at: { x: number; z: number; y: number }, s: { floorY: number }) => (s.floorY > 0.5 ? roofNear(at.x, at.z, at.y, 1.5) : null);
    const end = (p: Place, at: { x: number; z: number; y: number }, s: { id: Floor; floorY: number }) => {
      if (typeof p === "number") return `${s.id} ${rooms[p].callout}`;
      const roof = roofEnd(at, s);
      return roof ? `the ${roof}` : s.floorY < -0.5 ? "the basement's level outside" : s.floorY > 0.5 ? `${s.id}'s level outside` : "the ground";
    };
    if (typeof fp === "number") add(fp, ORDER.stairs, `${label} up to ${end(tp, topAt, ts)}`, `stairs:${key}`);
    if (typeof tp === "number") add(tp, ORDER.stairs, `${label} down to ${end(fp, footAt, fs)}`, `stairs:${key}`);
    // The rooms its steps stand in, on the storey each tread is on, besides the two ends.
    const through = new Set<number>();
    for (const f of flights) {
      const [fx, fz] = forward(f.yawDeg);
      for (let i = 0; i < f.steps; i++) {
        const p = at(storeyAt(f.start[1] + (i + 1) * f.rise).id, f.start[0] + (i + 0.5) * f.run * fx, f.start[2] + (i + 0.5) * f.run * fz);
        if (typeof p === "number" && p !== fp && p !== tp) through.add(p);
      }
    }
    for (const r of through) add(r, ORDER.stairs + 1, `${label} from ${fs.id} up to ${ts.id} run through it`, `stairs:${key}`);
    if (typeof fp !== "number" || typeof tp !== "number") {
      const [mx, mz] = [(footAt.x + topAt.x) / 2, (footAt.z + topAt.z) / 2];
      outsideStairs.push(`${label}, ${compass(centre[0], centre[1], mx, mz)} of the building: up from ${end(fp, footAt, fs)} to ${end(tp, topAt, ts)}`);
      const roof = typeof tp !== "number" ? roofEnd(topAt, ts) : null;
      if (roof) onRoofs.push(`${label} from ${end(fp, footAt, fs)} onto the ${roof}`);
      listedOutside(`stairs:${key}`);
    }
  }

  // ---- The ladders: the room at the foot and the one stepped off into at the top.
  for (const l of level.ladders) {
    const [fx, fz] = forward(l.yawDeg);
    const [bs, ts] = [storeyAt(l.base[1]), storeyAt(l.base[1] + l.height)];
    const [bp, tp] = [near(bs.id, l.base[0] - 0.3 * fx, l.base[2] - 0.3 * fz), near(ts.id, l.base[0] + 0.6 * fx, l.base[2] + 0.6 * fz)];
    if (typeof bp === "number") add(bp, ORDER.ladder, `ladder **${l.id}** up to ${typeof tp === "number" ? `${ts.id} ${rooms[tp].callout}` : `${ts.id}'s level`}`, `ladder:${l.id}`);
    if (typeof tp === "number") add(tp, ORDER.ladder, `ladder **${l.id}** down to ${typeof bp === "number" ? `${bs.id} ${rooms[bp].callout}` : `${bs.id}'s level`}`, `ladder:${l.id}`);
  }

  // ---- Hatches: in the floor of the room above, in the ceiling of the room below.
  for (const h of level.solids.filter((s) => s.surface === "HATCH")) {
    const top = storeyAt(h.center[1] + h.size[1] / 2);
    const bottom = below(top.id);
    const [x, z] = [h.center[0], h.center[2]];
    const up = near(top.id, x, z);
    const down = bottom ? near(bottom.id, x, z) : "outside";
    if (typeof up === "number") add(up, ORDER.hatch, `hatch **${h.id}** in the floor, ${whereIn(rooms[up], x, z)}, down to ${typeof down === "number" ? name(down, top.id) : "no room"}`, `hatch:${h.id}`);
    if (typeof down === "number") add(down, ORDER.hatch, `hatch **${h.id}** in the ceiling, ${whereIn(rooms[down], x, z)}, up to ${typeof up === "number" ? name(up, bottom!.id) : "no room"}`, `hatch:${h.id}`);
  }

  // ---- Soft floors: each area's tiles sampled every 25 cm against the rooms above and below. A room is listed when
  // half a square metre of it has all four neighbouring spots in the same rooms above and below too: a strip
  // narrower than that is a tile reaching past a wall below, not a soft floor anyone sees.
  const regions = new Map<string, LBox[]>();
  for (const s of level.solids.filter((x) => x.surface === "SOFT_FLOOR")) {
    const r = s.panel?.region ?? s.label ?? s.id;
    (regions.get(r) ?? regions.set(r, []).get(r)!).push(s);
  }
  const STEP = 0.25;
  const MIN = 8;
  for (const [region, tiles] of regions) {
    const top = storeyAt(tiles[0].center[1] + tiles[0].size[1] / 2);
    const bottom = below(top.id);
    const pair = (x: number, z: number) => `${at(top.id, x, z)}|${bottom ? at(bottom.id, x, z) : "outside"}`;
    const samples = new Map<string, number>();
    const whole = new Map<string, number>();
    for (const t of tiles) {
      for (let x = t.center[0] - t.size[0] / 2 + STEP / 2; x < t.center[0] + t.size[0] / 2; x += STEP) {
        for (let z = t.center[2] - t.size[2] / 2 + STEP / 2; z < t.center[2] + t.size[2] / 2; z += STEP) {
          const key = pair(x, z);
          samples.set(key, (samples.get(key) ?? 0) + 1);
          if ([pair(x + STEP, z), pair(x - STEP, z), pair(x, z + STEP), pair(x, z - STEP)].every((k) => k === key)) whole.set(key, (whole.get(key) ?? 0) + 1);
        }
      }
    }
    const pairs = [...samples.keys()].map((k) => k.split("|").map((v) => (/^\d+$/.test(v) ? Number(v) : v)) as [Place, Place]);
    const shown = (k: [Place, Place]) => (whole.get(k.join("|")) ?? 0) >= MIN;
    let listed = false;
    for (const side of [0, 1] as const) {
      for (const room of new Set(pairs.map((k) => k[side]).filter((r): r is number => typeof r === "number"))) {
        const mine = pairs.filter((k) => k[side] === room);
        const seen = mine.filter(shown).sort((p, q) => whole.get(q.join("|"))! - whole.get(p.join("|"))!);
        if (seen.reduce((n, k) => n + whole.get(k.join("|"))!, 0) < MIN) continue;
        const m2 = Math.round(mine.reduce((n, k) => n + samples.get(k.join("|"))!, 0) * STEP * STEP);
        const others = seen.map((k) => k[1 - side]).filter((r): r is number => typeof r === "number").map((r) => name(r, side ? bottom!.id : top.id));
        const text = side === 0 ? `soft floor **${region}** (${m2} m²${others.length ? `, over ${others.join(", ")}` : ""})` : `soft ceiling **${region}** (${m2} m²${others.length ? `, under ${others.join(", ")}` : ""})`;
        add(room, side === 0 ? ORDER.floor : ORDER.ceiling, text, `softfloor:${region}`);
        listed = true;
      }
    }
    if (!listed) add(null, ORDER.none, `soft floor ${region} over and under no room`, `softfloor:${region}`);
  }

  // ---- Things standing in a room: bombs, defender spawns, cameras, extinguishers and gas pipes, props.
  const placeOf = (pos: V3) => near(storeyAt(pos[1]).id, pos[0], pos[2], 0.5);
  const siteNumber = new Map(layout.sites.map((s) => [s.id, s.number]));
  for (const site of level.sites) {
    for (const b of site.bombs) {
      const p = placeOf(b.pos);
      if (typeof p === "number") add(p, ORDER.bomb, `bomb **${b.id}** ${whereIn(rooms[p], b.pos[0], b.pos[2])} (site ${siteNumber.get(site.id)}, ${site.name})`, `bomb:${b.id}`);
      else add(null, ORDER.none, `bomb ${b.id} of site ${siteNumber.get(site.id)}, in no room`, `bomb:${b.id}`);
    }
  }
  for (const s of level.spawns.filter((x) => x.side === "defense")) {
    const p = placeOf(s.pos);
    if (typeof p === "number") add(p, ORDER.spawn, `defender spawn (site ${siteNumber.get(s.group ?? "")})`, `spawn:${s.id}`);
    else add(null, ORDER.none, `defender spawn ${s.id} in no room`, `spawn:${s.id}`);
  }
  const research = (text: string) => text.replace(/^[^:]*: /, "");
  const cameraNote = new Map(layout.cameras.map((c) => [c.id, research(c.research ?? "")]));
  const outsideCameras: string[] = [];
  for (const c of level.cameras) {
    const p = placeOf(c.pos);
    const note = cameraNote.get(c.id) ? ` (the research: ${cameraNote.get(c.id)})` : "";
    if (typeof p === "number") add(p, ORDER.camera, `camera **${c.id}** ${whereIn(rooms[p], c.pos[0], c.pos[2])}, ${m1(c.pos[1] - storeyAt(c.pos[1]).floorY)} up${note}`, `camera:${c.id}`);
    else {
      outsideCameras.push(`**${c.id}** ${compass(centre[0], centre[1], c.pos[0], c.pos[2])} of the building, ${m1(c.pos[1])} up${note}`);
      listedOutside(`camera:${c.id}`);
    }
  }
  for (const g of level.ingredients) {
    const p = placeOf(g.pos);
    const what = g.kind === "fire_extinguisher" ? "extinguisher" : "gas pipe";
    if (typeof p === "number") add(p, ORDER.ingredient, `${what} **${g.id}** ${whereIn(rooms[p], g.pos[0], g.pos[2])}`, `ingredient:${g.id}`);
    else add(null, ORDER.none, `${what} ${g.id} in no room`, `ingredient:${g.id}`);
  }
  const propDef = new Map(exterior.props.map((p) => [p.id, p]));
  for (const s of level.solids.filter((x) => propDef.has(x.id))) {
    const def = propDef.get(s.id)!;
    // The note's first clause, after the room's name: "Dining Hall, the table on the rug" → "the table on the rug".
    const head = (def.note ?? s.id).split(":")[0];
    const what = head.includes(", ") ? head.slice(head.indexOf(", ") + 2) : head;
    const p = near(storeyAt(s.center[1] - s.size[1] / 2).id, s.center[0], s.center[2], 0.5);
    const text = `${what} (${def.prop ?? "prop"}, ${m1(def.hM)}${def.vaultable ? ", vaultable" : ""})`;
    if (typeof p === "number") add(p, ORDER.prop, text, `prop:${s.id}`);
    else add(null, ORDER.none, `${text} (${s.id}) in no room`, `prop:${s.id}`);
  }

  // ---- The lines: each storey's rooms in layout order, then outside.
  const lines: string[] = [];
  const STOREY_TITLE: Record<string, string> = { B: "Basement (B)", "1F": "First floor (1F)", "2F": "Second floor (2F)", "3F": "The Cat Walk (3F)" };
  const byRoom = new Map<string, CheckItem[]>();
  for (const it of items) if (it.room && it.text) (byRoom.get(it.room) ?? byRoom.set(it.room, []).get(it.room)!).push(it);
  for (const s of storeys) {
    const mine = layout.rooms.filter((r) => r.floor === s.id);
    if (!mine.length) continue;
    lines.push(`#### ${STOREY_TITLE[s.id] ?? s.id}`, "");
    for (const r of mine) {
      const list = (byRoom.get(r.id) ?? []).sort((a, b) => a.order - b.order || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
      const texts: [string, number][] = [];
      for (const it of list) {
        const last = texts[texts.length - 1];
        if (last && last[0] === it.text) last[1]++;
        else texts.push([it.text, 1]);
      }
      const body = texts.map(([t, n]) => (n > 1 ? `${t} (×${n})` : t)).join("; ");
      lines.push(`- [ ] **${r.callout}** (\`${r.id}\`): ${body || "nothing built in it or round it"}.`);
    }
    lines.push("");
  }

  // ---- Outside and roofs.
  lines.push("#### Outside and roofs", "");
  const attack = new Map<string, LLevel["spawns"]>();
  for (const s of level.spawns.filter((x) => x.side === "attack")) (attack.get(s.group ?? s.id) ?? attack.set(s.group ?? s.id, []).get(s.group ?? s.id)!).push(s);
  const facing = (s: LLevel["spawns"][number]) => {
    const [fx, fz] = forward(s.yawDeg);
    const [dx, dz] = [centre[0] - s.pos[0], centre[1] - s.pos[2]];
    return (fx * dx + fz * dz) / Math.hypot(dx, dz) > Math.cos(60 * DEG);
  };
  const groups = [...attack].map(([g, list]) => {
    const [x, z] = [list.reduce((a, s) => a + s.pos[0], 0) / list.length, list.reduce((a, s) => a + s.pos[2], 0) / list.length];
    const words = g.split("_").map((w, i) => (i === 0 ? w : w[0] + w.slice(1).toLowerCase()));
    return `${words.join(" ")} (${list.length}, ${compass(centre[0], centre[1], x, z)} of the building)`;
  });
  const allFacing = [...attack.values()].flat().every(facing);
  for (const s of level.spawns.filter((x) => x.side === "attack")) listedOutside(`spawn:${s.id}`);
  lines.push(`- [ ] **Attacker spawns:** ${groups.join(", ")}${allFacing ? ", each spot facing the building" : ""}.`);
  if (outsideCameras.length) lines.push(`- [ ] **Cameras outside:** ${outsideCameras.join("; ")}.`);
  if (outsideStairs.length) lines.push(`- [ ] **Stairs outside:** ${outsideStairs.join("; ")}.`);
  const eaves = [...new Set(layout.roofs.map((r) => r.eaveY))].sort((a, b) => a - b);
  for (const y of eaves) {
    const over = storeyAt(y - 0.5).id;
    const list = layout.roofs.filter((r) => r.eaveY === y).map((r) => `${r.callout} (\`${r.id}\`, ${r.shape === "flat" ? "flat" : `${r.shape} ${r.pitchDeg}°`}${r.walkable === false ? ", not walkable" : ""})`);
    lines.push(`- [ ] **Roofs over ${over}, eaves at ${m1(y)}:** ${list.join(", ")}.`);
  }
  for (const r of layout.roofs) listedOutside(`roof:${r.id}`);
  if (onRoofs.length) lines.push(`- [ ] **Onto the roofs:** ${onRoofs.join("; ")}.`);
  // The outside's items by height: what you vault, what you hide behind, and the rest.
  const byHeight = (list: { id: string; hM: number }[]) =>
    [...new Set(list.map((i) => i.hM))].sort((a, b) => b - a).map((h) => `${m1(h)}: ${idList(list.filter((i) => i.hM === h).map((i) => i.id))}`).join("; ");
  const outside = exterior.items.filter((i) => i.kind !== "ramp" && i.kind !== "stairs" && i.surface !== "HARD_FLOOR");
  const low = outside.filter((i) => i.kind === "fence" || i.kind === "rail");
  const cover = outside.filter((i) => i.kind === "box" && i.surface === "PROP");
  const rest = outside.filter((i) => !low.includes(i) && !cover.includes(i));
  lines.push(`- [ ] **Fences, low walls and rails** (bodies vault them${low.every((i) => i.vaultable || i.kind === "rail") ? "" : " where marked"}): ${byHeight(low)}.`);
  if (cover.length) lines.push(`- [ ] **Vehicles and wrecks** (cover props): ${byHeight(cover)}.`);
  if (rest.length) lines.push(`- [ ] **Other outside boxes** (${rest.filter((i) => i.vaultable).length} of them vaultable: ${idList(rest.filter((i) => i.vaultable).map((i) => i.id))}): ${byHeight(rest)}.`);
  for (const i of exterior.items) listedOutside(`item:${i.id}`);
  const stray = items.filter((i) => i.room === null && i.text);
  if (stray.length) lines.push(`- [ ] **In no room:** ${stray.map((i) => i.text).join("; ")}.`);
  return { items, lines };
}

/** walkthrough.md with its checklist replaced by `lines`; a line ticked before ([x]) stays ticked, by its text up to the first colon. */
export function withChecklist(doc: string, lines: string[]): string {
  const a = doc.indexOf(CHECKLIST_START);
  const b = doc.indexOf(CHECKLIST_END);
  if (a < 0 || b < a) throw new Error(`research/oregon/walkthrough.md: the checklist markers are missing ("${CHECKLIST_START}" ... "${CHECKLIST_END}")`);
  const ticked = new Set([...doc.slice(a, b).matchAll(/^- \[x\] (.*?):/gm)].map((m) => m[1]));
  const body = lines.map((l) => {
    const m = /^- \[ \] (.*?):/.exec(l);
    return m && ticked.has(m[1]) ? l.replace("- [ ]", "- [x]") : l;
  });
  return `${doc.slice(0, a + CHECKLIST_START.length)}\n\n${body.join("\n").trim()}\n\n${doc.slice(b)}`;
}
