// What the gadget table can hold (Phase 8, gadgets/DESIGN.md §3): every kind by its number on the wire, which is
// its place in this list, so only append. The generic gadgets are data/gadgets/<id>.json (a data test checks each
// has a kind); the level's ingredients (M3, data/gadgets.json `ingredients`) are entries owned by nobody from the
// round's start; the operators' devices join as their milestones build them.
export const GADGET_KINDS = [
  "breach_charge",
  "hard_breach_charge",
  "claymore",
  "frag",
  "stun",
  "smoke",
  "impact_emp",
  "barbed_wire",
  "bulletproof_camera",
  "deployable_shield",
  "observation_blocker",
  "impact_grenade",
  "nitro_cell",
  "proximity_alarm",
  "fire_extinguisher",
  "gas_pipe",
  "metal_detector",
  "breaching_hammer",
] as const;

const index = new Map<string, number>(GADGET_KINDS.map((k, i) => [k, i]));

/** A kind's number, or −1 when there's no such kind. */
export function kindOf(id: string): number {
  return index.get(id) ?? -1;
}

/** A kind's id from its number (undefined past the list). */
export function kindId(kind: number): string | undefined {
  return GADGET_KINDS[kind];
}

export const KIND_BP_CAMERA = kindOf("bulletproof_camera");

/** The level's ingredients' kinds (M3): what they are is data/gadgets.json `ingredients`, not a gadget file. */
export const INGREDIENT_KINDS = new Set(["fire_extinguisher", "gas_pipe", "metal_detector"].map(kindOf));
export const isIngredient = (kind: number) => INGREDIENT_KINDS.has(kind);
