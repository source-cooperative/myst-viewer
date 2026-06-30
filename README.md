# myst-viewer

A standalone Vite + React + TypeScript single-page app, deployed to GitHub
Pages, that fetches a MyST Markdown (`.md`) or Jupyter (`.ipynb`) document and
renders it as a themed article **styled to match source.coop**. Code cells
render statically; the reader can opt in to live, in-browser computation
(JupyterLite/Pyodide). source.coop embeds it as an iframe, matching its existing
external-viewer convention
(`https://source-cooperative.github.io/<viewer>/?iframe=true&url=<encoded object URL>`).

## Styling

The article reuses source.coop's design tokens directly via **Radix Themes**
(`<Theme accentColor="gray" grayColor="gray" radius="none" scaling="110%">`), so
it gets the same gray palette, square corners, and 110% scaling. The MyST output
(myst-to-react's semantic `myst-*` classes + plain elements) is styled in
`src/article.css` using Radix CSS variables — Radix Heading scale for headings,
gray underlined links, surface tables, an inline-code chip, and admonitions
colored by kind on Radix scales (note→blue, tip→green, warning→orange,
danger/error→red). Code is highlighted with a GitHub light/dark palette, and
dark mode is class-based (a `dark` class on `<html>` plus Radix `appearance`).

- **Body font:** IBM Plex Sans (via `@fontsource/ibm-plex-sans`, since this is a
  Vite app, not Next — `next/font` isn't available).
- **Code font:** source.coop uses the paid "Berkeley Mono"; we can't ship it, so
  the code font falls back to the system mono stack (`Menlo, Consolas,
  monospace`) — the same fallback source.coop lists after Berkeley Mono.
- No Tailwind build is wired in: myst-to-react's Tailwind utility classes are
  inert; the semantic/element CSS above provides the visible styling.

## URL parameters

The query string is the integration contract — keep it stable.

| Param    | Required | Value                                                                 |
| -------- | -------- | --------------------------------------------------------------------- |
| `url`    | yes      | Encoded absolute URL of the `.md`/`.ipynb` object to render.          |
| `iframe` | no       | `true` — convention flag marking an embedded view.                    |
| `theme`  | no       | `light` (default) or `dark`.                                          |
| `base`   | no       | Product base URL; when set, exposes `SOURCE_URL` to compute cells.    |

The iframe `src` source.coop uses:

```
https://source-cooperative.github.io/myst-viewer/?iframe=true&url=${encoded}&theme=${theme}
```

where `encoded = encodeURIComponent(objectUrl)`.

## Host message contract

The viewer measures its rendered height and posts it to the host so the iframe
can be sized to fit (no nested scrollbar):

```js
window.parent.postMessage({ type: "myst-viewer:height", height }, "*");
```

`height` is `document.documentElement.scrollHeight` in CSS pixels. It fires once
after content renders and again on every resize (`ResizeObserver`). targetOrigin
is `*` (height is non-sensitive).

## Live compute (opt-in)

Code cells are static until the reader clicks **Activate** — nothing boots on
load. Activate starts an in-browser JupyterLite/Pyodide kernel (via
`thebe-lite`); cells then gain a Run button and outputs render inline.

- numpy, pandas, and matplotlib are bundled in Pyodide. Other packages install
  at runtime with `%pip install`.
- Cells are run-only (Run + live outputs). Inline editing is a deferred
  follow-up.
- `input()` / synchronous stdin needs `SharedArrayBuffer` (isolation) and is out
  of scope.

The kernel bundles and Pyodide load outside the app JS bundle (vendored by
`scripts/copy-thebe.mjs`), so the Pages deploy stays independent of the kernel.

## Reading the product's own files

When embedded with `?base=<product base URL>`, the viewer prepends one visible,
runnable code cell at the top of the article:

```python
SOURCE_URL = "<base>"  # base URL of this product's files
```

Run it, then later cells can read sibling files (the kernel keeps state across
the session):

```python
import pandas as pd
df = pd.read_parquet(f"{SOURCE_URL}/data.parquet")
```

Public/unlisted products only. **Restricted products are not supported** — the
viewer is a cross-origin iframe with no `sc_proxy_creds` cookie, so
credentialed/presigned reads are a separate future design.

## Cross-origin isolation: not needed, do not add

The kernel runs header-less (`crossOriginIsolated === false`). Do **not** add
COOP/COEP headers or `coi-serviceworker`. Forcing isolation breaks compute:
thebe-lite then switches to a `SharedArrayBuffer` + service-worker path whose
worker 404s under the `/myst-viewer/` base and hangs. GitHub Pages serves
header-less — exactly the working path, nothing to configure.
`tests/compute-pages.spec.ts` proves the kernel boots and runs `print(1 + 1)`
on a non-isolated, Pages-like origin.

## Demos

`public/demos/` has ready-to-run examples (served by `pnpm dev`):

| File                   | Type          | Libraries                  |
| ---------------------- | ------------- | -------------------------- |
| `numpy-matplotlib.md`  | MyST Markdown | numpy, matplotlib          |
| `pandas-explore.ipynb` | Jupyter       | numpy, pandas              |
| `xarray-dataset.ipynb` | Jupyter       | xarray (`%pip install`), numpy |

With the dev server running:

```
http://localhost:5173/myst-viewer/?url=http://localhost:5173/myst-viewer/demos/numpy-matplotlib.md
```

Click **Activate**, wait for the kernel, then Run the cells.

## Develop, test, deploy

```
pnpm install
pnpm dev      # http://localhost:5173/myst-viewer/?url=<absolute url to a .md or .ipynb>
pnpm build    # vendors thebe via copy-thebe.mjs, then tsc -b && vite build
pnpm test     # vitest unit/component tests (src/); runs in CI
pnpm e2e      # Playwright live-compute smoke; boots a real kernel; NOT in CI
```

`copy-thebe.mjs` copies the thebe bundles into `public/thebe/` (gitignored,
~18MB) and is chained into `dev`/`build`. `pnpm e2e` is kept out of CI because a
cold Pyodide boot pulls tens of MB; run `pnpm build` first, then
`pnpm exec playwright install chromium` once.

Deploy is GitHub Pages on push to `main` via `.github/workflows/deploy.yml`
(runs `pnpm test` + `pnpm build`, uploads `dist/`).

## Out of scope / follow-ups

- Inline cell editing (cells are run-only today).
- Reading restricted-product data (needs credentialed/presigned access).
- Static rendering of saved `.ipynb` outputs.
- MyST projects: multi-page, cross-references, citations.
- The source.coop-side iframe dispatch that points products at this viewer
  (lives in the source.coop repo, not here).
