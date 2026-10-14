// Oregon greybox (Phase 5): the map compiled from data/maps/oregon/layout.json by tools/mapgen. M1 builds 1F
// only: every wall, door and window frame, the 17 soft walls with their sections, barricaded exterior
// openings and drone holes, on open ground with the three attacker insertion points. Offline the page runs
// a room of its own in a Web Worker, as the Destruction Lab does; `?online` / `?room=CODE` play it on the
// server. The destruction tools (reinforce, barricade, explosives) work here too.
import { loadGameData } from "@redmond/shared";
import { startLab } from "./common/lab.js";
import { destructionFeatures } from "./destructionFeatures.js";

/** Metres from the plan's u (layout.json units.mPerU). */
const U = 0.15;
const at = (name: string, x: number, y: number, yawDeg = 0): [string, number, number, number, number] => [name, x * U, 0, y * U, yawDeg];

// Attacker insertion points straight from the compiled level, so the menu follows the data.
const spawns = loadGameData().levels.get("oregon")!.spawns.filter((s) => s.side === "attack");

await startLab({
  levelId: "oregon",
  title: "Oregon (greybox)",
  page: "/labs/oregon.html",
  offline: "local",
  goTo: [
    at("Main Entrance (outside)", 253, 295),
    at("1F Lobby", 265, 262),
    at("1F Classroom", 230, 254),
    at("1F Garage", 312, 234),
    at("1F Kitchen", 175.6, 182.7),
    at("1F Dining Hall", 100.4, 179.5),
    at("1F Meeting Hall", 253, 153),
    at("1F Kitchen Corridor", 220, 128),
    at("1F Big Tower", 265, 85),
    at("1F Small Tower", 15, 230),
    at("1F Showers", 92, 231),
    at("1F Security", 168, 220),
    ...spawns.map((s): [string, number, number, number, number] => [`Attacker spawn ${s.group!.replace("_", " ")}`, s.pos[0], s.pos[1], s.pos[2], s.yawDeg]),
  ],
  help: {
    tryThis: [
      "Walk the first floor: every wall, door and window should be where the blueprint has it. Exterior doors and windows start barricaded; inside doors are empty frames you can barricade (hold F).",
      "Blue walls are the 17 soft walls of 1F, labelled with their research ids (surfaces.md §2) and how many reinforcements they take (the dark seams split the sections); shoot, knife, reinforce or blow them open as in the Destruction Lab.",
      "Drone holes are slots at floor level in six walls. Windows have glass outside the barricade and a sill you can vault once it's open.",
      "The pause menu's Go to has the main rooms and the three attacker spawns (A Junkyard, B Street, C Construction).",
      "Press F8 (or open the page with ?stats) for the frame-rate overlay: the target is 120 FPS on average and 90 at the 1% lows, at 1080p on High. The browser draws no faster than the display refreshes, so read the FPS on a 120 Hz or faster display; on a 60 Hz one, the work time (8.3 ms or less a frame for 120 FPS) shows the headroom.",
    ],
    note: "Phase 5 milestone 1: only 1F is built. Storeys, stairs, roofs and the outside come next. Sizes are placeholders until you've walked it: 1 u of the plan = 0.15 m, walls 3 m, doors 2.1 m (research/OPEN_QUESTIONS.md).",
  },
  extend: destructionFeatures,
});
