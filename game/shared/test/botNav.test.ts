// Bots' navigation (Phase 9 M2; bots/DESIGN.md §3): the grid reaches every room, and a bot walks Oregon by its own inputs
// (stairs, the ladder, a barricaded window, a hatch's hole) and through a hole that wasn't there when the grid was built.
import { describe, expect, it } from "vitest";
import { LinkKind, NavWorld, PawnMode, preSetupOps, Room, TICK_HZ, type NavLink, type Vec3 } from "../src/index.js";

async function lab() {
  return Room.create("NAV", "oregon", { lab: true, seed: 3 });
}

/** A bot on `team` standing at `at`. */
function botAt(room: Room, at: Vec3, team: 0 | 1 = 1, yawDeg = 0) {
  const id = room.addBot(team, "normal")!;
  const bot = room.botOf(id)!;
  room.sim.teleport(room.bodyOf(id)!.possessedPawnId, at[0], at[1], at[2], yawDeg);
  return { id, bot, pawn: () => room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)! };
}

/** Step until the bot is within `r` of `to` (true) or `seconds` pass (false); `modes` collects its body's modes. */
function walk(room: Room, b: ReturnType<typeof botAt>, to: Vec3, seconds: number, modes = new Set<number>(), r = 0.6): boolean {
  b.bot.order = to;
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    room.step();
    const s = b.pawn().state;
    modes.add(s.mode);
    if (Math.hypot(s.x - to[0], s.z - to[2]) < r && Math.abs(s.y - to[1]) < 0.6) return true;
  }
  return false;
}

/** The links a path between two points takes. */
function linksOn(nav: NavWorld, a: Vec3, b: Vec3): NavLink[] {
  return (nav.search.path(a, b)?.steps ?? []).flatMap((s) => (s.link ? [s.link] : []));
}

describe("bots' navigation (Phase 9 M2)", () => {
  it("the grid reaches every room's floor from every site, and the outside from inside (through barricades)", async () => {
    const room = await lab();
    room.addBot(1, "normal");
    const nav = room.nav!;
    const level = room.sim.level.def;
    const start = level.spawns.find((s) => s.id === "SITE_LAUNDRY")!.pos as Vec3;
    for (const r of level.rooms) {
      // Spots on the room's floor (round its rectangles: a staircase's room has a closed pocket under its steps): one of
      // them reached is enough.
      const storey = level.storeys.find((s) => s.id === r.storey)!;
      const spots = r.rects.flatMap((q) =>
        [[0.5, 0.5], [0.2, 0.2], [0.8, 0.8], [0.2, 0.8], [0.8, 0.2]].flatMap(([a, b]) =>
          // The storey's floor, and the room's own (the Attic's is raised).
          [storey.floorY, r.anchor[1]].map((y) => nav.grid.nodeNear(q[0] + (q[2] - q[0]) * a, y, q[1] + (q[3] - q[1]) * b, 1.2, 0.5)),
        ),
      );
      expect(spots.some((n) => n >= 0 && nav.search.path(start, nav.grid.nodePos(n)) !== null), r.id).toBe(true);
    }
    for (const g of ["A_JUNKYARD", "B_STREET", "C_CONSTRUCTION"]) {
      const out = level.spawns.find((s) => s.id === g)!.pos as Vec3;
      const links = linksOn(nav, out, start);
      expect(links.some((l) => l.kind === LinkKind.Barricade), g).toBe(true);
    }
  }, 60000);

  it("walks from the basement Laundry up two storeys to the Kids' Dorms by the stairs", async () => {
    const room = await lab();
    const b = botAt(room, [39.345, -3.2, 32.805]);
    expect(walk(room, b, [28.5, 3.2, 33.15], 40)).toBe(true);
  }, 60000);

  it("climbs the ladder from the 2F Tower to the 3F catwalk", async () => {
    const room = await lab();
    const b = botAt(room, [39.125, 3.2, 12.025]);
    const nav = room.nav!;
    const to = nav.grid.nodePos(nav.grid.nodeNear(42.075, 6.2, 8.35, 1.5, 0.5));
    expect(linksOn(nav, [39.125, 3.2, 12.025], to).some((l) => l.kind === LinkKind.Ladder)).toBe(true);
    const modes = new Set<number>();
    expect(walk(room, b, to, 30, modes)).toBe(true);
    expect(modes.has(PawnMode.Ladder)).toBe(true);
  }, 60000);

  it("breaks a window's barricade and glass with the knife and vaults out through it", async () => {
    const room = await lab();
    room.addBot(1, "normal");
    const nav = room.nav!;
    const link = nav.grid.links.find((l) => l?.kind === LinkKind.Barricade && l.vault)!;
    const [fx, fy, fz] = nav.grid.nodePos(link.from);
    const [tx, ty, tz] = nav.grid.nodePos(link.to);
    // Start a little back from the window; end a little past it.
    const back = nav.grid.nodePos(nav.grid.nodeNear(fx - (tx - fx) * 0.8, fy, fz - (tz - fz) * 0.8, 1, 0.4));
    const past = nav.grid.nodePos(nav.grid.nodeNear(tx + (tx - fx) * 0.8, ty, tz + (tz - fz) * 0.8, 1, 0.4));
    const b = botAt(room, back, 0);
    const modes = new Set<number>();
    expect(walk(room, b, past, 30, modes)).toBe(true);
    expect(room.sim.level.panels.list[link.panel].panel.broken).toBe(true);
    expect(modes.has(PawnMode.Vault)).toBe(true);
  }, 60000);

  it("a hatch broken open: the grid is rebuilt round it, and the bot drops through it to the basement", async () => {
    const room = await lab();
    const b = botAt(room, [38.2, 0, 36.2]);
    const nav = room.nav!;
    const below: Vec3 = [39.45, -3.2, 38.4];
    expect(linksOn(nav, [38.2, 0, 36.2], below).some((l) => l.kind === LinkKind.Drop)).toBe(false);
    const h3 = room.sim.level.panels.byId.get("H3")!.panel.spec.index;
    room.queuePanelOp(h3, { kind: "damage", amount: 1e6, hard: true });
    room.step();
    nav.flush();
    expect(room.sim.level.panels.list[h3].panel.broken).toBe(true);
    expect(linksOn(nav, [38.2, 0, 36.2], below).some((l) => l.kind === LinkKind.Drop)).toBe(true);
    expect(walk(room, b, below, 8)).toBe(true);
  }, 60000);

  it("a rotation hole cut in a soft wall: the way through it is found once the grid sees it", async () => {
    const room = await lab();
    room.addBot(1, "normal");
    const nav = room.nav!;
    const wall = room.sim.level.panels.byId.get("SW-B-05")!;
    const [cx, cy, cz] = wall.frame.center;
    const n = wall.frame.n;
    const floor = cy - wall.frame.h / 2;
    const a: Vec3 = [cx + n[0] * 1.2, floor, cz + n[2] * 1.2];
    const c: Vec3 = [cx - n[0] * 1.2, floor, cz - n[2] * 1.2];
    const before = nav.search.path(a, c)!.cost;
    for (const o of preSetupOps(room.sim.level.def, room.sim.level.panels, room.sim.data.destruction, "SITE_LAUNDRY")) if (o.panel === wall.panel.spec.index) room.queuePanelOp(o.panel, o.op);
    room.step();
    nav.flush();
    const after = nav.search.path(a, c)!.cost;
    expect(after).toBeLessThan(Math.min(before, 6));
    const b = botAt(room, a);
    expect(walk(room, b, c, 8)).toBe(true);
  }, 60000);
});
