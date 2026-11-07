// The long bot soak by hand (Phase 9 M10; PLAN §19): every Oregon site, a few rounds each, one report.
//   npm run soak [-- --rounds 3 --seed 5 --site SITE_DINING --dump]
// prints each site's line and each stuck bot (with --dump, what's round it: panels, gadgets, bodies), writes
// builds/soak/soak.json; exits 1 on a problem.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Room } from "@redmond/shared";
import { soak, type SoakReport } from "./soak.js";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rounds = Number(arg("rounds", "3"));
const seed = Number(arg("seed", "5"));
const only = arg("site", "");
const f2 = (v: readonly number[]) => v.map((x) => x.toFixed(2)).join(", ");
/** What's within 3 m of a stuck bot: panels (and their state), gadgets, other bodies. */
const dump = (room: Room, id: number) => {
  const c = room.bodyOf(id);
  const me = c ? room.sim.pawns.get(c.drone || c.possessedPawnId) : undefined;
  if (!me) return;
  const s = me.state;
  const near = (p: readonly number[]) => Math.hypot(p[0] - s.x, p[2] - s.z) < 3;
  const panels = room.sim.level.panels.list.filter((e) => near(e.frame.center)).map((e) => `${e.panel.spec.id} ${e.panel.kind}${e.panel.empty ? " empty" : ""}${e.panel.broken ? " broken" : ""}`);
  const gadgets = room.sim.gadgets.list.filter((g) => near(g.pos)).map((g) => `kind ${g.kind} team ${g.team} at ${f2(g.pos)}`);
  const bodies = [...room.sim.pawns.values()].filter((p) => p !== me && near([p.state.x, p.state.y, p.state.z])).map((p) => `pawn ${p.id} team ${p.team} at ${f2([p.state.x, p.state.y, p.state.z])}`);
  console.log(`    near: ${[...panels, ...gadgets, ...bodies].join("; ") || "nothing"}`);
};
const reports: SoakReport[] = [];
for (const site of only ? [only] : ["SITE_LAUNDRY", "SITE_DINING", "SITE_MEETING", "SITE_DORMS"]) {
  const r = await soak(site, rounds, seed, process.argv.includes("--dump") ? dump : undefined);
  reports.push(r);
  console.log(`${site}: ${r.rounds} rounds, ${r.ticks} ticks in ${r.seconds} s; tick p50 ${r.tickMs.p50} / p99 ${r.tickMs.p99} / max ${r.tickMs.max} ms; desyncs ${r.desyncs.panel}/${r.desyncs.gadget}; stuck ${r.stuck.length}${r.crash ? `; CRASH ${r.crash.split("\n")[0]}` : ""}`);
  for (const s of r.stuck) console.log(`  stuck: ${s.bot} (${s.op}, ${s.doing}) at ${s.at.join(", ")} going to ${s.goal?.join(", ") ?? "-"} by ${JSON.stringify(s.path)}: ${s.task}`);
}
const dir = join(process.cwd(), "builds", "soak");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "soak.json"), JSON.stringify(reports, null, 2));
const bad = reports.some((r) => r.crash || r.desyncs.panel || r.desyncs.gadget || r.desyncs.errors.length || r.stuck.length);
process.exit(bad ? 1 : 0);
