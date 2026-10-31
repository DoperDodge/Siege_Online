// A match on Oregon (Phase 6, match/DESIGN.md §11): the game client (labs/common/lab.ts) with `match` on, in a room
// the Play page (play.html) created or joined; the lobby, planning, HUD, scoreboard and summaries are matchFeatures.ts.
import { startLab } from "./common/lab.js";
import { matchFeatures } from "./matchFeatures.js";

await startLab({
  levelId: "oregon",
  title: "Match · Oregon",
  page: "/play.html",
  goTo: [],
  help: {
    tryThis: [
      "In the lobby, join a team and ready up; the host starts once both teams have their players (uneven teams are fine).",
      "Planning: pick an operator (one each per team, none banned), your weapons, and the site (defenders vote) or your spawn (attackers). An attacker takes the defuser.",
      "Prep: the defenders reinforce and barricade (hold F) and can't leave the building; the attackers wait at their spawn and may still change their pick.",
      "Action: attackers find the site, carry the defuser in and plant it (hold F in one of the site's rooms; G drops it). Defenders disable a planted defuser (hold F at it) before the fuse runs out. A side with nobody left up loses the round.",
      "Hold Tab for the scoreboard. Dead, you look through a teammate's eyes; click for the next.",
    ],
    note: "Phase 6: match flow. Timers, defuser rules and what each side sees are our placeholders where Siege's are unknown (research/OPEN_QUESTIONS.md).",
  },
  match: true,
  extend: matchFeatures,
});
