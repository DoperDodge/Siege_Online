// Health and being down (Phase 3 M7, M9): the health bar (the 20 HP down pool while down), the down screen
// (crawl, bleed, wait for a teammate) and, while you revive someone, the revive's progress (D-048, D-049);
// the same gauge shows a reinforcement or barricade going up (Phase 4 M6), a rope being hooked on (Phase 5 M8), the
// defuser being planted or disabled (Phase 6, match/DESIGN.md §8), and a Bulletproof Camera being placed (Phase 7).
import { DeployKind, deployTicks, GadgetAct, isDowned, PawnMode, ticks, TICK_HZ, type CombatData, type DestructionData, type MovementData, type PawnState } from "@redmond/shared";

/** Seconds left on a revive `reviveTicks` in. */
export const reviveSecondsLeft = (combat: CombatData, reviveTicks: number) => Math.max(0, reviveTotalTicks(combat) - reviveTicks) / TICK_HZ;
const reviveTotalTicks = (combat: CombatData) => Math.max(1, Math.round(combat.revive.seconds * TICK_HZ));

export class DownedHud {
  private readonly $: (sel: string) => HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.$ = (sel) => root.querySelector<HTMLElement>(sel)!;
  }

  /**
   * `interactKey` names the revive key; `nameOfPawn` the teammate being revived; `holds`, a match's plant and disable
   * holds in ticks (the simulation's objective); `gadget`: the gadget in hand's name and placing time, and the one an
   * Interact hold takes back and how long that takes, in ticks (Phase 8).
   */
  update(
    s: PawnState,
    combat: CombatData,
    interactKey: string,
    nameOfPawn: (id: number) => string,
    destruction?: DestructionData,
    movement?: MovementData,
    holds?: { plantTicks: number; disableTicks: number } | null,
    gadget: { name: string; placeTicks: number; takeBack: string; takeBackTicks: number } | null = null,
  ) {
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
    const deploying = destruction !== undefined && s.deployKind !== DeployKind.None;
    const placing = gadget !== null && s.gAct === GadgetAct.Place;
    const hooking = movement !== undefined && s.mode === PawnMode.Walk && s.rappelTicks > 0;
    const breaching = movement !== undefined && s.mode === PawnMode.Rappel && s.rappelTicks > 0;
    $(".revive-ui").classList.toggle("hidden", !reviving && !deploying && !hooking && !breaching && !placing);
    if (reviving) {
      $(".revive-title").textContent = `REVIVING ${nameOfPawn(s.reviveTarget) || "teammate"}… ${reviveSecondsLeft(combat, s.reviveTicks).toFixed(1)} s`;
      $(".revive-bar div").style.width = `${Math.min(100, (100 * s.reviveTicks) / reviveTotalTicks(combat))}%`;
    } else if (placing) {
      const total = Math.max(1, gadget.placeTicks);
      $(".revive-title").textContent = `PLACING THE ${gadget.name.toUpperCase()}… ${(Math.max(0, total - s.gTicks) / TICK_HZ).toFixed(1)} s`;
      $(".revive-bar div").style.width = `${Math.min(100, (100 * s.gTicks) / total)}%`;
    } else if (deploying) {
      const defuser = s.deployKind === DeployKind.Plant || s.deployKind === DeployKind.Disable;
      const takeBack = s.deployKind === DeployKind.PickUp;
      const total = Math.max(1, defuser ? ((s.deployKind === DeployKind.Plant ? holds?.plantTicks : holds?.disableTicks) ?? 1) : takeBack ? (gadget?.takeBackTicks ?? 1) : deployTicks(destruction, s.deployKind));
      const what = takeBack
        ? `PICKING UP THE ${(gadget?.takeBack ?? "gadget").toUpperCase()}`
        : s.deployKind === DeployKind.Reinforce
          ? "REINFORCING"
          : s.deployKind === DeployKind.BarricadeUp
            ? "BARRICADING"
            : s.deployKind === DeployKind.Plant
              ? "PLANTING THE DEFUSER"
              : s.deployKind === DeployKind.Disable
                ? "DISABLING THE DEFUSER"
                : "REMOVING THE BARRICADE";
      $(".revive-title").textContent = `${what}… ${(Math.max(0, total - s.deployTicks) / TICK_HZ).toFixed(1)} s`;
      $(".revive-bar div").style.width = `${Math.min(100, (100 * s.deployTicks) / total)}%`;
    } else if (hooking) {
      const total = ticks(movement.rappel.holdSeconds);
      $(".revive-title").textContent = `HOOKING ON… ${(Math.max(0, total - s.rappelTicks) / TICK_HZ).toFixed(1)} s`;
      $(".revive-bar div").style.width = `${Math.min(100, (100 * s.rappelTicks) / total)}%`;
    } else if (breaching) {
      const total = ticks(movement.rappel.swingSeconds);
      $(".revive-title").textContent = s.rappelTicks > total ? "BOUNCED OFF" : `SWINGING IN… ${(Math.max(0, total - s.rappelTicks) / TICK_HZ).toFixed(1)} s`;
      $(".revive-bar div").style.width = `${Math.min(100, (100 * s.rappelTicks) / total)}%`;
    }
  }
}
