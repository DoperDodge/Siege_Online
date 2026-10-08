// Taking damage (Phase 3 M6, M9): the screen's edge flashes red, and an arc around the crosshair points
// toward where it came from (the attacker's eye, from the server's damageTaken event).
import { wrapAngle, type Vec3 } from "@redmond/shared";

/**
 * Where the arc points, in degrees clockwise from straight up on screen, for damage from `from` to a body
 * at `at` looking along `yaw` (yaw 0 faces −Z and grows turning left): 0 ahead, 90 right, ±180 behind.
 */
export function damageArcDeg(at: { x: number; z: number }, yaw: number, from: Vec3): number {
  const toward = Math.atan2(-(from[0] - at.x), -(from[2] - at.z)); // the yaw that faces the attacker
  return (-wrapAngle(toward - yaw) * 180) / Math.PI;
}

export class DamageIndicator {
  private until = 0;
  private readonly edge: HTMLElement;
  private readonly arc: HTMLElement;

  constructor(root: HTMLElement) {
    this.edge = root.querySelector<HTMLElement>(".hurt")!;
    this.arc = root.querySelector<HTMLElement>(".hurt-dir")!;
  }

  /** Damage landed now; with `arcDeg` (see damageArcDeg) the arc shows where from. */
  hurt(now: number, arcDeg: number | null) {
    this.until = now + 700;
    this.arc.classList.toggle("on", arcDeg !== null);
    if (arcDeg !== null) this.arc.style.setProperty("--a", `${arcDeg}deg`);
  }

  update(now: number) {
    this.edge.classList.toggle("show", now < this.until);
    this.arc.classList.toggle("show", now < this.until + 300);
  }
}
