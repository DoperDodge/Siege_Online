// Hit markers (Phase 3 M6, M9): server-confirmed only (D-044), a cross on the crosshair, red on a kill,
// and a line under it saying what the hit did.
import type { GameEvent } from "@redmond/shared";

type HitConfirm = Extract<GameEvent, { kind: "hitConfirm" }>;

/** The line under the marker: damage and zone, DOWN, KILL or HEADSHOT (and, in lab rooms, the health left). */
export function hitText(e: HitConfirm): string {
  const what = e.killed ? (e.headshot ? "HEADSHOT" : "KILL") : e.downed ? "DOWN" : `${e.damage}${e.pellets > 1 ? ` (${e.pellets} pellets)` : ""} · ${e.zone}`;
  return `${what}${e.friendly ? " · teammate" : ""}${e.hpAfter !== null && !e.killed && !e.downed ? ` · ${e.hpAfter} HP left` : ""}`;
}

export class HitMarkers {
  private until = 0;
  private readonly cross: HTMLElement;
  private readonly text: HTMLElement;

  constructor(root: HTMLElement) {
    this.cross = root.querySelector<HTMLElement>(".hitmarker")!;
    this.text = root.querySelector<HTMLElement>(".hit-text")!;
  }

  confirm(now: number, e: HitConfirm) {
    this.cross.classList.toggle("kill", e.killed);
    this.cross.classList.toggle("friendly", e.friendly);
    this.until = now + (e.killed ? 450 : 220);
    this.text.textContent = hitText(e);
  }

  update(now: number) {
    this.cross.classList.toggle("show", now < this.until);
    this.text.classList.toggle("show", now < this.until + 500);
  }
}
