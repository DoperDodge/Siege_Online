// The generator's report (DESIGN §6 outputs, M6): the budgets the engine was sized for against what was built,
// every value still a placeholder (the UNVERIFIED list, by file and record), and how far the wall files have
// moved from the extraction they were seeded from (drift). `npm run mapgen` writes it to builds/mapgen/report.json
// and report.md with the counts, both basement frames and the warnings, and prints a summary; the tests hold the
// same lists to their limits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUDGET, PANEL_SURFACES, panelCells } from "./checks.js";
import type { Compiled, Inputs } from "./compile.js";
import { readableJson } from "./format.js";
import type { Extracted } from "./import.js";

export interface Budget {
  name: string;
  value: number;
  limit: number;
}

/** A record of an authoring file and the fields of it that are still placeholders. */
export interface Unverified {
  file: string;
  /** The record's collection and id ("spawns SITE_DORMS"), its path in the file when it has no id, "(file)" for the file's own list. */
  record: string;
  fields: string[];
}

/** How far a wall line or span sits from the extracted boxes it was seeded from (u), or that its box is gone. */
export interface Drift {
  floor: string;
  id: string;
  /** "span" (a line's ends), "centre" (a line's centreline), "at" (a span's ends) or "drone hole" (its middle). */
  what: string;
  /** Infinity: `from` names a box extracted.json doesn't have. */
  du: number;
}

export interface MapReport {
  budgets: Budget[];
  unverified: Unverified[];
  drift: Drift[];
  /** Lines and spans placed by hand or from Ulo's answers: the extraction doesn't hold them. */
  curated: { floor: string; id: string; src: string }[];
}

export function budgets(compiled: Compiled): Budget[] {
  const solids = compiled.level.solids as Parameters<typeof panelCells>[0][];
  const panels = solids.filter((s) => PANEL_SURFACES.has(s.surface) && !(s as { bodiesOnly?: boolean }).bodiesOnly);
  return [
    // Every box in level.json (walls, panels, props, draw-only bars): the static colliders' budget, steps and ramps aside.
    { name: "solids", value: compiled.report.colliders, limit: BUDGET.colliders },
    { name: "panels", value: compiled.report.panels, limit: BUDGET.panels },
    { name: "panel cells per layer", value: compiled.report.cellsPerLayer, limit: BUDGET.cellsPerLayer },
    { name: "cells per layer of the largest panel", value: Math.max(0, ...panels.map(panelCells)), limit: BUDGET.panelCells },
    { name: "level.json bytes", value: Buffer.byteLength(readableJson(compiled.level)), limit: BUDGET.levelBytes },
  ];
}

/** Every value a map's authoring files still mark UNVERIFIED: each file's own list, and each record's. */
export function unverifiedList(root: string, inputs: Inputs, mapId = "oregon"): Unverified[] {
  const out: Unverified[] = [];
  for (const file of ["layout.json", ...inputs.layout.parts]) {
    const raw = JSON.parse(readFileSync(join(root, "data", "maps", mapId, file), "utf8")) as Record<string, unknown>;
    const walk = (v: unknown, path: string, top: boolean) => {
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`, false));
      if (v === null || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      const fields = o._unverified;
      // A site and its first defender spawn share an id: the collection (the array it is in) tells them apart.
      const collection = path.replace(/\[\d+\]$/, "").split(".").pop();
      if (Array.isArray(fields) && fields.length) out.push({ file, record: top ? "(file)" : typeof o.id === "string" ? `${collection} ${o.id}` : path, fields: fields.map(String) });
      for (const [k, x] of Object.entries(o)) if (k !== "_unverified") walk(x, path ? `${path}.${k}` : k, false);
    };
    walk(raw, "", true);
  }
  return out;
}

/**
 * Drift: each wall line seeded from the extraction (src "raster") against its boxes (its ends and its
 * centreline), and each span against the box or glyph it came from (a drone hole by its middle, the rest by
 * their ends). Lines and spans placed by hand or by Ulo are listed apart.
 */
export function wallDrift(inputs: Inputs, extracted: Extracted): Pick<MapReport, "drift" | "curated"> {
  const drift: Drift[] = [];
  const curated: MapReport["curated"] = [];
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const part of inputs.walls) {
    const ex = extracted.floors[part.floor];
    const boxes = new Map(ex.walls.map((w) => [w.id, w]));
    const opens = new Map(ex.openings.map((o) => [o.id, o]));
    const push = (id: string, what: string, du: number) => drift.push({ floor: part.floor, id, what, du: Number.isFinite(du) ? r2(du) : du });
    for (const w of part.walls) {
      if (w.src === "hand" || w.src === "ulo") {
        curated.push({ floor: part.floor, id: w.id, src: w.src });
        continue;
      }
      const from = (w.from ?? []).map((id) => boxes.get(id));
      if (from.some((b) => !b)) push(w.id, "span", Infinity);
      const found = from.filter((b) => b !== undefined);
      const along = found.flatMap((b) => (w.axis === "H" ? [b.rect[0], b.rect[2]] : [b.rect[1], b.rect[3]]));
      const lo = Math.min(...along, ...w.spans.map((s) => s.at[0]));
      const hi = Math.max(...along, ...w.spans.map((s) => s.at[1]));
      push(w.id, "span", Math.max(Math.abs(lo - w.span[0]), Math.abs(hi - w.span[1])));
      // Every box, not just the nearest: a line that swallowed a wall drawn elsewhere has one far off.
      if (found.length) push(w.id, "centre", Math.max(...found.map((b) => Math.abs(b.c - w.at))));
      for (const s of w.spans) {
        if (s.src === "hand" || s.src === "ulo") curated.push({ floor: part.floor, id: s.id, src: s.src });
        if (s.src === "hand" || s.src === "ulo" || !s.from) continue;
        const src = boxes.get(s.from[0]) ?? opens.get(s.from[0]);
        if (!src) {
          push(s.id, "at", Infinity);
          continue;
        }
        const [a0, a1] = w.axis === "H" ? [src.rect[0], src.rect[2]] : [src.rect[1], src.rect[3]];
        if (s.kind === "DRONE_HOLE") push(s.id, "drone hole", Math.abs((s.at[0] + s.at[1]) / 2 - (a0 + a1) / 2));
        else push(s.id, "at", Math.max(Math.abs(a0 - s.at[0]), Math.abs(a1 - s.at[1])));
      }
    }
  }
  return { drift, curated };
}

export function mapReport(root: string, inputs: Inputs, compiled: Compiled, extracted: Extracted): MapReport {
  return { budgets: budgets(compiled), unverified: unverifiedList(root, inputs), ...wallDrift(inputs, extracted) };
}

const n = (x: number) => x.toLocaleString("en-GB");
/** Drift worth a look in the report: more than this (u; 1 u is about 15 cm). */
const DRIFT_SHOWN_U = 0.05;

/** The summary `npm run mapgen` prints, a line each. */
export function summaryLines(r: MapReport): string[] {
  const files = new Map<string, number>();
  for (const u of r.unverified) files.set(u.file, (files.get(u.file) ?? 0) + u.fields.length);
  const moved = r.drift.filter((d) => d.du > DRIFT_SHOWN_U);
  return [
    `budgets: ${r.budgets.map((b) => `${b.name} ${n(b.value)} of ${n(b.limit)}`).join(", ")}`,
    `UNVERIFIED: ${n(r.unverified.reduce((a, u) => a + u.fields.length, 0))} values in ${n(r.unverified.length)} records (${[...files].map(([f, c]) => `${f} ${c}`).join(", ")})`,
    `drift from the extraction: ${moved.length} of ${r.drift.length} measures over ${DRIFT_SHOWN_U} u, at most ${Math.max(0, ...r.drift.map((d) => d.du))} u; ${r.curated.length} lines and spans placed by hand or by Ulo`,
  ];
}

/** builds/mapgen/report.md: the whole report, for reading. */
export function reportMarkdown(compiled: Compiled, r: MapReport, frameInUse: Record<string, string>): string {
  const c = compiled.report;
  const out: string[] = ["# Oregon: the generator's report", "", "Written by `npm run mapgen` from `data/maps/oregon` (layout.json and its parts). Not committed: run it again for a fresh one.", ""];
  out.push("## Counts", "", "| What | Count |", "|---|---|", ...Object.entries(c.counts).map(([k, v]) => `| ${k} | ${n(v)} |`), "");
  out.push("## Budgets", "", "| Budget | Now | Limit |", "|---|---|---|", ...r.budgets.map((b) => `| ${b.name} | ${n(b.value)} | ${n(b.limit)} |`), "");
  out.push("## Frames with an alternative", "", "Where each hatch lands under each option (DESIGN P2).", "");
  for (const [frame, options] of Object.entries(c.frames)) {
    for (const [use, landings] of Object.entries(options)) {
      out.push(`- **${frame} ${use}**${frameInUse[frame] === use ? " (in use)" : ""}: ${landings.map((l) => `${l.hatch} ${Math.round(l.over * 100)}% over ${l.bottom}${l.over === 1 ? `, ${l.clearM} m clear` : ""}`).join("; ")}`);
    }
  }
  out.push("", `## Warnings (${c.warnings.length})`, "", ...(c.warnings.length ? c.warnings.map((w) => `- ${w}`) : ["None."]), "");
  const total = r.unverified.reduce((a, u) => a + u.fields.length, 0);
  out.push(`## UNVERIFIED (${n(total)} values in ${n(r.unverified.length)} records)`, "", "Placeholders until Ulo or a source confirms them (DESIGN §10, research/OPEN_QUESTIONS.md).", "");
  for (const file of [...new Set(r.unverified.map((u) => u.file))]) {
    const rows = r.unverified.filter((u) => u.file === file);
    out.push(`### ${file} (${rows.reduce((a, u) => a + u.fields.length, 0)})`, "", "| Record | Fields |", "|---|---|", ...rows.map((u) => `| ${u.record} | ${u.fields.join(", ")} |`), "");
  }
  const moved = r.drift.filter((d) => d.du > DRIFT_SHOWN_U).sort((a, b) => b.du - a.du || (a.id < b.id ? -1 : 1));
  out.push(`## Drift from the extraction`, "", `${r.drift.length} measures of the lines and spans seeded from extracted.json; ${moved.length} over ${DRIFT_SHOWN_U} u (the tests fail over 0.5 u).`, "");
  if (moved.length) out.push("| Floor | Line or span | Measure | u |", "|---|---|---|---|", ...moved.map((d) => `| ${d.floor} | ${d.id} | ${d.what} | ${d.du} |`), "");
  out.push(`### Placed by hand or by Ulo (${r.curated.length})`, "", r.curated.map((x) => `${x.floor} ${x.id} (${x.src})`).join(", ") || "None.", "");
  return out.join("\n");
}
