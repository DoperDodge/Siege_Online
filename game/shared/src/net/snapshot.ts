// Server → client snapshots (PLAN §5; wire format from the Phase 2 bandwidth study, DECISIONS D-030).
//
// One message per snapshot tick (every 2nd tick = 32 Hz):
//   u8   MSG_SNAPSHOT
//   u32  tick                 server tick this snapshot describes
//   u16  ackSeq               low 16 bits of the last input seq applied for this client
//   u8   queueDepth           inputs waiting in the server's queue for this client (clock sync)
//   u8   local                bit0 correction follows; bit1 the server held you still (no input yet) since the last
//                             snapshot; bit2 a baseline checksum follows the removals; bit3 baselines were
//                             reset (after a resync request): every record is against zero
//   [correction]  u8 n (1 or 2 pawns); n × (varu pawnId, exact PawnState); ControllerState; u8 epoch
//   varu nRecords;  nRecords × RemoteRecord (delta vs the last record sent on this connection for that pawn)
//   varu nRemoved;  nRemoved × varu pawnId (the client forgets the pawn and its baseline)
//   [checksum] u32  hash of every baseline after this snapshot (see baselineHash)
//
// RemoteRecord: varu pawnId, varu mask, then the masked fields in bit order:
//   bit0 x, bit1 z, bit5 y : varu zigzag(Δ), 1/512 m
//   bit2 yaw               : varu zigzag(wrapped Δ) of a u16 angle (full turn = 65536)
//   bit3 pitch             : varu zigzag(Δ), pitch · 16384/π
//   bit4 flags             : u8 stance | stanceFrom<<2 | mode<<4 | sprinting<<6 | grounded<<7
//   bit6 lean (i8 ·127)   bit7 stanceT (u8 ·255)   bit8 tilts (3 × i8 ·128)   bit9 tuck (u8 ·255)
//   bit10 aux              : u8, bit0 = aiming (Phase 3 adds weapon state in bits 1–7)
// TCP delivers every snapshot in order, so deltas are against the last one *sent*, never lost ones.
import { lerp, wrapAngle } from "../core/math.js";
import { initialPawnState } from "../player/pawn.js";
import { Btn, PawnMode, Stance, type PawnState } from "../player/types.js";
import { ByteReader, ByteWriter, fnv1a, ProtocolError } from "./bytes.js";
import { readControllerState, readPawnState, writeControllerState, writePawnState, type ControllerState } from "./pawnState.js";

export const MSG_SNAPSHOT = 0x10;
/** Snapshots go out on every SNAPSHOT_EVERY-th tick. */
export const SNAPSHOT_EVERY = 2;
/** Every this many snapshots carry a baseline checksum. */
export const CHECKSUM_EVERY = 64;
/** Clients draw other players at most this far in the past (ms); the server bounds claimed view times by it. */
export const MAX_INTERP_MS = 150;
const POS_SCALE = 512;
const YAW_UNITS = 65536;
const PITCH_SCALE = 16384 / Math.PI;
const TAU = 2 * Math.PI;
const MAX_RECORDS = 64;

/** What remote clients get of a pawn: enough to draw it and pose its hitboxes, quantized. */
export interface RemoteQ {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  lean: number;
  stanceT: number;
  tiltF: number;
  tiltB: number;
  tiltSide: number;
  tuck: number;
  flags: number;
  aux: number;
}

export const ZERO_Q: Readonly<RemoteQ> = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, lean: 0, stanceT: 0, tiltF: 0, tiltB: 0, tiltSide: 0, tuck: 0, flags: 0, aux: 0 };

/** Math.round, but never -0 (the decoder rebuilds values by addition, which always gives +0). */
const round = (v: number) => Math.round(v) + 0;
const i8 = (v: number, scale: number) => Math.max(-127, Math.min(127, round(v * scale)));

export function quantizeRemote(s: PawnState): RemoteQ {
  return {
    x: round(s.x * POS_SCALE),
    y: round(s.y * POS_SCALE),
    z: round(s.z * POS_SCALE),
    yaw: round((s.yaw / TAU) * YAW_UNITS) & 0xffff,
    pitch: round(s.pitch * PITCH_SCALE),
    lean: i8(s.lean, 127),
    stanceT: round(s.stanceT * 255),
    tiltF: i8(s.tiltF, 128),
    tiltB: i8(s.tiltB, 128),
    tiltSide: i8(s.tiltSide, 128),
    tuck: round(s.tuck * 255),
    flags: s.stance | (s.stanceFrom << 2) | (s.mode << 4) | (s.sprinting ? 64 : 0) | (s.grounded ? 128 : 0),
    aux: s.prevButtons & Btn.Ads ? 1 : 0,
  };
}

/** The PawnState a remote client draws and poses hitboxes from (fields it never gets stay neutral). */
export function remoteState(q: RemoteQ, maxHp = 100): PawnState {
  const s = initialPawnState(q.x / POS_SCALE, q.y / POS_SCALE, q.z / POS_SCALE, wrapAngle((q.yaw / YAW_UNITS) * TAU), maxHp);
  s.pitch = q.pitch / PITCH_SCALE;
  s.lean = q.lean / 127;
  s.stanceT = q.stanceT / 255;
  s.tiltF = q.tiltF / 128;
  s.tiltB = q.tiltB / 128;
  s.tiltSide = q.tiltSide / 128;
  s.tuck = q.tuck / 255;
  s.stance = q.flags & 3;
  s.stanceFrom = (q.flags >> 2) & 3;
  s.mode = (q.flags >> 4) & 3;
  s.sprinting = (q.flags & 64) !== 0;
  s.grounded = (q.flags & 128) !== 0;
  s.prevButtons = q.aux & 1 ? Btn.Ads : 0;
  return s;
}

/**
 * Blend two remote states for drawing between snapshots. The server rewinds hitboxes through this same
 * function on the same quantized states, so a shot is judged against exactly what the shooter saw.
 */
export function interpolateRemote(a: PawnState, b: PawnState, u: number): PawnState {
  const sameStance = a.stance === b.stance && a.stanceFrom === b.stanceFrom;
  return {
    ...b,
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    z: lerp(a.z, b.z, u),
    yaw: a.yaw + wrapAngle(b.yaw - a.yaw) * u,
    pitch: lerp(a.pitch, b.pitch, u),
    lean: lerp(a.lean, b.lean, u),
    stanceT: sameStance ? lerp(a.stanceT, b.stanceT, u) : b.stanceT,
    tiltF: lerp(a.tiltF, b.tiltF, u),
    tiltB: lerp(a.tiltB, b.tiltB, u),
    tiltSide: lerp(a.tiltSide, b.tiltSide, u),
    tuck: lerp(a.tuck, b.tuck, u),
  };
}

const zz = (v: number) => (v >= 0 ? v * 2 : -v * 2 - 1);
const unzz = (u: number) => (u % 2 === 0 ? u / 2 : -(u + 1) / 2);
const wrap16 = (d: number) => ((((d + 32768) % 65536) + 65536) % 65536) - 32768;

function remoteMask(q: RemoteQ, b: RemoteQ): number {
  let m = 0;
  if (q.x !== b.x) m |= 1;
  if (q.z !== b.z) m |= 2;
  if (q.yaw !== b.yaw) m |= 4;
  if (q.pitch !== b.pitch) m |= 8;
  if (q.flags !== b.flags) m |= 16;
  if (q.y !== b.y) m |= 32;
  if (q.lean !== b.lean) m |= 64;
  if (q.stanceT !== b.stanceT) m |= 128;
  if (q.tiltF !== b.tiltF || q.tiltB !== b.tiltB || q.tiltSide !== b.tiltSide) m |= 256;
  if (q.tuck !== b.tuck) m |= 512;
  if (q.aux !== b.aux) m |= 1024;
  return m;
}

function writeRecord(w: ByteWriter, id: number, q: RemoteQ, base: RemoteQ): boolean {
  const m = remoteMask(q, base);
  if (m === 0) return false;
  w.varu(id).varu(m);
  if (m & 1) w.varu(zz(q.x - base.x));
  if (m & 2) w.varu(zz(q.z - base.z));
  if (m & 4) w.varu(zz(wrap16(q.yaw - base.yaw)));
  if (m & 8) w.varu(zz(q.pitch - base.pitch));
  if (m & 16) w.u8(q.flags);
  if (m & 32) w.varu(zz(q.y - base.y));
  if (m & 64) w.i8(q.lean);
  if (m & 128) w.u8(q.stanceT);
  if (m & 256) w.i8(q.tiltF).i8(q.tiltB).i8(q.tiltSide);
  if (m & 512) w.u8(q.tuck);
  if (m & 1024) w.u8(q.aux);
  return true;
}

function readRecord(r: ByteReader, baseOf: (id: number) => RemoteQ): [number, RemoteQ] {
  const id = r.varu();
  const m = r.varu();
  if (m === 0 || m >= 2048) throw new ProtocolError("bad record mask");
  const q = { ...baseOf(id) };
  if (m & 1) q.x += unzz(r.varu());
  if (m & 2) q.z += unzz(r.varu());
  if (m & 4) q.yaw = (q.yaw + unzz(r.varu())) & 0xffff;
  if (m & 8) q.pitch += unzz(r.varu());
  if (m & 16) {
    q.flags = r.u8();
    if ((q.flags & 3) > Stance.Prone || ((q.flags >> 2) & 3) > Stance.Prone || ((q.flags >> 4) & 3) > PawnMode.Dead) throw new ProtocolError("bad flags");
  }
  if (m & 32) q.y += unzz(r.varu());
  if (m & 64) q.lean = r.i8();
  if (m & 128) q.stanceT = r.u8();
  if (m & 256) {
    q.tiltF = r.i8();
    q.tiltB = r.i8();
    q.tiltSide = r.i8();
  }
  if (m & 512) q.tuck = r.u8();
  if (m & 1024) q.aux = r.u8();
  return [id, q];
}

/** Checksum of a baseline table (both sides compute it the same way, in ascending pawn id order). */
export function baselineHash(table: ReadonlyMap<number, RemoteQ>): number {
  const w = new ByteWriter(64);
  for (const id of [...table.keys()].sort((a, b) => a - b)) {
    const q = table.get(id)!;
    w.varu(id).i32(q.x).i32(q.y).i32(q.z).u16(q.yaw).i32(q.pitch).i8(q.lean).u8(q.stanceT).i8(q.tiltF).i8(q.tiltB).i8(q.tiltSide).u8(q.tuck).u8(q.flags).u8(q.aux);
  }
  return fnv1a(w.finish());
}

export interface Correction {
  /** Exact states of every pawn the client owns, after every input up to ackSeq. */
  pawns: [number, PawnState][];
  ctrl: ControllerState;
  epoch: number;
}

/** The per-client header of a snapshot. */
export interface SnapshotHead {
  tick: number;
  ackSeq: number;
  /** The server had no input for this client on some tick since the last snapshot. */
  idled: boolean;
  /** Inputs waiting in the server's queue for this client; the client paces its ticks to keep it small. */
  queueDepth: number;
}

export interface Snapshot extends SnapshotHead {
  /** Baselines were reset before this snapshot (the answer to a resync request). */
  baselineReset: boolean;
  correction: Correction | null;
  records: [number, RemoteQ][];
  removed: number[];
  checksum: number | null;
}

/** Server side, one per connection: remembers what this client has, so records are deltas against it. */
export class SnapshotEncoder {
  private readonly sent = new Map<number, RemoteQ>();
  private count = 0;

  private resetPending = false;

  /** Forget the baselines (a client that lost track asked for a resync): the next snapshot is complete. */
  reset(): void {
    this.sent.clear();
    this.resetPending = true;
  }

  /** Build the next snapshot. Only call it for a snapshot that will actually be sent (baselines advance). */
  encode(head: SnapshotHead, correction: Correction | null, remotes: ReadonlyMap<number, RemoteQ>): Uint8Array {
    if (remotes.size > MAX_RECORDS) throw new Error(`too many pawns for one snapshot (${remotes.size})`);
    const withChecksum = ++this.count % CHECKSUM_EVERY === 0;
    const w = new ByteWriter(256);
    w.u8(MSG_SNAPSHOT).u32(head.tick).u16(head.ackSeq & 0xffff).u8(Math.min(255, head.queueDepth));
    w.u8((correction ? 1 : 0) | (head.idled ? 2 : 0) | (withChecksum ? 4 : 0) | (this.resetPending ? 8 : 0));
    this.resetPending = false;
    if (correction) {
      w.u8(correction.pawns.length);
      for (const [id, s] of correction.pawns) {
        w.varu(id);
        writePawnState(w, s);
      }
      writeControllerState(w, correction.ctrl);
      w.u8(correction.epoch & 0xff);
    }
    const body = new ByteWriter(256);
    let n = 0;
    for (const [id, q] of remotes) {
      if (writeRecord(body, id, q, this.sent.get(id) ?? ZERO_Q)) n++;
      this.sent.set(id, q);
    }
    const removed = [...this.sent.keys()].filter((id) => !remotes.has(id));
    for (const id of removed) this.sent.delete(id);
    w.varu(n).raw(body.finish()).varu(removed.length);
    for (const id of removed) w.varu(id);
    if (withChecksum) w.u32(baselineHash(this.sent));
    return w.finish();
  }
}

/** Client side: mirrors the encoder's baselines. `have` is every remote pawn's latest quantized state. */
export class SnapshotDecoder {
  readonly have = new Map<number, RemoteQ>();

  reset(): void {
    this.have.clear();
  }

  decode(bytes: Uint8Array): Snapshot {
    const r = new ByteReader(bytes);
    if (r.u8() !== MSG_SNAPSHOT) throw new ProtocolError("not a snapshot");
    const tick = r.u32();
    const ackSeq = r.u16();
    const queueDepth = r.u8();
    const local = r.u8();
    if (local > 15) throw new ProtocolError("bad snapshot flags");
    if (local & 8) this.have.clear();
    let correction: Correction | null = null;
    if (local & 1) {
      const n = r.u8();
      if (n < 1 || n > 2) throw new ProtocolError("bad correction");
      const pawns: [number, PawnState][] = [];
      for (let i = 0; i < n; i++) pawns.push([r.varu(), readPawnState(r)]);
      correction = { pawns, ctrl: readControllerState(r), epoch: r.u8() };
    }
    const n = r.varu();
    if (n > MAX_RECORDS) throw new ProtocolError("too many records");
    const records: [number, RemoteQ][] = [];
    for (let i = 0; i < n; i++) {
      const rec = readRecord(r, (id) => this.have.get(id) ?? ZERO_Q);
      records.push(rec);
      this.have.set(rec[0], rec[1]);
    }
    const nr = r.varu();
    if (nr > MAX_RECORDS) throw new ProtocolError("too many removals");
    const removed: number[] = [];
    for (let i = 0; i < nr; i++) {
      const id = r.varu();
      removed.push(id);
      this.have.delete(id);
    }
    const checksum = local & 4 ? r.u32() : null;
    if (r.remaining !== 0) throw new ProtocolError("trailing bytes");
    return { tick, ackSeq, queueDepth, idled: (local & 2) !== 0, baselineReset: (local & 8) !== 0, correction, records, removed, checksum };
  }

  /** False when a snapshot's checksum shows this client's baselines drifted (ask for a resync). */
  verify(snap: Snapshot): boolean {
    return snap.checksum === null || snap.checksum === baselineHash(this.have);
  }
}
