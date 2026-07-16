import { describe, it, expect, vi } from "vitest";
import { parseParams, resolveTheme } from "./params";

function mockScheme(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: dark, media: query }));
}

describe("parseParams", () => {
  it("extracts url, theme, base", () => {
    mockScheme(false);
    const p = parseParams("?iframe=true&url=https%3A%2F%2Fx%2Fa.md&base=https%3A%2F%2Fx");
    expect(p.url).toBe("https://x/a.md");
    expect(p.theme).toBe("light");
    expect(p.base).toBe("https://x");
  });
  it("reads dark theme", () => {
    expect(parseParams("?url=https%3A%2F%2Fx%2Fa.md&theme=dark").theme).toBe("dark");
  });
  it("follows the browser preference when ?theme= is absent", () => {
    mockScheme(true);
    expect(parseParams("?url=https%3A%2F%2Fx%2Fa.md").theme).toBe("dark");
    mockScheme(false);
    expect(parseParams("?url=https%3A%2F%2Fx%2Fa.md").theme).toBe("light");
  });
  it("explicit ?theme= overrides the browser preference", () => {
    mockScheme(true);
    expect(resolveTheme("light")).toBe("light");
    mockScheme(false);
    expect(resolveTheme("dark")).toBe("dark");
  });
  it("throws a typed error when url is missing", () => {
    expect(() => parseParams("?iframe=true")).toThrow(/missing.*url/i);
  });
  it("defaults activate and run to false", () => {
    const p = parseParams("?url=https%3A%2F%2Fx%2Fa.md");
    expect(p.activate).toBe(false);
    expect(p.run).toBe(false);
  });
  it("activate=true boots without running", () => {
    const p = parseParams("?url=https%3A%2F%2Fx%2Fa.md&activate=true");
    expect(p.activate).toBe(true);
    expect(p.run).toBe(false);
  });
  it("run=true implies activate", () => {
    const p = parseParams("?url=https%3A%2F%2Fx%2Fa.md&run=true");
    expect(p.run).toBe(true);
    expect(p.activate).toBe(true);
  });
});
