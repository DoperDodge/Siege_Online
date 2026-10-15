import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["game/*/test/**/*.test.ts", "tools/netsim/**/*.test.ts", "tools/mapgen/**/*.test.ts"], testTimeout: 20000 },
});
