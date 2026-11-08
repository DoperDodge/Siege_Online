// The art pass's data and materials (Phase 10 M1–M2, render/DESIGN.md §2, §3, §5), without a GPU: the art files are
// whole (every material's set packed, every style's materials listed, the shipped textures within budget), every
// Oregon room has a style, faces wear the style of the room they face (inside walls and floors, outside zones round
// the Big Tower and below ground), boxes with a style of their own keep it, and the graphics presets.
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { artProblems, loadArtData, Sim, type BuiltLevel } from "@redmond/shared";
import { LevelArt } from "../src/render/levelArt.js";
import { initialQuality, PRESETS, presetFor } from "../src/render/quality.js";
import type { TextureManifest, TextureSets } from "../src/render/textures.js";

const TEXTURES = new URL("../public/art/textures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", TEXTURES), "utf8")) as TextureManifest;

/** The sets as the page would have them, each layer one pixel (no GPU here). */
function fakeSets(): TextureSets {
  const tex = () => new THREE.DataArrayTexture(new Uint8Array(4 * manifest.sets.length), 1, 1, manifest.sets.length);
  return {
    color: tex(),
    normal: tex(),
    orm: tex(),
    layer: new Map(manifest.sets.map((s, i) => [s.id, i])),
    sizeM: new Map(manifest.sets.map((s) => [s.id, s.sizeM])),
    mean: new Map(manifest.sets.map((s) => [s.id, s.mean ?? [0.5, 0.5, 0.5]])),
    size: 1,
    gpuBytes: 0,
  };
}

let oregon: BuiltLevel | null = null;
async function oregonArt() {
  oregon ??= (await Sim.create("oregon")).level;
  return { level: oregon, art: new LevelArt(oregon, fakeSets(), loadArtData()) };
}

describe("the art data (render/DESIGN.md §2)", () => {
  it("is whole: every material's set is packed, every style's materials and every match exist; the textures fit the 40 MB budget", () => {
    const data = loadArtData();
    expect(artProblems(data)).toEqual([]);
    const packed = new Set(manifest.sets.map((s) => s.id));
    expect(data.textures.sets.map((s) => s.id).filter((id) => !packed.has(id))).toEqual([]);
    let bytes = 0;
    for (const s of manifest.sets) {
      expect(s.sizeM.every((v) => v > 0.1 && v < 10), s.id).toBe(true);
      for (const f of Object.values(s.files)) {
        const at = new URL(f, TEXTURES);
        expect(existsSync(at), f).toBe(true);
        bytes += statSync(at).size;
      }
    }
    expect(bytes).toBeLessThan(40 * 1024 * 1024);
  });

  it("finds what's wrong: a material on a missing set, a style naming a missing material, a bad pattern", () => {
    const data = loadArtData();
    const oregonArt = data.maps.get("oregon")!;
    const broken = {
      ...data,
      materials: { ...data.materials, odd: { set: "nope", tint: "#ffffff" } },
      maps: new Map([["oregon", { ...oregonArt, styles: { ...oregonArt.styles, hall: { ...oregonArt.styles.hall, floor: "missing" } }, items: [{ match: "(", style: "hall" }] }]]),
    };
    const problems = artProblems(broken).join("\n");
    expect(problems).toContain("material odd: no texture set nope");
    expect(problems).toContain("style hall.floor: no material missing");
    expect(problems).toContain("bad pattern (");
  });

  it("gives every Oregon room a style, and names no room Oregon doesn't have", async () => {
    const { level } = await oregonArt();
    const rooms = Object.keys(loadArtData().maps.get("oregon")!.rooms);
    const ids = level.def.rooms.map((r) => r.id);
    expect(ids.filter((id) => !rooms.includes(id))).toEqual([]);
    expect(rooms.filter((id) => !ids.includes(id))).toEqual([]);
  });
});

describe("faces wear the style of the room they face (render/DESIGN.md §5.2)", () => {
  it("each room's floor and ceiling, at its anchor", async () => {
    const { level, art } = await oregonArt();
    const styles = loadArtData().maps.get("oregon")!.rooms;
    for (const r of level.def.rooms) {
      const storey = level.def.storeys.find((s) => s.id === r.storey)!;
      // A spot inside one of its rects (the anchor can sit on its edge): the first rect's middle.
      const [x0, z0, x1, z1] = r.rects[0];
      const [x, z] = [(x0 + x1) / 2, (z0 + z1) / 2];
      expect(art.styleAt([x, storey.floorY, z], [0, 1, 0]), `${r.id} floor`).toBe(styles[r.id]);
      expect(art.styleAt([x, storey.ceilingY, z], [0, -1, 0]), `${r.id} ceiling`).toBe(styles[r.id]);
    }
  });

  it("a wall's two faces wear the two rooms' styles; outside faces their zone's: the Big Tower red, the house's siding, below ground concrete", async () => {
    const { level, art } = await oregonArt();
    const room = (id: string) => level.def.rooms.find((r) => r.id === id)!;
    // The Kitchen's west edge from inside: facing east (+x), into the Kitchen.
    const k = room("1F_KITCHEN").rects[0];
    expect(art.styleAt([k[0], 1.5, (k[1] + k[3]) / 2], [1, 0, 0])).toBe("kitchen");
    // Just north of the Big Tower's 1F rect, facing north (−z): outside, the tower's zone.
    const t = room("1F_TOWER").rects[0];
    expect(art.styleAt([(t[0] + t[2]) / 2, 1.5, t[1] - 0.1], [0, 0, -1])).toBe("tower_out");
    // Far out in the yard: the outside style; and under the ground there, below_out.
    expect(art.styleAt([-20, 0, 60], [0, 1, 0])).toBe("house_out");
    expect(art.styleAt([-20, -1.5, 60], [1, 0, 0])).toBe("below_out");
  });

  it("boxes with a style of their own keep it: roofs, stairs, rails, the ladder, cover props by class, outside items; walls go by their room", async () => {
    const { level, art } = await oregonArt();
    const styleOf = (id: string) => {
      const r = level.renderables.find((x) => x.id === id);
      expect(r, id).toBeDefined();
      return art.styleAt(r!.center, [0, 1, 0], art.styleOf(r!));
    };
    expect(styleOf("RF_TOWER.W")).toBe("roof_tower");
    expect(styleOf("RF_DORMS.N")).toBe("roof");
    expect(styleOf("RF_DINING#0")).toBe("roof_flat");
    expect(styleOf(level.renderables.find((r) => r.kind === "stair_step" && !r.id.startsWith("S1:B>1F"))!.id)).toBe("stairs");
    expect(styleOf(level.renderables.find((r) => r.kind === "ladder_rung")!.id)).toBe("ladder");
    expect(styleOf("PROP_DINING_BENCH")).toBe("prop_soft");
    expect(styleOf("PROP_DINING_CABINET")).toBe("prop_wood");
    expect(styleOf("EXT_BUS")).toBe("bus");
    expect(styleOf("EXT_SILO_N")).toBe("silo");
    const wall = level.renderables.find((r) => r.id === "1F.w000#0")!;
    expect(art.styleOf(wall)).toBe(0);
  });

  it("a level without an art file wears the lab look", async () => {
    const level = (await Sim.create("movement_lab")).level;
    const art = new LevelArt(level, fakeSets(), loadArtData());
    expect(art.styleAt([0, 0, 0], [0, 1, 0])).toBe("lab");
    expect(art.panelMaterial("skin:SOFT_WALL")).not.toBeNull();
    expect(art.panelMaterial("glass")).toBeNull();
    expect(art.panelMaterial("seam")).toBeNull();
  });
});

describe("graphics presets (render/DESIGN.md §3)", () => {
  const env = { automated: false, touchOnly: false };
  const q = (search: string, setting: Parameters<typeof initialQuality>[1] = "auto", e = env) => initialQuality(new URLSearchParams(search), setting, e);

  it("a link's ?gfx wins; ?lowgfx and the browser tests get the greybox; then the setting; auto is High on a desktop, Low on a phone", () => {
    expect(q("gfx=medium", "low", { automated: true, touchOnly: true })).toBe("medium");
    expect(q("lowgfx", "high")).toBe("greybox");
    expect(q("", "high", { automated: true, touchOnly: false })).toBe("greybox");
    expect(q("", "low")).toBe("low");
    expect(q("")).toBe("high");
    expect(q("", "auto", { automated: false, touchOnly: true })).toBe("low");
    expect(q("gfx=nonsense")).toBe("high");
  });

  it("each preset draws what §3 says, and ?lowgfx drops the greybox's shadows and antialiasing", () => {
    expect(PRESETS.greybox.textures).toBe(0);
    expect(PRESETS.low).toMatchObject({ textures: 512, shadowMap: 0, probes: false, ao: false });
    expect(PRESETS.medium).toMatchObject({ textures: 1024, shadowMap: 2048, probes: true, ao: false });
    expect(PRESETS.high).toMatchObject({ textures: 1024, shadowMap: 4096, probes: true, ao: true });
    expect(presetFor("greybox", new URLSearchParams("lowgfx"))).toMatchObject({ shadowMap: 0, antialias: false, maxPixelRatio: 1 });
    expect(presetFor("greybox", new URLSearchParams())).toBe(PRESETS.greybox);
  });
});
