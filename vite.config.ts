import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// JupyterLite/Pyodide (booted on demand via thebe-lite) runs the kernel in a
// web worker and pulls Pyodide from a cross-origin CDN (cdn.jsdelivr.net). To
// allow that under cross-origin isolation we set COOP/COEP on every dev/preview
// response. COEP is `credentialless` rather than `require-corp`: the jsDelivr
// CDN does not send `Cross-Origin-Resource-Policy`, so `require-corp` would
// block the Pyodide download, whereas `credentialless` loads the cross-origin
// (no-credentials) resource without requiring that header. See README "Live
// computation".
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

// GitHub Pages serves this site from `username.github.io/myst-viewer/`, so all
// asset URLs must be prefixed with the repo subpath.
export default defineConfig((_env) => ({
  base: "/myst-viewer/",
  plugins: [react()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // Keep vitest to the unit tests in src/. The Playwright e2e under tests/
    // (compute.spec.ts) is run separately via `pnpm e2e`, never `pnpm test`.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
}));
