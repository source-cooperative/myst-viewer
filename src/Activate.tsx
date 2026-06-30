import { useEffect, useMemo, useRef } from "react";
import type { PropsWithChildren } from "react";
import {
  ThebeBundleLoaderProvider,
  ThebeServerProvider,
  useThebeServer,
  useThebeLoader,
} from "thebe-react";
import {
  BusyScopeProvider,
  ExecuteScopeProvider,
  JUPYTER_RENDERERS,
  useExecutionScope,
} from "@myst-theme/jupyter";
import { DEFAULT_RENDERERS } from "myst-to-react";
import { mergeRenderers } from "@myst-theme/providers";
import { SourceFileKind } from "myst-spec-ext";
import type { MystRoot } from "./parse";

// thebe-core / thebe-lite bundles are vendored into `public/thebe/` (see
// scripts/copy-thebe.mjs) and served at `${base}thebe`. The loader injects
// `<script src="${publicPath}/thebe-core.min.js">`, so this must point at that
// directory. BASE_URL is "/myst-viewer/" in prod and "/" in some test setups.
const THEBE_PUBLIC_PATH = `${import.meta.env.BASE_URL}thebe`;

// A single in-browser JupyterLite (Pyodide) kernel, no Binder/remote server.
const THEBE_OPTIONS = {
  useJupyterLite: true,
  kernelOptions: { kernelName: "python", name: "python" },
  // Each Activate is a fresh kernel — don't try to restore a saved session.
  savedSessionOptions: { enabled: false },
};

// This viewer renders exactly one document, so a single fixed scope slug is all
// the execute-scope state machine needs.
const SLUG = "viewer";

// Static-by-default renderers extended with the Jupyter ones (`block[kind=
// notebook-code]`, `outputs`, `output`, …). Only used once compute is active —
// these renderers call execute-scope hooks that REQUIRE the providers below.
export const COMPUTE_RENDERERS = mergeRenderers([
  DEFAULT_RENDERERS,
  JUPYTER_RENDERERS,
]);

/** True if the AST has any executable code cell (`.md` or `.ipynb`). */
export function hasComputeCells(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false;
  for (const node of nodes as Array<{ type?: string; kind?: string; children?: unknown }>) {
    if (node?.type === "block" && node?.kind === "notebook-code") return true;
    if (hasComputeCells(node?.children)) return true;
  }
  return false;
}

/**
 * The Activate button. Rendered before compute is switched on; clicking it
 * mounts the thebe-lite provider stack (which boots the kernel). We never boot
 * WASM on load — only here, on an explicit click.
 */
export function Activate({ onActivate }: { onActivate: () => void }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className="myst-viewer-activate"
      style={{
        margin: "1rem 0",
        padding: "0.5rem 1rem",
        fontSize: "1rem",
        cursor: "pointer",
        borderRadius: "0.375rem",
        border: "1px solid #2563eb",
        background: "#2563eb",
        color: "white",
      }}
    >
      Activate
    </button>
  );
}

/**
 * Kicks the build → session pipeline, but ONLY once thebe-core is loaded and the
 * JupyterLite server is connected. This ordering matters: @myst-theme/jupyter's
 * build pipeline advances to "wait-for-server" as soon as plotly (a fast local
 * chunk) loads, and would unmount its NotebookBuilder before thebe-core (an
 * ~18MB script) is ready — leaving the notebook unbuilt. Waiting for core + a
 * ready server means the notebook is built (and its session started) correctly.
 */
function AutoStart() {
  const { start } = useExecutionScope();
  const { core } = useThebeLoader();
  const { ready: serverReady } = useThebeServer();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !core || !serverReady) return;
    started.current = true;
    start(SLUG);
  }, [core, serverReady, start]);
  return null;
}

/**
 * Small banner reflecting kernel boot progress.
 *
 * We key "ready" off the actual kernel session being attached to this doc's
 * notebook scope rather than @myst-theme/jupyter's page-level `ready`, which (for
 * a single notebook with no dependencies) flips true before the session attaches.
 */
function ComputeStatusBar() {
  const { state } = useExecutionScope();
  const { error } = useThebeServer();
  const sessionReady = !!state.pages[SLUG]?.scopes[SLUG]?.session;
  let message: string;
  if (error && !sessionReady) message = `Compute error: ${error}`;
  else if (sessionReady) message = "Python ready — run the cells below.";
  else message = "Starting Python… booting the in-browser kernel (first run is large).";
  return (
    <div
      data-compute-status={sessionReady ? "ready" : error ? "error" : "starting"}
      role="status"
      style={{
        margin: "1rem 0",
        padding: "0.5rem 0.75rem",
        borderRadius: "0.375rem",
        background: error && !sessionReady ? "#fee2e2" : sessionReady ? "#dcfce7" : "#fef9c3",
        color: "#1f2937",
        fontSize: "0.95rem",
      }}
    >
      {message}
    </div>
  );
}

/**
 * The thebe-lite provider stack. Mounted only after Activate so nothing loads
 * on page render. Order matters:
 *   ThebeBundleLoaderProvider  → injects/loads the thebe-core + thebe-lite bundles
 *     ThebeServerProvider      → connects to the in-browser JupyterLite server
 *       BusyScopeProvider      → per-cell busy state used by the controls/outputs
 *         ExecuteScopeProvider → builds a ThebeNotebook from this doc's mdast
 * Inside it, the article re-renders with COMPUTE_RENDERERS so code cells gain a
 * Run button (via @myst-theme/jupyter) and outputs render live.
 */
export function ComputeProviders({ root, children }: PropsWithChildren<{ root: MystRoot }>) {
  const contents = useMemo(
    () => ({ slug: SLUG, kind: SourceFileKind.Notebook, mdast: root as never }),
    [root],
  );
  return (
    <ThebeBundleLoaderProvider loadThebeLite publicPath={THEBE_PUBLIC_PATH}>
      <ThebeServerProvider connect useJupyterLite options={THEBE_OPTIONS}>
        <BusyScopeProvider>
          <ExecuteScopeProvider enable contents={contents}>
            <ComputeStatusBar />
            <AutoStart />
            {children}
          </ExecuteScopeProvider>
        </BusyScopeProvider>
      </ThebeServerProvider>
    </ThebeBundleLoaderProvider>
  );
}
