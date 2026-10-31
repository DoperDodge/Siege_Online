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
/** Invisible movement helpers (the ramp over a staircase): bodies walk on them, bullets pass through. */
export const G_MOVE_HELPER = 0x0004;
/**
 * Destructible panels' movement boxes (Phase 4, destruction/panels.ts): bodies collide with them like level
 * geometry; bullets and sight go through the panels' cells instead (level/raycast.ts), so holes count.
 */
export const G_PANEL = 0x0008;
/**
 * Props with a class (Phase 5, a level solid's `prop`): bodies collide with them and sight stops at them like
 * level geometry, but the bullet query skips them: a bullet decides at each one (combat/hitreg.ts).
 */
export const G_PROP = 0x0010;
/**
 * Drones (Phase 7, intel/DESIGN.md §2): no query sees them (bodies, bullets and sight go through; shots hit them
 * through their hitboxes), and they move against the level, panels, props and the stairs' ramps, not bodies.
 */
export const G_DRONE = 0x0020;
/** A staircase's ramp (a movement helper too): drones drive up it as bodies walk up it (Ulo: drones climb stairs). */
export const G_STAIR_RAMP = 0x0040;
/**
 * Solid gadgets (Phase 8 M3: the deployable shield, sim.ts syncs them with the gadget table): bodies, drones, bullets,
 * blasts, throws and sight meet them like level geometry; a stun's flash doesn't (the shield's slits, QUERY_FLASH).
 */
export const G_GADGET = 0x0080;
const groups = (membership: number, filter: number) => ((membership << 16) | filter) >>> 0;

/** Level geometry: collides with players and other statics. */
export const STATIC_GROUPS = groups(G_STATIC, G_STATIC | G_PLAYER);
/** Movement helpers: like level geometry for movement, but no bullet query sees them. */
export const HELPER_GROUPS = groups(G_MOVE_HELPER, G_STATIC | G_PLAYER);
/** A staircase's ramp: a movement helper drones see too. */
export const STAIR_RAMP_GROUPS = groups(G_MOVE_HELPER | G_STAIR_RAMP, G_STATIC | G_PLAYER);
/** Panel movement boxes: like level geometry for movement, but no bullet query sees them. */
export const PANEL_GROUPS = groups(G_PANEL, G_STATIC | G_PLAYER);
/** Props: like level geometry for movement and sight, but the bullet query doesn't see them. */
export const PROP_GROUPS = groups(G_PROP, G_STATIC | G_PLAYER);
/** Solid gadgets: like level geometry for every query that sees them. */
export const GADGET_GROUPS = groups(G_GADGET, G_STATIC | G_PLAYER);
/** Player movement bodies: blocked by the level and by each other (Skopós' two shells included). */
export const PLAYER_GROUPS = groups(G_PLAYER, G_STATIC | G_PLAYER | G_PANEL | G_PROP | G_GADGET);
/** Dead bodies: invisible to every query. Takes effect at once (setEnabled(false) waits for a refresh). */
export const NONSOLID_PLAYER_GROUPS = groups(G_PLAYER, 0);
/** Query filter that only sees static geometry (ground, walls, panels, props, the prone body, lean). */
export const QUERY_STATIC = groups(G_PLAYER, G_STATIC | G_MOVE_HELPER | G_PANEL | G_PROP | G_GADGET);
/** Query filter that sees the level and players (walking, vault landings, choosing spawn spots). */
export const QUERY_SOLID = groups(G_PLAYER, G_STATIC | G_PLAYER | G_MOVE_HELPER | G_PANEL | G_PROP | G_GADGET);
/**
 * Query filter for bullets: the level you can see that isn't a panel or a prop with a class (each decided on
 * its own), not movement helpers (DECISIONS D-046).
 */
export const QUERY_BULLET = groups(G_PLAYER, G_STATIC | G_GADGET);
/** Query filter for sight (marks, lasers, the knife's line, a tool's reach): the level you can see that isn't a panel, props included. */
export const QUERY_SIGHT = groups(G_PLAYER, G_STATIC | G_PROP | G_GADGET);
/** Query filter for a stun's flash: sight's, through a deployable shield's slits (Fandom). */
export const QUERY_FLASH = groups(G_PLAYER, G_STATIC | G_PROP);
/** Query filter that only sees props with a class. */
export const QUERY_PROPS = groups(G_PLAYER, G_PROP);
/** Query filter that only sees players. */
export const QUERY_PLAYERS = groups(G_PLAYER, G_PLAYER);
/** A drone's collider: nothing else's query sees it. */
export const DRONE_GROUPS = groups(G_DRONE, 0);
/**
 * A drone's own movement: the level, panels, props and the stairs' ramps (it drives up a staircase), but no other
 * movement helper (it rolls under railings that stop bodies).
 */
export const QUERY_DRONE = groups(G_PLAYER, G_STATIC | G_PANEL | G_PROP | G_STAIR_RAMP | G_GADGET);

/**
 * Rebuild the broad phase so queries see colliders moved, resized, added or removed since the last call.
 * Rapier answers every query through a bounding-box tree that only a physics step updates; the world has
 * no rigid bodies, so this does nothing else (Phase 2 investigation, D-029; the timestep is DT, not 0,
 * see Sim.create and D-037).
 *
 * It runs the physics pipeline directly instead of world.step(): the wrapper's step also walks every body
 * and collider handle across the WASM boundary to map ones made on the WASM side (177 µs at 1,500 colliders,
 * against 7–20 µs for the pipeline). We make and remove every collider through the wrapper, which keeps its
 * own maps, so nothing needs that walk (DECISIONS D-073). This uses Rapier 0.21's World fields and
 * PhysicsPipeline.step arguments: re-check them on any Rapier upgrade (physics.test.ts compares the two).
 */
export function refreshBroadPhase(world: World): void {
  world.physicsPipeline.step(
    world.gravity,
    world.integrationParameters,
    world.islands,
    world.broadPhase,
    world.narrowPhase,
    world.bodies,
    world.colliders,
    world.softBodies,
    world.impulseJoints,
    world.multibodyJoints,
    world.ccdSolver,
  );
}
