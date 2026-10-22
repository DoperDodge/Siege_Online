// A map's markers (tools/mapgen/DESIGN.md E9 part 2): what the level's metadata places, drawn where it is, so it
// can be checked against the game. Always shown: the bombs (a red case on the floor, named "Bomb 1A"), the default
// cameras (a dark box on the wall and a see-through cone the way it looks, named by id), the extinguishers (red)
// and gas pipes (yellow), and the spawns (a disc and a dart the way each faces: attackers orange, defenders blue,
// the lab's spawn white; each group named once). The zones view (O) adds the rappel faces (orange sheets just
// outside the walls), the spawn peeks (green) and the run-outs (red). A marker goes in the group of the storey
// it stands on, so it hides with its storey, and its name with that storey's labels. Built once, instanced per
// kind and storey (a few draw calls); nothing here changes while the game runs.
import * as THREE from "three";
import type { LevelDef } from "@redmond/shared";
import { labelSprite, storeyOf, type LabScene } from "./labScene.js";

/** Marker colours (sRGB). */
export const MARKER_COLORS = {
  bomb: 0xc62f2f,
  camera: 0x2b2f36,
  cameraCone: 0x9fd6e8,
  extinguisher: 0xe0453b,
  gasPipe: 0xf2c94c,
  attack: 0xe8692c,
  defense: 0x3d7be0,
  lab: 0xe6e6e6,
  rappel: 0xf29a3a,
  spawnPeek: 0x4cc46a,
  runOut: 0xe0453b,
} as const;

type Kind = keyof typeof MARKER_COLORS;

/** How far a camera's cone reaches the way it looks (metres), and its radius there. */
const CONE_M = 1.2;
const CONE_R_M = 0.45;
/** A name floats this far over its marker (metres). */
const NAME_UP_M = 0.45;

const up = new THREE.Vector3(0, 1, 0);
/** The way a yaw faces (degrees; 0 faces −z, north, and 90 faces −x, west), pitched up by `pitchDeg`. */
function facing(yawDeg: number, pitchDeg = 0): THREE.Vector3 {
  const [y, p] = [(yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180];
  return new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
}

/** A flat dart along −Z (the way yaw 0 faces), a unit long, centred on its point. */
function dart(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, -0.55, -0.38, 0, 0.45, 0, 0, 0.2, 0, 0, -0.55, 0, 0, 0.2, 0.38, 0, 0.45]), 3));
  return g;
}

export class MapMarkers {
  /** The zones view (O): rappel faces, spawn peeks and run-outs. */
  zones = false;
  /** How many of each marker is drawn (tests): bombs, cameras, ingredients, spawns, and each kind of zone. */
  readonly counts: Record<string, number> = {};
  private readonly zoneMeshes: THREE.Object3D[] = [];
  private readonly storeys: readonly { floorY: number }[];
  /** Per kind and storey, the instances to draw: their geometry, their material and each one's matrix. */
  private readonly batches = new Map<string, { storey: number; geometry: THREE.BufferGeometry; material: THREE.Material; zone: boolean; matrices: THREE.Matrix4[] }>();

  constructor(
    private readonly lab: LabScene,
    level: Pick<LevelDef, "storeys" | "sites" | "cameras" | "ingredients" | "spawns" | "zones">,
  ) {
    this.storeys = level.storeys;
    const solid = (kind: Kind) => new THREE.MeshBasicMaterial({ color: MARKER_COLORS[kind] });
    // `onWall`: drawn a little nearer the eye than it is, so a face lying on a wall's face doesn't flicker against it.
    const seeThrough = (kind: Kind, opacity: number, onWall = false) =>
      new THREE.MeshBasicMaterial({
        color: MARKER_COLORS[kind],
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        ...(onWall ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 } : {}),
      });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();

    // Bombs: a case on the floor.
    const bomb = solid("bomb");
    for (const site of level.sites) {
      for (const b of site.bombs) {
        this.add("bomb", b.pos[1], box, bomb, m.compose(p.set(b.pos[0], b.pos[1] + 0.175, b.pos[2]), q.identity(), s.set(0.5, 0.35, 0.35)));
        this.name(`Bomb ${b.id}`, b.pos[0], b.pos[1] + 0.35 + NAME_UP_M, b.pos[2], b.pos[1]);
      }
    }
    this.counts.bombs = level.sites.reduce((n, x) => n + x.bombs.length, 0);

    // Cameras: a box on the wall, turned the way it looks, and a cone out from it.
    const cam = solid("camera");
    const cone = new THREE.ConeGeometry(CONE_R_M, CONE_M, 16, 1, true);
    const coneMat = seeThrough("cameraCone", 0.28);
    for (const c of level.cameras) {
      const [x, y, z] = c.pos;
      const look = facing(c.yawDeg, c.pitchDeg);
      // The camera is mounted under a ceiling: it stands with its storey's floor under it (its own height is
      // above that storey's floor plus the slack).
      const floor = y - 1;
      q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), look);
      this.add("camera", floor, box, cam, m.compose(p.set(x, y, z), q, s.set(0.18, 0.14, 0.26)));
      // The cone's apex (its +y end) at the camera, opening the way it looks.
      q.setFromUnitVectors(up, look.clone().negate());
      this.add("cameraCone", floor, cone, coneMat, m.compose(p.set(x, y, z).addScaledVector(look, CONE_M / 2), q, s.set(1, 1, 1)));
      this.name(c.id, x, y + NAME_UP_M, z, floor);
    }
    this.counts.cameras = level.cameras.length;

    // Extinguishers stand on the wall; gas pipes run along it.
    const can = new THREE.CylinderGeometry(0.08, 0.08, 0.45, 12);
    const pipe = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 10);
    const [ext, gas] = [solid("extinguisher"), solid("gasPipe")];
    for (const g of level.ingredients) {
      const [x, y, z] = g.pos;
      const floor = y - 1;
      if (g.kind === "fire_extinguisher") this.add("extinguisher", floor, can, ext, m.compose(p.set(x, y, z), q.identity(), s.set(1, 1, 1)));
      else {
        // Along the wall: square to the way it faces.
        q.setFromUnitVectors(up, facing(g.yawDeg - 90));
        this.add("gasPipe", floor, pipe, gas, m.compose(p.set(x, y, z), q, s.set(1, 1, 1)));
      }
      this.name(g.kind === "fire_extinguisher" ? `Extinguisher ${g.id}` : `Gas pipe ${g.id}`, x, y + 0.25 + NAME_UP_M, z, floor);
    }
    this.counts.ingredients = level.ingredients.length;

    // Spawns: a disc on the floor and a dart the way it faces; each group's name over its first spawn.
    const disc = new THREE.CircleGeometry(0.3, 20).rotateX(-Math.PI / 2);
    const arrow = dart();
    const discMat = { attack: seeThrough("attack", 0.55), defense: seeThrough("defense", 0.55), lab: seeThrough("lab", 0.55) };
    const dartMat = { attack: solid("attack"), defense: solid("defense"), lab: solid("lab") };
    const named = new Set<string>();
    for (const sp of level.spawns) {
      const side = sp.side ?? "lab";
      const [x, y, z] = sp.pos;
      this.add(side, y, disc, discMat[side], m.compose(p.set(x, y + 0.02, z), q.identity(), s.set(1, 1, 1)));
      q.setFromAxisAngle(up, (sp.yawDeg * Math.PI) / 180);
      this.add(side, y, arrow, dartMat[side], m.compose(p.set(x, y + 0.03, z), q, s.set(0.5, 1, 0.5)));
      const group = sp.group ?? "lab";
      if (named.has(group)) continue;
      named.add(group);
      const site = level.sites.find((x) => x.id === sp.group);
      const text = side === "lab" ? "Lab spawn" : side === "attack" ? `Attackers ${group.replace(/_/g, " ")}` : `Defenders ${site ? site.name : group}`;
      this.name(text, x, y + 0.3 + NAME_UP_M, z, y);
    }
    this.counts.spawns = level.spawns.length;

    // The zones view: rappel faces, spawn peeks and run-outs, each box see-through.
    const zoneMat = { rappel: seeThrough("rappel", 0.3, true), spawn_peek: seeThrough("spawnPeek", 0.3, true), out_of_bounds: seeThrough("runOut", 0.3, true) };
    for (const zone of level.zones) {
      if (zone.kind !== "rappel" && zone.kind !== "spawn_peek" && zone.kind !== "out_of_bounds") continue;
      const kind: Kind = zone.kind === "rappel" ? "rappel" : zone.kind === "spawn_peek" ? "spawnPeek" : "runOut";
      for (const b of zone.boxes) {
        const bottom = b.center[1] - b.size[1] / 2;
        q.setFromAxisAngle(up, (b.yawDeg * Math.PI) / 180);
        this.add(kind, bottom, box, zoneMat[zone.kind], m.compose(p.set(...b.center), q, s.set(...b.size)), true);
      }
      this.counts[zone.kind] = (this.counts[zone.kind] ?? 0) + 1;
    }

    for (const [key, b] of this.batches) {
      const mesh = new THREE.InstancedMesh(b.geometry, b.material, b.matrices.length);
      b.matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
      mesh.computeBoundingSphere();
      mesh.name = `marker:${key}`;
      // See-through markers are drawn after the level, so the level shows through them.
      if ((b.material as THREE.MeshBasicMaterial).transparent) mesh.renderOrder = 2;
      if (b.zone) {
        mesh.visible = false;
        this.zoneMeshes.push(mesh);
      }
      lab.storeys[b.storey].add(mesh);
    }
    this.batches.clear();
  }

  /** Show or hide the zones view. */
  setZones(on: boolean): void {
    this.zones = on;
    for (const mesh of this.zoneMeshes) mesh.visible = on;
  }

  /** An instance of `kind` standing on height `floorY` (it goes with that storey). */
  private add(kind: string, floorY: number, geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, zone = false): void {
    const storey = storeyOf(this.storeys, floorY);
    const key = `${kind}:${material.uuid}:${geometry.uuid}:${storey}`;
    let batch = this.batches.get(key);
    if (!batch) this.batches.set(key, (batch = { storey, geometry, material, zone, matrices: [] }));
    batch.matrices.push(matrix.clone());
  }

  /** A marker's name at (x, y, z), with the labels of the storey whose floor is `floorY`. */
  private name(text: string, x: number, y: number, z: number, floorY: number): void {
    const sprite = labelSprite(text, x, y, z);
    this.lab.labels.push(sprite);
    this.lab.labelGroups[storeyOf(this.storeys, floorY)].add(sprite);
  }
}
