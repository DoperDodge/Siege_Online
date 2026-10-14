// Reads the Oregon research tables (research/oregon/*.md) so the importer can name what it finds and the
// tests notice a research edit: soft walls (surfaces.md §2) and the openings between rooms (layout_notes.md
// §6). Plain markdown tables, parsed by heading.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Floor = "B" | "1F" | "2F" | "3F";
export const FLOORS: readonly Floor[] = ["B", "1F", "2F", "3F"];

/** One markdown table: header cells and rows of cells, trimmed. */
export interface MdTable {
  heading: string;
  header: string[];
  rows: string[][];
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** Every table in a markdown file, each with the nearest heading above it. */
export function mdTables(text: string): MdTable[] {
  const out: MdTable[] = [];
  let heading = "";
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6} /.test(line)) heading = line.replace(/^#+ /, "").trim();
    if (!line.trim().startsWith("|") || !lines[i + 1]?.trim().match(/^\|[\s|:-]+\|?$/)) continue;
    const header = cells(line);
    const rows: string[][] = [];
    i += 2;
    while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
    i--;
    out.push({ heading, header, rows });
  }
  return out;
}

/** "137.0–164.0" or "x≈3" style numbers: [lo, hi] (equal for a single value). */
export function range(text: string): [number, number] | null {
  const m = text.replace(/\*/g, "").match(/(-?\d+(?:\.\d+)?)(?:\s*[–-]\s*(-?\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? a : Number(m[2]);
  return [Math.min(a, b), Math.max(a, b)];
}

export interface SoftWallRow {
  id: string;
  floor: Floor;
  roomA: string;
  roomB: string;
  x: [number, number];
  y: [number, number];
  /** H runs east–west, V north–south. */
  axis: "H" | "V";
  sections: number;
  /** Ulo confirmed the count ("sections: Ulo"). */
  ulo: boolean;
}

const FLOOR_OF_SECTION: Record<string, Floor> = { "2.1": "B", "2.2": "1F", "2.3": "2F", "6.1": "B", "6.2": "1F", "6.3": "2F", "6.4": "3F" };

export function researchDir(root: string): string {
  return join(root, "research", "oregon");
}

/** surfaces.md §2: the 32 soft walls with their spans and reinforcement sections. */
export function softWalls(root: string): SoftWallRow[] {
  const text = readFileSync(join(researchDir(root), "surfaces.md"), "utf8");
  const out: SoftWallRow[] = [];
  for (const t of mdTables(text)) {
    const floor = FLOOR_OF_SECTION[t.heading.split(" ")[0]];
    if (!floor || t.header[0] !== "id") continue;
    const col = (name: string) => t.header.indexOf(name);
    for (const r of t.rows) {
      const x = range(r[col("x (u)")]);
      const y = range(r[col("y (u)")]);
      const sections = range(r[col("sections")]);
      if (!x || !y || !sections) throw new Error(`surfaces.md: can't read soft wall row ${r.join(" | ")}`);
      out.push({
        id: r[col("id")],
        floor,
        roomA: r[col("room A")],
        roomB: r[col("room B")],
        x,
        y,
        axis: r[col("orient")].startsWith("E") ? "H" : "V",
        sections: sections[0],
        ulo: /sections: Ulo/.test(r[col("verified")]),
      });
    }
  }
  return out;
}

export type ConnectionType = "DOOR" | "EXT_OPENING" | "OPEN" | "SOFT";

export interface ConnectionRow {
  floor: Floor;
  roomA: string;
  roomB: string;
  type: ConnectionType;
  /** The whole type cell, with the research's guesses ("EXT_OPENING (window, likely; different glyph)"). */
  typeText: string;
  /** Where the research puts it (u, the floor's own image); B and 1F spans can be several u off. */
  axis: "H" | "V" | null;
  line: number | null;
  span: [number, number] | null;
  /** For an exterior opening: the research's door or window guess, if it makes one. */
  guess: "DOOR" | "WINDOW" | null;
}

/** "x 63–66, y 151–164" → the wall line and the span along it. */
export function parseWhere(where: string): Pick<ConnectionRow, "axis" | "line" | "span"> {
  const parts = [...where.matchAll(/([xy])\s*(≈)?\s*(-?\d+(?:\.\d+)?)(?:\s*[–-]\s*(-?\d+(?:\.\d+)?))?/g)].map((m) => ({
    k: m[1] as "x" | "y",
    approx: m[2] !== undefined,
    lo: Number(m[3]),
    hi: m[4] === undefined ? Number(m[3]) : Number(m[4]),
  }));
  if (parts.length === 0) return { axis: null, line: null, span: null };
  // The wall line is the narrow one (a band a few u thick, or "≈"); the other is the span along it.
  const lineIdx = parts.length === 1 ? 0 : parts.findIndex((p) => p.approx || p.hi - p.lo <= 4.5);
  const linePart = parts[lineIdx === -1 ? 0 : lineIdx];
  const spanPart = parts.find((p) => p !== linePart);
  return {
    axis: linePart.k === "y" ? "H" : "V",
    line: (linePart.lo + linePart.hi) / 2,
    span: spanPart ? [spanPart.lo, spanPart.hi] : null,
  };
}

/** layout_notes.md §6: every door, exterior opening, open passage and soft wall between rooms. */
export function connections(root: string): ConnectionRow[] {
  const text = readFileSync(join(researchDir(root), "layout_notes.md"), "utf8");
  const out: ConnectionRow[] = [];
  for (const t of mdTables(text)) {
    const floor = FLOOR_OF_SECTION[t.heading.split(" ")[0]];
    if (!floor || t.header[0] !== "Room A") continue;
    for (const r of t.rows) {
      const [roomA, roomB, typeText, where] = r;
      const plain = typeText.replace(/\*/g, "");
      const type: ConnectionType | null = plain.startsWith("DOOR")
        ? "DOOR"
        : plain.startsWith("EXT_OPENING")
          ? "EXT_OPENING"
          : plain.startsWith("OPEN")
            ? "OPEN"
            : plain.startsWith("SOFT")
              ? "SOFT"
              : null;
      if (!type) continue; // "—": a note row
      const guess = type !== "EXT_OPENING" ? null : /window/i.test(plain) ? "WINDOW" : /door/i.test(plain) ? "DOOR" : null;
      out.push({ floor, roomA, roomB, type, typeText: plain, ...parseWhere(where), guess });
    }
  }
  return out;
}
