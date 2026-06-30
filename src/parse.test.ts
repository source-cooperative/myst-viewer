import { describe, it, expect } from "vitest";
import { parseMarkdown, parseNotebook } from "./parse";
import sampleMd from "./__fixtures__/sample.md?raw";
import sampleIpynb from "./__fixtures__/sample.ipynb?raw";

interface Node {
  type: string;
  children?: Node[];
}

function collectTypes(node: Node, acc: string[] = []): string[] {
  acc.push(node.type);
  for (const child of node.children ?? []) collectTypes(child, acc);
  return acc;
}

describe("parseMarkdown", () => {
  const root = parseMarkdown(sampleMd);

  it("returns a MyST root", () => {
    expect(root.type).toBe("root");
  });

  it("emits heading and code nodes", () => {
    const types = collectTypes(root);
    expect(types).toContain("heading");
    expect(types).toContain("code");
  });
});

describe("parseNotebook", () => {
  const root = parseNotebook(sampleIpynb);

  it("parses markdown cells into a heading", () => {
    expect(collectTypes(root)).toContain("heading");
  });

  it("turns code cells into a code node carrying the source", () => {
    expect(collectTypes(root)).toContain("code");
    const code = (root.children as Array<{ type: string; value?: string }>).find(
      (n) => n.type === "code",
    );
    expect(code?.value).toContain('print("hi")');
  });

  it("retains saved cell outputs in an output node", () => {
    expect(collectTypes(root)).toContain("output");
    expect(JSON.stringify(root)).toContain("hi");
  });
});
