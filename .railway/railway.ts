// Railway Infrastructure as Code for Project REDMOND (PLAN.md §3). Apply with the Railway CLI:
//   railway config plan   → review → railway config apply
// Railway does NOT read this file during deploys; it only sets the service's settings. (railway.json /
// railway.toml "Config as Code" is deprecated and stops being read on 2026-12-01.)
import { defineRailway, github, project, service } from "railway/iac";

// Closest Railway region to the players (https://docs.railway.com/deployments/regions):
//   "us-west2" (California) | "us-east4-eqdc4a" (Virginia) | "europe-west4-drams3a" (Amsterdam) | "asia-southeast1-eqsg3a" (Singapore)
const REGION = "us-east4-eqdc4a"; // the owner picks; see PROGRESS.md

export default defineRailway(() => {
  const game = service("game", {
    // checkSuites = "Wait for CI": deploy a main commit only after .github/workflows/ci.yml passes on it.
    source: github("DoperDodge/Siege_Online", { branch: "main", checkSuites: true }),
    build: {
      builder: "RAILPACK",
      buildCommand: "npm run build",
      // Only redeploy when something the running game uses changes (docs/research pushes don't restart matches).
      watchPatterns: ["game/**", "data/**", "package.json", "package-lock.json"],
    },
    // Run node directly (not `npm start`): npm does not forward SIGTERM to the game process, which then
    // can't tell players the server is restarting.
    start: "node game/server/dist/main.js",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    // Match rooms live in this process's memory and Railway has no sticky sessions: exactly ONE replica.
    replicas: { [REGION]: 1 },
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      sleepApplication: false,
      overlapSeconds: 0,
      drainingSeconds: 15,
    },
    env: {
      RAILPACK_NODE_VERSION: "24", // wins over package.json engines (which would resolve to Node 26.x); no .nvmrc/.node-version
      RAILPACK_NODE_NPM_INSTALL: "npm ci", // Railpack defaults to `npm install`
      RAILPACK_PRUNE_DEPS: "true", // drop devDependencies from the runtime image after the build (183 MB → ~46 MB)
      CLIENT_IP_HEADER: "x-real-ip", // Railway's edge puts the player's address here (per-address limits, D-034)
    },
  });

  return project("redmond", { resources: [game] });
});
