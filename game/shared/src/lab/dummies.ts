// Range Lab dummies (Phase 3 M10, DECISIONS D-052): what a scripted target does each tick, as a pure
// function of the tick, its body and its definition (data/maps/<level>/layout.json), so two rooms step it
// identically. Dummies never fire or aim; the room spawns, respawns and steps them like players without a
// client (net/room.ts).
import { DEG, wrapAngle } from "../core/math.js";
import { TICK_HZ } from "../core/constants.js";
import type { DummyDef } from "../data/schemas.js";
import { quantizeInput, Stance, type InputCmd, type PawnState } from "../player/types.js";

export const DUMMY_STANCE = { stand: Stance.Stand, crouch: Stance.Crouch, prone: Stance.Prone } as const;

/** The dummy's input for tick `tick` (seq is the tick, which nothing reads: dummies never fire). */
export function dummyInput(tick: number, s: PawnState, def: DummyDef): InputCmd {
  const yaw = wrapAngle(def.yawDeg * DEG);
  const cmd: InputCmd = { seq: tick & 0xffff, forward: 0, strafe: 0, yaw, pitch: 0, buttons: 0, stance: DUMMY_STANCE[def.stance], lean: def.lean };
  const period = Math.max(1, Math.round(def.periodS * TICK_HZ));
  const phase = (tick % period) / period;
  if (def.script === "strafe") {
    // Half the period right, half left, across its facing; past either end of the span it turns back at
    // once, so a bump never walks it off its track.
    const offset = (s.x - def.pos[0]) * Math.cos(yaw) - (s.z - def.pos[2]) * Math.sin(yaw); // along its right
    const half = def.span / 2;
    cmd.strafe = offset > half ? -1 : offset < -half ? 1 : phase < 0.5 ? 1 : -1;
  } else if (def.script === "peek") {
    // Out to the left for a quarter of the period, back in, out to the right, back in.
    cmd.lean = phase < 0.25 ? -1 : phase < 0.5 ? 0 : phase < 0.75 ? 1 : 0;
  }
  return quantizeInput(cmd);
}
