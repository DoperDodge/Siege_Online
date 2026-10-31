// The hands (Phase 8 M1, gadgets/DESIGN.md §2): the gadget key and the ability key take a slot's gadget out (its
// detonator first while devices wait) and put it away, the weapon put away meanwhile; Fire throws or places (held) or
// presses the detonator; ADS lobs; Interact held takes a gadget back. A server's side turns the events into the table.
import { describe, expect, it } from "vitest";
import {
  Btn,
  defaultLoadoutPick,
  GadgetAct,
  GadgetServer,
  GFlag,
  Hand,
  kindOf,
  PawnMode,
  Sim,
  ticks,
  WeaponAct,
  type InputCmd,
  type LoadoutPick,
  type SimEvent,
} from "../src/index.js";
import { input } from "./helpers.js";

/** In front of the Destruction Lab's plain soft wall (centre −8, 1.5, −6), 1.4 m from it, facing it. */
const SOFT: [number, number, number] = [-8, 0, -4.5];

async function lab(op: string, at: [number, number, number] = [0, 0, 10], yawDeg = 0, gadgets?: string[]) {
  const sim = await Sim.create("destruction_lab");
  const server = new GadgetServer(sim);
  const pick: LoadoutPick | undefined = gadgets ? { ...defaultLoadoutPick(sim.data, op), gadgets } : undefined;
  const c = sim.addPlayer("p", op, 0, undefined, pick);
  const body = sim.pawns.get(c.possessedPawnId)!;
  sim.teleport(body.id, ...at, yawDeg);
  const events: SimEvent[] = [];
  const step = (cmd: Partial<InputCmd> & { yawDeg?: number } = {}, n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step(new Map([[c.id, input({ yawDeg, ...cmd })]]));
      events.push(...sim.events);
      for (const e of sim.events) server.onEvent(e);
      server.step();
    }
  };
  const of = <K extends SimEvent["kind"]>(kind: K) => events.filter((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind);
  const equip = ticks(sim.data.gadgetRules.equipS);
  /** Press a key once, then let the gadget come out. */
  const press = (buttons: number, cmd: Partial<InputCmd> = {}) => {
    step({ ...cmd, buttons });
    step(cmd, equip);
  };
  step({}, 8);
  return { sim, server, c, body, s: body.state, step, of, press, equip };
}

describe("taking a gadget out and putting it away (Phase 8 M1)", () => {
  it("the gadget key takes slot 1's out over its equip time and puts it away; the weapon fires only once it's back up", async () => {
    const { s, step, of, equip } = await lab("sledge");
    expect([s.g1, s.g2, s.hand]).toEqual([2, 0, Hand.Weapon]); // two frags; no second slot
    step({ buttons: Btn.Gadget });
    expect([s.hand, s.gAct]).toEqual([Hand.Gadget, GadgetAct.Equip]);
    step({}, equip - 1);
    expect(s.gAct).toBe(GadgetAct.Equip);
    step({});
    expect(s.gAct).toBe(GadgetAct.Ready);
    // While it's out the weapon doesn't aim or fire: ADS lobs it, and the second one comes out.
    step({ buttons: Btn.Ads }, 30);
    expect([s.adsQ, of("shot").length, of("throw").length, s.hand, s.gAct]).toEqual([0, 0, 1, Hand.Gadget, GadgetAct.Equip]);
    // Away again: the weapon comes back up over its equip time.
    step({}, equip);
    step({ buttons: Btn.Gadget });
    expect([s.hand, s.wAct]).toEqual([Hand.Weapon, WeaponAct.Equip]);
    step({}, 64);
    step({ buttons: Btn.Fire });
    expect(of("shot").length).toBe(1);
  });

  it("the other weapon's key puts the gadget away and swaps to it; the ability key does nothing without a second slot", async () => {
    const { s, step, press } = await lab("sledge");
    press(Btn.Gadget);
    step({ buttons: Btn.Swap });
    expect([s.hand, s.slot, s.wAct]).toEqual([Hand.Weapon, 1, WeaponAct.Equip]);
    step({ buttons: Btn.Ability }, 2);
    expect(s.hand).toBe(Hand.Weapon);
  });

  it("a kit's second gadget is on the ability key (Striker), the first on the gadget key", async () => {
    const { s, step, press } = await lab("striker", [0, 0, 10], 0, ["frag", "claymore"]);
    expect([s.g1, s.g2]).toEqual([2, 2]);
    press(Btn.Ability);
    expect(s.hand).toBe(Hand.Ability);
    press(Btn.Gadget);
    expect(s.hand).toBe(Hand.Gadget);
    step({ buttons: Btn.Gadget });
    expect(s.hand).toBe(Hand.Weapon);
  });

  it("going down drops the gadget from the hands", async () => {
    const { sim, s, step, press, body } = await lab("sledge");
    press(Btn.Gadget);
    s.hp = 1;
    s.mode = PawnMode.Downed;
    s.downHp = 20;
    step({});
    expect(s.hand).toBe(Hand.Weapon);
    void sim;
    void body;
  });
});

describe("throwing (Phase 8 M1)", () => {
  it("Fire winds up and throws overhand: one fewer, the next comes out; the last brings the weapon back", async () => {
    const { sim, s, step, of, press } = await lab("sledge");
    press(Btn.Gadget);
    const windup = Math.max(1, ticks(sim.data.gadgetRules.throw.windupS));
    step({ buttons: Btn.Fire }, windup - 1);
    expect(of("throw")).toEqual([]);
    step({ buttons: Btn.Fire });
    const [t] = of("throw");
    expect([t.gadget, t.slot]).toEqual(["frag", 1]);
    // Overhand: at its speed, up a little from the view, from beside the eye.
    expect(Math.hypot(...t.vel)).toBeCloseTo(sim.data.gadgetRules.throw.overhand.speedMps, 3);
    expect(t.vel[2]).toBeLessThan(0);
    expect([s.g1, s.hand, s.gAct]).toEqual([1, Hand.Gadget, GadgetAct.Equip]);
    step({}, 40);
    step({ buttons: Btn.Ads }, windup);
    expect(of("throw").length).toBe(2);
    expect(Math.hypot(...of("throw")[1].vel)).toBeCloseTo(sim.data.gadgetRules.throw.underhand.speedMps, 3);
    expect([s.g1, s.hand]).toEqual([0, Hand.Weapon]);
  });

  it("the room's table has the throw flying, then resting on the floor; at its fuse it goes off and is gone", async () => {
    const { sim, step, press } = await lab("sledge");
    press(Btn.Gadget);
    step({ buttons: Btn.Ads, pitch: -0.3 }, ticks(sim.data.gadgetRules.throw.windupS));
    const [g] = sim.gadgets.list;
    expect([g.kind, g.flags & GFlag.Flying, g.fuseEnd - g.launchTick]).toEqual([kindOf("frag"), GFlag.Flying, ticks(4)]);
    // It lands and rolls to rest: its fuse cut to 2 s from the first bounce.
    let landed = sim.gadgets.list[0];
    for (let i = 0; i < 3 * 64 && landed.flags & GFlag.Flying; i++) {
      step({});
      landed = sim.gadgets.list[0];
    }
    expect(landed.flags & (GFlag.Flying | GFlag.OnFloor)).toBe(GFlag.OnFloor);
    expect(landed.pos[1]).toBeCloseTo(sim.data.gadgetRules.throw.radiusM, 1);
    expect(landed.fuseEnd).toBeLessThan(g.fuseEnd);
    while (sim.tick < landed.fuseEnd) step({});
    expect(sim.gadgets.list).toEqual([]);
  });
});

describe("placing and detonators (Phase 8 M1)", () => {
  it("a Breach Charge: Fire held at a soft wall places it on the wall; then the detonator is out, and sets it off", async () => {
    const { sim, s, step, of, press } = await lab("fuze", SOFT, 0, ["breach_charge"]);
    press(Btn.Gadget);
    const place = ticks((sim.data.gadgets.get("breach_charge")!.use as { placeS: number }).placeS);
    step({ buttons: Btn.Fire }, place - 1);
    expect(of("place")).toEqual([]);
    step({ buttons: Btn.Fire });
    const [p] = of("place");
    expect([p.onFloor, p.flat, Math.abs(p.pos[2] + 5.9) < 0.05]).toEqual([false, false, true]);
    expect([s.g1, s.w1, s.hand]).toEqual([2, 1, Hand.Detonator]);
    expect(sim.gadgets.list.map((g) => g.kind)).toEqual([kindOf("breach_charge")]);
    // The gadget key swaps the detonator for the next charge, and back.
    step({});
    step({ buttons: Btn.Gadget });
    expect(s.hand).toBe(Hand.Gadget);
    step({});
    step({ buttons: Btn.Gadget });
    expect(s.hand).toBe(Hand.Weapon);
    step({});
    step({ buttons: Btn.Gadget });
    expect(s.hand).toBe(Hand.Detonator); // a charge waits: the detonator comes out first
    step({}, 40);
    step({ buttons: Btn.Fire });
    expect(of("detonate").length).toBe(1);
    expect([s.w1, s.hand]).toEqual([0, Hand.Gadget]);
    expect(sim.gadgets.list).toEqual([]);
  });

  it("a Breach Charge can't go on reinforced steel, a hard wall or the floor in the open; a Hard Breach Charge goes on steel", async () => {
    const reinforced: [number, number, number] = [11.5, 0, -4.5];
    const a = await lab("fuze", reinforced, 0, ["breach_charge"]);
    a.press(Btn.Gadget);
    a.step({ buttons: Btn.Fire }, 200);
    a.step({ buttons: Btn.Fire, pitch: -1.2 }, 200);
    expect(a.of("place")).toEqual([]);
    const b = await lab("fuze", reinforced, 0, ["hard_breach_charge"]);
    b.press(Btn.Gadget);
    b.step({ buttons: Btn.Fire }, 200);
    expect(b.of("place").length).toBe(1);
    // Its own fuse, 4 s after it's placed: then it's gone.
    const [g] = b.sim.gadgets.list;
    expect(g.fuseEnd - b.sim.tick).toBeGreaterThan(ticks(4) - 200);
    while (b.sim.tick <= g.fuseEnd) b.step({});
    expect(b.sim.gadgets.list).toEqual([]);
  });

  it("let go before it's placed, nothing is; the body stands still while placing", async () => {
    const { sim, body, step, of, press } = await lab("fuze", SOFT, 0, ["breach_charge"]);
    press(Btn.Gadget);
    const at = { x: body.state.x, z: body.state.z };
    step({ buttons: Btn.Fire, forward: 1 }, 40);
    expect(Math.hypot(body.state.x - at.x, body.state.z - at.z)).toBeLessThan(0.01);
    step({ forward: 0 }, 4);
    expect([of("place").length, body.state.gAct, body.state.g1]).toEqual([0, GadgetAct.Ready, 3]);
    void sim;
  });

  it("a Nitro Cell is thrown and sticks to the wall it hits, facing out of it; its detonator sets it off", async () => {
    const { sim, s, step, of, press } = await lab("pulse", SOFT, 0, ["nitro_cell"]);
    press(Btn.Gadget);
    step({ buttons: Btn.Fire }, ticks(sim.data.gadgetRules.throw.windupS));
    expect([s.w1, s.hand]).toEqual([1, Hand.Detonator]);
    for (let i = 0; i < 64 && sim.gadgets.list[0].flags & GFlag.Flying; i++) step({});
    const g = sim.gadgets.list[0];
    expect(g.flags & (GFlag.Flying | GFlag.OnFloor)).toBe(0);
    expect(g.pos[2]).toBeCloseTo(-5.9 + sim.data.gadgetRules.throw.radiusM, 1);
    expect(Math.abs(Math.abs(g.yaw) - Math.PI)).toBeLessThan(1e-3);
    step({}, 4);
    step({ buttons: Btn.Fire });
    expect([of("detonate").length, sim.gadgets.list.length, s.hand]).toEqual([1, 0, Hand.Weapon]);
  });
});

describe("taking a gadget back (Phase 8 M1)", () => {
  it("Interact held on your own barbed wire takes it back into its slot; someone else's stays", async () => {
    const { sim, c, s, step, of, press } = await lab("sentry", [0, 0, 10], 0, ["barbed_wire", "bulletproof_camera"]);
    press(Btn.Gadget);
    step({ buttons: Btn.Fire, pitch: -0.9 }, 64);
    expect(of("place").length).toBe(1);
    expect([s.g1, s.hand]).toEqual([1, Hand.Gadget]);
    step({ buttons: Btn.Gadget });
    step({ pitch: -0.9 }, 30);
    expect(sim.prompt(c.id)).toBe("pickUpGadget");
    step({ pitch: -0.9, buttons: Btn.Interact }, ticks(sim.data.gadgetRules.pickUpS));
    expect([of("pickUpGadget").length, s.g1, sim.gadgets.list.length]).toEqual([1, 2, 0]);
    // Someone else's: nothing to take back.
    const other = sim.addPlayer("q", "sentry", 1, undefined, { ...defaultLoadoutPick(sim.data, "sentry"), gadgets: ["barbed_wire", "bulletproof_camera"] });
    const { id: _, ...entry } = { ...of("place")[0], id: 0 };
    void entry;
    sim.gadgets.add({ kind: kindOf("barbed_wire"), owner: other.id, team: 1, pos: of("place")[0].pos, yaw: 0, vel: [0, 0, 0], flags: GFlag.OnFloor, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, seq: 0 });
    step({ pitch: -0.9 }, 4);
    expect(sim.prompt(c.id)).not.toBe("pickUpGadget");
  });
});
