// Hit registration (Phase 3 M6; DECISIONS D-044, D-046): where each pellet of a shot goes and which bodies
// it damages, judged on the server against everyone as the shooter's client drew them (net/lagComp.ts).
// Pure: the room applies what this finds afterwards, in a fixed order, to the bodies as they are now
// (combat/apply.ts).
import type { Vec3 } from "../core/math.js";
import type { CombatData } from "../data/schemas.js";
import type { HitboxHistory, SentTicks } from "../net/lagComp.js";
import type { BodyPart } from "../player/hitboxes.js";
import { QUERY_BULLET } from "../physics/rapier.js";
import type { Sim } from "../sim.js";
import type { ResolvedDamage } from "../weapons/loadout.js";
import { bulletDamage, penetrationChain, type BodyHit, type BulletOptions, type Zone } from "./damage.js";

/**
 * Distance along a ray to the first level geometry that stops bullets, or null. That is all of it in
 * Phase 3 except movement helpers (the invisible ramp over a staircase); Phase 4's destruction lets bullets
 * through soft walls.
 */
export function traceStatic(sim: Sim, origin: Vec3, dir: Vec3, maxDist: number): number | null {
  const ray = new sim.R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] });
  const hit = sim.world.castRay(ray, maxDist, true, undefined, QUERY_BULLET);
  return hit ? hit.timeOfImpact : null;
}

export interface PelletPath {
  dir: Vec3;
  /** Where the level stopped it (metres along the ray), if within range. */
  wall: number | null;
  /** The bodies it damages, nearest first (penetration rules applied). */
  hits: BodyHit[];
  /** The first hitbox it entered, before penetration rules (the lab's shot readout). */
  first: { pawnId: number; part: BodyPart; t: number } | null;
  /** Where it ended: in the last body it damaged unless it went through, else at the level or the range limit. */
  end: number;
}

/**
 * Every pellet of a shot from `origin`: the level stops it, and the bodies along it at render time `tick`
 * (as the shooter's client drew them, from the snapshots it was `sent`) take hits by the weapon's
 * penetration rule. `ignore`: the shooter's own bodies and anyone already dead.
 */
export function tracePellets(
  sim: Sim,
  history: HitboxHistory,
  origin: Vec3,
  dirs: readonly Vec3[],
  tick: number,
  penetration: ResolvedDamage["penetration"],
  ignore: ReadonlySet<number>,
  sent?: SentTicks,
): PelletPath[] {
  const max = sim.data.combat.maxRangeM;
  return dirs.map((dir) => {
    const wall = traceStatic(sim, origin, dir, max);
    const bodies = history.raycastAll(origin, dir, wall ?? max, tick, ignore, sent);
    const hits = penetrationChain(sim.data.combat, penetration, bodies);
    const stopped = hits.length > 0 && penetration !== "full";
    const first = bodies[0] ? { pawnId: bodies[0].id, part: bodies[0].parts[0].part, t: bodies[0].parts[0].t } : null;
    return { dir, wall, hits, first, end: stopped ? hits[hits.length - 1].t : (wall ?? max) };
  });
}

/** What one shot does to one body: its pellets added up before the damage applies (a placeholder rule). */
export interface ShotOnBody {
  pawnId: number;
  kill: boolean;
  amount: number;
  headshot: boolean;
  /** The most serious zone any pellet reached (the hit marker shows it). */
  zone: Zone;
  pellets: number;
  /** Nearest pellet hit, metres from the eye. */
  distance: number;
}

const SEVERITY: readonly Zone[] = ["leg", "arm", "pelvis", "torso", "neck", "head"];

/**
 * The damage a shot's pellets do to each body they hit (combat/damage.ts per pellet, then summed per body:
 * research/OPEN_QUESTIONS.md). `opts` gives the friendly-fire scale and Skopós's idle-shell rule per body.
 * Bodies come out in the order the shot first reached them.
 */
export function shotOnBodies(combat: CombatData, damage: ResolvedDamage, paths: readonly PelletPath[], opts: (pawnId: number) => BulletOptions): ShotOnBody[] {
  const out = new Map<number, ShotOnBody>();
  for (const path of paths) {
    for (const h of path.hits) {
      const o = bulletDamage(combat, damage, h.t, h.zone, { ...opts(h.id), mult: h.mult });
      let b = out.get(h.id);
      if (!b) out.set(h.id, (b = { pawnId: h.id, kill: false, amount: 0, headshot: false, zone: h.zone, pellets: 0, distance: h.t }));
      if (o.kill) b.kill = true;
      else b.amount += o.amount;
      b.headshot ||= o.headshot;
      if (SEVERITY.indexOf(h.zone) > SEVERITY.indexOf(b.zone)) b.zone = h.zone;
      b.pellets++;
      b.distance = Math.min(b.distance, h.t);
    }
  }
  return [...out.values()];
}
