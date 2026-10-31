// The gadget table drawn (Phase 8 M1, gadgets/DESIGN.md §11): each entry as a greybox of its data's size and its
// kind's colour, standing, on its wall or lying flat; a thrown one along its flight (stepped here by the same code the
// server steps it with). Your own throws and placings are drawn at once from your prediction, until the server's entry
// takes over. Bulletproof Cameras are drawn by BpCameraModels (render/cameraModels.ts). Greybox until the art pass.
import * as THREE from "three";
import { Flights, GFlag, isFlying, KIND_BP_CAMERA, kindId, kindOf, type Gadget, type GadgetData, type SimEvent, type Sim, type Vec3 } from "@redmond/shared";

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
};

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
  private readonly items = new Map<number, { obj: THREE.Object3D; key: string }>();
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
    const [w, h, depth] = d?.sizeM ?? [0.1, 0.1, 0.1];
    let geo = this.geometry.get(id);
    if (!geo) {
      // Grenades are round; everything else is its box.
      geo = d?.use.kind === "throw" && !d.remote && id !== "proximity_alarm" ? new THREE.CylinderGeometry(w / 2, w / 2, h, 12) : new THREE.BoxGeometry(w, h, depth);
      this.geometry.set(id, geo);
    }
    let mat = this.materials.get(id);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: COLOURS[id] ?? 0x888888, roughness: 0.7, metalness: 0.2, wireframe: id === "barbed_wire" });
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
        it = { obj: this.model(g.kind), key: "" };
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
      const key = `${g.pos.join(",")},${g.yaw},${g.flags}`;
      if (key === it.key) continue;
      it.key = key;
      this.pose(it.obj, g.pos, g.yaw, g.flags);
    }
    for (const [id, it] of this.items)
      if (!seen.has(id)) {
        this.scene.remove(it.obj);
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
      const g = { id: -1 - x.seq, kind: x.kind, owner: me, team: 0, pos: x.pos, yaw: x.yaw, vel: x.vel, flags: x.flags, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, seq: x.seq };
      this.pose(x.obj, x.flags & GFlag.Flying && use?.kind === "throw" ? this.flightAt(g, use, now - x.at) : x.pos, x.yaw, x.flags);
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
    for (const it of this.items.values()) this.scene.remove(it.obj);
    for (const x of this.ghosts) this.scene.remove(x.obj);
    this.items.clear();
    this.ghosts.length = 0;
    for (const g of this.geometry.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}
