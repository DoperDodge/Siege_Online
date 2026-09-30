import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000, // Rapier's WASM is inlined in the -compat build (see DECISIONS D-020)
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        movement_lab: resolve(import.meta.dirname, "labs/movement_lab.html"),
      },
    },
  },
  server: { port: 5173 },
});
