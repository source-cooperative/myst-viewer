import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves this site from `username.github.io/myst-viewer/`, so all
// asset URLs must be prefixed with the repo subpath.
export default defineConfig((_env) => ({
  base: "/myst-viewer/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
}));
