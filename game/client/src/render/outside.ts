// The outside's items as models (Phase 10 M5, render/DESIGN.md §8): each map's outside items (exterior.json) drawn as
// what it is — Millrace's bales, loading dock and brick walls (R2.3), its sheds, gate booth, containers and truck —
// built in code (kit.ts) to fill its box, which still collides (and is hidden while the art shows). What's drawn keeps
// to the box at a body's height; roofs may overhang a little above it.
import type { BuiltLevel, Renderable } from "@redmond/shared";
import { baleStack, seeded } from "./furniture.js";
import { Kit } from "./kit.js";
import type { LevelArt } from "./levelArt.js";

export type Model = (k: Kit, s: readonly [number, number, number], m: (material: string) => number, r: Renderable) => void;

/** A box's yaw from its quaternion (outside items turn about y only). */
function yawOf(q: readonly number[]): number {
  return 2 * Math.atan2(q[1], q[3]);
}

/** The model for a renderable by its id, or null. */
export function modelFor(id: string): Model | null {
  // Millrace's (R2.3): the yard's bales, the loading dock, the brick walls round the yard and along the river.
  if (/^EXT_BALES/.test(id)) return (k, s, m, r) => baleStack(k, s, m, seeded(r.id));
  if (/^EXT_DOCK/.test(id)) return dock;
  if (/^EXT_WALL_(RIVER|YARD)/.test(id)) return brickWall;
  if (/^EXT_SHED/.test(id)) return (k, s, m, r) => shed(k, s, m, "metal_rust", r);
  if (/^EXT_BOOTH/.test(id)) return booth;
  if (/^EXT_CONTAINER/.test(id)) return container;
  if (/^EXT_TRUCK/.test(id)) return truck;
  return null;
}

/**
 * Every outside item with a model, built into one geometry (in the world); and the ids of the boxes they stand for (the
 * art hides those boxes).
 */
export function buildOutside(level: BuiltLevel, art: LevelArt): { kit: Kit; ids: Set<string> } {
  const kit = new Kit();
  const ids = new Set<string>();
  const m = (material: string) => art.fixedStyle(material);
  for (const r of level.renderables) {
    if (!r.visible || r.kind !== "solid") continue;
    const model = modelFor(r.id);
    if (!model) continue;
    kit.place([r.center[0], r.center[1], r.center[2]], yawOf(r.quat));
    model(kit, [r.size[0], r.size[1], r.size[2]], m, r);
    ids.add(r.id);
  }
  return { kit, ids };
}

/** Run a model along its box's longer horizontal side: x is the length (the kit turned a quarter if z is longer). */
function lengthwise(k: Kit, s: readonly [number, number, number], r: Renderable, build: (len: number, h: number, depth: number) => void): void {
  if (s[2] > s[0]) {
    k.place([r.center[0], r.center[1], r.center[2]], yawOf(r.quat) + Math.PI / 2);
    build(s[2], s[1], s[0]);
  } else build(s[0], s[1], s[2]);
}

/**
 * A loading dock: a concrete platform its whole box, a steel angle along its top edges, rubber bumpers down the face
 * the lorries back onto (the long side away from the building: −z here), a steel ladder up that face, and yellow
 * bollards along the top's back edge.
 */
const dock: Model = (k, s, m, r) => {
  lengthwise(k, s, r, (len, h, dep) => {
    const y0 = -h / 2;
    k.box([0, 0, 0], [len, h, dep], m("concrete_wall"));
    for (const sz of [-1, 1]) k.box([0, h / 2 - 0.03, sz * (dep / 2 - 0.02)], [len, 0.06, 0.05], m("steel"));
    for (let x = -len / 2 + 1.5; x <= len / 2 - 1.5 + 1e-6; x += 3) k.box([x, y0 + h * 0.55, -dep / 2 - 0.03], [0.3, 0.45, 0.06], m("rubber"));
    const lx = len / 2 - 0.8;
    for (const dx of [-0.2, 0.2]) k.box([lx + dx, 0, -dep / 2 - 0.025], [0.04, h, 0.05], m("steel"));
    for (let y = y0 + 0.25; y < h / 2 - 0.1; y += 0.28) k.box([lx, y, -dep / 2 - 0.03], [0.4, 0.03, 0.04], m("steel"));
    for (let x = -len / 2 + 2; x <= len / 2 - 2 + 1e-6; x += 6) k.cylinder([x, h / 2 + 0.3, dep / 2 - 0.3], 0.12, 0.6, "y", m("metal_yellow"), 12);
  });
};

/** A brick wall: piers every 3 m or so standing a little proud, a stone coping along its top. */
const brickWall: Model = (k, s, m, r) => {
  lengthwise(k, s, r, (len, h, dep) => {
    k.box([0, -0.05, 0], [len, h - 0.1, dep - 0.1], m("brick"));
    k.box([0, h / 2 - 0.05, 0], [len, 0.1, dep], m("concrete_wall"));
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) k.box([-len / 2 + 0.25 + ((len - 0.5) * i) / n, -0.05, 0], [0.5, h - 0.1, dep], m("brick"));
  });
};

function shed(k: Kit, s: readonly [number, number, number], m: (x: string) => number, wall: string, r: Renderable): void {
  lengthwise(k, s, r, (len, h, dep) => {
    const wallH = h - 0.4;
    const y0 = -h / 2;
    // Walls, a gable roof along the long side over them, a door on a long side, corner posts.
    k.box([0, y0 + wallH / 2, 0], [len, wallH, dep], m(wall));
    k.gable([0, y0 + wallH, 0], len, dep, 0.5, 0.05, m("metal_galvanized"), 0.18);
    k.gableEnds([0, y0 + wallH, 0], len, dep, 0.5, m(wall));
    k.box([-len * 0.2, y0 + 1.0, dep / 2 + 0.015], [1.0, 2.0, 0.03], m("metal_galvanized"));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (len / 2 - 0.04), y0 + wallH / 2, sz * (dep / 2 - 0.04)], [0.1, wallH, 0.1], m("lumber"));
  });
}

const booth: Model = (k, s, m) => {
  const [w, h, d] = s;
  const y0 = -h / 2;
  k.box([0, y0 + 0.5, 0], [w, 1.0, d], m("siding_white"));
  // Windows all round from 1 m to 1.9 m, posts at the corners, a flat roof over it.
  k.box([0, y0 + 1.45, 0], [w - 0.06, 0.9, d - 0.06], m("glass_dark"));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (w / 2 - 0.05), y0 + 1.45, sz * (d / 2 - 0.05)], [0.1, 0.9, 0.1], m("paint_white"));
  k.box([0, y0 + 2.0, 0], [w, 0.2, d], m("siding_white"));
  k.box([0, y0 + h - 0.05, 0], [w + 0.3, 0.1, d + 0.3], m("metal_galvanized"));
};

const container: Model = (k, s, m, r) =>
  lengthwise(k, s, r, (len, h, dep) => {
    const y0 = -h / 2;
    k.box([0, 0, 0], [len - 0.06, h - 0.06, dep - 0.06], m("metal_green"));
    const edge = m("paint_green");
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) k.box([0, sy * (h / 2 - 0.05), sz * (dep / 2 - 0.05)], [len, 0.1, 0.1], edge);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (len / 2 - 0.05), 0, sz * (dep / 2 - 0.05)], [0.1, h, 0.1], edge);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.box([sx * (len / 2 - 0.05), sy * (h / 2 - 0.05), 0], [0.1, 0.1, dep], edge);
    // Door rods on its end.
    for (const z of [-dep * 0.3, -dep * 0.1, dep * 0.1, dep * 0.3]) k.box([len / 2 + 0.01, y0 + h / 2, z], [0.03, h - 0.3, 0.035], m("steel"));
  });

/**
 * What's under a vehicle down to the ground, dark (the underside in its shadow): its box stops bullets and drones
 * all the way down, so nothing shows through under it. Just inside the wheels' outer faces (`wheelIn`: how far in
 * from the side they are), so the wheels stand in front of it.
 */
function underbody(k: Kit, len: number, w: number, y0: number, height: number, wheelIn: number, m: (x: string) => number): void {
  k.box([0, y0 + height / 2, 0], [len - 0.1, height, w - 2 * (wheelIn + 0.01)], m("paint_black"));
}

const truck: Model = (k, s, m) => {
  const [len, h, w] = s;
  const y0 = -h / 2;
  // A box truck: the cab at +x, the box behind it full height.
  k.box([-0.75, y0 + 0.4 + (h - 0.4) / 2, 0], [len - 1.5, h - 0.4, w], m("plastic_white"));
  k.box([len / 2 - 0.8, y0 + 0.4 + 0.85, 0], [1.6, 1.7, w - 0.1], m("paint_red"));
  k.box([len / 2 - 0.25, y0 + 1.6, 0], [0.05, 0.6, w - 0.2], m("glass_dark"));
  for (const side of [-1, 1]) for (const x of [len / 2 - 0.9, -len / 2 + 1.0, -len / 2 + 2.0]) k.cylinder([x, y0 + 0.42, side * (w / 2 - 0.2)], 0.42, 0.28, "z", m("rubber"), 14);
  underbody(k, len, w, y0, 0.4, 0.06, m);
};
