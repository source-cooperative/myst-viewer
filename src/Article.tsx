import { useMemo, useState } from "react";
import { MyST, DEFAULT_RENDERERS } from "myst-to-react";
import { ThemeProvider, Theme, ArticleProvider } from "@myst-theme/providers";
import { SourceFileKind } from "myst-spec-ext";
import type { MystRoot } from "./parse";
import {
  Activate,
  ComputeProviders,
  COMPUTE_RENDERERS,
  hasComputeCells,
} from "./Activate";

/**
 * Render a MyST AST as a themed article.
 *
 * By default the article is fully static (syntax-highlighted code, no kernel) —
 * we never boot WASM on load. If the document has executable code cells we show
 * an **Activate** button; clicking it mounts the thebe-lite provider stack (see
 * `ComputeProviders`), re-renders the same `<MyST>` tree with the Jupyter
 * renderers, and boots an in-browser JupyterLite kernel so cells become
 * runnable with live inline outputs.
 *
 * `ThemeProvider` supplies both the active theme and the node renderers
 * (`useNodeRenderers()` reads them off the same context); we swap in the
 * compute renderers once active. `ArticleProvider kind={Notebook}` makes
 * `@myst-theme/jupyter` treat the code cells as executable (per-cell Run
 * controls). `setTheme` is a no-op here since this is a read-only viewer.
 */
export function Article({
  root,
  theme,
}: {
  root: MystRoot;
  theme: "light" | "dark";
}) {
  const [active, setActive] = useState(false);
  const hasCode = useMemo(() => hasComputeCells(root.children), [root]);
  const renderers = active ? COMPUTE_RENDERERS : DEFAULT_RENDERERS;
  const body = <MyST ast={root.children} />;

  return (
    <ThemeProvider
      theme={theme === "dark" ? Theme.dark : Theme.light}
      setTheme={() => {}}
      renderers={renderers}
    >
      <ArticleProvider kind={SourceFileKind.Notebook}>
        {/* ponytail: myst-theme uses class-based (Tailwind) dark mode, so the
            `.dark` class is the real styling hook; `data-theme` is just a stable
            handle for tests/debugging. Wiring the Tailwind stylesheet is deferred
            — this still gets a correct, theme-aware render. */}
        <article className={theme === "dark" ? "dark" : undefined} data-theme={theme}>
          {hasCode && !active && <Activate onActivate={() => setActive(true)} />}
          {active ? <ComputeProviders root={root}>{body}</ComputeProviders> : body}
        </article>
      </ArticleProvider>
    </ThemeProvider>
  );
}
