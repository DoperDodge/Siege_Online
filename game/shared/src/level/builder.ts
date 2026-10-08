// Turns a level definition (data/maps/<id>/layout.json) into Rapier colliders plus a render list.
// Server and client both call this, so what you see is exactly what you collide with.
import { DEG, forwardXZ, quatYawPitch, rotateXZ, type Vec3 } from "../core/math.js";
import { HELPER_GROUPS, STATIC_GROUPS, type Collider, type Rapier, type World } from "../physics/rapier.js";
import type { DestructionData, LevelDef, Surface } from "../data/schemas.js";
import { PanelSet } from "../destruction/panels.js";
import { constructionOf, panelSpec } from "../destruction/world.js";

export interface Renderable {
  id: string;
  /** A "panel" is drawn from its cells (level.panels.list[panel]); its box here is only where it stands. */
  kind: "solid" | "stair_step" | "ramp" | "ladder_rail" | "ladder_rung" | "panel";
  center: Vec3;
  size: Vec3;
  quat: [number, number, number, number];
  surface: Surface | "LADDER";
  visible: boolean;
  label?: string;
  panel?: number;
}

export interface SolidInfo {
  id: string;
  surface: Surface;
  vaultable: boolean;
}

export interface LadderRuntime {
  id: string;
  /** Bottom center of the ladder on the wall face. */
  base: Vec3;
  height: number;
  yaw: number;
  width: number;
  /** Unit horizontal vector pointing from the climber toward the wall. */
  forward: [number, number];
}

export interface BuiltLevel {
  def: LevelDef;
  renderables: Renderable[];
  ladders: LadderRuntime[];
  /** Keyed by collider handle (panels' movement boxes too). */
  solids: Map<number, SolidInfo>;
  /** Destructible surfaces (Phase 4): solids whose surface data/destruction.json builds as a panel. */
  panels: PanelSet;
}

/** `destruction`: build destructible surfaces as panels (without it every solid is plain geometry). */
export function buildLevel(R: Rapier, world: World, def: LevelDef, destruction?: DestructionData): BuiltLevel {
  const renderables: Renderable[] = [];
  const solids = new Map<number, SolidInfo>();
  const panels = new PanelSet(R, world, solids);

  const addBox = (
    info: SolidInfo,
    kind: Renderable["kind"],
    center: Vec3,
    size: Vec3,
    quat: [number, number, number, number],
    opts: { collides: boolean; visible: boolean; label?: string },
  ) => {
    if (opts.collides) {
      const desc = R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
        .setTranslation(center[0], center[1], center[2])
        .setRotation({ x: quat[0], y: quat[1], z: quat[2], w: quat[3] })
        .setCollisionGroups(opts.visible ? STATIC_GROUPS : HELPER_GROUPS); // invisible = a movement helper
      const c: Collider = world.createCollider(desc);
      solids.set(c.handle, info);
    }
    renderables.push({ id: info.id, kind, center, size, quat, surface: info.surface, visible: opts.visible, label: opts.label });
  };

  for (const s of def.solids) {
    const quat = quatYawPitch(s.yawDeg * DEG, 0);
    const info: SolidInfo = { id: s.id, surface: s.surface, vaultable: s.vaultable };
    const construction = destruction ? constructionOf(destruction, s) : null;
    if (destruction && construction) {
      // Its boxes are made in the same place in the level order a plain solid's would be.
      const { spec, frame } = panelSpec(destruction, s, panels.list.length, construction);
      panels.add(spec, frame, info);
      renderables.push({ id: s.id, kind: "panel", center: s.center, size: s.size, quat, surface: s.surface, visible: true, label: s.label, panel: spec.index });
      continue;
    }
    addBox(info, "solid", s.center, s.size, quat, { collides: true, visible: true, label: s.label });
  }

  // A ramp is a thin slab whose top surface starts on the ground at `start` and rises along yaw.
  const addRamp = (id: string, surface: Surface, start: Vec3, yaw: number, length: number, angle: number, width: number, visible: boolean, label?: string) => {
    const t = 0.2;
    // Local frame: ramp rises toward -Z. Offset from the slab center to its top low edge, after pitch.
    const ly = (t / 2) * Math.cos(angle) - (length / 2) * Math.sin(angle);
    const lz = (t / 2) * Math.sin(angle) + (length / 2) * Math.cos(angle);
    const [ox, oz] = rotateXZ(0, -lz, yaw);
    const center: Vec3 = [start[0] + ox, start[1] - ly, start[2] + oz];
    addBox({ id, surface, vaultable: false }, "ramp", center, [width, t, length], quatYawPitch(yaw, angle), { collides: true, visible, label });
  };

  for (const r of def.ramps) {
    addRamp(r.id, r.surface, r.start, r.yawDeg * DEG, r.length, r.angleDeg * DEG, r.width, true, r.label);
  }

  // Stairs: visible colliding steps plus an invisible ramp through the step nosings so movement is smooth.
  for (const st of def.stairs) {
    const yaw = st.yawDeg * DEG;
    const [fx, fz] = forwardXZ(yaw);
    const quat = quatYawPitch(yaw, 0);
    for (let i = 0; i < st.steps; i++) {
      const h = st.rise * (i + 1);
      const d = st.run * (i + 0.5);
      const center: Vec3 = [st.start[0] + fx * d, st.start[1] + h / 2, st.start[2] + fz * d];
      addBox({ id: `${st.id}_step${i}`, surface: st.surface, vaultable: false }, "stair_step", center, [st.width, h, st.run], quat, {
        collides: true,
        visible: true,
      });
    }
    const angle = Math.atan2(st.rise, st.run);
    const horiz = st.steps * st.run;
    const rampStart: Vec3 = [st.start[0] - fx * st.run, st.start[1], st.start[2] - fz * st.run];
    addRamp(`${st.id}_ramp`, st.surface, rampStart, yaw, Math.hypot(horiz, st.steps * st.rise), angle, st.width, false);
  }

  const ladders: LadderRuntime[] = [];
  for (const l of def.ladders) {
    const yaw = l.yawDeg * DEG;
    const forward = forwardXZ(yaw);
    ladders.push({ id: l.id, base: l.base, height: l.height, yaw, width: l.width, forward });
    // Visual only: two rails and rungs just off the wall face.
    const quat = quatYawPitch(yaw, 0);
    for (const side of [-1, 1]) {
      // Rails sit half a ladder-width to each side and 6 cm off the wall, rotated with the ladder.
      const [ox, oz] = rotateXZ((side * l.width) / 2, 0.06, yaw);
      renderables.push({
        id: `${l.id}_rail${side}`,
        kind: "ladder_rail",
        center: [l.base[0] + ox, l.base[1] + l.height / 2, l.base[2] + oz],
        size: [0.05, l.height, 0.05],
        quat,
        surface: "LADDER",
        visible: true,
        label: side === 1 ? l.label : undefined,
      });
    }
    const [cx, cz] = rotateXZ(0, 0.06, yaw);
    for (let y = 0.3; y < l.height; y += 0.3) {
      renderables.push({
        id: `${l.id}_rung${y.toFixed(1)}`,
        kind: "ladder_rung",
        center: [l.base[0] + cx, l.base[1] + y, l.base[2] + cz],
        size: [l.width, 0.04, 0.04],
        quat,
        surface: "LADDER",
        visible: true,
      });
    }
  }

  world.step(); // build the broad-phase so queries work immediately
  return { def, renderables, ladders, solids, panels };
}
