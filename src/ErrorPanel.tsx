import type { SourceError } from "./source";

// Friendly copy per SourceError.kind; network covers any unknown failure.
const COPY: Record<SourceError["kind"], string> = {
  forbidden:
    "This file isn't publicly accessible. If it's in a restricted product, open it from the product page (where you're signed in).",
  "not-found": "File not found.",
  "too-large": "This file is too large to preview.",
  network: "Couldn't load this file. Check the link and try again.",
};

export function ErrorPanel({ kind }: { kind: string }) {
  return (
    <div role="alert">
      <p>{COPY[kind as SourceError["kind"]] ?? COPY.network}</p>
    </div>
  );
}
