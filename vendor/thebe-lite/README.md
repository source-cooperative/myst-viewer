# Vendored `thebe-lite` (patched for Python 3.13 / Pyodide 0.29.x)

`lib/` is a **rebuilt `thebe-lite` bundle** that ships `@jupyterlite/pyodide-kernel`
**0.7.2** (Pyodide 0.29.x, Python 3.13, `pyemscripten_2025_0` ABI) instead of the
**0.4.7** (Pyodide 0.27, Python 3.12) baked into the published `thebe-lite@0.5.0`.

## Why

The in-browser kernel must run **Python 3.13** so `micropip` can install the
`pyemscripten_2025_0` cp313 wasm wheels now on PyPI (arro3-core,
geoarrow-rust-core, …). The kernel's worker JS and the Pyodide runtime must move
in lockstep — pointing 0.4.7's worker at Pyodide 0.29 fails at result
serialization (`TypeError: e.forEach is not a function` in `formatResult`). So
the bundle itself has to be rebuilt against the newer kernel; a runtime
`pyodideUrl` override alone is not enough.

`scripts/copy-thebe.mjs` copies `lib/` into `public/thebe/` at build time (in
place of `node_modules/thebe-lite/dist/lib`). `src/Activate.tsx` then steers the
runtime to Pyodide **0.29.4** (the release where micropip learned to match the
`pyemscripten` tag) via the `customConnectFn` `litePluginSettings` override.

## How `lib/` was produced

Built from [`jupyter-book/thebe`](https://github.com/jupyter-book/thebe) with
three edits, then `packages/lite` rebuilt (webpack 5), and `dist/lib` copied here
minus `*.map`:

1. `packages/lite/package.json` — `@jupyterlite/pyodide-kernel` and
   `@jupyterlite/pyodide-kernel-extension`: `0.4.7` → `0.7.2`.
2. `packages/lite/src/jlite.ts` — hard-coded `@0.4.7` piplite URLs → `0.7.2`
   (wheel `piplite-0.7.2-py3-none-any.whl`).
3. `packages/lite/webpack.config.cjs` — give `resourceQuery:/text/` assets a
   `[contenthash]` filename. The 0.7.x graph pulls in `@jupyterlite/apputils`,
   which imports a second `service-worker?text`; without unique names webpack
   errors "Multiple chunks emit assets to the same filename service-worker.js".

Build: `npm install` at the thebe repo root, then `npm run build` in
`packages/lite` (Node 20).

## Replacing this

Delete `vendor/thebe-lite`, point `copy-thebe.mjs` back at
`node_modules/thebe-lite/dist/lib`, and drop the `customConnectFn` override in
`Activate.tsx` once an upstream `thebe-lite` release bundles a Python 3.13 kernel
(none exists as of this writing; `jupyter-book/thebe` main still pins 0.4.7).
