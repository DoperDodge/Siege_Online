// Gadget Lab (Phase 8, gadgets/DESIGN.md §11): the Destruction Lab's walls to take every operator's gadgets to. Pick an
// operator and their gadgets in the pause menu (Striker and Sentry take any two of their side's). Offline the page runs
// a room of its own in a Web Worker (gadgets are the server's side, exactly as online); `?online` / `?room=CODE` play
// it on the server, where everyone sees the same gadgets.
import { startLab } from "./common/lab.js";
import { gadgetFeatures } from "./gadgetFeatures.js";

await startLab({
  levelId: "destruction_lab",
  title: "Gadget Lab",
  page: "/labs/gadget_lab.html",
  offline: "local",
  goTo: [
    ["Start", 0, 0, 18, 0],
    ["Soft walls", -8, 0, -3, 0],
    ["Reinforceable walls", 6, 0, -3, 0],
    ["Doors and window", -6, 0, 9, 0],
    ["Platform (hatch, soft floor)", 12, 3, 9.8, 0],
    ["Open floor", 3, 0, 14, 0],
  ],
  help: {
    tryThis: [
      "Pick an operator and their gadget in the pause menu (Esc): Striker and Sentry take any two different gadgets of their side's.",
      "Press 3 (Z: Striker's and Sentry's second gadget) to take it out, and again to put it away; 1 or 2 bring a weapon back.",
      "Grenades: left mouse throws, right mouse lobs. A frag bounces and goes off 4 s after the throw (2 s after its first bounce); an impact grenade goes off where it hits.",
      "Charges, the Claymore, wire, shields, cameras: hold left mouse where the green outline shows. A Breach Charge goes on a soft wall, floor, hatch or barricade; a Hard Breach Charge on steel too; the Nitro Cell sticks where it's thrown.",
      "With a charge out, the detonator is in your hand: left mouse sets the oldest one off. Hold F on your wire, shield, alarm or blocker to take it back.",
      "Refill ammo (pause menu) gives your gadgets back too; Clear gadgets takes every gadget out of the room.",
    ],
    note: "Phase 8 M1: gadgets go where they should and fly as they should, but don't do anything yet (blasts, smoke, stuns and EMPs come next). Every number is in data/gadgets.json and data/gadgets/; most are placeholders listed in research/OPEN_QUESTIONS.md.",
  },
  extend: gadgetFeatures,
});
