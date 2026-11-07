// What the Gadget Lab adds to a lab page (Phase 8, gadgets/DESIGN.md §11): refilling and clearing gadgets, resetting
// the walls, and a readout of what's in your slots and how many gadgets are out in the room.
import { encodeLabTool } from "@redmond/shared";
import type { LabApi } from "./common/lab.js";

export function gadgetFeatures(lab: LabApi): void {
  const readout = document.createElement("div");
  readout.className = "hud destruction-readout";
  lab.app.append(readout);
  const draw = () => {
    const out = lab.sim.gadgets.list.length;
    const text = `Gadgets out in the room: ${out} · pause menu: Refill ammo (and gadgets), Clear gadgets, Reset walls`;
    if (readout.textContent !== text) readout.textContent = text;
  };
  lab.addLabTool("Clear gadgets", () => lab.net?.send(encodeLabTool({ kind: "clearGadgets" })));
  lab.addLabTool("Reset walls", () => lab.net?.send(encodeLabTool({ kind: "resetPanels" })));
  lab.onFrame(draw);
  draw();
}
