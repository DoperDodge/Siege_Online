import { defineConfig } from "vitest/config";

export default defineConfig({
  // 60 s a test: the heaviest (five Oregon compiles; ten bodies colliding in two sims) take 11 s on an idle core and
  // passed 20 s on CI's runner, whose four test workers share fewer real cores (run 43571358557).
  test: { include: ["game/*/test/**/*.test.ts", "tools/netsim/**/*.test.ts", "tools/mapgen/**/*.test.ts", "tools/soak/**/*.test.ts"], testTimeout: 60000 },
});
