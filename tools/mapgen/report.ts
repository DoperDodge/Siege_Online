// The generator's report (DESIGN §6 outputs, M6): the budgets the engine was sized for against what was built, and
// every value still a placeholder (the UNVERIFIED list, by file and record). `npm run mapgen` writes it to
// builds/mapgen/report.json and report.md with the counts, the frames with an alternative and the warnings, and prints
// a summary; the tests hold the same lists to their limits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUDGET, PANEL_SURFACES, panelCells } from "./checks.js";
import type { Compiled, Inputs } from "./compile.js";
import { readableJson } from "./format.js";

export interface Budget {
  name: string;
  value: number;
  limit: number;
}

/** A record of an authoring file and the fields of it that are still placeholders. */
export interface Unverified {
  file: string;
  /** The record's collection and id ("spawns SITE_MILL"), its path in the file when it has no id, "(file)" for the file's own list. */
  record: string;
  fields: string[];
}

export interface MapReport {
  budgets: Budget[];
  unverified: Unverified[];
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
export function unverifiedList(root: string, inputs: Inputs, mapId = "millrace"): Unverified[] {
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

export function mapReport(root: string, inputs: Inputs, compiled: Compiled): MapReport {
  return { budgets: budgets(compiled), unverified: unverifiedList(root, inputs, inputs.layout.id) };
}

const n = (x: number) => x.toLocaleString("en-GB");

/** The summary `npm run mapgen` prints, a line each. */
export function summaryLines(r: MapReport): string[] {
  const files = new Map<string, number>();
  for (const u of r.unverified) files.set(u.file, (files.get(u.file) ?? 0) + u.fields.length);
  return [
    `budgets: ${r.budgets.map((b) => `${b.name} ${n(b.value)} of ${n(b.limit)}`).join(", ")}`,
    `UNVERIFIED: ${n(r.unverified.reduce((a, u) => a + u.fields.length, 0))} values in ${n(r.unverified.length)} records${files.size ? ` (${[...files].map(([f, c]) => `${f} ${c}`).join(", ")})` : ""}`,
  ];
}

/** builds/mapgen/report.md: the whole report, for reading. */
export function reportMarkdown(compiled: Compiled, r: MapReport, frameInUse: Record<string, string>, name = "Millrace"): string {
  const c = compiled.report;
  const out: string[] = [`# ${name}: the generator's report`, "", "Written by `npm run mapgen` from `data/maps/<id>` (layout.json and its parts). Not committed: run it again for a fresh one.", ""];
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
  return out.join("\n");
}
