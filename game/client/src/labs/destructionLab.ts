// Destruction Lab (Phase 4): every destructible surface class to shoot, knife, reinforce, barricade and blow
// open. Offline the page runs a room of its own in a Web Worker (destruction is the server's side, exactly as
// online); `?online` / `?room=CODE` play it on the server, where everyone sees the same holes.
import { startLab } from "./common/lab.js";
import { destructionFeatures } from "./destructionFeatures.js";

await startLab({
  levelId: "destruction_lab",
  title: "Destruction Lab",
  page: "/labs/destruction_lab.html",
  offline: "local",
  goTo: [
    ["Start", 0, 0, 18, 0],
    ["Soft walls", -8, 0, -3, 0],
    ["Reinforceable walls", 6, 0, -3, 0],
    ["Doors and window", -6, 0, 9, 0],
    ["Platform (hatch, soft floor)", 12, 3, 9.8, 0],
    ["Under the platform", 12, 0, 8, 0],
    ["Oregon walls", -3, 0, -15, 0],
  ],
  help: {
    tryThis: [
      "Shoot the soft walls: every bullet makes a hole in each layer it passes; studs stop most guns (a shotgun cuts them up close), metal studs stop everything. A body behind a wall takes 70 % per wall.",
      "Hold F at a reinforceable wall section for 4.5 s to put steel up on your side (10 a team; a ? marks a placeholder). Then shoot it from the other side: the skins go, the steel stays. The Exothermic and Hard Breach Charges (T to pick, G to set off) cut steel; nothing else does.",
      "The doors: knife the barricade three times to break it, hold F at the empty door to barricade it (2 s), or at a standing one to pry it off (1 s). The window has glass and a barricade.",
      "The platform: shoot or knife the hatch open and drop through; reinforce it from above. The soft floor only ever opens for bullets and sight.",
      "The back row has five of Oregon's soft walls at their researched lengths and reinforcement sections.",
      "Reset walls in the pause menu puts every panel back and fills the reinforcement pools.",
    ],
    note: "Explosives here only cut their shapes; their gadgets, throws and damage come in Phase 8. Every size and count is in data/destruction.json; most are placeholders listed in research/OPEN_QUESTIONS.md.",
  },
  extend: destructionFeatures,
});
