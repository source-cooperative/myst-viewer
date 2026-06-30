export const MAX_BYTES = 10 * 1024 * 1024; // ponytail: mirrors app's existing 10MB preview cap

export type Kind = "md" | "ipynb";
export function detectKind(url: string): Kind {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith(".ipynb")) return "ipynb";
  if (path.endsWith(".md") || path.endsWith(".markdown")) return "md";
  throw new Error(`Unsupported file type: ${path}`);
}

export class SourceError extends Error {
  kind: "forbidden" | "not-found" | "too-large" | "network";
  constructor(kind: "forbidden" | "not-found" | "too-large" | "network") {
    super(kind);
    this.kind = kind;
  }
}

export async function fetchSource(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new SourceError("network");
  }
  if (res.status === 403 || res.status === 401) throw new SourceError("forbidden");
  if (res.status === 404) throw new SourceError("not-found");
  if (!res.ok) throw new SourceError("network");
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new SourceError("too-large");
  return res.text();
}
