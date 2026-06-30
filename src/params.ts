export interface ViewerParams {
  url: string;
  theme: "light" | "dark";
  base?: string;
  // activate=true boots the kernel on load (skips the Activate button).
  // run=true also runs every cell once the kernel is ready, and implies activate.
  activate: boolean;
  run: boolean;
}

export function parseParams(search: string): ViewerParams {
  const q = new URLSearchParams(search);
  const url = q.get("url");
  if (!url) throw new Error("Missing required ?url parameter");
  const theme = q.get("theme") === "dark" ? "dark" : "light";
  const base = q.get("base") ?? undefined;
  const run = q.get("run") === "true";
  const activate = run || q.get("activate") === "true";
  return { url, theme, base, activate, run };
}
