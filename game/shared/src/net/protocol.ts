// Every message except snapshots (net/snapshot.ts). Binary, little-endian, first byte = type (PLAN §5).
// Clients never tell the server what happened ("I hit X"): only inputs, view angles and view times.
import { quantizeInput, Stance, type InputCmd } from "../player/types.js";
import { BARRELS, GRIPS, SIGHTS, UNDERBARRELS } from "../data/schemas.js";
import type { LoadoutPick, WeaponPick } from "../weapons/loadout.js";
import { ByteReader, ByteWriter, ProtocolError } from "./bytes.js";
import { MSG_SNAPSHOT } from "./snapshot.js";

/** Bump when the wire format changes; client and server must match. */
export const PROTOCOL_VERSION = 4;

export const Msg = {
  // client → server
  Input: 0x01,
  Hello: 0x02,
  CreateRoom: 0x03,
  JoinRoom: 0x04,
  /** Operator plus weapons and attachments (DECISIONS D-042); always a new body. */
  PickLoadout: 0x05,
  Ping: 0x06,
  Resync: 0x07,
  // 0x08 unused (test shots ride on inputs: Btn.Fire)
  LabTool: 0x09,
  // server → client
  Snapshot: MSG_SNAPSHOT,
  Welcome: 0x11,
  Roster: 0x12,
  Pong: 0x13,
  Error: 0x14,
  ShotResult: 0x15,
} as const;

export const MAX_NAME = 24;
export const ROOM_CODE_LENGTH = 5;
/** Room codes skip look-alike characters (0/O, 1/I/L) so they're easy to read out loud. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ---------------------------------------------------------------- input

export interface InputMsg {
  cmd: InputCmd;
  /** Hash of the client's predicted state after applying this input (all owned pawns + controller). */
  predictedHash: number;
  /** The last correction epoch the client applied (older predictions are ignored by the server). */
  epoch: number;
  /** Low 16 bits of the newest snapshot tick the client has received. */
  snapTick: number;
  /** How far behind snapTick the client is drawing remote players, in 1/256 ticks (lag compensation). */
  viewBackQ8: number;
}

export function encodeInput(m: InputMsg): Uint8Array {
  const c = quantizeInput(m.cmd);
  return new ByteWriter(24)
    .u8(Msg.Input)
    .u16(c.seq & 0xffff)
    .i8(Math.round(c.forward * 127))
    .i8(Math.round(c.strafe * 127))
    .f32(c.yaw)
    .f32(c.pitch)
    .u16(c.buttons)
    .u8(c.stance | ((c.lean + 1) << 2))
    .u32(m.predictedHash)
    .u8(m.epoch & 0xff)
    .u16(m.snapTick & 0xffff)
    .u16(Math.max(0, Math.min(0xffff, Math.round(m.viewBackQ8))))
    .finish();
}

/** Decode an input. `seq` comes back as its low 16 bits; the server unwraps it against the last one. */
export function decodeInput(r: ByteReader): InputMsg {
  const seq = r.u16();
  const forward = r.i8();
  const strafe = r.i8();
  const yaw = r.finite();
  const pitch = r.finite();
  const buttons = r.u16();
  const sl = r.u8();
  const stance = sl & 3;
  const lean = (sl >> 2) - 1;
  if (stance > Stance.Prone || lean < -1 || lean > 1 || forward < -127 || strafe < -127) throw new ProtocolError("bad input");
  const cmd: InputCmd = { seq, forward: forward / 127, strafe: strafe / 127, yaw, pitch, buttons, stance, lean: lean as -1 | 0 | 1 };
  return { cmd, predictedHash: r.u32(), epoch: r.u8(), snapTick: r.u16(), viewBackQ8: r.u16() };
}

/** Recover a full counter from its low 16 bits, given the last full value seen (handles wrap-around). */
export function unwrap16(low: number, last: number): number {
  const base = last - (last & 0xffff);
  let v = base + low;
  if (v < last - 0x8000) v += 0x10000;
  else if (v > last + 0x8000) v -= 0x10000;
  return v;
}

// ---------------------------------------------------------------- lobby

/**
 * Hello: the protocol version first (so a server can answer an old client "refresh the page" before
 * parsing anything else), the player's name, and a hash of the simulation data the page was built with:
 * a tab left open across a deploy would otherwise predict with old weapon numbers (DECISIONS D-039).
 */
export function encodeHello(name: string, dataHash: number): Uint8Array {
  return new ByteWriter().u8(Msg.Hello).u16(PROTOCOL_VERSION).str(name.slice(0, MAX_NAME)).u32(dataHash >>> 0).finish();
}
/** Reads only the version: check it before reading the rest with decodeHelloRest. */
export const decodeHelloVersion = (r: ByteReader) => r.u16();
export function decodeHelloRest(r: ByteReader): { name: string; dataHash: number } {
  const name = r.str(MAX_NAME * 4).trim();
  return { name, dataHash: r.u32() };
}

export const encodeCreateRoom = () => Uint8Array.of(Msg.CreateRoom);
export const encodeJoinRoom = (code: string) => new ByteWriter().u8(Msg.JoinRoom).str(code.toUpperCase().slice(0, 16)).finish();
export const decodeJoinRoom = (r: ByteReader) => ({ code: r.str(16).toUpperCase() });
// Attachments travel as an index into the fixed lists in data/schemas.ts, plus one (0 = none).
const attIndex = <T extends string>(list: readonly T[], v: T | null) => (v === null ? 0 : list.indexOf(v) + 1);
function attFrom<T extends string>(list: readonly T[], i: number): T | null {
  if (i > list.length) throw new ProtocolError("bad attachment");
  return i === 0 ? null : list[i - 1];
}
const MAX_GADGETS = 4;

export function writeLoadoutPick(w: ByteWriter, p: LoadoutPick): void {
  w.str(p.operator);
  for (const wp of [p.primary, p.secondary]) {
    w.str(wp.weapon).u8(attIndex(SIGHTS, wp.sight)).u8(attIndex(BARRELS, wp.barrel)).u8(attIndex(GRIPS, wp.grip)).u8(attIndex(UNDERBARRELS, wp.underbarrel));
  }
  w.u8(Math.min(MAX_GADGETS, p.gadgets.length));
  for (const g of p.gadgets.slice(0, MAX_GADGETS)) w.str(g);
}
export function readLoadoutPick(r: ByteReader): LoadoutPick {
  const operator = r.str(32);
  const weapon = (): WeaponPick => ({
    weapon: r.str(32),
    sight: attFrom(SIGHTS, r.u8()),
    barrel: attFrom(BARRELS, r.u8()),
    grip: attFrom(GRIPS, r.u8()),
    underbarrel: attFrom(UNDERBARRELS, r.u8()),
  });
  const primary = weapon();
  const secondary = weapon();
  const n = r.u8();
  if (n > MAX_GADGETS) throw new ProtocolError("too many gadgets");
  const gadgets = Array.from({ length: n }, () => r.str(32));
  return { operator, primary, secondary, gadgets };
}
export const encodePickLoadout = (p: LoadoutPick) => {
  const w = new ByteWriter().u8(Msg.PickLoadout);
  writeLoadoutPick(w, p);
  return w.finish();
};
export const decodePickLoadout = (r: ByteReader) => readLoadoutPick(r);
export const encodeResync = () => Uint8Array.of(Msg.Resync);

export function encodeWelcome(w: { roomCode: string; tick: number; levelId: string; controllerId: number }): Uint8Array {
  return new ByteWriter().u8(Msg.Welcome).u16(PROTOCOL_VERSION).str(w.roomCode).u32(w.tick).str(w.levelId).varu(w.controllerId).finish();
}
export function decodeWelcome(r: ByteReader) {
  return { version: r.u16(), roomCode: r.str(16), tick: r.u32(), levelId: r.str(64), controllerId: r.varu() };
}

export interface RosterEntry {
  controllerId: number;
  name: string;
  operatorId: string;
  pawnIds: number[];
  /** 0 attackers, 1 defenders (from the operator's side unless a lab tool moved them). */
  team: number;
  /** 0 a player; 1 a range-lab dummy (Phase 3 M10). */
  kind: number;
  /** The loadout the body carries, as the server resolved it (an invalid pick became the default). */
  loadout: LoadoutPick;
}

/** The room's players; `you` is the receiving client's own controller id (it changes on respawn). */
export function encodeRoster(entries: RosterEntry[], you: number): Uint8Array {
  const w = new ByteWriter().u8(Msg.Roster).varu(you).varu(entries.length);
  for (const e of entries) {
    w.varu(e.controllerId).str(e.name).str(e.operatorId).u8(e.pawnIds.length);
    for (const id of e.pawnIds) w.varu(id);
    w.u8(e.team).u8(e.kind);
    writeLoadoutPick(w, e.loadout);
  }
  return w.finish();
}
export function decodeRoster(r: ByteReader): { you: number; entries: RosterEntry[] } {
  const you = r.varu();
  const n = r.varu();
  if (n > 32) throw new ProtocolError("roster too long");
  const out: RosterEntry[] = [];
  for (let i = 0; i < n; i++) {
    const controllerId = r.varu();
    const name = r.str(MAX_NAME * 4);
    const operatorId = r.str(32);
    const k = r.u8();
    if (k > 2) throw new ProtocolError("too many pawns");
    const pawnIds = Array.from({ length: k }, () => r.varu());
    const team = r.u8();
    const kind = r.u8();
    if (team > 1 || kind > 1) throw new ProtocolError("bad roster entry");
    out.push({ controllerId, name, operatorId, pawnIds, team, kind, loadout: readLoadoutPick(r) });
  }
  return { you, entries: out };
}

// ---------------------------------------------------------------- clock

export const encodePing = (clientTime: number) => new ByteWriter(9).u8(Msg.Ping).f64(clientTime).finish();
export const decodePing = (r: ByteReader) => ({ clientTime: r.f64() });
export function encodePong(p: { clientTime: number; serverTick: number }): Uint8Array {
  return new ByteWriter(16).u8(Msg.Pong).f64(p.clientTime).u32(p.serverTick).finish();
}
export const decodePong = (r: ByteReader) => ({ clientTime: r.f64(), serverTick: r.u32() });

// ---------------------------------------------------------------- errors

export const ErrorCode = { BadVersion: 1, NoSuchRoom: 2, RoomFull: 3, BadRequest: 4, ServerRestarting: 5, ServerFull: 6, RateLimited: 7 } as const;
export const encodeError = (code: number, message: string) => new ByteWriter().u8(Msg.Error).u8(code).str(message).finish();
export const decodeError = (r: ByteReader) => ({ code: r.u8(), message: r.str(512) });

// ---------------------------------------------------------------- lab and debug tools

/** What the server made of a shot (Phase 2: a test shot fired with Btn.Fire; weapons from Phase 3). */
export interface ShotResult {
  /** Low 16 bits of the input that fired. */
  seq: number;
  origin: [number, number, number];
  dir: [number, number, number];
  /** Render tick the shooter claimed to be drawing (after the server's sanity bounds). */
  viewTick: number;
  /** Render tick the server rewound to (after the room's cap: `rewoundTick > viewTick` means it was capped). */
  rewoundTick: number;
  /** The server tick the shot arrived at (how far it rewound = serverTick − rewoundTick). */
  serverTick: number;
  hit: { pawnId: number; part: string; distance: number } | null;
  /** Where the ray hit the level, if nearer than any player. */
  wallDistance: number | null;
}

export function encodeShotResult(s: ShotResult): Uint8Array {
  const w = new ByteWriter().u8(Msg.ShotResult).u16(s.seq);
  for (const v of [...s.origin, ...s.dir]) w.f32(v);
  w.f64(s.viewTick).f64(s.rewoundTick).u32(s.serverTick).u8((s.hit ? 1 : 0) | (s.wallDistance !== null ? 2 : 0));
  if (s.hit) w.varu(s.hit.pawnId).str(s.hit.part).f32(s.hit.distance);
  if (s.wallDistance !== null) w.f32(s.wallDistance);
  return w.finish();
}
export function decodeShotResult(r: ByteReader): ShotResult {
  const seq = r.u16();
  const v = Array.from({ length: 6 }, () => r.finite());
  const viewTick = r.f64();
  const rewoundTick = r.f64();
  const serverTick = r.u32();
  const f = r.u8();
  const hit = f & 1 ? { pawnId: r.varu(), part: r.str(16), distance: r.finite() } : null;
  const wallDistance = f & 2 ? r.finite() : null;
  return { seq, origin: [v[0], v[1], v[2]], dir: [v[3], v[4], v[5]], viewTick, rewoundTick, serverTick, hit, wallDistance };
}

/** Movement Lab tools in lab rooms: respawn, or teleport ("Go to"). */
/** Lab tools (lab rooms only): respawn, teleport ("Go to"), or switch team (respawns you on it). */
export type LabTool = { kind: "respawn" } | { kind: "teleport"; x: number; y: number; z: number; yawDeg: number } | { kind: "team"; team: number };

export function encodeLabTool(t: LabTool): Uint8Array {
  const w = new ByteWriter().u8(Msg.LabTool).u8(t.kind === "respawn" ? 0 : t.kind === "teleport" ? 1 : 3);
  if (t.kind === "teleport") w.f32(t.x).f32(t.y).f32(t.z).f32(t.yawDeg);
  if (t.kind === "team") w.u8(t.team);
  return w.finish();
}
export function decodeLabTool(r: ByteReader): LabTool {
  const k = r.u8();
  if (k === 0) return { kind: "respawn" };
  if (k === 1) return { kind: "teleport", x: r.finite(), y: r.finite(), z: r.finite(), yawDeg: r.finite() };
  if (k === 3) {
    const team = r.u8();
    if (team > 1) throw new ProtocolError("bad team");
    return { kind: "team", team };
  }
  throw new ProtocolError("bad lab tool");
}
