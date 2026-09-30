// Wire codecs and the Sim hooks netcode relies on (Phase 2).
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  ByteWriter,
  controllerState,
  hashPawnState,
  initialPawnState,
  PAWN_F32_FIELDS,
  PAWN_INT_FIELDS,
  PAWN_STATE_BYTES,
  ProtocolError,
  readControllerState,
  readPawnState,
  Sim,
  Stance,
  writeControllerState,
  writePawnState,
  type InputCmd,
  type PawnState,
} from "../src/index.js";
import { input, labWith, run, teleport } from "./helpers.js";

const wire = (s: PawnState): PawnState => {
  const w = new ByteWriter();
  writePawnState(w, s);
  return readPawnState(new ByteReader(w.finish()));
};

describe("byte codec", () => {
  it("round-trips every type, including long varints and non-ASCII strings", () => {
    const w = new ByteWriter(4); // forces growth
    w.u8(255).i8(-128).u16(65535).i16(-32768).u32(4294967295).i32(-2147483648).f32(1.5).f64(Math.PI);
    w.varu(0).varu(127).varu(128).varu(2 ** 40).str("Ulo ✓ 🎮 Skopós");
    const r = new ByteReader(w.finish());
    expect([r.u8(), r.i8(), r.u16(), r.i16(), r.u32(), r.i32(), r.f32(), r.f64()]).toEqual([255, -128, 65535, -32768, 4294967295, -2147483648, 1.5, Math.PI]);
    expect([r.varu(), r.varu(), r.varu(), r.varu()]).toEqual([0, 127, 128, 2 ** 40]);
    expect(r.str()).toBe("Ulo ✓ 🎮 Skopós");
    expect(r.remaining).toBe(0);
  });

  it("rejects truncated messages, oversized strings, bad varints and non-finite numbers", () => {
    expect(() => new ByteReader(new Uint8Array([1, 2])).u32()).toThrow(ProtocolError);
    expect(() => new ByteReader(new ByteWriter().str("x".repeat(300)).finish()).str(256)).toThrow(ProtocolError);
    expect(() => new ByteReader(new Uint8Array(9).fill(0x80)).varu()).toThrow(ProtocolError);
    expect(() => new ByteReader(new ByteWriter().f32(NaN).finish()).finite()).toThrow(ProtocolError);
    expect(() => new ByteReader(new ByteWriter().f32(Infinity).finish()).finite()).toThrow(ProtocolError);
  });
});

describe("PawnState codec", () => {
  it("covers every PawnState field, and the size constant is right", () => {
    const keys = Object.keys(initialPawnState(0, 0, 0, 0, 100)).sort();
    expect([...PAWN_F32_FIELDS, ...PAWN_INT_FIELDS].sort()).toEqual(keys);
    const w = new ByteWriter();
    writePawnState(w, initialPawnState(0, 0, 0, 0, 100));
    expect(w.length).toBe(PAWN_STATE_BYTES);
  });

  it("round-trips real states exactly (walking, prone on stairs, vaulting, on a ladder)", async () => {
    const { sim, ctrl, pawn } = await labWith();
    const states: PawnState[] = [];
    run(sim, ctrl, { forward: 1, buttons: Btn.Sprint, lean: 1 }, 0.3);
    states.push({ ...pawn.state });
    teleport(sim, ctrl, 14, 0, 9.5, 0);
    run(sim, ctrl, { forward: 1 }, 1);
    run(sim, ctrl, { stance: Stance.Prone, yawDeg: 45 }, 1.5);
    states.push({ ...pawn.state });
    teleport(sim, ctrl, -6, 0, 3.0, 0);
    run(sim, ctrl, { buttons: Btn.Vault }, 0.2);
    states.push({ ...pawn.state });
    teleport(sim, ctrl, -16, 0, -5.8, 0);
    run(sim, ctrl, { buttons: Btn.Interact }, 1 / 64);
    run(sim, ctrl, { forward: 1 }, 0.5);
    states.push({ ...pawn.state });
    for (const s of states) {
      expect(wire(s)).toEqual(s);
      expect(hashPawnState(wire(s))).toBe(hashPawnState(s));
    }
    expect(new Set(states.map((s) => s.mode)).size).toBeGreaterThan(2); // really covered several modes
  });

  it("the hash changes when any field changes by one float32 step", () => {
    const s = initialPawnState(1, 2, 3, 0.5, 100);
    const h = hashPawnState(s);
    for (const k of PAWN_F32_FIELDS) {
      const t = { ...s, [k]: Math.fround(s[k] + (Math.abs(s[k]) || 1) * 2 ** -23) };
      expect(hashPawnState(t), k).not.toBe(h);
    }
  });

  it("controller state round-trips", () => {
    const c = { possessedPawnId: 300, shellCam: true, swapPhase: 2 as const, swapT: 0.625, swapCooldown: 0.25, prevButtons: Btn.Ability | Btn.Interact };
    const w = new ByteWriter();
    writeControllerState(w, c);
    expect(readControllerState(new ByteReader(w.finish()))).toEqual(c);
  });
});

describe("Sim hooks for netcode", () => {
  it("a client can mirror the server's ids, and ids can't collide", async () => {
    const sim = await Sim.create("movement_lab");
    const c = sim.addPlayer("remote", "skopos", 0, { controller: 40, pawns: [41, 42] });
    expect(c.id).toBe(40);
    expect(c.pawnIds).toEqual([41, 42]);
    expect(sim.addPlayer("next", "sledge").id).toBeGreaterThan(42);
    expect(() => sim.addPlayer("dup", "sledge", 0, { controller: 50, pawns: [41] })).toThrow(/in use/);
    expect(() => sim.addPlayer("bad", "sledge", 0, { controller: 60, pawns: [61, 62] })).toThrow(/pawn/);
  });

  it("restoring a state mid-run and replaying the same inputs reproduces the run bit-for-bit", async () => {
    // Reconciliation in miniature: sim A plays 6 s of varied input; at tick 150 the pawn's state goes
    // over the wire into sim B, which replays the remaining inputs and must end identical.
    const a = await labWith();
    const cmds: InputCmd[] = [];
    for (let t = 0; t < 384; t++) {
      const phase = Math.floor(t / 48) % 8;
      cmds.push(
        input({
          forward: phase === 3 ? -1 : 1,
          strafe: phase === 5 ? 1 : 0,
          yawDeg: t * 0.9,
          buttons: (phase === 1 ? Btn.Sprint : 0) | (phase === 6 ? Btn.Vault : 0),
          stance: phase === 2 ? Stance.Crouch : phase === 4 ? Stance.Prone : Stance.Stand,
          lean: phase === 7 ? -1 : 0,
        }),
      );
    }
    let saved: { state: PawnState; tick: number } | null = null;
    for (let t = 0; t < cmds.length; t++) {
      if (t === 150) saved = { state: wire(a.pawn.state), tick: t };
      a.sim.step(new Map([[a.ctrl.id, cmds[t]]]));
    }
    const b = await Sim.create("movement_lab");
    const bc = b.addPlayer("replay", "sledge", 0, { controller: a.ctrl.id, pawns: a.ctrl.pawnIds });
    b.setPawnState(bc.possessedPawnId, saved!.state);
    for (let t = saved!.tick; t < cmds.length; t++) b.step(new Map([[bc.id, cmds[t]]]));
    const pb = b.pawns.get(bc.possessedPawnId)!;
    expect(hashPawnState(pb.state)).toBe(hashPawnState(a.pawn.state));
    expect(pb.state).toEqual(a.pawn.state);
    expect(controllerState(bc)).toEqual(controllerState(a.ctrl));
  });

  it("proxies are never stepped, and removing a player removes its colliders", async () => {
    const { sim } = await labWith();
    const colliders = sim.world.colliders.len();
    const proxyState = { ...initialPawnState(3, 0.02, 8, 0, 110), stance: Stance.Crouch, stanceFrom: Stance.Crouch };
    const proxy = sim.addProxy(900, "mute", proxyState);
    for (let i = 0; i < 64; i++) sim.step(new Map());
    expect(proxy.state).toEqual(proxyState); // gravity never touched it
    expect(proxy.collider.translation().y).toBeGreaterThan(0.5); // posed as a crouched body
    const joined = sim.addPlayer("guest", "skopos");
    expect(sim.world.colliders.len()).toBe(colliders + 3);
    sim.removePlayer(joined.id);
    sim.removePawn(900);
    expect(sim.world.colliders.len()).toBe(colliders);
    expect(sim.controllers.has(joined.id)).toBe(false);
  });
});
