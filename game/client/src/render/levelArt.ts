// The level's materials in the art pass (Phase 10, render/DESIGN.md §5): one shader, added to three's standard
// material, draws every box of the level with the texture sets (textures.ts), choosing per pixel by the room the face
// looks into. Level boxes carry no texture coordinates: a face samples its textures by its position on its own plane
// (box mapping), so a texture keeps its size on any box and runs on across neighbouring boxes and a wall's cells.
//
// What a face wears: a style (data/maps/<map>/art.json), from the box's own (outside items, roofs, stairs: by
// renderable id) or else from the room map — per storey, 10 cm a texel, the code of the room each spot is in, or of
// an outside zone round the building — sampled 15 cm off the face along its normal, in the room it faces. A style
// gives the material of walls, floors (faces up), ceilings (faces down) and, on inside walls, the trims by height
// above the storey's floor: baseboard, wainscot with its rail, crown. Destructible panels' boxes carry no normals:
// their faces' normals come from the screen-space slope of the position, snapped to the panel's axes.
import * as THREE from "three";
import type { ArtData, ArtStyle, BuiltLevel, MapArt, Renderable } from "@redmond/shared";
import type { BakeScene, GridSpec } from "./probes/bake.js";
import { probeGlsl } from "./probes/probeField.js";
import type { TextureSets } from "./textures.js";

/** Room map resolution (metres a texel), and how far past the rooms (padded zones aside) it reaches. */
const ROOM_CELL_M = 0.1;
const ROOM_MARGIN_M = 1.5;
/** Inside trims when a style doesn't say: baseboard and crown heights (m). */
const BASEBOARD_M = 0.12;
const CROWN_M = 0.07;
/**
 * Room map codes: 0 outside, rooms from 1, outside zones round rooms from ZONE_CODE; the shader reads a spot outside
 * (0, or off the map) as OUTSIDE_CODE + its storey, so each storey's outside can wear its own style (below ground).
 */
const ZONE_CODE = 200;
const OUTSIDE_CODE = 240;

/** A lamp of power 1's irradiance at a metre (the sky's units: the sun gives about 4.7 at normal incidence here). */
const LAMP_BASE = 9;

/** The look of a level with no art file (the labs): painted concrete, concrete floors, a white ceiling. */
const LAB_STYLE: ArtStyle = { wall: "concrete_painted", floor: "floor_concrete", ceiling: "plaster_white", trim: "concrete_painted", exterior: true };

const VERTEX_DECL = /* glsl */ `
attribute float aArt;
uniform float uArtStyle;
varying vec3 vArtPos;
varying vec3 vArtNormal;
varying float vArtStyle;
`;

const VERTEX_MAIN = /* glsl */ `
vec4 artW = vec4( transformed, 1.0 );
vec3 artN = objectNormal;
#ifdef USE_INSTANCING
  artW = instanceMatrix * artW;
  artN = mat3( instanceMatrix ) * artN; // a box face's normal keeps its direction when the box is scaled
#endif
artW = modelMatrix * artW;
vArtPos = artW.xyz;
vArtNormal = mat3( modelMatrix ) * artN;
vArtStyle = aArt > 0.5 ? aArt : uArtStyle;
`;

/**
 * The room maps and the storeys (shared by the level's materials and any material the probes light: litPatch): the
 * storey a height is on, the room code at a spot, and its probe class (a room's code; anything outside one, 255).
 */
const ROOM_DECL = /* glsl */ `
#define OUTSIDE_CODE_GLSL ${OUTSIDE_CODE}
uniform highp sampler2DArray tArtRooms;
uniform vec4 uArtRoomBox;
uniform vec2 uArtRoomSize;
uniform vec4 uArtFloors[ 2 ];
uniform vec4 uArtCeils[ 2 ];
uniform int uArtStoreys;
float artFloorY( int s ) { return uArtFloors[ s / 4 ][ s - 4 * ( s / 4 ) ]; }
float artCeilY( int s ) { return uArtCeils[ s / 4 ][ s - 4 * ( s / 4 ) ]; }
// The storey a height is on: the last whose floor is within 10 cm under it.
int artStorey( float y ) {
  int s = 0;
  for ( int i = 0; i < 8; i++ ) {
    if ( i >= uArtStoreys ) break;
    if ( artFloorY( i ) - 0.1 <= y ) s = i;
  }
  return s;
}
// The room (or outside zone) code at q on storey s; 0 outside the map.
int artRoomCode( vec3 q, int s ) {
  vec2 t = ( q.xz - uArtRoomBox.xy ) / uArtRoomBox.z;
  if ( t.x < 0.0 || t.y < 0.0 || t.x >= uArtRoomSize.x || t.y >= uArtRoomSize.y ) return 0;
  return int( texelFetch( tArtRooms, ivec3( int( t.x ), int( t.y ), s ), 0 ).r * 255.0 + 0.5 );
}
// The probes' room class at q (probes/bake.ts roomClass).
float artRoomClass( vec3 q ) {
  int code = artRoomCode( q, artStorey( q.y ) );
  return code > 0 && code < 200 ? float( code ) : 255.0;
}
`;

const FRAGMENT_DECL = /* glsl */ `
${ROOM_DECL}
uniform highp sampler2DArray tArtColor;
uniform highp sampler2DArray tArtNormal;
uniform highp sampler2DArray tArtOrm;
uniform highp sampler2D tArtMat;
uniform highp sampler2D tArtStyle;
uniform highp sampler2D tArtRoomStyle;
uniform float uArtGrid;
uniform mat4 modelMatrix;
varying vec3 vArtPos;
varying vec3 vArtNormal;
varying float vArtStyle;

vec4 artTexel( highp sampler2D t, int x, int y ) {
  return texelFetch( t, ivec2( x, y ), 0 );
}
// How much of the pixel lies on a line every spacing metres (the labs' floor grid: a ruler).
float artGridLine( vec2 p, float spacing, float px ) {
  vec2 c = p / spacing;
  vec2 w = max( fwidth( c ), vec2( 1e-6 ) );
  vec2 d = abs( fract( c - 0.5 ) - 0.5 ) / w;
  vec2 on = clamp( 0.5 * px + 0.5 - d, 0.0, 1.0 ) * ( 1.0 - smoothstep( 0.1, 0.3, w ) );
  return max( on.x, on.y );
}
`;

/** Any lit material the probes light (litPatch): its world position. */
const LIT_VERTEX_DECL = /* glsl */ `
varying vec3 vLitPos;
`;
const LIT_VERTEX_MAIN = /* glsl */ `
vec4 litW = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  litW = instanceMatrix * litW;
#endif
vLitPos = ( modelMatrix * litW ).xyz;
`;
const LIT_FRAGMENT_MAPS = /* glsl */ `
if ( uProbeOn > 0.5 ) {
  // three's normals are in view space: back to the world (the view matrix's rotation, transposed).
  vec3 litNg = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
  vec3 litN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec4 litProbe = probeLight( vLitPos, litNg, litN, artRoomClass( vLitPos + litNg * 0.15 ) );
  irradiance = vec3( 0.0 );
  iblIrradiance = litProbe.rgb;
  radiance = radiance * litProbe.a + ( 1.0 - litProbe.a ) * litProbe.rgb * RECIPROCAL_PI;
}
`;

/** Replaces map_fragment: picks the face's material and samples it (the results feed the chunks below). */
const FRAGMENT_MAP = /* glsl */ `
vec3 artP = vArtPos;
#ifdef ART_PANEL
  vec3 artDn = normalize( cross( dFdx( artP ), dFdy( artP ) ) );
  vec3 artAx = normalize( modelMatrix[ 0 ].xyz );
  vec3 artAy = normalize( modelMatrix[ 1 ].xyz );
  vec3 artAz = normalize( modelMatrix[ 2 ].xyz );
  float artDx = dot( artDn, artAx );
  float artDy = dot( artDn, artAy );
  float artDz = dot( artDn, artAz );
  vec3 artNw = abs( artDx ) >= abs( artDy ) && abs( artDx ) >= abs( artDz ) ? artAx * sign( artDx ) : abs( artDy ) >= abs( artDz ) ? artAy * sign( artDy ) : artAz * sign( artDz );
#else
  vec3 artNw = normalize( vArtNormal );
#endif
vec3 artQ = artP + artNw * 0.15;
int artSt = artStorey( artQ.y );
int artCode = artRoomCode( artQ, artSt );
if ( artCode == 0 ) artCode = OUTSIDE_CODE_GLSL + artSt;
int artS = vArtStyle > 0.5 ? int( vArtStyle + 0.5 ) - 1 : int( artTexel( tArtRoomStyle, artCode, 0 ).r + 0.5 );
vec4 artS0 = artTexel( tArtStyle, 0, artS );
vec4 artS1 = artTexel( tArtStyle, 1, artS );
vec4 artS2 = artTexel( tArtStyle, 2, artS );
float artMat = artS0.x;
float artBevel = 0.0;
if ( artNw.y > 0.7 ) artMat = artS0.y;
else if ( artNw.y < -0.7 ) artMat = artS0.z;
else if ( artS0.w < 0.5 ) {
  // Inside: trims by height above the storey's floor and under its ceiling.
  float artHf = artQ.y - artFloorY( artSt );
  float artHc = artCeilY( artSt ) - artQ.y;
  if ( artHf < artS1.z ) {
    artMat = artS2.x;
    artBevel = smoothstep( artS1.z - 0.012, artS1.z, artHf );
  } else if ( artS1.y > 0.0 && artHf < artS1.y ) {
    artMat = artHf > artS1.y - 0.05 ? artS2.x : artS1.x;
    if ( artHf > artS1.y - 0.05 ) artBevel = smoothstep( artS1.y - 0.012, artS1.y, artHf ) - smoothstep( artS1.y - 0.05, artS1.y - 0.038, artHf ) * 0.6;
  } else if ( artHc < artS1.w ) {
    artMat = artS2.x;
    artBevel = -smoothstep( artS1.w - 0.012, artS1.w, artHc );
  }
} else if ( artS2.y >= 0.0 && artP.y < artS2.z ) {
  artMat = artS2.y;
}
int artMi = int( artMat + 0.5 );
vec4 artM0 = artTexel( tArtMat, 0, artMi );
vec4 artM1 = artTexel( tArtMat, 1, artMi );
vec4 artM2 = artTexel( tArtMat, 2, artMi );
vec3 artT = abs( artNw.y ) < 0.999 ? normalize( cross( vec3( 0.0, 1.0, 0.0 ), artNw ) ) : vec3( 1.0, 0.0, 0.0 );
vec3 artB = cross( artNw, artT );
if ( artM1.z > 0.5 ) {
  vec3 artT0 = artT;
  artT = artB;
  artB = -artT0;
}
vec3 artTc = vec3( dot( artP, artT ) / artM1.x, -dot( artP, artB ) / artM1.y, artM0.x );
vec4 artAlbedo = texture( tArtColor, artTc );
vec3 artOrm = texture( tArtOrm, artTc ).rgb;
vec3 artNt = texture( tArtNormal, artTc ).xyz * 2.0 - 1.0;
artNt.xy *= artM2.x;
vec3 artNormalW = normalize( artT * artNt.x + artB * artNt.y + artNw * max( artNt.z, 0.05 ) );
artNormalW = normalize( artNormalW + vec3( 0.0, artBevel * 0.9, 0.0 ) );
diffuseColor.rgb *= artAlbedo.rgb * artM0.yzw * artM2.y;
if ( uArtGrid > 0.5 && artNw.y > 0.9 ) {
  diffuseColor.rgb *= 1.0 - 0.35 * artGridLine( artP.xz, 1.0, 1.0 );
  diffuseColor.rgb *= 1.0 - 0.45 * artGridLine( artP.xz, 5.0, 1.5 );
}
`;

/**
 * After the image-based light (lights_fragment_maps): with the probes in, they give the face its indirect light — the
 * hemisphere light and the environment's diffuse light are dropped — and reflections show the sky as much as the
 * probes see it, the room's light for the rest (a metal in a closed room isn't black).
 */
const FRAGMENT_PROBES = /* glsl */ `
#ifdef ART_PROBES
if ( uProbeOn > 0.5 ) {
  float artCls = artCode > 0 && artCode < 200 ? float( artCode ) : 255.0;
  vec4 artProbe = probeLight( artP, artNw, artNormalW, artCls );
  irradiance = vec3( 0.0 );
  iblIrradiance = artProbe.rgb;
  // Reflections: the sky where the probes see it; elsewhere the room, as an even glow of the light the probes hold.
  radiance = radiance * artProbe.a + ( 1.0 - artProbe.a ) * artProbe.rgb * RECIPROCAL_PI;
}
#endif
`;

const FRAGMENT_ROUGHNESS = /* glsl */ `float roughnessFactor = clamp( artOrm.g * artM1.w, 0.04, 1.0 );`;
const FRAGMENT_METALNESS = /* glsl */ `float metalnessFactor = artOrm.b;`;
const FRAGMENT_NORMAL = /* glsl */ `normal = normalize( ( viewMatrix * vec4( artNormalW, 0.0 ) ).xyz );`;
/** Replaces aomap_fragment: the texture's occlusion darkens the indirect light, as three's own map does. */
const FRAGMENT_AO = /* glsl */ `
float ambientOcclusion = artOrm.r;
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
#endif
`;

/** A style's place in the style table: its fields as the shader reads them. */
interface StyleRow {
  wall: number;
  floor: number;
  ceiling: number;
  exterior: boolean;
  wainscot: number;
  wainscotH: number;
  baseboardH: number;
  crownH: number;
  trim: number;
  foundation: number;
  foundationY: number;
}

export class LevelArt {
  /** The shared uniforms every level material reads (the same objects in each). */
  readonly uniforms: Record<string, THREE.IUniform>;
  /** Materials by id, as the material table lists them. */
  private readonly matIndex = new Map<string, number>();
  private readonly styleIndex = new Map<string, number>();
  private readonly styles: StyleRow[] = [];
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly owned: THREE.Texture[] = [];
  private readonly items: { re: RegExp; style: number }[] = [];
  private readonly propStyle = new Map<string, number>();
  private readonly solidProp = new Map<string, string>();
  private readonly map: MapArt | null;
  /** The probe field's uniforms, once attached (before the materials are made). */
  private probes: Record<string, THREE.IUniform> | null = null;
  /** Each style's id, by index. */
  private readonly styleIds: string[] = [];
  /** Per material: its albedo (the set's mean colour, tinted and gained), linear rgb. */
  private readonly albedo: Float32Array;
  /** The room maps' data as the shader reads them (styleAt). */
  private rooms!: { data: Uint8Array; x0: number; z0: number; w: number; h: number; layers: number; codes: Float32Array };

  constructor(
    private readonly level: BuiltLevel,
    sets: TextureSets,
    data: ArtData,
  ) {
    this.map = data.maps.get(level.def.id) ?? null;
    // The material table: 3 texels per material.
    const mats = Object.entries(data.materials);
    const matData = new Float32Array(mats.length * 3 * 4);
    this.albedo = new Float32Array(mats.length * 3);
    const c = new THREE.Color();
    mats.forEach(([id, m], i) => {
      this.matIndex.set(id, i);
      const mean = sets.mean.get(m.set) ?? [0.5, 0.5, 0.5];
      c.setStyle(m.tint);
      const gain = m.gain ?? 1;
      this.albedo.set([Math.min(0.95, mean[0] * c.r * gain), Math.min(0.95, mean[1] * c.g * gain), Math.min(0.95, mean[2] * c.b * gain)], i * 3);
      const size = m.scaleM ?? sets.sizeM.get(m.set) ?? [2, 2];
      c.setStyle(m.tint);
      matData.set([sets.layer.get(m.set) ?? 0, c.r, c.g, c.b, size[0], size[1], m.rotate === 90 ? 1 : 0, m.roughness ?? 1, m.normal ?? 1, m.gain ?? 1, 0, 0], i * 12);
    });
    const matTable = this.table(matData, 3, mats.length);

    // Styles: the map's (or the lab look), then one per fixed material the panels use.
    const add = (id: string, s: ArtStyle) => {
      const mat = (name: string) => this.matIndex.get(name) ?? 0;
      this.styleIndex.set(id, this.styles.length);
      this.styleIds.push(id);
      const inside = !s.exterior;
      this.styles.push({
        wall: mat(s.wall),
        floor: mat(s.floor),
        ceiling: mat(s.ceiling),
        exterior: !!s.exterior,
        wainscot: s.wainscot ? mat(s.wainscot.material) : -1,
        wainscotH: s.wainscot?.heightM ?? 0,
        baseboardH: inside ? (s.baseboardM ?? BASEBOARD_M) : 0,
        crownH: inside ? (s.crownM ?? CROWN_M) : 0,
        trim: mat(s.trim),
        foundation: s.foundation ? mat(s.foundation.material) : -1,
        foundationY: s.foundation?.topY ?? -1e4,
      });
    };
    if (this.map) for (const [id, s] of Object.entries(this.map.styles)) add(id, s);
    else add("lab", LAB_STYLE);
    for (const m of ["studs", "steel", "barricade"]) add(`_${m}`, { wall: m, floor: m, ceiling: m, trim: m, exterior: true });
    const styleData = new Float32Array(this.styles.length * 4 * 4);
    this.styles.forEach((s, i) =>
      styleData.set([s.wall, s.floor, s.ceiling, s.exterior ? 1 : 0, s.wainscot, s.wainscotH, s.baseboardH, s.crownH, s.trim, s.foundation, s.foundationY, 0, 0, 0, 0, 0], i * 16),
    );
    const styleTable = this.table(styleData, 4, this.styles.length);

    // Explicit styles by renderable id, and the cover props' by class.
    if (this.map) {
      for (const it of this.map.items) this.items.push({ re: new RegExp(it.match), style: this.styleIndex.get(it.style)! });
      for (const [cls, s] of Object.entries(this.map.props)) this.propStyle.set(cls, this.styleIndex.get(s)!);
    }
    for (const s of level.def.solids) if (s.prop) this.solidProp.set(s.id, s.prop);

    const rooms = this.roomMaps();
    const storeys = level.def.storeys;
    const floors = [new THREE.Vector4(), new THREE.Vector4()];
    const ceils = [new THREE.Vector4(), new THREE.Vector4()];
    storeys.slice(0, 8).forEach((s, i) => {
      floors[i >> 2].setComponent(i & 3, s.floorY);
      ceils[i >> 2].setComponent(i & 3, s.ceilingY);
    });
    this.uniforms = {
      tArtColor: { value: sets.color },
      tArtNormal: { value: sets.normal },
      tArtOrm: { value: sets.orm },
      tArtMat: { value: matTable },
      tArtStyle: { value: styleTable },
      tArtRoomStyle: { value: rooms.styles },
      tArtRooms: { value: rooms.maps },
      uArtRoomBox: { value: new THREE.Vector4(rooms.x0, rooms.z0, ROOM_CELL_M, 0) },
      uArtRoomSize: { value: new THREE.Vector2(rooms.w, rooms.h) },
      uArtFloors: { value: floors },
      uArtCeils: { value: ceils },
      uArtStoreys: { value: Math.max(1, Math.min(8, storeys.length)) },
      uArtGrid: { value: this.map ? 0 : 1 },
    };
  }

  /** A float table the shader reads texel by texel (row per entry). */
  private table(data: Float32Array, width: number, rows: number): THREE.DataTexture {
    const t = new THREE.DataTexture(data, width, Math.max(1, rows), THREE.RGBAFormat, THREE.FloatType);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    this.owned.push(t);
    return t;
  }

  /**
   * The room maps, a layer per storey: each spot's room code (rooms from 1, in the level's order), then each outside
   * zone's code where the spot is outside; and the table from code to style.
   */
  private roomMaps() {
    const def = this.level.def;
    const storeys = def.storeys.length ? def.storeys : [{ id: "all", floorY: 0, ceilingY: 3 }];
    const art = this.map;
    const pad = Math.max(0, ...(art?.zones.map((z) => z.padM ?? 0) ?? [0]));
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of def.rooms)
      for (const q of r.rects) {
        x0 = Math.min(x0, q[0]);
        z0 = Math.min(z0, q[1]);
        x1 = Math.max(x1, q[2]);
        z1 = Math.max(z1, q[3]);
      }
    if (!Number.isFinite(x0)) [x0, z0, x1, z1] = [0, 0, ROOM_CELL_M, ROOM_CELL_M];
    const m = ROOM_MARGIN_M + pad;
    [x0, z0, x1, z1] = [x0 - m, z0 - m, x1 + m, z1 + m];
    const w = Math.max(1, Math.ceil((x1 - x0) / ROOM_CELL_M));
    const h = Math.max(1, Math.ceil((z1 - z0) / ROOM_CELL_M));
    const data = new Uint8Array(w * h * storeys.length);
    const layerOf = new Map(storeys.map((s, i) => [s.id, i]));
    const fill = (layer: number, rect: readonly number[], grow: number, code: number, onlyEmpty: boolean) => {
      const u0 = Math.max(0, Math.floor((rect[0] - grow - x0) / ROOM_CELL_M));
      const v0 = Math.max(0, Math.floor((rect[1] - grow - z0) / ROOM_CELL_M));
      const u1 = Math.min(w, Math.ceil((rect[2] + grow - x0) / ROOM_CELL_M));
      const v1 = Math.min(h, Math.ceil((rect[3] + grow - z0) / ROOM_CELL_M));
      for (let v = v0; v < v1; v++)
        for (let u = u0, i = layer * w * h + v * w + u0; u < u1; u++, i++) if (!onlyEmpty || data[i] === 0) data[i] = code;
    };
    def.rooms.forEach((r, i) => {
      const layer = layerOf.get(r.storey) ?? 0;
      for (const q of r.rects) fill(layer, q, 0, i + 1, false);
    });
    art?.zones.forEach((z, zi) => {
      const code = ZONE_CODE + zi;
      for (const id of z.rooms ?? []) {
        const r = def.rooms.find((x) => x.id === id);
        if (r) for (const q of r.rects) fill(layerOf.get(r.storey) ?? 0, q, z.padM ?? 0, code, true);
      }
    });
    const maps = new THREE.DataArrayTexture(data, w, h, storeys.length);
    maps.format = THREE.RedFormat;
    maps.type = THREE.UnsignedByteType;
    maps.magFilter = maps.minFilter = THREE.NearestFilter;
    maps.generateMipmaps = false;
    maps.unpackAlignment = 1;
    maps.needsUpdate = true;
    this.owned.push(maps);

    const codes = new Float32Array(256 * 4);
    const fallback = this.styleIndex.get(art ? art.default : "lab") ?? 0;
    const outside = this.styleIndex.get(art ? art.outside : "lab") ?? 0;
    def.rooms.forEach((r, i) => (codes[(i + 1) * 4] = this.styleIndex.get(art?.rooms[r.id] ?? "") ?? fallback));
    art?.zones.forEach((z, zi) => (codes[(ZONE_CODE + zi) * 4] = this.styleIndex.get(z.style) ?? fallback));
    // Each storey's outside: the first zone naming the storey, else the map's outside style.
    storeys.forEach((st, i) => {
      const zone = art?.zones.find((z) => z.storeys?.includes(st.id));
      codes[(OUTSIDE_CODE + i) * 4] = zone ? (this.styleIndex.get(zone.style) ?? outside) : outside;
    });
    this.rooms = { data, x0, z0, w, h, layers: storeys.length, codes };
    const styles = new THREE.DataTexture(codes, 256, 1, THREE.RGBAFormat, THREE.FloatType);
    styles.magFilter = styles.minFilter = THREE.NearestFilter;
    styles.needsUpdate = true;
    this.owned.push(styles);
    return { maps, styles, x0, z0, w, h };
  }

  /**
   * The style a face at `p` with normal `n` wears (`explicit`: the box's own, styleOf), by the shader's rules: the room
   * map 15 cm off the face, on the storey whose floor is within 10 cm under that spot (tests, debugging).
   */
  styleAt(p: readonly number[], n: readonly number[], explicit = 0): string {
    if (explicit > 0) return this.styleIds[explicit - 1];
    const q = [p[0] + n[0] * 0.15, p[1] + n[1] * 0.15, p[2] + n[2] * 0.15];
    const storeys = this.level.def.storeys;
    let s = 0;
    for (let i = 0; i < Math.min(8, storeys.length); i++) if (storeys[i].floorY - 0.1 <= q[1]) s = i;
    const r = this.rooms;
    const u = Math.floor((q[0] - r.x0) / ROOM_CELL_M);
    const v = Math.floor((q[2] - r.z0) / ROOM_CELL_M);
    const code = (u < 0 || v < 0 || u >= r.w || v >= r.h ? 0 : r.data[s * r.w * r.h + v * r.w + u]) || OUTSIDE_CODE + s;
    return this.styleIds[r.codes[code * 4]];
  }

  /**
   * The probe bake's scene (probes/bake.ts) for these boxes, grids, sky, sun and lamps: the room maps and their styles'
   * wall, floor and ceiling materials, each material's albedo, and the storeys' floors.
   */
  bakeScene(boxes: Float32Array, grids: GridSpec[], sky: BakeScene["sky"], sun: BakeScene["sun"], lamps: Float32Array, rays: number): BakeScene {
    const r = this.rooms;
    const roomStyle = new Int32Array(256);
    for (let i = 0; i < 256; i++) roomStyle[i] = r.codes[i * 4];
    const styles = new Int32Array(this.styles.length * 3);
    this.styles.forEach((s, i) => styles.set([s.wall, s.floor, s.ceiling], i * 3));
    return {
      boxes,
      rooms: { data: r.data, x0: r.x0, z0: r.z0, cell: ROOM_CELL_M, w: r.w, h: r.h, layers: r.layers },
      floors: this.level.def.storeys.map((s) => s.floorY),
      roomStyle,
      styles,
      albedo: this.albedo,
      sky,
      sun,
      lamps,
      grids,
      rays,
    };
  }

  /** The room code at a point, by the shader's rule (no normal offset); OUTSIDE_CODE + its storey off the rooms. */
  codeAt(x: number, y: number, z: number): number {
    const storeys = this.level.def.storeys;
    let s = 0;
    for (let i = 0; i < Math.min(8, storeys.length); i++) if (storeys[i].floorY - 0.1 <= y) s = i;
    const r = this.rooms;
    const u = Math.floor((x - r.x0) / ROOM_CELL_M);
    const v = Math.floor((z - r.z0) / ROOM_CELL_M);
    return (u < 0 || v < 0 || u >= r.w || v >= r.h ? 0 : r.data[s * r.w * r.h + v * r.w + u]) || OUTSIDE_CODE + s;
  }

  /** The probes' room class at a point: its room's code, or the outside's class (probes/bake.ts roomClass). */
  classAt(x: number, y: number, z: number): number {
    const code = this.codeAt(x, y, z);
    return code > 0 && code < ZONE_CODE ? code : 255;
  }

  /**
   * A room's lamp (probes/scene.ts roomLamps): its style's colour times its power times LAMP_BASE (the irradiance a
   * lamp of power 1 gives at a metre), linear; inside styles have a warm one unless they say otherwise, outside ones none.
   */
  lampOf(roomId: string): [number, number, number] | null {
    const map = this.map;
    if (!map) return null;
    const id = map.rooms[roomId] ?? map.default;
    const style = map.styles[id];
    if (!style || style.exterior) return null;
    const lamp = style.lamp ?? { color: "#fff0dc", power: 1 };
    if (lamp.power <= 0) return null;
    const c = new THREE.Color(lamp.color);
    const k = LAMP_BASE * lamp.power;
    return [c.r * k, c.g * k, c.b * k];
  }

  /** The style a static box wears whatever room it's in, +1 (0: by its room). */
  styleOf(r: Renderable): number {
    for (const it of this.items) if (it.re.test(r.id)) return it.style + 1;
    const prop = this.solidProp.get(r.id);
    const s = prop !== undefined ? this.propStyle.get(prop) : undefined;
    return s !== undefined ? s + 1 : 0;
  }

  /** The style's index +1 for a fixed material the panels use ("studs", "steel", "barricade"). */
  private fixed(m: string): number {
    return (this.styleIndex.get(`_${m}`) ?? 0) + 1;
  }

  /** Light the materials with the probe field (probes/probeField.ts): before any material is made. */
  attachProbes(uniforms: Record<string, THREE.IUniform>): void {
    if (this.materials.size) throw new Error("attach the probes before the materials are made");
    this.probes = uniforms;
  }

  /** The material the static boxes are drawn with (instanced, their styles per box: aArt). */
  staticMaterial(): THREE.MeshStandardMaterial {
    return this.material("static", false, 0);
  }

  /** A panel part's material by PanelView's key, or null to keep its own (glass, seams). */
  panelMaterial(key: string): THREE.MeshStandardMaterial | null {
    if (key === "skin:BARRICADE") return this.material("barricade", true, this.fixed("barricade"));
    if (key.startsWith("skin:")) return this.material("skin", true, 0);
    if (key === "core:wood") return this.material("studs", true, this.fixed("studs"));
    if (key === "core:metal" || key === "steel") return this.material("steel", true, this.fixed("steel"));
    return null;
  }

  private material(key: string, panel: boolean, style: number): THREE.MeshStandardMaterial {
    let m = this.materials.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: panel });
    const probes = this.probes;
    m.defines = { ...(panel ? { ART_PANEL: "" } : {}), ...(probes ? { ART_PROBES: "" } : {}) };
    const shared = this.uniforms;
    const own = { uArtStyle: { value: style } };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, probes ?? {}, own);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${VERTEX_DECL}`).replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_MAIN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAGMENT_DECL}${probes ? probeGlsl() : ""}`)
        .replace("#include <map_fragment>", FRAGMENT_MAP)
        .replace("#include <roughnessmap_fragment>", FRAGMENT_ROUGHNESS)
        .replace("#include <metalnessmap_fragment>", FRAGMENT_METALNESS)
        .replace("#include <normal_fragment_maps>", FRAGMENT_NORMAL)
        .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>\n${FRAGMENT_PROBES}`)
        .replace("#include <aomap_fragment>", FRAGMENT_AO);
    };
    m.customProgramCacheKey = () => `level-art${panel ? "-panel" : ""}${probes ? "-probes" : ""}`;
    m.name = `art:${key}`;
    this.materials.set(key, m);
    return m;
  }

  /**
   * Light a material that isn't the level's (a body, a gadget, the glass) by the probes, as the level is: its indirect
   * light from the probes of the room it's in, the sky's reflection only where they see the sky. Standard materials
   * only; once each (it keeps any hook the material had). Needs the probes attached.
   */
  litPatch(material: THREE.Material): void {
    const m = material as THREE.MeshStandardMaterial;
    if (!m.isMeshStandardMaterial || m.userData.artLit || !this.probes || [...this.materials.values()].includes(m)) return;
    m.userData.artLit = true;
    const shared = this.uniforms;
    const probes = this.probes;
    const before = m.onBeforeCompile;
    const beforeKey = m.customProgramCacheKey;
    m.onBeforeCompile = (shader, renderer) => {
      before.call(m, shader, renderer);
      Object.assign(shader.uniforms, shared, probes);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${LIT_VERTEX_DECL}`).replace("#include <project_vertex>", `#include <project_vertex>\n${LIT_VERTEX_MAIN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${ROOM_DECL}\nvarying vec3 vLitPos;\n${probeGlsl()}`)
        .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>\n${LIT_FRAGMENT_MAPS}`);
    };
    m.customProgramCacheKey = () => `${beforeKey.call(m)}-art-lit`;
    m.needsUpdate = true;
  }

  /** Every material made so far (to compile them before they show). */
  allMaterials(): THREE.Material[] {
    return [...this.materials.values()];
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.owned) t.dispose();
  }
}

