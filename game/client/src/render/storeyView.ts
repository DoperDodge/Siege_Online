// The storey views on a map (tools/mapgen/DESIGN.md E9 part 1, amendment 15): the storey you're on (by your
// feet, as the boxes are binned), the storeys above it hidden or shown, a top-down plan of your storey, the
// greybox or a neutral palette, and the light of the storey you're on. A level without storeys (the labs)
// gets none of this. Everything here shows or hides what the scene already holds and recolours its
// materials: nothing is rebuilt, and a frame allocates nothing.
import * as THREE from "three";
import { clamp, type BuiltLevel } from "@redmond/shared";
import { DAYLIGHT, STOREY_SLACK_M, storeyOf, SURFACE_COLORS, TAG, type LabScene } from "./labScene.js";
import type { PanelView } from "./panelView.js";

/** The greybox palette (surface classes) or the neutral one. */
export type Palette = "greybox" | "neutral";

/** The neutral palette's one colour, a light grey, for every surface. */
export const NEUTRAL_GREY = 0xc6cacf;

/**
 * A surface's colour in a palette. Greybox: PLAN §9.1's classes (soft yellow, hard grey, reinforceable blue,
 * hatch green), soft floors as yellow as soft walls. Neutral: the one light grey.
 */
export function paletteColor(palette: Palette, surface: string): number {
  if (palette === "neutral") return NEUTRAL_GREY;
  if (surface === "SOFT_FLOOR") return SURFACE_COLORS.SOFT_WALL;
  return SURFACE_COLORS[surface as keyof typeof SURFACE_COLORS] ?? NEUTRAL_GREY;
}

/** A storey's light: the hemisphere light's sky and ground colours and intensity, an even fill, and the sun. */
export interface StoreyLight {
  sky: number;
  ground: number;
  hemi: number;
  ambient: number;
  sun: number;
}

/** Above ground: the daylight every level has. */
export const ABOVE_GROUND: StoreyLight = { ...DAYLIGHT, ambient: 0 };
/**
 * Below ground (PLAN §9.2, the basement darker): a dim, cool fill and a weak sun, so the basement reads darker
 * with shadows or without (?lowgfx draws none, and the sun would light it as brightly as the yard). A greybox
 * stand-in until Phase 10 lights the map.
 */
export const BELOW_GROUND: StoreyLight = { sky: 0x8e9cb0, ground: 0x25272b, hemi: 0.5, ambient: 0.12, sun: 0.5 };

/** The light of a storey: below ground (its floor under 0) darker. */
export function storeyLight(storey: { floorY: number }): StoreyLight {
  return storey.floorY < 0 ? BELOW_GROUND : ABOVE_GROUND;
}

/** The light follows you to another storey quickly: 63 % of the way in this long (an exponential blend). */
const LIGHT_BLEND_S = 0.25;
/** The plan view's half height at first (metres: Oregon's building fits), and the closest the wheel zooms. */
const PLAN_HALF_M = 20;
const PLAN_MIN_HALF_M = 3;
/**
 * Pixels on screen in the plan view: a callout's height and the arrow's length. Other labels show only from
 * TAG_MIN_PX tall (their text is 30/48 of that, about 9 px): zoomed out they would be specks.
 */
const CALLOUT_PX = 22;
const ARROW_PX = 26;
const TAG_MIN_PX = 14;
/** The plan camera stands this far over the level's top: nothing above it, no label near it, no fog below it. */
const PLAN_OVER_M = 10;

export class StoreyView {
  /** The storey you're on, by its place in the level's storeys (storeyOf your feet). */
  storey: number;
  /** The storeys above yours are hidden (H). */
  hideAbove = false;
  /** The plan view (M): your storey from above, the storeys over it hidden while it's on. */
  plan = false;
  palette: Palette = "greybox";
  /** Half the plan view's height, metres (the wheel zooms it). */
  planHalfM = PLAN_HALF_M;
  /** The plan view's camera: straight down, north (−Z) up the screen and east (+X) to the right. */
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly storeys: readonly { id: string; floorY: number }[];
  /** Each panel's storey, by its bottom. */
  private readonly panelStorey: number[];
  /** An even fill (a storey below ground gets a little). */
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0);
  /** You in the plan view: an arrow at your feet, the way you face. */
  private readonly arrow: THREE.Mesh;
  /** Each callout's size in the world (x, y): the plan view sizes them for the screen and gives them back. */
  private readonly calloutSize: Float64Array;
  /** The light being blended to, and whether the lights are there. */
  private readonly target = { sky: new THREE.Color(), ground: new THREE.Color(), hemi: 0, ambient: 0, sun: 0 };
  private settled = true;
  /** A storey or panel was shown or hidden since the last frame: the shadow map must be redrawn. */
  private redraw = false;
  /** Labels other than callouts show in the plan view only when it's zoomed in enough to read them. */
  private tagsShown = true;
  private aspect = 1;
  private heightPx = 1;
  /** Where the plan camera stands, and the farthest out the wheel zooms. */
  private readonly top: number;
  private readonly maxHalfM: number;

  /** `feetY`: where your feet are now (the storey the views start on). */
  constructor(
    private readonly lab: LabScene,
    private readonly panels: PanelView,
    level: BuiltLevel,
    feetY: number,
  ) {
    this.storeys = level.def.storeys;
    this.panelStorey = level.panels.list.map((e) => storeyOf(this.storeys, e.min[1]));
    this.storey = storeyOf(this.storeys, feetY);
    lab.scene.add(this.ambient);
    const box = lab.box;
    this.top = box.max.y + PLAN_OVER_M;
    this.camera.far = this.top - box.min.y + 1;
    this.camera.rotation.set(-Math.PI / 2, 0, 0);
    this.camera.position.set(0, this.top, 0);
    this.maxHalfM = Math.max(PLAN_HALF_M, 0.6 * Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
    this.arrow = new THREE.Mesh(dart(), new THREE.MeshBasicMaterial({ color: 0xf2a33a, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true }));
    this.arrow.name = "plan arrow";
    this.arrow.renderOrder = 20;
    this.arrow.visible = false;
    lab.scene.add(this.arrow);
    this.calloutSize = new Float64Array(lab.callouts.flatMap((c) => [c.scale.x, c.scale.y]));
    this.fit();
    this.apply();
    this.redraw = false; // the page draws its first shadow map anyway
    this.setPalette("greybox");
    // Start in the light of the storey you're on, not blending into it.
    this.aimLight();
    this.blend(Infinity);
  }

  /**
   * Each frame, from the body you look through: its feet (x, y, z), the way you face, and the seconds since the
   * last frame. Moves the views to the storey you're on, the plan camera over you, and the light toward your
   * storey's. True when a storey or panel was shown or hidden since the last frame (here or by a switch): the
   * shadow map must be redrawn.
   */
  follow(x: number, y: number, z: number, yaw: number, dt: number): boolean {
    const s = storeyOf(this.storeys, y);
    if (s !== this.storey) {
      this.storey = s;
      this.apply();
      this.aimLight();
    }
    if (this.plan) {
      this.camera.position.set(x, this.top, z);
      this.arrow.position.set(x, y, z);
      this.arrow.rotation.y = yaw;
    }
    if (!this.settled) this.blend(dt);
    const redraw = this.redraw;
    this.redraw = false;
    return redraw;
  }

  setHideAbove(on: boolean): void {
    this.hideAbove = on;
    this.apply();
  }

  setPlan(on: boolean): void {
    this.plan = on;
    this.arrow.visible = on;
    // Over everything in the plan view (only your storey's are shown); behind walls again in the world.
    for (const c of this.lab.callouts) c.material.depthTest = !on;
    this.fit();
    this.apply();
  }

  /** Recolour the static boxes and the panels' skins: the same materials, a new colour each. */
  setPalette(palette: Palette): void {
    this.palette = palette;
    for (const [key, m] of this.lab.materials) if (key !== "floor") m.color.setHex(paletteColor(palette, key));
    this.panels.setSkinColors((surface) => paletteColor(palette, surface));
  }

  /** Zoom the plan view by the wheel's turn in pixels (down zooms out): a notch of 100 px is about a fifth. */
  zoom(deltaPx: number): void {
    this.planHalfM = clamp(this.planHalfM * Math.exp(deltaPx * 0.002), PLAN_MIN_HALF_M, this.maxHalfM);
    this.fit();
  }

  /** The view's size in pixels (at the start and on every resize). */
  setViewport(width: number, height: number): void {
    this.heightPx = Math.max(1, height);
    this.aspect = width / this.heightPx;
    this.fit();
  }

  /** Whether a body with its feet at `feetY` is drawn: not while its storey is hidden over yours. */
  draws(feetY: number): boolean {
    return storeyOf(this.storeys, feetY) <= this.topShown();
  }

  /**
   * The storey group a mark on the level at height `y` goes in, so it's hidden with what it's on (`normalY`:
   * the surface's normal, up or down for a floor or a ceiling). A floor's top and a slab's underside are the
   * slab's storey, as boxes are binned; a wall's face is the storey whose floor is under it, so a mark just
   * under a ceiling stays on its wall.
   */
  markGroup(y: number, normalY: number): THREE.Group {
    return this.lab.storeys[storeyOf(this.storeys, Math.abs(normalY) >= 0.5 ? y : y - STOREY_SLACK_M)];
  }

  /** How bright your storey's light is now against daylight (1 above ground): for what has lights of its own, the gun in hand. */
  light(): number {
    return (this.lab.hemi.intensity + this.lab.sun.intensity + this.ambient.intensity) / (DAYLIGHT.hemi + DAYLIGHT.sun);
  }

  /** The storeys drawn now, by id (tests). */
  shown(): string[] {
    return this.storeys.filter((_, i) => this.lab.storeys[i].visible).map((s) => s.id);
  }

  /** The panels drawn now, and how many each storey has by id (tests). */
  panelCounts(): { shown: number; byStorey: Record<string, number> } {
    const byStorey: Record<string, number> = {};
    let shown = 0;
    this.panelStorey.forEach((s, i) => {
      byStorey[this.storeys[s].id] = (byStorey[this.storeys[s].id] ?? 0) + 1;
      if (this.panels.isVisible(i)) shown++;
    });
    return { shown, byStorey };
  }

  /**
   * Show what the switches and your storey ask for: the storeys and panels up to yours (all of them unless
   * hide-above or the plan view is on), and only your storey's labels and callouts.
   */
  private apply(): void {
    const top = this.topShown();
    const groups = this.lab.storeys;
    for (let i = 0; i < groups.length; i++) {
      const visible = i <= top;
      if (groups[i].visible === visible) continue;
      groups[i].visible = visible;
      this.redraw = true;
    }
    for (let i = 0; i < this.panelStorey.length; i++) if (this.panels.setVisible(i, this.panelStorey[i] <= top)) this.redraw = true;
    const labels = this.lab.labelGroups;
    const callouts = this.lab.calloutGroups;
    for (let i = 0; i < labels.length; i++) {
      labels[i].visible = i === this.storey && this.tagsShown;
      callouts[i].visible = i === this.storey;
    }
  }

  /** The highest storey drawn: yours while hide-above or the plan view is on, else the top one. */
  private topShown(): number {
    return this.hideAbove || this.plan ? this.storey : Infinity;
  }

  /**
   * The plan camera's frustum for the zoom and the view's shape, and the plan's marks sized for the screen:
   * callouts and the arrow a fixed number of pixels, other labels only once they're big enough to read.
   */
  private fit(): void {
    const half = this.planHalfM;
    const cam = this.camera;
    cam.left = -half * this.aspect;
    cam.right = half * this.aspect;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
    const perPx = (2 * half) / this.heightPx; // metres a pixel
    const callouts = this.lab.callouts;
    for (let i = 0; i < callouts.length; i++) {
      const w = this.calloutSize[2 * i];
      const h = this.calloutSize[2 * i + 1];
      const k = this.plan ? (CALLOUT_PX * perPx) / h : 1;
      callouts[i].scale.set(w * k, h * k, 1);
    }
    this.arrow.scale.setScalar(ARROW_PX * perPx);
    const tags = !this.plan || TAG.heightM / perPx >= TAG_MIN_PX;
    if (tags !== this.tagsShown) {
      this.tagsShown = tags;
      this.apply();
    }
  }

  /** Start blending the lights toward those of the storey you're on. */
  private aimLight(): void {
    const l = storeyLight(this.storeys[this.storey]);
    const t = this.target;
    t.sky.setHex(l.sky);
    t.ground.setHex(l.ground);
    t.hemi = l.hemi;
    t.ambient = l.ambient;
    t.sun = l.sun;
    this.settled = false;
  }

  /** Move the lights `dt` seconds' worth toward the target, and onto it once what's left is too small to see. */
  private blend(dt: number): void {
    const { hemi, sun } = this.lab;
    const t = this.target;
    const k = 1 - Math.exp(-dt / LIGHT_BLEND_S);
    hemi.color.lerp(t.sky, k);
    hemi.groundColor.lerp(t.ground, k);
    hemi.intensity += (t.hemi - hemi.intensity) * k;
    this.ambient.intensity += (t.ambient - this.ambient.intensity) * k;
    sun.intensity += (t.sun - sun.intensity) * k;
    const off =
      Math.abs(t.hemi - hemi.intensity) + Math.abs(t.ambient - this.ambient.intensity) + Math.abs(t.sun - sun.intensity) + apart(hemi.color, t.sky) + apart(hemi.groundColor, t.ground);
    if (off > 0.01) return;
    hemi.color.copy(t.sky);
    hemi.groundColor.copy(t.ground);
    hemi.intensity = t.hemi;
    this.ambient.intensity = t.ambient;
    sun.intensity = t.sun;
    this.settled = true;
  }
}

/** How far apart two colours are (the sum over their channels). */
function apart(a: THREE.Color, b: THREE.Color): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

/** A flat dart along −Z (the way yaw 0 faces), a unit long, centred on your feet. */
function dart(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Two triangles: the tip, the left wing and the notch; the tip, the notch and the right wing.
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, -0.55, -0.38, 0, 0.45, 0, 0, 0.2, 0, 0, -0.55, 0, 0, 0.2, 0.38, 0, 0.45]), 3));
  return g;
}
