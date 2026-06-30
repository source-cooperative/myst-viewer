import { MyST, DEFAULT_RENDERERS } from "myst-to-react";
import { ThemeProvider, Theme } from "@myst-theme/providers";

// ponytail: derive the root type from the parser itself (same pattern as
// parse.ts) instead of pulling in `myst-common` just for `GenericParent`.
import type { parseMarkdown } from "./parse";
type MystRoot = ReturnType<typeof parseMarkdown>;

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
      {/* ponytail: `dark` class + data-theme are the structural hooks the
          myst-theme stylesheet keys off. Wiring the actual Tailwind-based
          stylesheet is deferred — this gets a correct, theme-aware render. */}
      <article className={theme === "dark" ? "dark" : undefined} data-theme={theme}>
        <MyST ast={root.children} />
      </article>
    </ThemeProvider>
  );
}
