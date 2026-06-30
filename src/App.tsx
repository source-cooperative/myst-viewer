import { useEffect, useState } from "react";
import { parseParams } from "./params";
import { detectKind, fetchSource, SourceError } from "./source";
import { parseMarkdown, parseNotebook, withSourceUrl } from "./parse";
import type { MystRoot } from "./parse";
import { Article } from "./Article";
import { Home } from "./Home";
import { ErrorPanel } from "./ErrorPanel";
import { observeHeight, postHeight } from "./iframeBridge";

type State =
  | { status: "loading" }
  | { status: "home"; theme: "light" | "dark" } // no ?url= → landing page
  | {
      status: "loaded";
      root: MystRoot;
      theme: "light" | "dark";
      activate: boolean;
      run: boolean;
    }
  | { status: "error"; kind: SourceError["kind"] } // friendly panel
  | { status: "raw"; text: string }; // fetched, but couldn't render

function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    // No ?url= → show the homepage instead of erroring. parseParams would throw
    // without a url, so read theme directly here.
    const q = new URLSearchParams(window.location.search);
    if (!q.get("url")) {
      setState({ status: "home", theme: q.get("theme") === "dark" ? "dark" : "light" });
      return;
    }
    (async () => {
      let text = "";
      try {
        const { url, theme, base, activate, run } = parseParams(window.location.search);
        text = await fetchSource(url);
        const parsed =
          detectKind(url) === "ipynb" ? parseNotebook(text) : parseMarkdown(text);
        // When embedded with ?base=, expose SOURCE_URL so code can read the
        // product's sibling files (public/unlisted only). No-op without base.
        const root = withSourceUrl(parsed, base);
        if (!cancelled) setState({ status: "loaded", root, theme, activate, run });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SourceError) setState({ status: "error", kind: err.kind });
        else if (text) setState({ status: "raw", text }); // parse/other failure → show source
        else setState({ status: "error", kind: "network" }); // failed before any text
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Task 9: tell the host iframe how tall the content is, so it can size the
  // frame to fit (no nested scrollbar). Observe once content has rendered.
  // ponytail: live two-way theme sync is out of scope; the initial ?theme= is
  // already handled by parseParams/Article.
  useEffect(() => {
    if (state.status === "loading") return;
    const el = document.documentElement;
    postHeight(el.scrollHeight); // once on mount
    return observeHeight(el, postHeight);
  }, [state.status]);

  if (state.status === "loading") return <>loading…</>;
  if (state.status === "home") return <Home theme={state.theme} />;
  if (state.status === "error") return <ErrorPanel kind={state.kind} />;
  if (state.status === "raw")
    return (
      <>
        <p role="alert">Couldn't render this file — showing the raw source below.</p>
        <pre>{state.text}</pre>
      </>
    );
  return (
    <Article
      root={state.root}
      theme={state.theme}
      activate={state.activate}
      run={state.run}
    />
  );
}

export default App;
