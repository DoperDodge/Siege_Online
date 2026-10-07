// Non-snapshot wire messages (Phase 2).
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  decodeError,
  decodeEvents,
  decodeHelloRest,
  decodeHelloVersion,
  decodeInput,
  decodeJoinRoom,
  decodeLabTool,
  decodePickLoadout,
  defaultLoadoutPick,
  decodePing,
  decodePong,
  decodeRoster,
  decodeShotResult,
  decodeWelcome,
  encodeError,
  encodeEvents,
  encodeHello,
  encodeInput,
  encodeJoinRoom,
  encodeLabTool,
  encodePickLoadout,
  loadGameData,
  encodePing,
  encodePong,
  encodeRoster,
  encodeShotResult,
  encodeWelcome,
  ErrorCode,
  Msg,
  PROTOCOL_VERSION,
  ProtocolError,
  quantizeInput,
  Stance,
  unwrap16,
  type GameEvent,
  type InputCmd,
} from "../src/index.js";

/** Skip the type byte, check it, and hand back a reader for the body. */
const body = (bytes: Uint8Array, type: number) => {
  expect(bytes[0]).toBe(type);
  return new ByteReader(bytes.subarray(1));
};

describe("input messages", () => {
  it("decode to exactly the quantized input the client predicted with", () => {
    const cmd: InputCmd = { seq: 70000, forward: 0.7071, strafe: -1, yaw: 2.123456789, pitch: -0.3, buttons: Btn.Sprint | Btn.Ads | Btn.Ability, stance: Stance.Prone, lean: -1 };
    const m = decodeInput(body(encodeInput({ cmd, predictedHash: 0xdeadbeef, epoch: 300, snapTick: 131074, viewBackQ8: 1234.4 }), Msg.Input));
    expect(m.cmd).toEqual({ ...quantizeInput(cmd), seq: 70000 & 0xffff });
    expect([m.predictedHash, m.epoch, m.snapTick, m.viewBackQ8]).toEqual([0xdeadbeef, 300 & 0xff, 131074 & 0xffff, 1234]);
  });

  it("reject bad enums and non-finite angles", () => {
    const good = encodeInput({ cmd: { seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 }, predictedHash: 0, epoch: 0, snapTick: 0, viewBackQ8: 0 });
    const badStance = good.slice();
    badStance[15] = 3; // [type, seq×2, fwd, strafe, yaw×4, pitch×4, buttons×2, stance|lean]
    expect(() => decodeInput(new ByteReader(badStance.subarray(1)))).toThrow(ProtocolError);
    const badLean = good.slice();
    badLean[15] = 3 << 2;
    expect(() => decodeInput(new ByteReader(badLean.subarray(1)))).toThrow(ProtocolError);
    const nan = good.slice();
    new DataView(nan.buffer).setFloat32(5, NaN, true);
    expect(() => decodeInput(new ByteReader(nan.subarray(1)))).toThrow(ProtocolError);
  });

  it("unwrap16 recovers full counters across wrap-around", () => {
    expect(unwrap16(5, 65530)).toBe(65541);
    expect(unwrap16(65530, 65541)).toBe(65530);
    expect(unwrap16(100, 100)).toBe(100);
    expect(unwrap16(0, 3 * 65536 - 1)).toBe(3 * 65536);
    expect(unwrap16(40000, 200000)).toBe(131072 + 40000); // the nearest value to 200000 with those low bits
  });
});

describe("lobby, clock, error and debug messages round-trip", () => {
  it("hello, join, pick, welcome, roster", () => {
    const hello = body(encodeHello("  Ulo  ", 0xdeadbeef), Msg.Hello);
    expect(decodeHelloVersion(hello)).toBe(PROTOCOL_VERSION);
    expect(decodeHelloRest(hello)).toEqual({ name: "Ulo", dataHash: 0xdeadbeef });
    const long = body(encodeHello("x".repeat(100), loadGameData().dataHash), Msg.Hello);
    decodeHelloVersion(long);
    expect(decodeHelloRest(long)).toEqual({ name: "x".repeat(24), dataHash: loadGameData().dataHash });
    expect(decodeJoinRoom(body(encodeJoinRoom("abc23"), Msg.JoinRoom))).toEqual({ code: "ABC23" });
    const pick = {
      operator: "brava",
      primary: { weapon: "para_308", sight: "magnified" as const, barrel: "extended_barrel" as const, grip: "angled" as const, underbarrel: "laser" as const },
      secondary: { weapon: "usp40", sight: null, barrel: "suppressor" as const, grip: null, underbarrel: null },
      gadgets: ["claymore"],
    };
    expect(decodePickLoadout(body(encodePickLoadout(pick), Msg.PickLoadout))).toEqual(pick);
    const w = { roomCode: "QX7PA", tick: 123456, levelId: "movement_lab", controllerId: 9 };
    expect(decodeWelcome(body(encodeWelcome(w), Msg.Welcome))).toEqual({ version: PROTOCOL_VERSION, ...w });
    const roster = [
      { controllerId: 1, name: "Ulo", operatorId: "skopos", pawnIds: [2, 3], team: 1, kind: 0, loadout: defaultLoadoutPick(loadGameData(), "skopos") },
      { controllerId: 4, name: "Bot ✓", operatorId: "brava", pawnIds: [5], team: 0, kind: 1, loadout: pick },
    ];
    expect(decodeRoster(body(encodeRoster(roster, 4), Msg.Roster))).toEqual({ you: 4, entries: roster });
  });

  it("ping, pong, error, debug shot, shot result, lab tools", () => {
    expect(decodePing(body(encodePing(1234.5678), Msg.Ping))).toEqual({ clientTime: 1234.5678 });
    expect(decodePong(body(encodePong({ clientTime: 99.25, serverTick: 777 }), Msg.Pong))).toEqual({ clientTime: 99.25, serverTick: 777 });
    expect(decodeError(body(encodeError(ErrorCode.NoSuchRoom, "No room ABCDE"), Msg.Error))).toEqual({ code: ErrorCode.NoSuchRoom, message: "No room ABCDE" });
    const shot = { seq: 65000, viewTick: 988.25, origin: [1, 2, 3] as [number, number, number], dir: [0, 0, -1] as [number, number, number], rewoundTick: 990.5, serverTick: 1000, hit: { pawnId: 7, part: "head", distance: 12.5 }, wallDistance: 30 };
    expect(decodeShotResult(body(encodeShotResult(shot), Msg.ShotResult))).toEqual(shot);
    expect(decodeShotResult(body(encodeShotResult({ ...shot, hit: null, wallDistance: null }), Msg.ShotResult))).toEqual({ ...shot, hit: null, wallDistance: null });
    expect(decodeLabTool(body(encodeLabTool({ kind: "respawn" }), Msg.LabTool))).toEqual({ kind: "respawn" });
    const tp = { kind: "teleport" as const, x: -16, y: 0, z: -5.5, yawDeg: 90 };
    expect(decodeLabTool(body(encodeLabTool(tp), Msg.LabTool))).toEqual(tp);
    expect(decodeLabTool(body(encodeLabTool({ kind: "team", team: 1 }), Msg.LabTool))).toEqual({ kind: "team", team: 1 });
    const hurt = { kind: "damage" as const, pawnId: 300, amount: 45, kill: false };
    expect(decodeLabTool(body(encodeLabTool(hurt), Msg.LabTool))).toEqual(hurt);
    expect(decodeLabTool(body(encodeLabTool({ kind: "refill" }), Msg.LabTool))).toEqual({ kind: "refill" });
  });

  it("events: every kind round-trips; unknown kinds, too many events and trailing bytes are refused", () => {
    const events: GameEvent[] = [
      { kind: "shotFx", pawnId: 12, slot: 1, suppressed: true, ends: [[1.5, 2.25, -30.03125], [-200, 0.5, 199.96875]] },
      { kind: "hitConfirm", seq: 65535, victimPawn: 7, zone: "neck", headshot: true, downed: false, killed: true, friendly: false, damage: 110, pellets: 1, hpAfter: 0 },
      { kind: "hitConfirm", seq: 3, victimPawn: 900, zone: "leg", headshot: false, downed: true, killed: false, friendly: true, damage: 21, pellets: 6, hpAfter: null },
      { kind: "damageTaken", pawnId: 7, amount: 33, cause: 0, attackerCtrl: 4, from: [0.5, 1.625, -4] },
      { kind: "damageTaken", pawnId: 7, amount: 110, cause: 2, attackerCtrl: 0, from: null },
      { kind: "kill", victimPawn: 7, victimCtrl: 3, killerCtrl: 4, assistCtrl: 9, weapon: "l85a2", cause: 0, headshot: true, friendly: false },
      { kind: "kill", victimPawn: 8, victimCtrl: 5, killerCtrl: 0, assistCtrl: 0, weapon: "", cause: 6, headshot: false, friendly: false },
      { kind: "down", victimPawn: 7, victimCtrl: 3, downerCtrl: 4, weapon: "mp5k", cause: 0, friendly: true },
      { kind: "reviveStart", reviverPawn: 11, targetPawn: 7 },
      { kind: "reviveEnd", reviverPawn: 11, targetPawn: 7, completed: true },
      { kind: "reviveEnd", reviverPawn: 11, targetPawn: 7, completed: false },
      { kind: "shellDestroyed", pawnId: 9, ownerCtrl: 5, killerCtrl: 4, weapon: "mp5k", headshot: false },
    ];
    expect(decodeEvents(body(encodeEvents(123456, events), Msg.Events))).toEqual({ tick: 123456, events });
    const ok = encodeEvents(5, [events[3]]);
    const bad = (bytes: number[]) => () => decodeEvents(new ByteReader(Uint8Array.from(bytes)));
    expect(bad([5, 0, 0, 0, 1, 99])).toThrow(ProtocolError); // unknown kind
    expect(bad([5, 0, 0, 0, 0xff, 0x7f])).toThrow(ProtocolError); // n far too big
    expect(() => decodeEvents(new ByteReader(Uint8Array.from([...ok.subarray(1), 0])))).toThrow(ProtocolError); // trailing byte
  });

  it("every decoder only ever throws ProtocolError on garbage", () => {
    const decoders = [decodeInput, decodeHelloRest, decodeJoinRoom, decodePickLoadout, decodeWelcome, decodeRoster, decodePing, decodePong, decodeError, decodeShotResult, decodeLabTool, decodeEvents];
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let i = 0; i < 3000; i++) {
      const bytes = Uint8Array.from({ length: Math.floor(rnd() * 40) }, () => Math.floor(rnd() * 256));
      for (const d of decoders) {
        try {
          d(new ByteReader(bytes));
        } catch (e) {
          expect(e).toBeInstanceOf(ProtocolError);
        }
      }
    }
  });
});
