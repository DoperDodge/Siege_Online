// The kill feed (Phase 3 M6, M9): who downed, eliminated, finished or revived whom, with what, the last
// five for six seconds each; lines involving you stand out. Also the death message's text.
import { Cause, type GameEvent } from "@redmond/shared";
import { escapeHtml } from "./dom.js";

/** Names the feed shows: a player by controller, a body's owner, a weapon by id. */
export interface FeedNames {
  ctrl(id: number): string;
  pawn(id: number): string;
  weapon(id: string): string;
}

/** Who "you" are: your controller and its bodies. */
export interface FeedViewer {
  ctrl: number;
  pawns: readonly number[];
}

const LINES = 5;
const SHOW_MS = 6000;

/** The feed's line for a server event (null: the event isn't one for the feed), and whether it involves you. */
export function feedLine(e: GameEvent, n: FeedNames, me: FeedViewer): { text: string; mine: boolean } | null {
  if (e.kind === "down") {
    const by = e.downerCtrl ? `${n.ctrl(e.downerCtrl)}${e.weapon ? ` [${n.weapon(e.weapon)}]` : ""}` : null;
    return { text: by ? `${by} downed ${n.ctrl(e.victimCtrl)}` : `${n.ctrl(e.victimCtrl)} is down`, mine: e.victimCtrl === me.ctrl || e.downerCtrl === me.ctrl };
  }
  if (e.kind === "reviveEnd") {
    if (!e.completed) return null;
    return { text: `${n.pawn(e.reviverPawn) || "someone"} revived ${n.pawn(e.targetPawn) || "someone"}`, mine: me.pawns.includes(e.targetPawn) || me.pawns.includes(e.reviverPawn) };
  }
  if (e.kind !== "kill" && e.kind !== "shellDestroyed") return null;
  const victimCtrl = e.kind === "kill" ? e.victimCtrl : e.ownerCtrl;
  const victim = n.ctrl(victimCtrl);
  const killer = e.killerCtrl ? n.ctrl(e.killerCtrl) : null;
  const how = weaponTag(e, n);
  const text =
    e.kind === "shellDestroyed"
      ? `${killer ?? "?"}${how} destroyed ${victim}'s idle shell`
      : killer
        ? `${killer}${how} ${e.friendly ? "team-killed" : "eliminated"} ${victim}${e.assistCtrl ? ` (finished by ${n.ctrl(e.assistCtrl)})` : ""}${e.cause === Cause.Bleed ? " (bled out)" : ""}`
        : `${victim} died${e.cause === Cause.Fall ? " (fall)" : e.cause === Cause.Bleed ? " (bled out)" : ""}`;
  return { text, mine: victimCtrl === me.ctrl || e.killerCtrl === me.ctrl };
}

/** What your death screen says for the kill that ended you (null: a fall, which says so itself). */
export function deathLine(e: Extract<GameEvent, { kind: "kill" }>, n: FeedNames): string | null {
  const killer = e.killerCtrl ? n.ctrl(e.killerCtrl) : null;
  if (e.cause === Cause.Bleed) return `You bled out${killer ? ` (downed by ${killer})` : ""}`;
  if (killer) return `Killed by ${killer}${weaponTag(e, n)}`;
  return e.cause === Cause.Fall ? null : "You died";
}

function weaponTag(e: Extract<GameEvent, { kind: "kill" | "shellDestroyed" }>, n: FeedNames): string {
  return e.weapon ? ` [${e.weapon === "knife" ? "knife" : n.weapon(e.weapon)}${e.headshot ? ", headshot" : ""}]` : "";
}

export class KillFeed {
  private readonly lines: { text: string; mine: boolean; until: number }[] = [];
  private readonly el: HTMLElement;
  private shown = "";

  constructor(root: HTMLElement) {
    this.el = root.querySelector<HTMLElement>(".killfeed")!;
  }

  push(line: { text: string; mine: boolean }, now: number) {
    this.lines.push({ ...line, until: now + SHOW_MS });
    if (this.lines.length > LINES) this.lines.shift();
  }

  update(now: number) {
    while (this.lines.length && this.lines[0].until < now) this.lines.shift();
    const html = this.lines.map((f) => `<div class="${f.mine ? "mine" : ""}">${escapeHtml(f.text)}</div>`).join("");
    if (html !== this.shown) this.el.innerHTML = this.shown = html;
  }
}
