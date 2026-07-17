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
  useBusyScope,
  useExecutionScope,
} from "@myst-theme/jupyter";
import { Button, Flex, IconButton, Tooltip } from "@radix-ui/themes";
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

// Jupyter-toolbar-style glyphs (play = activate, fast-forward = run all).
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M4 2l10 6-10 6z" />
  </svg>
);
const FastForwardIcon = () => (
  <svg width="16" height="14" viewBox="0 0 18 16" fill="currentColor" aria-hidden>
    <path d="M2 2l8 6-8 6z" />
    <path d="M9 2l8 6-8 6z" />
  </svg>
);

/**
 * The pre-compute controls, top right: **Activate** (play) boots the kernel,
 * **Run all** (fast-forward) boots it AND executes every cell once ready.
 * Rendered before compute is switched on; clicking either mounts the
 * thebe-lite provider stack. We never boot WASM on load — only here, on an
 * explicit click.
 */
export function Activate({
  onActivate,
  onRunAll,
}: {
  onActivate: () => void;
  onRunAll: () => void;
}) {
  return (
    <Flex gap="2" my="4" justify="end">
      <Tooltip content="Activate — boot the in-browser Python kernel">
        <IconButton
          aria-label="Activate"
          className="myst-viewer-activate"
          variant="solid"
          highContrast
          onClick={onActivate}
        >
          <PlayIcon />
        </IconButton>
      </Tooltip>
      <Tooltip content="Run all cells (boots the kernel first)">
        <IconButton
          aria-label="Run all"
          className="myst-viewer-run-all"
          variant="soft"
          onClick={onRunAll}
        >
          <FastForwardIcon />
        </IconButton>
      </Tooltip>
    </Flex>
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
function ComputeStatus({ autorun }: { autorun: boolean }) {
  const { start, execute, state } = useExecutionScope();
  const { core } = useThebeLoader();
  const { ready: serverReady, error } = useThebeServer();
  const busy = useBusyScope();
  // Any cell currently executing (or the notebook resetting) in this scope.
  const executing = busy.page(SLUG, "execute") || busy.page(SLUG, "reset");
  const sessionReady = !!state.pages[SLUG]?.scopes[SLUG]?.session;
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const startedAttempt = useRef(-1);
  const ranAuto = useRef(false);

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

  // ?run=true: execute every cell once, as soon as the session attaches.
  useEffect(() => {
    if (!autorun || !sessionReady || ranAuto.current) return;
    ranAuto.current = true;
    execute(SLUG);
  }, [autorun, sessionReady, execute]);

  const retry = () => {
    setTimedOut(false);
    setAttempt((a) => a + 1);
  };

  const failed = !sessionReady && (timedOut || !!error);
  const status = sessionReady ? "ready" : failed ? "error" : "starting";
  let message: string;
  if (sessionReady)
    message = executing ? "Running cells…" : "Python ready — run the cells below.";
  else if (timedOut)
    message =
      "Python didn’t start in time — the kernel download may have stalled or this " +
      "browser can’t run it. ";
  else if (error) message = `Compute error: ${error} `;
  else message = "Starting Python… booting the in-browser kernel (first run is large).";

  return (
    <Flex
      data-compute-status={status}
      role="status"
      align="center"
      gap="3"
      my="4"
      style={{
        padding: "0.5rem 0.75rem",
        borderRadius: "0.375rem",
        background: failed ? "#fee2e2" : sessionReady ? "#dcfce7" : "#fef9c3",
        color: "#1f2937",
        fontSize: "0.95rem",
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {failed ? (
        <Button size="1" color="red" variant="outline" onClick={retry}>
          Retry
        </Button>
      ) : (
        <Tooltip content={executing ? "Cells are running…" : "Run all cells"}>
          <IconButton
            size="1"
            variant="solid"
            highContrast
            aria-label="Run all"
            className="myst-viewer-run-all"
            disabled={!sessionReady}
            loading={sessionReady && executing}
            onClick={() => execute(SLUG)}
          >
            <FastForwardIcon />
          </IconButton>
        </Tooltip>
      )}
    </Flex>
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
export function ComputeProviders({
  root,
  autorun = false,
  children,
}: PropsWithChildren<{ root: MystRoot; autorun?: boolean }>) {
  const contents = useMemo(
    () => ({ slug: SLUG, kind: SourceFileKind.Notebook, mdast: root as never }),
    [root],
  );
  return (
    <ThebeBundleLoaderProvider loadThebeLite publicPath={THEBE_PUBLIC_PATH}>
      <ThebeServerProvider connect useJupyterLite options={THEBE_OPTIONS}>
        <BusyScopeProvider>
          <ExecuteScopeProvider enable contents={contents}>
            <ComputeStatus autorun={autorun} />
            {children}
          </ExecuteScopeProvider>
        </BusyScopeProvider>
      </ThebeServerProvider>
    </ThebeBundleLoaderProvider>
  );
}
