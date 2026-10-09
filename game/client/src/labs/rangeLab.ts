// Range Lab (Phase 3 M10, DECISIONS D-052): a shooting range with scripted dummies, to try every weapon's
// damage, falloff, recoil and hit registration. Offline the page runs a room of its own in a Web Worker
// (so hits, downs and dummies work exactly as online); `?online` / `?room=CODE` play it on the server.
import { startLab } from "./common/lab.js";
import { rangeFeatures } from "./rangeFeatures.js";

await startLab({
  levelId: "range_lab",
  title: "Range Lab",
  page: "/labs/range_lab.html",
  offline: "local",
  goTo: [
    ["Firing line", 0, 0, 22, 0],
    ["Stance and lean row", -17, 0, 18, 0],
    ["Strafe track", 10, 0, 15, 0],
    ["Peek post", 18, 0, 16, 0],
    ["Close quarters", -20, 0, 21, 180],
    ["Revive pad", 12, 0, 24.5, 180],
    ["Wallbang wall", -8, 0, 16, 0],
  ],
  help: {
    tryThis: [
      "The distance lane: a dummy every 5 to 10 m out to 50 m, and posts at 13, 18 and 28 m where falloff starts and ends for many guns. The panel on the left shows the damage the server dealt and what the weapon data says for that range.",
      "Headshots kill at any range; arms and legs take less. Try every weapon and attachment from the pause menu: the loadout list shows the numbers (a ? marks a placeholder).",
      "The stance and lean row (standing, crouched, prone, leaning) and the peek post: a head that leans out from cover.",
      "The strafe track: lead a moving target. Press F2 to see where the server had it (green) and where you saw it (blue).",
      "Close quarters: the doorway and the knife (V). The revive pad: a downed teammate to pick up (hold F for 4 s).",
      "The soft wall: shoot the dummy behind it through the wall (70 % of the damage gets through) and watch the holes. The Destruction Lab has every kind of wall.",
    ],
    note: "Dummies come back 3 s after they die; Reset dummies in the pause menu brings them all back now. Offline, latency settings in the pause menu try lag compensation alone.",
  },
  extend: rangeFeatures,
});
