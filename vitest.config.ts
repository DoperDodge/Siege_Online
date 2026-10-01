import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["game/*/test/**/*.test.ts", "tools/netsim/**/*.test.ts"], testTimeout: 20000 },
});
