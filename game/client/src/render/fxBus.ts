// Effects in the world (Phase 3 M9): muzzle flashes and their light, tracers, bullet marks, and a sound
// hook. Fed by our own fresh predictions (the session never reports replayed ticks, so a correction never
// repeats an effect) and by the server's events, which are drawn when the frame on screen reaches the tick
// they happened at. A suppressor hides the flash and the tracer (weapons_notes.md §4.4). Placeholders.
// Every effect object is made up front and reused, so the pools never grow and their shaders can be
// compiled at load (renderer.compile also prepares hidden objects): a shader first compiled at a shot
// stalls that frame, and with it the shot's input.
import * as THREE from "three";
import { raycastLevel, type GameEvent, type Sim, type SimEvent, type Vec3 } from "@redmond/shared";

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
  private readonly ownTracer = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.35 });
  private readonly otherTracer = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 });

  constructor(
    scene: THREE.Scene,
    private readonly sim: Sim,
    private readonly audio: AudioSink = SILENT,
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

  /** A bullet mark where the pellet ended, if it ended on the level (players don't keep marks). */
  private mark(from: THREE.Vector3, end: Vec3) {
    const to = new THREE.Vector3(...end);
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.1) return;
    dir.divideScalar(len);
    const start = to.clone().addScaledVector(dir, -0.08);
    const hit = raycastLevel(this.sim, [start.x, start.y, start.z], [dir.x, dir.y, dir.z], 0.16);
    if (!hit) return;
    const d = this.decals[this.nextDecal];
    this.nextDecal = (this.nextDecal + 1) % MAX_DECALS;
    const n = new THREE.Vector3(...hit.normal);
    d.position.copy(start).addScaledVector(dir, hit.t).addScaledVector(n, 0.002);
    d.lookAt(d.position.clone().add(n));
    d.visible = true;
  }
}
