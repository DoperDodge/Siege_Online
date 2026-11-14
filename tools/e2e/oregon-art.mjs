// The art pass on a real GPU's terms (Phase 10, game/client/src/render/DESIGN.md §13): the Oregon lab at High,
// Medium and Low in a browser, checked not for "did it draw here" but for "does it keep to what every WebGL2 device
// guarantees". The browser here draws in software, which is more generous than real hardware: it lets a fragment
// shader use 32 textures where Chrome and Edge on Windows (Direct3D) and most phones allow exactly the 16 WebGL2
// guarantees. The level's shader once used 19 at Medium and High: it ran here and failed to build on every real device
// (Ulo's report, 2026-11-14). So this counts, for every shader program the page builds:
// - it linked;
// - its texture samplers: at most 16 (MAX_TEXTURE_IMAGE_UNITS's guaranteed minimum);
// - its uniforms: at most 224 vectors (MAX_FRAGMENT_UNIFORM_VECTORS's minimum; ours counted together, so it's safe);
// and for every 3D or array texture the page makes, its size against the guaranteed 256 a side (3D) and 256 layers.
// Then the fallback: with the browser made to refuse the probes' shaders (as a GPU that can't build them would), High
// must come up as Low (and look as Low does) and say so, never fail to load. A screenshot of each for review.
// Requires `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 21500 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** What WebGL2 guarantees on every device (the spec's minimums). */
const GUARANTEED = { samplers: 16, uniformVectors: 224, size3D: 256, arrayLayers: 256, size2D: 2048 };

const server = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const result = { checks: {}, presets: {} };
let ok = false;
let browser;

/** Recorded in the page before its own scripts run: every program linked and every 3D or array texture made. */
function watchGl(refuse) {
  window.__gl = { programs: [], textures: [] };
  const P = WebGL2RenderingContext.prototype;
  const sources = new WeakMap();
  const refused = new WeakSet();
  const shaderSource = P.shaderSource;
  P.shaderSource = function (shader, src) {
    sources.set(shader, src);
    return shaderSource.call(this, shader, src);
  };
  const attachShader = P.attachShader;
  P.attachShader = function (program, shader) {
    if (refuse && (sources.get(shader) ?? "").includes(refuse)) refused.add(program);
    return attachShader.call(this, program, shader);
  };
  const linkProgram = P.linkProgram;
  P.linkProgram = function (program) {
    window.__gl.programs.push({ gl: this, program });
    return linkProgram.call(this, program);
  };
  // A GPU that can't build a shader: its program doesn't link.
  const getProgramParameter = P.getProgramParameter;
  P.getProgramParameter = function (program, name) {
    if (name === this.LINK_STATUS && refused.has(program)) return false;
    return getProgramParameter.call(this, program, name);
  };
  for (const fn of ["texImage3D", "texStorage3D"]) {
    const real = P[fn];
    P[fn] = function (target, ...rest) {
      // texStorage3D(target, levels, format, w, h, d); texImage3D(target, level, format, w, h, d, …).
      const [w, h, d] = rest.slice(2, 5);
      window.__gl.textures.push({ kind: target === this.TEXTURE_3D ? "3d" : "array", w, h, d });
      return real.call(this, target, ...rest);
    };
  }
}

/** Read back in the page: each program's link status, samplers and uniform vectors; the textures' sizes. */
function readGl() {
  const SAMPLERS = new Set([0x8b5e, 0x8b5f, 0x8b60, 0x8b62, 0x8dc1, 0x8dc4, 0x8dc5, 0x8dca, 0x8dcb, 0x8dcc, 0x8dcf, 0x8dd2, 0x8dd3, 0x8dd4, 0x8dd7]);
  const programs = [];
  for (const { gl, program } of window.__gl.programs) {
    if (!gl.isProgram(program)) continue; // deleted since
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
      programs.push({ linked: false, samplers: 0, vectors: 0, names: [] });
      continue;
    }
    let samplers = 0;
    let vectors = 0;
    const names = [];
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const u = gl.getActiveUniform(program, i);
      if (!u) continue;
      if (SAMPLERS.has(u.type)) {
        samplers += u.size;
        names.push(u.size > 1 ? `${u.name}×${u.size}` : u.name);
      } else vectors += (u.type === gl.FLOAT_MAT4 ? 4 : u.type === gl.FLOAT_MAT3 ? 3 : u.type === gl.FLOAT_MAT2 ? 2 : 1) * u.size;
    }
    programs.push({ linked: true, samplers, vectors, names });
  }
  const gl = window.__gl.programs[0]?.gl;
  return { programs, textures: window.__gl.textures, here: gl ? { samplers: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), renderer: gl.getParameter(gl.RENDERER) } : null };
}

/** How long a wait may take on a slow runner (ms): the art's textures and shaders, a probe pass, a frame, a screenshot. */
const WAIT = { art: 300000, pass: 420000, frames: 240000, screenshot: 240000 };

async function load(gfx, refuse = "") {
  const errors = [];
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
  const name = `${gfx}${refuse ? " (probes refused)" : ""}`;
  // Small: the software renderer shades every pixel on the CPU (a frame at High takes seconds on a CI runner), and
  // nothing checked here depends on the size.
  const ctx = await browser.newContext({ viewport: { width: 384, height: 216 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(watchGl, refuse);
  await page.goto(`${BASE}/labs/oregon.html?autotest=1&gfx=${gfx}&op=sledge`);
  await page.waitForFunction(() => window.__lab?.net?.ready, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__lab.view.art?.ready, null, { timeout: WAIT.art, polling: 250 });
  console.log(`  ${name}: the art is in at ${at()}`);
  // The probes' first pass switches the light over (Medium and High; none on Low, or after a fallback to it); the
  // second adds the bounce. Both in before anything is measured: the picture is then the finished one, and the
  // bake's workers are no longer competing with the renderer for the runner's few cores.
  const wantsProbes = await page.evaluate(() => window.__lab.view.art.probes !== null);
  if (wantsProbes) {
    await page.waitForFunction(() => window.__lab.view.art.probes.passes >= 1, null, { timeout: WAIT.pass, polling: 500 });
    console.log(`  ${name}: the probes' first pass at ${at()}`);
    await page.waitForFunction(() => window.__lab.view.art.probes.passes >= 2, null, { timeout: WAIT.pass, polling: 500 });
    console.log(`  ${name}: their second at ${at()}`);
  }
  // In the kitchen, looking across it: a few frames drawn with everything on.
  const kitchen = await page.evaluate(() => window.__lab.view.rooms.find((r) => r.id === "1F_KITCHEN").anchor);
  await page.evaluate((a) => window.__lab.fly([a[0], a[1] + 1.6, a[2], 40, -8]), kitchen);
  const f0 = await page.evaluate(() => window.__lab.frames);
  await page.waitForFunction((t) => window.__lab.frames >= t, f0 + 6, { timeout: WAIT.frames, polling: 100 });
  console.log(`  ${name}: six frames in the kitchen at ${at()}`);
  const png = await page.screenshot({ path: join(OUT, `art-${gfx}${refuse ? "-fallback" : ""}.png`), timeout: WAIT.screenshot });
  console.log(`  ${name}: its screenshot at ${at()}`);
  // How bright the picture is where no HUD is drawn (its lower left: the island's top and the floor), 0..255.
  const brightness = await page.evaluate(async (b64) => {
    const img = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: "image/png" }));
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const [x, y, w, h] = [Math.round(img.width * 0.02), Math.round(img.height * 0.55), Math.round(img.width * 0.48), Math.round(img.height * 0.36)];
    const d = g.getImageData(x, y, w, h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, png.toString("base64"));
  const out = { art: await page.evaluate(() => window.__lab.view.art), gl: await page.evaluate(readGl), errors, brightness };
  await ctx.close();
  return out;
}

try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });

  for (const gfx of ["high", "medium", "low"]) {
    const r = await load(gfx);
    const linked = r.gl.programs.filter((p) => p.linked);
    const worst = [...linked].sort((a, b) => b.samplers - a.samplers)[0];
    const t3 = r.gl.textures.filter((t) => t.kind === "3d");
    const arrays = r.gl.textures.filter((t) => t.kind === "array");
    const summary = {
      shown: r.art.shown,
      problem: r.art.problem,
      probes: r.art.probes?.passes ?? null,
      programs: r.gl.programs.length,
      notLinked: r.gl.programs.length - linked.length,
      maxSamplers: worst?.samplers ?? 0,
      worstSamplers: worst?.names.join(" ") ?? "",
      maxUniformVectors: Math.max(0, ...linked.map((p) => p.vectors)),
      max3D: Math.max(0, ...t3.map((t) => Math.max(t.w, t.h, t.d))),
      maxLayers: Math.max(0, ...arrays.map((t) => t.d)),
      maxArraySide: Math.max(0, ...arrays.map((t) => Math.max(t.w, t.h))),
      brightness: Math.round(r.brightness * 10) / 10,
      errors: r.errors,
    };
    result.presets[gfx] = summary;
    result.here ??= r.gl.here;
    result.checks[`${gfx}Shown`] = r.art.ready && r.art.shown && r.art.problem === "";
    result.checks[`${gfx}Probes`] = gfx === "low" ? r.art.probes === null : (r.art.probes?.passes ?? 0) >= 2;
    result.checks[`${gfx}EveryProgramLinked`] = summary.programs > 5 && summary.notLinked === 0;
    result.checks[`${gfx}SamplersWithinWebGL2`] = summary.maxSamplers <= GUARANTEED.samplers;
    result.checks[`${gfx}UniformsWithinWebGL2`] = summary.maxUniformVectors <= GUARANTEED.uniformVectors;
    result.checks[`${gfx}TexturesWithinWebGL2`] = summary.max3D <= GUARANTEED.size3D && summary.maxLayers <= GUARANTEED.arrayLayers && summary.maxArraySide <= GUARANTEED.size2D;
    result.checks[`${gfx}NoConsoleErrors`] = r.errors.length === 0;
    // A lit room, not a black or blown-out picture.
    result.checks[`${gfx}RoomIsLit`] = r.brightness > 45 && r.brightness < 235;
  }
  // The probes in use at High (or the check above would pass for the wrong reason).
  result.checks.highUsesTheProbes = /tProbeA/.test(result.presets.high.worstSamplers) && result.presets.high.max3D > 0;

  // A GPU that can't build the probes' shaders: High comes up as Low, and says so.
  const f = await load("high", "tProbeA");
  result.fallback = { shown: f.art.shown, problem: f.art.problem, probes: f.art.probes, brightness: Math.round(f.brightness * 10) / 10, errors: f.errors };
  // And it looks as Low does (its own light and no sun shadows: not High's shadows without High's light).
  result.checks.fallbackLooksLikeLow = Math.abs(f.brightness - result.presets.low.brightness) < 0.08 * result.presets.low.brightness;
  result.checks.fallbackShowsLow = f.art.ready && f.art.shown && f.art.probes === null;
  result.checks.fallbackSaysSo = /High graphics didn't load on this device/i.test(f.art.problem);
  // Its own report of the failure is the only error.
  result.checks.fallbackOnlyReportsItself = f.errors.length > 0 && f.errors.every((e) => /art pass \(high\)|THREE\.WebGLProgram|Shader Error|VALIDATE_STATUS/.test(e));
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
}
result.guaranteed = GUARANTEED;
writeFileSync(join(OUT, "oregon-art.json"), JSON.stringify(result, null, 1) + "\n");
for (const [gfx, s] of Object.entries(result.presets))
  console.log(`oregon-art ${gfx}: ${s.programs} programs (${s.notLinked} not linked), at most ${s.maxSamplers} of ${GUARANTEED.samplers} samplers [${s.worstSamplers}], ${s.maxUniformVectors} uniform vectors, 3D textures to ${s.max3D}, ${s.maxLayers} layers`);
if (result.here) console.log(`  (this browser: ${result.here.renderer}, ${result.here.samplers} samplers a shader)`);
if (result.fallback) console.log(`  fallback: ${result.fallback.problem}`);
console.log(JSON.stringify({ ok, checks: result.checks, error: result.error }, null, 1));
process.exit(ok ? 0 : 1);
