// Where you are on a map and where you can go (Phase 5 M2, tools/mapgen/DESIGN.md E9 and amendment 17): the
// storey under your feet, the room you're in, a storey's own plan units, the HUD line, and Go to by storey and
// room, on a small map of two storeys whose 2F is drawn in a frame of its own.
import { describe, expect, it } from "vitest";
import { levelSchema } from "@redmond/shared";
import { storeyOf } from "../src/render/labScene.js";
import { goToMenu, nativeU, roomAt, whereText } from "../src/ui/where.js";

/** Oregon's own 2F frame: its drawing is about 2.4% larger than 1F's and shifted (world = a · native + b). */
const FRAME_2F = { ax: 0.9772305, bx: -0.0195446, ay: 0.9745639, by: 2.7385245 };

/**
 * Two storeys. On 1F an L-shaped hall (two rectangles) and a closet sharing the hall's edge at z = 4 (its
 * rectangle written corner to corner the other way round); on 2F a dorm of two rectangles over the hall.
 */
const map = levelSchema.parse({
  id: "map",
  name: "Map",
  spawns: [{ id: "s0", pos: [0, 0, 0], yawDeg: 0 }],
  solids: [{ id: "ground", center: [0, -0.1, 0], size: [40, 0.2, 40], surface: "HARD_FLOOR" }],
  plan: { mPerU: 0.15, frames: { "1F": { ax: 1, bx: 0, ay: 1, by: 0 }, "2F": FRAME_2F } },
  storeys: [
    { id: "1F", floorY: 0, ceilingY: 3 },
    { id: "2F", floorY: 3.2, ceilingY: 6 },
  ],
  rooms: [
    { id: "1F_HALL", callout: "Hall", storey: "1F", rects: [[0, 0, 10, 4], [6, 4, 10, 12]], anchor: [2, 0, 2] },
    { id: "1F_CLOSET", callout: "Closet", storey: "1F", rects: [[6, 8, 0, 4]], anchor: [3, 0, 6] },
    { id: "2F_DORMS", callout: "Kids' Dorms", storey: "2F", rects: [[0, 0, 10, 4], [10, 0, 14, 4]], anchor: [12, 3.2, 2] },
  ],
});

describe("the storey under your feet", () => {
  it("is the last whose floor, less 0.25 m, is at or below your feet: a step short of a floor counts, a jump doesn't leave", () => {
    const feet = (y: number) => map.storeys[storeyOf(map.storeys, y)].id;
    expect(feet(0)).toBe("1F");
    expect(feet(1.2)).toBe("1F"); // in the air, jumping on 1F
    expect(feet(3.2)).toBe("2F");
    expect(feet(3.0)).toBe("2F"); // the top step of a stair, 0.2 m under the floor
    expect(feet(2.9)).toBe("1F");
    expect(feet(-5)).toBe("1F"); // below everything: the lowest
    expect(feet(40)).toBe("2F");
  });
});

describe("the room you're in", () => {
  const room = (storey: string, x: number, z: number) => roomAt(map.rooms, storey, x, z)?.id ?? null;

  it("is the first room on your storey whose rectangles hold you, whichever of them", () => {
    expect(room("1F", 2, 2)).toBe("1F_HALL");
    expect(room("1F", 8, 10)).toBe("1F_HALL"); // the L's second rectangle
    expect(room("1F", 3, 6)).toBe("1F_CLOSET"); // a rectangle given corner to corner the other way round
    expect(room("1F", 2, 4)).toBe("1F_HALL"); // on the edge both share: the room listed first
    expect(room("1F", 20, 20)).toBeNull();
  });

  it("only on your storey: the dorm over the hall, nothing over the closet", () => {
    expect(room("2F", 2, 2)).toBe("2F_DORMS");
    expect(room("2F", 12, 2)).toBe("2F_DORMS");
    expect(room("1F", 12, 2)).toBeNull();
    expect(room("2F", 3, 6)).toBeNull();
    expect(room("3F", 2, 2)).toBeNull();
  });
});

describe("a storey's own plan units", () => {
  it("undo its frame: world = a · native + b per axis", () => {
    expect(nativeU({ ax: 1, bx: 0, ay: 1, by: 0 }, 175.2, 182)).toEqual([175.2, 182]);
    for (const [nx, ny] of [
      [0, 0],
      [179.3, 183.9],
      [-12.5, 361.2],
    ]) {
      const [x, y] = nativeU(FRAME_2F, FRAME_2F.ax * nx + FRAME_2F.bx, FRAME_2F.ay * ny + FRAME_2F.by);
      expect(x).toBeCloseTo(nx, 9);
      expect(y).toBeCloseTo(ny, 9);
    }
    // DESIGN amendment 17's example: world u 175.2, 182.0 is 2F u 179.3, 183.9.
    const [x, y] = nativeU(FRAME_2F, 175.2, 182);
    expect([x.toFixed(1), y.toFixed(1)]).toEqual(["179.3", "183.9"]);
  });
});

describe("the HUD line", () => {
  it("names the room, the storey, and where you are in world u and in the storey's own u", () => {
    expect(whereText(map, 0, 8, 10)).toBe("Hall · 1F · world u 53.3, 66.7 · 1F u 53.3, 66.7");
    expect(whereText(map, 1, 12, 2)).toBe("Kids' Dorms · 2F · world u 80.0, 13.3 · 2F u 81.9, 10.9");
    // DESIGN amendment 17's example spot, here outside every room.
    expect(whereText(map, 1, 175.2 * 0.15, 182 * 0.15)).toBe("outside · 2F · world u 175.2, 182.0 · 2F u 179.3, 183.9");
  });

  it("says “—” on a map without rooms yet, and leaves the units out without a plan", () => {
    expect(whereText({ ...map, rooms: [] }, 0, 8, 10)).toBe("— · 1F · world u 53.3, 66.7 · 1F u 53.3, 66.7");
    expect(whereText({ ...map, plan: undefined }, 0, 8, 10)).toBe("Hall · 1F");
    expect(whereText({ storeys: [], rooms: [], plan: undefined }, 0, 8, 10)).toBe("— · —");
  });
});

describe("Go to", () => {
  /** The page's own spots: name, x, y, z, yaw in degrees. */
  const extra: [string, number, number, number, number][] = [
    ["Front door (outside)", 5, 0, 20, 180],
    ["Balcony", 12, 3.2, -1, 90],
    ["Top of the stairs", 1, 3.0, 1, 0],
  ];

  it("without rooms is the page's list as it is, under no heading", () => {
    expect(goToMenu({ ...map, rooms: [] }, extra)).toEqual([
      {
        storey: null,
        spots: [
          { name: "Front door (outside)", pos: [5, 0, 20], yawDeg: 180 },
          { name: "Balcony", pos: [12, 3.2, -1], yawDeg: 90 },
          { name: "Top of the stairs", pos: [1, 3.0, 1], yawDeg: 0 },
        ],
      },
    ]);
    // A lab: no storeys, no rooms.
    expect(goToMenu({ storeys: [], rooms: [] }, extra)[0].spots.map((s) => s.name)).toEqual(extra.map((e) => e[0]));
  });

  it("with rooms lists them by storey, each by its callout at its anchor facing north, then the page's spots at their height", () => {
    // A storey with nothing to go to (3F) gets no heading.
    const menu = goToMenu({ storeys: [...map.storeys, { id: "3F", floorY: 6.2, ceilingY: 9.2 }], rooms: map.rooms }, extra);
    expect(menu.map((g) => g.storey)).toEqual(["1F", "2F"]);
    expect(menu[0].spots).toEqual([
      { name: "Hall", pos: [2, 0, 2], yawDeg: 0, room: "1F_HALL" },
      { name: "Closet", pos: [3, 0, 6], yawDeg: 0, room: "1F_CLOSET" },
      { name: "Front door (outside)", pos: [5, 0, 20], yawDeg: 180 },
    ]);
    expect(menu[1].spots).toEqual([
      { name: "Kids' Dorms", pos: [12, 3.2, 2], yawDeg: 0, room: "2F_DORMS" },
      { name: "Balcony", pos: [12, 3.2, -1], yawDeg: 90 },
      { name: "Top of the stairs", pos: [1, 3.0, 1], yawDeg: 0 }, // 0.2 m under 2F's floor: on 2F
    ]);
    // Every room once; nothing shared with the level (the menu's anchors are copies).
    expect(menu.flatMap((g) => g.spots).filter((s) => s.room).length).toBe(map.rooms.length);
    expect(menu[0].spots[0].pos).not.toBe(map.rooms[0].anchor);
  });

  it("lists the bomb sites first: each at its first defender spawn, facing as it does; without defenders, at its first bomb facing the other", () => {
    const sites = [
      { id: "SITE_DORMS", name: "2F Kids' Dorms", rooms: ["2F_DORMS"], bombs: [{ id: "1A", pos: [1, 3.2, 1] as [number, number, number], room: "2F_DORMS" }, { id: "1B", pos: [13, 3.2, 1] as [number, number, number], room: "2F_DORMS" }], plantMarginM: 0.5 },
      { id: "SITE_HALL", name: "1F Hall", rooms: ["1F_HALL"], bombs: [{ id: "2A", pos: [2, 0, 1] as [number, number, number], room: "1F_HALL" }, { id: "2B", pos: [2, 0, 11] as [number, number, number], room: "1F_HALL" }], plantMarginM: 0.5 },
    ];
    const spawns = [
      { id: "s0", pos: [0, 0, 0] as [number, number, number], yawDeg: 0 },
      { id: "SITE_DORMS", pos: [5, 3.2, 2] as [number, number, number], yawDeg: -90, side: "defense" as const, group: "SITE_DORMS" },
      { id: "SITE_DORMS.2", pos: [6, 3.2, 2] as [number, number, number], yawDeg: 90, side: "defense" as const, group: "SITE_DORMS" },
    ];
    const menu = goToMenu({ ...map, sites, spawns }, extra);
    expect(menu.map((g) => [g.storey, g.sites ?? false])).toEqual([
      [null, true],
      ["1F", false],
      ["2F", false],
    ]);
    expect(menu[0].spots).toEqual([
      { name: "2F Kids' Dorms", pos: [5, 3.2, 2], yawDeg: -90, site: "SITE_DORMS" },
      // The second bomb is due south of the first: facing south is 180 (0 faces north).
      { name: "1F Hall", pos: [2, 0, 1], yawDeg: 180, site: "SITE_HALL" },
    ]);
    expect(menu[0].spots[0].pos).not.toBe(spawns[1].pos);
    // A map without sites has no sites heading.
    expect(goToMenu({ ...map, sites: [], spawns }, extra).some((g) => g.sites)).toBe(false);
  });
});
