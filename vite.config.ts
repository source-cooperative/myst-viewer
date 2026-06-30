import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// NOTE: We deliberately do NOT set COOP/COEP cross-origin-isolation headers.
// The thebe-lite JupyterLite (Pyodide) kernel runs fine WITHOUT isolation
// (verified: print(1+1) → 2 with crossOriginIsolated === false). Worse, with
// isolation thebe-lite routes to a SharedArrayBuffer + service-worker comms path
// whose worker (`/service-worker.js`) 404s under the `/myst-viewer/` base and
// hangs. Staying non-isolated keeps dev/preview behaving exactly like the
// header-less GitHub Pages deploy. See README "Live computation".

// GitHub Pages serves this site from `username.github.io/myst-viewer/`, so all
// asset URLs must be prefixed with the repo subpath.
export default defineConfig((_env) => ({
  base: "/myst-viewer/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // Keep vitest to the unit tests in src/. The Playwright e2e under tests/
    // (compute.spec.ts) is run separately via `pnpm e2e`, never `pnpm test`.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
}));
