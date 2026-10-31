// What happened this tick, as the server judged it (PLAN §5; DECISIONS D-044): shots others should see,
// hits for the shooter's hit marker, damage for the victim's indicator, kills for everyone's feed. One
// Events message per tick per client that has any. Clients never report hits; they only draw these.
import type { Vec3 } from "../core/math.js";
import { Cause, CAUSE_MAX } from "../combat/apply.js";
import type { Zone } from "../combat/damage.js";
import { GADGET_KINDS } from "../gadgets/kinds.js";
import { ByteReader, ByteWriter, ProtocolError } from "./bytes.js";
import { MAX_NAME, Msg } from "./protocol.js";


export const ZONES: readonly Zone[] = ["head", "neck", "torso", "pelvis", "arm", "leg"];

export type GameEvent =
  /** A shot others should see and hear: the shooter's muzzle flash, and where each pellet ended (tracers, impacts). */
  | { kind: "shotFx"; pawnId: number; slot: number; suppressed: boolean; ends: Vec3[] }
  /**
   * To the shooter: a body their shot reached (pellets summed per body). `hpAfter`, what the body had left,
   * only in lab rooms (a match doesn't tell you an enemy's health).
   */
  | { kind: "hitConfirm"; seq: number; victimPawn: number; zone: Zone; headshot: boolean; downed: boolean; killed: boolean; friendly: boolean; damage: number; pellets: number; hpAfter: number | null }
  /** To the victim's client: damage to one of its bodies, and where it came from (the attacker's eye). */
  | { kind: "damageTaken"; pawnId: number; amount: number; cause: Cause; attackerCtrl: number; from: Vec3 | null }
  /**
   * To everyone: a player was eliminated. `killerCtrl` 0 = nobody (a fall, the lab tool). The player who
   * downed someone gets the kill when they die; whoever finished them gets the assist (`assistCtrl`).
   */
  | { kind: "kill"; victimPawn: number; victimCtrl: number; killerCtrl: number; assistCtrl: number; weapon: string; cause: Cause; headshot: boolean; friendly: boolean }
  /** To everyone: a player went down but not out (DECISIONS D-048). */
  | { kind: "down"; victimPawn: number; victimCtrl: number; downerCtrl: number; weapon: string; cause: Cause; friendly: boolean }
  /** To everyone: a revive started, and ended (picked up, or cancelled). */
  | { kind: "reviveStart"; reviverPawn: number; targetPawn: number }
  | { kind: "reviveEnd"; reviverPawn: number; targetPawn: number; completed: boolean }
  /** To everyone: Skopós's idle shell was destroyed (not an elimination; she can't swap any more). */
  | { kind: "shellDestroyed"; pawnId: number; ownerCtrl: number; killerCtrl: number; weapon: string; headshot: boolean }
  /** To everyone: an attacker's drone was destroyed (Phase 7; not a death: defenders count the drones they destroy). */
  | { kind: "droneDestroyed"; pawnId: number; ownerCtrl: number; killerCtrl: number }
  /** To the pinger's team (Phase 7, intel/DESIGN.md §6): a ping where they aimed, yellow or danger, for `ticks`. */
  | { kind: "ping"; ctrl: number; pos: Vec3; danger: boolean; ticks: number }
  /** To the scanner's team and the one scanned: an enemy spotted by a drone or a camera, marked for `ticks`. */
  | { kind: "spotted"; pawnId: number; by: number; ticks: number }
  /** To the caller's team: a callout off the comm wheel (data/intel.json `callouts`). */
  | { kind: "callout"; name: string; id: number }
  /** To everyone: a Bulletproof Camera's EMP dart burst there (Phase 7 M5). */
  | { kind: "emp"; pos: Vec3 }
  /** A gadget went off (Phase 8 M2, gadgets/blast.ts): its kind (GADGET_KINDS) and where; everyone sees and hears it. */
  | { kind: "blast"; gadget: number; pos: Vec3 }
  /**
   * To a joining player, and to everyone when it changes: who may reinforce and barricade, and the reinforcements
   * left (Phase 4 M6), and who may rappel (Phase 5 M8).
   */
  | { kind: "deployRules"; anyone: boolean; rappel: boolean; pools: [number, number] };

const KIND = { shotFx: 1, hitConfirm: 2, damageTaken: 3, down: 4, kill: 5, shellDestroyed: 6, reviveStart: 7, reviveEnd: 8, deployRules: 10, droneDestroyed: 11, ping: 12, spotted: 13, callout: 14, emp: 15, blast: 16 } as const;
// 9 Threat (Phase 11) is reserved.

/** Pellet end points travel at 1/32 m in i16: ±1024 m, more than any level. */
const POS_SCALE = 32;
const MAX_EVENTS = 512;
const MAX_PELLETS = 16;

const writePos = (w: ByteWriter, p: Vec3) => {
  for (const v of p) w.i16(Math.max(-32768, Math.min(32767, Math.round(v * POS_SCALE))));
};
const readPos = (r: ByteReader): Vec3 => [r.i16() / POS_SCALE, r.i16() / POS_SCALE, r.i16() / POS_SCALE];

export function encodeEvents(tick: number, events: readonly GameEvent[]): Uint8Array {
  const w = new ByteWriter(64).u8(Msg.Events).u32(tick >>> 0).varu(events.length);
  for (const e of events) {
    w.u8(KIND[e.kind]);
    switch (e.kind) {
      case "shotFx":
        w.varu(e.pawnId).u8((e.slot & 1) | (e.suppressed ? 2 : 0)).u8(Math.min(MAX_PELLETS, e.ends.length));
        for (const p of e.ends.slice(0, MAX_PELLETS)) writePos(w, p);
        break;
      case "hitConfirm":
        w.u16(e.seq & 0xffff).varu(e.victimPawn);
        w.u8(ZONES.indexOf(e.zone) | (e.headshot ? 8 : 0) | (e.killed ? 16 : 0) | (e.friendly ? 32 : 0) | (e.hpAfter !== null ? 64 : 0) | (e.downed ? 128 : 0));
        w.varu(e.damage).u8(Math.min(255, e.pellets));
        if (e.hpAfter !== null) w.u16(Math.max(0, Math.min(0xffff, e.hpAfter)));
        break;
      case "damageTaken":
        w.varu(e.pawnId).varu(e.amount).u8(e.cause | (e.from ? 0x80 : 0)).varu(e.attackerCtrl);
        if (e.from) writePos(w, e.from);
        break;
      case "kill":
        w.varu(e.victimPawn).varu(e.victimCtrl).varu(e.killerCtrl).varu(e.assistCtrl).str(e.weapon).u8(e.cause).u8((e.headshot ? 1 : 0) | (e.friendly ? 2 : 0));
        break;
      case "down":
        w.varu(e.victimPawn).varu(e.victimCtrl).varu(e.downerCtrl).str(e.weapon).u8(e.cause).u8(e.friendly ? 1 : 0);
        break;
      case "reviveStart":
        w.varu(e.reviverPawn).varu(e.targetPawn);
        break;
      case "reviveEnd":
        w.varu(e.reviverPawn).varu(e.targetPawn).u8(e.completed ? 1 : 0);
        break;
      case "shellDestroyed":
        w.varu(e.pawnId).varu(e.ownerCtrl).varu(e.killerCtrl).str(e.weapon).u8(e.headshot ? 1 : 0);
        break;
      case "droneDestroyed":
        w.varu(e.pawnId).varu(e.ownerCtrl).varu(e.killerCtrl);
        break;
      case "ping":
        w.varu(e.ctrl).f32(e.pos[0]).f32(e.pos[1]).f32(e.pos[2]).u8(e.danger ? 1 : 0).u16(e.ticks);
        break;
      case "spotted":
        w.varu(e.pawnId).varu(e.by).u16(e.ticks);
        break;
      case "callout":
        w.str(e.name).u8(e.id);
        break;
      case "emp":
        w.f32(e.pos[0]).f32(e.pos[1]).f32(e.pos[2]);
        break;
      case "blast":
        w.u8(e.gadget).f32(e.pos[0]).f32(e.pos[1]).f32(e.pos[2]);
        break;
      case "deployRules":
        w.u8((e.anyone ? 1 : 0) | (e.rappel ? 2 : 0)).varu(e.pools[0]).varu(e.pools[1]);
        break;
    }
  }
  return w.finish();
}

function cause(v: number): Cause {
  if (v > CAUSE_MAX) throw new ProtocolError("bad cause");
  return v as Cause;
}

/** Decode an Events message (after its type byte). Anything malformed throws. */
export function decodeEvents(r: ByteReader): { tick: number; events: GameEvent[] } {
  const tick = r.u32();
  const n = r.varu();
  if (n > MAX_EVENTS) throw new ProtocolError("too many events");
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    const k = r.u8();
    if (k === KIND.shotFx) {
      const pawnId = r.varu();
      const f = r.u8();
      const count = r.u8();
      if (f > 3 || count > MAX_PELLETS) throw new ProtocolError("bad shot");
      events.push({ kind: "shotFx", pawnId, slot: f & 1, suppressed: (f & 2) !== 0, ends: Array.from({ length: count }, () => readPos(r)) });
    } else if (k === KIND.hitConfirm) {
      const seq = r.u16();
      const victimPawn = r.varu();
      const f = r.u8();
      if ((f & 7) >= ZONES.length || (f & 144) === 144) throw new ProtocolError("bad hit"); // downed and killed at once
      const damage = r.varu();
      const pellets = r.u8();
      const hpAfter = f & 64 ? r.u16() : null;
      events.push({ kind: "hitConfirm", seq, victimPawn, zone: ZONES[f & 7], headshot: (f & 8) !== 0, downed: (f & 128) !== 0, killed: (f & 16) !== 0, friendly: (f & 32) !== 0, damage, pellets, hpAfter });
    } else if (k === KIND.damageTaken) {
      const pawnId = r.varu();
      const amount = r.varu();
      const c = r.u8();
      const attackerCtrl = r.varu();
      if ((c & 0x7f) > CAUSE_MAX) throw new ProtocolError("bad cause");
      events.push({ kind: "damageTaken", pawnId, amount, cause: (c & 0x7f) as Cause, attackerCtrl, from: c & 0x80 ? readPos(r) : null });
    } else if (k === KIND.kill) {
      const victimPawn = r.varu();
      const victimCtrl = r.varu();
      const killerCtrl = r.varu();
      const assistCtrl = r.varu();
      const weapon = r.str(32);
      const c = cause(r.u8());
      const f = r.u8();
      if (f > 3) throw new ProtocolError("bad kill");
      events.push({ kind: "kill", victimPawn, victimCtrl, killerCtrl, assistCtrl, weapon, cause: c, headshot: (f & 1) !== 0, friendly: (f & 2) !== 0 });
    } else if (k === KIND.down) {
      const victimPawn = r.varu();
      const victimCtrl = r.varu();
      const downerCtrl = r.varu();
      const weapon = r.str(32);
      const c = cause(r.u8());
      const f = r.u8();
      if (f > 1) throw new ProtocolError("bad down");
      events.push({ kind: "down", victimPawn, victimCtrl, downerCtrl, weapon, cause: c, friendly: f === 1 });
    } else if (k === KIND.reviveStart) {
      events.push({ kind: "reviveStart", reviverPawn: r.varu(), targetPawn: r.varu() });
    } else if (k === KIND.reviveEnd) {
      const reviverPawn = r.varu();
      const targetPawn = r.varu();
      const f = r.u8();
      if (f > 1) throw new ProtocolError("bad revive end");
      events.push({ kind: "reviveEnd", reviverPawn, targetPawn, completed: f === 1 });
    } else if (k === KIND.shellDestroyed) {
      const pawnId = r.varu();
      const ownerCtrl = r.varu();
      const killerCtrl = r.varu();
      const weapon = r.str(32);
      const f = r.u8();
      if (f > 1) throw new ProtocolError("bad shell event");
      events.push({ kind: "shellDestroyed", pawnId, ownerCtrl, killerCtrl, weapon, headshot: f === 1 });
    } else if (k === KIND.ping) {
      const ctrl = r.varu();
      const pos: Vec3 = [r.finite(), r.finite(), r.finite()];
      const f = r.u8();
      if (f > 1) throw new ProtocolError("bad ping");
      events.push({ kind: "ping", ctrl, pos, danger: f === 1, ticks: r.u16() });
    } else if (k === KIND.spotted) {
      events.push({ kind: "spotted", pawnId: r.varu(), by: r.varu(), ticks: r.u16() });
    } else if (k === KIND.callout) {
      const name = r.str(MAX_NAME * 4);
      const id = r.u8();
      if (id > 15) throw new ProtocolError("bad callout");
      events.push({ kind: "callout", name, id });
    } else if (k === KIND.emp) {
      events.push({ kind: "emp", pos: [r.finite(), r.finite(), r.finite()] });
    } else if (k === KIND.blast) {
      const gadget = r.u8();
      if (gadget >= GADGET_KINDS.length) throw new ProtocolError("bad blast");
      events.push({ kind: "blast", gadget, pos: [r.finite(), r.finite(), r.finite()] });
    } else if (k === KIND.droneDestroyed) {
      events.push({ kind: "droneDestroyed", pawnId: r.varu(), ownerCtrl: r.varu(), killerCtrl: r.varu() });
    } else if (k === KIND.deployRules) {
      const f = r.u8();
      if (f > 3) throw new ProtocolError("bad deploy rules");
      events.push({ kind: "deployRules", anyone: (f & 1) !== 0, rappel: (f & 2) !== 0, pools: [r.varu(), r.varu()] });
    } else throw new ProtocolError(`unknown event ${k}`);
  }
  if (r.remaining !== 0) throw new ProtocolError("trailing bytes");
  return { tick, events };
}
