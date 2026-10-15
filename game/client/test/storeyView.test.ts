// The storey views on a map (Phase 5 M2, tools/mapgen/DESIGN.md E9 part 1 and amendment 15), without a GPU:
// the palettes and each storey's light; the storey under your feet; the storeys and panels over it hidden
// (nothing rebuilt, new shadows asked for once); only your storey's labels and callouts; the plan view's
// camera, zoom and screen-sized marks; one set of materials recoloured; the light blending into the basement.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildLevel, initRapier, levelSchema, loadGameData, type BuiltLevel } from "@redmond/shared";
import { CALLOUT_UP_M, createLabScene, DAYLIGHT, SURFACE_COLORS, type LabScene } from "../src/render/labScene.js";
import { PanelView } from "../src/render/panelView.js";
import { ABOVE_GROUND, BELOW_GROUND, NEUTRAL_GREY, paletteColor, storeyLight, StoreyView } from "../src/render/storeyView.js";

const data = loadGameData();
const luminance = (hex: number) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe("palettes and storey light", () => {
  it("greybox: PLAN §9.1's classes, soft floors as yellow as soft walls; neutral: one light grey for every surface", () => {
    for (const surface of Object.keys(SURFACE_COLORS) as (keyof typeof SURFACE_COLORS)[]) {
      expect(paletteColor("greybox", surface)).toBe(surface === "SOFT_FLOOR" ? SURFACE_COLORS.SOFT_WALL : SURFACE_COLORS[surface]);
      expect(paletteColor("neutral", surface)).toBe(NEUTRAL_GREY);
    }
    // Soft yellow, hard grey, reinforceable blue, hatch green (hues as the colours are written, in sRGB).
    const hue = (hex: number) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
    expect(hue(paletteColor("greybox", "SOFT_FLOOR")).h * 360).toBeGreaterThan(40);
    expect(hue(paletteColor("greybox", "SOFT_FLOOR")).h * 360).toBeLessThan(60);
    expect(hue(paletteColor("greybox", "HARD_WALL")).s).toBeLessThan(0.1);
    expect(hue(paletteColor("greybox", "REINFORCEABLE")).h * 360).toBeGreaterThan(200);
    expect(hue(paletteColor("greybox", "HATCH")).h * 360).toBeGreaterThan(100);
    expect(hue(NEUTRAL_GREY).s).toBeLessThan(0.1);
    expect(hue(NEUTRAL_GREY).l).toBeGreaterThan(0.7);
  });

  it("a storey below ground is darker (sky, ground, fill and sun); above ground keeps every level's daylight", () => {
    expect(storeyLight({ floorY: 0 })).toBe(ABOVE_GROUND);
    expect(storeyLight({ floorY: 6.2 })).toBe(ABOVE_GROUND);
    expect(storeyLight({ floorY: -3.2 })).toBe(BELOW_GROUND);
    expect(ABOVE_GROUND).toEqual({ ...DAYLIGHT, ambient: 0 });
    expect(luminance(BELOW_GROUND.sky) * BELOW_GROUND.hemi).toBeLessThan(0.5 * luminance(ABOVE_GROUND.sky) * ABOVE_GROUND.hemi);
    expect(luminance(BELOW_GROUND.ground)).toBeLessThan(luminance(ABOVE_GROUND.ground));
    expect(BELOW_GROUND.sun).toBeLessThan(0.5 * ABOVE_GROUND.sun);
  });
});

/** createLabScene draws its labels on canvases, which Node lacks: these draw nothing. */
function stubCanvases() {
  const g = new Proxy({}, { get: (_t, key) => (key === "measureText" ? (text: string) => ({ width: 12 * text.length }) : () => {}) });
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
}

/**
 * A small map built as the game builds one: B, 1F and 2F with a slab and a wall each (two of them labelled),
 * a reinforceable wall on 1F, a hatch in the 1F floor, a soft floor and a railing's drawn-only bar on 2F, a
 * room on each storey, and bounds.
 */
async function map(): Promise<BuiltLevel> {
  const R = await initRapier();
  const def = levelSchema.parse({
    id: "map",
    name: "Map",
    spawns: [{ id: "s0", pos: [0, 0, 0], yawDeg: 0 }],
    bounds: { min: [-30, -10, -30], max: [30, 12, 30], killY: -20 },
    plan: { mPerU: 0.15, frames: { B: { ax: 1, bx: 0, ay: 1, by: 0 }, "1F": { ax: 1, bx: 0, ay: 1, by: 0 }, "2F": { ax: 0.98, bx: 0.5, ay: 0.97, by: 2.7 } } },
    storeys: [
      { id: "B", floorY: -3.2, ceilingY: -0.2 },
      { id: "1F", floorY: 0, ceilingY: 3 },
      { id: "2F", floorY: 3.2, ceilingY: 6 },
    ],
    solids: [
      { id: "b_slab", center: [0, -3.3, 0], size: [20, 0.2, 20], surface: "HARD_FLOOR" },
      { id: "b_wall", center: [0, -1.7, 6], size: [20, 3, 0.2], surface: "HARD_WALL", label: "B wall" },
      { id: "ground", center: [0, -0.1, 3], size: [40, 0.2, 34], surface: "HARD_FLOOR" },
      { id: "hatch", center: [0, -0.1, -15], size: [1.6, 0.2, 1.6], surface: "HATCH" },
      { id: "f1_wall", center: [0, 1.5, 6], size: [20, 3, 0.2], surface: "HARD_WALL" },
      { id: "f1_soft", center: [-5, 1.5, -5], size: [3, 3, 0.2], surface: "REINFORCEABLE", label: "SW-1", panel: { sections: 2 } },
      { id: "f2_slab", center: [0, 3.1, -8], size: [20, 0.2, 4], surface: "HARD_FLOOR" },
      { id: "f2_soft", center: [0, 3.1, 0], size: [4, 0.2, 4], surface: "SOFT_FLOOR" },
      { id: "f2_bar", center: [0, 4.2, 2.5], size: [4, 0.05, 0.05], surface: "HARD_WALL", drawOnly: true },
      { id: "f2_wall", center: [0, 4.7, -6], size: [20, 3, 0.2], surface: "HARD_WALL", label: "2F wall" },
    ],
    rooms: [
      { id: "B_CELLAR", callout: "Cellar", storey: "B", rects: [[-10, -10, 10, 6]], anchor: [0, -3.2, 0] },
      { id: "1F_HALL", callout: "Hall", storey: "1F", rects: [[-10, -10, 10, 6], [10, -10, 15, 0]], anchor: [0, 0, 0] },
      { id: "2F_LOFT", callout: "Loft", storey: "2F", rects: [[-10, -10, 10, 6]], anchor: [0, 3.2, -2] },
    ],
  });
  return buildLevel(R, new R.World({ x: 0, y: -9.81, z: 0 }), def, data.destruction);
}

/** A map's scene, panels and storey views, your feet at `feetY`, on a 1600 × 900 view. */
async function views(feetY = 0) {
  const level = await map();
  const lab = createLabScene(level);
  const panels = new PanelView(lab.scene, level.panels);
  const view = new StoreyView(lab, panels, level, feetY);
  view.setViewport(1600, 900);
  return { level, lab, panels, view };
}

const visible = (groups: THREE.Group[]) => groups.map((g) => g.visible);
/** Every mesh of the level's static boxes, storey by storey. */
const staticMeshes = (lab: LabScene) => lab.storeys.flatMap((g) => g.children);
/** The colour of every drawn panel mesh made of `key` (a skin is "skin:<surface>"). */
const panelColors = (lab: LabScene, key: string) => {
  const out = new Set<number>();
  lab.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name === key) out.add(((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex());
  });
  return [...out];
};

describe("storey views", () => {
  beforeAll(stubCanvases);
  afterAll(() => vi.unstubAllGlobals());

  it("start on the storey under your feet with every storey drawn, and only its labels and callouts", async () => {
    const { lab, view } = await views(0);
    expect(view.storey).toBe(1);
    expect(view.shown()).toEqual(["B", "1F", "2F"]);
    expect(visible(lab.labelGroups)).toEqual([false, true, false]);
    expect(visible(lab.calloutGroups)).toEqual([false, true, false]);
    // A callout per room, over its anchor, in its storey's group, hidden behind walls like any label.
    expect(lab.callouts.map((c) => [c.name, c.parent!.name])).toEqual([
      ["Cellar", "callouts:B"],
      ["Hall", "callouts:1F"],
      ["Loft", "callouts:2F"],
    ]);
    const loft = lab.callouts[2].position;
    expect([loft.x, loft.y, loft.z]).toEqual([0, 3.2 + CALLOUT_UP_M, -2]);
    expect(lab.callouts.every((c) => c.material.depthTest)).toBe(true);
    for (const c of lab.callouts) expect(lab.labels).toContain(c); // hidden next to the camera like the rest
    expect((await views(-3.2)).view.storey).toBe(0);
    expect((await views(3.2)).view.storey).toBe(2);
  });

  it("hide-above hides the storeys and panels over yours without rebuilding a thing, and asks once for new shadows", async () => {
    const { level, lab, panels, view } = await views(0);
    const meshes = staticMeshes(lab);
    const index = (id: string) => level.panels.byId.get(id)!.panel.spec.index;
    expect(view.panelCounts()).toEqual({ shown: 3, byStorey: { "1F": 2, "2F": 1 } }); // the hatch is 1F's floor
    expect(view.follow(0, 0, 0, 0, 0.016)).toBe(false);
    view.setHideAbove(true);
    expect(view.shown()).toEqual(["B", "1F"]);
    expect([index("f1_soft"), index("hatch"), index("f2_soft")].map((i) => panels.isVisible(i))).toEqual([true, true, false]);
    expect(view.panelCounts().shown).toBe(2);
    // The shadow map is asked for once, at the next frame.
    expect(view.follow(0, 0, 0, 0, 0.016)).toBe(true);
    expect(view.follow(0, 0, 0, 0, 0.016)).toBe(false);
    // The same meshes in the same groups: shown or hidden, never rebuilt; the drawn-only bar goes with 2F.
    expect(staticMeshes(lab)).toEqual(meshes);
    for (let i = 0; i < meshes.length; i++) expect(staticMeshes(lab)[i]).toBe(meshes[i]);
    const bar = lab.storeys[2].children.find((m) => (m as THREE.InstancedMesh).count === 2)!; // 2F's HARD_WALL: its wall and the bar
    expect(bar.name).toBe("HARD_WALL");
    view.setHideAbove(false);
    expect(view.shown()).toEqual(["B", "1F", "2F"]);
    expect(view.panelCounts().shown).toBe(3);
    expect(view.follow(0, 0, 0, 0, 0.016)).toBe(true);
  });

  it("follow you from storey to storey: hide-above keeps hiding what's over you, the labels go with you", async () => {
    const { lab, view } = await views(0);
    view.setHideAbove(true);
    view.follow(0, 0, 0, 0, 0.016);
    // Up to 2F (feet 0.2 m under its floor on a top step already count): nothing over it.
    expect(view.follow(0, 3.0, 0, 0, 0.016)).toBe(true);
    expect(view.storey).toBe(2);
    expect(view.shown()).toEqual(["B", "1F", "2F"]);
    expect(visible(lab.labelGroups)).toEqual([false, false, true]);
    expect(visible(lab.calloutGroups)).toEqual([false, false, true]);
    // Down to B: 1F and 2F hidden, panels and all.
    expect(view.follow(0, -3.2, 0, 0, 0.016)).toBe(true);
    expect(view.shown()).toEqual(["B"]);
    expect(view.panelCounts().shown).toBe(0);
    expect(visible(lab.calloutGroups)).toEqual([true, false, false]);
    // Without hide-above, walking between storeys moves only the labels: no new shadows.
    view.setHideAbove(false);
    view.follow(0, -3.2, 0, 0, 0.016);
    expect(view.follow(0, 0, 0, 0, 0.016)).toBe(false);
    expect(view.shown()).toEqual(["B", "1F", "2F"]);
    expect(visible(lab.labelGroups)).toEqual([false, true, false]);
  });

  it("the plan view: the storeys over you hidden while it lasts, a camera straight down over you, a zoom, marks sized for the screen", async () => {
    const { lab, view } = await views(0);
    const arrow = lab.scene.getObjectByName("plan arrow") as THREE.Mesh;
    expect(arrow.visible).toBe(false);
    view.setPlan(true);
    expect(view.shown()).toEqual(["B", "1F"]);
    expect(view.hideAbove).toBe(false); // its own switch is left alone
    expect(view.follow(7, 0, -3, Math.PI / 2, 0.016)).toBe(true);
    const cam = view.camera;
    cam.updateMatrixWorld();
    expect([cam.position.x, cam.position.z]).toEqual([7, -3]);
    expect(cam.position.y).toBeGreaterThan(lab.box.max.y);
    expect(cam.position.y - cam.far).toBeLessThan(lab.box.min.y); // sees the whole level below it
    // Straight down, north (−Z) up the screen, east (+X) to the right.
    const axis = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(cam.quaternion);
    expect(axis(0, 0, -1).distanceTo(new THREE.Vector3(0, -1, 0))).toBeLessThan(1e-9);
    expect(axis(0, 1, 0).distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-9);
    expect(axis(1, 0, 0).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9);
    expect(cam.top - cam.bottom).toBeCloseTo(2 * view.planHalfM, 9);
    expect((cam.right - cam.left) / (cam.top - cam.bottom)).toBeCloseTo(1600 / 900, 9);
    // You: an arrow at your feet, pointing the way you face (yaw 90°: west).
    expect(arrow.visible).toBe(true);
    arrow.updateMatrixWorld();
    const tip = new THREE.Vector3(0, 0, -0.55).applyMatrix4(arrow.matrixWorld).sub(arrow.position).normalize();
    expect(tip.distanceTo(new THREE.Vector3(-1, 0, 0))).toBeLessThan(1e-9);
    // Callouts the same height on screen at any zoom, over everything (only your storey's are shown).
    const hall = lab.callouts[1];
    const aspect = hall.scale.x / hall.scale.y;
    const px = () => hall.scale.y / ((2 * view.planHalfM) / 900);
    expect(px()).toBeCloseTo(22, 6);
    expect(hall.material.depthTest).toBe(false);
    const half = view.planHalfM;
    view.zoom(100);
    expect(view.planHalfM).toBeGreaterThan(half * 1.15);
    expect(view.planHalfM).toBeLessThan(half * 1.3);
    expect(px()).toBeCloseTo(22, 6);
    expect(hall.scale.x / hall.scale.y).toBeCloseTo(aspect, 9);
    // The zoom stops at 3 m and at about the level's size; other labels show once they're big enough to read.
    view.zoom(-1e5);
    expect(view.planHalfM).toBe(3);
    expect(visible(lab.labelGroups)).toEqual([false, true, false]);
    view.zoom(1e5);
    expect(view.planHalfM).toBeCloseTo(36, 9); // 0.6 × the level's 60 m
    expect(visible(lab.labelGroups)).toEqual([false, false, false]);
    expect(visible(lab.calloutGroups)).toEqual([false, true, false]);
    // Leaving puts it all back.
    view.setPlan(false);
    expect(view.shown()).toEqual(["B", "1F", "2F"]);
    expect(arrow.visible).toBe(false);
    expect(hall.scale.y).toBeCloseTo(0.46, 9);
    expect(hall.scale.x / hall.scale.y).toBeCloseTo(aspect, 9);
    expect(hall.material.depthTest).toBe(true);
    expect(visible(lab.labelGroups)).toEqual([false, true, false]);
    expect(view.follow(7, 0, -3, 0, 0.016)).toBe(true);
  });

  it("the palette recolours the same materials: the static boxes and the panels' skins, not studs, steel, glass or seams", async () => {
    const { lab, view } = await views(0);
    const materials = [...lab.materials.values()];
    const seams = panelColors(lab, "seam");
    expect(seams.length).toBe(1); // the reinforceable wall's
    // A map starts greybox: soft floors yellow.
    expect(panelColors(lab, "skin:SOFT_FLOOR")).toEqual([SURFACE_COLORS.SOFT_WALL]);
    expect(panelColors(lab, "skin:HATCH")).toEqual([SURFACE_COLORS.HATCH]);
    expect(lab.materials.get("HARD_WALL")!.color.getHex()).toBe(SURFACE_COLORS.HARD_WALL);
    view.setPalette("neutral");
    for (const [, m] of lab.materials) expect(m.color.getHex()).toBe(NEUTRAL_GREY);
    for (const surface of ["SOFT_FLOOR", "HATCH", "REINFORCEABLE"]) expect(panelColors(lab, `skin:${surface}`)).toEqual([NEUTRAL_GREY]);
    expect(panelColors(lab, "seam")).toEqual(seams);
    expect([...lab.materials.values()]).toEqual(materials);
    for (const mesh of staticMeshes(lab)) expect(materials).toContain((mesh as THREE.Mesh).material);
    view.setPalette("greybox");
    for (const [surface, m] of lab.materials) expect(m.color.getHex()).toBe(paletteColor("greybox", surface));
    expect(panelColors(lab, "skin:REINFORCEABLE")).toEqual([SURFACE_COLORS.REINFORCEABLE]);
  });

  it("the light starts as your storey's, blends to the basement's when you go down (a short blend), and back up", async () => {
    const { lab, view } = await views(0);
    const ambient = lab.scene.children.find((o): o is THREE.AmbientLight => o instanceof THREE.AmbientLight)!;
    const light = () => ({ hemi: lab.hemi.intensity, sun: lab.sun.intensity, ambient: ambient.intensity, sky: lab.hemi.color.getHex(), ground: lab.hemi.groundColor.getHex() });
    const is = (l: typeof ABOVE_GROUND) => ({ hemi: l.hemi, sun: l.sun, ambient: l.ambient, sky: l.sky, ground: l.ground });
    expect(light()).toEqual(is(ABOVE_GROUND));
    view.follow(0, -3.2, 0, 0, 0.016);
    for (let t = 0; t < 0.1; t += 0.016) view.follow(0, -3.2, 0, 0, 0.016);
    const partway = light();
    expect(partway.hemi).toBeLessThan(ABOVE_GROUND.hemi);
    expect(partway.hemi).toBeGreaterThan(BELOW_GROUND.hemi);
    expect(partway.sun).toBeLessThan(ABOVE_GROUND.sun);
    expect(partway.sun).toBeGreaterThan(BELOW_GROUND.sun);
    for (let t = 0; t < 2; t += 0.016) view.follow(0, -3.2, 0, 0, 0.016);
    expect(light()).toEqual(is(BELOW_GROUND));
    for (let t = 0; t < 2; t += 0.016) view.follow(0, 0, 0, 0, 0.016);
    expect(light()).toEqual(is(ABOVE_GROUND));
    // Starting in the basement: its light at once.
    const b = await views(-3.2);
    expect([b.lab.hemi.intensity, b.lab.sun.intensity]).toEqual([BELOW_GROUND.hemi, BELOW_GROUND.sun]);
  });
});
