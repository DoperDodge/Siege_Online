// The gadget table drawn (Phase 8 M1, gadgets/DESIGN.md §11): each entry as a greybox of its data's size and its
// kind's colour, standing, on its wall or lying flat; a thrown one along its flight (stepped here by the same code the
// server steps it with). Your own throws and placings are drawn at once from your prediction, until the server's entry
// takes over. Bulletproof Cameras are drawn by BpCameraModels (render/cameraModels.ts). Greybox until the art pass.
// M3 adds what an entry's flags show: smoke clouds (not in a Bulletproof Camera's thermal view), a gas pipe's jet and
// fire, an alarm sounding, an EMP's sparks, and an observation blocker's barrier to the other side's drones and cameras;
// the level's ingredients are entries too. M5: Thermite's charge burning shows sparks on both sides of its surface,
// Fuze's set off shows its tube through it (its grenades are thrown entries). M6: Mute's jammer lights up while it
// works, and its reach shows for a moment once it's placed. M7: Mira's Black Mirror is its frame and its glass, clear from
// her side and black from the other (two one-sided sheets), grey once shattered, gone once ejected. R3: Shunt's live
// surfaces (gadgets/arcs.ts) flicker blue and crackle, on both sides, for everyone to see.
import * as THREE from "three";
import { gadgetShape, SHAPE_MATERIALS, type ShapeMat } from "./gadgetShapes.js";
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
  KIND_SHELL_SHIELD,
  kindId,
  kindOf,
  liveSurfaces,
  raycastLevel,
  wireLength,
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
  black_mirror: 0x134e4a,
  mirror_canister: 0xdc2626,
  dropped_phone: 0x0f172a,
  gu_mine: 0x65a30d,
  shell_shield: 0x475569,
  brownout_pistol: 0x1e3a5f,
  second_wind: 0x0f766e,
  arc_pack: 0x27303a,
  snare_latch: 0x4a3b2f,
  bailiff_post: 0x2f3540,
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
    hacked: new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.22, depthWrite: false }),
    glassClear: new THREE.MeshBasicMaterial({ color: 0x99f6e4, transparent: true, opacity: 0.12, side: THREE.FrontSide, depthWrite: false }),
    glassBlack: new THREE.MeshBasicMaterial({ color: 0x050607, side: THREE.FrontSide }),
    glassShattered: new THREE.MeshBasicMaterial({ color: 0xcbd5e1, side: THREE.DoubleSide }),
    reach: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.12, wireframe: true, depthWrite: false }),
    tube: new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.5, metalness: 0.6 }),
    // Twain's idle frame's barrier (our own design, D-183): olive armour slabs with a lighter rim and corner bolts, a
    // band of the accent low across the front, a green-tinted glass slit.
    armour: new THREE.MeshStandardMaterial({ color: 0x3a4637, roughness: 0.75, metalness: 0.3 }),
    armourFrame: new THREE.MeshStandardMaterial({ color: 0x5f6b5a, roughness: 0.55, metalness: 0.35 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xc8c040, roughness: 0.5, metalness: 0.2 }),
    canopy: new THREE.MeshStandardMaterial({ color: 0x3f6b4a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
  };
  /** A Claymore's lasers (Phase 8 M2): red, once it's armed. */
  private readonly laserMat = new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.7 });
  /** A Snare Latch's wire (R3): thin grey steel across its opening, once it's armed; gone once it's sprung. */
  private readonly wireMat = new THREE.LineBasicMaterial({ color: 0xa8a29e, transparent: true, opacity: 0.5 });
  private readonly ghosts: Ghost[] = [];
  /**
   * Shunt's live surfaces (R3): a sheet over each face of an electrified panel, flickering, and crackle (jagged blue
   * lines, new ones every few frames) across them and round an electrified shield or wire.
   */
  private readonly arcSheetMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly arcLineMat = new THREE.LineBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.9, depthWrite: false });
  private readonly arcSheetGeo = new THREE.PlaneGeometry(1, 1);
  private readonly arcSheets: THREE.Mesh[] = [];
  private readonly arcLines = new THREE.LineSegments(new THREE.BufferGeometry(), this.arcLineMat);
  /** When the crackle was last drawn anew (performance.now), and what was live then. */
  private arcAt = 0;
  private arcKey = "";
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
    this.arcLines.frustumCulled = false;
    this.arcLines.visible = false;
    scene.add(this.arcLines);
  }

  private dataOf(kind: number): GadgetData | undefined {
    return this.sim.data.gadgets.get(kindId(kind) ?? "");
  }

  /** A shared geometry, made once by its key (disposeOwn leaves it). */
  private shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geometry.get(key);
    if (!g) this.geometry.set(key, (g = make()));
    return g;
  }

  /** A shared material, made once by its key. */
  private sharedMat(key: string, colour: number, roughness: number, metalness = 0, emissive = 0): THREE.Material {
    let m = this.materials.get(key);
    if (!m) this.materials.set(key, (m = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness, emissive })));
    return m;
  }

  /** A part of a shaped model: a shared geometry placed (and turned about x, then z). */
  private part(key: string, make: () => THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0): THREE.Mesh {
    const m = new THREE.Mesh(this.shared(key, make), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    return m;
  }

  /**
   * A fire extinguisher on its wall bracket (Phase 10 M6, render/DESIGN.md §9.2): the red can under a dome, its label,
   * the valve with its lever and gauge, the hose down its side, the strap and the bracket behind (the wall's side, +z);
   * within its 18 × 50 × 18 cm box. All of it is "body" (a broken one shrinks).
   */
  private extinguisher(): THREE.Group {
    const red = this.sharedMat("ext:red", 0x8f1712, 0.45, 0.1);
    const black = this.sharedMat("ext:black", 0x1a1b1d, 0.55);
    const chrome = this.sharedMat("ext:chrome", 0xc9ced3, 0.25, 0.9);
    const white = this.sharedMat("ext:white", 0xeeeeea, 0.6);
    const body = new THREE.Group();
    body.name = "body";
    body.add(
      this.part("ext:can", () => new THREE.CylinderGeometry(0.075, 0.075, 0.34, 20), red, 0, -0.08, 0),
      this.part("ext:dome", () => new THREE.SphereGeometry(0.075, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.09, 0),
      this.part("ext:foot", () => new THREE.CylinderGeometry(0.073, 0.07, 0.02, 20), black, 0, -0.24, 0),
      this.part("ext:label", () => new THREE.CylinderGeometry(0.0765, 0.0765, 0.11, 20, 1, true), white, 0, -0.07, 0),
      this.part("ext:strap", () => new THREE.CylinderGeometry(0.078, 0.078, 0.018, 20, 1, true), black, 0, 0.03, 0),
      this.part("ext:neck", () => new THREE.CylinderGeometry(0.02, 0.024, 0.035, 12), chrome, 0, 0.18, 0),
      this.part("ext:valve", () => new THREE.BoxGeometry(0.045, 0.035, 0.05), black, 0, 0.212, 0),
      this.part("ext:lever", () => new THREE.BoxGeometry(0.028, 0.01, 0.11), chrome, 0, 0.238, -0.035, 0.14),
      this.part("ext:grip", () => new THREE.BoxGeometry(0.028, 0.01, 0.1), black, 0, 0.196, -0.04),
      this.part("ext:gauge", () => new THREE.CylinderGeometry(0.015, 0.015, 0.01, 14), white, 0.028, 0.212, -0.012, 0, Math.PI / 2),
      this.part("ext:hoseTop", () => new THREE.CylinderGeometry(0.009, 0.009, 0.07, 8), black, 0.05, 0.2, 0, 0, Math.PI / 2),
      this.part("ext:hose", () => new THREE.CylinderGeometry(0.009, 0.009, 0.3, 8), black, 0.082, 0.05, 0),
      this.part("ext:nozzle", () => new THREE.CylinderGeometry(0.012, 0.016, 0.05, 10), black, 0.082, -0.125, 0),
      this.part("ext:bracket", () => new THREE.BoxGeometry(0.05, 0.16, 0.01), black, 0, 0, 0.084),
    );
    const group = new THREE.Group();
    group.add(body);
    return group;
  }

  /**
   * A gas pipe (Phase 10 M6): the yellow-painted pipe ("body", its unit length stretched floor to ceiling by pipeRun),
   * flanges where it meets the floor and the ceiling and couplings along it (placed by pipeRun), and at the entry's
   * point its valve with a red handwheel.
   */
  private gasPipe(): THREE.Group {
    const paint = this.sharedMat("pipe:paint", 0xd4a020, 0.45, 0.35);
    const iron = this.sharedMat("pipe:iron", 0x3b3e42, 0.6, 0.5);
    const wheel = this.sharedMat("pipe:wheel", 0xb91c1c, 0.4, 0.2);
    const group = new THREE.Group();
    const body = this.part("gas_pipe", () => new THREE.CylinderGeometry(0.05, 0.05, 1, 14), paint, 0, 0, 0);
    body.name = "body";
    group.add(body);
    for (const name of ["flangeTop", "flangeBottom"]) {
      const f = this.part("pipe:flange", () => new THREE.CylinderGeometry(0.085, 0.085, 0.025, 16), iron, 0, 0, 0);
      f.name = name;
      group.add(f);
    }
    for (const name of ["couplingUp", "couplingDown"]) {
      const c = this.part("pipe:coupling", () => new THREE.CylinderGeometry(0.06, 0.06, 0.06, 14), iron, 0, 0, 0);
      c.name = name;
      group.add(c);
    }
    group.add(
      this.part("pipe:valve", () => new THREE.BoxGeometry(0.11, 0.1, 0.11), iron, 0, 0, 0),
      this.part("pipe:stem", () => new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), iron, 0, 0, -0.075, Math.PI / 2),
      this.part("pipe:wheel", () => new THREE.TorusGeometry(0.045, 0.008, 6, 18), wheel, 0, 0, -0.1),
      this.part("pipe:spokeA", () => new THREE.BoxGeometry(0.09, 0.008, 0.008), wheel, 0, 0, -0.1),
      this.part("pipe:spokeB", () => new THREE.BoxGeometry(0.008, 0.09, 0.008), wheel, 0, 0, -0.1),
    );
    return group;
  }

  /** Each kind's shaped parts (gadgetShapes.ts), made once; null for a kind drawn otherwise. */
  private readonly shapes = new Map<string, Map<ShapeMat, THREE.BufferGeometry> | null>();

  /** A gadget's shaped model (Phase 10 M7), all of it "body"; null if it has none. */
  private shaped(id: string, kind: number): THREE.Group | null {
    let parts = this.shapes.get(id);
    if (parts === undefined) {
      const size = sizeOf(this.sim.data, kind);
      parts = size ? gadgetShape(id, size) : null;
      this.shapes.set(id, parts);
      // Shared: disposeOwn leaves them.
      for (const [m, g] of parts ?? []) this.geometry.set(`shape:${id}:${m}`, g);
    }
    if (!parts) return null;
    const body = new THREE.Group();
    body.name = "body";
    for (const [m, g] of parts) {
      const p = SHAPE_MATERIALS[m];
      body.add(new THREE.Mesh(g, this.sharedMat(`shape:${m}`, p.color, p.roughness, p.metalness, p.emissive)));
    }
    const group = new THREE.Group();
    group.add(body);
    return group;
  }

  /** A kind's mesh (shared geometry and material per kind). */
  private model(kind: number): THREE.Object3D {
    const id = kindId(kind) ?? "";
    if (id === "fire_extinguisher") return this.extinguisher();
    if (id === "gas_pipe") return this.gasPipe();
    const shaped = this.shaped(id, kind);
    if (shaped) return shaped;
    const d = this.dataOf(kind);
    const [w, h, depth] = sizeOf(this.sim.data, kind) ?? [0.1, 0.1, 0.1];
    let geo = this.geometry.get(id);
    if (!geo) {
      // Grenades and fire extinguishers are round; a gas pipe lies along its width; everything else is its box.
      const round = (d?.use.kind === "throw" && !d.remote && id !== "proximity_alarm") || id === "fire_extinguisher" || id === "mirror_canister";
      if (round) geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 12);
      // A gas pipe stands upright (Ulo's test): a unit-tall cylinder, set to its floor-to-ceiling run per entry (pipeRun).
      else if (id === "gas_pipe") geo = new THREE.CylinderGeometry(w / 2, w / 2, 1, 10);
      else geo = new THREE.BoxGeometry(w, h, depth);
      this.geometry.set(id, geo);
    }
    let mat = this.materials.get(id);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: COLOURS[id] ?? 0x888888, roughness: 0.7, metalness: 0.2, wireframe: id === "barbed_wire" || id === "metal_detector" });
      this.materials.set(id, mat);
    }
    const group = new THREE.Group();
    if (d?.parts) {
      group.add(this.partsModel(d.parts, d.sizeM[1]));
      if (d.electronic) {
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
        const front = d.parts[0];
        led.position.set(0, front.at[1] + front.sizeM[1] / 2 - d.sizeM[1] / 2 - 0.04, -(front.at[2] + front.sizeM[2] / 2) - 0.005);
        group.add(led);
      }
      return group;
    }
    if (d?.mirror) {
      // A Black Mirror (M7): its frame round the window, through the wall (its glass is drawn by its state).
      const f = d.mirror.frameM;
      const deep = 0.24;
      const frame = new THREE.Group();
      frame.name = "body";
      for (const [bw, bh, x, y] of [[w + 2 * f, f, 0, (h + f) / 2], [w + 2 * f, f, 0, -(h + f) / 2], [f, h, (w + f) / 2, 0], [f, h, -(w + f) / 2, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, deep), mat);
        bar.position.set(x, y, 0);
        frame.add(bar);
      }
      group.add(frame);
      return group;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "body";
    group.add(mesh);
    if (id === "dropped_phone") {
      // A dead defender's phone (M9): its screen lit, face up.
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, depth * 0.85), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      screen.rotation.x = -Math.PI / 2;
      screen.position.y = h / 2 + 0.002;
      group.add(screen);
    }
    if (d?.electronic) {
      // A small red light on its front.
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
      led.position.set(0, h / 4, -depth / 2 - 0.005);
      group.add(led);
    }
    return group;
  }

  /**
   * A gas pipe's run (Ulo's test: "from the ground to the roof"): its unit cylinder stretched from the floor under its
   * entry to the ceiling over it (the level's, within 6 m; else its data's height from the floor).
   */
  private pipeRun(obj: THREE.Object3D, g: Gadget) {
    const k = this.sim.data.gadgetRules.ingredients.gas_pipe;
    const down = raycastLevel(this.sim, g.pos, [0, -1, 0], 6)?.t ?? k.pointM;
    const up = raycastLevel(this.sim, g.pos, [0, 1, 0], 6)?.t ?? k.sizeM[1] - k.pointM;
    const body = obj.getObjectByName("body");
    body?.scale.set(1, down + up, 1);
    body?.position.set(0, (up - down) / 2, 0);
    // Its flanges at the floor and the ceiling, a coupling either side of the valve.
    const at = (name: string, y: number) => obj.getObjectByName(name)?.position.set(0, y, 0);
    at("flangeTop", up - 0.0125);
    at("flangeBottom", -down + 0.0125);
    at("couplingUp", Math.max(0.12, Math.min(up - 0.25, 0.8)));
    at("couplingDown", -Math.max(0.12, Math.min(down - 0.25, 0.8)));
  }

  /** Pose an object as an entry stands: at its centre, facing its way, a charge lying flat on its floor. */
  private pose(obj: THREE.Object3D, pos: Vec3, yaw: number, flags: number) {
    obj.position.set(pos[0], pos[1], pos[2]);
    // Lying flat: its depth is up, its room side (−z, as on a wall) upward.
    obj.rotation.set(flags & GFlag.Flat ? Math.PI / 2 : 0, yaw, 0, "YXZ");
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
          this.disposeOwn(ghost.obj);
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
      // A tripwire's lasers show from the moment it's armed (its `readyAt`, a server tick), and not while it's off (nor a
      // snare's wire once it's sprung).
      for (const l of it.lasers) l.visible = now >= g.readyAt && !(g.flags & (GFlag.Off | GFlag.Active));
      const key = `${g.pos.join(",")},${g.yaw},${g.flags}`;
      const extraKey = `${key},${this.view.thermal},${this.view.team},${this.view.tool}`;
      if (extraKey !== it.extraKey) {
        it.extraKey = extraKey;
        this.setExtra(it, g);
      }
      if (key === it.key) continue;
      it.key = key;
      this.pose(it.obj, g.pos, g.yaw, g.flags);
      const body = it.obj.getObjectByName("body") as THREE.Mesh | undefined;
      if (kindId(g.kind) === "gas_pipe") this.pipeRun(it.obj, g);
      else body?.scale.setScalar(isIngredient(g.kind) && g.flags & GFlag.Broken ? 0.7 : 1);
      // Skopós's idle shell's barrier broken by a blast (M10): gone (its entry stays as the shell's camera).
      it.obj.visible = !(g.kind === KIND_SHELL_SHIELD && g.flags & GFlag.Broken);
      this.setLasers(it, g);
    }
    for (const [id, it] of this.items)
      if (!seen.has(id)) {
        this.scene.remove(it.obj);
        this.disposeOwn(it.obj);
        if (it.extra) {
          this.scene.remove(it.extra);
          this.disposeOwn(it.extra);
        }
        if (it.reach) {
          this.scene.remove(it.reach);
          this.disposeOwn(it.reach);
        }
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
        this.disposeOwn(x.obj);
        this.ghosts.splice(i, 1);
        continue;
      }
      const use = this.dataOf(x.kind)?.use;
      const g = { id: -1 - x.seq, kind: x.kind, owner: me, team: 0, pos: x.pos, yaw: x.yaw, vel: x.vel, flags: x.flags, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: x.seq };
      this.pose(x.obj, x.flags & GFlag.Flying && use?.kind === "throw" ? this.flightAt(g, use, now - x.at) : x.pos, x.yaw, x.flags);
    }
    this.showArcs();
  }

  /**
   * Shunt's live surfaces (R3, gadgets/arcs.ts), as the table and panels are now: a flickering sheet just off each face
   * of every electrified panel; crackle across them and over each electrified shield or wire, drawn anew every 70 ms.
   */
  private showArcs() {
    const live = liveSurfaces(this.sim);
    const t = performance.now();
    const panels = this.sim.level.panels.list;
    let n = 0;
    for (const idx of live.panels.keys()) {
      const f = panels[idx]?.frame;
      if (!f) continue;
      for (const side of [-1, 1]) {
        let m = this.arcSheets[n];
        if (!m) {
          m = new THREE.Mesh(this.arcSheetGeo, this.arcSheetMat);
          m.renderOrder = 2;
          this.scene.add(m);
          this.arcSheets.push(m);
        }
        m.visible = true;
        const off = side * (f.t / 2 + 0.012);
        m.position.set(f.center[0] + f.n[0] * off, f.center[1] + f.n[1] * off, f.center[2] + f.n[2] * off);
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.u), new THREE.Vector3(...f.v), new THREE.Vector3(...f.n)));
        m.scale.set(f.w, f.h, 1);
        n++;
      }
    }
    for (let i = n; i < this.arcSheets.length; i++) this.arcSheets[i].visible = false;
    // A flicker: two beats at once, never quite dark.
    this.arcSheetMat.opacity = 0.06 + 0.07 * Math.abs(Math.sin(t * 0.021) * Math.sin(t * 0.0067 + 1.3));
    // Bailiff's set-down shields with their shock on (R3) crackle across their face too.
    const posts = this.sim.gadgets.list.filter((g) => g.flags & GFlag.Active && !(g.flags & GFlag.Off) && this.dataOf(g.kind)?.setsDownShield);
    const key = `${[...live.panels.keys()].join(",")}|${[...live.gadgets.keys()].join(",")}|${posts.map((g) => g.id).join(",")}`;
    if (key === this.arcKey && t - this.arcAt < 70) return;
    this.arcKey = key;
    this.arcAt = t;
    const pts: number[] = [];
    // A jagged line from a to b, in `k` steps, each step's middle thrown off by up to `j` along `off1` and `off2`.
    const bolt = (a: Vec3, b: Vec3, k: number, j: number, off1: Vec3, off2: Vec3) => {
      let prev = a;
      for (let s = 1; s <= k; s++) {
        const u = s / k;
        const r1 = s === k ? 0 : (Math.random() * 2 - 1) * j;
        const r2 = s === k ? 0 : (Math.random() * 2 - 1) * j;
        const p: Vec3 = [a[0] + (b[0] - a[0]) * u + off1[0] * r1 + off2[0] * r2, a[1] + (b[1] - a[1]) * u + off1[1] * r1 + off2[1] * r2, a[2] + (b[2] - a[2]) * u + off1[2] * r1 + off2[2] * r2];
        pts.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
        prev = p;
      }
    };
    for (const idx of live.panels.keys()) {
      const f = panels[idx]?.frame;
      if (!f) continue;
      const at = (x: number, y: number, side: number): Vec3 => {
        const o = side * (f.t / 2 + 0.016);
        return [f.center[0] + f.u[0] * x + f.v[0] * y + f.n[0] * o, f.center[1] + f.u[1] * x + f.v[1] * y + f.n[1] * o, f.center[2] + f.u[2] * x + f.v[2] * y + f.n[2] * o];
      };
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const x0 = (Math.random() - 0.5) * f.w;
          const y0 = (Math.random() - 0.5) * f.h;
          const x1 = Math.max(-f.w / 2, Math.min(f.w / 2, x0 + (Math.random() - 0.5) * 1.2));
          const y1 = Math.max(-f.h / 2, Math.min(f.h / 2, y0 + (Math.random() - 0.5) * 1.2));
          bolt(at(x0, y0, side), at(x1, y1, side), 6, 0.06, f.u, f.v);
        }
    }
    for (const id of live.gadgets.keys()) {
      const g = this.sim.gadgets.get(id);
      const d = g && this.dataOf(g.kind);
      if (!g || !d) continue;
      const [w, h] = d.sizeM;
      const [fx, fz] = forwardXZ(g.yaw);
      const across: Vec3 = [fz, 0, -fx];
      for (let i = 0; i < 2; i++) {
        const x0 = (Math.random() - 0.5) * w;
        const x1 = (Math.random() - 0.5) * w;
        // An entry's position is its box's middle.
        const a: Vec3 = [g.pos[0] + across[0] * x0, g.pos[1] + (Math.random() - 0.5) * h, g.pos[2] + across[2] * x0];
        const b: Vec3 = [g.pos[0] + across[0] * x1, g.pos[1] + (Math.random() - 0.5) * h, g.pos[2] + across[2] * x1];
        bolt(a, b, 5, 0.05, [0, 1, 0], [fx, 0, fz]);
      }
    }
    for (const g of posts) {
      const d = this.dataOf(g.kind)!;
      const [w, h, dep] = d.sizeM;
      const [fx, fz] = forwardXZ(g.yaw);
      const across: Vec3 = [fz, 0, -fx];
      const front = dep / 2 + 0.01;
      for (let i = 0; i < 4; i++) {
        const at = (x: number, y: number): Vec3 => [g.pos[0] + across[0] * x + fx * front, g.pos[1] + y, g.pos[2] + across[2] * x + fz * front];
        bolt(at((Math.random() - 0.5) * w, (Math.random() - 0.5) * h), at((Math.random() - 0.5) * w, (Math.random() - 0.5) * h), 6, 0.05, [0, 1, 0], across);
      }
    }
    const geo = this.arcLines.geometry;
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geo.computeBoundingSphere();
    this.arcLines.visible = pts.length > 0;
  }

  /**
   * What an entry's flags show besides its box (Phase 8 M3): its smoke (a grenade's cloud, a fire extinguisher's), a
   * gas pipe's jet or the fire under it, an alarm or a metal detector sounding, an EMP's sparks on it, an observation
   * blocker's barrier to the other side's observation tools.
   */
  private setExtra(it: { extra: THREE.Object3D | null }, g: Gadget) {
    if (it.extra) {
      this.scene.remove(it.extra);
      this.disposeOwn(it.extra);
    }
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
    // A Black Mirror's glass (M7): one-way while whole (clear toward its facing, black the other way), grey when shattered.
    const mirror = this.dataOf(g.kind)?.mirror;
    if (mirror && !(g.flags & GFlag.Broken)) {
      const [w, h] = this.dataOf(g.kind)!.sizeM;
      const sheets: [THREE.Material, number][] = g.flags & GFlag.Hit ? [[this.fxMat.glassShattered, g.yaw]] : [[this.fxMat.glassClear, g.yaw + Math.PI], [this.fxMat.glassBlack, g.yaw]];
      for (const [mat, yaw] of sheets) {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        sheet.position.set(g.pos[0], g.pos[1], g.pos[2]);
        sheet.rotation.set(0, yaw, 0);
        group.add(sheet);
      }
    }
    // A defenders' device a Kludge hacked over to the attackers (M8): it glows in their colour.
    if (this.dataOf(g.kind)?.side === "defender" && g.team !== 1 && !(g.flags & GFlag.Flying)) {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.12, Math.max(...this.dataOf(g.kind)!.sizeM) * 0.6), 12, 8), this.fxMat.hacked);
      glow.position.set(g.pos[0], g.pos[1], g.pos[2]);
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
      this.disposeOwn(it.reach);
      it.reach = null;
    }
  }

  /**
   * Free what an object made for itself (its own geometries and materials: an LED, a phone's screen, a barrier's
   * segments, a cloud, a jet), not the kinds' and the effects' shared ones (the review, M12: they piled up).
   */
  /**
   * An entry built of parts (Twain's idle frame's barrier, our own design: D-183), each where gadgets/hits.ts partBoxes
   * has it, in the entry's own frame (forward is −z; `height` its whole height, its position at half that): armour slabs
   * with a lighter rim round their faces and a bolt in each corner, the first (the front) with a band of the accent low
   * across it; glass tinted green in a thin dark frame. Its group is named "body" (a broken one hides it).
   */
  private partsModel(parts: NonNullable<ReturnType<GadgetModels["dataOf"]>>["parts"] & object, height: number): THREE.Group {
    const body = new THREE.Group();
    body.name = "body";
    const m = this.fxMat;
    /** A box `w × h × d` at (x, y, z) in a part's frame. */
    const box = (into: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      into.add(mesh);
    };
    const front = parts.findIndex((q) => !q.glass);
    parts.forEach((p, i) => {
      const part = new THREE.Group();
      part.position.set(p.at[0], p.at[1] - height / 2, -p.at[2]);
      part.rotation.set(p.pitchDeg * DEG, p.yawDeg * DEG, 0, "YXZ");
      const [w, h, d] = p.sizeM;
      const face = -d / 2 - 0.006; // just proud of its outer face (forward is −z)
      if (p.glass) {
        box(part, w, h, d, 0, 0, 0, m.canopy);
        // A thin dark frame round the pane.
        const f = 0.018;
        for (const [bw, bh, x, y] of [[w, f, 0, h / 2], [w, f, 0, -h / 2], [f, h, w / 2, 0], [f, h, -w / 2, 0]] as const) box(part, bw, bh, f, x, y, 0, m.tube);
      } else {
        box(part, w, h, d, 0, 0, 0, m.armour);
        // A lighter rim round its face and a bolt in each corner.
        const f = 0.03;
        for (const [bw, bh, x, y] of [[w, f, 0, h / 2 - f / 2], [w, f, 0, -h / 2 + f / 2], [f, h, w / 2 - f / 2, 0], [f, h, -w / 2 + f / 2, 0]] as const) box(part, bw, bh, 0.012, x, y, face, m.armourFrame);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(part, 0.026, 0.026, 0.018, sx * (w / 2 - 0.05), sy * (h / 2 - 0.05), face - 0.004, m.tube);
        // The front slab: a band of the accent low across it.
        if (i === front) box(part, w - 2 * f, 0.05, 0.014, 0, -h / 2 + 0.16, face - 0.002, m.stripe);
      }
      body.add(part);
    });
    return body;
  }

  private disposeOwn(o: THREE.Object3D) {
    const sharedGeo = new Set<THREE.BufferGeometry>(this.geometry.values());
    const sharedMat = new Set<THREE.Material>([...this.materials.values(), ...Object.values(this.fxMat)]);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry && !sharedGeo.has(m.geometry)) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) if (!sharedMat.has(mat)) mat.dispose();
    });
  }

  /** A tripwire's lasers where the entry stands: along its facing turned by each angle, up to what stops sight. */
  private setLasers(it: { lasers: THREE.Line[] }, g: Gadget) {
    for (const l of it.lasers) {
      this.scene.remove(l);
      l.geometry.dispose();
    }
    it.lasers = [];
    const d = this.dataOf(g.kind);
    const t = d?.tripwire;
    // A snare sprung on a leg has no wire left.
    if (!d || !t || (d.snare && g.flags & GFlag.Active)) return;
    for (const deg of t.anglesDeg) {
      const [fx, fz] = forwardXZ(g.yaw + deg * DEG);
      // A snare's wire runs across its opening to the far jamb (gadgets/snare.ts), the same as the server's.
      const len = d.snare ? wireLength(this.sim, g, d) : (raycastLevel(this.sim, g.pos, [fx, 0, fz], t.lengthM)?.t ?? t.lengthM);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...g.pos), new THREE.Vector3(g.pos[0] + fx * len, g.pos[1], g.pos[2] + fz * len)]);
      const line = new THREE.Line(geo, d.snare ? this.wireMat : this.laserMat);
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
      this.disposeOwn(it.obj);
      if (it.extra) {
        this.scene.remove(it.extra);
        this.disposeOwn(it.extra);
      }
      if (it.reach) {
        this.scene.remove(it.reach);
        this.disposeOwn(it.reach);
      }
      for (const l of it.lasers) {
        this.scene.remove(l);
        l.geometry.dispose();
      }
    }
    this.laserMat.dispose();
    this.wireMat.dispose();
    for (const m of this.arcSheets) this.scene.remove(m);
    this.arcSheets.length = 0;
    this.scene.remove(this.arcLines);
    this.arcLines.geometry.dispose();
    this.arcSheetGeo.dispose();
    this.arcSheetMat.dispose();
    this.arcLineMat.dispose();
    for (const x of this.ghosts) {
      this.scene.remove(x.obj);
      this.disposeOwn(x.obj);
    }
    this.items.clear();
    this.ghosts.length = 0;
    for (const g of this.geometry.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}
