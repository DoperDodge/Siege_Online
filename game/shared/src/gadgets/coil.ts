// Dowser's Divining Coil (Project Redmond R3, gadgets/R3_OPERATORS.md §2; data/gadgets/divining_coil.json `coil`): held
// up (out of his slot 2, ready), it shows him the other side's electronic devices: their entries in the gadget table
// marked `electronic` (Shunt's packs, Dampers, armoured cameras, alarms, Nitro Cells, Twain's barrier...), the level's
// cameras (the defenders'), their drones, and Twain's idle frame; within `rangeM` of his eye through anything, within
// `fanDeg` of his facing across the floor. Mechanical things never show (Latch's snares, barbed wire, Rivet's studs).
// Only he sees them, as outlines (the page's); a ping while it's up marks the one nearest his crosshair for his team
// (Sim.ping). An EMP on him empties it while it lasts.
import { DEG, forwardXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import { isIdleShell } from "../combat/apply.js";
import { CAMERA_HALF_M } from "../intel/cameras.js";
import { DEFENSE } from "../match/rules.js";
import { eyePose } from "../player/hitboxes.js";
import type { Pawn } from "../player/pawn.js";
import { currentHeight } from "../player/stance.js";
import { GadgetAct, Hand, PawnKind, PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import { slotGadget } from "./hands.js";
import { kindId } from "./kinds.js";
import { GFlag } from "./table.js";

export type CoilData = NonNullable<GadgetData["coil"]>;

/** A device the coil shows: what it is (for its outline and a ping), where, its box and facing. */
export interface CoilMark {
  /** Unique among them: a table entry's (`g` and its id), a level camera's (`c` and its index), a body's (`p` and its id). */
  key: string;
  /** Its box's centre, its size (width, height, depth) and facing; `flat`: lying on a floor (its depth up). */
  pos: Vec3;
  size: readonly [number, number, number];
  yaw: number;
  flat: boolean;
  /** A ping on it: the entry's kind (its name on the team's ping), or −1. */
  kind: number;
  /** How far from his eye (m). */
  dist: number;
}

/** The coil a body holds up now (out of its slot 2 and ready), or null. */
export function coilUp(data: GameData, pawn: Pawn): CoilData | null {
  const s = pawn.state;
  if (pawn.kind !== PawnKind.Body || s.hand !== Hand.Ability || s.gAct === GadgetAct.Equip || s.mode === PawnMode.Dead || s.mode === PawnMode.Held) return null;
  return slotGadget(data, pawn.loadout, 2)?.coil ?? null;
}

/** The devices a body's coil shows it now, nearest first (none while it isn't up, or while an EMP has the body). */
export function coilMarks(sim: Sim, pawn: Pawn): CoilMark[] {
  const k = coilUp(sim.data, pawn);
  if (!k || pawn.state.jammed > 0) return [];
  const eye = eyePose(sim.data.movement, sim.data.hitboxes, pawn.state).pos;
  const [fx, fz] = forwardXZ(pawn.state.yaw);
  const half = Math.cos((k.fanDeg / 2) * DEG);
  /** How far it is, or −1 out of the coil's reach or fan. */
  const reach = (p: readonly number[]): number => {
    const v = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const d = Math.hypot(v[0], v[1], v[2]);
    if (d > k.rangeM) return -1;
    const across = Math.hypot(v[0], v[2]);
    return k.fanDeg < 360 && across > 0.3 && (v[0] * fx + v[2] * fz) / across < half ? -1 : d;
  };
  const out: CoilMark[] = [];
  for (const g of sim.gadgets.list) {
    if (g.team === pawn.team || g.flags & (GFlag.Flying | GFlag.Broken)) continue;
    const d = sim.data.gadgets.get(kindId(g.kind) ?? "");
    const dist = d?.electronic ? reach(g.pos) : -1;
    if (!d || dist < 0) continue;
    out.push({ key: `g${g.id}`, pos: [g.pos[0], g.pos[1], g.pos[2]], size: d.sizeM, yaw: g.yaw, flat: (g.flags & GFlag.Flat) !== 0, kind: g.kind, dist });
  }
  // The level's cameras are the defenders' (unbroken; one an attacker's Kludge hacked is his side's now).
  if (pawn.team !== DEFENSE) {
    const r = sim.matchRules;
    const side = CAMERA_HALF_M * 2;
    sim.level.def.cameras.forEach((cam, i) => {
      if (i >= 32 || (r.camsBroken | r.camsHacked) & (1 << i)) return;
      const dist = reach(cam.pos);
      if (dist >= 0) out.push({ key: `c${i}`, pos: [cam.pos[0], cam.pos[1], cam.pos[2]], size: [side, side, side], yaw: 0, flat: false, kind: -1, dist });
    });
  }
  // Bodies that are devices: their drones, and Twain's idle frame (her other body, empty).
  for (const p of sim.pawns.values()) {
    const s = p.state;
    if (p.team === pawn.team || s.mode === PawnMode.Dead || s.mode === PawnMode.Held) continue;
    const drone = p.kind === PawnKind.Drone;
    if (!drone && !isIdleShell(sim, p)) continue;
    const size: readonly [number, number, number] = drone ? sim.data.intel.drone.sizeM : [0.6, currentHeight(sim.data.movement, s), 0.6];
    const at: Vec3 = [s.x, s.y + size[1] / 2, s.z];
    const dist = reach(at);
    if (dist >= 0) out.push({ key: `p${p.id}`, pos: at, size, yaw: s.yaw, flat: false, kind: -1, dist });
  }
  return out.sort((a, b) => a.dist - b.dist || (a.key < b.key ? -1 : 1));
}
