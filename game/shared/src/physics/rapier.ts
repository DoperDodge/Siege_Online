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
/** Player movement bodies: blocked by the level and by each other (Skopós' two shells included). */
export const PLAYER_GROUPS = groups(G_PLAYER, G_STATIC | G_PLAYER);
/** Dead bodies: invisible to every query. Takes effect at once (setEnabled(false) waits for a refresh). */
export const NONSOLID_PLAYER_GROUPS = groups(G_PLAYER, 0);
/** Query filter that only sees static geometry (ground, walls, the prone body, lean). */
export const QUERY_STATIC = groups(G_PLAYER, G_STATIC);
/** Query filter that sees the level and players (walking, vault landings, choosing spawn spots). */
export const QUERY_SOLID = groups(G_PLAYER, G_STATIC | G_PLAYER);
/** Query filter that only sees players. */
export const QUERY_PLAYERS = groups(G_PLAYER, G_PLAYER);

/**
 * Rebuild the broad phase so queries see colliders moved, resized, added or removed since the last call.
 * Rapier answers every query through a bounding-box tree that only world.step() updates; the world has
 * no rigid bodies, so this does nothing else (Phase 2 investigation, D-029; the timestep is DT, not 0,
 * see Sim.create and D-037).
 */
export function refreshBroadPhase(world: World): void {
  world.step();
}
