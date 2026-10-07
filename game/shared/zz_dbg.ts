import { readFileSync } from "node:fs";
import { Sim } from "./src/index.js";
const d = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const variant of ["base", "noSnap", "noAutostep", "neither"]) {
  const sim = await Sim.create("movement_lab");
  const m = sim.data.movement;
  if (variant === "noSnap" || variant === "neither") sim.cc.disableSnapToGround();
  if (variant === "noAutostep" || variant === "neither") sim.cc.disableAutostep();
  const ctrl = sim.addPlayer("t", d.op);
  sim.setPawnState(ctrl.possessedPawnId, d.before);
  sim.step(new Map([[ctrl.id, d.input]]));
  const s = sim.pawns.get(ctrl.possessedPawnId)!.state;
  console.log(variant, JSON.stringify({ y: s.y, x: s.x, z: s.z }), "snap", m.step.snapToGround, "step", m.step.maxStepHeight);
}
