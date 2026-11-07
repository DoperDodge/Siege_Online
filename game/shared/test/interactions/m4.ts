// Interaction rows of Phase 8 M4 (gadgets/DESIGN.md §7, §12): Sledge's breaching hammer. Sledge (client 0) takes it out
// of his slot 2 with Z and swings it with Fire, as a player does; the room judges each blow (net/room.ts judgeSwing,
// gadgets/hammer.ts) on the Gadget Lab's walls, floors, gadgets and bodies.
import { expect } from "vitest";
import { Btn, DEFENSE, GFlag, Hand, kindOf, L_BACK, L_CORE, L_FRONT, PawnMode, Stance, ticks, type InputCmd, type Vec3 } from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** Sledge (client 0) and Mute (or `ops`) on the Gadget Lab, everyone out of the way. */
async function lab(ops: string[] = ["sledge", "mute"]) {
  const s = await scene(ops, "gadget_lab");
  s.park();
  return s;
}

const hammer = (s: Scene) => s.sim.data.gadgets.get("breaching_hammer")!;
const use = (s: Scene) => {
  const u = hammer(s).use;
  if (u.kind !== "swing") throw new Error("the hammer is swung");
  return u;
};

/** Sledge's charges left (his slot 2). */
const charges = (s: Scene) => s.body(0).state.g2;

/**
 * Sledge, standing (or as `hold` says) where he is, takes his hammer out if it isn't (Z) and swings it once looking at
 * `at`: the swing's blow lands and it ends.
 */
function swing(s: Scene, at: Vec3, hold: Partial<InputCmd> = {}) {
  s.clients[0].cmd = { ...hold };
  s.wait(hold.stance ? 32 : 2);
  const aim = { ...hold, ...s.aimAt(0, at) };
  if (s.body(0).state.hand !== Hand.Ability) {
    s.press(0, Btn.Ability, aim);
    s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  }
  s.press(0, Btn.Fire, aim);
  s.wait(ticks(use(s).swingS) + 4);
}

// ---------------------------------------------------------------- surfaces

row("sledge.breaching_hammer", "surface.soft_wall", async () => {
  // Within 1 m both faces and the wooden studs go (a rectangle round where it lands; ours 0.9 × 1.1 m), and a second
  // swing lower makes it a hole to walk through; from further away only the near face breaks. Each costs a charge.
  const s = await lab();
  const n = charges(s);
  s.teleport(0, -12, 0, -5.0);
  const high: Vec3 = [-12.1, 1.3, -5.9];
  expect(s.solidAt("soft_studs", L_CORE, [-12.29, 1.3, -6])).toBe(true);
  swing(s, high);
  for (const l of [L_FRONT, L_BACK, L_CORE]) expect(s.solidAt("soft_studs", l, [-12.29, 1.3, -6]), `layer ${l}`).toBe(false);
  swing(s, [-12.1, 0.4, -5.9]);
  expect([L_FRONT, L_BACK].every((l) => !s.solidAt("soft_studs", l, [-12.1, 0.1, -6]) && !s.solidAt("soft_studs", l, [-12.1, 1.75, -6]))).toBe(true);
  expect(charges(s)).toBe(n - 2);
  // 1.5 m from the plain soft wall: the near face only (a panel's back layer is on its +n side: here the +z face, his).
  s.teleport(0, -8, 0, -4.2);
  swing(s, [-8, 1.3, -5.9]);
  const [near, far] = s.panel("soft_plain").frame.n[2] > 0 ? [L_BACK, L_FRONT] : [L_FRONT, L_BACK];
  expect([s.solidAt("soft_plain", near, [-8, 1.3, -6]), s.solidAt("soft_plain", far, [-8, 1.3, -6])]).toEqual([false, true]);
});

row("sledge.breaching_hammer", "surface.soft_floor", async () => {
  // From above, close: a hole to see and shoot through (the metal joists stay; floors are never passable).
  const s = await lab();
  const floor = s.panel("soft_floor").panel;
  const joists = floor.layers[L_CORE]!.reduce((a, b) => a + b, 0);
  s.teleport(0, 14.5, 3.0, 8.9);
  swing(s, [14.5, 3.0, 8.2], { stance: Stance.Crouch });
  expect([L_FRONT, L_BACK].every((l) => !s.solidAt("soft_floor", l, [14.5, 2.95, 8.2]))).toBe(true);
  expect(floor.layers[L_CORE]!.reduce((a, b) => a + b, 0)).toBe(joists);
  expect(s.body(0).state.y).toBeGreaterThan(2.9);
});

row("sledge.breaching_hammer", "surface.hatch", async () => {
  // An unreinforced hatch breaks in one swing.
  const s = await lab();
  s.teleport(0, 10, 3.0, 8.9);
  swing(s, [10, 3.0, 8], { stance: Stance.Crouch });
  expect(s.panel("hatch").panel.broken).toBe(true);
});

row("sledge.breaching_hammer", "surface.barricade", async () => {
  // A barricade goes in one swing.
  const s = await lab();
  s.teleport(0, -10, 0, 7.0);
  swing(s, [-10, 1.2, 6.05]);
  expect(s.panel("door_a").panel.broken).toBe(true);
});

row("sledge.breaching_hammer", "surface.reinforced_wall", async () => {
  // Steel takes nothing, and the swing is still spent.
  const s = await lab();
  const n = charges(s);
  s.teleport(0, 11.5, 0, -5.0);
  swing(s, [11.5, 1.3, -5.9]);
  expect([s.panel("reinforced").panel.modified, charges(s)]).toEqual([false, n - 1]);
});

row("sledge.breaching_hammer", "surface.reinforced_hatch", async () => {
  // A reinforced hatch takes nothing either; the swing is spent.
  const s = await lab();
  s.room.queuePanelOp(s.panel("hatch").panel.spec.index, { kind: "reinforce", section: 0, side: 1 });
  s.wait(2);
  const n = charges(s);
  s.teleport(0, 10, 3.0, 8.9);
  swing(s, [10, 3.0, 8], { stance: Stance.Crouch });
  expect([s.panel("hatch").panel.broken, s.panel("hatch").panel.reinforced, charges(s)]).toEqual([false, 1, n - 1]);
});

row("sledge.breaching_hammer", "surface.hard_wall", async () => {
  // A hard wall takes nothing; the swing is spent. (A swing at the air isn't.)
  const s = await lab();
  const n = charges(s);
  s.teleport(0, -8, 0, 7.0);
  swing(s, [-8, 1.2, 6.1]);
  expect(charges(s)).toBe(n - 1);
  s.teleport(0, 0, 0, 20);
  swing(s, [0, 1.6, 10]);
  expect(charges(s)).toBe(n - 1);
});

// ---------------------------------------------------------------- gadgets

/** Defender gadgets one swing destroys (as a blast destroys them), each on the floor in front of him (he crouches to it). */
for (const kind of ["barbed_wire", "deployable_shield", "proximity_alarm", "observation_blocker", "nitro_cell"])
  row("sledge.breaching_hammer", `generic.${kind}`, async () => {
    const s = await lab();
    const size = s.sim.data.gadgets.get(kind)!.sizeM;
    const e = s.put(kind, 1, [0, size[1] / 2, 13]);
    s.wait(2);
    s.teleport(0, 0, 0, 13.4 + size[2] / 2 + 0.35);
    swing(s, e.pos, { stance: Stance.Crouch });
    expect(s.sim.gadgets.get(e.id)).toBeUndefined();
  });

row("sledge.breaching_hammer", "generic.bulletproof_camera", async () => {
  // A Bulletproof Camera: its glass is done for (it stays on the defenders' list, broken).
  const s = await lab();
  const cam = s.put("bulletproof_camera", 1, [-8, 1.3, -5.85], { yaw: Math.PI, flags: 0, panel: s.panel("soft_plain").panel.spec.index });
  s.teleport(0, -8, 0, -4.9);
  swing(s, cam.pos);
  expect(s.sim.gadgets.get(cam.id)!.flags & GFlag.Broken).toBe(GFlag.Broken);
});

row("sledge.breaching_hammer", "ingredient.gas_pipe", async () => {
  // A gas pipe it hits is set off (UNVERIFIED: Fandom only says props cost a swing).
  const s = await lab();
  const pipe = s.sim.gadgets.list.find((g) => g.kind === kindOf("gas_pipe"))!;
  s.teleport(0, pipe.pos[0] + 0.9, 0, pipe.pos[2] + 0.9);
  swing(s, pipe.pos);
  expect(s.sim.gadgets.get(pipe.id)!.flags & GFlag.Active).toBe(GFlag.Active);
});

// ---------------------------------------------------------------- bodies

row("sledge.breaching_hammer", "player.defender", async () => {
  // One blow kills (UNVERIFIED this season), and a kill costs 2 charges (Fandom's Breaching Hammer page).
  const s = await lab();
  s.teleport(1, 0, 0, 13);
  s.teleport(0, 0, 0, 14.2);
  const n = charges(s);
  swing(s, [0, 1.2, 13]);
  expect([s.body(1).state.mode, charges(s)]).toEqual([PawnMode.Dead, n - 2]);
  expect(s.clients[0].events.some((e) => e.kind === "kill" && e.victimPawn === s.body(1).id && e.weapon === "breaching_hammer")).toBe(true);
});

row("sledge.breaching_hammer", "skopos.shell_active", async () => {
  // Skopós in her shell: the same (UNVERIFIED for shells).
  const s = await lab(["sledge", "skopos"]);
  s.teleport(1, 0, 0, 13);
  s.teleport(0, 0, 0, 14.2);
  const shell = s.body(1);
  swing(s, [0, 1.2, 13]);
  expect(shell.state.mode).toBe(PawnMode.Dead);
});

row("generic.bulletproof_camera_dart", "sledge.breaching_hammer", async () => {
  // An EMP on him (DSEG) takes his sights' zoom, not his hammer: EMP'd, he still breaks a barricade.
  const s = await lab();
  s.teleport(0, -10, 0, 7.0);
  s.room.gadgetServer.emp(DEFENSE, [-10, 1.5, 7.0], 0.75, 6);
  expect(s.body(0).state.jammed).toBeGreaterThan(0);
  swing(s, [-10, 1.2, 6.05]);
  expect(s.panel("door_a").panel.broken).toBe(true);
});
