// Movement Lab (PLAN §7, Phase 1): a test yard for every movement mechanic, and since Phase 2 the online
// test page (`?online` creates a room, `?room=CODE` joins). The page itself is labs/common/lab.ts.
import { Btn, PawnMode, Stance } from "@redmond/shared";
import { startLab } from "./common/lab.js";

/** What the offline `?autotest` tour found (tools/e2e/movement-lab.mjs). */
const report = {
  walkSpeed: 0,
  sprintSpeed: 0,
  vaulted: false,
  windowCrossed: false,
  stancesSeen: [] as number[],
  maxLean: 0,
  towerTop: false,
  laddered: false,
  mantlePromptStandingStill: false,
  mantledWithoutMoving: false,
};

await startLab({
  levelId: "movement_lab",
  title: "Movement Lab",
  page: "/labs/movement_lab.html",
  goTo: [
    ["Spawn", 0, 0, 12, 0],
    ["Vault course", -6, 0, 10, 0],
    ["Window + doorway", 6, 0, 3, 0],
    ["Stairs + 3 m drop", 14, 0, 10, 0],
    ["Ladder tower", -16, 0, -4.5, 0],
    ["Crouch / prone tunnels", 20, 0, -4, 0],
    ["Ramps", -20, 0, 18, 0],
    ["Lean corner", 1, 0, -13, 0],
  ],
  help: {
    tryThis: [
      "Vault course: 0.5, 0.9 and 1.1 m vault-overs, a 1.3 m climb, and a 1.6 m block you can't vault.",
      "Vault through the open window; walk through the doorway.",
      "Crouch tunnel (1.45 m) and prone tunnel (0.75 m): you can't stand up inside.",
      "Lean at the corner and against walls — your head stops at the wall.",
      "Stairs to a 3 m platform (safe drop) and a 6.5 m ladder tower (lethal drop).",
      "Ramps: 15° and 40° walkable, 55° too steep. Press F4 while leaning to see your body bend.",
    ],
    note: "All speeds, heights and timings are placeholders from research until measured in-game (data/movement.json).",
  },
  autotest: {
    report,
    phases: [
      { ticks: 30, input: {} },
      { ticks: 64, input: { forward: 1 }, after: (p) => (report.walkSpeed = Math.hypot(p.state.vx, p.state.vz)) },
      { ticks: 64, input: { forward: 1, buttons: Btn.Sprint }, after: (p) => (report.sprintSpeed = Math.hypot(p.state.vx, p.state.vz)) },
      {
        ticks: 10,
        input: {},
        setup: (lab) => lab.sim.teleport(lab.ctrl.possessedPawnId, -6, 0, 3),
        after: (_p, lab) => (report.mantlePromptStandingStill = lab.sim.prompt(lab.ctrl.id) === "mantle"),
      },
      { ticks: 64, input: { buttons: Btn.Vault }, after: (p) => (report.mantledWithoutMoving = p.state.z < 1.8) },
      {
        ticks: 64,
        input: { forward: 1, buttons: Btn.Vault },
        setup: (lab) => lab.sim.teleport(lab.ctrl.possessedPawnId, 5, 0, 0.9),
        after: (p) => (report.windowCrossed = p.state.z < -0.4),
      },
      { ticks: 32, input: { stance: Stance.Crouch }, setup: (lab) => lab.sim.teleport(lab.ctrl.possessedPawnId, 0, 0, 12) }, // open ground: prone needs body room
      { ticks: 80, input: { stance: Stance.Prone } },
      { ticks: 80, input: { stance: Stance.Stand } },
      { ticks: 32, input: { lean: 1 } },
      { ticks: 32, input: { lean: -1 } },
      { ticks: 1, input: { buttons: Btn.Interact }, setup: (lab) => lab.sim.teleport(lab.ctrl.possessedPawnId, -16, 0, -5.8) },
      { ticks: 320, input: { forward: 1 }, after: (p) => (report.towerTop = p.state.y > 6.4 && p.state.mode === PawnMode.Walk) },
      { ticks: 20, input: { lean: 1, yawDeg: 160 } },
    ],
    observe: (p) => {
      const s = p.state;
      if (s.mode === PawnMode.Vault) report.vaulted = true;
      if (s.mode === PawnMode.Ladder) report.laddered = true;
      if (!report.stancesSeen.includes(s.stance)) report.stancesSeen.push(s.stance);
      report.maxLean = Math.max(report.maxLean, Math.abs(s.lean));
    },
  },
});
