// Defending bots (Phase 9 M4; bots/DESIGN.md §6): in prep they spend the pool on the site plan's walls and hatches in
// order, barricade the site's doors and knife the rotation holes, then anchors hold spots in the site's rooms; after a
// plant they go for the defuser and disable it.
import { describe, expect, it } from "vitest";
import { ByteReader, DEFENSE, encodeLobbyAction, type FormatMode, handleRoomMessage, isFormat, loadGameData, Phase, PawnMode, Room, roomAt, TICK_HZ } from "../src/index.js";

const data = loadGameData();
const mode = data.modes.get("bot_training")!;
if (!isFormat(mode)) throw new Error("bot_training");
const bt: FormatMode = mode;

/** A Bot Training room with one silent person on Blue attacking, Orange's five bots defending `site`. */
async function defense(site: string, seed = 5, over: Record<string, unknown> = {}) {
  const room = await Room.create("DEF", "oregon", { format: "bot_training", seed });
  const host = room.join("you", { send() {}, buffered: () => 0 })!;
  const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
  send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: { ...bt.match, swapEvery: 24, overtime: null, firstAttack: "blue", bots: { ...bt.match.bots!, size: [1, 5], site }, seconds: { ...bt.match.seconds, pick: 5, prep: 45, action: 180 }, ...over } } } }));
  room.step();
  send(encodeLobbyAction({ kind: "start" }));
  room.step();
  const m = room.director!.match;
  const until = (done: () => boolean, seconds: number) => {
    for (let i = 0; i < seconds * TICK_HZ && !done(); i++) room.step();
    return done();
  };
  return { room, m, until };
}

describe("defending bots (Phase 9 M4)", () => {
  it("prep at the Laundry: the plan's walls reinforced in order, the site's doors barricaded, a rotation hole cut; then the anchors are in the site's rooms", async () => {
    const { room, m, until } = await defense("SITE_LAUNDRY");
    expect(until(() => m.phase === Phase.Prep, 10)).toBe(true);
    expect(m.site).toBe("SITE_LAUNDRY");
    const pool0 = room.sim.deployRules.pools[DEFENSE];
    expect(until(() => m.phase === Phase.Action - 0 && false, 44.5)).toBe(false);
    const jobs = JSON.stringify(room.defensePlan?.jobList().map((j) => `${j.kind}:${room.sim.level.panels.list[j.panel]?.panel.spec.id}:${j.by}:${j.done ? "done" : "open"}:${j.fails}`));
    expect(until(() => m.phase === Phase.Action, 10)).toBe(true);
    const panels = room.sim.level.panels;
    const p = (id: string) => panels.byId.get(id)!.panel;
    // The first two walls of the plan, every section.
    for (const id of ["SW-B-01", "SW-B-02"]) for (let s = 0; s < p(id).sectionCount; s++) expect(p(id).reinforcedBefore(s), `${id} section ${s}`).toBe(true);
    expect(room.sim.deployRules.pools[DEFENSE]).toBeLessThan(pool0);
    // Doors between the site's rooms and the rest, barricaded.
    const site = room.sim.level.def.sites.find((s) => s.id === "SITE_LAUNDRY")!;
    const side = (e: (typeof panels.list)[number], s: number) => roomAt(room.sim.level.def, e.frame.center[0] + e.frame.n[0] * 0.7 * s, e.frame.center[1] - e.frame.h / 2 + 0.3, e.frame.center[2] + e.frame.n[2] * 0.7 * s) ?? "";
    const up = panels.list.filter((e) => e.panel.kind === "barricade" && !e.panel.empty && e.frame.h > 1.6 && (site.rooms.includes(side(e, 1)) || site.rooms.includes(side(e, -1))));
    expect(up.length, jobs).toBeGreaterThanOrEqual(2);
    // A rotation hole knifed in a leave-soft wall (it isn't whole any more).
    expect(p("SW-B-05").modified || p("SW-B-06").modified).toBe(true);
    // Anchors in the site's rooms some seconds into action (the ones who set gadgets up outside it back in by then).
    const defenders = () => m.sides[DEFENSE].map((id) => room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!).filter((b) => b.state.mode !== PawnMode.Dead);
    const inSiteNow = () => defenders().filter((b) => site.rooms.includes(roomAt(room.sim.level.def, b.state.x, b.state.y + 0.3, b.state.z) ?? ""));
    const atSpots = () =>
      m.sides[DEFENSE].every((id) => {
        const t = room.defensePlan?.taskOf(id);
        const b = room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!;
        return t?.kind !== "hold" || b.state.mode === PawnMode.Dead || Math.hypot(b.state.x - t.spot[0], b.state.z - t.spot[2]) < 1.5;
      });
    until(() => inSiteNow().length >= 3 && atSpots(), 15);
    const inSite = inSiteNow();
    const info = m.sides[DEFENSE].map((id) => {
      const b = room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!;
      const t = room.defensePlan?.taskOf(id);
      return `${id} ${room.sim.controllers.get(room.bodyOf(id)!.id)?.operatorId} at ${b.state.x.toFixed(1)},${b.state.y.toFixed(1)},${b.state.z.toFixed(1)} in ${roomAt(room.sim.level.def, b.state.x, b.state.y + 0.3, b.state.z)} task ${JSON.stringify(t).slice(0, 120)} doing ${room.botOf(id)!.doing} legs ${room.botOf(id)!.legs.state}`;
    });
    expect(inSite.length, info.join("\n") + "\n" + jobs).toBeGreaterThanOrEqual(3);
    // The anchors are at their hold spots, watching their way in.
    const anchors = m.sides[DEFENSE].filter((id) => room.defensePlan?.taskOf(id)?.kind === "hold");
    expect(anchors.length).toBe(3);
    for (const id of anchors) {
      const t = room.defensePlan!.taskOf(id)!;
      if (t.kind !== "hold") continue;
      const b = room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!;
      expect(Math.hypot(b.state.x - t.spot[0], b.state.z - t.spot[2]), info.join("\n")).toBeLessThan(1.5);
    }
  }, 180000);

  it("after a plant (in the Kitchen) the defenders go for the defuser and one disables it", async () => {
    const { room, m, until } = await defense("SITE_DINING", 7);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    // Planted by the person's body (teleported in for the test) in the middle of the Kitchen.
    const pos: [number, number, number] = [26.3, 0, 27.4];
    const you = room.bodyOf(m.sides[0][0])!;
    const body = room.sim.pawns.get(you.possessedPawnId)!;
    room.sim.teleport(body.id, pos[0], pos[1], pos[2] - 1.5, 0);
    const o = room.sim.objective!;
    Object.assign(o, { carrier: 0, planted: pos, canPlant: false });
    room.director!.onSimEvent({ kind: "plant", pawnId: body.id, pos });
    // The person leaves the round to the bots (dead: nothing of theirs is in the way).
    room.killBody(body.id, 0);
    expect(m.phase).toBe(Phase.PostPlant);
    expect(until(() => m.disabled || m.phase === Phase.RoundEnd, 40)).toBe(true);
    expect(m.disabled).toBe(true);
  }, 180000);

  it.each(["SITE_DINING", "SITE_MEETING", "SITE_DORMS"])("prep at %s: the plan's first walls reinforced, doors barricaded, anchors in the site", async (siteId) => {
    const { room, m, until } = await defense(siteId, 9);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    const strat = data.bots.strats.get("oregon")!.sites[siteId];
    const panels = room.sim.level.panels;
    const jobs = JSON.stringify(room.defensePlan?.jobList().map((j) => `${j.kind}:${panels.list[j.panel]?.panel.spec.id}:${j.by}:${j.done ? "done" : "open"}:${j.fails}`));
    for (const r of strat.defense.reinforce.slice(0, 2)) {
      const p = panels.byId.get(r.panel)!.panel;
      for (let s = 0; s < p.sectionCount; s++) expect(p.reinforcedBefore(s), `${r.panel} ${s} ${jobs}`).toBe(true);
    }
    const site = room.sim.level.def.sites.find((s) => s.id === siteId)!;
    expect(until(() => false, 8)).toBe(false);
    const anchors = m.sides[DEFENSE].filter((id) => room.defensePlan?.taskOf(id)?.kind === "hold");
    const inSite = anchors.filter((id) => {
      const b = room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!;
      return b.state.mode === PawnMode.Dead || site.rooms.includes(roomAt(room.sim.level.def, b.state.x, b.state.y + 0.3, b.state.z) ?? "");
    });
    expect(inSite.length, jobs).toBe(anchors.length);
    expect(anchors.length).toBe(3);
  }, 180000);
});
