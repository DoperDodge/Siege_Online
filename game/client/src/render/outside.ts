// The outside's items as models (Phase 10 M5, render/DESIGN.md §8): each of Oregon's outside items (exterior.json, D-099)
// drawn as what it is — fences, sheds, silos, tanks, trailers, the container, the bus, vans, cars, the truck, wrecks, the
// excavator, the generator, reels, lumber, tyres, garden beds, the greenhouse — built in code (kit.ts) to fill its box,
// which still collides (and is hidden while the art shows). What's drawn keeps to the box at a body's height: a round
// silo or tank stands on a square plinth filling its box's corners up there; roofs may overhang a little above it.
import type { BuiltLevel, Renderable } from "@redmond/shared";
import { Kit } from "./kit.js";
import type { LevelArt } from "./levelArt.js";

export type Model = (k: Kit, s: readonly [number, number, number], m: (material: string) => number, r: Renderable) => void;

/** A box's yaw from its quaternion (outside items turn about y only). */
function yawOf(q: readonly number[]): number {
  return 2 * Math.atan2(q[1], q[3]);
}

/** The model for a renderable by its id, or null. */
export function modelFor(id: string): Model | null {
  if (/^EXT_FENCE/.test(id)) return fence;
  if (/^EXT_(WALL_S|BLOCKS)/.test(id)) return blockWall;
  if (/^EXT_SHED_E/.test(id)) return (k, s, m, r) => shed(k, s, m, "metal_orange", r);
  if (/^EXT_SHED/.test(id)) return (k, s, m, r) => shed(k, s, m, "metal_rust", r);
  if (/^EXT_BOOTH/.test(id)) return booth;
  if (/^EXT_SILO/.test(id)) return silo;
  if (/^EXT_TANK_GREEN/.test(id)) return (k, s, m) => tank(k, s, m, "paint_green");
  if (/^EXT_TANK/.test(id)) return (k, s, m) => tank(k, s, m, "metal_galvanized");
  if (/^EXT_TRAILER/.test(id)) return trailer;
  if (/^EXT_CONTAINER/.test(id)) return container;
  if (/^EXT_BUS/.test(id)) return bus;
  if (/^EXT_VAN/.test(id)) return (k, s, m) => van(k, s, m, id.endsWith("B") ? "paint_blue" : "paint_van");
  if (/^EXT_TRUCK/.test(id)) return truck;
  if (/^EXT_CAR/.test(id)) return (k, s, m) => car(k, s, m, /S1$/.test(id) ? "paint_red" : /S2$/.test(id) ? "paint_blue" : "paint_green", false);
  if (/^EXT_WRECK/.test(id)) return (k, s, m) => car(k, s, m, "rust", true);
  if (/^EXT_JY_TOWER/.test(id)) return junkStack;
  if (/^EXT_EXCAVATOR\.arm/.test(id)) return excavatorArm;
  if (/^EXT_EXCAVATOR$/.test(id)) return excavator;
  if (/^EXT_GENERATOR/.test(id)) return generator;
  if (/^EXT_REEL/.test(id)) return reel;
  if (/^EXT_LUMBER/.test(id)) return lumber;
  if (/^EXT_TYRES/.test(id)) return tyres;
  if (/^EXT_BED#/.test(id)) return gardenBed;
  if (/^EXT_(BED_NE|GARDEN)/.test(id)) return plankWall;
  if (/^EXT_GREENHOUSE/.test(id)) return greenhouse;
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

const fence: Model = (k, s, m, r) =>
  lengthwise(k, s, r, (len, h, depth) => {
    const wood = m("wood_fence");
    const post = m("lumber");
    const y0 = -h / 2;
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) k.box([-len / 2 + (i * len) / n, 0.02, 0], [0.09, h + 0.04, Math.min(0.09, depth)], post);
    for (const at of [0.22, 0.78]) k.box([0, y0 + at * h, -depth * 0.25], [len, 0.07, 0.04], post);
    const pitch = 0.145;
    const count = Math.max(1, Math.floor(len / pitch));
    for (let i = 0; i < count; i++) {
      const x = -len / 2 + (i + 0.5) * (len / count);
      // A little ragged: pickets of slightly different heights, the odd one missing.
      if ((i * 7919) % 23 === 0) continue;
      const hh = h - 0.04 - ((i * 37) % 5) * 0.012;
      k.box([x, y0 + hh / 2, depth * 0.2], [0.12, hh, 0.025], wood);
    }
  });

const blockWall: Model = (k, s, m) => {
  k.box([0, -0.03, 0], [s[0], s[1] - 0.06, s[2]], m("concrete_painted"));
  k.box([0, s[1] / 2 - 0.03, 0], [s[0] + 0.03, 0.06, s[2] + 0.04], m("concrete_wall"));
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

const silo: Model = (k, s, m) => {
  const [w, h, d] = s;
  const y0 = -h / 2;
  const r = Math.min(w, d) / 2;
  const plinth = 1.9;
  k.box([0, y0 + plinth / 2, 0], [w, plinth, d], m("concrete_wall"));
  const body = h - plinth - 0.7;
  k.cylinder([0, y0 + plinth + body / 2, 0], r * 0.97, body, "y", m("concrete_wall"), 28);
  k.cylinder([0, y0 + plinth + body + 0.35, 0], r * 0.99, 0.7, "y", m("metal_galvanized"), 28, true, r * 0.25);
  // A cage ladder up its side, bands round it.
  for (const dx of [-0.22, 0.22]) k.box([dx, y0 + plinth + body / 2, r * 0.97 + 0.02], [0.04, body, 0.04], m("steel"));
  for (let i = 1; i < 6; i++) k.cylinder([0, y0 + plinth + (i * body) / 6, 0], r * 0.985, 0.08, "y", m("steel"), 28, false);
};

function tank(k: Kit, s: readonly [number, number, number], m: (x: string) => number, paint: string): void {
  const [w, h, d] = s;
  const y0 = -h / 2;
  const r = Math.min(w, d) / 2;
  const plinth = Math.min(1.6, h * 0.45);
  k.box([0, y0 + plinth / 2, 0], [w, plinth, d], m("concrete_painted"));
  const body = h - plinth - 0.25;
  k.cylinder([0, y0 + plinth + body / 2, 0], r * 0.96, body, "y", m(paint), 24);
  k.cylinder([0, y0 + plinth + body + 0.125, 0], r * 0.96, 0.25, "y", m(paint), 24, true, r * 0.3);
}

const trailer: Model = (k, s, m, r) =>
  lengthwise(k, s, r, (len, h, dep) => {
    const y0 = -h / 2;
    k.box([0, y0 + 0.25, 0], [len - 0.2, 0.5, dep - 0.2], m("paint_black"));
    k.box([0, y0 + 0.5 + (h - 0.7) / 2, 0], [len, h - 0.7, dep], m("siding_white"));
    k.box([0, y0 + h - 0.1, 0], [len + 0.06, 0.2, dep + 0.06], m("metal_galvanized"));
    for (const side of [-1, 1]) for (const x of [-len * 0.3, len * 0.05, len * 0.32]) k.box([x, y0 + 1.6, side * (dep / 2 + 0.01)], [0.9, 0.7, 0.03], m("glass_dark"));
    k.box([len * 0.2 - len / 2 + 0.6, y0 + 1.2, dep / 2 + 0.012], [0.8, 1.8, 0.03], m("paint_blue"));
  });

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

/** The school bus wreck: on its side (its box is lower than a bus is tall, and wider), its roof one way, its wheels the other. */
const bus: Model = (k, s, m) => {
  const [len, h, w] = s; // h: the bus's width lying down; w: its height
  const yellow = m("paint_bus");
  const black = m("paint_black");
  const glass = m("glass_dark");
  // The body (its "up" along -z: the roof toward -z), a little clear of the ground.
  k.box([0.6, 0.02, 0.15], [len - 1.4, h - 0.1, w - 0.6], yellow);
  // The hood at the front (+x), lower.
  k.box([len / 2 - 0.65, 0.02, 0.55], [1.3, h - 0.5, w - 1.4], yellow);
  // The roof: a lighter band along -z.
  k.box([0.6, 0.02, -w / 2 + 0.3], [len - 1.5, h - 0.4, 0.1], m("paint_van"));
  // Windows down both sides (now facing up and down), the windscreen.
  for (const sy of [-1, 1]) for (let i = 0; i < 8; i++) k.box([-len / 2 + 1.0 + i * ((len - 2.6) / 8), sy * ((h - 0.1) / 2 + 0.01), -0.35], [((len - 2.6) / 8) * 0.8, 0.03, 0.75], glass);
  k.box([len / 2 - 1.32, 0.02, -0.2], [0.04, h - 0.4, 0.9], glass);
  // Black stripes, the bumper, wheels on its underside (+z, now the side in the air).
  for (const sy of [-1, 1]) k.box([0.3, sy * ((h - 0.1) / 2 + 0.012), 0.55], [len - 1.2, 0.025, 0.08], black);
  k.box([len / 2 - 0.05, 0.02, 0.9], [0.1, h - 0.3, 0.25], black);
  for (const x of [len / 2 - 1.6, -len / 2 + 1.6, -len / 2 + 2.6]) for (const sy of [-1, 1]) k.cylinder([x, sy * (h / 2 - 0.45), w / 2 - 0.15], 0.5, 0.3, "z", m("rubber"), 14);
};

function van(k: Kit, s: readonly [number, number, number], m: (x: string) => number, paint: string): void {
  const [len, h, w] = s;
  const y0 = -h / 2;
  const body = m(paint);
  k.box([-0.25, y0 + 0.35 + (h - 0.4) / 2, 0], [len - 0.5, h - 0.4, w], body);
  // The cab's nose, lower and short, at +x; the windscreen sloping back over it.
  k.box([len / 2 - 0.35, y0 + 0.35 + 0.55, 0], [0.7, 1.1, w - 0.1], body);
  k.box([len / 2 - 0.62, y0 + 1.75, 0], [0.06, 0.75, w - 0.16], m("glass_dark"));
  for (const side of [-1, 1]) {
    k.box([len / 2 - 1.2, y0 + 1.7, side * (w / 2 + 0.01)], [0.9, 0.6, 0.02], m("glass_dark"));
    for (const x of [len / 2 - 1.1, -len / 2 + 1.1]) k.cylinder([x, y0 + 0.36, side * (w / 2 - 0.2)], 0.36, 0.25, "z", m("rubber"), 14);
  }
  k.box([len / 2 + 0.02, y0 + 0.45, 0], [0.08, 0.25, w], m("paint_black"));
  k.box([-len / 2 - 0.02, y0 + 0.45, 0], [0.08, 0.25, w], m("paint_black"));
}

const truck: Model = (k, s, m) => {
  const [len, h, w] = s;
  const y0 = -h / 2;
  // A box truck: the cab at +x, the box behind it full height.
  k.box([-0.75, y0 + 0.4 + (h - 0.4) / 2, 0], [len - 1.5, h - 0.4, w], m("plastic_white"));
  k.box([len / 2 - 0.8, y0 + 0.4 + 0.85, 0], [1.6, 1.7, w - 0.1], m("paint_red"));
  k.box([len / 2 - 0.25, y0 + 1.6, 0], [0.05, 0.6, w - 0.2], m("glass_dark"));
  for (const side of [-1, 1]) for (const x of [len / 2 - 0.9, -len / 2 + 1.0, -len / 2 + 2.0]) k.cylinder([x, y0 + 0.42, side * (w / 2 - 0.2)], 0.42, 0.28, "z", m("rubber"), 14);
};

function car(k: Kit, s: readonly [number, number, number], m: (x: string) => number, paint: string, wreck: boolean): void {
  const [len, h, w] = s;
  const y0 = -h / 2;
  const body = m(paint);
  const lower = Math.min(0.75, h * 0.5);
  k.box([0, y0 + 0.22 + lower / 2, 0], [len, lower, w], body);
  // The cabin, a little in from the ends and sides.
  const cabH = h - 0.22 - lower - 0.02;
  k.box([-len * 0.06, y0 + 0.22 + lower + cabH / 2, 0], [len * 0.62, cabH, w - 0.14], wreck ? body : m("glass_dark"));
  k.box([-len * 0.06, y0 + 0.22 + lower + cabH - 0.04, 0], [len * 0.6, 0.08, w - 0.16], body);
  for (const sx of [-1, 1]) for (const side of [-1, 1]) {
    const flat = wreck && sx < 0 ? 0.12 : 0;
    k.cylinder([sx * (len / 2 - 0.65), y0 + 0.31 - flat / 2, side * (w / 2 - 0.15)], 0.31, 0.22, "z", m("rubber"), 12);
  }
  if (!wreck) {
    k.box([len / 2 + 0.02, y0 + 0.4, 0], [0.06, 0.18, w], m("paint_black"));
    k.box([-len / 2 - 0.02, y0 + 0.4, 0], [0.06, 0.18, w], m("paint_black"));
  }
}

const junkStack: Model = (k, s, m) => {
  const [w, h, d] = s;
  const y0 = -h / 2;
  const paints = ["rust", "paint_blue", "rust", "paint_red"];
  const n = 4;
  for (let i = 0; i < n; i++) k.box([(i % 2 ? 0.06 : -0.06), y0 + (i + 0.5) * (h / n), (i % 3) * 0.05 - 0.05], [w - 0.15, h / n - 0.03, d - 0.12], m(paints[i]));
};

const excavator: Model = (k, s, m) => {
  const [w, h, d] = s;
  const y0 = -h / 2;
  const yellow = m("paint_bus");
  // Two tracks along z, the turntable and body, the cab with its glass, the counterweight.
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - 0.45), y0 + 0.45, 0], [0.9, 0.9, d], m("paint_black"));
  k.box([0, y0 + 1.05, 0], [w * 0.7, 0.3, d * 0.6], m("steel"));
  k.box([0, y0 + 1.65, -0.3], [w - 0.2, 0.9, d * 0.7], yellow);
  k.box([w / 2 - 0.85, y0 + 2.5, d * 0.12], [1.4, 0.95, 1.6], yellow);
  k.box([w / 2 - 0.85, y0 + 2.55, d * 0.12 + 0.81], [1.2, 0.7, 0.03], m("glass_dark"));
  k.box([w / 2 - 0.15, y0 + 2.55, d * 0.12], [0.03, 0.7, 1.4], m("glass_dark"));
  k.box([0, y0 + 2.05, -d * 0.36], [w - 0.4, 0.8, 0.5], yellow);
};

const excavatorArm: Model = (k, s, m) => {
  const [w, h, d] = s;
  const y0 = -h / 2;
  const yellow = m("paint_bus");
  // The boom lying along z, its stick, the bucket at the far end.
  k.box([0, y0 + 0.35, -d * 0.2], [w * 0.5, 0.7, d * 0.6], yellow);
  k.box([0, y0 + 0.3, d * 0.25], [w * 0.4, 0.55, d * 0.35], yellow);
  k.box([0, y0 + 0.6, d / 2 - 0.5], [w, 1.2, 0.9], m("steel"));
};

const generator: Model = (k, s, m) => {
  const [w, h, d] = s;
  const y0 = -h / 2;
  k.box([0, y0 + 0.12, 0], [w, 0.24, d], m("paint_black"));
  k.box([0, y0 + 0.24 + (h - 0.5) / 2, 0], [w - 0.1, h - 0.5, d - 0.1], m("paint_green"));
  for (let i = 0; i < 5; i++) k.box([-w / 2 + 0.3 + i * 0.25, y0 + h * 0.55, d / 2 - 0.04], [0.12, h * 0.4, 0.02], m("paint_black"));
  k.cylinder([w * 0.3, y0 + h - 0.1, -d * 0.25], 0.08, 0.5, "y", m("steel"), 10);
};

const reel: Model = (k, s, m) => {
  const [w, h, d] = s;
  const y0 = -h / 2;
  const r = h / 2;
  // Two cable reels on their sides, their axles along z.
  for (const x of [-w / 4, w / 4]) {
    for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) k.cylinder([x, y0 + r, z], r, 0.08, "z", m("lumber"), 16);
    k.cylinder([x, y0 + r, 0], r * 0.55, d - 0.14, "z", m("paint_black"), 14);
  }
};

const lumber: Model = (k, s, m, r) =>
  lengthwise(k, s, r, (len, h, dep) => {
    const y0 = -h / 2;
    const rows = Math.max(1, Math.round(h / 0.1));
    const per = Math.max(1, Math.round(dep / 0.15));
    for (let j = 0; j < rows; j++) for (let i = 0; i < per; i++) {
      const jitter = ((i * 31 + j * 17) % 7) * 0.02;
      k.box([jitter - 0.06, y0 + (j + 0.5) * (h / rows), -dep / 2 + (i + 0.5) * (dep / per)], [len - 0.15, h / rows - 0.008, dep / per - 0.01], m("lumber"));
    }
  });

const tyres: Model = (k, s, m, r) =>
  lengthwise(k, s, r, (len, h, dep) => {
    const y0 = -h / 2;
    // A row of stacks along its length, as wide as it is deep, stacked to its height.
    const rad = Math.min(dep / 2, 0.45);
    const stacks = Math.max(1, Math.floor(len / (2 * rad)));
    const n = Math.max(1, Math.round(h / 0.22));
    for (let j = 0; j < stacks; j++)
      for (let i = 0; i < n - (j % 3 === 1 ? 1 : 0); i++) k.cylinder([-len / 2 + (j + 0.5) * (len / stacks), y0 + (i + 0.5) * (h / n), ((i * 13 + j * 7) % 3) * 0.02 - 0.02], rad * 0.95, h / n - 0.01, "y", m("rubber"), 14);
  });

const gardenBed: Model = (k, s, m) => {
  const [w, h, d] = s;
  const y0 = -h / 2;
  const t = 0.05;
  for (const sz of [-1, 1]) k.box([0, 0, sz * (d / 2 - t / 2)], [w, h, t], m("planks_raw"));
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - t / 2), 0, 0], [t, h, d - 2 * t], m("planks_raw"));
  k.box([0, y0 + h - 0.06, 0], [w - 2 * t, 0.02, d - 2 * t], m("ground_dirt"));
  k.box([0, y0 + (h - 0.08) / 2, 0], [w - 2 * t, h - 0.08, d - 2 * t], m("ground_dirt"));
};

const plankWall: Model = (k, s, m) => {
  k.box([0, 0, 0], [s[0], s[1], s[2]], m("planks_raw"));
  k.box([0, s[1] / 2 + 0.015, 0], [s[0] + 0.02, 0.03, s[2] + 0.04], m("lumber"));
};

const greenhouse: Model = (k, s, m, r) =>
  lengthwise(k, s, r, (len, h, dep) => {
    const y0 = -h / 2;
    const wallH = h - 1.1;
    const frame = m("metal_galvanized");
    const panel = m("plastic_white");
    // Low concrete footing, plastic walls between posts, a gable roof of plastic on a frame.
    k.box([0, y0 + 0.2, 0], [len, 0.4, dep], m("concrete_painted"));
    k.box([0, y0 + 0.4 + (wallH - 0.4) / 2, 0], [len - 0.04, wallH - 0.4, dep - 0.04], panel);
    const n = Math.max(2, Math.round(len / 2));
    for (let i = 0; i <= n; i++) for (const sz of [-1, 1]) k.box([-len / 2 + (i * len) / n, y0 + wallH / 2, sz * (dep / 2 - 0.02)], [0.06, wallH, 0.06], frame);
    k.gable([0, y0 + wallH, 0], len, dep, 1.1, 0.03, panel, 0.05);
    k.gableEnds([0, y0 + wallH, 0], len, dep, 1.1, panel);
    k.box([0, y0 + wallH + 1.08, 0], [len + 0.1, 0.06, 0.08], frame);
  });
