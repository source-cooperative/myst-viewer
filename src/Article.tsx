import { useEffect, useMemo, useState } from "react";
import { MyST, DEFAULT_RENDERERS } from "myst-to-react";
import { ThemeProvider, Theme, ArticleProvider } from "@myst-theme/providers";
import { Theme as RadixTheme } from "@radix-ui/themes";
import { SourceFileKind } from "myst-spec-ext";
import type { MystRoot } from "./parse";
import {
  Activate,
  ComputeProviders,
  COMPUTE_RENDERERS,
  hasComputeCells,
} from "./Activate";
import "./article.css";

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

  // Mirror the theme onto <html> so the global `.dark` hook (and anything Radix
  // portals to <body>) reacts, matching source.coop's class-based dark strategy.
  // The Radix <Theme appearance> below already class-tags its own subtree.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    return () => root.classList.remove("dark");
  }, [theme]);

  return (
    <ThemeProvider
      theme={theme === "dark" ? Theme.dark : Theme.light}
      setTheme={() => {}}
      renderers={renderers}
    >
      <ArticleProvider kind={SourceFileKind.Notebook}>
        {/* Radix Themes tokens, matched to source.coop: square corners, gray
            accent/gray palette, 110% scaling. `appearance` drives Radix's
            light/dark scales AND adds the `.dark` class our article.css hooks. */}
        <RadixTheme
          accentColor="gray"
          grayColor="gray"
          radius="none"
          scaling="110%"
          appearance={theme}
        >
          {/* `data-theme` is a stable handle for tests/debugging; the visible
              styling comes from Radix tokens + article.css `myst-*`/element rules. */}
          <article
            className={theme === "dark" ? "myst-article dark" : "myst-article"}
            data-theme={theme}
          >
            {hasCode && !active && <Activate onActivate={() => setActive(true)} />}
            {active ? <ComputeProviders root={root}>{body}</ComputeProviders> : body}
          </article>
        </RadixTheme>
      </ArticleProvider>
    </ThemeProvider>
  );
}
