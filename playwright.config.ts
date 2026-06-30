import { defineConfig, devices } from "@playwright/test";

// Standalone e2e config for the live-compute smoke test. Intentionally NOT
// wired into `pnpm test` or deploy.yml — booting JupyterLite/Pyodide pulls tens
// of MB and takes ~tens of seconds, so this stays a separate, on-demand check
// (`pnpm e2e`). Build first (`pnpm build`) so serve-dist.mjs has a dist to serve.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  // Booting the in-browser kernel can take a while on a cold Pyodide download.
  timeout: 180_000,
  expect: { timeout: 120_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4180",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // Header-less static server mimicking GitHub Pages — NO COOP/COEP. Proves
      // the kernel boots/runs on a non-isolated origin (compute-pages.spec.ts).
      // Requires `pnpm build` first so dist/ exists.
      command: "node scripts/serve-dist.mjs",
      url: "http://localhost:4180/myst-viewer/",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
