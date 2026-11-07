// A bot's hands on its gadgets (Phase 9 M7, bots/DESIGN.md §7.4): one use of a gadget from start to end, made of the
// keys a player would press (gadgets/DESIGN.md §2). To where it's used from; the slot's key until the device is in
// hand (another slot's put away first), its equip time; the view on the spot, then Fire held to place it or swing it,
// Fire or ADS to throw or lob it, or held up a while; a remote device then set off from cover (its key brings the
// detonator back if the weapon came up meanwhile), a fused charge waited out there. It reads no more than the player
// would know: its own counts, what's in its hand, and the panel in front of it.
import { TICK_HZ } from "../core/constants.js";
import { DEG, type Vec3 } from "../core/math.js";
import { slotGadget } from "../gadgets/hands.js";
import { eyePose } from "../player/hitboxes.js";
import type { Pawn } from "../player/pawn.js";
import { Btn, GadgetAct, Hand, handSlot, Stance, type InputCmd } from "../player/types.js";
import type { Sim } from "../sim.js";
import { lookAt, viewGap, type View } from "./aim.js";
import type { GadgetTask } from "./plan.js";

type BotInput = Omit<InputCmd, "seq">;

/** What a use needs from its bot each tick. */
export interface UseCtx {
  sim: Sim;
  me: Pawn;
  now: number;
  /** Walk toward `to`, stopping within `r`: the input, or null once there. */
  walk(to: Vec3, r: number, sprint: boolean): BotInput | null;
  /** The follower found no way there this tick. */
  failed(): boolean;
  /** The view turned toward `want` at the bot's turn rate. */
  turn(from: View, want: View): View;
}

export const UseState = { Going: 0, Using: 1, After: 2, Done: 3, Failed: 4 } as const;
export type UseState = (typeof UseState)[keyof typeof UseState];

/** A use gives up after this long (s). */
const LIMIT_S = 40;
/** Getting to cover after placing a charge takes no longer than this (s); then it's set off from where it is. */
const COVER_S = 8;
/** Placing: Fire held on the spot this long without it taking (not a place for it) moves the aim a little (s). */
const NUDGE_S = 0.6;
/** The aim's small moves when a spot won't take a device: up, down, then about either way. */
const NUDGES: readonly Vec3[] = [
  [0, 0, 0],
  [0, 0.15, 0],
  [0, -0.15, 0],
  [0.2, 0, 0],
  [-0.2, 0, 0],
  [0, 0, 0.2],
  [0, 0, -0.2],
];

/** Each slot's key, and its device and detonator hands. */
const KEY = { 1: Btn.Gadget, 2: Btn.Ability } as const;
const DEVICE = { 1: Hand.Gadget, 2: Hand.Ability } as const;
const DETONATOR = { 1: Hand.Detonator, 2: Hand.AbilityDetonator } as const;

export class GadgetUse {
  state: UseState = UseState.Going;
  private readonly since: number;
  /** The slot's devices left and out when it started. */
  private startLeft = -1;
  private startOut = -1;
  /** When it was used (thrown, placed, the last blow), when Fire was first held on the spot, the aim's nudges so far. */
  private usedAt = -1;
  private heldFrom = -1;
  private nudge = 0;
  /** Fire pressed (a hold use's: Dokkaebi's tablet), when. */
  firedAt = -1;
  /** The follower's failures to get there. */
  private walkFails = 0;

  constructor(
    readonly task: GadgetTask,
    now: number,
  ) {
    this.since = now;
  }

  get over(): boolean {
    return this.state === UseState.Done || this.state === UseState.Failed;
  }

  /** The device in hand and ready (its equip time over): a hold use's moment to act. */
  ready(me: Pawn): boolean {
    return me.state.hand === DEVICE[this.task.slot] && me.state.gAct !== GadgetAct.Equip;
  }

  /** This tick's input, or null (done, failed, or nothing to press). */
  step(ctx: UseCtx): BotInput | null {
    const t = this.task;
    const s = ctx.me.state;
    const now = ctx.now;
    const left = t.slot === 1 ? s.g1 : s.g2;
    const out = t.slot === 1 ? s.w1 : s.w2;
    if (this.startLeft < 0) {
      this.startLeft = left;
      this.startOut = out;
    }
    if (now - this.since > LIMIT_S * TICK_HZ) return this.end(false);
    const eye = eyePose(ctx.sim.data.movement, ctx.sim.data.hitboxes, s).pos;
    const key = KEY[t.slot];
    const stance = t.crouch ? Stance.Crouch : Stance.Stand;
    const view = (p: Vec3) => ctx.turn({ yaw: s.yaw, pitch: s.pitch }, lookAt(eye, p));
    const aim = (p: Vec3, buttons: number): BotInput => {
      const v = view(p);
      return { forward: 0, strafe: 0, yaw: v.yaw, pitch: v.pitch, buttons, stance, lean: 0 };
    };
    const still = (buttons: number): BotInput => ({ forward: 0, strafe: 0, yaw: s.yaw, pitch: s.pitch, buttons, stance: Stance.Crouch, lean: 0 });
    const aimed = (p: Vec3, within: number) => viewGap({ yaw: s.yaw, pitch: s.pitch }, lookAt(eye, p)) < within;
    const every = (n: number) => now % n === 0;
    // The slot's own hand out, else (on an edge) its key from the weapon, or the other slot's put away first.
    const takeOut = (want: number, p: Vec3 | null): BotInput => {
      const other = handSlot(s.hand);
      const b = s.hand === Hand.Weapon ? (every(8) ? key : 0) : other !== 0 && other !== t.slot ? (every(8) ? KEY[other as 1 | 2] | Btn.Swap : 0) : s.hand !== want && every(8) ? key : 0;
      return p ? aim(p, b) : still(b);
    };

    if (this.state === UseState.Going) {
      if (t.how === "detonate" ? out === 0 : left === 0) return this.end(t.how === "detonate");
      if (t.stand) {
        const near = t.how === "throw" || t.how === "lob" ? 1.2 : 0.35;
        if (Math.hypot(t.stand[0] - s.x, t.stand[2] - s.z) > near || Math.abs(t.stand[1] - s.y) > 0.8) {
          const w = ctx.walk(t.stand, near * 0.7, t.how !== "detonate");
          if (w) return { ...w, buttons: w.buttons & ~(Btn.Fire | Btn.Ads) };
          // No way there (stuck, or none): a few tries, then given up; not used from where it is meanwhile.
          if (ctx.failed()) return ++this.walkFails > 3 ? this.end(false) : null;
        }
      }
      this.state = UseState.Using;
    }

    if (this.state === UseState.Using) {
      if (t.how === "detonate") {
        if (out < this.startOut) return this.end(true);
        if (s.hand !== DETONATOR[t.slot]) return takeOut(DETONATOR[t.slot], null);
        return still(every(6) ? Btn.Fire : 0);
      }
      const spent = this.startLeft - left;
      if (t.how === "swing") {
        const spots = t.spots ?? [t.look];
        if ((t.panel !== undefined && panelOpen(ctx.sim, t.panel)) || spent >= spots.length || left === 0) {
          this.usedAt = now;
          return this.end(spent > 0);
        }
        const p = spots[spent];
        if (handSlot(s.hand) !== t.slot || s.gAct === GadgetAct.Equip) return takeOut(DEVICE[t.slot], p);
        if (s.gAct !== GadgetAct.Swing && !aimed(p, 0.05)) return aim(p, 0);
        return aim(p, Btn.Fire);
      }
      if (spent > 0) {
        this.usedAt = now;
        this.state = UseState.After;
      } else {
        const look = t.how === "place" ? nudged(t.look, this.nudge) : t.look;
        if (s.hand !== DEVICE[t.slot] || s.gAct === GadgetAct.Equip) return takeOut(DEVICE[t.slot], look);
        switch (t.how) {
          case "hold":
            if (this.heldFrom < 0) this.heldFrom = now;
            if (now - this.heldFrom >= (t.seconds ?? 3) * TICK_HZ) return this.end(true);
            return aim(look, 0);
          case "throw":
          case "lob": {
            // The view that lands it on the spot (its speed and lift, gravity): yaw toward it, the lower arc's pitch.
            const g = slotGadget(ctx.sim.data, ctx.me.loadout, t.slot);
            const rules = ctx.sim.data.gadgetRules.throw;
            const prof = g?.use.kind === "throw" && g.use.heavy ? rules.heavy : t.how === "lob" ? rules.underhand : rules.overhand;
            const straight = lookAt(eye, look);
            const want: View = { yaw: straight.yaw, pitch: throwPitch(eye, look, prof.speedMps, prof.upDeg, ctx.sim.data.movement.gravity) ?? Math.PI / 4 - prof.upDeg * DEG };
            const v = ctx.turn({ yaw: s.yaw, pitch: s.pitch }, want);
            const on = viewGap({ yaw: s.yaw, pitch: s.pitch }, want) < 0.03;
            const b = on && every(10) && s.gAct === GadgetAct.Ready ? (t.how === "throw" ? Btn.Fire : Btn.Ads) : 0;
            return { forward: 0, strafe: 0, yaw: v.yaw, pitch: v.pitch, buttons: b, stance, lean: 0 };
          }
          case "place": {
            if (s.gAct === GadgetAct.Place) {
              this.heldFrom = -1;
              return aim(look, Btn.Fire);
            }
            if (!aimed(look, 0.04)) return aim(look, 0);
            // Fire held on the spot; if it doesn't take, the aim moves a little (a few tries, then it gives up).
            if (this.heldFrom < 0) this.heldFrom = now;
            if (now - this.heldFrom > NUDGE_S * TICK_HZ) {
              this.heldFrom = -1;
              if (++this.nudge >= NUDGES.length) return this.end(false);
            }
            return aim(look, Btn.Fire);
          }
        }
      }
    }

    // Used: a remote device set off from cover, a fused charge waited out there; anything else is done. (No way to
    // cover, or too long getting there: set off from where it is, if it's off the device.)
    const remote = out > this.startOut;
    if (t.cover && (remote || t.seconds)) {
      const away = Math.hypot(t.look[0] - s.x, t.look[2] - s.z) > 2.5 || Math.abs(t.look[1] - s.y) > 2;
      const late = now - this.usedAt > COVER_S * TICK_HZ && away;
      if (!late && (Math.hypot(t.cover[0] - s.x, t.cover[2] - s.z) > 0.6 || Math.abs(t.cover[1] - s.y) > 0.8)) {
        const w = ctx.walk(t.cover, 0.4, true);
        if (w && !(ctx.failed() && ++this.walkFails > 3)) return { ...w, buttons: w.buttons & ~(Btn.Fire | Btn.Ads) };
      }
      if (remote) {
        if (s.hand !== DETONATOR[t.slot]) return takeOut(DETONATOR[t.slot], null);
        return still(every(6) ? Btn.Fire : 0);
      }
      if (now - this.usedAt < (t.seconds ?? 0) * TICK_HZ) return still(0);
    }
    return this.end(true);
  }

  /** Ended from outside (a hold use's job done: the tablet's payload sent). */
  finish(ok: boolean): void {
    this.end(ok);
  }

  private end(ok: boolean): null {
    this.state = ok ? UseState.Done : UseState.Failed;
    return null;
  }
}

/**
 * The view pitch whose throw lands at `p` from `eye`: thrown at `speed` m/s, `upDeg` over the view (data/gadgets.json
 * `throw`), falling at `gravity` (negative); the lower of the two arcs. Null: out of its reach.
 */
export function throwPitch(eye: Vec3, p: Vec3, speed: number, upDeg: number, gravity: number): number | null {
  const dx = Math.hypot(p[0] - eye[0], p[2] - eye[2]);
  const dy = p[1] - eye[1];
  const g = -gravity;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0 || dx < 0.1 || g <= 0) return null;
  const theta = Math.atan((v2 - Math.sqrt(disc)) / (g * dx));
  return Math.max(-1.4, Math.min(1.4, theta - upDeg * DEG));
}

/** The look point moved by the k-th nudge. */
function nudged(p: Vec3, k: number): Vec3 {
  const n = NUDGES[Math.min(k, NUDGES.length - 1)];
  return [p[0] + n[0], p[1] + n[1], p[2] + n[2]];
}

/** Whether a breakable panel is open (a hatch or barricade broken, a frame empty); a wall's open is its blows' count. */
export function panelOpen(sim: Sim, index: number): boolean {
  const e = sim.level.panels.list[index];
  if (!e) return true;
  const p = e.panel;
  return p.kind !== "wall" && p.kind !== "floor" && (p.broken || p.empty);
}
