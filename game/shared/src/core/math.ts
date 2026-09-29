export type Vec3 = [number, number, number];

export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Move `from` toward `to` by at most `maxDelta`. */
export function approach(from: number, to: number, maxDelta: number): number {
  if (from < to) return Math.min(from + maxDelta, to);
  return Math.max(from - maxDelta, to);
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t <= 0 ? t + 2 * Math.PI : t) - Math.PI;
}

/** Horizontal forward vector for a yaw (yaw 0 faces -Z, positive yaw turns left, like Three.js). */
export function forwardXZ(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

/** Horizontal right vector for a yaw. */
export function rightXZ(yaw: number): [number, number] {
  return [Math.cos(yaw), -Math.sin(yaw)];
}

/** Rotate a local (x, z) offset by a yaw into world space. */
export function rotateXZ(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

/** Quaternion [x, y, z, w] for a yaw about +Y followed by (applied first) a pitch about +X. */
export function quatYawPitch(yaw: number, pitch: number): [number, number, number, number] {
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}

/** Quaternion that rotates +Z onto the given unit direction (used for horizontal prone capsules). */
export function quatFromTo(from: Vec3, to: Vec3): [number, number, number, number] {
  const d = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (d < -0.999999) return [0, 1, 0, 0];
  const cx = from[1] * to[2] - from[2] * to[1];
  const cy = from[2] * to[0] - from[0] * to[2];
  const cz = from[0] * to[1] - from[1] * to[0];
  const w = 1 + d;
  const n = Math.hypot(cx, cy, cz, w);
  return [cx / n, cy / n, cz / n, w / n];
}
