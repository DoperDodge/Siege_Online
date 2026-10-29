// A map's markers (Phase 5 M5, tools/mapgen/DESIGN.md E9 part 2), without a GPU: the bombs, cameras,
// ingredients and spawns, each with the storey it stands on and its name with that storey's labels; a camera's
// cone from the camera the way it looks; the zones view (rappel faces, spawn peeks, run-outs) hidden until it is
// switched on; a few instanced meshes, not one per marker.
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildLevel, initRapier, levelSchema, loadGameData, type BuiltLevel } from "@redmond/shared";
import { createLabScene } from "../src/render/labScene.js";
import { MapMarkers } from "../src/render/mapMarkers.js";

const data = loadGameData();

beforeAll(() => {
  // Labels are drawn on canvases, which Node lacks: these draw nothing.
  const g = new Proxy({}, { get: (_t, key) => (key === "measureText" ? (text: string) => ({ width: 12 * text.length }) : () => {}) });
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
});

/** B, 1F and 2F; a site on 2F, cameras on 1F and B, an extinguisher and a gas pipe, three kinds of spawn and every kind of zone. */
async function map(): Promise<BuiltLevel> {
  const R = await initRapier();
  const def = levelSchema.parse({
    id: "map",
    name: "Map",
    spawns: [
      { id: "lab", pos: [0, 0, 0], yawDeg: 0 },
      { id: "A", pos: [-20, 0, 20], yawDeg: 45, side: "attack", group: "A_YARD" },
      { id: "A.2", pos: [-21, 0, 20], yawDeg: 45, side: "attack", group: "A_YARD" },
      { id: "D", pos: [2, 3.2, 2], yawDeg: 90, side: "defense", group: "SITE_LOFT" },
    ],
    storeys: [
      { id: "B", floorY: -3.2, ceilingY: -0.2 },
      { id: "1F", floorY: 0, ceilingY: 3 },
      { id: "2F", floorY: 3.2, ceilingY: 6 },
    ],
    solids: [{ id: "ground", center: [0, -0.1, 0], size: [60, 0.2, 60], surface: "HARD_FLOOR" }],
    rooms: [{ id: "2F_LOFT", callout: "Loft", storey: "2F", rects: [[-10, -10, 10, 10]], anchor: [0, 3.2, 0] }],
    sites: [{ id: "SITE_LOFT", name: "2F Loft", rooms: ["2F_LOFT"], bombs: [{ id: "1A", pos: [1, 3.2, 1], room: "2F_LOFT" }, { id: "1B", pos: [5, 3.2, 1], room: "2F_LOFT" }], plantMarginM: 0.5 }],
    cameras: [
      { id: "CAM1", pos: [4, 2.7, -5], yawDeg: 90, pitchDeg: -20 },
      { id: "CAM2", pos: [0, -0.5, 4], yawDeg: 0, pitchDeg: -20 },
    ],
    ingredients: [
      { id: "ING1", kind: "fire_extinguisher", pos: [3, 1, 3], yawDeg: 180 },
      { id: "ING2", kind: "gas_pipe", pos: [3, 4.4, 3], yawDeg: -90 },
    ],
    zones: [
      { id: "building:1F", kind: "building", boxes: [{ center: [0, 1.6, 0], size: [20, 3.2, 20] }] },
      { id: "H1", kind: "drone_hole", boxes: [{ center: [0, 0.1, 10], size: [0.4, 0.2, 0.3] }] },
      { id: "rappel:1F:N01", kind: "rappel", boxes: [{ center: [0, 1.6, -10.025], size: [20, 3.2, 0.05] }], normal: [0, 0, -1] },
      { id: "rappel:2F:N01", kind: "rappel", boxes: [{ center: [0, 4.7, -10.025], size: [20, 3, 0.05] }], normal: [0, 0, -1] },
      { id: "PEEK:o1", kind: "spawn_peek", boxes: [{ center: [-9, 1.05, 5], size: [1.5, 2.1, 1.2] }], normal: [-1, 0, 0], faces: "A_YARD" },
      { id: "RUN:o2", kind: "out_of_bounds", boxes: [{ center: [0, -2.15, 10.9], size: [1.2, 2.1, 1.5] }], normal: [0, 0, 1] },
    ],
  });
  return buildLevel(R, new R.World({ x: 0, y: -9.81, z: 0 }), def, data.destruction);
}

/** The markers' meshes in a group, by name. */
const markerMeshes = (g: THREE.Group) => g.children.filter((o): o is THREE.InstancedMesh => o.name.startsWith("marker:"));
const storeyNames = (lab: ReturnType<typeof createLabScene>, kind: string) => lab.storeys.map((g) => markerMeshes(g).filter((m) => m.name.startsWith(`marker:${kind}:`)).reduce((n, m) => n + m.count, 0));

describe("a map's markers", () => {
  it("draws the bombs, cameras, ingredients and spawns on the storeys they stand on, each named with its storey's labels", async () => {
    const level = await map();
    const lab = createLabScene(level);
    const before = lab.labels.length;
    const markers = new MapMarkers(lab, level.def);
    // What the scene holds: a bomb case each, a box and a cone a camera, a disc and a dart a spawn, a box a zone.
    expect(markers.drawn()).toEqual({
      instances: { bomb: 2, camera: 2, cameraCone: 2, extinguisher: 1, gasPipe: 1, lab: 2, attack: 4, defense: 2, rappel: 2, spawnPeek: 1, runOut: 1 },
      zonesShown: 0,
    });
    // [B, 1F, 2F]: the bombs on 2F; CAM1 on 1F and CAM2 in the basement (each a box and a cone); the extinguisher
    // on 1F, the gas pipe on 2F; the lab spawn and the attackers on 1F, the defender on 2F (a disc and a dart each).
    expect(storeyNames(lab, "bomb")).toEqual([0, 0, 2]);
    expect(storeyNames(lab, "camera")).toEqual([1, 1, 0]);
    expect(storeyNames(lab, "cameraCone")).toEqual([1, 1, 0]);
    expect(storeyNames(lab, "extinguisher")).toEqual([0, 1, 0]);
    expect(storeyNames(lab, "gasPipe")).toEqual([0, 0, 1]);
    expect(storeyNames(lab, "lab")).toEqual([0, 2, 0]);
    expect(storeyNames(lab, "attack")).toEqual([0, 4, 0]);
    expect(storeyNames(lab, "defense")).toEqual([0, 0, 2]);
    // Names: two bombs, two cameras, two ingredients, and each spawn group once (the two attackers share one).
    const names = (i: number) => lab.labelGroups[i].children.map((c) => c.name).sort();
    expect(lab.labels.length - before).toBe(9);
    expect(names(0)).toEqual(["CAM2"]);
    expect(names(1)).toEqual(["Attackers A YARD", "CAM1", "Extinguisher ING1", "Lab spawn"]);
    expect(names(2)).toEqual(["Bomb 1A", "Bomb 1B", "Defenders 2F Loft", "Gas pipe ING2"]);
  });

  it("points a camera's cone from the camera the way it looks, and lays a gas pipe along its wall", async () => {
    const level = await map();
    const lab = createLabScene(level);
    new MapMarkers(lab, level.def);
    const at = (kind: string, storey: number) => {
      const mesh = markerMeshes(lab.storeys[storey]).find((m) => m.name.startsWith(`marker:${kind}:`))!;
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(0, m);
      const [p, q, s] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
      m.decompose(p, q, s);
      return { p, axis: new THREE.Vector3(0, 1, 0).applyQuaternion(q) };
    };
    // CAM1 looks west (yaw 90) and 20° down: its cone's middle 0.6 m that way, its tip (+y) back at the camera.
    const look = new THREE.Vector3(-Math.cos((20 * Math.PI) / 180), -Math.sin((20 * Math.PI) / 180), 0);
    const cone = at("cameraCone", 1);
    expect(cone.p.distanceTo(new THREE.Vector3(4, 2.7, -5).addScaledVector(look, 0.6))).toBeLessThan(1e-6);
    expect(cone.axis.dot(look)).toBeCloseTo(-1, 6);
    // ING2 faces east (yaw −90): the pipe runs north–south along the wall.
    const pipe = at("gasPipe", 2);
    expect(Math.abs(pipe.axis.z)).toBeCloseTo(1, 6);
  });

  it("keeps the zones view hidden until it is switched on, each zone on its storey; building zones and drone holes aren't drawn", async () => {
    const level = await map();
    const lab = createLabScene(level);
    const markers = new MapMarkers(lab, level.def);
    const zoneMeshes = () => lab.storeys.flatMap((g) => markerMeshes(g)).filter((m) => /^marker:(rappel|spawnPeek|runOut):/.test(m.name));
    expect(storeyNames(lab, "rappel")).toEqual([0, 1, 1]);
    expect(storeyNames(lab, "spawnPeek")).toEqual([0, 1, 0]);
    expect(storeyNames(lab, "runOut")).toEqual([1, 0, 0]);
    expect([zoneMeshes().every((m) => !m.visible), markers.drawn().zonesShown]).toEqual([true, 0]);
    markers.setZones(true);
    expect([markers.zones, zoneMeshes().every((m) => m.visible), markers.drawn().zonesShown]).toEqual([true, true, 4]);
    markers.setZones(false);
    expect([zoneMeshes().some((m) => m.visible), markers.drawn().zonesShown]).toEqual([false, 0]);
    // Every other marker stays shown, and none casts a shadow (the shadow map is drawn only when the level changes).
    const all = lab.storeys.flatMap((g) => markerMeshes(g));
    expect(all.filter((m) => !zoneMeshes().includes(m)).every((m) => m.visible)).toBe(true);
    expect(all.some((m) => m.castShadow)).toBe(false);
    // Instanced: a mesh per kind, look and storey, not one per marker.
    expect(all.length).toBeLessThanOrEqual(20);
  });
});
