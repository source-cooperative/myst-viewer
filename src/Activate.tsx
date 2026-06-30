import { useEffect, useMemo, useRef, useState } from "react";
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

// If the kernel hasn't booted within this window, stop showing "Starting…" and
// fail loudly with a retry. Otherwise a stalled Pyodide CDN download or a
// browser that can't run the kernel would hang forever — the thebe server error
// stays null in those cases, so there's nothing else to surface.
const BOOT_TIMEOUT_MS = 90_000;

/**
 * Drives the boot and reflects its progress.
 *
 * - Kicks `start(SLUG)` (once per attempt) only after thebe-core is loaded AND
 *   the JupyterLite server is connected. The wait matters: @myst-theme/jupyter's
 *   build pipeline advances to "wait-for-server" as soon as plotly (a fast local
 *   chunk) loads, and would unmount its NotebookBuilder before thebe-core (an
 *   ~18MB script) is ready — leaving the notebook unbuilt.
 * - "ready" keys off the actual attached kernel session, not @myst-theme/jupyter's
 *   page-level `ready` (which, for a single dependency-less notebook, flips true
 *   before the session attaches).
 * - If the session never attaches within BOOT_TIMEOUT_MS, surfaces a visible
 *   error + Retry instead of hanging.
 */
function ComputeStatus() {
  const { start, state } = useExecutionScope();
  const { core } = useThebeLoader();
  const { ready: serverReady, error } = useThebeServer();
  const sessionReady = !!state.pages[SLUG]?.scopes[SLUG]?.session;
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const startedAttempt = useRef(-1);

  // Start once per attempt, when core + server are ready.
  useEffect(() => {
    if (!core || !serverReady) return;
    if (startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;
    start(SLUG);
  }, [core, serverReady, start, attempt]);

  // Boot deadline, (re)armed on activation/retry; cleared once the session attaches.
  useEffect(() => {
    if (sessionReady) return;
    const t = setTimeout(() => setTimedOut(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [sessionReady, attempt]);

  const retry = () => {
    setTimedOut(false);
    setAttempt((a) => a + 1);
  };

  const failed = !sessionReady && (timedOut || !!error);
  const status = sessionReady ? "ready" : failed ? "error" : "starting";
  let message: string;
  if (sessionReady) message = "Python ready — run the cells below.";
  else if (timedOut)
    message =
      "Python didn’t start in time — the kernel download may have stalled or this " +
      "browser can’t run it. ";
  else if (error) message = `Compute error: ${error} `;
  else message = "Starting Python… booting the in-browser kernel (first run is large).";

  return (
    <div
      data-compute-status={status}
      role="status"
      style={{
        margin: "1rem 0",
        padding: "0.5rem 0.75rem",
        borderRadius: "0.375rem",
        background: failed ? "#fee2e2" : sessionReady ? "#dcfce7" : "#fef9c3",
        color: "#1f2937",
        fontSize: "0.95rem",
      }}
    >
      {message}
      {failed && (
        <button
          type="button"
          onClick={retry}
          style={{
            marginLeft: "0.25rem",
            padding: "0.15rem 0.6rem",
            cursor: "pointer",
            borderRadius: "0.25rem",
            border: "1px solid #b91c1c",
            background: "white",
            color: "#b91c1c",
          }}
        >
          Retry
        </button>
      )}
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
            <ComputeStatus />
            {children}
          </ExecuteScopeProvider>
        </BusyScopeProvider>
      </ThebeServerProvider>
    </ThebeBundleLoaderProvider>
  );
}
