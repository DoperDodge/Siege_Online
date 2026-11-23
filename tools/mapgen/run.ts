// npm run mapgen [-- --check] [--map <id>]  compile data/maps/<id>/layout.json (Millrace by default) to level.json
//                                    and its plans (--check: fail if level.json is stale)
// npm run mapgen -- --where x,y,floor  a position in a floor's own u (or world u, or metres with ",m") in every
//                                    frame, and the room there (DESIGN amendment 17)
// Run from the repo root (npm does). Bundled by esbuild like netsim; no extra runner.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compile, loadInputs } from "./compile.js";
import { frames, type FrameId } from "./frames.js";
import { readableJson } from "./format.js";
import { writePlans } from "./plans.js";
import { mapReport, reportMarkdown, summaryLines } from "./report.js";

const ROOT = process.cwd();
const args = process.argv.slice(2);
/** The map compiled (`--map <id>`; Millrace by default): its authoring files are data/maps/<id>/. */
const MAP_ID = args.includes("--map") ? args[args.indexOf("--map") + 1] : "millrace";
const MAP = join(ROOT, "data", "maps", MAP_ID);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "compile";
const flag = (name: string) => args.includes(`--${name}`);

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function runCompile() {
  const inputs = loadInputs(ROOT, MAP_ID);
  const compiled = compile(inputs);
  const { level, report } = compiled;
  const text = readableJson(level);
  const file = join(MAP, "level.json");
  const more = mapReport(ROOT, inputs, compiled);
  const inUse = Object.fromEntries(Object.entries(inputs.layout.frames).map(([f, v]) => [f, v.use]));
  write(join(ROOT, "builds", "mapgen", "report.json"), JSON.stringify({ ...report, ...more }, null, 1) + "\n");
  write(join(ROOT, "builds", "mapgen", "report.md"), reportMarkdown(compiled, more, inUse, inputs.layout.name));
  const c = report.counts;
  console.log(
    `${MAP_ID}: ${c.solids} solids (${report.panels} panels, ${report.cellsPerLayer} cells per layer), ` +
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
    if (old !== text) {
      console.error(`stale: data/maps/${MAP_ID}/level.json: run npm run mapgen -- --map ${MAP_ID} and commit it`);
      process.exit(1);
    }
    console.log(`data/maps/${MAP_ID}/level.json is up to date`);
    return;
  }
  write(file, text);
  console.log(`wrote data/maps/${MAP_ID}/level.json (${(text.length / 1024).toFixed(0)} KB)`);
  writePlans(ROOT, level, MAP_ID);
}

/** `--where x,y,floor[,m]`: x, y in that floor's own u ("world" for world u), or metres (X, Z) with ",m". */
function runWhere(spec: string) {
  const [xs, ys, floorArg = "1F", unit = "u"] = spec.split(",").map((t) => t.trim());
  const [x, y] = [Number(xs), Number(ys)];
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`--where ${spec}: expected x,y,floor (e.g. 175.2,182,2F)`);
  const inputs = loadInputs(ROOT, MAP_ID);
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
  if (command === "compile") runCompile();
  else throw new Error(`unknown command "${command}" (compile; --where x,y,floor)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
