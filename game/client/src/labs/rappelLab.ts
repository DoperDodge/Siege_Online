// Rappel Lab (Project Redmond R4.1): a yard with every kind of face a rope hangs on, to try the rappel rules on
// (research/core_mechanics.md §6; data/maps/rappel_lab). Offline the page runs a room of its own in a Web Worker, so
// a swing into a window breaks its glass and kicks its barricade as a server does; `?online` / `?room=CODE` play it
// on the server.
import { startLab } from "./common/lab.js";

await startLab({
  levelId: "rappel_lab",
  title: "Rappel Lab",
  page: "/labs/rappel_lab.html",
  offline: "local",
  goTo: [
    ["Start", 0, 0, 20, 0],
    ["Tower: north face", -1, 0, -10.6, 180],
    ["Tower: 2F window, inside", 1.15, 3.2, -9.4, 0],
    ["Tower: barricaded door", 0, 0, -4.4, 0],
    ["Step House: east wall", 16.6, 0, -7, 90],
    ["Ledge House: roof edge", -14, 6.2, -9.35, 0],
    ["Ledge House: 2F windows, inside", -19, 3.2, -9.1, 0],
    ["Annex roof", -19, 3.2, -10.6, 180],
    ["Balcony", -15, 3.2, -2.7, 180],
    ["Under the balcony", -15, 0, -1.4, 0],
    ["Eave House: south wall", 13, 0, 10.6, 0],
  ],
  help: {
    tryThis: [
      "At a wall's foot, facing it, hold Space (the vault key) to hook on. W climbs, S goes down (sprint: faster), A and D move along the wall, the crouch key turns you upside down and back, and F lets go.",
      "On a roof edge, facing out over it, hold Space to go over the edge onto the rope upside down: the Ledge House's roof, or the balcony over its railing.",
      "On the rope at a window, Space swings you into it: the glass breaks, a fresh barricade bounces you off with a kick, a worn one gives way. Through an open window you climb straight in.",
      "From inside, an open window takes you out onto the rope (the Tower's 2F, with nothing under it), or a tap of Space vaults you out where there's a roof to land on (the Ledge House's window over the Annex).",
      "Climb to a face's top and you go over onto the roof: the Step House's two walls 8 cm apart, the Eave House's roof hanging over its wall, the railing onto the balcony. Not where something taller than a vault stands behind the edge: the Tower's gable, the Ledge House's set-back storey.",
      "Lethal damage on the rope kills outright. In a match only the attackers rappel; here anyone can.",
    ],
    note: "Every speed, reach and time is in data/movement.json (rappel). The yard's sizes are lab choices.",
  },
});
