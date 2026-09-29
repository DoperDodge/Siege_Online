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

/** Body height right now: the stance blend, tucked down mid-vault (`tuck` 0..1). */
export function currentHeight(m: MovementData, s: PawnState): number {
  const h = lerp(stanceDims(m, s.stanceFrom).height, stanceDims(m, s.stance).height, stanceBlend(s));
  return s.tuck > 0 ? lerp(h, Math.min(h, m.vault.apexBodyHeight), s.tuck) : h;
}

/** Eye height right now; stays inside the tucked body during a vault. */
export function currentEyeHeight(m: MovementData, s: PawnState): number {
  const eye = lerp(stanceDims(m, s.stanceFrom).eye, stanceDims(m, s.stance).eye, stanceBlend(s));
  const tuckedEye = m.vault.apexBodyHeight - (stanceDims(m, s.stance).height - stanceDims(m, s.stance).eye);
  return s.tuck > 0 ? lerp(eye, Math.min(eye, tuckedEye), s.tuck) : eye;
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

/**
 * Movement capsule for a total height: the radius shrinks for very low bodies (prone is lower than a
 * 0.3 m-radius capsule allows), and hh is Rapier's half segment length.
 */
export function capsuleDims(height: number, maxRadius: number): { r: number; hh: number } {
  const r = Math.min(maxRadius, height / 2 - 0.005);
  return { r, hh: Math.max(0.005, height / 2 - r) };
}
