// The dressing's validator (Phase 10 M6, render/DESIGN.md §9.2), without a GPU: every piece placed sits in its room;
// a wall's piece hangs on a hard wall (never a soft or reinforceable one), stands out of it only a little, and has
// nothing in front of it; a rug or a box lies on hard floor (never a soft floor or a hatch); a box is low (nothing a
// body could take for cover), against a hard wall, clear of furniture and stairs, and away from every opening's
// approach; the same pieces every time.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { loadArtData, Sim, type BuiltLevel, type Renderable } from "@redmond/shared";
import { boundsOf, buildDressing, CLUTTER_MAX_H, type Placed } from "../src/render/dressing.js";
import { LevelArt } from "../src/render/levelArt.js";
import type { TextureManifest, TextureSets } from "../src/render/textures.js";

const manifest = JSON.parse(readFileSync(new URL("../public/art/textures/manifest.json", import.meta.url), "utf8")) as TextureManifest;
const tex = () => new THREE.DataArrayTexture(new Uint8Array(4 * manifest.sets.length), 1, 1, manifest.sets.length);
const sets = (): TextureSets => ({
  color: tex(),
  normal: tex(),
  orm: tex(),
  layer: new Map(manifest.sets.map((s, i) => [s.id, i])),
  sizeM: new Map(manifest.sets.map((s) => [s.id, s.sizeM])),
  mean: new Map(manifest.sets.map((s) => [s.id, s.mean ?? ([0.5, 0.5, 0.5] as [number, number, number])])),
  size: 1,
  gpuBytes: 0,
});

let level: BuiltLevel | null = null;
async function oregon() {
  level ??= (await Sim.create("oregon")).level;
  return { level, art: new LevelArt(level, sets(), loadArtData()) };
}

const inside = (r: Renderable, x: number, y: number, z: number, pad = 0) => {
  const b = boundsOf(r);
  return x >= b.min[0] - pad && x <= b.max[0] + pad && y >= b.min[1] - pad && y <= b.max[1] + pad && z >= b.min[2] - pad && z <= b.max[2] + pad;
};

describe("the dressing (render/dressing.ts)", () => {
  it("every piece is where the rules let it be", async () => {
    const { level, art } = await oregon();
    const dressing = buildDressing(level, art, art.map!, true)!;
    const placed = dressing.placed;
    const hardWalls = level.renderables.filter((r) => r.visible && r.kind === "solid" && r.surface === "HARD_WALL" && !/^PROP_|^EXT_/.test(r.id));
    const softWalls = level.renderables.filter((r) => r.visible && (r.surface === "SOFT_WALL" || r.surface === "REINFORCEABLE"));
    const hardFloors = level.renderables.filter((r) => r.visible && r.surface === "HARD_FLOOR");
    const notFloors = level.renderables.filter((r) => r.visible && (r.surface === "SOFT_FLOOR" || r.surface === "HATCH"));
    const inTheWay = level.renderables.filter((r) => r.visible && (r.id.startsWith("PROP_") || r.kind === "stair_step" || r.kind === "ramp" || r.kind.startsWith("ladder")));
    // Every opening (a barricade's or a window's panel), as boxes.
    const openings = level.panels.list.filter((e) => e.panel.spec.construction.kind === "barricade" || e.panel.spec.construction.kind === "glass").map((e) => ({ min: e.min, max: e.max }));
    const rooms = new Map(level.def.rooms.map((r) => [r.id, r]));
    const floorOf = (room: string) => level.def.storeys.find((s) => s.id === rooms.get(room)!.storey)!.floorY;
    const problems: string[] = [];
    const fail = (p: Placed, what: string) => problems.push(`${p.kind} in ${p.room} at (${p.min.map((v) => v.toFixed(2)).join(", ")}): ${what}`);
    const hardFloorAt = (x: number, z: number, y: number) => hardFloors.some((f) => inside(f, x, y - 0.03, z)) && !notFloors.some((f) => inside(f, x, y - 0.03, z));

    for (const p of placed) {
      const room = rooms.get(p.room)!;
      const floorY = floorOf(p.room);
      const inRoom = (x: number, z: number, pad: number) => room.rects.some((r) => x >= r[0] - pad && x <= r[2] + pad && z >= r[1] - pad && z <= r[3] + pad);
      const [cx, cz] = [(p.min[0] + p.max[0]) / 2, (p.min[2] + p.max[2]) / 2];
      if (!inRoom(cx, cz, 0.4)) fail(p, "not in its room");
      if (p.run) {
        // Against a hard wall: just behind its back, along its width, at its height (a box: knee high and over it).
        const run = p.run;
        const behind = run.face - run.into * 0.05;
        const [a0, a1] = run.along === "x" ? [p.min[0], p.max[0]] : [p.min[2], p.max[2]];
        const ys = p.kind === "clutter" ? [floorY + 0.15, floorY + 1.0] : [(p.min[1] + p.max[1]) / 2];
        for (const t of [a0 + 0.02, (a0 + a1) / 2, a1 - 0.02])
          for (const y of ys) {
            const [x, z] = run.along === "x" ? [t, behind] : [behind, t];
            if (!hardWalls.some((w) => inside(w, x, y, z))) fail(p, `no hard wall behind at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
            if (softWalls.some((w) => inside(w, x, y, z))) fail(p, "on a soft wall");
          }
        const out = run.along === "x" ? p.max[2] - p.min[2] : p.max[0] - p.min[0];
        if (p.kind === "shelf") {
          if (out > 0.25 || p.min[1] - floorY < 1.5) fail(p, "a shelf deeper than 25 cm or lower than 1.5 m");
        } else if (p.kind !== "clutter" && out > 0.065) fail(p, `stands ${out.toFixed(3)} m out of its wall`);
        // Nothing in front of it.
        const front = run.along === "x" ? { x0: p.min[0], x1: p.max[0], z0: Math.min(run.face, run.face + run.into * 0.5), z1: Math.max(run.face, run.face + run.into * 0.5) } : { x0: Math.min(run.face, run.face + run.into * 0.5), x1: Math.max(run.face, run.face + run.into * 0.5), z0: p.min[2], z1: p.max[2] };
        for (const o of inTheWay) {
          const b = boundsOf(o);
          const pad = p.kind === "clutter" ? 0.05 : 0;
          if (b.min[0] < front.x1 + pad && b.max[0] > front.x0 - pad && b.min[2] < front.z1 + pad && b.max[2] > front.z0 - pad && b.min[1] < p.max[1] && b.max[1] > p.min[1]) fail(p, `in front of ${o.id}`);
        }
      }
      if (p.kind === "clutter" || p.kind === "rug") {
        // On hard floor, all of it.
        const corners: [number, number][] = [];
        if (p.rug) {
          const { center, size, yaw } = p.rug;
          for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
            const [lx, lz] = [(i * size[0]) / 2 * 0.98, (j * size[1]) / 2 * 0.98];
            corners.push([center[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw), center[2] - lx * Math.sin(yaw) + lz * Math.cos(yaw)]);
          }
        } else corners.push([p.min[0], p.min[2]], [p.max[0], p.min[2]], [p.min[0], p.max[2]], [p.max[0], p.max[2]], [cx, cz]);
        for (const [x, z] of corners) {
          if (!hardFloorAt(x, z, floorY)) fail(p, `not on hard floor at (${x.toFixed(2)}, ${z.toFixed(2)})`);
          if (!inRoom(x, z, 0.06)) fail(p, `out of its room at (${x.toFixed(2)}, ${z.toFixed(2)})`);
        }
        if (p.max[1] - floorY > (p.kind === "rug" ? 0.02 : CLUTTER_MAX_H + 0.001)) fail(p, `too tall (${(p.max[1] - floorY).toFixed(2)} m)`);
      }
      if (p.kind === "clutter") {
        // Away from every opening's approach (0.7 m, as D-104's door rule).
        for (const o of openings) {
          const dx = Math.max(o.min[0] - p.max[0], p.min[0] - o.max[0], 0);
          const dz = Math.max(o.min[2] - p.max[2], p.min[2] - o.max[2], 0);
          const dy = o.min[1] > p.max[1] + 2.5 || o.max[1] < floorY - 0.1;
          if (!dy && Math.hypot(dx, dz) < 0.7) fail(p, "in an opening's approach");
        }
        // An open passage along its wall: the wall is solid at 1 m for 0.7 m either side of it.
        const run = p.run!;
        const behind = run.face - run.into * 0.05;
        const [a0, a1] = run.along === "x" ? [p.min[0], p.max[0]] : [p.min[2], p.max[2]];
        for (let t = a0 - 0.7; t <= a1 + 0.7; t += 0.1) {
          const [x, z] = run.along === "x" ? [t, behind] : [behind, t];
          if (!hardWalls.some((w) => inside(w, x, floorY + 1.0, z))) fail(p, `a gap in its wall within 0.7 m (at ${t.toFixed(2)})`);
        }
      }
    }
    expect(problems.slice(0, 30).join("\n")).toBe("");
  }, 60_000);

  it("most of what each room's kit asks for is placed, the same every time", async () => {
    const { level, art } = await oregon();
    const a = buildDressing(level, art, art.map!, true)!;
    const b = buildDressing(level, art, art.map!, true)!;
    expect(b.placed).toEqual(a.placed);
    let asked = 0;
    for (const room of level.def.rooms) {
      const kit = art.map!.dressing?.[art.map!.rooms[room.id] ?? art.map!.default];
      if (kit) asked += Object.values(kit.wall ?? {}).reduce((s, n) => s + n, 0);
    }
    const walls = a.placed.filter((p) => p.kind !== "rug" && p.kind !== "clutter").length;
    expect(asked).toBeGreaterThan(60);
    expect(walls / asked).toBeGreaterThan(0.75);
    expect(a.placed.filter((p) => p.kind === "rug").length).toBeGreaterThanOrEqual(4);
    expect(a.placed.filter((p) => p.kind === "clutter").length).toBeGreaterThanOrEqual(8);
    // Medium leaves the clutter out.
    expect(buildDressing(level, art, art.map!, false)!.placed.some((p) => p.kind === "clutter")).toBe(false);
  }, 60_000);
});
