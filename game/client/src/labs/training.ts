// Training feedback in the browser (Phase 9 M9, bots/DESIGN.md §11; PLAN §15.5): your round report, drawn on the
// round's end screen, and the stats kept from every report in this browser (localStorage), per drill and per operator,
// shown on the Play page so you can see yourself improve.
import type { GameData, RoundReport } from "@redmond/shared";
import { escapeHtml } from "../ui/dom.js";

/** Where the stats live, and how many of your last rounds are kept for the "lately" strips. */
const STATS_KEY = "redmond.training";
const RECENT_KEPT = 200;

/** Totals for a drill or an operator. */
export interface TrainingTotals {
  rounds: number;
  wins: number;
  kills: number;
  deaths: number;
  dealt: number;
  taken: number;
  /** Seconds the rounds lasted, all told. */
  seconds: number;
  /** A drill's best numbers: the duel's quickest kill, the fastest clear, the most defenders found (of how many). */
  best: Record<string, number>;
}

export interface TrainingStats {
  drills: Record<string, TrainingTotals>;
  operators: Record<string, TrainingTotals>;
  /** Your last rounds, newest last: when, which drill (or format), operator, won. */
  recent: { at: number; format: string; operator: string; won: boolean }[];
}

const blank = (): TrainingTotals => ({ rounds: 0, wins: 0, kills: 0, deaths: 0, dealt: 0, taken: 0, seconds: 0, best: {} });

export function loadStats(): TrainingStats {
  try {
    const v = JSON.parse(localStorage.getItem(STATS_KEY) ?? "null") as TrainingStats | null;
    if (v && typeof v === "object" && v.drills && v.operators && Array.isArray(v.recent)) return v;
  } catch {
    // blocked or broken: start again
  }
  return { drills: {}, operators: {}, recent: [] };
}

/** A round's report added to the stats (and kept). */
export function saveReport(r: RoundReport, now = Date.now()): TrainingStats {
  const stats = loadStats();
  const add = (t: TrainingTotals) => {
    t.rounds++;
    if (r.won) t.wins++;
    t.kills += r.kills;
    if (r.death) t.deaths++;
    t.dealt += r.dealt.reduce((n, x) => n + x.hp, 0);
    t.taken += r.taken.reduce((n, x) => n + x.hp, 0);
    t.seconds += r.seconds;
    // Bests: the lower the better for times, the higher for what's found.
    const better = (k: string, v: number, lower: boolean) => {
      if (v < 0) return;
      const old = t.best[k];
      if (old === undefined || (lower ? v < old : v > old)) t.best[k] = v;
    };
    if (r.score.ttk !== undefined) better("ttk", r.score.ttk, true);
    if (r.score.cleared !== undefined) better("cleared", r.score.cleared, true);
    if (r.score.found !== undefined) better("found", r.score.found, false);
    if (r.score.seconds !== undefined && r.won) better("seconds", r.score.seconds, true);
  };
  add((stats.drills[r.format] ??= blank()));
  if (r.operator) add((stats.operators[r.operator] ??= blank()));
  stats.recent.push({ at: now, format: r.format, operator: r.operator, won: r.won });
  if (stats.recent.length > RECENT_KEPT) stats.recent.splice(0, stats.recent.length - RECENT_KEPT);
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // not kept; fine
  }
  return stats;
}

/** Seconds as m:ss (or s.s under a minute). */
const time = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/** What a report says, for the round's end screen: your death and who saw you first, damage, the objective, utility, the drill's numbers. */
export function reportHtml(r: RoundReport, data: GameData): string {
  const level = data.levels.get("oregon");
  const room = (id: string | null) => (id ? (level?.rooms.find((x) => x.id === id)?.callout ?? id) : "outside");
  const weapon = (id: string) => data.weapons.get(id)?.name ?? data.gadgets.get(id)?.name ?? id;
  const gadget = (id: string) => data.gadgets.get(id)?.name ?? id;
  const rows: string[] = [];
  if (r.death) rows.push(`<div><b>Died</b> ${time(r.death.t)} in · ${escapeHtml(room(r.death.room))} · ${r.death.by ? `to ${escapeHtml(r.death.by)}` : "on your own"}${r.death.weapon ? ` (${escapeHtml(weapon(r.death.weapon))}${r.death.headshot ? ", headshot" : ""})` : ""}</div>`);
  else rows.push(`<div><b>Survived</b> the round (${time(r.seconds)})</div>`);
  if (r.firstSeen) rows.push(`<div><b>First seen</b> ${time(r.firstSeen.t)} in by ${escapeHtml(r.firstSeen.by)}, from ${escapeHtml(room(r.firstSeen.room))}, ${r.firstSeen.distM.toFixed(0)} m off</div>`);
  const dealt = r.dealt.reduce((n, x) => n + x.hp, 0);
  const taken = r.taken.reduce((n, x) => n + x.hp, 0);
  rows.push(`<div><b>Damage</b> dealt ${dealt}${r.dealt.length ? ` (${r.dealt.map((x) => `${escapeHtml(x.to)} ${x.hp}`).join(", ")})` : ""} · taken ${taken}${r.taken.length ? ` (${r.taken.map((x) => `${escapeHtml(x.from || "the world")} ${x.hp}`).join(", ")})` : ""} · kills ${r.kills}</div>`);
  const obj = [r.plantS !== null ? `planted at ${time(r.plantS)}` : "", r.disableS !== null ? `disabled ${time(r.disableS)} after the plant` : ""].filter(Boolean);
  if (obj.length) rows.push(`<div><b>Defuser</b> ${obj.join(" · ")}</div>`);
  if (r.utility.length) rows.push(`<div><b>Utility</b> ${r.utility.map((u) => `${escapeHtml(gadget(u.gadget))}${u.n > 1 ? ` ×${u.n}` : ""}`).join(", ")}</div>`);
  const s = r.score;
  const drill: string[] = [];
  if (s.ttk !== undefined) drill.push(s.ttk >= 0 ? `time to kill ${time(s.ttk)}` : "no kill");
  if (s.found !== undefined) drill.push(`defenders found ${s.found} of ${s.of ?? "?"}`);
  if (s.cleared !== undefined) drill.push(s.cleared >= 0 ? `cleared in ${time(s.cleared)}` : "not cleared");
  if (s.seconds !== undefined && r.drill === "retake") drill.push(`the retake took ${time(s.seconds)}`);
  if (drill.length) rows.push(`<div><b>Drill</b> ${drill.join(" · ")}</div>`);
  return `<div class="report"><div class="report-title">YOUR ROUND</div>${rows.join("")}</div>`;
}

/** Your stats, for the Play page: a row per drill (and Bot Training's own) and per operator, your last rounds as W/L. */
export function statsHtml(stats: TrainingStats, data: GameData): string {
  const fmt = (id: string) => {
    const m = data.modes.get(id);
    return (m && "match" in m && m.match ? m.match.name : id).replace(/^Drill: /, "");
  };
  const op = (id: string) => data.operators.get(id)?.name ?? id;
  const rowsOf = (rec: Record<string, TrainingTotals>, name: (id: string) => string, kind: "drill" | "op") =>
    Object.entries(rec)
      .sort((a, b) => b[1].rounds - a[1].rounds)
      .map(([id, t]) => {
        const lately = stats.recent
          .filter((x) => (kind === "drill" ? x.format === id : x.operator === id))
          .slice(-10)
          .map((x) => `<span class="${x.won ? "w" : "l"}">${x.won ? "W" : "L"}</span>`)
          .join("");
        const best = [t.best.ttk !== undefined ? `kill ${time(t.best.ttk)}` : "", t.best.cleared !== undefined ? `clear ${time(t.best.cleared)}` : "", t.best.found !== undefined ? `found ${t.best.found}` : "", t.best.seconds !== undefined ? `${time(t.best.seconds)}` : ""].filter(Boolean).join(" · ");
        return `<tr><td>${escapeHtml(name(id))}</td><td>${t.rounds}</td><td>${Math.round((100 * t.wins) / Math.max(1, t.rounds))}%</td><td>${t.kills}/${t.deaths}</td><td>${Math.round(t.dealt / Math.max(1, t.rounds))}</td><td>${best || "—"}</td><td class="lately">${lately}</td></tr>`;
      })
      .join("");
  const head = (what: string) => `<tr><th>${what}</th><th>Rounds</th><th>Won</th><th>K/D</th><th>Dmg/round</th><th>Best</th><th>Last 10</th></tr>`;
  const drills = rowsOf(stats.drills, fmt, "drill");
  const ops = rowsOf(stats.operators, op, "op");
  if (!drills && !ops) return `<p class="note">Play Bot Training or a drill: your rounds are counted here (in this browser).</p>`;
  return `<table class="training-stats">${head("Drill")}${drills}</table><table class="training-stats">${head("Operator")}${ops}</table>`;
}
