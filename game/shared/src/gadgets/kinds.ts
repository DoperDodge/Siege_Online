// What the gadget table can hold (Phase 8, gadgets/DESIGN.md §3): every kind by its number on the wire, which is
// its place in this list, so only append. The generic gadgets are data/gadgets/<id>.json (a data test checks each
// has a kind); the level's ingredients (M3, data/gadgets.json `ingredients`) are entries owned by nobody from the
// round's start; the operators' devices join as their milestones build them.
export const GADGET_KINDS = [
  "breach_charge",
  "heavy_breach_charge",
  "claymore",
  "frag",
  "stun",
  "smoke",
  "impact_emp",
  "barbed_wire",
  "armoured_camera",
  "deployable_shield",
  "feed_blocker",
  "impact_grenade",
  "remote_charge",
  "proximity_alarm",
  "fire_extinguisher",
  "gas_pipe",
  "metal_detector",
  "breaching_maul",
  "burn_frame",
  "hailstone_drill",
  "hailstone",
  "damper",
  "blood_oxygen_sensor",
  "blind_pane",
  "pane_canister",
  "crossover_drone",
  "ringer",
  "dropped_phone",
  "burr_mine",
  "frame_barrier",
  // Project Redmond R3's operators' own items (gadgets/R3_OPERATORS.md).
  "brownout_pistol",
  "second_wind",
  "arc_pack",
  "snare_latch",
  "bailiff_post",
  "stud_driver",
  "stud_ring",
  "stud_spine",
  "stud_cross",
  "divining_coil",
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

export const KIND_ARMOURED_CAMERA = kindOf("armoured_camera");
/** Twain's idle shell's barrier (Phase 8 M10): also that shell's camera. */
export const KIND_FRAME_BARRIER = kindOf("frame_barrier");

/** The level's ingredients' kinds (M3): what they are is data/gadgets.json `ingredients`, not a gadget file. */
export const INGREDIENT_KINDS = new Set(["fire_extinguisher", "gas_pipe", "metal_detector"].map(kindOf));
export const isIngredient = (kind: number) => INGREDIENT_KINDS.has(kind);
