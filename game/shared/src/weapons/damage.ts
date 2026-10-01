// Damage against distance for one bullet or pellet (research/weapons_notes.md §4.3): flat before the first
// falloff point and after the last, linear in between. Unrounded: combat/damage.ts rounds once, after the zone
// and penetration multipliers.

export type Falloff = readonly (readonly [number, number])[];

export function falloffAt(falloff: Falloff, distM: number): number {
  if (distM <= falloff[0][0]) return falloff[0][1];
  for (let i = 1; i < falloff.length; i++) {
    const [d1, v1] = falloff[i];
    if (distM <= d1) {
      const [d0, v0] = falloff[i - 1];
      return v0 + ((v1 - v0) * (distM - d0)) / (d1 - d0);
    }
  }
  return falloff[falloff.length - 1][1];
}
