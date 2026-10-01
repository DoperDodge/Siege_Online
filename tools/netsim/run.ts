// CLI: npm run netsim -- [--clients 10] [--seconds 30] [--one-way 50] [--jitter 10] [--seed 1]
import { runNetsim, type NetsimOptions } from "./netsim.js";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};
const o: Partial<NetsimOptions> = {};
for (const [flag, key] of [["clients", "clients"], ["seconds", "seconds"], ["one-way", "oneWayMs"], ["jitter", "jitterMs"], ["stall-ms", "stallMs"], ["stalls", "stallsPerSecond"], ["drift", "driftPct"], ["seed", "seed"]] as const) {
  const v = opt(flag);
  if (v !== undefined) (o as Record<string, number>)[key] = v;
}
if (args.includes("--spread")) (o.spread = true), (o.crowd = false);
const r = await runNetsim(o);
console.table(r.perClient.map((c) => ({ ...c, downKbps: +c.downKbps.toFixed(1), upKbps: +c.upKbps.toFixed(1), rttMs: +c.rttMs.toFixed(0), interpDelayMs: +c.interpDelayMs.toFixed(0) })));
console.log("room", r.room, "server tick ms", r.serverTickMs, "starved remote frames", r.starvedRemoteFrames);
console.log(r.desyncs.length ? `DESYNCS:\n${r.desyncs.join("\n")}` : "no desyncs");
process.exit(r.desyncs.length ? 1 : 0);
