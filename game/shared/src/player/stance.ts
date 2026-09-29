import { lerp, smoothstep } from "../core/math.js";
import type { MovementData } from "../data/schemas.js";
import { STANCE_KEYS, Stance, type PawnState } from "./types.js";

export function stanceDims(m: MovementData, s: Stance) {
  return m.stance[STANCE_KEYS[s]];
}

export function transitionSeconds(m: MovementData, from: Stance, to: Stance): number {
  const key = `${STANCE_KEYS[from]}To${STANCE_KEYS[to][0].toUpperCase()}${STANCE_KEYS[to].slice(1)}` as keyof MovementData["stance"]["transitionSeconds"];
  return m.stance.transitionSeconds[key];
}

/** Eased 0..1 progress of the current stance transition. */
export const stanceBlend = (s: PawnState) => smoothstep(s.stanceT);

export function currentHeight(m: MovementData, s: PawnState): number {
  return lerp(stanceDims(m, s.stanceFrom).height, stanceDims(m, s.stance).height, stanceBlend(s));
}

export function currentEyeHeight(m: MovementData, s: PawnState): number {
  return lerp(stanceDims(m, s.stanceFrom).eye, stanceDims(m, s.stance).eye, stanceBlend(s));
}

/** 0 = fully upright pose, 1 = fully prone pose (blends during transitions to or from prone). */
export function proneWeight(s: PawnState): number {
  const toProne = s.stance === Stance.Prone;
  const fromProne = s.stanceFrom === Stance.Prone;
  if (toProne && fromProne) return 1;
  if (toProne) return stanceBlend(s);
  if (fromProne) return 1 - stanceBlend(s);
  return 0;
}

/** Capsule half-height (Rapier's segment half-length) for a total height and radius. */
export function capsuleHalfHeight(height: number, radius: number): number {
  return Math.max(0.01, height / 2 - radius);
}
