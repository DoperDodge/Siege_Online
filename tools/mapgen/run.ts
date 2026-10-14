// npm run mapgen [-- --check]        compile data/maps/oregon/layout.json to level.json (--check: fail if stale)
// npm run mapgen:import [-- --force] seed walls_<floor>.json from extracted.json (once; --force overwrites)
// npm run mapgen:refs                download the official blueprints and the r6calls map (gitignored)
// npm run mapgen:compare             our plans over the blueprints and rasters, for checking by eye
// Run from the repo root (npm does). Bundled by esbuild like netsim; no extra runner.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compile, loadInputs } from "./compile.js";
import { readableJson } from "./format.js";
import { importFloor, type Extracted } from "./import.js";
import { writePlans } from "./plans.js";
import { downloadRefs } from "./refs.js";
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
  const { level, report } = compile(loadInputs(ROOT));
  const text = readableJson(level);
  const file = join(MAP, "level.json");
  write(join(ROOT, "builds", "mapgen", "report.json"), JSON.stringify(report, null, 1) + "\n");
  const c = report.counts;
  console.log(
    `oregon: ${c.solids} solids (${report.panels} panels, ${report.cellsPerLayer} cells per layer), ` +
      `${c.REINFORCEABLE ?? 0} soft walls, ${c.exteriorOpenings} exterior and ${c.interiorOpenings} interior openings, ${c.zones} zones, ${c.spawns} spawns`,
  );
  for (const w of report.warnings) console.log(`  warning: ${w}`);
  for (const e of report.errors) console.error(`  error: ${e}`);
  if (report.errors.length) process.exit(1);
  if (flag("check")) {
    const old = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (old !== text) {
      console.error("data/maps/oregon/level.json is stale: run npm run mapgen and commit it");
      process.exit(1);
    }
    console.log("level.json is up to date");
    return;
  }
  write(file, text);
  console.log(`wrote data/maps/oregon/level.json (${(text.length / 1024).toFixed(0)} KB)`);
}

async function main() {
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
