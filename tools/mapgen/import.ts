// Seeds data/maps/oregon/walls_<floor>.json from the extraction (DESIGN §6 step 2), once: collinear raster
// boxes become wall lines, openings and soft parts become spans on them, drone-hole icons find their wall,
// and each span gets the research row it answers to (layout_notes §6, surfaces §2). After the seed, the wall
// files are curated by hand; this refuses to overwrite them without --force (the D-039 pattern).
import type { ConnectionRow, Floor, SoftWallRow } from "./research.js";
import type { SpanDef, WallDef, WallsPart } from "./schema.js";

export interface ExtractedWall {
  id: string;
  k: "H" | "V";
  rect: [number, number, number, number];
  c: number;
  t: number;
  len: number;
  weight: "int" | "ext";
  surface: "HARD" | "SOFT";
  soft_wall?: string;
  sections?: number;
  confidence: "high" | "medium" | "low";
}
export interface ExtractedOpening {
  id: string;
  k: "H" | "V" | "?";
  rect: [number, number, number, number];
  type: "DOOR" | "EXT_OPENING" | "OPEN" | "DRONE_HOLE";
}
export interface Extracted {
  floors: Record<Floor, { walls: ExtractedWall[]; openings: ExtractedOpening[] }>;
}

/** Thickness classes by drawn band (u): 7 px interior, 11–13 px exterior; anything thicker keeps its size. */
const weightOf = (t: number, mPerU: number): WallDef["weight"] => (t <= 3.2 ? "int" : t <= 5.5 ? "ext" : Math.round((t * mPerU) / 0.05) * 0.05);

const r2 = (x: number) => Math.round(x * 100) / 100;
const idNum = (id: string) => id.replace(/^\w+-/, "");
const prefix = (f: Floor) => `${f}.`;

interface Item {
  wall?: ExtractedWall;
  open?: ExtractedOpening;
  axis: "H" | "V";
  /** Band across the line (perpendicular), and extent along it, u. */
  b0: number;
  b1: number;
  a0: number;
  a1: number;
}

function item(axis: "H" | "V", rect: [number, number, number, number], x: Pick<Item, "wall" | "open">): Item {
  const [x0, y0, x1, y1] = rect;
  return axis === "H" ? { ...x, axis, b0: y0, b1: y1, a0: x0, a1: x1 } : { ...x, axis, b0: x0, b1: x1, a0: y0, a1: y1 };
}

/** Collinear boxes and openings that touch along the line form one wall line. */
function groupLines(items: Item[]): Item[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const p = items[i];
      const q = items[j];
      if (p.axis !== q.axis) continue;
      const overlap = Math.min(p.b1, q.b1) - Math.max(p.b0, q.b0);
      if (overlap < 0.5 * Math.min(p.b1 - p.b0, q.b1 - q.b0)) continue;
      const gap = Math.max(p.a0, q.a0) - Math.min(p.a1, q.a1);
      if (gap > 0.6) continue;
      parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Item[]>();
  items.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(it);
  });
  return [...groups.values()];
}

export interface ImportResult {
  part: WallsPart;
  /** Research rows no span answered to, and spans with no research row (for the importer's printout). */
  unmatched: { rows: ConnectionRow[]; spans: string[] };
}

export function importFloor(floor: Floor, ex: Extracted, research: { connections: ConnectionRow[]; softWalls: SoftWallRow[] }, mPerU: number): ImportResult {
  const { walls, openings } = ex.floors[floor];
  const items: Item[] = [
    ...walls.map((w) => item(w.k, w.rect, { wall: w })),
    ...openings.filter((o) => o.k !== "?").map((o) => item(o.k as "H" | "V", o.rect, { open: o })),
  ];
  const lines = groupLines(items)
    .filter((g) => g.some((i) => i.wall))
    .map((g) => g.sort((p, q) => p.a0 - q.a0));

  // Research rows for this floor's openings, matched by position (B and 1F rows can be several u off).
  const rows = research.connections.filter((r) => r.floor === floor && r.type !== "SOFT");
  const candidates: { row: ConnectionRow; open: ExtractedOpening; score: number }[] = [];
  const lineOf = new Map<string, { axis: "H" | "V"; at: number; a0: number; a1: number }>();
  for (const g of lines) {
    const ws = g.filter((i) => i.wall);
    const len = ws.reduce((a, i) => a + (i.a1 - i.a0), 0);
    const at = ws.reduce((a, i) => a + ((i.b0 + i.b1) / 2) * (i.a1 - i.a0), 0) / len;
    for (const i of g) if (i.open) lineOf.set(i.open.id, { axis: i.axis, at, a0: i.a0, a1: i.a1 });
  }
  for (const o of openings) {
    const l = lineOf.get(o.id);
    if (!l) continue;
    for (const row of rows) {
      // A row with no position is an open-plan link (rooms split it in M2), not a wall opening.
      if (row.type !== o.type || row.line === null || row.axis !== l.axis) continue;
      const dl = Math.abs(row.line - l.at);
      if (dl > 15) continue; // B and 1F rows are up to 14 u off (DESIGN §6)
      const ds = row.span ? Math.abs((row.span[0] + row.span[1]) / 2 - (l.a0 + l.a1) / 2) : 8;
      const score = dl + ds;
      if (score <= 30) candidates.push({ row, open: o, score });
    }
  }
  candidates.sort((p, q) => p.score - q.score);
  const rowFor = new Map<string, ConnectionRow>();
  const usedRows = new Set<ConnectionRow>();
  for (const c of candidates) {
    if (rowFor.has(c.open.id) || usedRows.has(c.row)) continue;
    rowFor.set(c.open.id, c.row);
    usedRows.add(c.row);
  }

  const softById = new Map(research.softWalls.filter((s) => s.floor === floor).map((s) => [s.id, s]));
  const unmatchedSpans: string[] = [];
  const out: WallDef[] = lines.map((g) => {
    const ws = g.filter((i) => i.wall);
    const len = ws.reduce((a, i) => a + (i.a1 - i.a0), 0);
    const at = ws.reduce((a, i) => a + ((i.b0 + i.b1) / 2) * (i.a1 - i.a0), 0) / len;
    const main = ws.reduce((a, i) => (i.a1 - i.a0 > a.a1 - a.a0 ? i : a));
    const weight = weightOf(main.wall!.t, mPerU);
    const conf = ws.some((i) => i.wall!.confidence === "low") ? "low" : ws.some((i) => i.wall!.confidence === "medium") ? "medium" : "high";
    const ids = [...new Set(ws.map((i) => idNum(i.wall!.id).replace(/[a-z]$/, "")))].sort();
    const spans: SpanDef[] = [];
    for (const i of g) {
      const at2: [number, number] = [r2(i.a0), r2(i.a1)];
      if (i.wall?.surface === "SOFT") {
        const sw = i.wall.soft_wall ? softById.get(i.wall.soft_wall) : undefined;
        if (!i.wall.soft_wall || !i.wall.sections) throw new Error(`${floor} ${i.wall.id}: a soft part without a surfaces.md id`);
        spans.push({
          kind: "SOFT",
          id: i.wall.soft_wall,
          at: at2,
          sections: i.wall.sections,
          research: sw ? `surfaces §2: ${sw.roomA} | ${sw.roomB}` : undefined,
          from: [i.wall.id],
          _unverified: sw && !sw.ulo ? ["sections"] : [],
        });
      } else if (i.open) {
        const o = i.open;
        const row = rowFor.get(o.id);
        const research = row ? `layout_notes §6: ${row.roomA} | ${row.roomB} (${row.typeText})` : undefined;
        if (!row) unmatchedSpans.push(`${floor}.${idNum(o.id)} ${o.type}`);
        const id = prefix(floor) + idNum(o.id);
        if (o.type === "DOOR") spans.push({ kind: "DOOR", id, at: at2, research, from: [o.id], _unverified: [] });
        else if (o.type === "OPEN") spans.push({ kind: "OPEN", id, at: at2, research, from: [o.id], _unverified: [] });
        else {
          // Exterior opening: the research's guess, else rule P9 (a door at ground level, a window above it).
          const sure = row !== undefined && /= DOOR/.test(row.typeText);
          const guess = row?.guess ?? (floor === "1F" || floor === "B" ? "DOOR" : "WINDOW");
          const note = row?.guess ? `kind from the research guess` : `kind from rule P9 (no research guess)`;
          spans.push({ kind: guess, id, at: at2, research, from: [o.id], note: sure ? undefined : note, _unverified: sure ? [] : ["kind"] });
        }
      }
    }
    return {
      id: `${prefix(floor)}${ids[0]}`,
      axis: g[0].axis,
      at: r2(at),
      span: [r2(Math.min(...g.map((i) => i.a0))), r2(Math.max(...g.map((i) => i.a1)))] as [number, number],
      weight,
      kind: "wall" as const,
      spans,
      from: ws.map((i) => i.wall!.id),
      src: "raster" as const,
      conf,
      _unverified: [],
    };
  });

  // Drone holes: the r6calls icon sits on a wall; put a slot on the line whose band holds its centre.
  const holes = openings.filter((o) => o.type === "DRONE_HOLE").sort((p, q) => p.rect[0] - q.rect[0] || p.rect[1] - q.rect[1]);
  for (const [n, o] of holes.entries()) {
    const cx = (o.rect[0] + o.rect[2]) / 2;
    const cy = (o.rect[1] + o.rect[3]) / 2;
    let best: { w: WallDef; d: number } | null = null;
    for (const w of out) {
      const [along, across] = w.axis === "H" ? [cx, cy] : [cy, cx];
      if (along < w.span[0] || along > w.span[1]) continue;
      const d = Math.abs(across - w.at);
      if (d <= 3 && (!best || d < best.d)) best = { w, d };
    }
    if (!best) {
      unmatchedSpans.push(`${o.id} (no wall under the icon)`);
      continue;
    }
    const along = best.w.axis === "H" ? cx : cy;
    const halfU = 0.2 / mPerU;
    best.w.spans.push({ kind: "DRONE_HOLE", id: `${prefix(floor)}dt${n + 1}`, at: [r2(along - halfU), r2(along + halfU)], from: [o.id], note: "slot centred on the r6calls drone-tunnel icon", _unverified: ["at"] });
    best.w.spans.sort((p, q) => p.at[0] - q.at[0]);
  }

  out.sort((p, q) => (p.axis === q.axis ? p.at - q.at || p.span[0] - q.span[0] : p.axis === "H" ? -1 : 1));
  const seen = new Set<string>();
  for (const w of out) {
    let id = w.id;
    for (let n = 2; seen.has(id); n++) id = `${w.id}-${n}`;
    w.id = id;
    seen.add(id);
  }
  return {
    part: {
      _doc:
        `Oregon ${floor} wall lines, in the ${floor} image's own frame (u; layout.json frames map it to the world). ` +
        "Seeded from extracted.json by `npm run mapgen:import`, then curated by hand: every hand edit sets src \"hand\" " +
        "(or \"ulo\") and a note. A line is HARD wherever no span covers it. tools/mapgen/DESIGN.md §4.",
      floor,
      frame: floor,
      walls: out,
    },
    unmatched: { rows: rows.filter((r) => !usedRows.has(r)), spans: unmatchedSpans },
  };
}
