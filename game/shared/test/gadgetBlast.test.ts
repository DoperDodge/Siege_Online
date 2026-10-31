// Blasts (Phase 8 M2, gadgets/DESIGN.md §5; RealBlast, research/destruction.md §5): damage by a falloff curve from the
// blast to each body's nearest hitbox point, stopped by steel and the level, dimmed by each soft wall on the way; a
// charge hurts its placer's side by its own curve; the Claymore only in front and just behind; gadgets in the
// destruction range are destroyed; a charge cuts its own panel, a grenade the panels close by.
import { describe, expect, it } from "vitest";
import { ATTACK, blastEffects, DEFENSE, blastFalloff, GFlag, kindId, kindOf, Sim, type Gadget, type Vec3 } from "../src/index.js";

async function setup() {
  const sim = await Sim.create("gadget_lab");
  const a = sim.addPlayer("a", "sledge", 0, undefined, undefined, ATTACK);
  const d = sim.addPlayer("d", "mute", 1, undefined, undefined, DEFENSE);
  const atk = sim.pawns.get(a.possessedPawnId)!;
  const def = sim.pawns.get(d.possessedPawnId)!;
  const g = (kind: string, over: Partial<Gadget> = {}): Gadget => ({
    id: 900,
    kind: kindOf(kind),
    owner: a.id,
    team: ATTACK,
    pos: [0, 0, 0],
    yaw: 0,
    vel: [0, 0, 0],
    flags: GFlag.OnFloor,
    panel: -1,
    launchTick: 0,
    fuseEnd: 0,
    signalEnd: 0,
    readyAt: 0,
    offEnd: 0,
    seq: 0,
    ...over,
  });
  const fx = (e: Gadget, at: Vec3 = e.pos) => blastEffects(sim, e, sim.data.gadgets.get(kindId(e.kind)!)!.blast!, at);
  const dmg = (e: Gadget, pawn = def) => fx(e).bodies.find((b) => b.pawn === pawn)?.damage ?? 0;
  return { sim, a, d, atk, def, g, fx, dmg };
}

describe("blast damage (Phase 8 M2)", () => {
  it("falls off in a straight line from fullM to zeroM", () => {
    const f = { max: 150, fullM: 1.5, zeroM: 3.6 };
    expect([blastFalloff(f, 0), blastFalloff(f, 1.5), blastFalloff(f, 3.6), blastFalloff(f, 5)]).toEqual([150, 150, 0, 0]);
    expect(blastFalloff(f, 2.55)).toBeCloseTo(75, 9);
  });

  it("a frag in the open: full close by, less further out, nothing past 3.6 m; its thrower too", async () => {
    const { sim, def, atk, g, dmg } = await setup();
    // The open floor between the spawn and the walls (clear of the platform's stairs).
    const frag = g("frag", { pos: [0, 0.04, 12] });
    sim.teleport(def.id, 0, 0, 13, 0);
    sim.teleport(atk.id, -20, 0, 12, 0);
    expect(dmg(frag)).toBe(150);
    sim.teleport(def.id, 0, 0, 14.5, 0);
    const mid = dmg(frag);
    expect(mid).toBeGreaterThan(20);
    expect(mid).toBeLessThan(150);
    sim.teleport(def.id, 0, 0, 16.5, 0);
    expect(dmg(frag)).toBe(0);
    sim.teleport(atk.id, 0, 0, 11, 0); // its own thrower is hurt as well
    expect(dmg(frag, atk)).toBe(150);
  });

  it("through a soft wall 70 % gets through; steel stops it", async () => {
    const { sim, def, g, dmg } = await setup();
    // In front of the plain soft wall (its faces at z −5.9 and −6.1), the body 0.9 m behind it.
    sim.teleport(def.id, -8, 0, -7.0, 0);
    expect(dmg(g("frag", { pos: [-8, 0.04, -5.5] }))).toBe(Math.round(150 * 0.7));
    // The same at the reinforced wall: nothing.
    sim.teleport(def.id, 11.5, 0, -7.0, 0);
    expect(dmg(g("frag", { pos: [11.5, 0.04, -5.5] }))).toBe(0);
  });

  it("a Breach Charge on a wall: its placer's side by its near curve (none past 1 m), the far side lethal close; it cuts its frame there", async () => {
    const { sim, atk, def, g, fx } = await setup();
    const soft = sim.level.panels.byId.get("soft_plain")!.panel.spec.index;
    // On the plain soft wall's front (toward +z, the placer's side), at chest height.
    const charge = g("breach_charge", { pos: [-8, 1.3, -5.88], yaw: Math.PI, flags: 0, panel: soft });
    sim.teleport(atk.id, -8, 0, -5.2, 0);
    sim.teleport(def.id, -8, 0, -6.5, 0);
    const out = fx(charge);
    const near = out.bodies.find((b) => b.pawn === atk)!.damage;
    const far = out.bodies.find((b) => b.pawn === def)!.damage;
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThanOrEqual(50);
    expect(far).toBeGreaterThan(100);
    // A step further back on the placer's side: out of its near curve.
    sim.teleport(atk.id, -8, 0, -4.0, 0);
    expect(fx(charge).bodies.some((b) => b.pawn === atk)).toBe(false);
    // Its cut is a rectangle in its own panel's skins (and studs: this wall has none).
    expect(out.panelOps.length).toBeGreaterThan(0);
    for (const o of out.panelOps) expect([o.panel, o.op.kind === "cut" && o.op.shape.kind]).toEqual([soft, "rect"]);
  });

  it("the Claymore: in its 180° in front, and within 1 m behind it; not further behind", async () => {
    const { sim, def, g, dmg } = await setup();
    const clay = g("claymore", { pos: [0, 0.07, 13], yaw: 0 }); // facing −z
    sim.teleport(def.id, 0, 0, 11.5, 0);
    expect(dmg(clay)).toBe(155);
    sim.teleport(def.id, 0, 0, 13.6, 0);
    expect(dmg(clay)).toBe(155);
    sim.teleport(def.id, 0, 0, 15.0, 0);
    expect(dmg(clay)).toBe(0);
  });

  it("destroys gadgets in its destruction range (a Bulletproof Camera there too), not past it nor behind steel", async () => {
    const { sim, g, fx } = await setup();
    const near = sim.gadgets.add({ ...g("claymore", { pos: [0, 0.07, 10] }) });
    const cam = sim.gadgets.add({ ...g("bulletproof_camera", { pos: [2, 0.06, 12], team: DEFENSE }) });
    sim.gadgets.add({ ...g("claymore", { pos: [0, 0.07, 16] }) }); // 4 m away: past its 3.6 m
    const behindSteel = sim.gadgets.add({ ...g("proximity_alarm", { pos: [11.5, 0.5, -6.5], team: DEFENSE }) });
    const blast = fx(g("frag", { pos: [0, 0.04, 12] }));
    expect(blast.gadgets.map((e) => e.id).sort()).toEqual([near.id, cam.id].sort());
    expect(fx(g("frag", { pos: [11.5, 0.04, -5.5] })).gadgets.map((e) => e.id)).not.toContain(behindSteel.id);
  });

  it("the Claymore destroys gadgets and breaks barricades only in its arc (and just behind it)", async () => {
    const { sim, g, fx } = await setup();
    const ahead = sim.gadgets.add({ ...g("proximity_alarm", { pos: [0, 0.1, 11.5], team: DEFENSE }) });
    const close = sim.gadgets.add({ ...g("proximity_alarm", { pos: [0, 0.1, 13.6], team: DEFENSE }) });
    sim.gadgets.add({ ...g("proximity_alarm", { pos: [0, 0.1, 14.5], team: DEFENSE }) }); // 1.5 m behind it: past its 1 m
    expect(fx(g("claymore", { pos: [0, 0.07, 13], yaw: 0 })).gadgets.map((e) => e.id).sort()).toEqual([ahead.id, close.id].sort());
    const door = sim.level.panels.byId.get("door_a")!.panel.spec.index;
    // 1.2 m from the barricaded door: facing it, it breaks it; facing away (the door 1.2 m behind it), it doesn't.
    expect(fx(g("claymore", { pos: [-10, 0.07, 7.25], yaw: 0 })).panelOps.some((o) => o.panel === door)).toBe(true);
    expect(fx(g("claymore", { pos: [-10, 0.07, 7.25], yaw: Math.PI })).panelOps.some((o) => o.panel === door)).toBe(false);
  });

  it("doesn't blow a smoke cloud away (Phase 8 M3)", async () => {
    const { sim, g, fx } = await setup();
    const cloud = sim.gadgets.add({ ...g("smoke", { pos: [0, 0.05, 13], flags: GFlag.OnFloor | GFlag.Active, fuseEnd: 9999 }) });
    const grenade = sim.gadgets.add({ ...g("smoke", { pos: [1, 0.05, 13] }) }); // one not gone off yet is a gadget like any
    expect(fx(g("frag", { pos: [0, 0.04, 12] })).gadgets.map((e) => e.id)).toEqual([grenade.id]);
    expect(cloud.id).toBeGreaterThan(0);
  });

  it("a charge's own panel neither stops nor dims its blast: a Hard Breach Charge on steel reaches a defender right behind", async () => {
    const { sim, def, g, dmg } = await setup();
    const steel = sim.level.panels.byId.get("reinforced")!.panel.spec.index;
    sim.teleport(def.id, 11.5, 0, -6.45, 0);
    expect(dmg(g("hard_breach_charge", { pos: [11.5, 1.0, -5.85], yaw: Math.PI, flags: 0, panel: steel }))).toBe(5);
    // A blast that isn't on it (a frag in front of the same wall) is still stopped by its steel.
    expect(dmg(g("frag", { pos: [11.5, 1.0, -5.75] }))).toBe(0);
  });

  it("a grenade cuts the soft walls close by and breaks a barricade in range; it doesn't reach a wall 2 m away", async () => {
    const { sim, g, fx } = await setup();
    const soft = sim.level.panels.byId.get("soft_plain")!.panel.spec.index;
    const door = sim.level.panels.byId.get("door_a")!.panel.spec.index;
    expect(fx(g("frag", { pos: [-8, 0.6, -5.4] })).panelOps.some((o) => o.panel === soft && o.op.kind === "cut")).toBe(true);
    expect(fx(g("frag", { pos: [-8, 0.6, -3.5] })).panelOps.some((o) => o.panel === soft)).toBe(false);
    expect(fx(g("frag", { pos: [-10, 0.3, 7.5] })).panelOps.some((o) => o.panel === door && o.op.kind === "damage")).toBe(true);
  });
});
