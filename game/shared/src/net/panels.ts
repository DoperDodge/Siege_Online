// Destruction on the wire (Phase 4 M5; PLAN §5, §8): the panel ops the server applied in a tick, in order,
// with the panel set's hash after them (a client that disagrees asks for the panels again), and the state
// of every changed panel, run-length coded, for players who join late or fall out of step. Ops are whole
// cells, so every client that applies them in order ends with the server's exact bytes.
import { LAYER_COUNT, type CutShape, type PanelOp } from "../destruction/panel.js";
import type { IndexedOp, PanelSet } from "../destruction/panels.js";
import { ByteReader, ByteWriter, ProtocolError } from "./bytes.js";

/** Server → client: one tick's panel ops (0x17), and every changed panel's state (0x18). Client → server: send that state again (0x0a). */
export const MSG_PANEL_OPS = 0x17;
export const MSG_PANEL_STATE = 0x18;
export const MSG_PANEL_RESYNC = 0x0a;

export interface PanelOpsMsg {
  tick: number;
  ops: IndexedOp[];
  /** PanelSet.hash() once they are applied. */
  hash: number;
}

const OP = { cut: 0, damage: 1, reinforce: 2, barricade: 3 } as const;
/** Within 16 bits (NaN, which no cut should carry, as 0: what the bytes would say). */
const I16 = (v: number) => (Number.isNaN(v) ? 0 : Math.max(-0x8000, Math.min(0x7fff, Math.round(v))));
const U16 = (v: number) => (Number.isNaN(v) ? 0 : Math.max(0, Math.min(0xffff, Math.round(v))));

/**
 * The op exactly as it goes on the wire: whole numbers within 16 bits (a cut never reaches a cell further
 * than that). The server applies this form, so what it sends is what it did.
 */
export function wireOp(op: PanelOp): PanelOp {
  if (op.kind !== "cut") return op;
  const s: CutShape =
    op.shape.kind === "disc"
      ? { kind: "disc", u4: I16(op.shape.u4), v4: I16(op.shape.v4), r4: U16(op.shape.r4) }
      : { kind: "rect", u0: I16(op.shape.u0), v0: I16(op.shape.v0), u1: I16(op.shape.u1), v1: I16(op.shape.v1) };
  return { kind: "cut", layer: op.layer, shape: s, hard: op.hard };
}

function writeOp(w: ByteWriter, { panel, op }: IndexedOp) {
  w.varu(panel).u8(OP[op.kind]);
  switch (op.kind) {
    case "cut":
      w.u8(op.layer | (op.hard ? 0x10 : 0) | (op.shape.kind === "rect" ? 0x20 : 0));
      if (op.shape.kind === "disc") w.i16(op.shape.u4).i16(op.shape.v4).u16(op.shape.r4);
      else w.i16(op.shape.u0).i16(op.shape.v0).i16(op.shape.u1).i16(op.shape.v1);
      break;
    case "damage":
      w.f64(op.amount).u8(op.hard ? 1 : 0);
      break;
    case "reinforce":
      w.u8(op.section).u8(op.side);
      break;
    case "barricade":
      w.u8(op.up ? 1 : 0);
      break;
  }
}

function readOp(r: ByteReader, panelCount: number): IndexedOp {
  const panel = r.varu();
  if (panel >= panelCount) throw new ProtocolError("panel op: no such panel");
  const kind = r.u8();
  if (kind === OP.cut) {
    const flags = r.u8();
    const layer = flags & 0x0f;
    if (layer >= LAYER_COUNT || flags & 0xc0) throw new ProtocolError("panel op: bad cut");
    const shape: CutShape = flags & 0x20 ? { kind: "rect", u0: r.i16(), v0: r.i16(), u1: r.i16(), v1: r.i16() } : { kind: "disc", u4: r.i16(), v4: r.i16(), r4: r.u16() };
    return { panel, op: { kind: "cut", layer, shape, hard: (flags & 0x10) !== 0 } };
  }
  if (kind === OP.damage) {
    const amount = r.f64();
    const hard = r.u8();
    if (!Number.isFinite(amount) || hard > 1) throw new ProtocolError("panel op: bad damage");
    return { panel, op: { kind: "damage", amount, hard: hard === 1 } };
  }
  if (kind === OP.reinforce) {
    const section = r.u8();
    const side = r.u8();
    if (section > 2 || side > 1) throw new ProtocolError("panel op: bad reinforce");
    return { panel, op: { kind: "reinforce", section, side } };
  }
  if (kind === OP.barricade) {
    const up = r.u8();
    if (up > 1) throw new ProtocolError("panel op: bad barricade");
    return { panel, op: { kind: "barricade", up: up === 1 } };
  }
  throw new ProtocolError("panel op: unknown kind");
}

export function encodePanelOps(m: PanelOpsMsg): Uint8Array {
  const w = new ByteWriter(16 + 20 * m.ops.length).u8(MSG_PANEL_OPS).u32(m.tick >>> 0).varu(m.ops.length);
  for (const o of m.ops) writeOp(w, o);
  return w.u32(m.hash >>> 0).finish();
}

/** `panelCount`: the level's panels (an op for any other is a protocol error). */
export function decodePanelOps(r: ByteReader, panelCount: number): PanelOpsMsg {
  const tick = r.u32();
  const n = r.varu();
  if (n > 4096) throw new ProtocolError("panel ops: too many");
  const ops: IndexedOp[] = [];
  for (let i = 0; i < n; i++) ops.push(readOp(r, panelCount));
  return { tick, ops, hash: r.u32() };
}

/** Every changed panel's state, and the set's hash. */
export function encodePanelState(panels: PanelSet): Uint8Array {
  const changed = panels.list.filter((e) => e.panel.modified);
  const w = new ByteWriter(64 + changed.reduce((n, e) => n + 64 + e.panel.w * e.panel.h, 0)).u8(MSG_PANEL_STATE).varu(changed.length);
  for (const e of changed) {
    w.varu(e.panel.spec.index);
    e.panel.encodeState(w);
  }
  return w.u32(panels.hash() >>> 0).finish();
}

/**
 * Make `panels` the state in a PanelState message: the listed panels take their state, every other changed
 * panel goes back to how the level built it. Returns the hash the server had (the caller compares).
 */
export function applyPanelState(r: ByteReader, panels: PanelSet): number {
  const n = r.varu();
  if (n > panels.list.length) throw new ProtocolError("panel state: too many panels");
  const listed = new Set<number>();
  for (let i = 0; i < n; i++) {
    const index = r.varu();
    if (index >= panels.list.length || listed.has(index)) throw new ProtocolError("panel state: bad panel");
    listed.add(index);
    const e = panels.reset(index);
    e.panel.decodeState(r);
    panels.rebuild(e);
  }
  for (const e of panels.list) if (!listed.has(e.panel.spec.index) && e.panel.modified) panels.reset(e.panel.spec.index);
  return r.u32();
}
