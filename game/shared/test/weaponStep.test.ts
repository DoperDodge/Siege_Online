// The weapon in hand inside the simulation (Phase 3 M3, DECISIONS D-040): fire rate, modes, ammo, reloads,
// swaps and the sprint-to-fire gate, all in whole ticks so prediction is exact.
import { describe, expect, it } from "vitest";
import {
  Btn,
  defaultLoadoutPick,
  hashPawnState,
  isPickable,
  loadedOf,
  loadGameData,
  reserveOf,
  resolveLoadout,
  ReloadKind,
  Sim,
  spawnAmmo,
  Stance,
  WeaponAct,
  WFlag,
  type InputCmd,
  type LoadoutPick,
  type PlayerController,
  type SimEvent,
  type WeaponPick,
} from "../src/index.js";
import { input, settle } from "./helpers.js";

const data = loadGameData();
const wp = (weapon: string, o: Partial<WeaponPick> = {}): WeaponPick => ({ weapon, sight: null, barrel: null, grip: null, underbarrel: null, ...o });

async function armed(operator: string, primary?: WeaponPick, secondary?: WeaponPick) {
  const d = defaultLoadoutPick(data, operator);
  const pick: LoadoutPick = { operator, primary: primary ?? d.primary, secondary: secondary ?? d.secondary, gadgets: d.gadgets };
  const sim = await Sim.create("movement_lab");
  const ctrl = sim.addPlayer("tester", operator, 0, undefined, pick);
  settle(sim, ctrl);
  const pawn = () => sim.pawns.get(ctrl.possessedPawnId)!;
  const events: SimEvent[] = [];
  /** One tick with this input (a real input: seq > 0); returns the shots it fired. */
  const tick = (cmd: Partial<InputCmd> & { yawDeg?: number } = {}) => {
    sim.step(new Map([[ctrl.id, input(cmd)]]));
    events.push(...sim.events);
    return sim.events.filter((e) => e.kind === "shot").length;
  };
  const ticks = (n: number, cmd: Partial<InputCmd> & { yawDeg?: number } = {}) => {
    let shots = 0;
    for (let i = 0; i < n; i++) shots += tick(cmd);
    return shots;
  };
  return { sim, ctrl, pawn, s: () => pawn().state, tick, ticks, events, weapons: () => pawn().loadout!.weapons };
}

/** Ticks (0-based) on which shots fired while holding fire for `n` ticks. */
function shotTicks(w: Awaited<ReturnType<typeof armed>>, n: number, cmd: Partial<InputCmd> = {}): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (w.tick({ buttons: Btn.Fire, ...cmd }) > 0) out.push(i);
  return out;
}

describe("ammo at spawn", () => {
  it("every pickable weapon spawns with its full total: magazine (+1 chambered) and the rest in reserve", () => {
    for (const w of data.weapons.values()) {
      if (!isPickable(data, w.id) || w.class === "shield") continue;
      const op = [...data.operators.values()].find((o) => o.loadout.primaries.includes(w.id) || o.loadout.secondaries.includes(w.id))!;
      const slot = op.loadout.primaries.includes(w.id) ? "primary" : "secondary";
      const d = defaultLoadoutPick(data, op.id);
      const r = resolveLoadout(data, { ...d, [slot]: wp(w.id) }).loadout.weapons[slot === "primary" ? 0 : 1];
      const { loaded, reserve } = spawnAmmo(r);
      expect(loaded + reserve, w.id).toBe(w.ammo.maxAmmo);
      expect(loaded, w.id).toBe(w.ammo.magazine + (w.ammo.plusOne ? 1 : 0));
    }
  });
});

describe("fire rate (integer cadence, at most one shot a tick)", () => {
  for (const [op, slot, weapon, rpm] of [
    ["brava", 0, "para_308", 650],
    ["mute", 1, "smg_11", 1270],
  ] as const) {
    it(`${weapon} at ${rpm} rpm: ⌈N·rpm/3840⌉ shots over N held ticks, ${Math.floor(3840 / rpm)} or ${Math.ceil(3840 / rpm)} ticks apart`, async () => {
      const w = slot === 0 ? await armed(op, wp(weapon)) : await armed(op, undefined, wp(weapon));
      if (slot === 1) {
        w.tick({ buttons: Btn.Swap });
        w.ticks(40);
        expect(w.s().slot).toBe(1);
      }
      const n = 14;
      const at = shotTicks(w, n);
      expect(at.length).toBe(Math.ceil((n * rpm) / 3840));
      expect(at[0]).toBe(0); // the first shot is immediate
      for (let i = 1; i < at.length; i++) expect([Math.floor(3840 / rpm), Math.ceil(3840 / rpm)]).toContain(at[i] - at[i - 1]);
    });
  }

  it("a pump shotgun (87 rpm) clicked every other tick fires once per ~44 ticks; semi needs a fresh press", async () => {
    const w = await armed("sledge", wp("m590a1"));
    // Holding the trigger: one shot.
    expect(shotTicks(w, 60).length).toBe(1);
    w.ticks(60);
    // Mashing: presses every other tick, but the pump cycles at 87 rpm (3840 / 87 = 44.1 ticks).
    const at: number[] = [];
    for (let i = 0; i < 200; i++) if (w.tick({ buttons: i % 2 === 0 ? Btn.Fire : 0 }) > 0) at.push(i);
    expect(at.length).toBe(5);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(44);
  });

  it("fire modes: B cycles them; a burst fires 3 while held and stops when released", async () => {
    const w = await armed("fuze", wp("ak_12")); // auto, burst3, semi
    expect(w.weapons()[0].fire.modes).toEqual(["auto", "burst3", "semi"]);
    w.tick({ buttons: Btn.FireMode });
    expect(w.s().modes & 15).toBe(1);
    expect(shotTicks(w, 40).length).toBe(3); // one burst per press
    w.ticks(20);
    // Released after the first shot: the burst stops.
    expect(w.tick({ buttons: Btn.Fire }) + w.ticks(20)).toBe(1);
    w.tick({ buttons: Btn.FireMode });
    expect(shotTicks(w, 30).length).toBe(1); // semi
    w.tick({ buttons: Btn.FireMode });
    expect(w.s().modes & 15).toBe(0); // back to auto
  });
});

describe("reloads (immersive reload, core_mechanics.md §14)", () => {
  it("tactical gives magazine + 1, empty gives the magazine; refill and end at the data's ticks", async () => {
    const w = await armed("brava", wp("para_308"));
    shotTicks(w, 6); // a few shots: 31 → 30 - …
    const before = loadedOf(w.s());
    expect(before).toBeLessThan(31);
    w.ticks(10);
    w.tick({ buttons: Btn.Reload });
    expect(w.s().wAct).toBe(WeaponAct.Reload);
    expect(w.s().reloadKind).toBe(ReloadKind.Tactical);
    const r = w.weapons()[0].reload;
    if (r.kind !== "magazine") throw new Error("magazine weapon expected");
    w.ticks(r.tacticalTicks + 2);
    expect(w.s().wAct).toBe(WeaponAct.Ready);
    expect(loadedOf(w.s())).toBe(31);
    expect(loadedOf(w.s()) + reserveOf(w.s())).toBe(181 - (31 - before) + 0); // shots spent, nothing lost

    // Empty the magazine, then reload: 30.
    while (loadedOf(w.s()) > 0) w.tick({ buttons: Btn.Fire });
    w.ticks(10);
    w.tick({ buttons: Btn.Reload });
    expect(w.s().reloadKind).toBe(ReloadKind.Empty);
    w.ticks(r.emptyTicks + 2);
    expect(loadedOf(w.s())).toBe(30);
  });

  it("interrupted after the magazine is out: the chambered round stays (closed bolt) or nothing (open-bolt LMG)", async () => {
    for (const [op, weapon, keep] of [
      ["brava", "para_308", 1],
      ["fuze", "6p41", 0],
    ] as const) {
      const w = await armed(op, wp(weapon));
      shotTicks(w, 3);
      w.ticks(10);
      const total = loadedOf(w.s()) + reserveOf(w.s());
      w.tick({ buttons: Btn.Reload });
      const r = w.weapons()[0].reload;
      if (r.kind !== "magazine") throw new Error("magazine weapon expected");
      w.ticks(r.magOutTacticalTicks + 1);
      expect(w.s().wflags & WFlag.MagOut, weapon).toBeTruthy();
      expect(w.s().wflags & WFlag.Refilled, weapon).toBeFalsy();
      // Sprinting cancels it (core_mechanics.md §14).
      w.ticks(20, { forward: 1, buttons: Btn.Sprint });
      expect(w.s().wAct, weapon).toBe(WeaponAct.Ready);
      expect(loadedOf(w.s()), weapon).toBe(keep);
      expect(loadedOf(w.s()) + reserveOf(w.s()), weapon).toBe(total); // the pulled rounds went back to reserve
    }
  });

  it("firing the chambered round during a reload cancels it", async () => {
    const w = await armed("brava", wp("para_308"));
    shotTicks(w, 3);
    w.ticks(10);
    w.tick({ buttons: Btn.Reload });
    const r = w.weapons()[0].reload;
    if (r.kind !== "magazine") throw new Error("magazine weapon expected");
    w.ticks(r.magOutTacticalTicks + 1);
    expect(w.tick({ buttons: Btn.Fire })).toBe(1);
    expect(w.s().wAct).toBe(WeaponAct.Ready);
    expect(loadedOf(w.s())).toBe(0);
    // The empty trigger then starts a reload (placeholder rule).
    w.ticks(10);
    expect(w.tick({ buttons: Btn.Fire })).toBe(0);
    expect(w.events.at(-1)?.kind).toBe("reload");
    expect(w.s().reloadKind).toBe(ReloadKind.Empty);
  });

  it("a tube shotgun loads one shell at a time (from empty, after the overhead), and firing stops it", async () => {
    const w = await armed("sledge", wp("m590a1"));
    const r = w.weapons()[0].reload;
    if (r.kind !== "per_shell") throw new Error("per-shell weapon expected");
    // Two shots, then reload: one shell per perShellTicks.
    shotTicks(w, 1);
    w.ticks(50);
    shotTicks(w, 1);
    w.ticks(50);
    expect(loadedOf(w.s())).toBe(5);
    w.tick({ buttons: Btn.Reload });
    expect(w.s().reloadKind).toBe(ReloadKind.Shell);
    w.ticks(r.perShellTicks);
    expect(loadedOf(w.s())).toBe(6);
    // Fire after one shell: the reload stops, the shell stays.
    w.ticks(5);
    expect(w.tick({ buttons: Btn.Fire })).toBe(1);
    expect(w.s().wAct).toBe(WeaponAct.Ready);
    expect(loadedOf(w.s())).toBe(5);
    // Empty it, reload from empty: the overhead first, then the shells.
    for (let i = 0; i < 400 && loadedOf(w.s()) > 0; i++) w.tick({ buttons: i % 2 === 0 ? Btn.Fire : 0 });
    w.ticks(50);
    w.tick({ buttons: Btn.Reload });
    expect(w.s().reloadKind).toBe(ReloadKind.Empty);
    w.ticks(r.emptyExtraTicks + r.perShellTicks - 1);
    expect(loadedOf(w.s())).toBe(0);
    w.tick();
    expect(loadedOf(w.s())).toBe(1);
    w.ticks(7 * r.perShellTicks);
    expect(loadedOf(w.s())).toBe(7);
    expect(w.s().wAct).toBe(WeaponAct.Ready);
  });

  it("rounds are never created or lost: loaded + reserve + shots fired = total, whatever you press", async () => {
    const w = await armed("pulse"); // UMP45 + 5.7 USG
    const total = [0, 1].map((k) => loadedOf(w.s(), k) + reserveOf(w.s(), k));
    const fired = [0, 0];
    let seed = 5;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    let buttons = 0;
    for (let i = 0; i < 4000; i++) {
      if (i % 8 === 0) {
        const r = rnd();
        buttons = r < 0.5 ? Btn.Fire : r < 0.6 ? Btn.Reload : r < 0.65 ? Btn.Swap : r < 0.7 ? Btn.FireMode : r < 0.8 ? Btn.Sprint : 0;
      }
      w.tick({ buttons, forward: buttons === Btn.Sprint ? 1 : 0 });
      for (const e of w.sim.events) if (e.kind === "shot") fired[e.slot]++;
      for (const k of [0, 1]) expect(loadedOf(w.s(), k) + reserveOf(w.s(), k) + fired[k], `tick ${i}`).toBe(total[k]);
    }
    expect(fired[0] + fired[1]).toBeGreaterThan(30); // most of the script is empty reloads, swaps and held semi triggers
  });
});

describe("swap and the sprint-to-fire gate", () => {
  it("a swap blocks fire while the other weapon comes up (38 ticks), and each weapon keeps its ammo", async () => {
    const w = await armed("brava"); // PARA-308 + USP40
    shotTicks(w, 10);
    const primary = loadedOf(w.s(), 0);
    w.ticks(10);
    w.tick({ buttons: Btn.Swap });
    expect(w.s()).toMatchObject({ slot: 1, wAct: WeaponAct.Equip });
    const at = shotTicks(w, 60, {});
    // Holding fire from the swap on: the USP40 is semi, so only a press counts; press again after it's up.
    expect(at).toEqual([]);
    expect(w.s().wAct).toBe(WeaponAct.Ready);
    expect(w.tick() + w.tick({ buttons: Btn.Fire })).toBe(1);
    expect(loadedOf(w.s(), 1)).toBe(12); // 12 + 1 − 1
    expect(loadedOf(w.s(), 0)).toBe(primary);
    // Exactly 38 ticks: holding the (automatic) PARA's trigger, nothing on the 37th tick after the swap,
    // a shot on the 38th.
    w.tick({ buttons: Btn.Swap });
    w.ticks(36);
    expect(w.tick({ buttons: Btn.Fire })).toBe(0);
    expect(w.tick({ buttons: Btn.Fire })).toBe(1);
  });

  it("the first shot after a sprint comes on the 16th tick (0.25 s), and going prone doesn't shorten it", async () => {
    for (const stance of [Stance.Stand, Stance.Prone]) {
      const w = await armed("sledge");
      w.ticks(64, { forward: 1, buttons: Btn.Sprint });
      expect(w.s().sprinting).toBe(true);
      // Fire held stops the sprint at once; the shot waits out the sprint exit.
      const at = shotTicks(w, 30, { forward: 1, buttons: Btn.Sprint | Btn.Fire, stance });
      expect(at[0], `stance ${stance}`).toBe(15);
    }
  });

  it("a click during the sprint exit fires when it ends, but never on a tick without input", async () => {
    const w = await armed("sledge", wp("m590a1")); // semi: a single click
    w.ticks(64, { forward: 1, buttons: Btn.Sprint });
    expect(w.tick({ buttons: Btn.Fire })).toBe(0);
    expect(w.s().wflags & WFlag.FireQueued).toBeTruthy();
    expect(w.ticks(14)).toBe(0);
    expect(w.tick()).toBe(1); // the 16th tick after the sprint (0.25 s)
    // Again, but the inputs stop: the queued click is dropped, not fired by the server on its own.
    w.ticks(64, { forward: 1, buttons: Btn.Sprint });
    w.tick({ buttons: Btn.Fire });
    let shots = 0;
    for (let i = 0; i < 30; i++) {
      w.sim.step(new Map()); // no input (a stall)
      shots += w.sim.events.filter((e) => e.kind === "shot").length;
    }
    expect(shots).toBe(0);
    expect(w.s().wflags & WFlag.FireQueued).toBeFalsy();
  });

  it("no shots mid-vault, and vaulting cancels a reload", async () => {
    const w = await armed("sledge");
    shotTicks(w, 4);
    w.ticks(10);
    w.sim.teleport(w.ctrl.possessedPawnId, -6, 0, 3.4, 0); // facing the 0.9 m obstacle at z = 2
    w.ticks(16);
    w.tick({ buttons: Btn.Reload });
    expect(w.s().wAct).toBe(WeaponAct.Reload);
    // Vault while holding fire: nothing fires while the body is in the vault, and the reload is gone.
    let vaultTicks = 0;
    for (let i = 0; i < 60; i++) {
      const before = w.s().mode;
      const shots = w.tick({ forward: 1, buttons: Btn.Vault | Btn.Fire });
      if (before === 1 && w.s().mode === 1) {
        vaultTicks++;
        expect(shots, `tick ${i}`).toBe(0);
        expect(w.s().wAct).not.toBe(WeaponAct.Reload);
      }
    }
    expect(vaultTicks).toBeGreaterThan(10);
  });
});

describe("Skopós (each shell its own ammo, weapons/step.ts parkWeapon)", () => {
  it("shells keep separate ammo, and leaving a shell mid-reload cancels its reload", async () => {
    const w = await armed("skopos");
    const ctrl = w.ctrl as PlayerController;
    const [a, b] = ctrl.pawnIds;
    shotTicks(w, 20);
    const aLoaded = w.sim.pawns.get(a)!.state.loaded0;
    expect(aLoaded).toBeLessThan(32);
    w.ticks(10);
    w.tick({ buttons: Btn.Reload });
    const r = w.weapons()[0].reload;
    if (r.kind !== "magazine") throw new Error("magazine weapon expected");
    w.ticks(r.magOutTacticalTicks + 1);
    // Open the other shell's camera: the shell left behind stops reloading, keeping its chambered round.
    w.tick({ buttons: Btn.Ability });
    w.ticks(4);
    expect(ctrl.shellCam).toBe(true);
    expect(w.sim.pawns.get(a)!.state.wAct).toBe(WeaponAct.Ready);
    expect(w.sim.pawns.get(a)!.state.loaded0).toBe(1);
    // Transfer, then fire from the other shell: its own full magazine.
    w.tick({ buttons: Btn.Interact });
    w.ticks(200);
    expect(ctrl.possessedPawnId).toBe(b);
    shotTicks(w, 6);
    expect(w.sim.pawns.get(b)!.state.loaded0).toBeLessThan(32);
    expect(w.sim.pawns.get(a)!.state.loaded0).toBe(1);
    // Nothing fired from the camera.
    expect(w.events.filter((e) => e.kind === "shot" && e.pawnId === a).length).toBe(32 - aLoaded);
  });
});

describe("determinism", () => {
  it("two sims on the same fire / reload / swap script stay bit-identical, whatever their tick counters say", async () => {
    const one = await armed("dokkaebi");
    const two = await armed("dokkaebi");
    two.sim.tick += 1000; // weapon code must never read the tick counter
    let seed = 9;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    let cmd: Partial<InputCmd> & { yawDeg?: number } = {};
    for (let i = 0; i < 1500; i++) {
      if (i % 6 === 0) {
        const r = rnd();
        cmd = {
          forward: r < 0.3 ? 1 : 0,
          strafe: r > 0.8 ? 1 : 0,
          yawDeg: rnd() * 360,
          buttons: (r < 0.5 ? Btn.Fire : 0) | (r > 0.9 ? Btn.Reload : 0) | (r > 0.95 ? Btn.Swap : 0) | (r > 0.6 && r < 0.65 ? Btn.FireMode : 0) | (r < 0.2 ? Btn.Sprint : 0),
          stance: r > 0.85 ? Stance.Crouch : Stance.Stand,
        };
      }
      one.tick(cmd);
      two.tick(cmd);
      expect(hashPawnState(two.s()), `tick ${i}`).toBe(hashPawnState(one.s()));
    }
    expect(one.events.filter((e) => e.kind === "shot").length).toBeGreaterThan(50);
  });
});
