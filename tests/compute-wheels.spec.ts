import { test, expect } from "@playwright/test";

// End-to-end proof that PEP 723 dependencies install as `pyemscripten_2025_0`
// cp313 wasm wheels from PyPI in the upgraded (Python 3.13 / Pyodide 0.29.x)
// kernel. `tests/fixtures/wheels.md` declares arro3-core + lonboard via a
// PEP 723 block; the viewer injects a `%pip install` cell, and the second cell
// imports them and prints `WHEELS_OK`. arro3-core and lonboard's transitive
// geoarrow-rust-core are compiled (Rust) packages with NO pure-Python wheel —
// so this only passes because (a) the kernel runs Python 3.13 and (b) the
// runtime is steered to Pyodide 0.29.4, where micropip matches the pyemscripten
// tag. On the old 0.4.7/Pyodide-0.27 stack this errored ("Can't find a pure
// Python 3 wheel").
//
// Hits PyPI over the network and downloads several MB of wheels, so it's slow
// and kept out of `pnpm test`/CI like the other compute e2e — run via `pnpm e2e`.

const ORIGIN = "http://localhost:4180";
const APP = `${ORIGIN}/myst-viewer/`;
const FIXTURE_URL = `${ORIGIN}/myst-viewer/__e2e__/wheels.md`;

test("PEP 723 compiled deps install as cp313 wasm wheels and import", async ({
  page,
}) => {
  await page.goto(`${APP}?url=${encodeURIComponent(FIXTURE_URL)}&run=true`);

  await expect(page.locator('[data-compute-status="ready"]')).toBeVisible({
    timeout: 150_000,
  });

  // `WHEELS_OK …` is only printed if `import arro3.core` and `import lonboard`
  // both succeed — i.e. the wasm wheels resolved and installed.
  await expect(page.getByText("WHEELS_OK", { exact: false })).toBeVisible({
    timeout: 180_000,
  });
});
