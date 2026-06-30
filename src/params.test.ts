import { describe, it, expect } from "vitest";
import { parseParams } from "./params";

describe("parseParams", () => {
  it("extracts url, theme, base; defaults theme to light", () => {
    const p = parseParams("?iframe=true&url=https%3A%2F%2Fx%2Fa.md&base=https%3A%2F%2Fx");
    expect(p.url).toBe("https://x/a.md");
    expect(p.theme).toBe("light");
    expect(p.base).toBe("https://x");
  });
  it("reads dark theme", () => {
    expect(parseParams("?url=https%3A%2F%2Fx%2Fa.md&theme=dark").theme).toBe("dark");
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
