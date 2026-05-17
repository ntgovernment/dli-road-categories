import { defineConfig } from "vite";

export default defineConfig({
  server: {
    open: "/Draft road categories _ NT.GOV.AU.html",
  },
  build: {
    lib: {
      entry: "./src/map.js",
      name: "RoadMap",
      formats: ["iife"],
      fileName: () => "road-map.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: "road-map.css",
      },
    },
  },
});
