// What the Destruction Lab adds to a lab page (Phase 4 M7): the explosive tools (T picks one, G sets it off
// on the panel you look at: its shape only, data/destruction.json `explosives`), Reset walls, and a readout
// of the selected tool and each team's reinforcements left.
import { encodeLabTool, explosiveReach, type ExplosiveData } from "@redmond/shared";
import type { LabApi } from "./common/lab.js";

export function destructionFeatures(lab: LabApi): void {
  const tools = Object.entries(lab.data.destruction.explosives) as [string, ExplosiveData][];
  let pick = 0;
  const describe = ([, ex]: [string, ExplosiveData]) =>
    `${ex.name}: ${ex.shape === "rect" ? `${ex.wM} × ${ex.hM} m` : `${ex.diameterM} m across`}${ex.hard ? ", cuts steel" : ""}${ex.shape === "rect" ? " (a charge: within 2 m)" : ""}`;

  const readout = document.createElement("div");
  readout.className = "hud destruction-readout";
  lab.app.append(readout);
  const draw = () => {
    const pools = lab.sim.deployRules.pools;
    const text = `Explosive (T / G): ${tools[pick][1].name} · reinforcements left: attackers ${pools[0]}, defenders ${pools[1]}`;
    if (readout.textContent !== text) readout.textContent = text;
  };

  const fire = (index: number) => {
    const body = lab.sim.pawns.get(lab.ctrl.possessedPawnId);
    if (!lab.net || !body) return;
    const [id, ex] = tools[index];
    lab.net.send(encodeLabTool({ kind: "explosive", id, yaw: body.state.yaw, pitch: body.state.pitch }));
    lab.flash(`${ex.name} (within ${explosiveReach(ex)} m of where you look)`, "info");
  };
  lab.onKey("KeyT", () => {
    pick = (pick + 1) % tools.length;
    lab.flash(describe(tools[pick]), "info");
    draw();
  });
  lab.onKey("KeyG", () => fire(pick));
  lab.addHelp("<kbd>T</kbd> / <kbd>G</kbd>", "Pick an explosive / set it off on the panel you look at (its cut only: no damage to anyone)");
  lab.addLabTool("Reset walls", () => lab.net?.send(encodeLabTool({ kind: "resetPanels" })));
  lab.onFrame(draw);
  draw();
}
