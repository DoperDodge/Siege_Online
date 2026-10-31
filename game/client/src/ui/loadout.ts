// Weapons and attachments (Phase 3 M4, DECISIONS D-042), and your loadouts (Phase 6): the rows that pick each slot's
// weapon and its sight, barrel, grip and laser, the numbers the simulation uses for the weapon, and the loadout each
// operator was last given in this browser, kept for the Play page's Loadouts, the planning screen and the labs.
import {
  defaultLoadoutPick,
  isGun,
  isPickable,
  offerId,
  resolveLoadout,
  TICK_HZ,
  type GameData,
  type GunData,
  type LoadoutPick,
  type Offer,
  type OperatorData,
  type ResolvedWeapon,
  type WeaponPick,
} from "@redmond/shared";

export const SLOTS = ["primary", "secondary"] as const;
export type Slot = (typeof SLOTS)[number];

export const ATTACHMENT_NAMES: Record<string, string> = {
  iron: "Iron sight",
  nonmag: "Red dot / holo (1x)",
  magnified: "Magnified (2.5x)",
  telescopic: "Telescopic (3.5x)",
  muzzle_brake: "Muzzle brake",
  compensator: "Compensator",
  flash_hider: "Flash hider",
  suppressor: "Suppressor",
  extended_barrel: "Extended barrel",
  vertical: "Vertical grip",
  angled: "Angled grip",
  horizontal: "Horizontal grip",
  laser: "Laser",
};

/**
 * One slot's row: the weapon (one the operator carries; Phase 8's shields and launchers are listed but can't be
 * picked) and the attachments it takes for this operator, as selects with `data-slot` and `data-part`; with the
 * resolved weapon, the numbers under it.
 */
export function weaponRow(data: GameData, op: OperatorData, slot: Slot, pick: LoadoutPick, resolved: ResolvedWeapon | null): string {
  const wp = pick[slot];
  const w = data.weapons.get(wp.weapon);
  const allowed = <T extends string>(offers: Offer<T>[]) => offers.filter((o) => typeof o === "string" || o.operators.includes(op.id)).map(offerId);
  const select = (part: string, options: [string, string, boolean?][], current: string) =>
    `<select data-slot="${slot}" data-part="${part}">${options.map(([v, label, off]) => `<option value="${v}" ${v === current ? "selected" : ""} ${off ? "disabled" : ""}>${label}</option>`).join("")}</select>`;
  const ids = op.loadout[slot === "primary" ? "primaries" : "secondaries"];
  const weapons: [string, string, boolean][] = ids.map((id) => [id, isPickable(data, id) ? data.weapons.get(id)!.name : `${data.weapons.get(id)!.name} (Phase 8)`, !isPickable(data, id)]);
  let atts = "";
  if (w && isGun(w)) {
    const named = (v: string): [string, string] => [v, ATTACHMENT_NAMES[v] ?? v];
    const sights = allowed(w.attachments.sights).map(named);
    const barrels = allowed(w.attachments.barrels).map(named);
    const grips = allowed(w.attachments.grips).map(named);
    const unders = allowed(w.attachments.underbarrel).map(named);
    atts = [
      sights.length > 1 ? select("sight", sights, wp.sight ?? "iron") : "",
      barrels.length ? select("barrel", [["", "No barrel"], ...barrels], wp.barrel ?? "") : "",
      grips.length > 1 ? select("grip", grips, wp.grip ?? "horizontal") : "",
      unders.length ? select("underbarrel", [["", "No laser"], ...unders], wp.underbarrel ?? "") : "",
    ].join("");
  }
  return `<div class="loadout-row"><label>${slot === "primary" ? "Primary" : "Secondary"} ${select("weapon", weapons, wp.weapon)}</label>
      <div class="atts">${atts}</div>
      ${resolved && w && isGun(w) ? `<p class="note stats">${weaponStats(resolved, w)}</p>` : ""}</div>`;
}

/** Both slots' rows for a loadout, with each weapon's numbers, and its gadgets. */
export function loadoutRows(data: GameData, pick: LoadoutPick): string {
  const op = data.operators.get(pick.operator)!;
  const lo = resolveLoadout(data, pick).loadout;
  return SLOTS.map((slot, i) => weaponRow(data, op, slot, pick, lo.weapons[i] ?? null)).join("") + gadgetRow(data, op, pick);
}

/**
 * The gadget row (Phase 8): one of the operator's gadgets, or a kit's two (Striker, Sentry: two different ones), as
 * selects with `data-gadget` (their place in the pick); nothing for an operator without gadgets.
 */
export function gadgetRow(data: GameData, op: OperatorData, pick: LoadoutPick): string {
  const kit = op.loadout.gadgetKit;
  const pool = kit ? kit.pool : op.loadout.gadgets;
  if (pool.length === 0) return "";
  const name = (id: string) => data.gadgets.get(id)?.name ?? id;
  const count = (id: string) => data.gadgets.get(id)?.count ?? 0;
  const select = (i: number) =>
    `<select data-gadget="${i}">${pool.map((id) => `<option value="${id}" ${pick.gadgets[i] === id ? "selected" : ""}>${name(id)} ×${count(id)}</option>`).join("")}</select>`;
  const picks = kit ? kit.picks : 1;
  return `<div class="loadout-row"><label>${picks > 1 ? "Gadgets" : "Gadget"} ${Array.from({ length: picks }, (_, i) => select(i)).join(" ")}</label></div>`;
}

/** The pick with gadget `i` changed; a kit's two stay different (the other takes the old one's place). */
export function changedGadget(data: GameData, pick: LoadoutPick, i: number, value: string): LoadoutPick {
  const next: LoadoutPick = structuredClone(pick);
  const kit = data.operators.get(pick.operator)?.loadout.gadgetKit;
  const was = next.gadgets[i];
  next.gadgets[i] = value;
  if (kit?.distinct) next.gadgets.forEach((g, k) => k !== i && g === value && was !== undefined && (next.gadgets[k] = was));
  return next;
}

/** The numbers the simulation uses for this weapon, with a "?" on placeholders. */
export function weaponStats(r: ResolvedWeapon, w: GunData): string {
  const unv = (path: string) =>
    w._unverified.some((u) => path === u || path.startsWith(u + ".")) ? `<span class="unv" title="Placeholder: not verified yet (research/OPEN_QUESTIONS.md)">?</span>` : "";
  const sec = (ticks: number) => `${(ticks / TICK_HZ).toFixed(2)} s`;
  const reload =
    r.reload.kind === "magazine"
      ? `reload ${sec(r.reload.tacticalTicks)}${unv("reload.tacticalS")} / ${sec(r.reload.emptyTicks)}${unv("reload.emptyS")}`
      : r.reload.kind === "per_shell"
        ? `${sec(r.reload.perShellTicks)}${unv("reload.perShellS")} a shell`
        : "";
  return [
    r.damage ? `${r.damage.base}${unv(r.pick.barrel === "extended_barrel" ? "damage.extendedBarrel" : "damage.base")} dmg${r.fire.pellets > 1 ? ` × ${r.fire.pellets} pellets` : ""}` : "",
    `${r.fire.rpm}${unv("fire.rpm")} rpm`,
    `${r.ammo.magazine}${r.ammo.plusOne ? "+1" : ""} / ${r.ammo.maxAmmo}${unv("ammo.maxAmmo")}`,
    `ADS ${sec(r.ads.ticks)}`,
    reload,
    r.moveSpeedMult < 0.999 ? `${Math.round((1 - r.moveSpeedMult) * 100)} % slower` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The pick with one select changed: a new weapon starts bare (resolving fills in its defaults), an attachment is set ("": none). */
export function changedPick(pick: LoadoutPick, slot: Slot, part: keyof WeaponPick, value: string): LoadoutPick {
  const next: LoadoutPick = structuredClone(pick);
  if (part === "weapon") next[slot] = { weapon: value, sight: null, barrel: null, grip: null, underbarrel: null };
  else (next[slot] as unknown as Record<string, string | null>)[part] = value || null;
  return next;
}

const STORE_KEY = "redmond.loadouts";

/** Every operator's loadout as this browser last set it. */
function stored(): Record<string, LoadoutPick> {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    return typeof all === "object" && all !== null ? (all as Record<string, LoadoutPick>) : {};
  } catch {
    return {}; // storage blocked, or something unreadable in it
  }
}

/** The operator's loadout as this browser last set it, made valid (what they can't carry becomes their default); else their default. */
export function savedLoadout(data: GameData, opId: string): LoadoutPick {
  const pick = stored()[opId];
  if (pick?.operator !== opId) return defaultLoadoutPick(data, opId);
  try {
    return resolveLoadout(data, pick).loadout.pick;
  } catch {
    return defaultLoadoutPick(data, opId); // not a loadout at all
  }
}

/** Keep this loadout for its operator (in this browser). */
export function saveLoadout(pick: LoadoutPick): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...stored(), [pick.operator]: pick }));
  } catch {
    // not kept; fine
  }
}
