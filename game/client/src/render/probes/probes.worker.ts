// A probe bake worker (render/DESIGN.md §6.3): holds the scene (probes/bake.ts) and bakes the ranges of probes the page
// asks for; the page hands it each pass's fields (for the next pass's bounce) and new boxes when a panel changes.
import { Baker, PROBE_STRIDE, type BakeScene } from "./bake.js";

type Msg =
  | { kind: "init"; scene: BakeScene }
  | { kind: "boxes"; boxes: Float32Array }
  | { kind: "fields"; fields: (Float32Array | null)[] }
  | { kind: "bake"; id: number; grid: number; probes: Int32Array };

let baker: Baker | null = null;

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.kind === "init") baker = new Baker(m.scene);
  else if (m.kind === "boxes") baker?.setBoxes(m.boxes);
  else if (m.kind === "fields") {
    if (baker) baker.fields = m.fields;
  } else if (m.kind === "bake" && baker) {
    // The probes asked for, in the order given.
    const out = new Float32Array(m.probes.length * PROBE_STRIDE);
    for (let i = 0; i < m.probes.length; i++) baker.bakeProbe(m.grid, m.probes[i], out, i * PROBE_STRIDE);
    (self as unknown as Worker).postMessage({ id: m.id, out }, [out.buffer]);
  }
};
