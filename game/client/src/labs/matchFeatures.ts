// A match's screens and HUD (Phase 6 M4, match/DESIGN.md §11), added to the game client (labs/common/lab.ts with
// `match` on): the lobby, the ban vote, the planning screen (operator, loadout, site vote or spawn, the defuser), the
// HUD (score, round, phase and its timer, the site, the defuser), the Tab scoreboard, the round banner and the match
// summary; the camera while you have no body; the defuser and run-out markers. All of it reads the match as the
// server sends it to this player (MatchState, net/matchWire.ts) and answers with LobbyAction, MatchAction and
// PickLoadout: the server decides, and says why when it refuses (a flash).
import * as THREE from "three";
import {
  ATTACK,
  DEFENSE,
  defaultLoadoutPick,
  encodeLobbyAction,
  encodeMatchAction,
  encodePickLoadout,
  isPickable,
  NO_END,
  PawnMode,
  Phase,
  TEAM_NAMES,
  TICK_HZ,
  WinReason,
  type FormatMode,
  type LoadoutPick,
  type LobbyAction,
  type MatchAction,
  type MatchView,
  type MatchViewPlayer,
  type RoundRecord,
} from "@redmond/shared";
import { keyLabel, loadSettings } from "../input/settings.js";
import { escapeHtml } from "../ui/dom.js";
import type { LabApi, SpectateView } from "./common/lab.js";

const PHASE_LABEL: Record<Phase, string> = {
  [Phase.Lobby]: "LOBBY",
  [Phase.Ban]: "BAN",
  [Phase.Planning]: "PLANNING",
  [Phase.Prep]: "PREP",
  [Phase.Action]: "ACTION",
  [Phase.PostPlant]: "DEFUSER PLANTED",
  [Phase.RoundEnd]: "ROUND OVER",
  [Phase.MatchEnd]: "MATCH OVER",
};

/** How a round was won, as the banner and the summary say it (research §4's icons, drawn our way: words). */
export function reasonText(r: Pick<RoundRecord, "reason" | "winner" | "attackers">): string {
  switch (r.reason) {
    case WinReason.Elimination:
      return r.winner === r.attackers ? "Defenders eliminated" : "Attackers eliminated";
    case WinReason.Time:
      return "Time ran out";
    case WinReason.Detonated:
      return "The defuser went off";
    case WinReason.Disabled:
      return "Defuser disabled";
    case WinReason.Deactivated:
      return "Defuser destroyed";
    default:
      return "";
  }
}

/** Seconds as m:ss. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** "A_JUNKYARD" → "A Junkyard". */
export const groupName = (g: string) => g.replace(/_/g, " ").replace(/\B([A-Z]+)/g, (w) => w.toLowerCase());

/** A format's rules in one line (the lobby). */
export function rulesSummary(r: FormatMode): string {
  const m = r.match;
  const s = m.seconds;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [
    m.rounds === null ? "rounds without end" : `${m.rounds} rounds, first to ${m.rounds / 2 + 1}`,
    `sides swap every ${plural(m.swapEvery, "round")}`,
    m.overtime && m.rounds !== null ? `overtime at ${m.rounds / 2}–${m.rounds / 2}: ${m.overtime.rounds === 1 ? "one round" : `up to ${m.overtime.rounds} rounds`}` : "",
    m.bans ? `${plural(m.bans.maxPerSide, "ban")} per side` : "no bans",
    m.site === "vote" ? "defenders vote for the site" : "random site",
    `pick ${s.pick} s, prep ${s.prep} s, action ${s.action} s`,
    `plant ${s.plant} s, fuse ${s.fuse} s, disable ${s.disable} s`,
    r.friendlyFire.actionPhase ? "friendly fire on" : "friendly fire off",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The fields a Custom host edits here (the rest of the rules stay as they are; match/settings.ts checks them). */
const RULE_FIELDS: { key: string; label: string; min: number; max: number; step: number }[] = [
  { key: "rounds", label: "Rounds", min: 2, max: 24, step: 2 },
  { key: "swapEvery", label: "Swap every", min: 1, max: 12, step: 1 },
  { key: "seconds.pick", label: "Pick (s)", min: 5, max: 120, step: 1 },
  { key: "seconds.prep", label: "Prep (s)", min: 5, max: 180, step: 1 },
  { key: "seconds.action", label: "Action (s)", min: 30, max: 600, step: 1 },
  { key: "seconds.plant", label: "Plant (s)", min: 1, max: 30, step: 1 },
  { key: "seconds.fuse", label: "Fuse (s)", min: 10, max: 120, step: 1 },
  { key: "seconds.disable", label: "Disable (s)", min: 1, max: 30, step: 1 },
  { key: "seconds.roundEnd", label: "Round end (s)", min: 2, max: 20, step: 1 },
];

export function matchFeatures(lab: LabApi): void {
  const net = lab.net!;
  const session = net.session;
  const data = lab.data;
  const level = lab.sim.level.def;
  const keys = loadSettings().keys;
  const send = (bytes: Uint8Array) => net.send(bytes);
  const lobby = (a: LobbyAction) => send(encodeLobbyAction(a));
  const act = (a: MatchAction) => send(encodeMatchAction(a));

  const el = (cls: string) => {
    const d = document.createElement("div");
    d.className = cls;
    lab.app.append(d);
    return d;
  };
  const top = el("hud match-top hidden");
  const info = el("hud match-info hidden");
  const banner = el("match-banner hidden");
  const board = el("panel scoreboard hidden");
  const screen = el("panel match-screen hidden");

  // ---------------------------------------------------------------- what the server sent

  let rulesJson = "";
  let rules: FormatMode | null = null;
  /** The rules (the format with the host's changes) as last sent. */
  const currentRules = (): FormatMode | null => {
    const j = session.matchRules;
    if (j && j !== rulesJson) {
      rulesJson = j;
      try {
        rules = JSON.parse(j) as FormatMode;
      } catch {
        rules = null;
      }
    }
    return rules;
  };
  const formatName = (v: MatchView) => currentRules()?.match.name ?? data.modes.get(v.format)?.match?.name ?? v.format;
  const meOf = (v: MatchView) => v.players.find((p) => p.id === v.you) ?? null;
  const siteName = (id: string | null) => (id ? (level.sites.find((s) => s.id === id)?.name ?? id) : "");
  const opName = (id: string | null) => (id ? (data.operators.get(id)?.name ?? id) : "—");
  const sideOps = (side: 0 | 1) => [...data.operators.values()].filter((o) => o.side === (side === ATTACK ? "attacker" : "defender"));
  const spawnGroups = [...new Set(level.spawns.filter((s) => s.side === "attack" && s.group).map((s) => s.group!))];
  /** Seconds left in this phase (null: it waits for the host). */
  const left = (v: MatchView) => (v.phaseEnd === NO_END ? null : Math.max(0, (v.phaseEnd - session.serverTick()) / TICK_HZ));

  /** This round's loadout, kept here (the server only says which operator you have). */
  let myPick: LoadoutPick | null = null;
  const pickOperator = (id: string) => {
    myPick = defaultLoadoutPick(data, id);
    send(encodePickLoadout(myPick));
  };

  // ---------------------------------------------------------------- the screens (lobby, ban, planning, summary)

  /** Each part of the screen is redrawn only when its HTML changes, so a field being edited isn't wiped by a vote. */
  function setParts(parts: [string, string][]) {
    const keysNow = parts.map(([k]) => k).join();
    if (screen.dataset.parts !== keysNow) {
      screen.dataset.parts = keysNow;
      screen.innerHTML = parts.map(([k]) => `<div data-part="${k}"></div>`).join("");
    }
    for (const [k, html] of parts) {
      const part = screen.querySelector<HTMLElement>(`[data-part="${k}"]`)!;
      if (part.dataset.html !== html) {
        part.dataset.html = html;
        part.innerHTML = html;
      }
    }
  }

  function playerRow(v: MatchView, p: MatchViewPlayer, host: boolean): string {
    const t = p.team;
    const tools =
      host && p.id !== v.you
        ? `<button data-act="move" data-member="${p.id}" data-team="${1 - t}" title="Move to ${TEAM_NAMES[1 - t]}">⇄</button><button data-act="kick" data-member="${p.id}" title="Kick">✕</button>`
        : "";
    return `<li class="${p.id === v.you ? "you" : ""}${p.connected ? "" : " gone"}"><span class="ready ${p.ready ? "on" : ""}">${p.ready ? "✓" : "·"}</span><span class="name">${escapeHtml(p.name)}${p.id === v.host ? ' <span class="host" title="Host">★</span>' : ""}${p.connected ? "" : " (left)"}</span>${tools}</li>`;
  }

  function lobbyParts(v: MatchView): [string, string][] {
    const me = meOf(v);
    const host = v.host === v.you;
    const r = currentRules();
    const max = r?.match.teamSize.max ?? 5;
    const team = (t: 0 | 1) => {
      const ps = v.players.filter((p) => p.team === t);
      return `<div class="team team-${t}"><h3>${TEAM_NAMES[t]} <span class="count">${ps.length}/${max}</span></h3><ul>${ps.map((p) => playerRow(v, p, host)).join("") || '<li class="empty">nobody yet</li>'}</ul>
        ${me && me.team !== t ? `<button data-act="team" data-team="${t}">Join ${TEAM_NAMES[t]}</button>` : ""}</div>`;
    };
    const hostName = v.players.find((p) => p.id === v.host)?.name ?? "the host";
    const formats = [...data.modes.values()].filter((m) => m.match);
    const toggles = r ? r.match.host : [];
    const can = (t: "bans" | "reinforcementScaling") => host && (toggles === "all" || toggles.includes(t));
    const settings = r
      ? `<h3>Format</h3>
        ${host ? `<select data-act="format">${formats.map((m) => `<option value="${m.id}" ${m.id === v.format ? "selected" : ""}>${escapeHtml(m.match!.name)}</option>`).join("")}</select>` : `<p>${escapeHtml(formatName(v))}</p>`}
        <p class="note">${escapeHtml(rulesSummary(r))}</p>
        <div class="row">
        ${can("bans") && r.match.bans ? `<label>Bans per side <select data-act="bans">${[0, 1, 2].map((n) => `<option value="${n}" ${n === r.match.bans!.maxPerSide ? "selected" : ""}>${n}</option>`).join("")}</select></label>` : ""}
        ${can("reinforcementScaling") ? `<label>Reinforcements <select data-act="scaling">${(["scaled", "full", ...(toggles === "all" ? ["infinite"] : [])] as const).map((s) => `<option value="${s}" ${s === r.match.reinforcementScaling ? "selected" : ""}>${s === "scaled" ? "scaled to the team" : s === "full" ? `${r.reinforcements} each round` : "endless"}</option>`).join("")}</select></label>` : ""}
        </div>
        ${host && toggles === "all" && r.match.rounds !== null ? `<div class="rules">${RULE_FIELDS.map((f) => `<label>${f.label} <input type="number" data-act="rule" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${ruleValue(r, f.key)}"></label>`).join("")}</div>` : ""}`
      : "";
    return [
      [
        "head",
        `<h2>${escapeHtml(formatName(v))} · Room ${escapeHtml(session.roomCode)}</h2>
        <div class="row"><button data-act="invite">Copy invite link</button>${host ? `<label class="check"><input type="checkbox" data-act="private" ${v.private ? "checked" : ""}> Private (not in the room list)</label>` : v.private ? '<span class="note">Private room</span>' : ""}</div>`,
      ],
      ["teams", `<div class="teams">${team(0)}${team(1)}</div>`],
      [
        "controls",
        `<div class="row">${me ? `<button data-act="ready" class="${me.ready ? "on" : ""}">${me.ready ? "Ready ✓" : "Ready up"}</button>` : ""}
        ${host ? `<button data-act="swap">Swap teams</button><button class="primary" data-act="start">Start the match</button>` : `<span class="note">${escapeHtml(hostName)} (the host) starts the match once everyone is ready.</span>`}</div>`,
      ],
      ["settings", settings],
      ["foot", `<p class="note">Teams of ${r?.match.teamSize.min ?? 1}–${max}, uneven allowed. <a href="/play.html">Leave</a></p>`],
    ];
  }

  const ruleValue = (r: FormatMode, key: string): number => {
    const [a, b] = key.split(".");
    const m = r.match as unknown as Record<string, unknown>;
    return Number(b ? (m[a] as Record<string, unknown>)[b] : m[a]);
  };

  function banParts(v: MatchView): [string, string][] {
    const me = meOf(v);
    const mySide = me?.side ?? null;
    if (!me || mySide === null) return [["head", `<h2>Round ${v.round} · Ban · <span class="timer"></span></h2><p class="note">Your team sits this round out.</p>`]];
    const target = (1 - mySide) as 0 | 1;
    const banned = new Set(v.bans[target]);
    const mates = v.players.filter((p) => p.team === me.team);
    const ops = sideOps(target)
      .map((o) => {
        const voters = mates.filter((p) => p.banVote === o.id).map((p) => escapeHtml(p.name));
        const off = banned.has(o.id);
        return `<button data-act="ban" data-op="${o.id}" class="op ${me.banVote === o.id ? "mine" : ""}" ${off ? "disabled" : ""}>${escapeHtml(o.name)}${off ? " <small>banned</small>" : voters.length ? ` <small>${voters.join(", ")}</small>` : ""}</button>`;
      })
      .join("");
    return [
      [
        "head",
        `<h2>Round ${v.round} · Ban · <span class="timer"></span></h2>
        <p>${TEAM_NAMES[me.team]} ${mySide === ATTACK ? "attacks" : "defends"} this round: vote to ban one of the ${target === ATTACK ? "attackers" : "defenders"}. Your team bans the operator with the most votes (no votes, no ban); click your vote again to take it back.</p>`,
      ],
      ["ops", `<div class="op-grid">${ops}</div>`],
      ["bans", bansLine(v)],
    ];
  }

  const bansLine = (v: MatchView) =>
    v.bans[0].length || v.bans[1].length
      ? `<p class="note">Banned: ${[ATTACK, DEFENSE]
          .map((s) => (v.bans[s].length ? `${s === ATTACK ? "attackers" : "defenders"} ${v.bans[s].map(opName).join(", ")}` : ""))
          .filter(Boolean)
          .join(" · ")}</p>`
      : "";

  function planningParts(v: MatchView): [string, string][] {
    const me = meOf(v);
    const side = me?.side ?? null;
    const phase = v.phase === Phase.Prep ? "Prep" : "Planning";
    const head = `<h2>Round ${v.round}${v.overtime ? " (overtime)" : ""} · ${phase} · <span class="timer"></span></h2>`;
    if (!me || side === null) return [["head", `${head}<p class="note">Your team sits this round out.</p>`]];
    const mates = v.players.filter((p) => p.team === me.team);
    const banned = new Set(v.bans[side]);
    // A pick of mine the server dropped (taken, banned) is forgotten; a new operator starts from its default loadout.
    if (myPick && myPick.operator !== me.operator) myPick = me.operator ? defaultLoadoutPick(data, me.operator) : null;
    const ops = sideOps(side)
      .map((o) => {
        const holder = mates.find((p) => p.operator === o.id && p.id !== me.id);
        const off = banned.has(o.id) || holder !== undefined;
        return `<button data-act="op" data-op="${o.id}" class="op ${me.operator === o.id ? "mine" : ""}" ${off ? "disabled" : ""}>${escapeHtml(o.name)}${banned.has(o.id) ? " <small>banned</small>" : holder ? ` <small>${escapeHtml(holder.name)}</small>` : ""}</button>`;
      })
      .join("");
    const parts: [string, string][] = [
      [
        "head",
        `${head}<p>${TEAM_NAMES[v.attackers]} attacks, ${TEAM_NAMES[1 - v.attackers]} defends: you ${side === ATTACK ? "attack" : "defend"}.${
          v.phase === Phase.Prep ? " The defenders are setting up. You can still change your operator, loadout and spawn; click the view to look around from your spawn (Esc brings this back)." : ""
        }</p>${bansLine(v)}`,
      ],
      ["ops", `<h3>Operator</h3><div class="op-grid">${ops}</div>${me.operator ? "" : '<p class="note">Pick one, or you get one when the timer runs out.</p>'}`],
    ];
    if (me.operator) {
      const op = data.operators.get(me.operator)!;
      const pick = myPick ?? defaultLoadoutPick(data, me.operator);
      const sel = (slot: "primary" | "secondary", ids: string[]) =>
        `<label>${slot === "primary" ? "Primary" : "Secondary"} <select data-act="weapon" data-slot="${slot}">${ids
          .filter((id) => isPickable(data, id))
          .map((id) => `<option value="${id}" ${id === pick[slot].weapon ? "selected" : ""}>${escapeHtml(data.weapons.get(id)?.name ?? id)}</option>`)
          .join("")}</select></label>`;
      parts.push(["loadout", `<h3>Loadout</h3><div class="row">${sel("primary", op.loadout.primaries)}${sel("secondary", op.loadout.secondaries)}</div>`]);
    }
    if (side === DEFENSE) {
      const vote = currentRules()?.match.site === "vote" && v.phase === Phase.Planning;
      parts.push([
        "site",
        vote
          ? `<h3>Site vote</h3><div class="op-grid">${level.sites
              .map((s) => {
                const voters = mates.filter((p) => p.siteVote === s.id).map((p) => escapeHtml(p.name));
                return `<button data-act="site" data-site="${s.id}" class="op ${me.siteVote === s.id ? "mine" : ""}">${escapeHtml(s.name)}${voters.length ? ` <small>${voters.join(", ")}</small>` : ""}</button>`;
              })
              .join("")}</div><p class="note">The most-voted site is defended (a tie is drawn).</p>`
          : `<h3>Site</h3><p>${v.site ? escapeHtml(siteName(v.site)) : "Drawn when planning ends."}</p>`,
      ]);
    } else {
      parts.push([
        "spawn",
        `<h3>Spawn</h3><div class="op-grid">${spawnGroups
          .map((g) => {
            const who = mates.filter((p) => p.spawn === g).map((p) => escapeHtml(p.name));
            return `<button data-act="spawn" data-group="${g}" class="op ${me.spawn === g ? "mine" : ""}">${escapeHtml(groupName(g))}${who.length ? ` <small>${who.join(", ")}</small>` : ""}</button>`;
          })
          .join("")}</div>`,
      ]);
      const carrier = v.players.find((p) => p.id === v.carrier);
      parts.push([
        "defuser",
        `<h3>Defuser</h3><div class="row"><span>${carrier ? `${escapeHtml(carrier.name)}${carrier.id === me.id ? " (you)" : ""} carries it.` : "Nobody has taken it: the first attacker gets it."}</span>
        ${v.phase === Phase.Planning || v.phase === Phase.Prep ? (v.carrier === me.id ? `<button data-act="defuser" data-take="0">Give it back</button>` : `<button data-act="defuser" data-take="1">Take it</button>`) : ""}</div>`,
      ]);
    }
    parts.push(["team", `<h3>${TEAM_NAMES[me.team]}</h3><ul class="mates">${mates.map((p) => `<li class="${p.id === me.id ? "you" : ""}">${escapeHtml(p.name)} — ${p.operator ? escapeHtml(opName(p.operator)) : "no operator yet"}</li>`).join("")}</ul>`]);
    return parts;
  }

  function summaryParts(v: MatchView): [string, string][] {
    const host = v.host === v.you;
    const title = v.winner === null ? "Draw" : `${TEAM_NAMES[v.winner]} wins`;
    const rows = v.history
      .map((h) => `<tr><td>${h.round}</td><td>${TEAM_NAMES[h.attackers]}</td><td class="team-${h.winner}">${TEAM_NAMES[h.winner]}</td><td>${reasonText(h)}</td><td>${escapeHtml(siteName(h.site))}</td></tr>`)
      .join("");
    const players = [...v.players]
      .sort((a, b) => a.team - b.team || b.kills - a.kills)
      .map((p) => `<tr class="${p.id === v.you ? "you" : ""}"><td class="team-${p.team}">${TEAM_NAMES[p.team]}</td><td>${escapeHtml(p.name)}${p.id === v.mvp ? ' <span class="mvp" title="Most valuable player">MVP</span>' : ""}</td><td>${p.kills}</td><td>${p.assists}</td><td>${p.deaths}</td></tr>`)
      .join("");
    return [
      ["head", `<h2>${title} ${v.score[0]}–${v.score[1]}${v.forfeit ? " (forfeit)" : ""}</h2>`],
      ["rounds", `<h3>Rounds</h3><table class="rounds"><tr><th>Round</th><th>Attackers</th><th>Won by</th><th>How</th><th>Site</th></tr>${rows}</table>`],
      ["players", `<h3>Players</h3><table class="players"><tr><th>Team</th><th>Player</th><th>K</th><th>A</th><th>D</th></tr>${players}</table>`],
      ["foot", `<div class="row">${host ? '<button class="primary" data-act="backToLobby">Back to the lobby</button>' : '<span class="note">The host can take everyone back to the lobby.</span>'}<a href="/play.html">Leave</a></div>`],
    ];
  }

  screen.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (!b || b instanceof HTMLSelectElement || b instanceof HTMLInputElement || b.hasAttribute("disabled")) return;
    const v = session.match;
    const me = v && meOf(v);
    const d = b.dataset;
    switch (d.act) {
      case "team":
        return lobby({ kind: "team", team: Number(d.team) as 0 | 1 });
      case "ready":
        return lobby({ kind: "ready", ready: !me?.ready });
      case "move":
        return lobby({ kind: "move", member: Number(d.member), team: Number(d.team) as 0 | 1 });
      case "kick":
        return lobby({ kind: "kick", member: Number(d.member) });
      case "swap":
        return lobby({ kind: "swapTeams" });
      case "start":
        return lobby({ kind: "start" });
      case "backToLobby":
        return lobby({ kind: "backToLobby" });
      case "invite":
        void navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${session.roomCode}`).then(() => (b.textContent = "Copied!"));
        return;
      case "ban":
        return act({ kind: "banVote", operator: me?.banVote === d.op ? null : d.op! });
      case "op":
        return pickOperator(d.op!);
      case "site":
        return act({ kind: "siteVote", site: me?.siteVote === d.site ? null : d.site! });
      case "spawn":
        return act({ kind: "spawn", group: d.group! });
      case "defuser":
        return act({ kind: "defuser", take: d.take === "1" });
    }
  });
  screen.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const d = t.dataset;
    const r = currentRules();
    if (d.act === "format") lobby({ kind: "format", format: t.value });
    else if (d.act === "private") lobby({ kind: "private", private: (t as HTMLInputElement).checked });
    else if (d.act === "bans") lobby({ kind: "change", change: { kind: "bans", maxPerSide: Number(t.value) } });
    else if (d.act === "scaling") lobby({ kind: "change", change: { kind: "reinforcementScaling", value: t.value as "scaled" | "full" | "infinite" } });
    else if (d.act === "rule" && r) {
      const match = structuredClone(r.match) as unknown as Record<string, unknown>;
      const [a, b] = d.key!.split(".");
      if (b) (match[a] as Record<string, unknown>)[b] = Number(t.value);
      else match[a] = Number(t.value);
      lobby({ kind: "change", change: { kind: "rules", rules: { match } } });
    } else if (d.act === "weapon") {
      const v = session.match;
      const me = v && meOf(v);
      if (!me?.operator) return;
      const pick = structuredClone(myPick ?? defaultLoadoutPick(data, me.operator));
      const slot = d.slot as "primary" | "secondary";
      pick[slot] = { weapon: t.value, sight: null, barrel: null, grip: null, underbarrel: null };
      myPick = pick;
      send(encodePickLoadout(pick));
    }
  });

  // ---------------------------------------------------------------- the HUD

  function topHtml(v: MatchView): string {
    const side = (t: 0 | 1) => (v.round > 0 ? (v.attackers === t ? "ATK" : "DEF") : "");
    const score = (t: 0 | 1) => `<div class="score team-${t}"><b>${v.score[t]}</b><span>${TEAM_NAMES[t].toUpperCase()} ${side(t)}</span></div>`;
    return `${score(0)}<div class="mid"><div class="phase">${PHASE_LABEL[v.phase]}</div><div class="timer"></div><div class="round">${v.round ? `ROUND ${v.round}${v.overtime ? " · OVERTIME" : ""}` : ""}</div></div>${score(1)}`;
  }

  function infoLines(v: MatchView): string[] {
    const me = meOf(v);
    const side = me?.side ?? null;
    const lines: string[] = [];
    if (side === null || v.phase < Phase.Prep || v.phase > Phase.PostPlant) return lines;
    if (side === DEFENSE) lines.push(`Site: ${siteName(v.site)}`);
    else lines.push(v.site ? `Site: ${siteName(v.site)}` : "Site: not found yet: find its bombs");
    const d = v.defuser;
    if (d?.planted) lines.push(side === DEFENSE ? `Defuser planted: hold ${keyLabel(keys.interact)} at it to disable it` : "Defuser planted: hold the site");
    else if (side === ATTACK) {
      if (v.carrier === me!.id && d?.carrier) lines.push(`You carry the defuser · ${keyLabel(keys.drop)} drops it`);
      else if (d?.dropped) lines.push("The defuser is on the floor (the marker)");
      else if (v.carrier) lines.push(`Defuser: ${v.players.find((p) => p.id === v.carrier)?.name ?? "a teammate"}`);
      if (v.detected.length) lines.push(`Run-out detected: ${v.detected.length}`);
    }
    if (side === DEFENSE && v.phase === Phase.Prep) lines.push(`Reinforcements left: ${lab.sim.deployRules.pools[DEFENSE]}`);
    if (v.redWalls && side === DEFENSE) lines.push("Red walls: you can't leave the building yet");
    return lines;
  }

  function boardHtml(v: MatchView): string {
    const status = (p: MatchViewPlayer) => (!p.connected ? "LEFT" : p.side === null ? "—" : p.alive ? "ALIVE" : v.phase >= Phase.Prep && v.phase <= Phase.RoundEnd ? "DEAD" : "");
    const table = (t: 0 | 1) =>
      `<div class="team team-${t}"><h3>${TEAM_NAMES[t]} · ${v.score[t]}</h3><table><tr><th>Player</th><th>Operator</th><th>K</th><th>A</th><th>D</th><th></th></tr>${v.players
        .filter((p) => p.team === t)
        .map((p) => `<tr class="${p.id === v.you ? "you" : ""}${p.alive ? "" : " dead"}"><td>${escapeHtml(p.name)}</td><td>${escapeHtml(opName(p.operator))}</td><td>${p.kills}</td><td>${p.assists}</td><td>${p.deaths}</td><td>${status(p)}</td></tr>`)
        .join("")}</table></div>`;
    return `<div class="teams">${table(0)}${table(1)}</div><p class="note">${escapeHtml(formatName(v))} · room ${escapeHtml(session.roomCode)} · ping ${Math.round(session.rttMs)} ms</p>`;
  }

  let boardHeld = false;
  addEventListener("keydown", (e) => {
    // Tab still moves between a screen's fields.
    if (e.code !== "Tab" || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    e.preventDefault();
    boardHeld = true;
  });
  addEventListener("keyup", (e) => {
    if (e.code === "Tab") boardHeld = false;
  });
  addEventListener("blur", () => (boardHeld = false));

  // ---------------------------------------------------------------- the camera without a body

  /** Which living teammate the dead look through (a click moves on to the next). */
  let follow = 0;
  lab.app.addEventListener("mousedown", (e) => {
    if (e.button === 0 && lab.body() === null && (e.target as Element).tagName === "CANVAS") follow++;
  });
  /** Living teammates' bodies (the side you play this round), yours left out. */
  const livingMates = (side: 0 | 1): number[] =>
    session.roster
      .filter((e) => e.kind === 0 && e.team === side && e.controllerId !== session.you)
      .flatMap((e) => e.pawnIds.slice(0, 1))
      .filter((id) => {
        const st = session.remoteAt(id);
        return st !== null && st.mode !== PawnMode.Dead;
      });

  /** The camera the page last asked for without a body (browser tests read it). */
  let camera: SpectateView | null = null;
  lab.spectate((): SpectateView | null => (camera = spectateView()));
  function spectateView(): SpectateView {
    const v = session.match;
    const me = v && meOf(v);
    if (!v || !me || me.side === null) return { kind: "overview" };
    if (v.phase === Phase.Prep && me.side === ATTACK) {
      const group = me.spawn ?? spawnGroups[0];
      const sp = level.spawns.find((s) => s.side === "attack" && s.group === group);
      if (sp) return { kind: "spot", pos: [sp.pos[0], sp.pos[1], sp.pos[2]], yawDeg: sp.yawDeg };
    }
    if (v.phase >= Phase.Action && v.phase <= Phase.RoundEnd) {
      const mates = livingMates(me.side);
      if (mates.length) return { kind: "pawn", pawnId: mates[follow % mates.length] };
    }
    return { kind: "overview" };
  }

  // ---------------------------------------------------------------- markers in the world

  const sprite = (color: string, glyph: string) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.font = "bold 46px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(0,0,0,0.8)";
    g.strokeText(glyph, 32, 34);
    g.fillStyle = color;
    g.fillText(glyph, 32, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.setScalar(0.4);
    s.renderOrder = 12;
    s.visible = false;
    lab.scene.add(s);
    return s;
  };
  /** The defuser itself, lying dropped or planted. */
  const defuserMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.22), new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xb00000, emissiveIntensity: 0.6 }));
  defuserMesh.visible = false;
  lab.scene.add(defuserMesh);
  /** Over the defuser (seen through walls by the attackers, and by everyone once planted), and over its carrier. */
  const defuserMark = sprite("#ffd23f", "◆");
  const carrierMark = sprite("#ffd23f", "◆");
  const detectedMarks: THREE.Sprite[] = [];

  function updateMarkers(v: MatchView, renderTick: number) {
    const me = meOf(v);
    const d = v.defuser;
    const live = v.phase >= Phase.Prep && v.phase <= Phase.RoundEnd;
    const at = live ? (d?.planted ?? d?.dropped ?? null) : null;
    defuserMesh.visible = at !== null;
    defuserMark.visible = at !== null;
    if (at) {
      defuserMesh.position.set(at[0], at[1] + 0.07, at[2]);
      defuserMark.position.set(at[0], at[1] + 0.6, at[2]);
    }
    // The carrier's marker for the attackers (not over yourself).
    const carrier = live && d && d.carrier && !lab.ctrl.pawnIds.includes(d.carrier) ? session.remoteAt(d.carrier, renderTick) : null;
    carrierMark.visible = carrier !== null;
    if (carrier) carrierMark.position.set(carrier.x, carrier.y + 2.15, carrier.z);
    // Defenders detected outside: a red marker over each, for the attackers.
    const det = live && me?.side === ATTACK ? v.detected : [];
    while (detectedMarks.length < det.length) detectedMarks.push(sprite("#ff4d4d", "▼"));
    detectedMarks.forEach((m, i) => {
      const st = i < det.length ? session.remoteAt(det[i], renderTick) : null;
      m.visible = st !== null;
      if (st) m.position.set(st.x, st.y + 2.2, st.z);
    });
  }

  // ---------------------------------------------------------------- every frame

  let lastPhase: Phase | null = null;
  let shown = "";

  lab.onFrame((_now, renderTick) => {
    const v = session.match;
    if (!v) return;
    const me = meOf(v);
    // A new phase with a screen to click lets go of the mouse.
    if (v.phase !== lastPhase) {
      if (v.phase === Phase.Lobby || v.phase === Phase.Ban || v.phase === Phase.Planning || v.phase === Phase.MatchEnd) lab.releasePointer();
      lastPhase = v.phase;
    }

    // The screen: the lobby, the ban vote, the planning screen (and an attacker's prep, while the mouse is free), the summary.
    const prepAttacker = v.phase === Phase.Prep && me?.side === ATTACK && lab.body() === null;
    const which =
      v.phase === Phase.Lobby
        ? "lobby"
        : v.phase === Phase.Ban
          ? "ban"
          : v.phase === Phase.Planning || (prepAttacker && !document.pointerLockElement)
            ? "planning"
            : v.phase === Phase.MatchEnd
              ? "summary"
              : "";
    if (which !== shown) {
      shown = which;
      screen.dataset.parts = "";
    }
    screen.classList.toggle("hidden", which === "");
    screen.dataset.screen = which;
    if (which) setParts(which === "lobby" ? lobbyParts(v) : which === "ban" ? banParts(v) : which === "planning" ? planningParts(v) : summaryParts(v));
    const t = left(v);
    const timer = t === null ? "" : clock(Math.ceil(t));
    for (const el of screen.querySelectorAll<HTMLElement>(".timer")) el.textContent = timer;

    // The top bar and the lines under it.
    const inRound = v.phase !== Phase.Lobby && v.phase !== Phase.MatchEnd;
    top.classList.toggle("hidden", !inRound);
    if (inRound) {
      const html = topHtml(v);
      if (top.dataset.html !== html) {
        top.dataset.html = html;
        top.innerHTML = html;
      }
      const tEl = top.querySelector<HTMLElement>(".timer")!;
      tEl.textContent = timer;
      tEl.classList.toggle("urgent", t !== null && t <= 10 && (v.phase === Phase.Action || v.phase === Phase.PostPlant));
      top.classList.toggle("planted", v.phase === Phase.PostPlant);
    }
    const lines = inRound && which === "" ? infoLines(v) : [];
    info.classList.toggle("hidden", lines.length === 0);
    const infoHtml = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
    if (info.dataset.html !== infoHtml) {
      info.dataset.html = infoHtml;
      info.innerHTML = infoHtml;
    }

    // The round's result, for the round end.
    const last = v.history.at(-1);
    const showBanner = v.phase === Phase.RoundEnd && last !== undefined && last.round === v.round;
    banner.classList.toggle("hidden", !showBanner);
    if (showBanner) {
      const mine = me ? me.team === last.winner : null;
      const html = `<div class="title team-${last.winner}">${TEAM_NAMES[last.winner].toUpperCase()} WINS ROUND ${last.round}</div><div class="why">${reasonText(last)}</div>${
        mine === null ? "" : `<div class="you ${mine ? "won" : "lost"}">${mine ? "Round won" : "Round lost"}</div>`
      }`;
      if (banner.dataset.html !== html) {
        banner.dataset.html = html;
        banner.innerHTML = html;
      }
    }

    // Tab: the scoreboard.
    board.classList.toggle("hidden", !boardHeld || v.phase === Phase.Lobby);
    if (boardHeld) {
      const html = boardHtml(v);
      if (board.dataset.html !== html) {
        board.dataset.html = html;
        board.innerHTML = html;
      }
    }

    updateMarkers(v, renderTick);
  });

  lab.addHelp("<kbd>Tab</kbd>", "Scoreboard (hold)");
  lab.addHelp(`<kbd>${keyLabel(keys.drop)}</kbd>`, "Drop the defuser (attackers)");
  lab.addHelp("Left mouse (dead)", "Look through the next teammate still alive");

  // Browser tests drive the match through this as well as the screens' buttons (tools/e2e/match.mjs).
  Object.defineProperty(window, "__match", {
    value: {
      get view() {
        return session.match;
      },
      get rules() {
        return currentRules();
      },
      get screen() {
        return shown;
      },
      get spectating() {
        return lab.body() === null;
      },
      /** Where the camera looks while spectating (null with a living body). */
      get camera() {
        return lab.body() === null ? camera : null;
      },
      lobby,
      action: act,
      pickOperator,
    },
  });
}
