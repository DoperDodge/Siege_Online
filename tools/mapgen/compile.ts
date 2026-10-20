// The map compiler (DESIGN §5.2): authoring layout and parts in, an ordinary LevelDef out. Pure: the same
// inputs give byte-identical output (the freshness test regenerates level.json and compares).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { levelSchema } from "../../game/shared/src/data/schemas.js";
import { checkLevel, type CheckReport } from "./checks.js";
import { frames } from "./frames.js";
import { round } from "./format.js";
import type { Floor } from "./research.js";
import { exteriorPartSchema, layoutSchema, wallsPartSchema, type ExteriorPart, type Layout, type WallsPart } from "./schema.js";
import { frameDiagnostics, type HatchLanding } from "./diagnostics.js";
import { compileFloors, type HatchReport } from "./floors.js";
import { compileRooms } from "./rooms.js";
import { checkStairs, compileStairs, stairKeepOut, stairRails } from "./stairs.js";
import { compileWalls, type Solid, type Zone } from "./walls.js";

export interface Inputs {
  layout: Layout;
  walls: WallsPart[];
  exterior: ExteriorPart;
}

/** Read and validate a map's authoring files (data/maps/<id>/layout.json and its parts). */
export function loadInputs(root: string, mapId = "oregon"): Inputs {
  const dir = join(root, "data", "maps", mapId);
  const read = (f: string): unknown => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const parse = <T>(file: string, schema: { parse(v: unknown): T }): T => {
    try {
      return schema.parse(read(file));
    } catch (e) {
      throw new Error(`data/maps/${mapId}/${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const layout = parse("layout.json", layoutSchema);
  const walls: WallsPart[] = [];
  let exterior: ExteriorPart | null = null;
  for (const part of layout.parts) {
    if (part.startsWith("walls_")) walls.push(parse(part, wallsPartSchema));
    else if (part === "exterior.json") exterior = parse(part, exteriorPartSchema);
    else throw new Error(`data/maps/${mapId}/layout.json: unknown part "${part}"`);
  }
  if (!exterior) throw new Error(`data/maps/${mapId}/layout.json: parts must include exterior.json`);
  return { layout, walls, exterior };
}

export interface Compiled {
  /** The LevelDef as written to level.json (defaults left out). */
  level: Record<string, unknown>;
  report: CheckReport & {
    warnings: string[];
    counts: Record<string, number>;
    openings: Record<string, "exterior" | "interior">;
    hatches: HatchReport[];
    /** Per floor frame with an alternative: where its hatches land under each option. */
    frames: Record<string, Record<"main" | "alt", HatchLanding[]>>;
  };
}

const r4 = (x: number) => round(x, 4);
const v3 = (v: [number, number, number]): [number, number, number] => [r4(v[0]), r4(v[1]), r4(v[2])];

export function compile(inputs: Inputs): Compiled {
  const { layout, exterior } = inputs;
  const fr = frames(layout);
  const k = layout.units.mPerU;
  const d = layout.defaults;
  const emitted = new Set<Floor>(layout.emit);
  const ids = new Set<string>();
  for (const p of inputs.walls) {
    for (const w of p.walls) {
      if (ids.has(w.id)) throw new Error(`walls_${p.floor}.json: the wall id "${w.id}" is used twice`);
      ids.add(w.id);
      for (const s of w.spans) {
        if (ids.has(s.id)) throw new Error(`walls_${p.floor}.json: the span id "${s.id}" is used twice`);
        ids.add(s.id);
      }
    }
  }

  // ---- Walls, storey by storey.
  const order = layout.storeys.map((s) => s.id);
  const parts = inputs.walls
    .filter((p) => emitted.has(p.floor))
    .sort((p, q) => order.indexOf(p.floor) - order.indexOf(q.floor));
  const wallsOut = compileWalls(layout, fr, parts, exterior.playable);
  // ---- Stairs and ladders: flights, landings, the walls between flights, and the holes the floors above lose.
  const stairsOut = compileStairs(layout, fr);
  // ---- Rooms (seeds, splits) and floors (the ground, slabs, soft floors, hatches, wells, stairwells).
  const roomsOut = compileRooms(layout, fr, wallsOut.solids, stairKeepOut(layout, stairsOut));
  const floorsOut = compileFloors(layout, fr, wallsOut.solids, roomsOut, exterior.playable, stairsOut.holes);
  // Rails round the stairwells come last: they'd part rooms in the plan's flood.
  const rails = stairRails(layout, stairsOut, wallsOut.solids);
  const panelKind = new Set(["REINFORCEABLE", "SOFT_FLOOR", "HATCH"]);
  const byKind = (s: Solid) => (panelKind.has(s.surface) ? 1 : s.surface === "BARRICADE" || s.surface === "WINDOW" || /\.(head|sill)$/.test(s.id) ? 2 : 0);
  const solids: Solid[] = [...wallsOut.solids, ...floorsOut.solids, ...stairsOut.solids, ...rails].sort((p, q) => byKind(p) - byKind(q) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));

  // ---- Play-area edge and kill plane (placeholders P25, P26).
  const [px0, py0, px1, py1] = exterior.playable.map((u) => u * k);
  const bt = d.boundary.thickM;
  const bh = d.boundary.hM;
  const edge = (id: string, x0: number, z0: number, x1: number, z1: number): Solid => ({
    id,
    center: [(x0 + x1) / 2, bh / 2, (z0 + z1) / 2],
    size: [x1 - x0, bh, z1 - z0],
    surface: "HARD_WALL",
    bodiesOnly: true,
  });
  const boundary = [
    edge("edge:N", px0 - bt, py0 - bt, px1 + bt, py0),
    edge("edge:S", px0 - bt, py1, px1 + bt, py1 + bt),
    edge("edge:W", px0 - bt, py0, px0, py1),
    edge("edge:E", px1, py0, px1 + bt, py1),
  ];
  const lowest = Math.min(...layout.storeys.map((s) => s.floorY));
  const highest = Math.max(...layout.storeys.map((s) => s.floorY));

  // ---- Spawns: lab spawn 0 first, then attackers and defenders by group (P27–P29).
  const fp = wallsOut.footprint;
  const centre: [number, number] = [((fp.minX + fp.maxX) / 2) * k, ((fp.minY + fp.maxY) / 2) * k];
  const spawnOrder = { lab: 0, attack: 1, defense: 2 } as const;
  const spawns = [...layout.spawns]
    .sort((p, q) => spawnOrder[p.side] - spawnOrder[q.side] || (p.id < q.id ? -1 : 1))
    .map((s) => {
      const [wx, wy] = fr.toWorld(s.frame, s.at[0], s.at[1]);
      const pos: [number, number, number] = [wx * k, s.level === "EXT" ? 0 : layout.storeys.find((st) => st.id === s.level)!.floorY, wy * k];
      // Facing the building: yaw 0 faces −z (north), 90 faces −x (west).
      const yawDeg = s.facing === "building" ? (Math.atan2(-(centre[0] - pos[0]), -(centre[1] - pos[2])) * 180) / Math.PI : s.facing;
      return { id: s.id, pos: v3(pos), yawDeg: round(yawDeg, 1), ...(s.side === "lab" ? {} : { side: s.side, group: s.group }) };
    });
  if (spawns[0] === undefined || layout.spawns.find((s) => s.id === spawns[0].id)!.side !== "lab") throw new Error("layout.json: spawn 0 must be a lab spawn (rooms put everyone there)");

  const storeys = layout.storeys.map((s, i) => {
    const next = layout.storeys[i + 1];
    return { id: s.id, floorY: s.floorY, ceilingY: r4(next ? next.floorY - next.slabM : s.floorY + d.wallHeightM) };
  });
  const zones: Zone[] = wallsOut.zones;

  const out = (s: Solid) => ({
    id: s.id,
    center: v3(s.center),
    size: v3(s.size),
    surface: s.surface,
    ...(s.vaultable ? { vaultable: true } : {}),
    ...(s.bodiesOnly ? { bodiesOnly: true } : {}),
    ...(s.drawOnly ? { drawOnly: true } : {}),
    ...(s.label ? { label: s.label } : {}),
    ...(s.panel ? { panel: s.panel } : {}),
  });
  const level = {
    _doc:
      `Generated by tools/mapgen from data/maps/${layout.id}/layout.json and its parts: do not edit (npm run mapgen). ` +
      `Storeys compiled so far: ${layout.emit.join(", ")}. Every number that isn't from the extraction is a placeholder ` +
      "listed in layout.json (_unverified) and research/OPEN_QUESTIONS.md.",
    id: layout.id,
    name: layout.name,
    spawns,
    solids: [...solids, ...boundary].map(out),
    bounds: { min: v3([px0, lowest - d.killDepthM, py0]), max: v3([px1, highest + 10, py1]), killY: r4(lowest - d.killDepthM) },
    plan: {
      mPerU: k,
      frames: Object.fromEntries(layout.storeys.map((s) => {
        const a = fr.affine(s.id);
        return [s.id, { ax: a.ax, bx: a.bx, ay: a.ay, by: a.by }];
      })),
    },
    storeys,
    stairs: stairsOut.flights.map((f) => ({ ...f, start: v3(f.start) })),
    ladders: stairsOut.ladders.map((l) => ({ ...l, base: v3(l.base) })),
    rooms: roomsOut.rooms.map((r) => ({ id: r.id, callout: r.callout, storey: r.storey, rects: r.rects, anchor: v3(r.anchor) })),
    zones: zones.map((z) => ({ id: z.id, kind: z.kind, boxes: z.boxes.map((b) => ({ center: v3(b.center), size: v3(b.size) })) })),
  };
  // The engine's own schema has the last word on shape.
  levelSchema.parse(level);
  const checks = checkLevel(level.solids);
  checks.errors.push(...roomsOut.errors, ...floorsOut.errors, ...stairsOut.errors, ...checkStairs(layout, stairsOut, level.solids, level.rooms));
  const counts: Record<string, number> = { solids: level.solids.length, spawns: spawns.length, zones: zones.length, rooms: roomsOut.rooms.length };
  for (const [floor, c] of Object.entries(floorsOut.counts)) {
    counts[`slabs ${floor}`] = c.slabs;
    counts[`tiles ${floor}`] = c.tiles;
    counts[`hatches ${floor}`] = c.hatches;
  }
  for (const s of level.solids) counts[s.surface] = (counts[s.surface] ?? 0) + 1;
  counts.exteriorOpenings = [...wallsOut.exterior.values()].filter(Boolean).length;
  counts.interiorOpenings = [...wallsOut.exterior.values()].filter((x) => !x).length;
  const openings = Object.fromEntries([...wallsOut.exterior].sort(([p], [q]) => (p < q ? -1 : 1)).map(([id, ext]) => [id, ext ? "exterior" : "interior"] as const));
  const frameReport = frameDiagnostics(layout, inputs.walls, exterior.playable, floorsOut.hatches);
  // Amendment 2: a hatch whose opening lands under 0.3 m from a wall of the room below is worth a look.
  const landWarnings = Object.entries(frameReport).flatMap(([frame, o]) =>
    o[layout.frames[frame as keyof Layout["frames"]].use]
      .filter((l) => l.over < 1 || l.clearM < 0.3)
      .map((l) => (l.over < 1 ? `${l.hatch}: only ${Math.round(l.over * 100)}% over ${l.bottom}` : `${l.hatch} lands ${l.clearM} m from a wall of ${l.bottom} (under 0.3 m)`)),
  );
  return { level, report: { ...checks, warnings: [...wallsOut.warnings, ...roomsOut.warnings, ...floorsOut.warnings, ...landWarnings], counts, openings, hatches: floorsOut.hatches, frames: frameReport } };
}
