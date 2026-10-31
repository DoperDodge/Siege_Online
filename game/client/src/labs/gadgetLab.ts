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
    ["Metal detector", 8, 0, 17, 0],
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
      "A stun blinds whoever faces it (fully within 11 m) for 5 s, and rings ears within 8 m; a smoke grenade leaves a cloud 5 m across for 10 s that cameras, drones and pings can't see through; an Impact EMP turns the defenders' electronics (and their sights' zoom, cameras, drones and detonators) off within 2 m for 9 s.",
      "Barbed wire halves an attacker's speed and bites 5 a second while he moves; the deployable shield stops bullets, blasts, bodies and drones (a knife makes its glass opaque); the proximity alarm sounds while an attacker is within 3 m; the observation blocker hides what's behind it from the attackers' drones.",
      "The fire extinguisher (west door wall) bursts into smoke and concusses those close by; the gas pipe (window wall) throws a flame jet for 15 s, then goes off; the metal detector (open floor) beeps while someone walks through. Shoot them or blow them up; Clear gadgets puts them back.",
      "Refill ammo (pause menu) gives your gadgets back too; Clear gadgets takes every gadget out of the room; Reset walls puts them back.",
    ],
    note: "Phase 8 M3: every generic gadget in both pools does what it should, and the ingredients too. Every number is in data/gadgets.json and data/gadgets/; most are placeholders listed in research/OPEN_QUESTIONS.md.",
  },
  extend: gadgetFeatures,
});
