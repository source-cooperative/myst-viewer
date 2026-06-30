# myst-viewer

A small SPA that fetches a MyST Markdown (`.md`) or Jupyter (`.ipynb`) document
and renders it as a themed article. Code cells render **statically** by default;
the reader can opt in to live, in-browser computation.

```
pnpm install
pnpm dev          # http://localhost:5173/myst-viewer/?url=<absolute-url-to-a-.md-or-.ipynb>
```

The document to render is passed via `?url=`, e.g.
`/myst-viewer/?url=http://localhost:5173/myst-viewer/demos/pandas-explore.ipynb`.

## Live computation (opt-in)

Code cells are static (syntax-highlighted) until the reader clicks **Activate**.
That boots an in-browser JupyterLite (Pyodide/WASM) kernel via `thebe-lite`;
cells then become runnable and their outputs render inline. **WASM never boots on
page load** — only on the explicit Activate click.

### How it's wired

- The kernel UI/runtime is `@myst-theme/jupyter` (the glue that makes MyST
  `block[kind=notebook-code]` / `outputs` / `output` nodes executable) on top of
  `thebe-react` + `thebe-core` + `thebe-lite`.
- On Activate, `src/Activate.tsx` mounts the provider stack
  `ThebeBundleLoaderProvider → ThebeServerProvider → BusyScopeProvider →
  ExecuteScopeProvider`, and the article re-renders with
  `mergeRenderers([DEFAULT_RENDERERS, JUPYTER_RENDERERS])`. A small auto-starter
  waits for thebe-core + a connected JupyterLite server, then kicks the
  build → session pipeline (`useExecutionScope().start`).
- `thebe-core`/`thebe-lite` are large prebuilt bundles. `scripts/copy-thebe.mjs`
  copies them into `public/thebe/` (gitignored, ~18MB) on `predev`/`prebuild`;
  the loader injects `<script src="/myst-viewer/thebe/thebe-core.min.js">` at
  runtime. The bundles and Pyodide are **not** part of the app JS bundle, so the
  Pages deploy stays independent of the kernel.

### Cross-origin isolation: NOT needed (verified)

Pyodide runs the kernel in a Web Worker and `thebe-lite` pulls Pyodide from a
cross-origin CDN (`cdn.jsdelivr.net/pyodide/v0.27.0`). The intuitive assumption
is that this needs cross-origin isolation (`crossOriginIsolated === true`, which
gates `SharedArrayBuffer`). **It doesn't.** Measured on this stack:

| Origin | `crossOriginIsolated` | `print(1+1)` |
| --- | --- | --- |
| header-less static server (Pages-like) | `false` | **works (~5s)** |
| `vite preview` with COOP/COEP `credentialless` | `true` | works |
| header-less + `coi-serviceworker` (forced isolation) | `true` | **hangs** |

So the JupyterLite/Pyodide kernel executes fine with **no** COOP/COEP. Forcing
isolation is actively harmful here: thebe-lite then switches to a
`SharedArrayBuffer` + service-worker comms path that needs its own
`/service-worker.js`, which 404s under the `/myst-viewer/` base path and hangs.

**Consequences:**

- `vite.config.ts` sets **no** COOP/COEP headers — dev/preview behave exactly
  like the header-less GitHub Pages deploy. No `coi-serviceworker` is used.
- **GitHub Pages works as-is** — it serves header-less, which is the working
  (non-isolated) path. Nothing extra to configure.

`tests/compute-pages.spec.ts` is the deployment-representative proof: it serves
the built site from a plain static server (`scripts/serve-dist.mjs`, no headers,
mimicking Pages), asserts the page is **not** isolated, and still boots the
kernel and runs `print(1 + 1) → 2`.

Verified versions: `thebe-core`/`thebe-lite`/`thebe-react` `0.5.0`,
`@myst-theme/jupyter` `1.3.1`, Pyodide `0.27.0`.

> Note: `input()` and other synchronous-stdin features do need `SharedArrayBuffer`
> (isolation) and a working JupyterLite service worker; those are out of scope
> here. The boot surfaces a visible error + Retry after ~90s rather than hanging
> if the kernel ever fails to start.
>
> Known non-fatal warning: `thebe-lite` registers its own JupyterLite service
> worker at the origin root (`/service-worker.js`), which 404s under the
> `/myst-viewer/` base. That only disables filesystem/contents *sync* — code
> execution falls back to in-memory and is unaffected.

## Reading the product's own files

When embedded with `?base=<product base URL>`, the viewer prepends one visible,
runnable code cell at the top of the article:

```python
SOURCE_URL = "<base>"  # base URL of this product's files
```

Run it first, then later cells can read sibling files (the kernel keeps state
across the session):

```python
import pandas as pd
df = pd.read_parquet(f"{SOURCE_URL}/data.parquet")
```

This works for **public/unlisted** products only. **Restricted products are not
supported** — the viewer is a cross-origin iframe with no `sc_proxy_creds`
cookie, so credentialed/presigned URLs are a separate future design. Real
sibling-file reads are verified manually (the unit tests cover only the AST
assembly: that the `SOURCE_URL` cell is prepended with a unique key, and absent
without `?base=`).

## Demos

`public/demos/` has ready-to-run examples (served by `pnpm dev`/`pnpm preview`):

| File | Type | Libraries |
| --- | --- | --- |
| `numpy-matplotlib.md` | MyST Markdown | numpy, matplotlib |
| `pandas-explore.ipynb` | Jupyter | numpy, pandas (HTML tables) |
| `xarray-dataset.ipynb` | Jupyter | xarray (via `%pip install`), numpy |

View one (with the dev server running):

```
/myst-viewer/?url=http://localhost:5173/myst-viewer/demos/numpy-matplotlib.md
```

Click **Activate**, wait for "Python ready", then run the cells. (numpy/pandas/
matplotlib ship with Pyodide; xarray is installed at runtime with `%pip install`.)

## Tests

```
pnpm test     # vitest unit/component tests (src/), fast — no kernel boot
pnpm e2e      # Playwright live-compute smoke (boots a real kernel); run pnpm build first
```

`pnpm e2e` is intentionally **separate** from `pnpm test` and the deploy
workflow (a ~tens-of-MB Pyodide boot should not gate CI or Pages). Run
`pnpm build` first, then `pnpm e2e`, which runs two specs:

- `compute.spec.ts` — against `pnpm preview`: Activate, wait for the kernel, run
  a cell, assert the live `2`.
- `compute-pages.spec.ts` — against a header-less static server
  (`scripts/serve-dist.mjs`, mimicking Pages): asserts the page is **not**
  cross-origin isolated and the kernel still boots/runs `print(1+1) → 2`.

First run: `pnpm exec playwright install chromium`.
