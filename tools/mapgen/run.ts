// npm run mapgen [-- --check]        compile data/maps/oregon/layout.json to level.json and its plans (--check: fail if stale)
// npm run mapgen:import [-- --force] seed walls_<floor>.json from extracted.json (once; --force overwrites)
// npm run mapgen:refs                download the official blueprints and the r6calls map (gitignored)
// npm run mapgen:compare             our plans over the blueprints and rasters, for checking by eye
// npm run mapgen -- --where x,y,floor  a position in a floor's own u (or world u, or metres with ",m") in every
//                                    frame, and the room there (DESIGN amendment 17)
// Run from the repo root (npm does). Bundled by esbuild like netsim; no extra runner.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { walkChecklist, withChecklist } from "./checklist.js";
import { compile, loadInputs } from "./compile.js";
import { frames, type FrameId } from "./frames.js";
import { readableJson } from "./format.js";
import { importFloor, type Extracted } from "./import.js";
import { planSvg, writePlans } from "./plans.js";
import { downloadRefs } from "./refs.js";
import { mapReport, reportMarkdown, summaryLines } from "./report.js";
import { connections, FLOORS, softWalls } from "./research.js";

const ROOT = process.cwd();
const MAP = join(ROOT, "data", "maps", "oregon");
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "compile";
const flag = (name: string) => args.includes(`--${name}`);

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function runImport() {
  const ex = JSON.parse(readFileSync(join(MAP, "extracted.json"), "utf8")) as Extracted;
  const research = { connections: connections(ROOT), softWalls: softWalls(ROOT) };
  const mPerU = (JSON.parse(readFileSync(join(MAP, "layout.json"), "utf8")) as { units: { mPerU: number } }).units.mPerU;
  for (const floor of FLOORS) {
    const file = join(MAP, `walls_${floor}.json`);
    if (existsSync(file) && !flag("force")) {
      console.log(`walls_${floor}.json exists (curated by hand since); --force overwrites it`);
      continue;
    }
    const { part, unmatched } = importFloor(floor, ex, research, mPerU);
    write(file, readableJson(part as unknown as Record<string, unknown>));
    const spans = part.walls.reduce((a, w) => a + w.spans.length, 0);
    console.log(`walls_${floor}.json: ${part.walls.length} lines, ${spans} spans`);
    for (const r of unmatched.rows) console.log(`  research row with no span: ${r.roomA} | ${r.roomB} ${r.typeText}`);
    for (const s of unmatched.spans) console.log(`  span with no research row: ${s}`);
  }
}

function runCompile() {
  const inputs = loadInputs(ROOT);
  const compiled = compile(inputs);
  const { level, report } = compiled;
  const text = readableJson(level);
  const file = join(MAP, "level.json");
  const extracted = JSON.parse(readFileSync(join(MAP, "extracted.json"), "utf8")) as Extracted;
  const more = mapReport(ROOT, inputs, compiled, extracted);
  const inUse = Object.fromEntries(Object.entries(inputs.layout.frames).map(([f, v]) => [f, v.use]));
  write(join(ROOT, "builds", "mapgen", "report.json"), JSON.stringify({ ...report, ...more }, null, 1) + "\n");
  write(join(ROOT, "builds", "mapgen", "report.md"), reportMarkdown(compiled, more, inUse));
  // The walk's checklist, in research/oregon/walkthrough.md between its markers.
  const walkFile = join(ROOT, "research", "oregon", "walkthrough.md");
  const walkOld = readFileSync(walkFile, "utf8");
  const walkNew = withChecklist(walkOld, walkChecklist(inputs, compiled).lines);
  const c = report.counts;
  console.log(
    `oregon: ${c.solids} solids (${report.panels} panels, ${report.cellsPerLayer} cells per layer), ` +
      `${c.REINFORCEABLE ?? 0} soft walls, ${c.exteriorOpenings} exterior and ${c.interiorOpenings} interior openings, ${c.zones} zones, ${c.spawns} spawns`,
  );
  for (const [frame, options] of Object.entries(report.frames)) {
    for (const [use, landings] of Object.entries(options)) {
      const chosen = use === inputs.layout.frames[frame as FrameId].use ? " (in use)" : "";
      console.log(`  frames.${frame} ${use}${chosen}: ` + landings.map((l) => `${l.hatch} ${Math.round(l.over * 100)}% over ${l.bottom}${l.over === 1 ? `, ${l.clearM} m clear` : ""}`).join("; "));
    }
  }
  for (const line of summaryLines(more)) console.log(`  ${line}`);
  for (const w of report.warnings) console.log(`  warning: ${w}`);
  for (const e of report.errors) console.error(`  error: ${e}`);
  if (report.errors.length) process.exit(1);
  if (flag("check")) {
    const old = existsSync(file) ? readFileSync(file, "utf8") : "";
    const plans = inputs.layout.emit.filter((floor) => {
      const svg = join(ROOT, "research", "oregon", "compare", `${floor}.svg`);
      return !existsSync(svg) || readFileSync(svg, "utf8") !== planSvg(ROOT, level, floor);
    });
    const stale = [...(old !== text ? ["data/maps/oregon/level.json"] : []), ...(plans.length ? [`the plans of ${plans.join(", ")}`] : []), ...(walkOld !== walkNew ? ["the checklist in research/oregon/walkthrough.md"] : [])];
    if (stale.length) {
      console.error(`stale: ${stale.join(", ")}: run npm run mapgen and commit them`);
      process.exit(1);
    }
    console.log("level.json, the plans and the walk's checklist are up to date");
    return;
  }
  write(file, text);
  if (walkNew !== walkOld) write(walkFile, walkNew);
  console.log(`wrote data/maps/oregon/level.json (${(text.length / 1024).toFixed(0)} KB)`);
  writePlans(ROOT, level);
}

/** `--where x,y,floor[,m]`: x, y in that floor's own u ("world" for world u), or metres (X, Z) with ",m". */
function runWhere(spec: string) {
  const [xs, ys, floorArg = "1F", unit = "u"] = spec.split(",").map((t) => t.trim());
  const [x, y] = [Number(xs), Number(ys)];
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`--where ${spec}: expected x,y,floor (e.g. 175.2,182,2F)`);
  const inputs = loadInputs(ROOT);
  const { layout } = inputs;
  const fr = frames(layout);
  const k = layout.units.mPerU;
  const frame = floorArg as FrameId;
  if (!(frame in layout.frames)) throw new Error(`--where ${spec}: floor must be one of ${Object.keys(layout.frames).join(", ")}`);
  const [wx, wy] = unit === "m" ? [x / k, y / k] : fr.toWorld(frame, x, y);
  const storey = layout.storeys.find((s) => s.id === frame);
  const f1 = (v: number) => v.toFixed(2);
  console.log(`world u ${f1(wx)}, ${f1(wy)}  =  X ${f1(wx * k)}, Z ${f1(wy * k)} m${storey ? `, floor Y ${storey.floorY} m` : ""}`);
  for (const s of layout.storeys) {
    const [nx, ny] = fr.toNative(s.id, wx, wy);
    console.log(`  ${s.id} u ${f1(nx)}, ${f1(ny)}`);
  }
  const rooms = (compile(inputs).level.rooms ?? []) as { id: string; callout: string; storey: string; rects: number[][] }[];
  const here = rooms.filter((r) => (!storey || r.storey === storey.id) && r.rects.some(([x0, z0, x1, z1]) => wx * k >= x0 && wx * k <= x1 && wy * k >= z0 && wy * k <= z1));
  console.log(here.length ? here.map((r) => `in ${r.id} (${r.callout}, ${r.storey})`).join("\n") : `in no room${storey ? ` on ${storey.id}` : ""}`);
}

async function main() {
  const where = args.indexOf("--where");
  if (where >= 0) return runWhere(args[where + 1] ?? "");
  if (command === "import") runImport();
  else if (command === "compile") runCompile();
  else if (command === "refs") await downloadRefs(ROOT);
  else if (command === "compare") writePlans(ROOT, compile(loadInputs(ROOT)).level);
  else throw new Error(`unknown command "${command}" (compile, import, refs, compare)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
