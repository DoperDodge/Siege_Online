import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/ws": { target: "ws://localhost:8080", ws: true } } },
});
