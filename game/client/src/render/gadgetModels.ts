// The gadget table drawn (Phase 8 M1, gadgets/DESIGN.md §11): each entry as a greybox of its data's size and its
// kind's colour, standing, on its wall or lying flat; a thrown one along its flight (stepped here by the same code the
// server steps it with). Your own throws and placings are drawn at once from your prediction, until the server's entry
// takes over. Bulletproof Cameras are drawn by BpCameraModels (render/cameraModels.ts). Greybox until the art pass.
// M3 adds what an entry's flags show: smoke clouds (not in a Bulletproof Camera's thermal view), a gas pipe's jet and
// fire, an alarm sounding, an EMP's sparks, and an observation blocker's barrier to the other side's drones and cameras;
// the level's ingredients are entries too. M5: Thermite's charge burning shows sparks on both sides of its surface,
// Fuze's set off shows its tube through it (its grenades are thrown entries). M6: Mute's jammer lights up while it
// works, and its reach shows for a moment once it's placed.
import * as THREE from "three";
import {
  barrierOf,
  behindOf,
  cloudRadius,
  DEG,
  Flights,
  forwardXZ,
  GFlag,
  isFlying,
  isIngredient,
  jetOf,
  KIND_BP_CAMERA,
  kindId,
  kindOf,
  raycastLevel,
  sizeOf,
  TUBE_HALF_M,
  tubeBox,
  tubeTip,
  type Gadget,
  type GadgetData,
  type SimEvent,
  type Sim,
  type Vec3,
} from "@redmond/shared";

type ThrowUse = Extract<GadgetData["use"], { kind: "throw" }>;

/** Each kind's colour (greybox). */
const COLOURS: Record<string, number> = {
  breach_charge: 0x52525b,
  hard_breach_charge: 0x71717a,
  claymore: 0x4d5d3a,
  frag: 0x3f4a1f,
  stun: 0x9ca3af,
  smoke: 0x6b7280,
  impact_emp: 0x2563eb,
  barbed_wire: 0x94a3b8,
  deployable_shield: 0x374151,
  observation_blocker: 0x334155,
  impact_grenade: 0x7f1d1d,
  nitro_cell: 0x111827,
  proximity_alarm: 0x1f2937,
  fire_extinguisher: 0xb91c1c,
  gas_pipe: 0xb45309,
  metal_detector: 0x9ca3af,
  exothermic_charge: 0x7c2d12,
  cluster_charge: 0x3f3f46,
  cluster_grenade: 0x3f4a1f,
  signal_disruptor: 0x1e293b,
};

/**
 * What the page looks through (Phase 8 M3): a Bulletproof Camera's thermal view sees through smoke; an observation
 * blocker's barrier shows (and blocks) to the other side's observation tools, a drone or a camera.
 */
export interface GadgetView {
  thermal: boolean;
  team: number;
  tool: boolean;
}

/** A predicted throw or placing of ours, drawn until the server's entry arrives (or for a second, if it never does). */
interface Ghost {
  seq: number;
  kind: number;
  /** The server tick we reckoned it left at, and its start. */
  at: number;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  flags: number;
  obj: THREE.Object3D;
}

export class GadgetModels {
  private readonly items = new Map<number, { obj: THREE.Object3D; key: string; lasers: THREE.Line[]; extra: THREE.Object3D | null; extraKey: string; born: number; reach: THREE.Object3D | null }>();
  /** What the page looks through now (set each frame before update). */
  view: GadgetView = { thermal: false, team: 0, tool: false };
  private readonly fxMat = {
    smoke: new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.7, depthWrite: false }),
    alarm: new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.25, depthWrite: false }),
    off: new THREE.MeshBasicMaterial({ color: 0x60a5fa }),
    barrier: new THREE.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }),
    sparks: new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    jamOn: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    reach: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.12, wireframe: true, depthWrite: false }),
    tube: new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.5, metalness: 0.6 }),
  };
  /** A Claymore's lasers (Phase 8 M2): red, once it's armed. */
  private readonly laserMat = new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.7 });
  private readonly ghosts: Ghost[] = [];
  /** Our own throws, by entry id: the server tick their flight is drawn from (the ghost's, so it doesn't jump back). */
  private readonly ownStart = new Map<number, number>();
  private readonly flights: Flights;
  private readonly geometry = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sim: Sim,
  ) {
    this.flights = new Flights({ q: sim, rules: sim.data.gadgetRules, gravity: sim.data.movement.gravity });
  }

  private dataOf(kind: number): GadgetData | undefined {
    return this.sim.data.gadgets.get(kindId(kind) ?? "");
  }

  /** A kind's mesh (shared geometry and material per kind). */
  private model(kind: number): THREE.Object3D {
    const id = kindId(kind) ?? "";
    const d = this.dataOf(kind);
    const [w, h, depth] = sizeOf(this.sim.data, kind) ?? [0.1, 0.1, 0.1];
    let geo = this.geometry.get(id);
    if (!geo) {
      // Grenades and fire extinguishers are round; a gas pipe lies along its width; everything else is its box.
      const round = (d?.use.kind === "throw" && !d.remote && id !== "proximity_alarm") || id === "fire_extinguisher";
      if (round) geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 12);
      else if (id === "gas_pipe") geo = new THREE.CylinderGeometry(h / 2, h / 2, w, 10).rotateZ(Math.PI / 2);
      else geo = new THREE.BoxGeometry(w, h, depth);
      this.geometry.set(id, geo);
    }
    let mat = this.materials.get(id);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: COLOURS[id] ?? 0x888888, roughness: 0.7, metalness: 0.2, wireframe: id === "barbed_wire" || id === "metal_detector" });
      this.materials.set(id, mat);
    }
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "body";
    group.add(mesh);
    if (d?.electronic) {
      // A small red light on its front.
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
      led.position.set(0, h / 4, -depth / 2 - 0.005);
      group.add(led);
    }
    return group;
  }

  /** Pose an object as an entry stands: at its centre, facing its way, a charge lying flat on its floor. */
  private pose(obj: THREE.Object3D, pos: Vec3, yaw: number, flags: number) {
    obj.position.set(pos[0], pos[1], pos[2]);
    obj.rotation.set(flags & GFlag.Flat ? -Math.PI / 2 : 0, yaw, 0, "YXZ");
  }

  /** Our own prediction threw or placed something (fresh ticks only): draw it now. `now`: the server tick it is. */
  onLocalEvents(events: readonly SimEvent[], now: number) {
    for (const e of events) {
      if (e.kind !== "throw" && e.kind !== "place") continue;
      const kind = kindOf(e.gadget);
      if (kind < 0 || kind === KIND_BP_CAMERA) continue;
      const obj = this.model(kind);
      this.scene.add(obj);
      const flags = e.kind === "throw" ? GFlag.Flying : (e.onFloor ? GFlag.OnFloor : 0) | (e.flat ? GFlag.Flat : 0);
      this.ghosts.push({ seq: e.seq & 0xffff, kind, at: now, pos: e.pos, vel: e.kind === "throw" ? e.vel : [0, 0, 0], yaw: e.yaw, flags, obj });
    }
  }

  /**
   * Draw the table as of `renderTick` (the server tick others are drawn at), our own throws at `now` (the server tick it
   * is now); `me`: our controller.
   */
  update(renderTick: number, now: number, me: number) {
    const table = this.sim.gadgets;
    const seen = new Set<number>();
    for (const g of table.list) {
      if (g.kind === KIND_BP_CAMERA) continue;
      seen.add(g.id);
      let it = this.items.get(g.id);
      if (!it) {
        it = { obj: this.model(g.kind), key: "", lasers: [], extra: null, extraKey: "", born: performance.now(), reach: null };
        this.scene.add(it.obj);
        this.items.set(g.id, it);
        // Ours, predicted: the ghost hands over (its flight goes on from the same start).
        const k = this.ghosts.findIndex((x) => x.seq === g.seq && x.kind === g.kind && g.owner === me);
        if (k >= 0) {
          const [ghost] = this.ghosts.splice(k, 1);
          this.scene.remove(ghost.obj);
          if (isFlying(g)) this.ownStart.set(g.id, ghost.at);
        }
      }
      if (isFlying(g)) {
        const use = this.dataOf(g.kind)?.use;
        if (use?.kind !== "throw") continue;
        const from = this.ownStart.get(g.id) ?? g.launchTick;
        this.pose(it.obj, this.flightAt(g, use, (g.owner === me ? now : renderTick) - from), g.yaw, g.flags);
        continue;
      }
      this.ownStart.delete(g.id);
      this.showReach(it, g);
      // A tripwire's lasers show from the moment it's armed (its `readyAt`, a server tick), and not while it's off.
      for (const l of it.lasers) l.visible = now >= g.readyAt && !(g.flags & GFlag.Off);
      const key = `${g.pos.join(",")},${g.yaw},${g.flags}`;
      const extraKey = `${key},${this.view.thermal},${this.view.team},${this.view.tool}`;
      if (extraKey !== it.extraKey) {
        it.extraKey = extraKey;
        this.setExtra(it, g);
      }
      if (key === it.key) continue;
      it.key = key;
      this.pose(it.obj, g.pos, g.yaw, g.flags);
      (it.obj.getObjectByName("body") as THREE.Mesh | undefined)?.scale.setScalar(isIngredient(g.kind) && g.flags & GFlag.Broken ? 0.7 : 1);
      this.setLasers(it, g);
    }
    for (const [id, it] of this.items)
      if (!seen.has(id)) {
        this.scene.remove(it.obj);
        if (it.extra) this.scene.remove(it.extra);
        if (it.reach) this.scene.remove(it.reach);
        for (const l of it.lasers) {
          this.scene.remove(l);
          l.geometry.dispose();
        }
        this.items.delete(id);
        this.ownStart.delete(id);
      }
    const ghostIds = new Set(this.ghosts.map((x) => -1 - x.seq));
    this.flights.prune((id) => seen.has(id) || ghostIds.has(id));
    // Ghosts the server never confirmed go after a second.
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const x = this.ghosts[i];
      if (now - x.at > 64) {
        this.scene.remove(x.obj);
        this.ghosts.splice(i, 1);
        continue;
      }
      const use = this.dataOf(x.kind)?.use;
      const g = { id: -1 - x.seq, kind: x.kind, owner: me, team: 0, pos: x.pos, yaw: x.yaw, vel: x.vel, flags: x.flags, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: x.seq };
      this.pose(x.obj, x.flags & GFlag.Flying && use?.kind === "throw" ? this.flightAt(g, use, now - x.at) : x.pos, x.yaw, x.flags);
    }
  }

  /**
   * What an entry's flags show besides its box (Phase 8 M3): its smoke (a grenade's cloud, a fire extinguisher's), a
   * gas pipe's jet or the fire under it, an alarm or a metal detector sounding, an EMP's sparks on it, an observation
   * blocker's barrier to the other side's observation tools.
   */
  private setExtra(it: { extra: THREE.Object3D | null }, g: Gadget) {
    if (it.extra) this.scene.remove(it.extra);
    it.extra = null;
    const data = this.sim.data;
    const group = new THREE.Group();
    const r = cloudRadius(data, g);
    if (r > 0 && !this.view.thermal) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), this.fxMat.smoke);
      cloud.position.set(g.pos[0], g.pos[1] + r * 0.4, g.pos[2]);
      group.add(cloud);
    }
    const id = kindId(g.kind);
    if (id === "gas_pipe" && g.flags & GFlag.Active) {
      const pipe = data.gadgetRules.ingredients.gas_pipe;
      if (g.flags & GFlag.Hit) {
        const floor = raycastLevel(this.sim, g.pos, [0, -1, 0], 6);
        const fire = new THREE.Mesh(new THREE.CylinderGeometry(pipe.fire.radiusM, pipe.fire.radiusM, 0.3, 16), this.fxMat.fire);
        fire.position.set(g.pos[0], g.pos[1] - (floor?.t ?? 1) + 0.15, g.pos[2]);
        group.add(fire);
      } else {
        const jet = jetOf(this.sim, pipe, g);
        const a = new THREE.Vector3(...jet.a);
        const b = new THREE.Vector3(...jet.b);
        const flame = new THREE.Mesh(new THREE.CylinderGeometry(jet.r * 0.4, jet.r, a.distanceTo(b), 10), this.fxMat.fire);
        flame.position.copy(a).lerp(b, 0.5);
        flame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        group.add(flame);
      }
    }
    const alarm = this.dataOf(g.kind)?.alarm;
    if ((alarm || id === "metal_detector") && g.flags & GFlag.Active) {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(alarm ? 0.3 : 0.6, 10, 8), this.fxMat.alarm);
      glow.position.set(...g.pos);
      group.add(glow);
    }
    // A jammer working (M6): its light on top.
    if (this.dataOf(g.kind)?.jammer && !(g.flags & (GFlag.Off | GFlag.Flying))) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this.fxMat.jamOn);
      lamp.position.set(g.pos[0], g.pos[1] + (this.dataOf(g.kind)!.sizeM[1] / 2) + 0.02, g.pos[2]);
      group.add(lamp);
    }
    if (g.flags & GFlag.Off) {
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), this.fxMat.off);
      spark.position.set(g.pos[0], g.pos[1] + 0.1, g.pos[2]);
      group.add(spark);
    }
    // Thermite's charge burning (M5): sparks over its face on its side and on the surface's far side.
    if (id === "exothermic_charge" && g.flags & GFlag.Active) {
      const size = this.dataOf(g.kind)!.sizeM;
      const back = behindOf(g);
      const through = (g.panel >= 0 ? this.sim.level.panels.list[g.panel]?.frame.t : undefined) ?? 0.2;
      for (const k of [-(size[2] / 2 + 0.02), size[2] / 2 + through + 0.02]) {
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(size[0] * 0.8, size[1] * 0.8), this.fxMat.sparks);
        glow.position.set(g.pos[0] + back[0] * k, g.pos[1] + back[1] * k, g.pos[2] + back[2] * k);
        glow.rotation.set(g.flags & GFlag.Flat ? -Math.PI / 2 : 0, g.yaw, 0, "YXZ");
        group.add(glow);
      }
    }
    // Fuze's charge set off (M5): its tube through the surface, out on the far side.
    const tube = tubeBox(data, g);
    const tip = tubeTip(data, g);
    if (tube && tip) {
      const len = 2 * tube.half[g.flags & GFlag.Flat ? 1 : 2];
      const back = behindOf(g);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_HALF_M, TUBE_HALF_M, len, 8), this.fxMat.tube);
      pipe.position.set(tip[0] - (back[0] * len) / 2, tip[1] - (back[1] * len) / 2, tip[2] - (back[2] * len) / 2);
      pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(back[0], back[1], back[2]));
      group.add(pipe);
    }
    const barrier = this.dataOf(g.kind)?.barrier;
    if (barrier && this.view.tool && g.team !== this.view.team && !(g.flags & (GFlag.Off | GFlag.Flying))) {
      const b = barrierOf(this.sim, barrier, g, this.dataOf(g.kind)!.sizeM);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(b.half * 2, b.top - b.floor), this.fxMat.barrier);
      sheet.position.set(b.centre[0], (b.floor + b.top) / 2, b.centre[2]);
      sheet.rotation.y = g.yaw;
      group.add(sheet);
    }
    if (group.children.length === 0) return;
    this.scene.add(group);
    it.extra = group;
  }

  /** A jammer's reach (Phase 8 M6): a sphere for its `showS` after it first shows here. */
  private showReach(it: { born: number; reach: THREE.Object3D | null }, g: Gadget) {
    const j = this.dataOf(g.kind)?.jammer;
    const on = j !== undefined && performance.now() - it.born < j.showS * 1000;
    if (on && !it.reach) {
      it.reach = new THREE.Mesh(new THREE.SphereGeometry(j.radiusM, 24, 16), this.fxMat.reach);
      it.reach.position.set(g.pos[0], g.pos[1], g.pos[2]);
      this.scene.add(it.reach);
    } else if (!on && it.reach) {
      this.scene.remove(it.reach);
      it.reach = null;
    }
  }

  /** A tripwire's lasers where the entry stands: along its facing turned by each angle, up to what stops sight. */
  private setLasers(it: { lasers: THREE.Line[] }, g: Gadget) {
    for (const l of it.lasers) {
      this.scene.remove(l);
      l.geometry.dispose();
    }
    it.lasers = [];
    const t = this.dataOf(g.kind)?.tripwire;
    if (!t) return;
    for (const deg of t.anglesDeg) {
      const [fx, fz] = forwardXZ(g.yaw + deg * DEG);
      const len = raycastLevel(this.sim, g.pos, [fx, 0, fz], t.lengthM)?.t ?? t.lengthM;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...g.pos), new THREE.Vector3(g.pos[0] + fx * len, g.pos[1], g.pos[2] + fz * len)]);
      const line = new THREE.Line(geo, this.laserMat);
      line.visible = false;
      this.scene.add(line);
      it.lasers.push(line);
    }
  }

  /** Where a flight is `after` ticks (fractional) from its start: between the two ticks around it. */
  private flightAt(g: Gadget, use: ThrowUse, after: number): Vec3 {
    const t = Math.max(0, after);
    const f = this.flights.at(g, use, Math.ceil(t) + 1);
    const i = Math.min(f.path.length - 1, Math.floor(t));
    const j = Math.min(f.path.length - 1, i + 1);
    const u = t - Math.floor(t);
    const a = f.path[i];
    const b = f.path[j];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }

  dispose() {
    for (const it of this.items.values()) {
      this.scene.remove(it.obj);
      if (it.extra) this.scene.remove(it.extra);
      if (it.reach) this.scene.remove(it.reach);
      for (const l of it.lasers) {
        this.scene.remove(l);
        l.geometry.dispose();
      }
    }
    this.laserMat.dispose();
    for (const x of this.ghosts) this.scene.remove(x.obj);
    this.items.clear();
    this.ghosts.length = 0;
    for (const g of this.geometry.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}
