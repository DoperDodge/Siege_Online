// Bots' plans (data/maps/oregon/bot_strats.json; bots/DESIGN.md §6): every site of the level has one, and every room,
// panel and spawn group it names is the level's.
import { describe, expect, it } from "vitest";
import { loadGameData } from "../src/index.js";

describe("bot_strats.json (Phase 9)", () => {
  it("each of Oregon's sites has a plan, and every id in it is one of the level's", () => {
    const data = loadGameData();
    const level = data.levels.get("oregon")!;
    const strats = data.bots.strats.get("oregon")!;
    expect(Object.keys(strats.sites).sort()).toEqual(level.sites.map((s) => s.id).sort());
    const rooms = new Set(level.rooms.map((r) => r.id));
    const panels = new Set(level.solids.filter((s) => s.surface === "REINFORCEABLE" || s.surface === "HATCH").map((s) => s.id));
    const groups = new Set(level.spawns.filter((s) => s.side === "attack").map((s) => s.group));
    const bad: string[] = [];
    const room = (id: string | undefined, where: string) => id !== undefined && !rooms.has(id) && bad.push(`${where}: room ${id}`);
    const panel = (id: string | undefined, where: string) => id !== undefined && !panels.has(id) && bad.push(`${where}: panel ${id}`);
    for (const [id, s] of Object.entries(strats.sites)) {
      for (const r of s.defense.reinforce) (panel(r.panel, id), room(r.from, id));
      for (const h of s.defense.holes) (panel(h.panel, id), room(h.from, id));
      for (const r of [...s.defense.anchors, ...s.defense.roam, ...s.attack.plant, ...s.attack.postPlant, ...s.attack.flank]) room(r, id);
      for (const spots of Object.values(s.defense.gadgets)) for (const g of spots) (panel(g.panel, id), panel(g.near, id), room(g.from, id), room(g.room, id));
      for (const [g, sp] of Object.entries(s.attack.spawns)) {
        if (!groups.has(g)) bad.push(`${id}: spawn group ${g}`);
        for (const r of [...sp.via, ...sp.alt.flat()]) room(r, id);
      }
      for (const b of [...s.attack.hardBreach, ...s.attack.softBreach]) (panel(b.panel, id), room(b.from, id));
      // Anchors and plants are the site's rooms (a plant is only possible in them).
      const site = level.sites.find((x) => x.id === id)!;
      for (const r of s.attack.plant) if (!site.rooms.includes(r)) bad.push(`${id}: plant room ${r} isn't the site's`);
    }
    expect(bad).toEqual([]);
  });
});
