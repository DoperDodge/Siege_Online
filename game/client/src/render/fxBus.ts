// Effects in the world (Phase 3 M9): muzzle flashes and their light, tracers, bullet marks, debris from
// broken panels (Phase 4), EMP darts' bursts (Phase 7), and a sound hook. Fed by our own fresh predictions (the session never reports replayed ticks, so a correction never
// repeats an effect) and by the server's events, which are drawn when the frame on screen reaches the tick
// they happened at. A suppressor hides the flash and the tracer (weapons_notes.md §4.4). Placeholders.
// Every effect object is made up front and reused, so the pools never grow and their shaders can be
// compiled at load (renderer.compile also prepares hidden objects): a shader first compiled at a shot
// stalls that frame, and with it the shot's input.
import * as THREE from "three";
import { cellWorld, kindId, L_CORE, L_STEEL, raycastLevel, STEEL_PLATE_M, type GameEvent, type IndexedOp, type PanelChange, type Sim, type SimEvent, type Vec3 } from "@redmond/shared";

/** Where sounds will go (Phase 11 adds audio); a no-op until then. */
export interface AudioSink {
  play(name: "shot" | "suppressedShot" | "dry" | "reload" | "knife" | "hit" | "kill", at?: Vec3): void;
}
export const SILENT: AudioSink = { play() {} };

const MAX_DECALS = 64;
const TRACERS = 32;
const FLASHES = 8;
/** Muzzle-flash light: one, the latest shot's (each light costs every lit pixel, even while off). */
const LIGHTS = 1;
/**
 * Others' shots wait for the frame on screen to reach them. A hidden tab draws no frames while they keep
 * arriving: the queue keeps only the newest, and a shot over a second behind the frame is dropped undrawn.
 */
const MAX_PENDING = 256;
const STALE_TICKS = 64;
/** Chunks of broken panel in the air at once, a few per op, each falling for DEBRIS_MS. */
const DEBRIS = 96;
const DEBRIS_PER_LAYER = 3;
const DEBRIS_MS = 900;

/** EMP darts' bursts (Phase 7): a pale blue ball the burst's size, shown this long; a few at once. */
const EMPS = 4;
const EMP_MS = 250;
/** A gadget's blast (Phase 8): a fireball for a moment, then a puff of smoke (greybox until the art pass). */
const BLASTS = 6;
const FIREBALL_MS = 220;
const PUFF_MS = 1400;

/** Objects reused oldest first, each shown until its time is up. */
class Pool<T extends THREE.Object3D> {
  private next = 0;
  private readonly until: number[];
  constructor(readonly items: readonly T[]) {
    this.until = items.map(() => 0);
    for (const o of items) o.visible = false;
  }
  take(now: number, ms: number): T {
    const i = this.next;
    this.next = (this.next + 1) % this.items.length;
    this.until[i] = now + ms;
    this.items[i].visible = true;
    return this.items[i];
  }
  update(now: number) {
    for (let i = 0; i < this.items.length; i++) if (this.items[i].visible && now >= this.until[i]) this.items[i].visible = false;
  }
  get shown() {
    return this.items.filter((o) => o.visible).length;
  }
}

export class FxBus {
  private readonly pending: { tick: number; e: Extract<GameEvent, { kind: "shotFx" }> }[] = [];
  private readonly decals: THREE.Mesh[];
  private nextDecal = 0;
  private readonly tracers: Pool<THREE.Line>;
  private readonly flashes: Pool<THREE.Mesh>;
  // Lights only ever change intensity: adding or hiding one would recompile every lit material.
  private readonly lights: { light: THREE.PointLight; until: number }[] = [];
  private nextLight = 0;
  private readonly debris: Pool<THREE.Mesh>;
  private readonly emps: Pool<THREE.Mesh>;
  private readonly fireballs: Pool<THREE.Mesh>;
  private readonly puffs: Pool<THREE.Mesh>;
  /** A stun's flash, an extinguisher's burst (Phase 8 M3). */
  private readonly whites: Pool<THREE.Mesh>;
  /** Each chunk's velocity (m/s), by its place in the pool. */
  private readonly debrisVel: THREE.Vector3[];
  private readonly debrisMat = { skin: new THREE.MeshBasicMaterial({ color: 0xd9d4c7 }), wood: new THREE.MeshBasicMaterial({ color: 0x8b6a43 }), steel: new THREE.MeshBasicMaterial({ color: 0x56606b }) };
  private lastFrameAt = 0;
  private readonly ownTracer = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.35 });
  private readonly otherTracer = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 });

  /**
   * `markGroup`: where a bullet mark goes in the scene, by its height and its surface's normal (on a map, the
   * group of the storey it's on, so it's hidden with it); the scene itself without one.
   */
  constructor(
    scene: THREE.Scene,
    private readonly sim: Sim,
    private readonly audio: AudioSink = SILENT,
    private readonly markGroup?: (y: number, normalY: number) => THREE.Object3D,
  ) {
    const decalGeo = new THREE.CircleGeometry(0.035, 10);
    const decalMat = new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    this.decals = Array.from({ length: MAX_DECALS }, () => {
      const d = new THREE.Mesh(decalGeo, decalMat);
      d.visible = false;
      scene.add(d);
      return d;
    });
    this.tracers = new Pool(
      Array.from({ length: TRACERS }, () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
        const line = new THREE.Line(g, this.otherTracer);
        line.frustumCulled = false; // its ends move with every use
        scene.add(line);
        return line;
      }),
    );
    const flashGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    this.flashes = new Pool(
      Array.from({ length: FLASHES }, () => {
        const m = new THREE.Mesh(flashGeo, flashMat);
        scene.add(m);
        return m;
      }),
    );
    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight(0xffc77a, 0, 6, 2);
      scene.add(light);
      this.lights.push({ light, until: 0 });
    }
    const chunk = new THREE.BoxGeometry(0.035, 0.035, 0.02);
    const mats = Object.values(this.debrisMat);
    this.debris = new Pool(
      Array.from({ length: DEBRIS }, (_, i) => {
        const m = new THREE.Mesh(chunk, mats[i % mats.length]); // every material in the scene from the start (warmShaders)
        scene.add(m);
        return m;
      }),
    );
    this.debrisVel = this.debris.items.map(() => new THREE.Vector3());
    const empGeo = new THREE.SphereGeometry(1, 16, 12);
    const empMat = new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.45, depthWrite: false });
    this.emps = new Pool(
      Array.from({ length: EMPS }, () => {
        const m = new THREE.Mesh(empGeo, empMat);
        scene.add(m);
        return m;
      }),
    );
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, depthWrite: false });
    const puffMat = new THREE.MeshBasicMaterial({ color: 0x6b6b6b, transparent: true, opacity: 0.45, depthWrite: false });
    const ball = (mat: THREE.Material) =>
      Array.from({ length: BLASTS }, () => {
        const m = new THREE.Mesh(empGeo, mat);
        scene.add(m);
        return m;
      });
    this.fireballs = new Pool(ball(fireMat));
    this.puffs = new Pool(ball(puffMat));
    this.whites = new Pool(ball(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })));
  }

  /**
   * A gadget (or an ingredient) went off (Phase 8), by what it does: a blast is a fireball as big as its full-damage
   * reach (at least 0.3 m) and a puff of smoke; a stun a white flash; an EMP a pale blue ball its size; a fire
   * extinguisher a white burst; a metal detector destroyed, sparks. Smoke draws nothing here (its cloud is the table's).
   */
  private blast(kind: number, pos: Vec3, now: number) {
    const id = kindId(kind) ?? "";
    const d = this.sim.data.gadgets.get(id);
    const at = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const blast = d?.blast ?? (id === "gas_pipe" ? this.sim.data.gadgetRules.ingredients.gas_pipe.blast : undefined);
    if (blast) {
      const r = Math.max(0.3, Math.min(2.5, blast.damage.fullM));
      const fire = this.fireballs.take(now, FIREBALL_MS);
      fire.position.copy(at);
      fire.scale.setScalar(r);
      const puff = this.puffs.take(now, PUFF_MS);
      puff.position.copy(at);
      puff.scale.setScalar(r * 1.4);
      this.light(at, now);
    } else if (d?.stun || id === "fire_extinguisher") {
      const white = this.whites.take(now, d?.stun ? FIREBALL_MS : PUFF_MS);
      white.position.copy(at);
      white.scale.setScalar(d?.stun ? 0.8 : 1.2);
      if (d?.stun) this.light(at, now);
    } else if (d?.emp || id === "metal_detector") {
      const ball = this.emps.take(now, EMP_MS);
      ball.position.copy(at);
      ball.scale.setScalar(d?.emp?.radiusM ?? 0.3);
    } else return;
    this.audio.play("shot", pos);
  }

  /** Panel ops just applied (from the server): a few chunks from the cells each one knocked out. */
  panels(ops: readonly IndexedOp[], changes: readonly PanelChange[], now: number) {
    ops.forEach(({ panel }, k) => {
      const e = this.sim.level.panels.list[panel];
      if (!e) return;
      changes[k].removed.forEach((cells, layer) => {
        for (let j = 0; j < Math.min(DEBRIS_PER_LAYER, cells.length); j++) {
          const cell = cells[Math.floor((j * cells.length) / DEBRIS_PER_LAYER)];
          const u = cell % e.panel.w;
          const v = (cell - u) / e.panel.w;
          const side = layer === L_STEEL ? (e.panel.steelSides >> e.panel.sectionOf(u)) & 1 : 0;
          const m = this.debris.take(now, DEBRIS_MS);
          m.material = layer === L_STEEL ? this.debrisMat.steel : layer === L_CORE && !e.panel.coreMetal ? this.debrisMat.wood : this.debrisMat.skin;
          m.position.set(...cellWorld(e.panel, e.frame, layer, u, v, side));
          // Out of either face and a little up, spread by the cell's place (no randomness needed).
          const h = (Math.imul(cell + 1, 0x9e3779b1) >>> 0) / 4294967296;
          const out = (h < 0.5 ? -1 : 1) * (0.6 + h);
          const n = e.frame.n;
          this.debrisVel[this.debris.items.indexOf(m)].set(n[0] * out + (h - 0.5), 0.8 + h, n[2] * out + (0.5 - h) * 0.6);
        }
      });
    });
  }

  /** Our own predicted weapon events, the tick they happen (fresh predictions only). */
  own(events: readonly SimEvent[], ownPawns: readonly number[], muzzle: () => THREE.Vector3, now: number, suppressed: (slot: number) => boolean) {
    for (const e of events) {
      if (!("pawnId" in e) || !ownPawns.includes(e.pawnId)) continue;
      if (e.kind === "shot") {
        const quiet = suppressed(e.slot);
        this.audio.play(quiet ? "suppressedShot" : "shot", e.origin);
        if (!quiet) this.light(muzzle(), now);
      } else if (e.kind === "dry") this.audio.play("dry");
      else if (e.kind === "reload") this.audio.play("reload");
      else if (e.kind === "meleeImpact") this.audio.play("knife", e.origin);
    }
  }

  /** The server's events: shots are queued until the frame on screen reaches them. */
  server(tick: number, events: readonly GameEvent[]) {
    for (const e of events) {
      if (e.kind === "shotFx") {
        this.pending.push({ tick, e });
        if (this.pending.length > MAX_PENDING) this.pending.shift();
      } else if (e.kind === "hitConfirm") this.audio.play(e.killed ? "kill" : "hit");
      else if (e.kind === "emp") {
        const ball = this.emps.take(performance.now(), EMP_MS);
        ball.position.set(e.pos[0], e.pos[1], e.pos[2]);
        ball.scale.setScalar(this.sim.data.intel.bulletproofCamera.dartRadiusM);
      } else if (e.kind === "blast") this.blast(e.gadget, e.pos, performance.now());
    }
  }

  /**
   * Once per frame. `renderTick` is the server tick drawn for others; `ownPawns` our bodies (their shots
   * happened in the present); `muzzleOf` where a remote body's gun is as drawn now, `ownMuzzle` ours.
   */
  update(now: number, renderTick: number, ownPawns: readonly number[], ownMuzzle: () => THREE.Vector3, muzzleOf: (pawnId: number) => THREE.Vector3 | null) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const { tick, e } = this.pending[i];
      const own = ownPawns.includes(e.pawnId);
      if (!own && tick > renderTick + 0.5 && tick - renderTick < 64) continue; // not on screen yet
      this.pending.splice(i, 1);
      if (renderTick - tick > STALE_TICKS) continue;
      const from = own ? ownMuzzle() : muzzleOf(e.pawnId);
      if (!from) continue;
      for (const end of e.ends) this.mark(from, end);
      if (e.suppressed && !own) continue;
      for (const end of e.ends) this.tracer(from, end, own, now);
      if (!own) {
        this.flashes.take(now, 50).position.copy(from);
        this.light(from, now);
        this.audio.play("shot", [from.x, from.y, from.z]);
      }
    }
    this.tracers.update(now);
    this.flashes.update(now);
    this.debris.update(now);
    this.emps.update(now);
    this.fireballs.update(now);
    this.puffs.update(now);
    this.whites.update(now);
    const dt = Math.min(0.05, Math.max(0, now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    this.debris.items.forEach((m, i) => {
      if (!m.visible) return;
      const vel = this.debrisVel[i];
      vel.y -= 9.81 * dt;
      m.position.addScaledVector(vel, dt);
      m.rotation.x += 7 * dt;
      m.rotation.z += 5 * dt;
    });
    for (const l of this.lights) l.light.intensity = now < l.until ? 6 : 0;
  }

  /** How many of each pooled thing exist, and how many are showing (tests: pools never grow). */
  get counts() {
    return {
      decals: this.decals.length,
      decalsShown: this.decals.filter((d) => d.visible).length,
      tracers: this.tracers.items.length,
      tracersShown: this.tracers.shown,
      flashes: this.flashes.items.length,
      flashesShown: this.flashes.shown,
      lights: this.lights.length,
      lightsOn: this.lights.filter((l) => l.light.intensity > 0).length,
      debris: this.debris.items.length,
      debrisShown: this.debris.shown,
      pending: this.pending.length,
    };
  }

  private light(at: THREE.Vector3, now: number) {
    const l = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % this.lights.length;
    l.light.position.copy(at);
    l.until = now + 50;
  }

  private tracer(from: THREE.Vector3, end: Vec3, own: boolean, now: number) {
    const line = this.tracers.take(now, own ? 60 : 90);
    line.material = own ? this.ownTracer : this.otherTracer;
    const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, end[0], end[1], end[2]);
    pos.needsUpdate = true;
  }

  /**
   * A bullet mark where the pellet ended, if it ended on the level (players don't keep marks). A panel shows
   * its real hole instead, except steel, which keeps marks.
   */
  private mark(from: THREE.Vector3, end: Vec3) {
    const to = new THREE.Vector3(...end);
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.1) return;
    dir.divideScalar(len);
    const start = to.clone().addScaledVector(dir, -0.08);
    const hit = raycastLevel(this.sim, [start.x, start.y, start.z], [dir.x, dir.y, dir.z], 0.16);
    if (!hit || (hit.panel && hit.panel.crossing.layer !== L_STEEL)) return;
    const d = this.decals[this.nextDecal];
    this.nextDecal = (this.nextDecal + 1) % MAX_DECALS;
    const n = new THREE.Vector3(...hit.normal);
    // Steel is drawn as a plate proud of the face (render/panelView.ts): a mark from the plate's side sits on it.
    let lift = 0.002;
    const c = hit.panel?.crossing;
    if (c && c.axis === 2) {
      const fn = hit.panel!.entry.frame.n;
      if ((n.x * fn[0] + n.y * fn[1] + n.z * fn[2]) * (c.side ? 1 : -1) > 0) lift += STEEL_PLATE_M;
    }
    d.position.copy(start).addScaledVector(dir, hit.t).addScaledVector(n, lift);
    const group = this.markGroup?.(d.position.y, n.y);
    if (group && d.parent !== group) group.add(d); // the groups sit at the origin: the position holds
    d.lookAt(d.position.clone().add(n));
    d.visible = true;
  }
}
