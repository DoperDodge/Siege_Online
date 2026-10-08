// Recent panel changes (Phase 4 M4), so a shot is judged against the panels as its shooter's client had
// them: a hole the server made after the newest tick that client had heard of isn't there yet for its
// bullets, and steel put up since isn't either (lag compensation, PLAN §5; bodies are rewound by
// net/lagComp.ts). Movement always uses the panels as they are now.
import type { PanelChange } from "./panel.js";

interface Change {
  tick: number;
  panel: number;
  added: boolean;
  /** layer × cells-per-layer + cell index. */
  cells: Set<number>;
}

export class PanelHistory {
  /** Oldest first; within a tick, in the order the ops were applied. */
  private changes: Change[] = [];

  /** `keepTicks`: how far back a shot can be judged (more than the rewind cap and the client's lead). */
  constructor(readonly keepTicks = 64) {}

  /** An op applied to panel `panel` at the end of tick `tick` (`n`: cells per layer). */
  record(tick: number, panel: number, n: number, change: PanelChange): void {
    for (const added of [false, true]) {
      const lists = added ? change.added : change.removed;
      const cells = new Set<number>();
      lists.forEach((list, layer) => {
        for (const i of list) cells.add(layer * n + i);
      });
      if (cells.size) this.changes.push({ tick, panel, added, cells });
    }
    let drop = 0;
    while (drop < this.changes.length && this.changes[drop].tick < tick - this.keepTicks) drop++;
    if (drop) this.changes.splice(0, drop);
  }

  /**
   * Was cell `i` of `layer` on panel `panel` (`n` cells per layer) solid at the end of tick `tick`, given it
   * is `now` at present? The first change after that tick tells: a removal means it was there, an addition
   * that it wasn't.
   */
  solidAt(panel: number, layer: number, i: number, n: number, tick: number, now: boolean): boolean {
    const key = layer * n + i;
    for (const c of this.changes) if (c.tick > tick && c.panel === panel && c.cells.has(key)) return !c.added;
    return now;
  }

  /** Did panel `panel` change after tick `tick`? (Most shots see none and skip the cell lookups.) */
  changedSince(panel: number, tick: number): boolean {
    for (let k = this.changes.length - 1; k >= 0 && this.changes[k].tick > tick; k--) if (this.changes[k].panel === panel) return true;
    return false;
  }
}
