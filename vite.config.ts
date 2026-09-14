import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 700 },
  server: { open: true },
});
