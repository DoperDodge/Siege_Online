// Exact (lossless) encoding of a PawnState. Every continuous field is kept float32-exact by the
// simulation (roundState in movement.ts), so float32 on the wire restores the state bit-for-bit — what
// reconciliation needs to replay a client's prediction from the server's state.
import type { PlayerController } from "../player/pawn.js";
import type { PawnState } from "../player/types.js";
import { ByteReader, ByteWriter, fnv1a, ProtocolError } from "./bytes.js";

/** Continuous fields, in wire order. */
export const PAWN_F32_FIELDS = [
  "x", "y", "z", "vx", "vy", "vz", "yaw", "pitch", "stanceT", "lean", "tiltF", "tiltB", "tiltSide",
  "sinceSprint", "moveT", "moveDur", "fromX", "fromY", "fromZ", "toX", "toY", "toZ", "apexY", "tuck", "airPeakY",
  "recoilPendP", "recoilPendY", "recoilRecP", "recoilRecY", "downHp",
] as const satisfies readonly (keyof PawnState)[];

/** Integer fields by wire width (after the flags, enums, buttons and ladder written by hand below). */
export const PAWN_U8_FIELDS = [
  "slot", "wAct", "reloadKind", "wflags", "loaded0", "loaded1", "modes", "burstLeft", "downs", "invulnTicks", "meleeTicks",
] as const satisfies readonly (keyof PawnState)[];
export const PAWN_U16_FIELDS = [
  "hp", "maxHp", "lastFallDamage", "actTicks", "reserve0", "reserve1", "cycle", "adsQ", "shotIdx", "sinceShot", "reviveTicks",
] as const satisfies readonly (keyof PawnState)[];
export const PAWN_U32_FIELDS = ["rng", "reviveTarget", "revivedBy"] as const satisfies readonly (keyof PawnState)[];

/** Every non-float field (the hash test changes each one). */
export const PAWN_INT_FIELDS = [
  "grounded", "sprinting", "stance", "stanceFrom", "mode", "prevButtons", "ladder", ...PAWN_U8_FIELDS, ...PAWN_U16_FIELDS, ...PAWN_U32_FIELDS,
] as const satisfies readonly (keyof PawnState)[];

/** Bytes of one full state on the wire: the floats, flags, 3 enums, buttons (u16), ladder, then the u8/u16/u32 fields. */
export const PAWN_STATE_BYTES =
  PAWN_F32_FIELDS.length * 4 + 1 + 3 + 2 + 1 + PAWN_U8_FIELDS.length + PAWN_U16_FIELDS.length * 2 + PAWN_U32_FIELDS.length * 4;

export function writePawnState(w: ByteWriter, s: PawnState): void {
  for (const k of PAWN_F32_FIELDS) w.f32(s[k]);
  w.u8((s.grounded ? 1 : 0) | (s.sprinting ? 2 : 0));
  w.u8(s.stance).u8(s.stanceFrom).u8(s.mode);
  w.u16(s.prevButtons);
  w.i8(s.ladder);
  for (const k of PAWN_U8_FIELDS) w.u8(s[k]);
  for (const k of PAWN_U16_FIELDS) w.u16(s[k]);
  for (const k of PAWN_U32_FIELDS) w.u32(s[k]);
}

export function readPawnState(r: ByteReader): PawnState {
  const f: Record<string, number> = {};
  for (const k of PAWN_F32_FIELDS) f[k] = r.finite();
  const flags = r.u8();
  const stance = r.u8();
  const stanceFrom = r.u8();
  const mode = r.u8();
  if (stance > 2 || stanceFrom > 2 || mode > 3) throw new ProtocolError("bad pawn state enum");
  const prevButtons = r.u16();
  const ladder = r.i8();
  for (const k of PAWN_U8_FIELDS) f[k] = r.u8();
  for (const k of PAWN_U16_FIELDS) f[k] = r.u16();
  for (const k of PAWN_U32_FIELDS) f[k] = r.u32();
  if (f.slot > 1 || f.wAct > 2 || f.reloadKind > 3) throw new ProtocolError("bad pawn weapon state");
  return {
    ...(f as Record<(typeof PAWN_F32_FIELDS)[number] | (typeof PAWN_U8_FIELDS)[number] | (typeof PAWN_U16_FIELDS)[number] | (typeof PAWN_U32_FIELDS)[number], number>),
    grounded: (flags & 1) !== 0,
    sprinting: (flags & 2) !== 0,
    stance,
    stanceFrom,
    mode,
    prevButtons,
    ladder,
  } as PawnState;
}

/** Hash of a state's exact wire bytes: equal hashes ⇔ (practically) identical states. */
export function hashPawnState(s: PawnState): number {
  const w = new ByteWriter(PAWN_STATE_BYTES);
  writePawnState(w, s);
  return fnv1a(w.finish());
}

/** The predicted part of a controller (Skopós' camera and swap state): exact, like PawnState. */
export type ControllerState = Pick<PlayerController, "possessedPawnId" | "shellCam" | "swapPhase" | "swapT" | "swapCooldown" | "prevButtons">;

export function controllerState(c: PlayerController): ControllerState {
  const { possessedPawnId, shellCam, swapPhase, swapT, swapCooldown, prevButtons } = c;
  return { possessedPawnId, shellCam, swapPhase, swapT, swapCooldown, prevButtons };
}

export function writeControllerState(w: ByteWriter, c: ControllerState): void {
  w.varu(c.possessedPawnId).u8((c.shellCam ? 1 : 0) | (c.swapPhase << 1)).f32(c.swapT).f32(c.swapCooldown).u16(c.prevButtons);
}

export function readControllerState(r: ByteReader): ControllerState {
  const possessedPawnId = r.varu();
  const flags = r.u8();
  const swapPhase = flags >> 1;
  if (swapPhase > 2) throw new ProtocolError("bad swap phase");
  return { possessedPawnId, shellCam: (flags & 1) !== 0, swapPhase: swapPhase as 0 | 1 | 2, swapT: r.finite(), swapCooldown: r.finite(), prevButtons: r.u16() };
}
