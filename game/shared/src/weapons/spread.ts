// Where each bullet or pellet goes inside the spread cone (DECISIONS D-041). Server-only: drawn from a
// secret per-room seed and the shot's identity (controller, input seq, pellet), so there is no state to
// predict or desync, the processing order can't change a draw, and a client can't learn its spread ahead.
import type { Vec3 } from "../core/math.js";

/** 32-bit finalizer (murmur3 fmix32). */
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A well-mixed 32-bit hash of four integers. */
export function hash4(a: number, b: number, c: number, d: number): number {
  let h = fmix(a >>> 0);
  h = fmix((h ^ (b >>> 0)) >>> 0);
  h = fmix((h ^ (c >>> 0)) >>> 0);
  return fmix((h ^ (d >>> 0)) >>> 0);
}

/** Unit view direction for (yaw, pitch): yaw 0 faces −Z, positive yaw turns left, positive pitch looks up. */
export function viewDir(yaw: number, pitch: number): Vec3 {
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

/**
 * Directions of a shot's pellets: each uniform over the disc of the cone (half-angle `cone` radians) around
 * the view, from hash4(seed, controller, seq, pellet). A cone of 0 puts every pellet on the crosshair.
 */
export function pelletDirections(seed: number, controllerId: number, seq: number, pellets: number, yaw: number, pitch: number, cone: number): Vec3[] {
  const f = viewDir(yaw, pitch);
  if (cone <= 0) return Array.from({ length: pellets }, () => [...f] as Vec3);
  // An orthonormal frame around the view: right is horizontal, up completes it.
  const r: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const out: Vec3[] = [];
  for (let i = 0; i < pellets; i++) {
    const h1 = hash4(seed, controllerId, seq, i * 2);
    const h2 = hash4(seed, controllerId, seq, i * 2 + 1);
    const theta = cone * Math.sqrt(h1 / 4294967296);
    const phi = (2 * Math.PI * h2) / 4294967296;
    const t = Math.tan(theta);
    const d: Vec3 = [
      f[0] + t * (Math.cos(phi) * r[0] + Math.sin(phi) * u[0]),
      f[1] + t * (Math.cos(phi) * r[1] + Math.sin(phi) * u[1]),
      f[2] + t * (Math.cos(phi) * r[2] + Math.sin(phi) * u[2]),
    ];
    const len = Math.hypot(...d);
    out.push([d[0] / len, d[1] / len, d[2] / len]);
  }
  return out;
}
