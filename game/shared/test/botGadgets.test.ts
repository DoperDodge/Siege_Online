// Every operator's ability and the generic gadgets in bots' hands (Phase 9 M7; bots/DESIGN.md §7.4): defenders set
// their devices up in prep where the site plan says (Lull's jammers, Vista's mirror once its wall has steel, Thistle's
// mines, Picket's wire and shield, Twain's idle shell into the plan's other room); attackers breach on their way in
// (Kiln's Burn Frame, Pointman's EMP and Heavy Breach Charge, Hail's Hailstone Drill, Cleave's hammer,
// Relay's breach charge), Patch's Crossover goes ahead, Relay calls a spotted defender; in action Murmur scans and
// pings, Twain swaps shells when hurt. All through the keys a player would press.
import { describe, expect, it } from "vitest";
import {
  ATTACK,
  botLoadout,
  ByteReader,
  DeployKind,
  encodeLobbyAction,
  handleRoomMessage,
  Hand,
  isFormat,
  kindId,
  loadGameData,
  Phase,
  PawnKind,
  PawnMode,
  Room,
  roomAt,
  roomSpots,
  Source,
  TICK_HZ,
  sees,
  type FormatMode,
  type GameEvent,
  type Pawn,
  type Vec3,
} from "../src/index.js";

const data = loadGameData();
const mode = data.modes.get("bot_training")!;
if (!isFormat(mode)) throw new Error("bot_training");
const bt: FormatMode = mode;

/**
 * A Bot Training room on Millrace: the person alone on one side (attacking when the bots defend), Orange's five bots
 * playing `ops` in slot order, at `site`.
 */
async function match(site: string, botsDefend: boolean, ops: string[], seed = 5) {
  const room = await Room.create("GAD", "millrace", { format: "bot_training", seed });
  const host = room.join("you", { send() {}, buffered: () => 0 })!;
  const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
  const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack: botsDefend ? "blue" : "orange", bots: { ...bt.match.bots!, size: [1, 5], site }, seconds: { ...bt.match.seconds, pick: 8, prep: 45, action: 180 } };
  send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: rules } } } as Parameters<typeof encodeLobbyAction>[0]));
  room.step();
  send(encodeLobbyAction({ kind: "start" }));
  room.step();
  const m = room.director!.match;
  // Every kind of gadget that was ever in the table (thrown ones are gone once they go off).
  const seen = new Set<string>();
  const until = (done: () => boolean, seconds: number) => {
    for (let i = 0; i < seconds * TICK_HZ && !done(); i++) {
      room.step();
      for (const g of room.sim.gadgets.list) seen.add(kindId(g.kind) ?? "?");
    }
    return done();
  };
  expect(until(() => m.phase === Phase.Planning, 5)).toBe(true);
  const bots = [...m.players.values()].filter((p) => p.bot !== null);
  expect(bots.length).toBe(5);
  // A teammate's operator can't be picked twice: each bot first goes to one nobody here asked for, then takes its own
  // (picked straight away, one could be refused while another bot still held it).
  const side = data.operators.get(ops[0])!.side;
  const spare = [...data.operators.values()].filter((o) => o.side === side && !ops.includes(o.id)).map((o) => o.id);
  bots.forEach((p, k) => room.pickLoadout(p.id, botLoadout(data, spare[k])));
  bots.forEach((p, k) => room.pickLoadout(p.id, botLoadout(data, ops[k])));
  expect(bots.map((p) => m.players.get(p.id)!.operator)).toEqual(ops);
  const botOf = (op: string) => bots[ops.indexOf(op)].id;
  const body = (id: number): Pawn => room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!;
  const count = (kind: string) => room.sim.gadgets.list.filter((g) => kindId(g.kind) === kind).length;
  const person = [...m.players.values()].find((p) => p.bot === null)!;
  const info = () =>
    bots
      .map((p, k) => {
        const b = room.bodyOf(p.id) ? body(p.id) : null;
        const plan = m.sideOf(p.id) === ATTACK ? room.attackPlan : room.defensePlan;
        return `${ops[k]} at ${b ? `${b.state.x.toFixed(1)},${b.state.y.toFixed(1)},${b.state.z.toFixed(1)} ${roomAt(room.sim.level.def, b.state.x, b.state.y + 0.3, b.state.z)} hand ${b.state.hand} g ${b.state.g1}/${b.state.g2} w ${b.state.w1}/${b.state.w2}` : "-"} task ${JSON.stringify(plan?.taskOf(p.id) ?? null).slice(0, 140)} doing ${room.botOf(p.id)!.doing}`;
      })
      .join("\n") + `\nseen ${[...seen].join(",")}`;
  return { room, m, until, botOf, body, count, person, seen, info };
}

/** Where the person hides, out of the way: inside, the room farthest from the site's (out of the attackers' spawns' sight). */
function hideFrom(room: Room, site: string): [number, number, number] {
  const level = room.sim.level.def;
  const at = level.rooms.find((r) => r.id === level.sites.find((s) => s.id === site)!.rooms[0])!.anchor;
  const far = [...level.rooms].sort((a, b) => Math.hypot(b.anchor[0] - at[0], b.anchor[2] - at[2]) - Math.hypot(a.anchor[0] - at[0], a.anchor[2] - at[2]))[0];
  return [far.anchor[0], far.anchor[1], far.anchor[2]];
}

describe("bots' gadgets (Phase 9 M7)", () => {
  it("defenders at the Mill set up in prep: Lull's jammers, Vista's mirror, Thistle's mines, Picket's wire and shield, Twain's other shell", async () => {
    const ops = ["lull", "vista", "thistle", "picket", "twain"];
    const { room, m, until, botOf, body, count, info } = await match("SITE_MILL", true, ops);
    expect(until(() => m.phase === Phase.Prep, 15)).toBe(true);
    const twain = room.bodyOf(botOf("twain"))!;
    const home = twain.possessedPawnId;
    const other = room.sim.otherPawn(twain.id)!;
    const otherFrom = [other.state.x, other.state.z];
    expect(until(() => m.phase === Phase.Action, 50)).toBe(true);
    const why = info();
    expect(count("damper"), why).toBeGreaterThanOrEqual(2);
    expect(count("blind_pane"), why).toBeGreaterThanOrEqual(1);
    expect(count("burr_mine"), why).toBeGreaterThanOrEqual(1);
    expect(count("barbed_wire"), why).toBeGreaterThanOrEqual(1);
    expect(count("deployable_shield"), why).toBeGreaterThanOrEqual(1);
    // Twain walked her idle shell off and came back to the one she was in.
    const idle = room.sim.otherPawn(twain.id)!;
    expect(Math.hypot(idle.state.x - otherFrom[0], idle.state.z - otherFrom[1]), why).toBeGreaterThan(2);
    expect(twain.possessedPawnId, why).toBe(home);
    // The plan's first wall still got its steel.
    const p = room.sim.level.panels.byId.get(data.bots.strats.get("millrace")!.sites.SITE_MILL.defense.reinforce[0].panel)!.panel;
    expect(p.reinforcedBefore(0) || p.reinforcedBefore(1), why).toBe(true);
    void body;
  }, 240000);

  it("attackers at the Mill breach on their way in: Kiln, Pointman (EMP first), Hail's Hailstone Drill, Relay's breach charge, Patch's Crossover; Relay calls a spotted defender", async () => {
    const ops = ["kiln", "pointman", "hail", "patch", "relay"];
    const { room, m, until, botOf, body, person, seen, info } = await match("SITE_MILL", false, ops, 6);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    // The person (defending alone) hides far off, out of the way.
    const you = body(person.id);
    room.sim.teleport(you.id, ...hideFrom(room, "SITE_MILL"), 0);
    const panels = room.sim.level.panels.byId;
    const [hard1, hard2] = data.bots.strats.get("millrace")!.sites.SITE_MILL.attack.hardBreach.map((h) => h.panel);
    const patch = room.bodyOf(botOf("patch"))!;
    let crossover = false;
    expect(
      until(() => {
        crossover ||= room.sim.dronesOf(patch).some((p) => p.crossover && p.state.mode !== PawnMode.Held);
        return panels.get(hard1)!.panel.modified && panels.get(hard2)!.panel.modified && seen.has("hailstone_drill") && seen.has("breach_charge") && crossover;
      }, 90),
      info(),
    ).toBe(true);
    expect(seen.has("burn_frame") && seen.has("impact_emp") && seen.has("heavy_breach_charge"), info()).toBe(true);
    // A red mark on the defender: Relay's payload is on its way to his phone.
    (room as unknown as { spotted(p: Pawn, by: number, side: number): void }).spotted(you, 0, ATTACK);
    const ringer = (room as unknown as { ringerState: Map<number, { upload: unknown; charges: number }> }).ringerState;
    const relay = body(botOf("relay"));
    expect(until(() => ringer.get(relay.id)?.upload !== null && ringer.get(relay.id) !== undefined, 8), info()).toBe(true);
  }, 300000);

  it("Cleave opens Dispatch's hatch from Payroll above with his hammer", async () => {
    const ops = ["cleave", "kiln", "pointman", "patch", "relay"];
    const { room, m, until, body, person, info } = await match("SITE_DISPATCH", false, ops, 7);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    room.sim.teleport(body(person.id).id, ...hideFrom(room, "SITE_DISPATCH"), 0);
    const h2 = room.sim.level.panels.byId.get("H2")!.panel;
    expect(until(() => h2.broken, 80), info()).toBe(true);
  }, 300000);

  it("in action, Murmur scans from above the Boiler and pings an attacker he finds; Twain, hurt, swaps into her other shell", async () => {
    const ops = ["murmur", "twain", "lull", "vista", "thistle"];
    const { room, m, until, botOf, body, person, info } = await match("SITE_BOILER", true, ops, 8);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    const murmur = body(botOf("murmur"));
    // His sensor comes up on his rounds.
    expect(until(() => murmur.state.hand === Hand.Ability, 30), info()).toBe(true);
    // An attacker within its reach but out of every defender's sight (through a wall or a floor) shows on it, and he
    // pings the heartbeat for his team.
    const heard: GameEvent[] = [];
    const mate = room.botOf(botOf("lull"))!;
    const hear = mate.hear.bind(mate);
    mate.hear = (ev) => {
      heard.push(...ev);
      hear(ev);
    };
    const nav = room.nav!;
    const eyes = ops.map((op) => body(botOf(op))).map((b) => [b.state.x, b.state.y + 1.6, b.state.z] as Vec3);
    let hide: Vec3 | null = null;
    for (let r = 4; r <= 8 && !hide; r += 1)
      for (let a = 0; a < 16 && !hide; a++) {
        const n = nav.grid.nodeNear(murmur.state.x + Math.cos(a * 0.4) * r, murmur.state.y, murmur.state.z + Math.sin(a * 0.4) * r, 0.5, 4);
        if (n < 0) continue;
        const p = nav.grid.nodePos(n);
        if (Math.hypot(p[0] - murmur.state.x, p[1] - murmur.state.y, p[2] - murmur.state.z) > 9) continue;
        if (eyes.every((e) => !sees(room.sim, e, [p[0], p[1] + 1.2, p[2]]))) hide = p;
      }
    expect(hide).not.toBeNull();
    const you = body(person.id);
    room.sim.teleport(you.id, hide![0], hide![1], hide![2], 0);
    expect(until(() => heard.some((e) => e.kind === "ping" && e.heart), 40), info()).toBe(true);
    // The team knows where he is.
    expect(until(() => mate.senses.contacts.has(you.id), 2), info()).toBe(true);
    // Twain hurt: into her other shell.
    const twain = room.bodyOf(botOf("twain"))!;
    const was = twain.possessedPawnId;
    room.sim.pawns.get(was)!.state.hp = 30;
    expect(until(() => twain.possessedPawnId !== was, 12), info()).toBe(true);
  }, 300000);

  it("defenders react in action: a Remote Charge thrown where an attacker was heard, set off as he comes by it; Thistle's mines at his room's ways in", async () => {
    const ops = ["lull", "thistle", "vista", "picket", "twain"];
    const { room, m, until, botOf, body, count, person, info } = await match("SITE_BOILER", true, ops, 9);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    const mines = count("burr_mine");
    const lull = body(botOf("lull"));
    const bot = room.botOf(botOf("lull"))!;
    // A place for the attacker 5–9 m from Lull that no defender sees, with a point Lull sees within 3 m of it on the
    // way there (a doorway he'd come through).
    const nav = room.nav!;
    const eyes = ops.map((op) => body(botOf(op))).map((b) => [b.state.x, b.state.y + 1.6, b.state.z] as Vec3);
    const lullEye: Vec3 = [lull.state.x, lull.state.y + 1.6, lull.state.z];
    let spot: Vec3 | null = null;
    for (let r = 5; r <= 9 && !spot; r += 1)
      for (let a = 0; a < 24 && !spot; a++) {
        const n = nav.grid.nodeNear(lull.state.x + Math.cos(a * 0.26) * r, lull.state.y, lull.state.z + Math.sin(a * 0.26) * r, 0.5, 0.5);
        if (n < 0) continue;
        const p = nav.grid.nodePos(n);
        if (!eyes.every((e) => !sees(room.sim, e, [p[0], p[1] + 1.2, p[2]]))) continue;
        const path = nav.search.path([lull.state.x, lull.state.y, lull.state.z], p);
        const seen = path?.steps.filter((st) => Math.hypot(st.pos[0] - lull.state.x, st.pos[2] - lull.state.z) < 9 && sees(room.sim, lullEye, [st.pos[0], st.pos[1] + 0.4, st.pos[2]])).pop();
        if (seen && Math.hypot(seen.pos[0] - p[0], seen.pos[2] - p[2]) < 3) spot = p;
      }
    expect(spot, info()).not.toBeNull();
    const you = body(person.id);
    room.sim.teleport(you.id, spot![0], spot![1], spot![2], 0);
    // He's heard there (footsteps, say), and keeps being heard.
    const hear = () => {
      const c = bot.senses.contacts.get(you.id) ?? { pawnId: you.id, kind: PawnKind.Body, pos: [0, 0, 0] as Vec3, at: 0, source: Source.Heard, uncertainty: 1, visible: false, detected: false, noticing: 0, spottedAt: 0, head: null, chest: null, legs: null, downed: false, trail: [] };
      if (c.visible) return;
      Object.assign(c, { pos: [you.state.x, you.state.y, you.state.z], at: room.sim.tick, source: Source.Heard, uncertainty: 1 });
      bot.senses.contacts.set(you.id, c);
    };
    const cell = () => room.sim.gadgets.list.find((g) => kindId(g.kind) === "remote_charge");
    expect(until(() => (hear(), cell() !== undefined && lull.state.w1 > 0), 10), info()).toBe(true);
    // It lands; he walks up to it: Lull sets it off.
    expect(until(() => (hear(), !(cell()!.flags & 1)), 3)).toBe(true);
    const at = cell()!.pos;
    room.sim.teleport(you.id, at[0] + 0.8, at[1] - 0.2, at[2], 0);
    expect(until(() => (hear(), lull.state.w1 === 0 || you.state.mode === PawnMode.Dead), 6), info()).toBe(true);
    expect(you.state.hp < 100 || you.state.mode !== PawnMode.Walk, info()).toBe(true);
    // Thistle has thrown more mines since the action started (they come back every 25 s).
    expect(until(() => count("burr_mine") > mines, 40), info()).toBe(true);
  }, 300000);

  it("attackers' grenades: Cleave's frag into the site before going in, Kiln's smoke on a teammate planting, a claymore behind Patch once in", async () => {
    const ops = ["cleave", "patch", "kiln", "pointman", "relay"];
    const { room, m, until, botOf, body, person, seen, info } = await match("SITE_DISPATCH", false, ops, 10);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    room.sim.teleport(body(person.id).id, ...hideFrom(room, "SITE_DISPATCH"), 0);
    // The defuser's carrier goes for the plant and throws no grenade first (D-164): the frag's to come from a Cleave
    // without it (who carries it was drawn as action started, so depends on how the round went until then).
    const o = room.sim.objective!;
    if (o.carrier === body(botOf("cleave")).id) o.carrier = body(botOf("relay")).id;
    expect(until(() => seen.has("frag"), 60), info()).toBe(true);
    // Someone plants; Kiln is brought near, in sight of the planter: a smoke goes on him.
    const planting = () => [...m.players.values()].map((p) => (room.bodyOf(p.id) ? body(p.id) : null)).find((b) => b?.state.deployKind === DeployKind.Plant) ?? null;
    expect(until(() => planting() !== null, 60), info()).toBe(true);
    const planter = planting()!;
    const nav = room.nav!;
    const near = [3, 4, 5, 6]
      .flatMap((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((a) => nav.grid.nodeNear(planter.state.x + Math.cos(a * 0.785) * r, planter.state.y, planter.state.z + Math.sin(a * 0.785) * r, 0.5, 0.4)))
      .filter((n) => n >= 0)
      .map((n) => nav.grid.nodePos(n))
      .find((p) => sees(room.sim, [p[0], p[1] + 1.6, p[2]], [planter.state.x, planter.state.y + 0.5, planter.state.z]));
    expect(near).toBeDefined();
    room.sim.teleport(body(botOf("kiln")).id, near![0], near![1], near![2], 0);
    expect(until(() => seen.has("smoke"), 8), info()).toBe(true);
    // Patch, once her Crossover is done, comes into the site's room: a claymore behind her.
    const patch = botOf("patch");
    expect(until(() => room.attackPlan?.taskOf(patch)?.kind !== "crossover", 30), info()).toBe(true);
    const site = room.sim.level.def.sites.find((x) => x.id === "SITE_DISPATCH")!;
    const inside = roomSpots(nav, room.sim.level.def, site.rooms[0], 1.5)[2];
    room.sim.teleport(body(patch).id, inside[0], inside[1], inside[2], 0);
    expect(until(() => seen.has("claymore"), 12), info()).toBe(true);
  }, 300000);
});

describe("Hail's Ballistic Shield in a bot's hands (Phase 9 M7)", () => {
  it("is in a Hail bot's loadout now and then (data/bots/picks.json), and he wins a duel at 10 m with it", async () => {
    const shield = botLoadout(data, "hail", 0);
    expect(shield.primary.weapon).toBe("ballistic_shield");
    expect(botLoadout(data, "hail", 0.99).primary.weapon).not.toBe("ballistic_shield");
    let wins = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const room = await Room.create("SHIELD", "millrace", { lab: true, seed });
      const hail = room.addBot(0, "normal")!;
      room.pickLoadout(hail, shield);
      const enemy = room.addBot(1, "recruit")!;
      const at = (id: number, p: Vec3, yawDeg: number) => {
        room.sim.teleport(room.bodyOf(id)!.possessedPawnId, p[0], p[1], p[2], yawDeg);
        room.botOf(id)!.order = p;
      };
      // The riverbank, facing each other.
      at(hail, [-20, 0, 30], 0);
      at(enemy, [-20, 0, 20], 180);
      const pawn = (id: number) => room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!;
      expect(pawn(hail).loadout?.pick.primary.weapon).toBe("ballistic_shield");
      for (let i = 0; i < 15 * TICK_HZ && pawn(enemy).state.mode === PawnMode.Walk && pawn(hail).state.mode === PawnMode.Walk; i++) room.step();
      if (pawn(enemy).state.mode !== PawnMode.Walk && pawn(hail).state.mode === PawnMode.Walk) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(2);
  }, 120000);
});
