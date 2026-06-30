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
});
