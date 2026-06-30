// Copies the prebuilt thebe-core / thebe-lite bundles into `public/thebe/` so
// they can be served as static assets at `${base}/thebe/…`. The thebe-react
// `ThebeBundleLoaderProvider` injects `<script src="${publicPath}/thebe-core.min.js">`
// (and thebe-lite.min.js) at runtime; those bundles then load their own webpack
// chunks (and a JupyterLite service worker) from the same path, so we copy the
// entire `dist/lib` tree, not just the entry files.
//
// Run automatically via the `predev` / `prebuild` npm scripts. The output is
// gitignored — it is ~18MB of vendored build artifacts that we never edit.
import { cp, mkdir, rm } from "node:fs/promises";
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
for (const src of sources) {
  await cp(src, out, { recursive: true });
}
console.log(`Copied thebe bundles -> ${out}`);
