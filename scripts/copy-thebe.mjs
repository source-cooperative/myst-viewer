// Copies the prebuilt thebe-core / thebe-lite bundles into `public/thebe/` so
// they can be served as static assets at `${base}/thebe/…`. The thebe-react
// `ThebeBundleLoaderProvider` injects `<script src="${publicPath}/thebe-core.min.js">`
// (and thebe-lite.min.js) at runtime; those bundles then load their own webpack
// chunks (and a JupyterLite service worker) from the same path, so we copy the
// entire `dist/lib` tree, not just the entry files.
//
// Chained explicitly into the `dev` and `build` scripts (NOT a pre/post
// lifecycle hook, which `enable-pre-post-scripts=false` would silently skip,
// shipping a site whose runtime `<script src=".../thebe/…">` 404s). The output
// is gitignored — it is ~18MB of vendored build artifacts that we never edit.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = resolve(root, "public/thebe");

const sources = [
  resolve(root, "node_modules/thebe-core/dist/lib"),
  resolve(root, "node_modules/thebe-lite/dist/lib"),
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// Both packages flatten into the same out dir (the loader injects
// thebe-core.min.js / thebe-lite.min.js from one publicPath). Their webpack
// chunk filenames are numeric and could in principle collide on an upgrade;
// they've shipped disjoint names so far. If a future bump overwrites a chunk,
// split them into separate subdirs + publicPaths.
for (const src of sources) {
  await cp(src, out, { recursive: true });
}

// Vendor the ipywidgets wheel chain so the runtime `%pip install` (see
// src/Activate.tsx, which references these exact filenames) is served
// same-origin instead of making ~8 PyPI round-trips per activation.
// widgetsnbextension is NOT vendored: the pyodide-kernel piplite index already
// provides a local stub for it. Pinned; upgrade = replace the URLs here and
// the filenames in Activate.tsx. Downloads are cached under node_modules/.cache
// so repeat dev/build runs are offline-safe.
const WHEELS = [
  "https://files.pythonhosted.org/packages/56/6d/0d9848617b9f753b87f214f1c682592f7ca42de085f564352f10f0843026/ipywidgets-8.1.8-py3-none-any.whl",
  "https://files.pythonhosted.org/packages/ab/b5/36c712098e6191d1b4e349304ef73a8d06aed77e56ceaac8c0a306c7bda1/jupyterlab_widgets-3.0.16-py3-none-any.whl",
];
const cache = resolve(root, "node_modules/.cache/myst-viewer-wheels");
const pypi = resolve(out, "pypi");
await mkdir(cache, { recursive: true });
await mkdir(pypi, { recursive: true });
for (const url of WHEELS) {
  const name = url.split("/").pop();
  const cached = resolve(cache, name);
  if (!existsSync(cached)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetching ${url} failed: ${res.status}`);
    await writeFile(cached, Buffer.from(await res.arrayBuffer()));
  }
  await cp(cached, resolve(pypi, name));
}
console.log(`Copied thebe bundles + ${WHEELS.length} vendored wheels -> ${out}`);
