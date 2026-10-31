// CLI: npm run netsim -- [--clients 10] [--seconds 30] [--one-way 50] [--jitter 10] [--seed 1]
//      npm run netsim -- --spread | --combat   (no contact | two teams fighting: downs, revives, knives)
//      npm run netsim -- --combat --walls       (the fight across the sample walls: holes synced to everyone)
//      npm run netsim -- --level oregon ...     (any of the above on Oregon: the street, or across the Kitchen's soft wall)
//      npm run netsim -- --level oregon --rappel (each bot up, along and down an outside wall of its own on a rope)
//      npm run netsim -- --hitreg [--seconds 30] [--one-way 50] [--jitter 10] [--cap 16] [--seed 1]
//      npm run netsim -- --match [--clients 10] [--seed 1] [--script elimination,time,detonate,disable,...]
//                                (a whole Custom match on Oregon, each round ending the scripted way; 10 rounds by default)
import { runHitreg, runMatchNetsim, runNetsim, type MatchNetsimOptions, type NetsimOptions, type RoundScript } from "./netsim.js";

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
if (args.includes("--hitreg")) {
  const r = await runHitreg({
    ...(opt("seconds") !== undefined && { seconds: opt("seconds") }),
    ...(opt("one-way") !== undefined && { oneWayMs: opt("one-way") }),
    ...(opt("jitter") !== undefined && { jitterMs: opt("jitter") }),
    ...(opt("cap") !== undefined && { maxRewindTicks: opt("cap") }),
    ...(opt("seed") !== undefined && { seed: opt("seed") }),
  });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.judged === r.shots && r.uncappedAgree >= 0.99 * (r.judged - r.capped) && r.headAgreeUncapped >= 0.99 * r.headSeenUncapped ? 0 : 1);
}
if (args.includes("--match")) {
  const m: Partial<MatchNetsimOptions> = {};
  for (const [flag, key] of [["clients", "clients"], ["one-way", "oneWayMs"], ["jitter", "jitterMs"], ["stall-ms", "stallMs"], ["stalls", "stallsPerSecond"], ["drift", "driftPct"], ["seed", "seed"]] as const) {
    const v = opt(flag);
    if (v !== undefined) (m as Record<string, number>)[key] = v;
  }
  if (args.includes("--script")) m.script = args[args.indexOf("--script") + 1].split(",") as RoundScript[];
  const r = await runMatchNetsim(m);
  console.table(r.rounds);
  console.table(r.perClient.map((c) => ({ ...c, downKbps: +c.downKbps.toFixed(1), upKbps: +c.upKbps.toFixed(1), rttMs: +c.rttMs.toFixed(0) })));
  console.log("score", r.score, "winner", r.winner ?? "none (a draw)", "over", r.over, "kills", r.kills, "server tick ms", r.serverTickMs);
  console.log("panels", r.panels);
  if (r.contactLate.length) console.log(`at rest in contact (expected, D-033):\n${r.contactLate.join("\n")}`);
  for (const [what, list] of [["DESYNCS", r.desyncs], ["VIEWS DIFFER", r.viewsDiffer], ["PANELS DIFFER", r.panels.differ], ["ERRORS", r.errors]] as const) if (list.length) console.log(`${what}:\n${list.join("\n")}`);
  const ok = r.over && r.rounds.length === r.options.script.length && r.rounds.every((x) => x.asScripted) && !r.desyncs.length && !r.viewsDiffer.length && !r.panels.differ.length && !r.errors.length;
  console.log(ok ? "the match went as scripted: no desyncs, every client's walls and match the server's" : "FAILED");
  process.exit(ok ? 0 : 1);
}
if (args.includes("--spread")) (o.spread = true), (o.crowd = false);
if (args.includes("--combat")) o.combat = true;
if (args.includes("--walls")) o.walls = true;
if (args.includes("--level")) o.level = args[args.indexOf("--level") + 1];
if (args.includes("--rappel")) (o.rappel = true), (o.crowd = false);
const r = await runNetsim(o);
console.table(r.perClient.map((c) => ({ ...c, downKbps: +c.downKbps.toFixed(1), upKbps: +c.upKbps.toFixed(1), rttMs: +c.rttMs.toFixed(0), interpDelayMs: +c.interpDelayMs.toFixed(0) })));
console.log("room", r.room, "server tick ms", r.serverTickMs, "after the first second", r.serverTickMsWarm, "starved remote frames", r.starvedRemoteFrames);
if (o.combat) console.log("combat", r.combat);
if (r.rappel) console.log("rappel", r.rappel);
console.log("panels", r.panels);
if (r.contactLate.length) console.log(`at rest in contact (expected, D-033):\n${r.contactLate.join("\n")}`);
console.log(r.desyncs.length ? `DESYNCS:\n${r.desyncs.join("\n")}` : "no desyncs");
if (r.panels.differ.length) console.log(`PANELS DIFFER: ${r.panels.differ.join(", ")}`);
process.exit(r.desyncs.length || r.panels.differ.length ? 1 : 0);
