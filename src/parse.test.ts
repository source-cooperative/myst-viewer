import { describe, it, expect } from "vitest";
import { parseMarkdown, parseNotebook } from "./parse";
import { hasComputeCells } from "./Activate";
import sampleMd from "./__fixtures__/sample.md?raw";
import sampleIpynb from "./__fixtures__/sample.ipynb?raw";

interface Node {
  type: string;
  kind?: string;
  key?: string;
  value?: string;
  executable?: boolean;
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

function findAll(node: Node, pred: (n: Node) => boolean, acc: Node[] = []): Node[] {
  if (pred(node)) acc.push(node);
  for (const child of node.children ?? []) findAll(child, pred, acc);
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

  it("assigns DISTINCT keys to each code cell's block", () => {
    const ipynb = JSON.stringify({
      cells: [
        { cell_type: "code", source: ["a = 1\n"], outputs: [] },
        { cell_type: "code", source: ["b = 2\n"], outputs: [] },
      ],
      metadata: { language_info: { name: "python" } },
      nbformat: 4,
      nbformat_minor: 5,
    });
    const blocks = findAll(parseNotebook(ipynb) as Node, (n) => n.type === "block");
    expect(blocks).toHaveLength(2);
    const keys = blocks.map((b) => b.key);
    expect(keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
    // distinct keys are what keep outputs routed to the right cell at runtime
    expect(new Set(keys).size).toBe(2);
  });
});

describe("MyST {code-cell} markdown reconciliation", () => {
  const root = parseMarkdown("```{code-cell} python\nprint(1)\n```");

  it("unwraps to an executable notebook-code block", () => {
    const block = find(root as Node, (n) => n.type === "block" && n.kind === "notebook-code");
    expect(block).toBeDefined();
    const code = block?.children?.find((n) => n.type === "code");
    expect(code?.executable).toBe(true);
    expect(code?.value).toContain("print(1)");
  });

  it("is detected by hasComputeCells", () => {
    expect(hasComputeCells((root as Node).children)).toBe(true);
    // prose-only documents are not flagged
    expect(hasComputeCells(parseMarkdown("# Hi\n\njust text").children as unknown)).toBe(false);
  });
});
