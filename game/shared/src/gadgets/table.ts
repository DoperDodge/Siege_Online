// The gadget table (Phase 8, gadgets/DESIGN.md §3): everything placed, thrown or dropped this round, on the server
// and on every client. Only the server changes it; each change is an op (put an entry, remove one, clear them all)
// sent with the next snapshot together with the table's hash, and a client applies the ops as they arrive. Numbers
// are kept float32-exact and ticks whole, so the bytes a client hashes are the server's.
//
// The simulation reads entries' flags and places, never their ticks: those are the server's (a client's ticks
// aren't, D-138), and the room turns them into flags when they pass.
import type { Vec3 } from "../core/math.js";
import { ByteReader, ByteWriter, fnv1a, ProtocolError } from "../net/bytes.js";
import { GADGET_KINDS } from "./kinds.js";

/** Gadget.flags. */
export const GFlag = {
  /** In the air: where it is now comes from its throw (`pos`, `vel` at `launchTick`; gadgets/flight.ts). */
  Flying: 1 << 0,
  /** Placed on (or come to rest on) a floor; else on a wall, or stuck where it hit. */
  OnFloor: 1 << 1,
  /** Its glass is broken (a Bulletproof Camera shot from the side or knifed): no feed for the rest of the round. */
  Broken: 1 << 2,
  /** Placed outdoors, its signal is gone (a Bulletproof Camera, the room says when). */
  Lost: 1 << 3,
  /** Lying flat on a floor or a hatch (a charge on one): its box's depth is up (gadgets/hits.ts). */
  Flat: 1 << 4,
} as const;
const FLAG_BITS = 0x1f;

export interface Gadget {
  /** Unique in the round, from 1, in the order the server made them. */
  id: number;
  /** Its number in GADGET_KINDS. */
  kind: number;
  /** The controller it belongs to (0: nobody's). */
  owner: number;
  /** Whose side it's on: 0 attackers, 1 defenders (a hack flips it). */
  team: number;
  /** Its box's centre (metres); flying, where it left from. */
  pos: Vec3;
  /** The way it faces (radians): out of the wall it's on, or the placer's way on a floor. */
  yaw: number;
  /** Flying: its velocity as it left. */
  vel: Vec3;
  flags: number;
  /** The panel it's on (its index), or −1. */
  panel: number;
  /** Server ticks (0: none): when it was thrown, when its fuse ends, when its outdoor signal ends, when it's ready again. */
  launchTick: number;
  fuseEnd: number;
  signalEnd: number;
  readyAt: number;
  /** The input that threw or placed it (its thrower's client stops drawing its own copy once this entry is in). */
  seq: number;
}

export type GadgetOp = { kind: "put"; g: Gadget } | { kind: "remove"; id: number } | { kind: "clear" };

const f32 = Math.fround;
const MAX_TICK = 0xffffffff;

/** An entry as it is kept and sent: float32 numbers, whole ticks within 32 bits. */
export function exactGadget(g: Gadget): Gadget {
  const tick = (t: number) => Math.max(0, Math.min(MAX_TICK, Math.floor(t)));
  return {
    id: g.id,
    kind: g.kind,
    owner: g.owner,
    team: g.team & 1,
    pos: [f32(g.pos[0]), f32(g.pos[1]), f32(g.pos[2])],
    yaw: f32(g.yaw),
    vel: g.flags & GFlag.Flying ? [f32(g.vel[0]), f32(g.vel[1]), f32(g.vel[2])] : [0, 0, 0],
    flags: g.flags & FLAG_BITS,
    panel: g.panel < 0 ? -1 : g.panel,
    launchTick: tick(g.launchTick),
    fuseEnd: tick(g.fuseEnd),
    signalEnd: tick(g.signalEnd),
    readyAt: tick(g.readyAt),
    seq: g.seq & 0xffff,
  };
}

export function writeGadget(w: ByteWriter, g: Gadget): void {
  w.varu(g.id).u8(g.kind).varu(g.owner).u8(g.team).f32(g.pos[0]).f32(g.pos[1]).f32(g.pos[2]).f32(g.yaw).u8(g.flags).varu(g.panel + 1);
  w.varu(g.launchTick).varu(g.fuseEnd).varu(g.signalEnd).varu(g.readyAt).u16(g.seq);
  if (g.flags & GFlag.Flying) w.f32(g.vel[0]).f32(g.vel[1]).f32(g.vel[2]);
}

export function readGadget(r: ByteReader): Gadget {
  const id = r.varu();
  const kind = r.u8();
  if (id === 0 || kind >= GADGET_KINDS.length) throw new ProtocolError("bad gadget");
  const owner = r.varu();
  const team = r.u8();
  const pos: Vec3 = [r.finite(), r.finite(), r.finite()];
  const yaw = r.finite();
  const flags = r.u8();
  if (team > 1 || flags & ~FLAG_BITS) throw new ProtocolError("bad gadget");
  const panel = r.varu() - 1;
  const g: Gadget = { id, kind, owner, team, pos, yaw, vel: [0, 0, 0], flags, panel, launchTick: r.varu(), fuseEnd: r.varu(), signalEnd: r.varu(), readyAt: r.varu(), seq: r.u16() };
  if (flags & GFlag.Flying) g.vel = [r.finite(), r.finite(), r.finite()];
  return g;
}

export class GadgetTable {
  private readonly entries = new Map<number, Gadget>();
  private sorted: Gadget[] | null = [];
  private nextId = 1;
  private ops: GadgetOp[] = [];
  /** Counts changes (renderers redraw when it moved); not part of the state. */
  version = 0;

  /** Every entry, in id order. */
  get list(): readonly Gadget[] {
    this.sorted ??= [...this.entries.values()].sort((a, b) => a.id - b.id);
    return this.sorted;
  }

  get(id: number): Gadget | undefined {
    return this.entries.get(id);
  }

  /** Server: a new entry (its id is the table's next), as an op. */
  add(g: Omit<Gadget, "id">): Gadget {
    const e = exactGadget({ ...g, id: this.nextId++ });
    this.set(e);
    this.ops.push({ kind: "put", g: e });
    return e;
  }

  /** Server: an entry changed (pass the whole new one), as an op. */
  put(g: Gadget): Gadget {
    if (!this.entries.has(g.id)) throw new Error(`no gadget ${g.id}`);
    const e = exactGadget(g);
    this.set(e);
    this.ops.push({ kind: "put", g: e });
    return e;
  }

  /** Server: change some of an entry's fields. */
  update(id: number, change: Partial<Omit<Gadget, "id" | "kind">>): Gadget | undefined {
    const g = this.entries.get(id);
    return g && this.put({ ...g, ...change });
  }

  remove(id: number): void {
    if (!this.entries.delete(id)) return;
    this.sorted = null;
    this.version++;
    this.ops.push({ kind: "remove", id });
  }

  /** A new round: nothing left (ids go on counting, so an old op never names a new entry). */
  clear(): void {
    this.entries.clear();
    this.sorted = [];
    this.version++;
    this.ops.push({ kind: "clear" });
  }

  /** Client: what the server did. */
  apply(op: GadgetOp): void {
    if (op.kind === "put") this.set(exactGadget(op.g));
    else if (op.kind === "remove") {
      if (this.entries.delete(op.id)) {
        this.sorted = null;
        this.version++;
      }
    } else {
      this.entries.clear();
      this.sorted = [];
      this.version++;
    }
  }

  /** Server: the ops since the last call. */
  takeOps(): GadgetOp[] {
    const out = this.ops;
    this.ops = [];
    return out;
  }

  /** Client: the whole table as the server sent it. */
  replace(list: readonly Gadget[]): void {
    this.entries.clear();
    for (const g of list) this.entries.set(g.id, exactGadget(g));
    this.sorted = null;
    this.version++;
  }

  /** fnv1a of every entry's bytes in id order: equal on the server and a client that applied all its ops. */
  hash(): number {
    const w = new ByteWriter(64 * Math.max(1, this.entries.size));
    for (const g of this.list) writeGadget(w, g);
    return fnv1a(w.finish());
  }

  private set(g: Gadget) {
    const had = this.entries.get(g.id);
    this.entries.set(g.id, g);
    if (!had && this.sorted && (this.sorted.length === 0 || this.sorted[this.sorted.length - 1].id < g.id)) this.sorted.push(g);
    else this.sorted = null;
    this.version++;
  }
}
