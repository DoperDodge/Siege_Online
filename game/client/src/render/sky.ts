// The sky (Phase 10 M3, render/DESIGN.md §6.1): the CC0 HDRI's sky as a dome round the camera (tools/art/sky.mjs packs
// it: linear light divided by a scale, sRGB in 8 bits, multiplied back here and tone-mapped with the frame), the haze
// coloured as its horizon, the sun where the HDRI's sun is with its colour and irradiance, and the whole sky as an
// environment map (for reflections and, once the probes are in, the outdoor fill: probeField.ts).
import * as THREE from "three";

export interface SkyInfo {
  files: { background: string; env: string };
  background: { width: number; height: number; belowDeg: number; scale: number };
  env: { width: number; height: number };
  sun: { dir: [number, number, number]; color: [number, number, number]; irradiance: [number, number, number] };
  horizon: [number, number, number];
}

/** The sky as loaded: its manifest entry, the backdrop texture, and the environment's floats (RGBA, rows from the zenith). */
export interface SkyData {
  info: SkyInfo;
  background: THREE.Texture;
  env: Float32Array;
}

const BASE = "/art/textures/";

export async function loadSky(base = BASE): Promise<SkyData | null> {
  const r = await fetch(`${base}manifest.json`);
  if (!r.ok) return null;
  const info = ((await r.json()) as { sky?: SkyInfo }).sky;
  if (!info) return null;
  const [background, env] = await Promise.all([
    new THREE.TextureLoader().loadAsync(`${base}${info.files.background}`),
    fetch(`${base}${info.files.env}`).then(async (res) => new Float32Array(await res.arrayBuffer())),
  ]);
  background.colorSpace = THREE.SRGBColorSpace;
  background.flipY = false; // row 0 is the zenith, as the shader reads it
  background.generateMipmaps = false;
  background.minFilter = THREE.LinearFilter;
  background.wrapS = THREE.RepeatWrapping;
  background.needsUpdate = true;
  return { info, background, env };
}

const DOME_VERTEX = /* glsl */ `
varying vec3 vSkyDir;
void main() {
  vSkyDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww; // on the far plane: behind everything
}
`;

const DOME_FRAGMENT = /* glsl */ `
#include <common>
uniform sampler2D tSky;
uniform float uScale;
uniform float uBelow;
varying vec3 vSkyDir;
void main() {
  vec3 d = normalize( vSkyDir );
  float u = atan( d.z, d.x ) * RECIPROCAL_PI2 + 0.5;
  // Rows from the zenith (v 0) down to uBelow radians under the horizon (v 1); lower looks at the last row.
  float el = max( asin( clamp( d.y, -1.0, 1.0 ) ), -uBelow );
  float v = ( 1.5707963 - el ) / ( 1.5707963 + uBelow );
  gl_FragColor = vec4( texture2D( tSky, vec2( u, v ) ).rgb * uScale, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class SkyView {
  readonly dome: THREE.Mesh;
  /** The sky as an environment map (prefiltered for roughness), or null on Low. */
  readonly env: THREE.Texture | null;
  readonly sunDir: THREE.Vector3;
  readonly sunColor: THREE.Color;
  /** The sun's irradiance at normal incidence (the brightest channel): the DirectionalLight's intensity. */
  readonly sunIntensity: number;
  readonly horizon: THREE.Color;
  /** The sun's irradiance at normal incidence as luminance (before any gain). */
  readonly sunLuminance: number;

  constructor(
    private readonly data: SkyData,
    renderer: THREE.WebGLRenderer | null,
    /** Make the environment map (High, Medium: the probes light with it). */
    withEnv: boolean,
  ) {
    const info = data.info;
    const mat = new THREE.ShaderMaterial({
      uniforms: { tSky: { value: data.background }, uScale: { value: info.background.scale }, uBelow: { value: (info.background.belowDeg * Math.PI) / 180 } },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.dome.name = "sky";
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.sunDir = new THREE.Vector3(...info.sun.dir).normalize();
    const irr = info.sun.irradiance;
    this.sunIntensity = Math.max(irr[0], irr[1], irr[2]);
    this.sunColor = new THREE.Color(irr[0] / this.sunIntensity, irr[1] / this.sunIntensity, irr[2] / this.sunIntensity);
    this.horizon = new THREE.Color(info.horizon[0], info.horizon[1], info.horizon[2]);
    this.sunLuminance = 0.2126 * irr[0] + 0.7152 * irr[1] + 0.0722 * irr[2];
    this.env = withEnv && renderer ? this.envMap(renderer) : null;
  }

  /** The environment floats as an equirectangular texture (three's layout: rows from straight down), prefiltered. */
  private envMap(renderer: THREE.WebGLRenderer): THREE.Texture {
    const { width: w, height: h } = this.data.info.env;
    const src = this.data.env;
    // Half floats: filterable in WebGL2 without an extension (32-bit floats need one).
    const flipped = new Uint16Array(src.length);
    for (let y = 0; y < h; y++) for (let i = 0; i < w * 4; i++) flipped[(h - 1 - y) * w * 4 + i] = THREE.DataUtils.toHalfFloat(src[y * w * 4 + i]);
    const tex = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const out = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return out;
  }

  /**
   * The open sky's irradiance on a face up (luminance): the sun's at its height (times `sunGain`) and the sky's, summed
   * over the environment's upper half.
   */
  daylight(sunGain: number): number {
    const { width: w, height: h } = this.data.info.env;
    const env = this.data.env;
    let sky = 0;
    for (let y = 0; y < h / 2; y++) {
      const el = (0.5 - (y + 0.5) / h) * Math.PI;
      const dOmega = ((2 * Math.PI) / w) * (Math.PI / h) * Math.cos(el);
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        sky += (0.2126 * env[o] + 0.7152 * env[o + 1] + 0.0722 * env[o + 2]) * Math.sin(el) * dOmega;
      }
    }
    const irr = this.data.info.sun.irradiance;
    return sky + (0.2126 * irr[0] + 0.7152 * irr[1] + 0.0722 * irr[2]) * sunGain * Math.max(0, this.sunDir.y);
  }

  /** Keep the dome round the camera (it's drawn at the far plane whatever its size). */
  follow(camera: THREE.Camera): void {
    this.dome.position.copy(camera.position);
    this.dome.scale.setScalar(10);
    this.dome.updateMatrixWorld();
  }

  dispose(): void {
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.data.background.dispose();
    this.env?.dispose();
  }
}
