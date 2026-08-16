import { defineConfig } from "vite";

export default defineConfig({
  root: "src/",
  publicDir: "../assets/",
  base: "./",
  appType: "spa",
  server: {
    host: true,
    open: "/#/home",
  },
  preview: {
    open: "/#/home",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 550,
  },
});
