import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Fixed params so the effect always reaches fetchSource with a .md url.
vi.mock("./params", () => ({
  parseParams: () => ({ url: "https://example.com/a.md", theme: "light" }),
}));

// Keep detectKind + SourceError real; make only fetchSource controllable.
vi.mock("./source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./source")>();
  return { ...actual, fetchSource: vi.fn() };
});

// Keep parseNotebook real; let tests drive parseMarkdown.
vi.mock("./parse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./parse")>();
  return { ...actual, parseMarkdown: vi.fn() };
});

import App from "./App";
import { fetchSource, SourceError } from "./source";
import { parseMarkdown } from "./parse";

const fetchMock = vi.mocked(fetchSource);
const parseMock = vi.mocked(parseMarkdown);

beforeEach(() => {
  fetchMock.mockReset();
  parseMock.mockReset();
});

describe("App error handling", () => {
  it("shows a friendly panel (not a raw error/stack) when access is forbidden", async () => {
    fetchMock.mockRejectedValue(new SourceError("forbidden"));
    render(<App />);

    await screen.findByText(/restricted product/i);
    expect(screen.getByText(/product page/i)).toBeInTheDocument();
    // The raw error identity / a stack must not leak to the user.
    expect(document.body.textContent).not.toContain("SourceError");
    expect(document.body.textContent).not.toMatch(/\bat .+\.tsx/);
  });

  it("falls back to the raw source in a <pre> when parsing throws", async () => {
    const raw = "# real source text that failed to parse";
    fetchMock.mockResolvedValue(raw);
    parseMock.mockImplementation(() => {
      throw new Error("boom");
    });
    render(<App />);

    const pre = await waitFor(() => {
      const el = document.querySelector("pre");
      expect(el).toBeTruthy();
      return el as HTMLPreElement;
    });
    expect(pre.textContent).toContain(raw);
    // An error banner explains the fallback; content is never blank.
    expect(document.body.textContent).toMatch(/raw source/i);
  });
});
