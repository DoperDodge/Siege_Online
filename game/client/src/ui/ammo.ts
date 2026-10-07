// The weapon readout (Phase 3 M3, M9), bottom right: weapon, rounds loaded / in reserve (red when the
// magazine is nearly empty), fire mode, and whether it's reloading or being switched to.
import { fireModeOf, loadedOf, reserveOf, WeaponAct, type PawnState, type ResolvedWeapon } from "@redmond/shared";

/** "AUTO", "BURST 3", "SINGLE"…, with the key that changes it when the weapon has more than one mode. */
export function fireModeText(w: ResolvedWeapon, s: PawnState, fireModeKey: string): string {
  const mode = fireModeOf(w, s).toUpperCase().replace("BURST", "BURST ");
  return w.fire.modes.length > 1 ? `${mode} (${fireModeKey})` : mode;
}

/** The magazine counts as low at a fifth of its size (at least one round). */
export const ammoLow = (w: ResolvedWeapon, loaded: number) => loaded <= Math.max(1, Math.floor(w.ammo.magazine / 5));

export class AmmoHud {
  private readonly box: HTMLElement;
  private readonly name: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly loaded: HTMLElement;
  private readonly reserve: HTMLElement;
  private readonly state: HTMLElement;

  constructor(root: HTMLElement) {
    const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    this.box = $(".hud-br");
    this.name = $(".weapon-name");
    this.ammo = $(".ammo");
    this.loaded = $(".ammo-loaded");
    this.reserve = $(".ammo-reserve");
    this.state = $(".weapon-state");
  }

  /** `w` the weapon in hand (none, or `hidden`: nothing shown). */
  update(w: ResolvedWeapon | undefined, s: PawnState, hidden: boolean, fireModeKey: string) {
    this.box.classList.toggle("hidden", !w || hidden);
    if (!w || hidden) return;
    this.name.textContent = `${w.name}${w.suppressed ? " · suppressed" : ""}`;
    this.loaded.textContent = String(loadedOf(s));
    this.reserve.textContent = ` / ${reserveOf(s)}`;
    this.ammo.classList.toggle("low", ammoLow(w, loadedOf(s)));
    this.state.textContent = [fireModeText(w, s, fireModeKey), s.wAct === WeaponAct.Reload ? "RELOADING" : s.wAct === WeaponAct.Equip ? "SWITCHING" : ""].filter(Boolean).join("  ·  ");
  }
}
