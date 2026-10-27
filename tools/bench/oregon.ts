// Oregon on this machine (Phase 5 M6; tools/mapgen/DESIGN.md §8 and §9.3): what loading the level costs, an op
// on the biggest panels (the server and every client apply each one), what a late joiner is sent, and the
// client's redraw of a panel after a hole (PLAN §8.2: at most 1 ms a frame on the main thread), on the soft
// floors' tiles as built (layout.json defaults.softFloor.tileMaxM) and cut at 3 m instead (amendment 8).
// Numbers depend on the machine: PROGRESS records a run, and the tests keep loose bounds only. The server's
// tick is netsim's (`npm run netsim -- --level oregon`); frame times and draw calls come from the browser
// (tools/e2e/oregon-perf.mjs, the stats overlay).
//   npm run bench:oregon            prints a table, writes builds/bench/oregon.json
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import * as THREE from "three";
import { applyPanelState, ByteReader, encodePanelState, L_BACK, L_CORE, L_FRONT, levelSchema, loadGameData, Panel, Sim, type GameData, type PanelEntry, type PanelOp } from "@redmond/shared";
import { createLabScene } from "../../game/client/src/render/labScene.js";
import { PanelView } from "../../game/client/src/render/panelView.js";
import { compile, loadInputs } from "../mapgen/compile.js";

const ROOT = process.cwd();
// The lab scene draws its labels and the floor texture on canvases, which Node lacks: these draw nothing.
const pen = new Proxy({}, { get: (_t, key) => (key === "measureText" ? (text: string) => ({ width: 12 * text.length }) : () => {}) });
(globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => pen }) };

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: +at(0.5).toFixed(3), p95: +at(0.95).toFixed(3), max: +s[s.length - 1].toFixed(3), n: s.length };
};
const time = (f: () => void) => {
  const t = performance.now();
  f();
  return performance.now() - t;
};
async function timeAsync(f: () => Promise<unknown>) {
  const t = performance.now();
  await f();
  return performance.now() - t;
}
let seed = 7;
const rnd = (n: number) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 8) % n;

const out: Record<string, unknown> = { node: process.version, date: new Date().toISOString().slice(0, 10) };
const rows: [string, string][] = [];
const row = (what: string, v: { p50: number; p95: number; max: number } | number, unit = "ms") =>
  rows.push([what, typeof v === "number" ? `${+v.toFixed(3)} ${unit}` : `p50 ${v.p50} / p95 ${v.p95} / max ${v.max} ${unit}`]);

// ---- Loading.
// loadGameData reads and checks the files once and keeps them: only its first call costs anything.
let data!: GameData;
const load = time(() => (data = loadGameData()));
const creates: number[] = [];
let sim!: Sim;
for (let i = 0; i < 6; i++) creates.push(await timeAsync(async () => (sim = await Sim.create("oregon", data))));
const scenes: number[] = [];
let lab!: ReturnType<typeof createLabScene>;
for (let i = 0; i < 3; i++) scenes.push(time(() => (lab = createLabScene(sim.level))));
const views: number[] = [];
for (let i = 0; i < 3; i++) views.push(time(() => new PanelView(new THREE.Scene(), sim.level.panels).update()));
out.load = { loadGameDataMs: +load.toFixed(1), simCreate: stats(creates.slice(1)), labScene: stats(scenes), panelView: stats(views) };
row("loadGameData, every data file read and checked (zod)", load);
row("Sim.create oregon (after one warm-up)", stats(creates.slice(1)));
row("lab scene (static boxes, labels)", stats(scenes));
row("PanelView, every panel drawn", stats(views));
void lab;

// ---- Panel ops: a bullet (5 cm), a knife (25 cm) and a breach (1 x 2 m, every layer) on the biggest panels.
const panels = sim.level.panels;
const biggest = (kind: string, n: number) =>
  panels.list.filter((e) => e.panel.kind === kind && !e.panel.broken).sort((a, b) => b.panel.w * b.panel.h - a.panel.w * a.panel.h).slice(0, n);
const subjects = [...biggest("wall", 4), ...biggest("floor", 4), ...biggest("hatch", 1)];
out.biggest = subjects.map((e) => ({ id: e.panel.spec.id, kind: e.panel.kind, cells: e.panel.w * e.panel.h }));
const r4 = (diameterM: number) => Math.round((4 * diameterM) / 2 / data.destruction.cellM);
const shapes: [string, (p: Panel) => PanelOp[]][] = [
  ["bullet", (p) => [{ kind: "cut", layer: rnd(2) ? L_FRONT : L_BACK, shape: { kind: "disc", u4: rnd(4 * p.w), v4: rnd(4 * p.h), r4: r4(0.05) }, hard: false }]],
  ["knife", (p) => [{ kind: "cut", layer: rnd(2) ? L_FRONT : L_BACK, shape: { kind: "disc", u4: rnd(4 * p.w), v4: rnd(4 * p.h), r4: r4(data.destruction.melee.holeDiameterM) }, hard: false }]],
  [
    "breach",
    (p) => {
      const [u0, v0] = [rnd(Math.max(1, p.w - 20)), 0];
      return [L_FRONT, L_CORE, L_BACK].map((layer): PanelOp => ({ kind: "cut", layer, shape: { kind: "rect", u0, v0, u1: u0 + 20, v1: v0 + 40 }, hard: false }));
    },
  ],
];
const ops: Record<string, unknown> = {};
for (const [name, make] of shapes) {
  const pure: number[] = [];
  const withBoxes: number[] = [];
  for (const e of subjects) {
    // A fresh copy of the panel for the op alone, then the level's own (its boxes rebuilt when bodies' cells change).
    for (let i = 0; i < (name === "breach" ? 10 : 60); i++) {
      const list = make(e.panel);
      const copy = new Panel(e.panel.spec);
      pure.push(time(() => list.forEach((op) => copy.apply(op))));
      withBoxes.push(time(() => list.forEach((op) => panels.apply(e.panel.spec.index, op))));
    }
  }
  ops[name] = { panel: stats(pure), level: stats(withBoxes) };
  row(`${name} on the biggest panels: Panel.apply`, stats(pure));
  row(`${name}: PanelSet.apply (boxes rebuilt)`, stats(withBoxes));
}
out.ops = ops;
// Holes in every panel (five bullets and a knife each): what the server hashes, and a late joiner is sent and applies.
for (const e of panels.list) for (let i = 0; i < 6; i++) for (const op of shapes[i < 5 ? 0 : 1][1](e.panel)) panels.apply(e.panel.spec.index, op);
const hashes: number[] = [];
for (let i = 0; i < 5; i++) {
  for (const e of panels.list) e.hashed = null;
  hashes.push(time(() => panels.hash()));
}
const state = encodePanelState(panels);
const joiner = await Sim.create("oregon", data);
const joins = time(() => {
  const r = new ByteReader(state);
  r.u8();
  applyPanelState(r, joiner.level.panels);
});
out.state = { hashAllMs: stats(hashes), lateJoinBytes: state.length, lateJoinApplyMs: +joins.toFixed(3), modifiedPanels: panels.list.filter((e) => e.panel.modified).length };
row("PanelSet.hash, every panel rehashed", stats(hashes));
row(`late join: panel state for ${panels.list.filter((e) => e.panel.modified).length} panels`, state.length / 1024, "KB");
row("late join: applying it", joins);

// ---- The client's redraw after one hole, on the soft floors' tiles as built and cut at 3 m.
async function redraw(tileMaxM: number | null) {
  let s = sim;
  if (tileMaxM !== null) {
    const inputs = loadInputs(ROOT);
    inputs.layout.defaults.softFloor.tileMaxM = tileMaxM;
    for (const f of inputs.layout.softFloors) delete (f as { tileMaxM?: number }).tileMaxM;
    const def = levelSchema.parse({ ...compile(inputs).level, id: `oregon_tiles_${tileMaxM}` });
    s = await Sim.create(def.id, { ...data, levels: new Map(data.levels).set(def.id, def) });
  } else s = await Sim.create("oregon", data);
  const view = new PanelView(new THREE.Scene(), s.level.panels);
  view.update();
  const kinds: Record<string, unknown> = {};
  for (const kind of ["floor", "wall", "hatch"]) {
    const list = s.level.panels.list.filter((e: PanelEntry) => e.panel.kind === kind).sort((a, b) => b.panel.w * b.panel.h - a.panel.w * a.panel.h);
    const e = list[0];
    if (!e) continue;
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      s.level.panels.apply(e.panel.spec.index, { kind: "cut", layer: i % 2 ? L_BACK : L_FRONT, shape: { kind: "disc", u4: rnd(4 * e.panel.w), v4: rnd(4 * e.panel.h), r4: r4(0.05) }, hard: false });
      times.push(time(() => view.update()));
    }
    kinds[kind] = { id: e.panel.spec.id, sizeM: [+e.panel.spec.widthM.toFixed(2), +e.panel.spec.heightM.toFixed(2)], cells: e.panel.w * e.panel.h, redrawMs: stats(times) };
    row(`redraw after a bullet hole, largest ${kind}${kind === "floor" ? ` tile (${tileMaxM ?? "as built"}${tileMaxM ? " m" : ""})` : ""}: ${e.panel.spec.widthM.toFixed(2)} x ${e.panel.spec.heightM.toFixed(2)} m`, stats(times));
  }
  return { panels: s.level.panels.list.length, kinds };
}
const builtTile = loadInputs(ROOT).layout.defaults.softFloor.tileMaxM;
out.redraw = { asBuilt: { tileMaxM: builtTile, ...(await redraw(null)) }, tiles3m: await redraw(3) };

const width = Math.max(...rows.map(([w]) => w.length));
for (const [what, v] of rows) console.log(`${what.padEnd(width)}  ${v}`);
mkdirSync(join(ROOT, "builds", "bench"), { recursive: true });
writeFileSync(join(ROOT, "builds", "bench", "oregon.json"), JSON.stringify(out, null, 1) + "\n");
console.log("wrote builds/bench/oregon.json");
