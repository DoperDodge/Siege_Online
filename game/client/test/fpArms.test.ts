// Your own arms in first person (Phase 10 M9, render/DESIGN.md §12), without a GPU: the hands' shapes (each pose a
// hand's size, a left hand the mirror of a right, dressed as the operator), a hand's frame from what it holds, and the
// viewmodel placing them: the right hand on every gun's grip and the left on the gun ahead of it; a reload taking the
// left hand to the magazine, away with it and back (the magazine going with it), on to the bolt's release from empty;
// a shell at a time into a shotgun; the knife in a fist; a gadget in the palm, held up in both hands, or swung; no
// arms when there's nothing to hold. The left hand eases over when its hold changes, so the reload checks draw a
// state until it has come to rest (settle).
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GadgetAct, initialPawnState, isGun, loadGameData, loadPresentationData, PawnMode, ReloadKind, resolveWeapon, WeaponAct, WFlag, type PawnState, type ResolvedWeapon } from "@redmond/shared";
import { operatorLook } from "../src/render/bodyModel.js";
import { FpArms, handFrame, PALM, PALM_SURFACE_Z, type HandPose } from "../src/render/fpArms.js";
import { buildGun } from "../src/render/gunKit.js";
import { Viewmodel } from "../src/render/viewmodel.js";

const data = loadGameData();
const POSES: HandPose[] = ["grip", "fore", "hold", "edge", "flat", "fist"];

beforeAll(() => {
  // The viewmodel draws its muzzle flash on a canvas: a stand-in for one (nothing here looks at it).
  const ctx = { createRadialGradient: () => ({ addColorStop: () => {} }), fillRect: () => {}, fillStyle: "" };
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
});

function state(over: Partial<PawnState> = {}): PawnState {
  return { ...initialPawnState(0, 0, 0, 0, 100), grounded: true, ...over };
}
const weapon = (id: string, grip: "vertical" | null = null): ResolvedWeapon => resolveWeapon(data, { weapon: id, sight: null, barrel: null, grip, underbarrel: null });
/** A state drawn until what's eased (the gun's tilt for a reload, the left hand's change of hold) has come to rest. */
function settle(vm: Viewmodel, ...args: Parameters<Viewmodel["update"]>) {
  for (let i = 0; i < 90; i++) vm.update(...args);
}

/** The viewmodel's meshes by name, and the gun in hand (its own frame in the camera's space). */
function parts(vm: Viewmodel) {
  const byName = new Map<string, THREE.Mesh>();
  let mag: THREE.Object3D | null = null;
  vm.camera.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name) byName.set(o.name, o as THREE.Mesh);
    if (o.name === "magazine" && o.parent?.visible) mag = o;
  });
  const hand = (side: "left" | "right") => {
    for (const p of POSES) {
      const m = byName.get(`hand-${side}-${p}`)!;
      if (m.visible) return { pose: p, frame: m.matrix.clone() };
    }
    return null;
  };
  return { byName, hand, mag: mag as THREE.Object3D | null };
}

describe("the hands and arms (render/fpArms.ts)", () => {
  it("each pose is a hand's size, a left hand the mirror of a right, the whole within the first-person budget", () => {
    const arms = new FpArms(operatorLook("thermite"));
    // PLAN §12.2: a first-person weapon ≤ 25k triangles; the arms that hold it are a part of that. Built: every pose of
    // a hand once (a left hand shares its right's triangles' count); drawn at once: two hands and two arms.
    expect(arms.triangles).toBeGreaterThan(2000);
    expect(arms.triangles).toBeLessThan(16000);
    const count = (name: string) => ((arms.group.getObjectByName(name) as THREE.Mesh).geometry.getIndex()?.count ?? 0) / 3;
    expect(2 * (count("hand-right-grip") + count("forearm-right") + count("upper-arm-right"))).toBeLessThan(6000);
    for (const pose of POSES) {
      const right = arms.group.getObjectByName(`hand-right-${pose}`) as THREE.Mesh;
      const left = arms.group.getObjectByName(`hand-left-${pose}`) as THREE.Mesh;
      right.geometry.computeBoundingBox();
      left.geometry.computeBoundingBox();
      const r = right.geometry.boundingBox!;
      const l = left.geometry.boundingBox!;
      // A hand: 9 cm across its palm and up to twice that with the thumb out along what it holds, wrist to fingertips
      // within 21 cm, nothing far off the palm.
      expect(r.max.x - r.min.x, pose).toBeGreaterThan(0.08);
      expect(r.max.x - r.min.x, pose).toBeLessThan(0.19);
      expect(r.max.x, pose).toBeLessThan(0.05);
      expect(r.min.y, pose).toBeGreaterThan(-0.04);
      expect(r.max.y, pose).toBeLessThan(0.215);
      expect(r.min.z, pose).toBeGreaterThan(-0.13);
      expect(r.max.z, pose).toBeLessThan(0.04);
      // The thumb's on the −x side of a right hand, the +x of a left.
      expect(r.min.x, pose).toBeLessThan(-0.045);
      expect(l.max.x, pose).toBeCloseTo(-r.min.x, 6);
      expect(l.min.x, pose).toBeCloseTo(-r.max.x, 6);
      expect(l.max.y, pose).toBeCloseTo(r.max.y, 6);
      const pos = right.geometry.getAttribute("position");
      const nor = right.geometry.getAttribute("normal");
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
        expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))).toBeCloseTo(1, 4);
      }
    }
    // A closed hand is shorter than an open one; a fist shortest.
    const reach = (pose: HandPose) => (arms.group.getObjectByName(`hand-right-${pose}`) as THREE.Mesh).geometry.boundingBox!.max.y;
    expect(reach("flat")).toBeGreaterThan(reach("hold"));
    expect(reach("hold")).toBeGreaterThan(reach("fist"));
    arms.dispose();
  });

  it("is dressed as the operator: bare forearms under short sleeves, gloves on every hand", () => {
    const looks = loadPresentationData().operatorLooks.looks;
    const colorsOf = (m: THREE.Mesh) => {
      const c = m.geometry.getAttribute("color");
      const seen = new Set<string>();
      for (let i = 0; i < c.count; i++) seen.add(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHexString());
      return seen;
    };
    const hex = (s: string) => new THREE.Color(s).getHexString();
    const arms = new FpArms(looks.lesion);
    expect(looks.lesion.sleeves).toBe("short");
    expect(colorsOf(arms.group.getObjectByName("forearm-left") as THREE.Mesh)).toContain(hex(looks.lesion.skin));
    expect(colorsOf(arms.group.getObjectByName("hand-right-grip") as THREE.Mesh)).toContain(hex(looks.lesion.gloves));
    arms.setLook(looks.mute);
    expect(colorsOf(arms.group.getObjectByName("forearm-left") as THREE.Mesh)).toContain(hex(looks.mute.uniform));
    expect(colorsOf(arms.group.getObjectByName("forearm-left") as THREE.Mesh)).not.toContain(hex(looks.mute.skin));
    arms.dispose();
  });

  it("a hand's frame is square, right-handed, and puts the palm's point where it's told", () => {
    const at = new THREE.Vector3(0.1, -0.2, -0.4);
    const m = handFrame(new THREE.Matrix4(), at, new THREE.Vector3(0, -1, 0.3), new THREE.Vector3(0.1, -0.2, -1));
    const [x, y, z] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    m.extractBasis(x, y, z);
    for (const a of [x, y, z]) expect(a.length()).toBeCloseTo(1, 9);
    expect(Math.abs(x.dot(y)) + Math.abs(y.dot(z)) + Math.abs(x.dot(z))).toBeLessThan(1e-9);
    expect(x.clone().cross(y).distanceTo(z)).toBeLessThan(1e-9);
    // Its x is the axis given; its fingers as near the way asked as square to it allows.
    expect(x.distanceTo(new THREE.Vector3(0, -1, 0.3).normalize())).toBeLessThan(1e-9);
    expect(y.dot(new THREE.Vector3(0.1, -0.2, -1).normalize())).toBeGreaterThan(0.9);
    expect(new THREE.Vector3(PALM.x, PALM.y, PALM.z).applyMatrix4(m).distanceTo(at)).toBeLessThan(1e-9);
  });
});

describe("the hands on what's held (render/viewmodel.ts)", () => {
  /** The gun's frame in the camera's space, and its hold points there. */
  function gunOf(vm: Viewmodel) {
    let group: THREE.Object3D | null = null;
    vm.camera.traverse((o) => {
      if (o.name === "magazine" && o.parent?.visible) group = o.parent;
    });
    const g = group as unknown as THREE.Object3D;
    g.updateMatrix();
    return g;
  }

  it("the right hand is on every gun's grip and the left on the gun ahead of it, from the hip and aimed", () => {
    const vm = new Viewmodel(data);
    let checked = 0;
    for (const w of data.weapons.values()) {
      if (!isGun(w)) continue;
      for (const adsQ of [0, 65535]) {
        const rw = weapon(w.id);
        // (A magnified sight's overlay hides the gun fully aimed: iron sights here.)
        vm.update(0, 1 / 60, rw, state({ adsQ }), 30);
        const p = parts(vm);
        const right = p.hand("right")!;
        const left = p.hand("left")!;
        expect(right, `${w.id}: a right hand`).not.toBeNull();
        expect(left, `${w.id}: a left hand`).not.toBeNull();
        expect(right.pose).toBe("grip");
        const gun = gunOf(vm);
        const local = (frame: THREE.Matrix4, point: { x: number; y: number; z: number }) => new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(frame).applyMatrix4(gun.matrix.clone().invert());
        // What the right hand is closed round is in the gun's frame at its origin's height or under it, behind the muzzle.
        const grip = local(right.frame, PALM);
        expect(Math.abs(grip.x), `${w.id}: the grip in the hand`).toBeLessThan(1e-6);
        expect(grip.y, `${w.id}`).toBeLessThan(0.06);
        // The left: on the gun's line (or wrapped over the right on a pistol), not behind the right hand.
        const held = local(left.frame, PALM);
        expect(Math.abs(held.x), `${w.id}: the left hand on the gun`).toBeLessThan(0.05);
        expect(held.z, `${w.id}: the left hand not behind the right`).toBeLessThan(grip.z + 0.02);
        // Both wrists nearer the eye than what they hold, and below it: the arms come up into the picture.
        for (const h of [right, left]) expect(new THREE.Vector3().setFromMatrixPosition(h.frame).y).toBeLessThan(0.05);
        expect(p.byName.get("forearm-right")!.visible && p.byName.get("forearm-left")!.visible).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(70);
    // A grip fitted under the handguard is held like a grip.
    vm.update(0, 1 / 60, weapon("m4", "vertical"), state(), 30);
    expect(parts(vm).hand("left")!.pose).toBe("grip");
    vm.update(0, 1 / 60, weapon("m4"), state(), 30);
    expect(parts(vm).hand("left")!.pose).toBe("fore");
  });

  it("a reload takes the left hand to the magazine, away with it and back with the next; from empty, on to the bolt", () => {
    const vm = new Viewmodel(data);
    const w = weapon("m4");
    expect(w.reload.kind).toBe("magazine");
    if (w.reload.kind !== "magazine") return;
    const r = w.reload;
    const at = (ticks: number, kind: ReloadKind) => {
      const tac = kind === ReloadKind.Tactical;
      let flags = 0;
      if (ticks >= (tac ? r.magOutTacticalTicks : r.magOutEmptyTicks)) flags |= WFlag.MagOut;
      if (ticks >= (tac ? r.refillTacticalTicks : r.refillEmptyTicks)) flags |= WFlag.Refilled;
      settle(vm, 0, 1 / 60, w, state({ wAct: WeaponAct.Reload, reloadKind: kind, actTicks: ticks, wflags: flags }), 30);
      const p = parts(vm);
      const gun = gunOf(vm);
      const toGun = gun.matrix.clone().invert();
      const left = p.hand("left")!;
      return { pose: left.pose, hand: new THREE.Vector3().setFromMatrixPosition(left.frame), inGun: new THREE.Vector3().setFromMatrixPosition(left.frame).applyMatrix4(toGun), mag: p.mag!.position.clone(), right: p.hand("right")!.pose };
    };
    settle(vm, 0, 1 / 60, w, state(), 30);
    const idle = parts(vm);
    const home = idle.mag!.position.clone();
    const foreInGun = new THREE.Vector3().setFromMatrixPosition(idle.hand("left")!.frame).applyMatrix4(gunOf(vm).matrix.clone().invert());
    // It starts and ends on the handguard, the magazine home; the right hand never leaves the grip.
    const start = at(0, ReloadKind.Tactical);
    expect(start.inGun.distanceTo(foreInGun)).toBeLessThan(1e-6);
    expect(start.mag.distanceTo(home)).toBe(0);
    const end = at(r.tacticalTicks, ReloadKind.Tactical);
    expect(end.inGun.distanceTo(foreInGun)).toBeLessThan(1e-6);
    expect(end.mag.distanceTo(home)).toBe(0);
    expect(end.pose).toBe("fore");
    // Just before the magazine comes out the hand is on it, holding; the magazine still home.
    const onMag = at(r.magOutTacticalTicks - 1, ReloadKind.Tactical);
    expect(onMag.pose).toBe("hold");
    expect(onMag.mag.distanceTo(home)).toBe(0);
    expect(onMag.inGun.distanceTo(foreInGun)).toBeGreaterThan(0.1);
    // Half way between out and in: down out of the picture, the magazine gone with it.
    const mid = at(Math.round((r.magOutTacticalTicks + r.refillTacticalTicks) / 2), ReloadKind.Tactical);
    expect(mid.hand.y).toBeLessThan(-0.45);
    expect(mid.mag.distanceTo(home)).toBeGreaterThan(0.25);
    expect(mid.right).toBe("grip");
    // Just before the next is in: nearly home again.
    const seating = at(r.refillTacticalTicks - 1, ReloadKind.Tactical);
    expect(seating.mag.distanceTo(home)).toBeLessThan(0.06);
    expect(seating.mag.distanceTo(home)).toBeGreaterThan(0);
    // From empty, after the magazine's in, the flat of the hand goes to the receiver's left side over it.
    let slapped = false;
    for (let t = r.refillEmptyTicks; t <= r.emptyTicks; t++) {
      const e = at(t, ReloadKind.Empty);
      if (e.pose === "flat" && e.inGun.x < 0 && e.inGun.y > onMag.inGun.y + 0.04) slapped = true;
    }
    expect(slapped).toBe(true);
    expect(at(r.emptyTicks, ReloadKind.Empty).inGun.distanceTo(foreInGun)).toBeLessThan(1e-6);
  });

  it("a shotgun is fed a shell at a time: up to the port with one, in, down for the next; from empty, one in first", () => {
    const vm = new Viewmodel(data);
    const w = weapon("m590a1");
    expect(w.reload.kind).toBe("per_shell");
    if (w.reload.kind !== "per_shell") return;
    const { perShellTicks: per, emptyExtraTicks: extra } = w.reload;
    expect(extra).toBeGreaterThan(10);
    const model = buildGun({ id: w.id, class: w.class, pick: w.pick });
    const port = model.hold.port!;
    expect(port).not.toBeNull();
    const at = (ticks: number, kind = ReloadKind.Shell) => {
      settle(vm, 0, 1 / 60, w, state({ wAct: WeaponAct.Reload, reloadKind: kind, actTicks: ticks }), 30);
      const p = parts(vm);
      let shell: THREE.Object3D | null = null;
      vm.camera.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !o.name && (o as THREE.Mesh).geometry.type === "CylinderGeometry") shell = o;
      });
      const left = p.hand("left")!;
      // Its fingertips (what the hand's frame for the port puts there) in the gun's frame.
      const tips = new THREE.Vector3(0, 0.1, PALM_SURFACE_Z - 0.006).applyMatrix4(left.frame).applyMatrix4(gunOf(vm).matrix.clone().invert());
      return { hand: new THREE.Vector3().setFromMatrixPosition(left.frame), pose: left.pose, shell: (shell as unknown as THREE.Object3D).visible, tips };
    };
    // A shell's cycle ends as the simulation counts it in: just in, the hand's at the port, empty; then down for the
    // next, out of the picture; back up with it; at the port with it.
    const inNow = at(per);
    expect(inNow.tips.distanceTo(port)).toBeLessThan(0.01);
    expect(inNow.shell).toBe(false);
    const low = at(per + Math.round(per * 0.3));
    expect(low.hand.y).toBeLessThan(-0.4);
    expect(at(per + Math.round(per * 0.6)).shell).toBe(true);
    const fed = at(per + Math.round(per * 0.93));
    expect(fed.pose).toBe("hold");
    expect(fed.shell).toBe(true);
    expect(fed.hand.y).toBeGreaterThan(low.hand.y + 0.2);
    expect(fed.tips.distanceTo(port)).toBeLessThan(0.01);
    expect(at(per + Math.round(per * 0.15)).shell).toBe(false);
    // From empty the first goes into the breech before the simulation's first count: low with it, up to the port.
    const first = at(0, ReloadKind.Empty);
    expect(first.hand.y).toBeLessThan(-0.4);
    expect(first.shell).toBe(true);
    const chambered = at(Math.round(extra * 0.95), ReloadKind.Empty);
    expect(chambered.shell).toBe(true);
    expect(chambered.tips.distanceTo(port)).toBeLessThan(0.01);
    // Then the shells like any reload's, a cycle each.
    expect(at(extra + per + Math.round(per * 0.3), ReloadKind.Empty).hand.y).toBeLessThan(-0.4);
    model.dispose();
    // Every gun fed a shell at a time has its loading port (where else the hand would go: under the receiver).
    let shellFed = 0;
    for (const def of data.weapons.values()) {
      if (!isGun(def) || weapon(def.id).reload.kind !== "per_shell") continue;
      const m = buildGun({ id: def.id, class: def.class, pick: weapon(def.id).pick });
      expect(m.hold.port, def.id).not.toBeNull();
      m.dispose();
      shellFed++;
    }
    expect(shellFed).toBeGreaterThan(4);
  });

  it("a magazine is taken by its left face (the hand round it, not in it); a breech or a cylinder is loaded in place", () => {
    const vm = new Viewmodel(data);
    let checked = 0;
    for (const def of data.weapons.values()) {
      if (!isGun(def)) continue;
      const w = weapon(def.id);
      if (w.reload.kind !== "magazine") continue;
      const r = w.reload;
      const model = buildGun({ id: w.id, class: w.class, pick: w.pick });
      const box = model.hold.magBox;
      const draw = (ticks: number) => {
        let flags = 0;
        if (ticks >= r.magOutTacticalTicks) flags |= WFlag.MagOut;
        if (ticks >= r.refillTacticalTicks) flags |= WFlag.Refilled;
        settle(vm, 0, 1 / 60, w, state({ wAct: WeaponAct.Reload, reloadKind: ReloadKind.Tactical, actTicks: ticks, wflags: flags }), 30);
        const p = parts(vm);
        let shell = false;
        vm.camera.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && !o.name && (o as THREE.Mesh).geometry.type === "CylinderGeometry" && o.visible) shell = true;
        });
        return { p, toGun: gunOf(vm).matrix.clone().invert(), shell };
      };
      settle(vm, 0, 1 / 60, w, state(), 30);
      const home = parts(vm).mag!.position.clone();
      const { p, toGun } = draw(r.magOutTacticalTicks - 1);
      const left = p.hand("left")!;
      expect(left.pose, w.id).toBe("hold");
      if (box) {
        // The palm on the magazine's left face, a little under half way up it; the wrist out to its left.
        const palm = new THREE.Vector3(0, PALM.y, PALM_SURFACE_Z).applyMatrix4(left.frame).applyMatrix4(toGun);
        const wrist = new THREE.Vector3().setFromMatrixPosition(left.frame).applyMatrix4(toGun);
        expect(Math.abs(palm.x - box.min.x), `${w.id}: the palm on the magazine's face`).toBeLessThan(0.002);
        expect(palm.y, w.id).toBeGreaterThan(box.min.y);
        expect(palm.y, w.id).toBeLessThan(box.max.y);
        expect(palm.z, w.id).toBeGreaterThan(box.min.z - 1e-6);
        expect(palm.z, w.id).toBeLessThan(box.max.z + 1e-6);
        expect(wrist.x, `${w.id}: the wrist outside the magazine`).toBeLessThan(box.min.x - 0.01);
        // Out with the hand.
        expect(draw(Math.round((r.magOutTacticalTicks + r.refillTacticalTicks) / 2)).p.mag!.position.distanceTo(home), w.id).toBeGreaterThan(0.2);
      } else {
        // Loaded in place: nothing comes out; the hand comes back with shells.
        const mid = Math.round(r.magOutTacticalTicks + (r.refillTacticalTicks - r.magOutTacticalTicks) * 0.5);
        expect(draw(mid).p.mag!.position.distanceTo(home), w.id).toBe(0);
        const back = draw(Math.round(r.magOutTacticalTicks + (r.refillTacticalTicks - r.magOutTacticalTicks) * 0.8));
        expect(back.shell, `${w.id}: shells in the hand`).toBe(true);
        expect(back.p.mag!.position.distanceTo(home), w.id).toBe(0);
      }
      model.dispose();
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
    // The double and the revolver shotgun are the ones loaded in place.
    for (const id of ["bosg_12_2", "six12_sd"]) {
      const w = weapon(id);
      const model = buildGun({ id: w.id, class: w.class, pick: w.pick });
      expect(model.hold.magBox, id).toBeNull();
      expect(model.hold.port, id).not.toBeNull();
      model.dispose();
    }
  });

  it("a front grip, fitted or built on (MP5K, Vector, SMG-12), has the left hand round it", () => {
    const vm = new Viewmodel(data);
    for (const [id, grip] of [["mp5k", null], ["vector_45_acp", null], ["smg_12", null], ["m4", "vertical"]] as const) {
      const w = weapon(id, grip);
      const model = buildGun({ id: w.id, class: w.class, pick: w.pick });
      expect(model.hold.foreGrip, id).toBe(true);
      settle(vm, 0, 1 / 60, w, state(), 30);
      const left = parts(vm).hand("left")!;
      expect(left.pose, id).toBe("grip");
      const held = new THREE.Vector3(PALM.x, PALM.y, PALM.z).applyMatrix4(left.frame).applyMatrix4(gunOf(vm).matrix.clone().invert());
      expect(held.distanceTo(model.hold.fore!), id).toBeLessThan(1e-6);
      model.dispose();
    }
    // Without one, the SMG-11 is held in both hands on its grip.
    const mac = buildGun({ id: "smg_11", class: "machine_pistol", pick: weapon("smg_11").pick });
    expect(mac.hold.foreGrip).toBe(false);
    mac.dispose();
  });

  it("a hold that changes at once is eased over (a reload cut short); aimed through a reload, the gun stays on the eye's line", () => {
    const vm = new Viewmodel(data);
    const w = weapon("m4");
    if (w.reload.kind !== "magazine") return;
    const r = w.reload;
    const mid = state({ wAct: WeaponAct.Reload, reloadKind: ReloadKind.Tactical, actTicks: Math.round((r.magOutTacticalTicks + r.refillTacticalTicks) / 2), wflags: WFlag.MagOut });
    // (Where the left hand is on the gun: the gun's own tilt eases too.)
    const inGun = () => new THREE.Vector3().setFromMatrixPosition(parts(vm).hand("left")!.frame).applyMatrix4(gunOf(vm).matrix.clone().invert());
    settle(vm, 0, 1 / 60, w, mid, 30);
    const away = inGun();
    expect(Math.abs(gunOf(vm).rotation.z)).toBeGreaterThan(0.3);
    // Cut short (swapped to aiming, say): the next frame the hand is on its way back, not there at once.
    vm.update(0, 1 / 60, w, state(), 30);
    const next = inGun();
    settle(vm, 0, 1 / 60, w, state(), 30);
    const fore = inGun();
    expect(away.distanceTo(fore)).toBeGreaterThan(0.2);
    expect(next.distanceTo(away)).toBeGreaterThan(0.05);
    expect(next.distanceTo(fore)).toBeGreaterThan(0.05);
    // Aimed while reloading: no roll, no tilt (the reticle is drawn on the eye's line).
    settle(vm, 0, 1 / 60, w, { ...mid, adsQ: 65535 }, 30);
    expect(Math.abs(gunOf(vm).rotation.z)).toBeLessThan(1e-4);
    expect(Math.abs(gunOf(vm).rotation.x)).toBeLessThan(1e-4);
  });

  it("the knife is in the right fist; a gadget lies in the right palm, is held up in both hands, or swung in both", () => {
    const vm = new Viewmodel(data);
    const w = weapon("m4");
    vm.update(0, 1 / 60, w, state({ meleeTicks: 12 }), 30);
    let p = parts(vm);
    expect(p.hand("right")!.pose).toBe("fist");
    expect(p.hand("left")!.pose).toBe("fore");
    const gadget = (id: string) => ({ data: data.gadgets.get(id)!, detonator: false });
    vm.update(0, 1 / 60, w, state({ hand: 1 }), 30, gadget("frag"));
    p = parts(vm);
    expect(p.hand("right")!.pose).toBe("hold");
    expect(p.hand("left")).toBeNull();
    // Wound up for a throw, the hand goes back with it.
    const ready = new THREE.Vector3().setFromMatrixPosition(p.hand("right")!.frame);
    vm.update(0, 1 / 60, w, state({ hand: 1, gAct: GadgetAct.Throw, gTicks: 200 }), 30, gadget("frag"));
    expect(new THREE.Vector3().setFromMatrixPosition(parts(vm).hand("right")!.frame).z).toBeGreaterThan(ready.z + 0.05);
    vm.update(0, 1 / 60, w, state({ hand: 3 }), 30, gadget("cardiac_sensor"));
    p = parts(vm);
    expect(p.hand("right")!.pose).toBe("edge");
    expect(p.hand("left")!.pose).toBe("edge");
    // One hand each side of it.
    expect(new THREE.Vector3().setFromMatrixPosition(p.hand("left")!.frame).x).toBeLessThan(new THREE.Vector3().setFromMatrixPosition(p.hand("right")!.frame).x - 0.05);
    vm.update(0, 1 / 60, w, state({ hand: 3 }), 30, gadget("breaching_hammer"));
    p = parts(vm);
    expect(p.hand("right")!.pose).toBe("grip");
    expect(p.hand("left")!.pose).toBe("grip");
  });

  it("a gadget in the palm rests on it: the palm under the lowest of it there, not under its box's corner", () => {
    const vm = new Viewmodel(data);
    const w = weapon("m4");
    const solid = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    let checked = 0;
    for (const g of data.gadgets.values()) {
      if (g.use.kind === "swing" || g.use.kind === "hold") continue;
      for (const detonator of [false, true]) {
        if (detonator && g.use.kind !== "place") continue;
        vm.update(0, 1 / 60, w, state({ hand: 1 }), 30, { data: g, detonator });
        const held = vm.camera.getObjectByName("held")!;
        held.updateMatrix();
        const toItem = held.matrix.clone().invert();
        const right = parts(vm).hand("right")!;
        expect(right.pose).toBe("hold");
        const palm = new THREE.Vector3(0, PALM.y, PALM_SURFACE_Z).applyMatrix4(right.frame).applyMatrix4(toItem);
        // Over the palm (6 cm square), up through it every 5 mm and its own points: the lowest of it there is on the
        // palm (±4 mm).
        const meshes: THREE.Mesh[] = [];
        held.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes.push(new THREE.Mesh((o as THREE.Mesh).geometry, solid));
        });
        let low = Infinity;
        for (let i = -6; i <= 6; i++) {
          for (let k = -6; k <= 6; k++) {
            const hit = new THREE.Raycaster(new THREE.Vector3(palm.x + i * 0.005, -10, palm.z + k * 0.005), new THREE.Vector3(0, 1, 0)).intersectObjects(meshes, false)[0];
            if (hit) low = Math.min(low, hit.point.y);
          }
        }
        for (const m of meshes) {
          const p = m.geometry.getAttribute("position");
          for (let n = 0; n < p.count; n++) if (Math.abs(p.getX(n) - palm.x) <= 0.03 && Math.abs(p.getZ(n) - palm.z) <= 0.03) low = Math.min(low, p.getY(n));
        }
        const what = `${g.id}${detonator ? " (its detonator)" : ""}`;
        expect(Number.isFinite(low), `${what}: something over the palm`).toBe(true);
        expect(Math.abs(low - palm.y), `${what}: ${(low - palm.y).toFixed(4)} m over the palm`).toBeLessThan(0.004);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(15);
  });

  it("no arms with nothing to hold: dead, down, or behind Fuze's raised shield (where only the pistol's hand shows, aimed)", () => {
    const vm = new Viewmodel(data);
    const w = weapon("m4");
    const none = (s: PawnState, behindShield = false, ww: ResolvedWeapon | null = w) => {
      vm.update(0, 1 / 60, ww, s, 30, null, behindShield);
      const p = parts(vm);
      return p.hand("left") === null && p.hand("right") === null && !p.byName.get("forearm-left")!.visible && !p.byName.get("upper-arm-right")!.visible;
    };
    expect(none(state())).toBe(false);
    expect(none(state({ mode: PawnMode.Dead }))).toBe(true);
    expect(none(state({ mode: PawnMode.Downed }))).toBe(true);
    expect(none(state(), false, null)).toBe(true);
    // Behind the shield, not aiming: the pistol and the hands are out of the picture; aimed, the right hand alone.
    const pistol = weapon("pmm");
    expect(none(state(), true, pistol)).toBe(true);
    vm.update(0, 1 / 60, pistol, state({ adsQ: 65535 }), 30, null, true);
    const p = parts(vm);
    expect(p.hand("right")!.pose).toBe("grip");
    expect(p.hand("left")).toBeNull();
  });
});
