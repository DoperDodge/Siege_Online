import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["game/*/test/**/*.test.ts"], testTimeout: 20000 },
});
