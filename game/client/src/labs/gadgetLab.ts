// Gadget Lab (Phase 8, gadgets/DESIGN.md §11): the Destruction Lab's walls to take every operator's gadgets to. Pick an
// operator and their gadgets in the pause menu (Striker and Sentry take any two of their side's). Offline the page runs
// a room of its own in a Web Worker (gadgets are the server's side, exactly as online); `?online` / `?room=CODE` play
// it on the server, where everyone sees the same gadgets.
import { startLab } from "./common/lab.js";
import { gadgetFeatures } from "./gadgetFeatures.js";

await startLab({
  levelId: "gadget_lab",
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
      "With a charge out, the detonator is in your hand: left mouse sets the oldest one off. A Hard Breach Charge goes off by itself 4 s after it's on. Hold F on your wire, shield, alarm or blocker to take it back.",
      "Blasts hurt the dummies: behind the soft wall (it gets through), behind the steel (it doesn't), behind the barricaded door and in the open. They cut soft walls, open the hatch, leave see-through holes in the soft floor, break barricades and destroy gadgets close by.",
      "A Claymore goes off when a defender crosses one of its three lasers, 1 s after it's down: switch to the defenders (pause menu) and walk into one. One bullet destroys a charge, a Claymore, a Nitro Cell, an alarm or a blocker without a blast.",
      "Refill ammo (pause menu) gives your gadgets back too; Clear gadgets takes every gadget out of the room; Reset walls puts them back.",
    ],
    note: "Phase 8 M2: the frag, the impact grenade, the Breach and Hard Breach Charges, the Nitro Cell and the Claymore blow up. Smoke, stuns, EMPs, wire and shields come next (M3). Every number is in data/gadgets.json and data/gadgets/; most are placeholders listed in research/OPEN_QUESTIONS.md.",
  },
  extend: gadgetFeatures,
});
