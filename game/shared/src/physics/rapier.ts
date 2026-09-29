// Rapier setup shared by client and server. The deterministic build gives bit-identical results in the
// browser and in Node (verified in tools/spike/web_stack), which keeps client prediction exact.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";

export type Rapier = typeof RAPIER;
export type World = InstanceType<Rapier["World"]>;
export type Collider = ReturnType<World["createCollider"]>;
export type CharacterController = ReturnType<World["createCharacterController"]>;
export type ColliderDesc = InstanceType<Rapier["ColliderDesc"]>;

let ready: Promise<Rapier> | null = null;

export function initRapier(): Promise<Rapier> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

// Interaction groups: upper 16 bits = membership, lower 16 bits = filter (Rapier convention).
export const G_STATIC = 0x0001;
export const G_PLAYER = 0x0002;
const groups = (membership: number, filter: number) => ((membership << 16) | filter) >>> 0;

/** Level geometry: collides with players and other statics. */
export const STATIC_GROUPS = groups(G_STATIC, G_STATIC | G_PLAYER);
/** Player movement bodies: only collide with static geometry (player-vs-player blocking comes later). */
export const PLAYER_GROUPS = groups(G_PLAYER, G_STATIC);
/** Query filter that only sees static geometry. */
export const QUERY_STATIC = groups(G_PLAYER, G_STATIC);
