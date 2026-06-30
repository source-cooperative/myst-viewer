import { describe, it, expect, vi } from "vitest";
import { detectKind, fetchSource, MAX_BYTES } from "./source";

describe("detectKind", () => {
  it.each([
    ["https://x/a.md", "md"],
    ["https://x/a.markdown", "md"],
    ["https://x/a.ipynb", "ipynb"],
  ])("%s -> %s", (u, k) => expect(detectKind(u)).toBe(k));
  it("throws on unsupported extension", () =>
    expect(() => detectKind("https://x/a.csv")).toThrow());
});

describe("fetchSource", () => {
  it("maps 403 to a 'forbidden' outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(fetchSource("https://x/a.md")).rejects.toMatchObject({ kind: "forbidden" });
  });
  it("rejects oversized files via Content-Length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => String(MAX_BYTES + 1) },
    }));
    await expect(fetchSource("https://x/a.md")).rejects.toMatchObject({ kind: "too-large" });
  });
});
