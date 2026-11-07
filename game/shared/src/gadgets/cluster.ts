// Fuze's Cluster Charge (Phase 8 M5; research/operators/fuze.md §3; data/gadgets/cluster_charge.json `cluster`):
// where its tube reaches behind it once set off (out of a wall's far face, down through a floor: bullets and blasts
// meet it there from the far side, gadgets/hits.ts and blast.ts), and the fan its grenades leave the tube in, from
// its placer's left to right (the official tip). The server drills and lets them out (gadgets/serve.ts); a client
// draws the tube.
import { DEG, forwardXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import { kindId } from "./kinds.js";
import { GFlag, type Gadget } from "./table.js";

export type ClusterData = NonNullable<GadgetData["cluster"]>;

/** Half the tube's width (metres; greybox). */
export const TUBE_HALF_M = 0.05;

/** An entry's gadget data and its cluster while it's set off (drilling, or letting its grenades out), or null. */
export function activeCluster(data: GameData, g: Gadget): { d: GadgetData; c: ClusterData } | null {
  if (!(g.flags & GFlag.Active)) return null;
  const d = data.gadgets.get(kindId(g.kind) ?? "");
  return d?.cluster ? { d, c: d.cluster } : null;
}

/** The way into the surface a placed entry is on: down for one lying flat on a floor, into its wall otherwise. */
export function behindOf(g: Pick<Gadget, "yaw" | "flags">): Vec3 {
  if (g.flags & GFlag.Flat) return [0, -1, 0];
  const [fx, fz] = forwardXZ(g.yaw);
  return [-fx, 0, -fz];
}

/** Where a set-off cluster charge's tube ends: `tubeM` behind its back, on the surface's far side. */
export function tubeTip(data: GameData, g: Gadget): Vec3 | null {
  const a = activeCluster(data, g);
  if (!a) return null;
  const b = behindOf(g);
  const k = a.d.sizeM[2] / 2 + a.c.tubeM;
  return [g.pos[0] + b[0] * k, g.pos[1] + b[1] * k, g.pos[2] + b[2] * k];
}

/** The tube's box in the entry's own frame (gadgets/hits.ts `localOf`: x right, y up, z out of its front): its centre and half sizes. */
export function tubeBox(data: GameData, g: Gadget): { center: Vec3; half: Vec3 } | null {
  const a = activeCluster(data, g);
  if (!a) return null;
  const mid = -(a.d.sizeM[2] / 2 + a.c.tubeM / 2);
  const len = a.c.tubeM / 2;
  return g.flags & GFlag.Flat ? { center: [0, mid, 0], half: [TUBE_HALF_M, len, TUBE_HALF_M] } : { center: [0, 0, mid], half: [TUBE_HALF_M, TUBE_HALF_M, len] };
}

/**
 * Grenade `i`'s velocity (of `c.count`) as it leaves the tube: across the fan from the placer's left to right, `upDeg`
 * above level out of a wall (the placer faced into it, so the far side's way), `downDeg` below it through a floor (his
 * own way at placing).
 */
export function fanVelocity(g: Pick<Gadget, "yaw" | "flags">, c: ClusterData, i: number): Vec3 {
  const flat = (g.flags & GFlag.Flat) !== 0;
  const ahead = flat ? g.yaw : g.yaw + Math.PI;
  const fan = c.fanDeg * DEG;
  // A larger yaw turns left: the first goes out at the fan's left edge.
  const yaw = c.count > 1 ? ahead + fan / 2 - (i * fan) / (c.count - 1) : ahead;
  const [fx, fz] = forwardXZ(yaw);
  const pitch = flat ? -c.downDeg * DEG : c.upDeg * DEG;
  const h = Math.cos(pitch) * c.speedMps;
  return [fx * h, Math.sin(pitch) * c.speedMps, fz * h];
}
