// Minimal binary protocol (little-endian). The real game adds delta compression and more fields.
import type { InputCmd } from "./sim.js";

export const MSG_INPUT = 1; // client -> server
export const MSG_WELCOME = 2; // server -> client
export const MSG_SNAPSHOT = 3; // server -> client

export interface SnapshotPlayer {
  id: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
}

export interface Snapshot {
  tick: number;
  ackSeq: number; // last input seq the server processed for the receiving client
  players: SnapshotPlayer[];
}

export function encodeInput(cmd: InputCmd): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(11));
  v.setUint8(0, MSG_INPUT);
  v.setUint32(1, cmd.seq, true);
  v.setInt8(5, Math.round(cmd.moveX * 127));
  v.setInt8(6, Math.round(cmd.moveZ * 127));
  v.setFloat32(7, cmd.yaw, true);
  return v.buffer;
}

export function decodeInput(v: DataView): InputCmd {
  return { seq: v.getUint32(1, true), moveX: v.getInt8(5) / 127, moveZ: v.getInt8(6) / 127, yaw: v.getFloat32(7, true) };
}

export function encodeWelcome(playerId: number, spawnX: number, spawnZ: number, tickHz: number): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(12));
  v.setUint8(0, MSG_WELCOME);
  v.setUint16(1, playerId, true);
  v.setUint8(3, tickHz);
  v.setFloat32(4, spawnX, true);
  v.setFloat32(8, spawnZ, true);
  return v.buffer;
}

export function decodeWelcome(v: DataView) {
  return { playerId: v.getUint16(1, true), tickHz: v.getUint8(3), spawnX: v.getFloat32(4, true), spawnZ: v.getFloat32(8, true) };
}

const PLAYER_BYTES = 2 + 4 * 4 + 1;

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(11 + s.players.length * PLAYER_BYTES));
  v.setUint8(0, MSG_SNAPSHOT);
  v.setUint32(1, s.tick, true);
  v.setUint32(5, s.ackSeq, true);
  v.setUint16(9, s.players.length, true);
  let o = 11;
  for (const p of s.players) {
    v.setUint16(o, p.id, true);
    v.setFloat32(o + 2, p.x, true);
    v.setFloat32(o + 6, p.y, true);
    v.setFloat32(o + 10, p.z, true);
    v.setFloat32(o + 14, p.vy, true);
    v.setUint8(o + 18, p.grounded ? 1 : 0);
    o += PLAYER_BYTES;
  }
  return v.buffer;
}

export function decodeSnapshot(v: DataView): Snapshot {
  const n = v.getUint16(9, true);
  const players: SnapshotPlayer[] = [];
  let o = 11;
  for (let i = 0; i < n; i++) {
    players.push({
      id: v.getUint16(o, true),
      x: v.getFloat32(o + 2, true),
      y: v.getFloat32(o + 6, true),
      z: v.getFloat32(o + 10, true),
      vy: v.getFloat32(o + 14, true),
      grounded: v.getUint8(o + 18) === 1,
    });
    o += PLAYER_BYTES;
  }
  return { tick: v.getUint32(1, true), ackSeq: v.getUint32(5, true), players };
}
