export interface ViewerParams {
  url: string;
  theme: "light" | "dark";
  base?: string;
}

export function parseParams(search: string): ViewerParams {
  const q = new URLSearchParams(search);
  const url = q.get("url");
  if (!url) throw new Error("Missing required ?url parameter");
  const theme = q.get("theme") === "dark" ? "dark" : "light";
  const base = q.get("base") ?? undefined;
  return { url, theme, base };
}
