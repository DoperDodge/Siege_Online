// Health and being down (Phase 3 M7, M9): the health bar (the 20 HP down pool while down), the down screen
// (crawl, bleed, wait for a teammate) and, while you revive someone, the revive's progress (D-048, D-049).
import { isDowned, TICK_HZ, type CombatData, type PawnState } from "@redmond/shared";

/** Seconds left on a revive `reviveTicks` in. */
export const reviveSecondsLeft = (combat: CombatData, reviveTicks: number) => Math.max(0, reviveTotalTicks(combat) - reviveTicks) / TICK_HZ;
const reviveTotalTicks = (combat: CombatData) => Math.max(1, Math.round(combat.revive.seconds * TICK_HZ));

export class DownedHud {
  private readonly $: (sel: string) => HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.$ = (sel) => root.querySelector<HTMLElement>(sel)!;
  }

  /** `interactKey` names the revive key; `nameOfPawn` the teammate being revived. */
  update(s: PawnState, combat: CombatData, interactKey: string, nameOfPawn: (id: number) => string) {
    const $ = this.$;
    const pool = combat.dbno.hp;
    const down = isDowned(s);
    $(".hp-fill").style.width = down ? `${(100 * s.downHp) / pool}%` : `${(100 * s.hp) / s.maxHp}%`;
    $(".hp-text").textContent = down ? `DOWN · ${Math.ceil(s.downHp)} / ${pool}` : `${s.hp} / ${s.maxHp}`;
    $(".hp").classList.toggle("down", down);
    this.root.classList.toggle("downed", down);
    $(".down-ui").classList.toggle("hidden", !down);
    if (down) {
      $(".down-title").textContent = s.revivedBy
        ? "BEING REVIVED — hold still"
        : `DOWN — crawl to cover; a teammate can revive you (hold ${interactKey})${Math.hypot(s.vx, s.vz) > combat.dbno.movingSpeed ? " · bleeding faster while you crawl" : ""}`;
      $(".down-bar div").style.width = `${(100 * s.downHp) / pool}%`;
    }
    const reviving = s.reviveTarget !== 0;
    $(".revive-ui").classList.toggle("hidden", !reviving);
    if (reviving) {
      $(".revive-title").textContent = `REVIVING ${nameOfPawn(s.reviveTarget) || "teammate"}… ${reviveSecondsLeft(combat, s.reviveTicks).toFixed(1)} s`;
      $(".revive-bar div").style.width = `${Math.min(100, (100 * s.reviveTicks) / reviveTotalTicks(combat))}%`;
    }
  }
}
