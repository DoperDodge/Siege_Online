// Bots' navigation (Phase 9 M2; bots/DESIGN.md §3): the grid reaches every room, and a bot walks Millrace by its own
// inputs (stairs, a barricaded window, a hatch's hole) and through a hole that wasn't there when the grid was built; it
// climbs the Movement Lab's ladder (Millrace has none).
import { describe, expect, it } from "vitest";
import { LinkKind, NavWorld, PawnMode, preSetupOps, Room, TICK_HZ, type NavLink, type Vec3 } from "../src/index.js";

async function lab(level = "millrace") {
  return Room.create("NAV", level, { lab: true, seed: 3 });
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
  it("the grid reaches every room's floor from every site, and the inside from each attackers' spawn", async () => {
    const room = await lab();
    room.addBot(1, "normal");
    const nav = room.nav!;
    const level = room.sim.level.def;
    for (const site of level.sites) {
      const start = level.spawns.find((s) => s.id === site.id)!.pos as Vec3;
      for (const r of level.rooms) {
        // Spots on the room's floor (round its rectangles: a staircase's room has a closed pocket under its steps): one
        // of them reached is enough.
        const storey = level.storeys.find((s) => s.id === r.storey)!;
        const spots = r.rects.flatMap((q) =>
          [[0.5, 0.5], [0.2, 0.2], [0.8, 0.8], [0.2, 0.8], [0.8, 0.2]].flatMap(([a, b]) =>
            [storey.floorY, r.anchor[1]].map((y) => nav.grid.nodeNear(q[0] + (q[2] - q[0]) * a, y, q[1] + (q[3] - q[1]) * b, 1.2, 0.5)),
          ),
        );
        expect(spots.some((n) => n >= 0 && nav.search.path(start, nav.grid.nodePos(n)) !== null), `${site.id} to ${r.id}`).toBe(true);
      }
    }
    const inside = level.spawns.find((s) => s.id === level.sites[0].id)!.pos as Vec3;
    for (const g of ["A_RIVERBANK", "B_RAIL_SIDING", "C_YARD_GATE"]) {
      const out = level.spawns.find((s) => s.id === g)!.pos as Vec3;
      expect(nav.search.path(out, inside), g).not.toBeNull();
    }
  }, 120000);

  it("walks from the basement up two storeys by the stairs (the Sorting room to the Carding Store)", async () => {
    const room = await lab();
    const at = (id: string) => room.sim.level.def.rooms.find((r) => r.id === id)!.anchor as Vec3;
    const b = botAt(room, at("B_SORTING"));
    expect(walk(room, b, at("2F_CARDING_STORE"), 40)).toBe(true);
  }, 60000);

  it("climbs the Movement Lab's ladder to the top of its tower", async () => {
    const room = await lab("movement_lab");
    const ladder = room.sim.level.def.ladders[0];
    const foot: Vec3 = [ladder.base[0], ladder.base[1], ladder.base[2] + 1.2];
    const b = botAt(room, foot);
    const nav = room.nav!;
    nav.flush();
    const to = nav.grid.nodePos(nav.grid.nodeNear(ladder.base[0], ladder.base[1] + ladder.height, ladder.base[2] - 1.5, 1.5, 0.5));
    expect(to[1]).toBeCloseTo(ladder.base[1] + ladder.height, 0);
    expect(linksOn(nav, foot, to).some((l) => l.kind === LinkKind.Ladder)).toBe(true);
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

  it("vaults through a window's barricade from a little to its side, not where its vault was planned (a soak once found bots stuck so)", async () => {
    const room = await lab();
    room.addBot(0, "normal");
    const nav = room.nav!;
    const links = nav.grid.links.filter((l): l is NavLink => !!l && l.kind === LinkKind.Barricade && l.vault);
    const link = links[Math.floor(links.length / 2)];
    const from = nav.grid.nodePos(link.from);
    const to = nav.grid.nodePos(link.to);
    const len = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const [ux, uz] = [(to[0] - from[0]) / len, (to[2] - from[2]) / len];
    // 16 cm off the window's middle and back from it: within a link's reach of its start, but not where its vault was
    // planned; to as far past it.
    const start: Vec3 = [from[0] - ux * 0.3 - uz * 0.16, from[1], from[2] - uz * 0.3 + ux * 0.16];
    const past: Vec3 = [to[0] + ux * 0.6, to[1], to[2] + uz * 0.6];
    const b = botAt(room, start, 0, (Math.atan2(-ux, -uz) * 180) / Math.PI);
    const modes = new Set<number>();
    expect(walk(room, b, past, 12, modes)).toBe(true);
    expect(room.sim.level.panels.list[link.panel].panel.broken).toBe(true);
    expect(modes.has(PawnMode.Vault)).toBe(true);
  }, 60000);

  it("a hatch broken open: the grid is rebuilt round it, and the bot drops through it to the basement", async () => {
    const room = await lab();
    room.addBot(1, "normal");
    const nav = room.nav!;
    const hatch = room.sim.level.panels.byId.get("H3")!;
    const [hx, hy, hz] = hatch.frame.center;
    const above = nav.grid.nodePos(nav.grid.nodeNear(hx + 1.2, hy + 0.1, hz, 1, 0.5));
    const below = nav.grid.nodePos(nav.grid.nodeNear(hx, hy - 3.1, hz, 1, 0.5));
    expect(above[1]).toBeGreaterThan(below[1] + 2.5);
    const b = botAt(room, above);
    expect(linksOn(nav, above, below).some((l) => l.kind === LinkKind.Drop)).toBe(false);
    room.queuePanelOp(hatch.panel.spec.index, { kind: "damage", amount: 1e6, hard: true });
    room.step();
    nav.flush();
    expect(hatch.panel.broken).toBe(true);
    expect(linksOn(nav, above, below).some((l) => l.kind === LinkKind.Drop)).toBe(true);
    expect(walk(room, b, below, 8)).toBe(true);
  }, 60000);

  it("a rotation hole cut in a wall: the way through it is found once the grid sees it", async () => {
    const room = await lab();
    room.addBot(1, "normal");
    const nav = room.nav!;
    // The Mill's pre-setup cuts a hole a body vaults through in SW-1F-04.
    const wall = room.sim.level.panels.byId.get("SW-1F-04")!;
    const [cx, cy, cz] = wall.frame.center;
    const n = wall.frame.n;
    const floor = cy - wall.frame.h / 2;
    const a: Vec3 = [cx + n[0] * 1.2, floor, cz + n[2] * 1.2];
    const c: Vec3 = [cx - n[0] * 1.2, floor, cz - n[2] * 1.2];
    const before = nav.search.path(a, c)!.cost;
    for (const o of preSetupOps(room.sim.level.def, room.sim.level.panels, room.sim.data.destruction, "SITE_MILL")) if (o.panel === wall.panel.spec.index) room.queuePanelOp(o.panel, o.op);
    room.step();
    nav.flush();
    const after = nav.search.path(a, c)!.cost;
    expect(after).toBeLessThan(Math.min(before, 6));
    const b = botAt(room, a);
    expect(walk(room, b, c, 8)).toBe(true);
  }, 60000);
});
