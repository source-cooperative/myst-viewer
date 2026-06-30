import { useEffect, useState } from "react";
import { parseParams } from "./params";
import { detectKind, fetchSource } from "./source";
import { parseMarkdown, parseNotebook } from "./parse";
import type { MystRoot } from "./parse";
import { Article } from "./Article";

type State =
  | { status: "loading" }
  | { status: "loaded"; root: MystRoot; theme: "light" | "dark" }
  | { status: "error"; message: string };

function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { url, theme } = parseParams(window.location.search);
        const text = await fetchSource(url);
        const root =
          detectKind(url) === "ipynb" ? parseNotebook(text) : parseMarkdown(text);
        if (!cancelled) setState({ status: "loaded", root, theme });
      } catch (err) {
        // ponytail: minimal inline error for now; friendly error UI is a later task.
        if (!cancelled) setState({ status: "error", message: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") return <>loading…</>;
  if (state.status === "error") return <>{state.message}</>;
  return <Article root={state.root} theme={state.theme} />;
}

export default App;
