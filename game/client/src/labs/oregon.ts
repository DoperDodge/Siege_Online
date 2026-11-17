// Oregon greybox (Phase 5): the map compiled from data/maps/oregon/layout.json by tools/mapgen. M2 stacks every
// storey (B, 1F, 2F and the Cat Walk) with its rooms and callouts, soft floors and hatches; M3 joins them with the
// stairs and the Cat Walk ladder; M4 adds the roofs, the outside and the attacker spawns; M5 the bomb sites,
// defenders, cameras, ingredients, furniture and zones, each drawn by the lab (render/mapMarkers.ts); the storey views
// (hide-above, the plan view, the palette), the HUD line with your room and plan position, and Go to by storey
// and room come from the lab (tools/mapgen/DESIGN.md E9). Offline the page runs a room of its own in a Web
// Worker, as the Destruction Lab does; `?online` / `?room=CODE` play it on the server. The destruction tools
// (reinforce, barricade, explosives) work here too.
import { loadGameData } from "@redmond/shared";
import { startLab } from "./common/lab.js";
import { destructionFeatures } from "./destructionFeatures.js";
import { navOverlay } from "./navOverlay.js";

// Project Redmond's own map (R2, D-183) by default; `?map=oregon` shows the old one while it's still here.
const MAP = new URLSearchParams(location.search).get("map") === "oregon" ? "oregon" : "millrace";
if (MAP === "millrace") document.title = "Millrace";
const level = loadGameData().levels.get(MAP)!;
/** Metres from the plan's u (the level's plan.mPerU). */
const U = level.plan?.mPerU ?? 0.15;
const at = (name: string, x: number, y: number, yawDeg = 0): [string, number, number, number, number] => [name, x * U, 0, y * U, yawDeg];
/** With rooms compiled, the lab lists every room by storey; until then, hand-picked spots on 1F. */
const rooms = level.rooms.length > 0;

// Attacker insertion points straight from the compiled level, so the menu follows the data: each group's first
// spot (its insertion point; the other four stand within 3 m of it).
const spawns = level.spawns.filter((s, i, all) => s.side === "attack" && all.findIndex((o) => o.group === s.group) === i);
/** A spawn group's name as people say it ("A_RIVERBANK": "A Riverbank"). */
const spawnName = (group: string) => group.replace(/_/g, " ").replace(/(?<=\w)(\w*)/g, (w) => w.toLowerCase());
const spawnNames = spawns.map((s) => spawnName(s.group!)).join(", ");

/** What to try on Millrace (the generic tools' lines are the same on both maps). */
const millraceHelp = [
  `Go to (pause menu) lists the four bomb sites first, then every room by storey, under its callout, and the three attacker spawns (${spawnNames}).`,
  "The bomb sites: Go to → Bomb sites puts you at a site's first defender spawn, facing between its two bombs (red cases, named Bomb 1A, 1B…): the Boiler Room and Coal Store in the boiler house's basement, the Spinning and Mending Rooms on the mill's 1F, the Dispatch Office and Bale Store in the office wing, the Drafting Room and Payroll above them.",
  "Take the stairs between storeys: the Main Stairs (basement to 2F, in the middle of the mill), the Office Stairs (Reception up to the Drafting Room), the Boiler Stairs (Boiler Room up into the Engine Room), the Gallery Stairs (the Loom Hall up to the Gallery) and the Millrace Steps (from the riverbank down into the dry millrace, at basement depth).",
  "Outside: Go to an attacker spawn and walk in: from the riverbank on the west, along the millrace or over its footbridge; from the rail siding on the north, past the loading platform; from the yard gate on the east, across the yard to the office wing and the boiler house. The tunnel joins the boiler house's basement to the mill's cellars.",
  "The roofs: the mill's long gable roof, the office wing's flat roof and the boiler house's are all walkable; rappel up to them (or to a window) from the ground.",
];
/** What to try on Oregon. */
const oregonHelp = [
  rooms
    ? "Go to (pause menu) lists the four bomb sites first, then every room by storey, under its callout, with the Main Entrance and the three attacker spawns (A Junkyard, B Street, C Construction)."
    : "The pause menu's Go to has the main rooms and the three attacker spawns (A Junkyard, B Street, C Construction).",
  "The bomb sites: Go to → Bomb sites puts you at a site's first defender spawn, facing between its two bombs (red cases, named Bomb 1A, 1B…).",
  "Take the stairs between storeys: the Tower, White and Armory Stairs run from the basement to 2F, and the Small Stairs from the Small Tower's corner up to 2F. The ladder in the 2F Tower goes up to the Cat Walk.",
];

await startLab({
  levelId: MAP,
  title: MAP === "millrace" ? "Millrace" : "Oregon (greybox)",
  page: "/labs/oregon.html",
  offline: "local",
  goTo: [
    ...(MAP === "oregon" ? [at("Main Entrance (outside)", 253, 295)] : []),
    ...(rooms || MAP !== "oregon"
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
    ...spawns.map((s): [string, number, number, number, number] => [`Attacker spawn ${spawnName(s.group!)}`, s.pos[0], s.pos[1], s.pos[2], s.yawDeg]),
  ],
  help: {
    tryThis: [
      ...(MAP === "millrace" ? millraceHelp : oregonHelp),
      "Press O for the zones: the rappel faces (orange, just outside every outside wall), the spawn-peek spots (green, inside the doors and windows that look at an attackers' spawn) and the run-outs.",
      "The furniture: bullets go through the wooden and soft pieces (tables, counters, crates) at ×0.7 each, and the metal ones (machines, cabinets) stop them.",
      "Exterior doors and windows start barricaded; inside doors are empty frames you can barricade (hold F). Blue walls are the soft walls, labelled with their ids and how many reinforcements they take (the dark seams split the sections); shoot, knife, reinforce or blow them open as in the Destruction Lab.",
      "Rappel (attackers in a match; anyone here): hold Space (the vault button on touch) at the foot of an outside wall facing it, at a roof edge facing out over it (you go over upside down), or inside at an open window.",
      "Press N for the free camera: fly through anything (WASD along the view, Space up, C down, Shift faster) while your body stays where it was; F puts your body on the floor under the camera (where a body fits), N takes you back.",
      "Drone holes are slots at floor level. Windows have glass outside the barricade and a sill you can vault once it's open.",
      "The line at the bottom left says where you are: the room, the storey, and your position.",
      "Press M for the plan view: your storey from above, north up, centred on you, with the room callouts; the wheel zooms. You keep walking in it (W goes the way the arrow points); M again goes back.",
      "Press H to hide the storeys above yours (it follows you up and down), and P to switch between the surface colours and one light grey.",
      "Press F6 for the bots' navigation grid round you: a dot wherever a body can stand (green; yellow where only crouched; blue on the stairs' slopes), and lines for the ways bots get between places other than walking.",
      "Press F8 (or open the page with ?stats) for the frame-rate overlay.",
    ],
    note: MAP === "millrace" ? "Project Redmond R2: Millrace, our own map. Tell us what's wrong: rooms, sightlines, ways in, anything that blocks." : "Oregon, kept until Millrace replaces it everywhere (R2).",
  },
  extend: (lab) => {
    destructionFeatures(lab);
    navOverlay(lab);
  },
});
