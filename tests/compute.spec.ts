import { test, expect } from "@playwright/test";

// A minimal notebook whose single code cell prints 2 — with NO saved outputs,
// so "2" only appears after the live kernel actually runs it. Served to the app
// via route interception (keeps the fixture in-test; nothing in public/).
const FIXTURE_IPYNB = JSON.stringify({
  cells: [
    {
      cell_type: "markdown",
      metadata: {},
      source: ["# Compute smoke test\n"],
    },
    {
      cell_type: "code",
      execution_count: null,
      metadata: {},
      outputs: [],
      source: ["print(1 + 1)\n"],
    },
  ],
  metadata: {
    kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
    language_info: { name: "python" },
  },
  nbformat: 4,
  nbformat_minor: 5,
});

// Same-origin URL the app will fetch; intercepted below so no real file is needed.
const FIXTURE_URL = "http://localhost:4173/myst-viewer/__e2e__/compute.ipynb";

test("Activate boots JupyterLite and runs a cell to produce live output", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  await page.route(FIXTURE_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: FIXTURE_IPYNB,
    }),
  );

  await page.goto(`/myst-viewer/?url=${encodeURIComponent(FIXTURE_URL)}`);

  // Static render first: the code is visible, no kernel, an Activate button.
  await expect(page.getByText("Compute smoke test")).toBeVisible();
  const activate = page.getByRole("button", { name: "Activate" });
  await expect(activate).toBeVisible();

  // Confirm the page is cross-origin isolated (COOP/COEP applied) — a
  // precondition for the Pyodide worker.
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

  // Opt in: this is the only point WASM/the kernel is allowed to boot.
  await activate.click();

  await expect(page.locator('[data-compute-status]')).toBeVisible();

  // Wait for the kernel to finish booting (cold Pyodide download is slow).
  await expect(page.locator('[data-compute-status="ready"]')).toBeVisible({
    timeout: 150_000,
  });

  // Once ready, each code cell gains a Run control.
  const run = page.getByRole("button", { name: "Run cell" }).first();
  await expect(run).toBeVisible();
  await run.click();

  // The live kernel's stdout (2) should render in the cell's output area.
  await expect(page.getByText("2", { exact: false })).toBeVisible({
    timeout: 60_000,
  });

  expect(
    consoleErrors.filter((e) => /Cannot render output|Unknown/i.test(e)),
  ).toEqual([]);
});
