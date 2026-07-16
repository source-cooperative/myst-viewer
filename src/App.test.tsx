import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Fixed params so the effect always reaches fetchSource with a .md url.
vi.mock("./params", () => ({
  parseParams: () => ({ url: "https://example.com/a.md", theme: "light" }),
  resolveTheme: () => "light",
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
  // Default to a url present so the no-url home branch is skipped.
  window.history.replaceState({}, "", "/?url=https://example.com/a.md");
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

  it("renders the homepage with demo links when no ?url= is provided", async () => {
    window.history.replaceState({}, "", "/");
    render(<App />);

    const link = await screen.findByRole("link", {
      name: /numpy \+ matplotlib/i,
    });
    // href points back into the viewer with the demo file URL-encoded into ?url=
    // and the current theme carried along.
    expect(link.getAttribute("href")).toContain("demos%2Fnumpy-matplotlib.md");
    expect(link.getAttribute("href")).toContain("theme=light");
  });
});
