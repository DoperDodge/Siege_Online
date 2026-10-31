// A body's hands (Phase 8, gadgets/DESIGN.md §2): the weapon, slot 1's gadget (the secondary gadget) or slot 2's (the
// ability's item; Striker's and Sentry's second gadget). The gadget key and the ability key take a slot's device out
// (its detonator first while devices of it wait) and put it away; Fire throws or places it (held) or presses the
// detonator; ADS lobs a throwable. All of it is pawn state, predicted like the weapon; what it makes in the world
// (a throw, a placed gadget, a detonation) is an event the server turns into gadget table ops (net/room.ts).
import { DEG, rightXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";
import type { Pawn } from "../player/pawn.js";
import { Btn, GadgetAct, Hand, handSlot, isDetonator, PawnMode, WeaponAct, type InputCmd, type PawnState } from "../player/types.js";
import { eyePose } from "../player/hitboxes.js";
import type { ResolvedLoadout } from "../weapons/loadout.js";
import { viewDir } from "../weapons/spread.js";
import type { SimEvent } from "../weapons/step.js";
import { ticks } from "../weapons/ticks.js";
import { isPlaced, placeSpot, type PlaceQuery, type PlaceSpot } from "./place.js";

export interface HandsContext extends PlaceQuery {
  data: GameData;
  events: SimEvent[];
  /** Whether a body's detonator has a device of `gadget` out to set off (not one an EMP disabled); unset: yes. */
  canDetonate?(pawn: Pawn, gadget: string): boolean;
  /** Whether a swing's blow from this body's eye along its view meets something within `reachM` (it costs a charge); unset: yes. */
  swingMeets?(pawn: Pawn, reachM: number): boolean;
}

/** The gadget in a loadout's slot (1: the secondary gadget; 2: a kit's second gadget), or null. */
export function slotGadget(data: GameData, lo: ResolvedLoadout | null, slot: 1 | 2): GadgetData | null {
  const id = lo?.slots[slot - 1];
  return (id && data.gadgets.get(id)) || null;
}

/** How many of slot 1's and slot 2's devices a body with this loadout starts a round with. */
export function slotCounts(data: GameData, lo: ResolvedLoadout | null): [number, number] {
  return [slotGadget(data, lo, 1)?.count ?? 0, slotGadget(data, lo, 2)?.count ?? 0];
}

const left = (s: PawnState, slot: 1 | 2) => (slot === 1 ? s.g1 : s.g2);
const waiting = (s: PawnState, slot: 1 | 2) => (slot === 1 ? s.w1 : s.w2);
const deviceHand = (slot: 1 | 2) => (slot === 1 ? Hand.Gadget : Hand.Ability);
const detonatorHand = (slot: 1 | 2) => (slot === 1 ? Hand.Detonator : Hand.AbilityDetonator);

/** Take something out of a slot: its equip time runs before it can be used. */
function takeOut(s: PawnState, hand: Hand) {
  s.hand = hand;
  s.gAct = GadgetAct.Equip;
  s.gTicks = 0;
}

/** Back to the weapon, which comes up over its equip time (as after a weapon swap; `equip` false: the swap brings it). */
export function putAway(s: PawnState, equip = true): void {
  if (s.hand === Hand.Weapon) return;
  s.hand = Hand.Weapon;
  s.gAct = GadgetAct.Ready;
  s.gTicks = 0;
  if (!equip) return;
  s.wAct = WeaponAct.Equip;
  s.actTicks = 0;
}

/** A body nobody drives this tick (Skopós's other shell, a body left on the cameras): a windup or a placing stops. */
export function parkHands(s: PawnState): void {
  if (s.gAct === GadgetAct.Throw || s.gAct === GadgetAct.Lob || s.gAct === GadgetAct.Place) {
    s.gAct = GadgetAct.Ready;
    s.gTicks = 0;
  }
}

/**
 * After a device left the hands: the detonator if it waits for one, the next device, or the weapon. One at a time
 * (`maxOut`, Fuze's Cluster Charge): placing another sets the oldest off (the server does), so no more wait.
 */
function afterUse(s: PawnState, slot: 1 | 2, g: GadgetData) {
  if (slot === 1) s.g1--;
  else s.g2--;
  if (g.remote) {
    if (waiting(s, slot) < (g.maxOut ?? Infinity)) {
      if (slot === 1) s.w1++;
      else s.w2++;
    }
    s.hand = detonatorHand(slot);
    s.gAct = GadgetAct.Ready;
    s.gTicks = 0;
  } else if (left(s, slot) > 0) takeOut(s, deviceHand(slot));
  else putAway(s);
}

/**
 * One of a body's remote devices of this gadget is gone without its detonator (destroyed, a lab tool): one fewer
 * waiting; a detonator left with nothing to set off gives way to the next device, or the weapon. False: not this
 * body's (no slot holds it, or none of it waits).
 */
export function deviceLost(data: GameData, pawn: Pawn, gadget: string): boolean {
  const s = pawn.state;
  const slot = slotGadget(data, pawn.loadout, 1)?.id === gadget ? 1 : slotGadget(data, pawn.loadout, 2)?.id === gadget ? 2 : 0;
  if (slot === 0 || waiting(s, slot) === 0) return false;
  if (slot === 1) s.w1--;
  else s.w2--;
  if (waiting(s, slot) === 0 && s.hand === detonatorHand(slot)) {
    if (left(s, slot) > 0) takeOut(s, deviceHand(slot));
    else putAway(s);
  }
  return true;
}

/** The key of a slot pressed: its detonator or device out, swapped, or put away. */
function toggle(s: PawnState, slot: 1 | 2) {
  if (handSlot(s.hand) === slot) {
    if (isDetonator(s.hand) && left(s, slot) > 0) takeOut(s, deviceHand(slot));
    else putAway(s);
    return;
  }
  if (waiting(s, slot) > 0) takeOut(s, detonatorHand(slot));
  else if (left(s, slot) > 0) takeOut(s, deviceHand(slot));
}

/** Where a throw leaves from and how fast (data/gadgets.json `throw`): never from inside a wall in front of the eye. */
export function throwStart(q: LevelQuery, data: GameData, s: PawnState, eye: Vec3, lob: boolean, heavy: boolean): { pos: Vec3; vel: Vec3 } {
  const t = data.gadgetRules.throw;
  const fwd = viewDir(s.yaw, s.pitch);
  const [rx, rz] = rightXZ(s.yaw);
  const want: Vec3 = [eye[0] + rx * t.fromM.right + fwd[0] * t.fromM.ahead, eye[1] - t.fromM.down + fwd[1] * t.fromM.ahead, eye[2] + rz * t.fromM.right + fwd[2] * t.fromM.ahead];
  const d: Vec3 = [want[0] - eye[0], want[1] - eye[1], want[2] - eye[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const hit = raycastLevel(q, eye, dir, len + t.radiusM);
  const go = hit ? Math.max(0, hit.t - t.radiusM) : len;
  const pos: Vec3 = [eye[0] + dir[0] * go, eye[1] + dir[1] * go, eye[2] + dir[2] * go];
  const prof = heavy ? t.heavy : lob ? t.underhand : t.overhand;
  const up = Math.max(-89 * DEG, Math.min(89 * DEG, s.pitch + prof.upDeg * DEG));
  const v = viewDir(s.yaw, up);
  return { pos, vel: [v[0] * prof.speedMps, v[1] * prof.speedMps, v[2] * prof.speedMps] };
}

/** Where holding Fire would put the placed gadget in hand now, or null (on its feet only). */
export function placeSpotFor(q: PlaceQuery & { data: GameData }, pawn: Pawn): PlaceSpot | null {
  const s = pawn.state;
  const slot = handSlot(s.hand);
  if (slot === 0 || isDetonator(s.hand) || s.mode !== PawnMode.Walk || !s.grounded) return null;
  const g = slotGadget(q.data, pawn.loadout, slot);
  if (!g || !isPlaced(g)) return null;
  return placeSpot(q, g, eyePose(q.data.movement, q.data.hitboxes, s).pos, viewDir(s.yaw, s.pitch), s.yaw);
}

/**
 * One tick of the hands, before the weapon's (player/movement.ts). `free`: the body is on its feet with nothing else
 * in its hands (no knife swing, revive or Interact hold): only then does a gadget wind up, place or detonate.
 */
export function stepHands(ctx: HandsContext, pawn: Pawn, input: InputCmd, pressed: number, free: boolean): void {
  const s = pawn.state;
  const lo = pawn.loadout;
  if (!lo) return;
  const before = s.hand;
  if (pressed & Btn.Gadget && slotGadget(ctx.data, lo, 1)) toggle(s, 1);
  if (pressed & Btn.Ability && slotGadget(ctx.data, lo, 2)) toggle(s, 2);
  // Taken out this tick: its equip time starts next tick (as a weapon swap's does, weapons/step.ts).
  if (s.hand !== before && s.hand !== Hand.Weapon) return;
  // The other weapon's key puts the gadget away; the weapon's step swaps to it and brings it up. (The key of the
  // weapon already out comes as the slot's own key: the client sends it, gadgets/DESIGN.md §2.)
  if (pressed & Btn.Swap) putAway(s, false);
  const slot = handSlot(s.hand);
  if (slot === 0) return;
  const g = slotGadget(ctx.data, lo, slot);
  if (!g) {
    putAway(s);
    return;
  }
  // A swung item (Sledge's hammer) works on a rope too (research/operators/sledge.md §3.1).
  const walking = s.mode === PawnMode.Walk || (g.use.kind === "swing" && s.mode === PawnMode.Rappel);
  if (s.gAct === GadgetAct.Equip) {
    s.gTicks = Math.min(0xffff, s.gTicks + 1);
    if (s.gTicks >= ticks(ctx.data.gadgetRules.equipS)) {
      s.gAct = GadgetAct.Ready;
      s.gTicks = 0;
    }
    return;
  }
  if (!free || !walking) {
    // Busy, or off its feet (a vault, a ladder, a rope): a windup or a placing stops; the gadget stays in hand.
    if (s.gAct !== GadgetAct.Ready) {
      s.gAct = GadgetAct.Ready;
      s.gTicks = 0;
    }
    return;
  }
  if (isDetonator(s.hand)) {
    // An EMP on the body (DSEG), or on every device of it out: the press does nothing (Phase 8 M3).
    if (pressed & Btn.Fire && waiting(s, slot) > 0 && s.jammed === 0 && (ctx.canDetonate?.(pawn, g.id) ?? true)) {
      if (slot === 1) s.w1--;
      else s.w2--;
      ctx.events.push({ kind: "detonate", pawnId: pawn.id, seq: input.seq, slot, gadget: g.id });
      if (waiting(s, slot) === 0) {
        if (left(s, slot) > 0) takeOut(s, deviceHand(slot));
        else putAway(s);
      }
    }
    return;
  }
  if (g.use.kind === "swing") {
    // Fire held swings it, one swing after another; the blow lands `hitS` in, a charge spent if it meets something
    // (the room judges what), and the next can start when the swing's over (Phase 8 M4).
    const u = g.use;
    if (s.gAct === GadgetAct.Ready) {
      if (!(input.buttons & Btn.Fire) || left(s, slot) === 0) return;
      s.gAct = GadgetAct.Swing;
      s.gTicks = 0;
    }
    s.gTicks = Math.min(0xffff, s.gTicks + 1);
    if (s.gTicks === Math.max(1, ticks(u.hitS)) && left(s, slot) > 0 && (ctx.swingMeets?.(pawn, u.reachM) ?? true)) {
      if (slot === 1) s.g1--;
      else s.g2--;
      ctx.events.push({ kind: "swing", pawnId: pawn.id, seq: input.seq, slot, gadget: g.id, yaw: s.yaw, pitch: s.pitch, origin: eyePose(ctx.data.movement, ctx.data.hitboxes, s).pos });
    }
    if (s.gTicks >= ticks(u.swingS)) {
      s.gAct = GadgetAct.Ready;
      s.gTicks = 0;
    }
    return;
  }
  // Held up (Pulse's sensor, Phase 8 M6): it works while it's out (gadgets/sensor.ts); Fire does nothing with it.
  if (g.use.kind === "hold") return;
  if (g.use.kind === "throw") {
    if (s.gAct === GadgetAct.Ready) {
      if (pressed & Btn.Fire) s.gAct = GadgetAct.Throw;
      else if (pressed & Btn.Ads) s.gAct = GadgetAct.Lob;
      else return;
      s.gTicks = 0;
    }
    s.gTicks = Math.min(0xffff, s.gTicks + 1);
    if (s.gTicks < Math.max(1, ticks(ctx.data.gadgetRules.throw.windupS))) return;
    const eye = eyePose(ctx.data.movement, ctx.data.hitboxes, s).pos;
    const { pos, vel } = throwStart(ctx, ctx.data, s, eye, s.gAct === GadgetAct.Lob, g.use.heavy);
    ctx.events.push({ kind: "throw", pawnId: pawn.id, seq: input.seq, slot, gadget: g.id, pos, vel, yaw: s.yaw });
    afterUse(s, slot, g);
    return;
  }
  // A placed gadget: Fire held with the view on a spot for it, for its placing time (let go, or look away: nothing).
  const spot = input.buttons & Btn.Fire ? placeSpotFor(ctx, pawn) : null;
  if (!spot) {
    s.gAct = GadgetAct.Ready;
    s.gTicks = 0;
    return;
  }
  s.gAct = GadgetAct.Place;
  s.gTicks = Math.min(0xffff, s.gTicks + 1);
  if (s.gTicks < ticks((g.use as Extract<GadgetData["use"], { kind: "place" }>).placeS)) return;
  ctx.events.push({ kind: "place", pawnId: pawn.id, seq: input.seq, slot, gadget: g.id, ...spot });
  afterUse(s, slot, g);
}
