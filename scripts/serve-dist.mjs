// Minimal static file server for `dist/`, served under the `/myst-viewer/` base
// with NO COOP/COEP headers — i.e. it mimics GitHub Pages, which cannot set
// response headers. Used by tests/compute-pages.spec.ts to prove the opt-in
// kernel boots and runs on such a header-less (non-isolated) origin, exactly
// like the deploy. Not part of the app or CI.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist");
const fixtures = resolve(here, "..", "tests", "fixtures");
const BASE = "/myst-viewer/";
// e2e fixtures (real .ipynb files) served from tests/fixtures so they never
// deploy, and so the Pages-like spec fetches a real same-origin file.
const FIXTURE_PREFIX = `${BASE}__e2e__/`;
const port = Number(process.env.PORT ?? 4180);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ipynb": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  // Deliberately NO Cross-Origin-Opener-Policy / Embedder-Policy headers here.
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith(BASE)) {
    res.writeHead(404).end("not found");
    return;
  }
  // Serve e2e fixtures from tests/fixtures (not from dist, so they never deploy).
  let root = dist;
  let rel;
  if (pathname.startsWith(FIXTURE_PREFIX)) {
    root = fixtures;
    rel = pathname.slice(FIXTURE_PREFIX.length);
  } else {
    rel = pathname.slice(BASE.length);
    if (rel === "" || rel.endsWith("/")) rel = join(rel, "index.html");
  }
  const filePath = normalize(join(root, rel));
  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`serving dist/ (no COOP/COEP) at http://localhost:${port}${BASE}`);
});
