// Orders from a person to their bot teammates off the comm wheel (Phase 9 M6, bots/DESIGN.md §8; data/intel.json
// `botOrders`): who takes one — the nearest bot teammate on its feet that can do it, or all of them to regroup — and
// what it is as tasks (bots/plan.ts), done before the bot's planner's job until done, a fight, a new order, or its
// time is up. Go here and Hold here are the caller's last ping's spot; Breach this the wall or hatch it landed on.
import type { Vec3 } from "../core/math.js";
import type { BotOrder } from "../data/schemas.js";
import type { PanelEntry } from "../destruction/panels.js";
import type { Pawn } from "../player/pawn.js";
import type { Sim } from "../sim.js";
import type { NavWorld } from "./nav/world.js";
import { breachTasks, type Task } from "./plan.js";
import { roomAt, sides, standAt } from "./places.js";

/** An order for one bot: its tasks, in turn, for at most `seconds`. */
export interface Order {
  tasks: Task[];
  seconds: number;
}

/** How near a panel's face a ping has to land to be on it (m). */
const ON_PANEL_M = 0.6;

/** The wall, hatch or barricade a ping landed on (within ON_PANEL_M of its face), or null. */
export function panelAt(sim: Sim, at: Vec3): PanelEntry | null {
  let best: { e: PanelEntry; d: number } | null = null;
  for (const e of sim.level.panels.list) {
    const k = e.panel.kind;
    if (k !== "wall" && k !== "hatch" && k !== "barricade" && k !== "floor") continue;
    const f = e.frame;
    const r = [at[0] - f.center[0], at[1] - f.center[1], at[2] - f.center[2]];
    const u = Math.abs(r[0] * f.u[0] + r[1] * f.u[1] + r[2] * f.u[2]) - f.w / 2;
    const v = Math.abs(r[0] * f.v[0] + r[1] * f.v[1] + r[2] * f.v[2]) - f.h / 2;
    const n = Math.abs(r[0] * f.n[0] + r[1] * f.n[1] + r[2] * f.n[2]) - f.t / 2;
    const d = Math.hypot(Math.max(0, u), Math.max(0, v), Math.max(0, n));
    if (d <= ON_PANEL_M && (!best || d < best.d)) best = { e, d };
  }
  return best?.e ?? null;
}

/**
 * Order `kind` as tasks for the bot `me`, from the caller (its body) and the caller's last ping (`at`). Null: this bot
 * can't do it (nothing to breach with), or it isn't an order for one bot (Push, Rotate).
 */
export function orderFor(sim: Sim, nav: NavWorld, kind: BotOrder, caller: Pawn, at: Vec3, me: Pawn): Order | null {
  const level = sim.level.def;
  const c = caller.state;
  const from: Vec3 = [c.x, c.y, c.z];
  switch (kind) {
    case "go":
    case "hold": {
      const spot = standAt(nav, at, 2) ?? standAt(nav, [at[0], at[1] - 1.5, at[2]], 2);
      if (!spot) return null;
      // Watching on the way the caller looked there (past the spot, away from the caller).
      const dx = spot[0] - c.x;
      const dz = spot[2] - c.z;
      const len = Math.hypot(dx, dz) || 1;
      const face: Vec3 = [spot[0] + (dx / len) * 5, spot[1] + 1.4, spot[2] + (dz / len) * 5];
      const room = roomAt(level, spot[0], spot[1] + 0.3, spot[2]) ?? "";
      const hold: Task = { kind: "hold", spot, face, room };
      return kind === "go" ? { tasks: [{ kind: "go", via: [], to: spot }, hold], seconds: 45 } : { tasks: [hold], seconds: 75 };
    }
    case "follow":
    case "help":
      return { tasks: [{ kind: "follow", pawnId: caller.id }], seconds: kind === "help" ? 25 : 75 };
    case "regroup": {
      // To the caller, then staying with them.
      const to = standAt(nav, from, 1.5) ?? from;
      return { tasks: [{ kind: "go", via: [], to }, { kind: "follow", pawnId: caller.id }], seconds: 40 };
    }
    case "breach": {
      const e = panelAt(sim, at);
      if (!e) return null;
      // From the caller's side of it.
      const s = sides(level, e, 0.75);
      const near = s.sort((a, b) => Math.hypot(a.pos[0] - c.x, a.pos[2] - c.z) - Math.hypot(b.pos[0] - c.x, b.pos[2] - c.z))[0];
      const tasks = breachTasks(sim, nav, me, e, near?.room ?? null);
      return tasks.length ? { tasks, seconds: 50 } : null;
    }
    case "push":
    case "rotate":
      return null;
  }
}
