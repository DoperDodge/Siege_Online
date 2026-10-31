// The gadget table on the wire (Phase 8, gadgets/DESIGN.md §3, §11): the ops the server applied since a player's last
// snapshot, sent just ahead of it with the table's hash after them (a client that disagrees asks for the table again),
// and the whole table for players who join or fall out of step.
import { readGadget, writeGadget, type Gadget, type GadgetOp } from "../gadgets/table.js";
import { ByteReader, ByteWriter, ProtocolError } from "./bytes.js";

/** Server → client: gadget ops (0x1b) and the whole table (0x1c). Client → server: send the table again (0x08). */
export const MSG_GADGET_OPS = 0x1b;
export const MSG_GADGET_STATE = 0x1c;
export const MSG_GADGET_RESYNC = 0x08;

/** More entries than any round makes: a message claiming more is refused. */
const MAX_ENTRIES = 4096;

export interface GadgetOpsMsg {
  /** The tick of the snapshot they go ahead of. */
  tick: number;
  ops: GadgetOp[];
  /** GadgetTable.hash() once they're applied. */
  hash: number;
}

const OP = { put: 0, remove: 1, clear: 2 } as const;

export function encodeGadgetOps(m: GadgetOpsMsg): Uint8Array {
  const w = new ByteWriter(16 + 48 * m.ops.length);
  w.u8(MSG_GADGET_OPS).u32(m.tick).varu(m.ops.length);
  for (const op of m.ops) {
    w.u8(OP[op.kind]);
    if (op.kind === "put") writeGadget(w, op.g);
    else if (op.kind === "remove") w.varu(op.id);
  }
  w.u32(m.hash);
  return w.finish();
}

/** Reads the body of a 0x1b message (after its type byte). */
export function decodeGadgetOps(r: ByteReader): GadgetOpsMsg {
  const tick = r.u32();
  const n = r.varu();
  if (n > MAX_ENTRIES) throw new ProtocolError("too many gadget ops");
  const ops: GadgetOp[] = [];
  for (let i = 0; i < n; i++) {
    const kind = r.u8();
    if (kind === OP.put) ops.push({ kind: "put", g: readGadget(r) });
    else if (kind === OP.remove) ops.push({ kind: "remove", id: r.varu() });
    else if (kind === OP.clear) ops.push({ kind: "clear" });
    else throw new ProtocolError("bad gadget op");
  }
  return { tick, ops, hash: r.u32() };
}

export function encodeGadgetState(list: readonly Gadget[]): Uint8Array {
  const w = new ByteWriter(8 + 48 * list.length);
  w.u8(MSG_GADGET_STATE).varu(list.length);
  for (const g of list) writeGadget(w, g);
  return w.finish();
}

/** Reads the body of a 0x1c message. */
export function decodeGadgetState(r: ByteReader): Gadget[] {
  const n = r.varu();
  if (n > MAX_ENTRIES) throw new ProtocolError("too many gadgets");
  const out = Array.from({ length: n }, () => readGadget(r));
  for (let i = 1; i < n; i++) if (out[i].id <= out[i - 1].id) throw new ProtocolError("gadgets out of order");
  return out;
}

export function encodeGadgetResync(): Uint8Array {
  return new Uint8Array([MSG_GADGET_RESYNC]);
}
