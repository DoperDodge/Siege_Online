// The interaction tests' scene (Phase 8, gadgets/DESIGN.md §10): a lab room on the Destruction Lab level with
// in-process clients (roomHarness.ts), and what a row needs to set up: an entry put straight into the gadget table, a
// body moved, a gadget set off through the room's own path, a shot down the sights, a panel's cell looked at, ticks run.
import { Btn, eyePose, GadgetAct, GFlag, Hand, handSlot, kindOf, slotGadget, ticks, type Gadget, type InputCmd, type Pawn, type PanelEntry, type Vec3 } from "../../src/index.js";
import { roomWith } from "../roomHarness.js";

/** Places on the Destruction Lab level (data/maps/destruction_lab/layout.json). */
export const LAB = {
  /** The open floor between the spawn and the walls, clear of the platform's stairs. */
  open: [0, 0.05, 12] as Vec3,
  /** The plain soft wall's front face (toward +z) and the reinforced wall's, at z −5.9; the barricaded door's (+z) at 6.05. */
  softFace: -5.9,
  /** Out of the way of any blast. */
  away: [[-25, 0, 25], [25, 0, 25], [-25, 0, -25], [25, 0, -25]] as Vec3[],
};

export async function scene(ops: string[] = ["sledge", "mute"], level = "destruction_lab") {
  const h = await roomWith(level, ops);
  const sim = h.room.sim;
  const wait = (n: number) => {
    for (let i = 0; i < n; i++) h.tick();
  };
  wait(8);
  /** Client i's body. */
  const body = (i: number): Pawn => sim.pawns.get(h.clients[i].session.ctrl!.possessedPawnId)!;
  const teleport = (i: number, x: number, y: number, z: number, yawDeg = 0) => {
    h.room.onLabTool(h.clients[i].id, { kind: "teleport", x, y, z, yawDeg });
    wait(2);
  };
  /** Every body out of the way of blasts (each to its own corner). */
  const park = () => h.clients.forEach((_, i) => teleport(i, ...LAB.away[i % LAB.away.length]));
  /** An entry of `kind` straight into the table, client i's (its team), standing at `pos` facing `yaw`. */
  const put = (kind: string, i: number, pos: Vec3, over: Partial<Gadget> = {}): Gadget =>
    sim.gadgets.add({
      kind: kindOf(kind),
      owner: h.clients[i].session.ctrl!.id,
      team: body(i).team,
      pos,
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
  /** The panel entry of a level solid. */
  const panel = (id: string): PanelEntry => sim.level.panels.byId.get(id)!;
  /** On a panel's face toward +z (or on top of a floor, `flat`): a charge's entry fields there. */
  const onPanel = (id: string, at: Vec3, flat = false): Partial<Gadget> => ({ pos: at, yaw: flat ? 0 : Math.PI, flags: flat ? GFlag.OnFloor | GFlag.Flat : 0, panel: panel(id).panel.spec.index });
  /** Set an entry off the way the room does (its fuse, its detonator or its tripwire), and let the tick's ops apply. */
  const setOff = (g: Gadget) => {
    h.room.gadgetServer.trigger(sim.gadgets.get(g.id)!, null);
    wait(3);
  };
  /** Whether a panel has material in `layer` at the world point (the cell its face is at there). */
  const solidAt = (id: string, layer: number, p: Vec3): boolean => {
    const e = panel(id);
    const f = e.frame;
    const rel = [p[0] - f.center[0], p[1] - f.center[1], p[2] - f.center[2]];
    const u = rel[0] * f.u[0] + rel[1] * f.u[1] + rel[2] * f.u[2] + f.w / 2;
    const v = rel[0] * f.v[0] + rel[1] * f.v[1] + rel[2] * f.v[2] + f.h / 2;
    const pn = e.panel;
    const cells = pn.layers[layer];
    if (!cells) return false;
    const cu = Math.max(0, Math.min(pn.w - 1, Math.floor(u / pn.cellU)));
    const cv = Math.max(0, Math.min(pn.h - 1, Math.floor(v / pn.cellV)));
    return cells[cv * pn.w + cu] !== 0;
  };
  /** Client i's view from its eye toward `at`. */
  const aimAt = (i: number, at: Vec3) => {
    const eye = eyePose(sim.data.movement, sim.data.hitboxes, body(i).state).pos;
    const v = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
    return { yaw: Math.atan2(-v[0], -v[2]), pitch: Math.atan2(v[1], Math.hypot(v[0], v[2])) };
  };
  /** Client i aims down the sights at `at` from where it stands, and fires once. */
  const shootAt = (i: number, at: Vec3) => {
    const aim = aimAt(i, at);
    const c = h.clients[i];
    c.cmd = { ...aim, buttons: Btn.Ads };
    wait(64);
    c.cmd = { ...aim, buttons: Btn.Ads | Btn.Fire };
    h.tick();
    c.cmd = { ...aim };
    wait(8);
  };
  /** Client i knifes what's at `at` (in reach), looking at it; `hold`: what else it holds meanwhile (a crouch). */
  const knife = (i: number, at: Vec3, hold: Partial<InputCmd> = {}) => {
    const c = h.clients[i];
    c.cmd = { ...hold };
    wait(hold.stance ? 32 : 0); // down to its eye height first
    const aim = { ...hold, ...aimAt(i, at) };
    c.cmd = aim;
    wait(4);
    c.cmd = { ...aim, buttons: Btn.Melee };
    h.tick();
    c.cmd = aim;
    wait(48);
  };
  /**
   * Client i takes its first gadget out (unless it's in hand) and holds Fire looking at `at` for its placing time (and a
   * little more), as a player places one: the entry it put in the table, or undefined (it can't go there).
   */
  const place = (i: number, at: Vec3): Gadget | undefined => {
    const c = h.clients[i];
    const g = slotGadget(sim.data, body(i).loadout, 1)!;
    const before = new Set(sim.gadgets.list.map((e) => e.id));
    const aim = aimAt(i, at);
    if (body(i).state.hand !== Hand.Gadget) {
      c.cmd = { ...aim, buttons: Btn.Gadget };
      h.tick();
    }
    c.cmd = { ...aim };
    wait(ticks(sim.data.gadgetRules.equipS) + 2);
    c.cmd = { ...aim, buttons: Btn.Fire };
    wait(ticks(g.use.kind === "place" ? g.use.placeS : 0) + 8);
    c.cmd = { ...aim };
    wait(2);
    return sim.gadgets.list.find((e) => !before.has(e.id));
  };
  /**
   * Client i's hand `want` out (a slot's item or its detonator), pressing that slot's key (3 or Z) as a player does,
   * and ready (its equip time over). Phase 8 M5.
   */
  const handOut = (i: number, want: Hand, look: Partial<InputCmd> = {}) => {
    const key = handSlot(want) === 1 ? Btn.Gadget : Btn.Ability;
    const equip = ticks(sim.data.gadgetRules.equipS) + 2;
    for (let k = 0; k < 3 && body(i).state.hand !== want; k++) {
      press(i, key, look);
      wait(equip);
    }
    if (body(i).state.gAct === GadgetAct.Equip) wait(equip);
    if (body(i).state.hand !== want) throw new Error(`client ${i} couldn't take out hand ${want} (has ${body(i).state.hand})`);
  };
  /**
   * Client i places its slot 2 item (its ability's: Z) looking at `at` from where it stands (or as `hold` says), Fire
   * held for its placing time, as a player does: the entry, or undefined (it can't go there). Phase 8 M5.
   */
  const plant = (i: number, at: Vec3, hold: Partial<InputCmd> = {}): Gadget | undefined => {
    const g = slotGadget(sim.data, body(i).loadout, 2)!;
    const before = new Set(sim.gadgets.list.map((e) => e.id));
    const c = h.clients[i];
    c.cmd = { ...hold };
    wait(hold.stance ? 32 : 2);
    const aim = { ...hold, ...aimAt(i, at) };
    handOut(i, Hand.Ability, aim);
    c.cmd = { ...aim, buttons: Btn.Fire };
    wait(ticks(g.use.kind === "place" ? g.use.placeS : 0) + 8);
    c.cmd = { ...aim };
    wait(2);
    return sim.gadgets.list.find((e) => !before.has(e.id) && e.kind === kindOf(g.id));
  };
  /** Client i presses the detonator of its slot `slot` (taking it out first). Phase 8 M5. */
  const detonate = (i: number, slot: 1 | 2 = 2) => {
    handOut(i, slot === 1 ? Hand.Detonator : Hand.AbilityDetonator);
    press(i, Btn.Fire);
  };
  /** Client i's controller on the server (its bodies, its drones, the camera it watches). */
  const ctrlOf = (i: number) => h.room.bodyOf(h.clients[i].id)!;
  /** Client i presses buttons once (down a tick, then up), looking `look`. */
  const press = (i: number, buttons: number, look: Partial<InputCmd> = {}) => {
    const c = h.clients[i];
    c.cmd = { ...look, buttons };
    h.tick();
    c.cmd = { ...look };
    h.tick();
  };
  /** The view from `from` toward `at`. */
  const look = (from: Vec3, at: Vec3) => {
    const v = [at[0] - from[0], at[1] - from[1], at[2] - from[2]];
    return { yaw: Math.atan2(-v[0], -v[2]), pitch: Math.atan2(v[1], Math.hypot(v[0], v[2])) };
  };
  /**
   * Client i scans (Phase 7: Fire held on a drone or a camera for data/intel.json `scan.holdS`) looking at pawn
   * `target`'s eye from wherever it looks through: whether its client was told it spotted that pawn.
   */
  const scan = (i: number, target: Pawn) => {
    const c = h.clients[i];
    const eye = eyePose(sim.data.movement, sim.data.hitboxes, target.state).pos;
    const view = look(sim.viewOf(ctrlOf(i))!.pos, eye);
    const before = c.events.length;
    c.cmd = { ...view };
    wait(40); // a camera turns toward the view first
    c.cmd = { ...view, buttons: Btn.Fire };
    wait(ticks(sim.data.intel.scan.holdS) + 4);
    c.cmd = { ...view };
    wait(2);
    return c.events.slice(before).some((e) => e.kind === "spotted" && e.pawnId === target.id);
  };
  return { ...h, sim, wait, body, teleport, park, put, panel, onPanel, setOff, solidAt, aimAt, shootAt, knife, place, ctrlOf, press, look, scan, handOut, plant, detonate };
}

export type Scene = Awaited<ReturnType<typeof scene>>;
