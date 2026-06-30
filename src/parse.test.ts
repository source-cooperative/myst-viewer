import { describe, it, expect } from "vitest";
import { parseMarkdown, parseNotebook } from "./parse";
import sampleMd from "./__fixtures__/sample.md?raw";
import sampleIpynb from "./__fixtures__/sample.ipynb?raw";

interface Node {
  type: string;
  kind?: string;
  value?: string;
  jupyter_data?: unknown;
  children?: Node[];
}

function collectTypes(node: Node, acc: string[] = []): string[] {
  acc.push(node.type);
  for (const child of node.children ?? []) collectTypes(child, acc);
  return acc;
}

function find(node: Node, pred: (n: Node) => boolean): Node | undefined {
  if (pred(node)) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, pred);
    if (hit) return hit;
  }
  return undefined;
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

  it("reconciles code cells into a notebook-code block with a code node", () => {
    const block = find(root as Node, (n) => n.type === "block" && n.kind === "notebook-code");
    expect(block).toBeDefined();
    const code = block?.children?.find((n) => n.type === "code");
    expect(code?.value).toContain('print("hi")');
  });

  it("reconciles saved outputs into outputs > output[jupyter_data]", () => {
    const types = collectTypes(root);
    expect(types).toContain("outputs");
    expect(types).toContain("output");
    const output = find(root as Node, (n) => n.type === "output");
    // saved nbformat output is carried verbatim on jupyter_data
    expect(JSON.stringify(output?.jupyter_data)).toContain("hi");
  });
});
