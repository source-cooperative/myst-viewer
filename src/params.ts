export interface ViewerParams {
  url: string;
  theme: "light" | "dark";
  base?: string;
  // activate=true boots the kernel on load (skips the Activate button).
  // run=true also runs every cell once the kernel is ready, and implies activate.
  activate: boolean;
  run: boolean;
}

// Explicit ?theme= wins; otherwise follow the browser's color-scheme preference.
export function resolveTheme(param: string | null): "light" | "dark" {
  if (param === "dark" || param === "light") return param;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function parseParams(search: string): ViewerParams {
  const q = new URLSearchParams(search);
  const url = q.get("url");
  if (!url) throw new Error("Missing required ?url parameter");
  const theme = resolveTheme(q.get("theme"));
  const base = q.get("base") ?? undefined;
  const run = q.get("run") === "true";
  const activate = run || q.get("activate") === "true";
  return { url, theme, base, activate, run };
}
