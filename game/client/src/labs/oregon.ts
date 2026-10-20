// Oregon greybox (Phase 5): the map compiled from data/maps/oregon/layout.json by tools/mapgen. M2 stacks every
// storey (B, 1F, 2F and the Cat Walk) with its rooms and callouts, soft floors and hatches; M3 joins them with the
// stairs and the Cat Walk ladder; the storey views
// (hide-above, the plan view, the palette), the HUD line with your room and plan position, and Go to by storey
// and room come from the lab (tools/mapgen/DESIGN.md E9). Offline the page runs a room of its own in a Web
// Worker, as the Destruction Lab does; `?online` / `?room=CODE` play it on the server. The destruction tools
// (reinforce, barricade, explosives) work here too.
import { loadGameData } from "@redmond/shared";
import { startLab } from "./common/lab.js";
import { destructionFeatures } from "./destructionFeatures.js";

const level = loadGameData().levels.get("oregon")!;
/** Metres from the plan's u (the level's plan.mPerU). */
const U = level.plan?.mPerU ?? 0.15;
const at = (name: string, x: number, y: number, yawDeg = 0): [string, number, number, number, number] => [name, x * U, 0, y * U, yawDeg];
/** With rooms compiled, the lab lists every room by storey; until then, hand-picked spots on 1F. */
const rooms = level.rooms.length > 0;

// Attacker insertion points straight from the compiled level, so the menu follows the data.
const spawns = level.spawns.filter((s) => s.side === "attack");

await startLab({
  levelId: "oregon",
  title: "Oregon (greybox)",
  page: "/labs/oregon.html",
  offline: "local",
  goTo: [
    at("Main Entrance (outside)", 253, 295),
    ...(rooms
      ? []
      : [
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
        ]),
    ...spawns.map((s): [string, number, number, number, number] => [`Attacker spawn ${s.group!.replace("_", " ")}`, s.pos[0], s.pos[1], s.pos[2], s.yawDeg]),
  ],
  help: {
    tryThis: [
      rooms
        ? "Go to (pause menu) lists every room by storey, under its callout, with the Main Entrance and the three attacker spawns (A Junkyard, B Street, C Construction) on 1F."
        : "The pause menu's Go to has the main rooms and the three attacker spawns (A Junkyard, B Street, C Construction).",
      "Walk each storey against the blueprint: every wall, door and window should be where it has them. Exterior doors and windows start barricaded; inside doors are empty frames you can barricade (hold F).",
      "Blue walls are the soft walls, labelled with their research ids (surfaces.md §2) and how many reinforcements they take (the dark seams split the sections); shoot, knife, reinforce or blow them open as in the Destruction Lab. Yellow floors are soft: shoot up through them from below. Green squares are hatches: break one and drop through.",
      "Take the stairs between storeys: the Tower, White and Armory Stairs run from the basement to 2F, and the Small Stairs from the Small Tower's corner up to 2F. The ladder in the 2F Tower goes up to the Cat Walk: face it, press F, and W climbs. To come down from the top, stand at the gap in the rail facing the drop and press F; S climbs down, W back up.",
      "Drone holes are slots at floor level. Windows have glass outside the barricade and a sill you can vault once it's open.",
      "The line at the bottom left says where you are: the room, the storey, and your position in the plan's units (u), first in the world frame (1F's drawing), then in your storey's own drawing (the frame its wall file uses). Quote it when you report something out of place.",
      "Press M for the plan view: your storey from above, north up, centred on you, with the room callouts; the wheel zooms. Hold it against the blueprint. You keep walking in it (W goes the way the arrow points); M again goes back.",
      "Press H to hide the storeys above yours (it follows you up and down), and P to switch between the surface colours and one light grey.",
      "Press F8 (or open the page with ?stats) for the frame-rate overlay: the target is 120 FPS on average and 90 at the 1% lows, at 1080p on High. The browser draws no faster than the display refreshes, so read the FPS on a display faster than 120 Hz (144 Hz or more). On a slower one, read the work instead: the page's own work each frame on the main thread (8.3 ms on average and 11.1 ms for the slowest 1% leave room for 120 and 90 FPS); it can't see the graphics card, so it says nothing about a frame the GPU holds up.",
    ],
    note: "Phase 5 milestone 3: the stairs and the ladder join every storey (B, 1F, 2F and the Cat Walk), so you can walk the building from the basement to the Cat Walk. The Bunker's stairs and the outside stairs come with the outside, after the roofs. The stairs' shapes and sizes are placeholders until you've walked them, like the rest: 1 u of the plan = 0.15 m, floors at −3.2, 0, 3.2 and 6.2 m, doors 2.1 m (research/OPEN_QUESTIONS.md).",
  },
  extend: destructionFeatures,
});
