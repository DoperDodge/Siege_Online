// Snapshot wire format (Phase 2): deltas, corrections, checksums, robustness and size.
import { describe, expect, it } from "vitest";
import {
  Btn,
  CHECKSUM_EVERY,
  controllerState,
  hashPawnState,
  interpolateRemote,
  poseHitboxes,
  ProtocolError,
  quantizeRemote,
  remoteState,
  Sim,
  SnapshotDecoder,
  SnapshotEncoder,
  Stance,
  type InputCmd,
  type RemoteQ,
} from "../src/index.js";
import { input } from "./helpers.js";

async function crowd(n = 10) {
  const sim = await Sim.create("movement_lab");
  const ctrls = Array.from({ length: n }, (_, i) => sim.addPlayer(`p${i}`, i === 2 ? "skopos" : "sledge"));
  return { sim, ctrls };
}

function play(sim: Sim, ctrls: ReturnType<Sim["addPlayer"]>[], t: number) {
  sim.step(
    new Map(
      ctrls.map((c, i) => {
        const phase = Math.floor(t / 80 + i) % 6;
        return [
          c.id,
          input({
            forward: phase === 5 ? 0 : 1,
            strafe: phase === 2 ? 1 : 0,
            yawDeg: t * (i % 2 ? 1.3 : -0.9) + i * 40,
            pitch: Math.sin(t / 30 + i) * 0.4,
            buttons: phase === 1 ? Btn.Sprint : phase === 4 ? Btn.Ads : 0,
            stance: phase === 3 ? Stance.Crouch : Stance.Stand,
            lean: phase === 4 ? -1 : 0,
          }),
        ] as [number, InputCmd];
      }),
    ),
  );
}

describe("snapshot codec", () => {
  it("round-trips deltas exactly, skips pawns that didn't change, and removes pawns", async () => {
    const { sim, ctrls } = await crowd(4);
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    for (let t = 0; t < 300; t++) {
      play(sim, ctrls, t);
      if (t % 2) continue;
      const remotes = new Map<number, RemoteQ>();
      for (const p of sim.pawns.values()) remotes.set(p.id, quantizeRemote(p.state));
      if (t === 200) remotes.delete([...remotes.keys()][0]); // a pawn leaves
      const snap = dec.decode(enc.encode(sim.tick, t, false, null, remotes));
      expect(snap.tick).toBe(sim.tick);
      expect(dec.have).toEqual(remotes);
      if (t === 200) expect(snap.removed).toHaveLength(1);
    }
    // Idle pawns cost nothing: nothing moves, the next snapshot has no records at all.
    const still = new Map([...dec.have]);
    const snap = dec.decode(enc.encode(sim.tick + 2, 0, false, null, still));
    expect(snap.records).toHaveLength(0);
  });

  it("carries an exact correction for the receiving player (both Skopós shells)", async () => {
    const { sim, ctrls } = await crowd(3);
    for (let t = 0; t < 90; t++) play(sim, ctrls, t);
    const sk = ctrls[2];
    const correction = { pawns: sk.pawnIds.map((id) => [id, sim.pawns.get(id)!.state] as [number, typeof sim.pawns extends Map<number, infer P> ? P extends { state: infer S } ? S : never : never]), ctrl: controllerState(sk), epoch: 7 };
    const snap = new SnapshotDecoder().decode(new SnapshotEncoder().encode(sim.tick, 1234, true, correction, new Map()));
    expect(snap.idled).toBe(true);
    expect(snap.ackSeq).toBe(1234);
    expect(snap.correction!.epoch).toBe(7);
    expect(snap.correction!.ctrl).toEqual(controllerState(sk));
    for (const [id, s] of snap.correction!.pawns) expect(hashPawnState(s)).toBe(hashPawnState(sim.pawns.get(id)!.state));
  });

  it("a periodic checksum catches a client whose baselines drifted, and a reset recovers", async () => {
    const { sim, ctrls } = await crowd(3);
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    let checked = 0;
    for (let s = 0; s < CHECKSUM_EVERY * 2; s++) {
      play(sim, ctrls, s * 2);
      play(sim, ctrls, s * 2 + 1);
      const remotes = new Map([...sim.pawns.values()].map((p) => [p.id, quantizeRemote(p.state)]));
      if (s === CHECKSUM_EVERY + 5) dec.have.get([...dec.have.keys()][0])!.x += 1; // corrupt the client's copy
      const snap = dec.decode(enc.encode(sim.tick, 0, false, null, remotes));
      if (snap.checksum !== null) {
        checked++;
        expect(dec.verify(snap)).toBe(s < CHECKSUM_EVERY + 5);
      }
    }
    expect(checked).toBe(2);
    enc.reset();
    dec.reset();
    const remotes = new Map([...sim.pawns.values()].map((p) => [p.id, quantizeRemote(p.state)]));
    dec.decode(enc.encode(sim.tick, 0, false, null, remotes));
    expect(dec.have).toEqual(remotes);
  });

  it("never crashes on garbage: random and truncated messages throw ProtocolError", async () => {
    const { sim, ctrls } = await crowd(3);
    for (let t = 0; t < 40; t++) play(sim, ctrls, t);
    const good = new SnapshotEncoder().encode(sim.tick, 5, false, null, new Map([...sim.pawns.values()].map((p) => [p.id, quantizeRemote(p.state)])));
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let i = 0; i < 2000; i++) {
      const bytes = i < good.length ? good.slice(0, i) : Uint8Array.from({ length: 1 + Math.floor(rnd() * 80) }, (_, k) => (k === 0 ? 0x10 : Math.floor(rnd() * 256)));
      try {
        new SnapshotDecoder().decode(bytes);
      } catch (e) {
        expect(e, `case ${i}`).toBeInstanceOf(ProtocolError);
      }
    }
  });

  it("ten busy players fit the bandwidth budget (PLAN §18: ≤ 64 kbps down per client)", async () => {
    const { sim, ctrls } = await crowd(10);
    const enc = new SnapshotEncoder();
    let bytes = 0;
    let msgs = 0;
    for (let t = 0; t < 64 * 20; t++) {
      play(sim, ctrls, t);
      if (sim.tick % 2) continue;
      const remotes = new Map([...sim.pawns.values()].filter((p) => p.ownerId !== ctrls[0].id).map((p) => [p.id, quantizeRemote(p.state)]));
      bytes += enc.encode(sim.tick, t, false, null, remotes).length;
      msgs++;
    }
    const payloadKbps = (bytes * 8) / 20 / 1000;
    const wireKbps = ((bytes + msgs * 76) * 8) / 20 / 1000; // + WebSocket, TLS and TCP/IP headers per message
    expect(payloadKbps).toBeLessThan(25);
    expect(wireKbps).toBeLessThan(50);
  });
});

describe("remote interpolation", () => {
  it("quantization moves hitboxes by at most a few millimetres", async () => {
    const { sim, ctrls } = await crowd(4);
    let worst = 0;
    for (let t = 0; t < 400; t++) {
      play(sim, ctrls, t);
      for (const p of sim.pawns.values()) {
        const exact = poseHitboxes(sim.data.movement, sim.data.hitboxes, p.state);
        const q = poseHitboxes(sim.data.movement, sim.data.hitboxes, remoteState(quantizeRemote(p.state), p.state.maxHp));
        exact.forEach((h, i) => {
          for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(h.a[k] - q[i].a[k]), Math.abs(h.b[k] - q[i].b[k]));
        });
      }
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("interpolating halfway lands between the two states, turning the short way round", () => {
    const a = remoteState({ ...quantizeRemote(remoteState({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, lean: 0, stanceT: 255, tiltF: 0, tiltB: 0, tiltSide: 0, tuck: 0, flags: 0, aux: 0 })), yaw: 65536 - 2000 });
    const b = { ...a, x: 2, yaw: a.yaw + 0.3 };
    const mid = interpolateRemote(a, b, 0.5);
    expect(mid.x).toBeCloseTo(1, 9);
    expect(mid.yaw).toBeCloseTo(a.yaw + 0.15, 9);
  });
});
