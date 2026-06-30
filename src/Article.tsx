import { MyST, DEFAULT_RENDERERS } from "myst-to-react";
import { ThemeProvider, Theme } from "@myst-theme/providers";
import type { MystRoot } from "./parse";

/**
 * Render a MyST AST as a themed, statically syntax-highlighted article.
 *
 * `ThemeProvider` is the one provider `MyST` needs: it supplies both the active
 * theme and the node renderers (`useNodeRenderers()` reads them off the same
 * context). `setTheme` is a no-op here since this is a read-only viewer.
 */
export function Article({
  root,
  theme,
}: {
  root: MystRoot;
  theme: "light" | "dark";
}) {
  return (
    <ThemeProvider
      theme={theme === "dark" ? Theme.dark : Theme.light}
      setTheme={() => {}}
      renderers={DEFAULT_RENDERERS}
    >
      {/* ponytail: myst-theme uses class-based (Tailwind) dark mode, so the
          `.dark` class is the real styling hook; `data-theme` is just a stable
          handle for tests/debugging. Wiring the Tailwind stylesheet is deferred
          — this still gets a correct, theme-aware render. */}
      <article className={theme === "dark" ? "dark" : undefined} data-theme={theme}>
        <MyST ast={root.children} />
      </article>
    </ThemeProvider>
  );
}
