import { test, expect } from "@playwright/test";

// Deployment-representative check. scripts/serve-dist.mjs serves the built site
// from a plain static server under /myst-viewer/ with NO COOP/COEP headers —
// exactly like GitHub Pages, which cannot set response headers. This proves the
// opt-in kernel boots and runs there WITHOUT cross-origin isolation.
//
// (Finding: the thebe-lite JupyterLite/Pyodide kernel does not need isolation
// for execution. Forcing isolation — e.g. via coi-serviceworker — actually
// breaks it: thebe-lite then uses a SharedArrayBuffer + service-worker comms
// path whose worker 404s under the base path and hangs. So Pages works as-is.)
// Kept out of `pnpm test`/CI like the other e2e.

const ORIGIN = "http://localhost:4180";
const APP = `${ORIGIN}/myst-viewer/`;
// Real fixture served by serve-dist.mjs from tests/fixtures. print(1+1) with NO
// saved output, so "2" only appears once the live kernel runs it.
const FIXTURE_URL = `${ORIGIN}/myst-viewer/__e2e__/compute.ipynb`;

test("kernel boots and runs on a header-less (Pages-like) origin without isolation", async ({
  page,
}) => {
  await page.goto(`${APP}?url=${encodeURIComponent(FIXTURE_URL)}`);

  // A header-less origin is NOT cross-origin isolated — and that's fine.
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(false);

  await expect(page.getByText("Compute smoke test")).toBeVisible();
  const activate = page.getByRole("button", { name: "Activate" });
  await expect(activate).toBeVisible();

  await activate.click();

  await expect(page.locator('[data-compute-status="ready"]')).toBeVisible({
    timeout: 150_000,
  });

  const run = page.getByRole("button", { name: "Run cell" }).first();
  await expect(run).toBeVisible();
  await run.click();

  await expect(page.getByText("2", { exact: false })).toBeVisible({
    timeout: 60_000,
  });
});
