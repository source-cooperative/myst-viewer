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

### Cross-origin isolation finding (the local boot spike)

Pyodide runs the kernel in a Web Worker and `thebe-lite` pulls Pyodide from a
**cross-origin CDN** (`cdn.jsdelivr.net/pyodide/v0.27.0`). Cross-origin
isolation (`crossOriginIsolated === true`) is required. `vite.config.ts` sets,
on **both** the dev `server` and `preview`:

```
Cross-Origin-Opener-Policy:   same-origin
Cross-Origin-Embedder-Policy: credentialless
```

`credentialless` (not `require-corp`) is deliberate: jsDelivr does not send a
`Cross-Origin-Resource-Policy` header, so `require-corp` would block the Pyodide
download, whereas `credentialless` loads the cross-origin (no-credentials)
resource without requiring CORP. With these two headers the kernel boots and
runs `print(1 + 1) → 2` locally; **no `coi-serviceworker` is needed.** Verified
versions: `thebe-core`/`thebe-lite`/`thebe-react` `0.5.0`, `@myst-theme/jupyter`
`1.3.1`, Pyodide `0.27.0`.

> Note: `credentialless` is a Chromium/Firefox feature (not Safari). On GitHub
> Pages, set the equivalent COOP/COEP response headers for the kernel to boot.
>
> Known non-fatal warning: `thebe-lite` registers its JupyterLite service worker
> at the origin root (`/service-worker.js`), which 404s under the `/myst-viewer/`
> base. That only disables filesystem/contents *sync* — code execution falls back
> to in-memory and is unaffected.

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
workflow: it serves `pnpm preview`, loads a fixture `.ipynb`, clicks Activate,
waits for the kernel, runs a cell, and asserts the live output — a ~tens-of-MB
Pyodide boot that should not gate CI or Pages. First run:
`pnpm exec playwright install chromium`.
