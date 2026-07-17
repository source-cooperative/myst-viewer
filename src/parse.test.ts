import { describe, it, expect } from "vitest";
import {
  parseMarkdown,
  parseNotebook,
  pep723Dependencies,
  withPep723Deps,
  withSourceUrl,
} from "./parse";
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
  visibility?: string;
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

  it("assigns a distinct, non-null key to every node (incl. sibling prose)", () => {
    // Two sibling paragraphs used to render with key={undefined} (ensureKeys
    // only keyed block/outputs), tripping React's "unique key" warning.
    const prose = parseMarkdown("First paragraph.\n\nSecond paragraph.") as Node;
    const paras = findAll(prose, (n) => n.type === "paragraph");
    expect(paras.length).toBeGreaterThanOrEqual(2);
    const keys = paras.map((p) => p.key);
    expect(keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length); // distinct

    // And EVERY rendered node (the root's descendants — `MyST` renders
    // `root.children`) has a non-null key now.
    const all: Node[] = [];
    for (const child of prose.children ?? []) findAll(child, () => true, all);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((n) => typeof n.key === "string" && n.key.length > 0)).toBe(true);
  });

  it("gives every top-level node a children array (thematicBreak, code fences)", () => {
    // notebookFromMdast (@myst-theme/jupyter) does `node.children.reduce(...)`
    // on every top-level node on Activate; childless ones used to crash it.
    const doc = parseMarkdown("Intro.\n\n---\n\n```python\nx = 1\n```\n") as Node;
    expect(doc.children!.some((n) => n.type === "thematicBreak")).toBe(true);
    expect(doc.children!.every((n) => Array.isArray(n.children))).toBe(true);
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

describe("cell-tag visibility (remove-input / hide-output / …)", () => {
  it("maps {code-cell} :tags: onto visibility in .md (remove-* demoted to hide)", () => {
    const root = parseMarkdown(
      "```{code-cell} python\n:tags: [remove-input, hide-output]\nprint(1)\n```",
    ) as Node;
    const block = find(root, (n) => n.type === "block" && n.kind === "notebook-code")!;
    // remove-* never yields visibility:"remove" — executable code must stay
    // inspectable, so it demotes to the collapsed-disclosure "hide"
    expect(block.children?.find((n) => n.type === "code")?.visibility).toBe("hide");
    expect(block.children?.find((n) => n.type === "outputs")?.visibility).toBe("hide");
    expect(block.visibility).toBeUndefined();
    // still executable — hiding the input must not stop the cell from running
    expect(block.children?.find((n) => n.type === "code")?.executable).toBe(true);
  });

  it("maps cell.metadata.tags onto visibility in .ipynb (remove-* demoted to hide)", () => {
    const ipynb = JSON.stringify({
      cells: [
        { cell_type: "code", source: ["a = 1\n"], outputs: [], metadata: { tags: ["remove-input"] } },
        { cell_type: "code", source: ["b = 2\n"], outputs: [], metadata: { tags: ["remove-cell"] } },
        { cell_type: "code", source: ["c = 3\n"], outputs: [], metadata: {} },
      ],
      metadata: { language_info: { name: "python" } },
      nbformat: 4,
      nbformat_minor: 5,
    });
    const blocks = findAll(parseNotebook(ipynb) as Node, (n) => n.type === "block");
    expect(blocks[0].children?.find((n) => n.type === "code")?.visibility).toBe("hide");
    expect(blocks[1].visibility).toBe("hide");
    expect(blocks[2].visibility).toBeUndefined();
    expect(blocks[2].children?.find((n) => n.type === "code")?.visibility).toBeUndefined();
  });

  it("never emits visibility:'remove' for any remove-* tag", () => {
    const root = parseMarkdown(
      "```{code-cell} python\n:tags: [remove-cell, remove-input, remove-output]\nx = 1\n```",
    ) as Node;
    expect(findAll(root, (n) => n.visibility === "remove")).toHaveLength(0);
    expect(findAll(root, (n) => n.visibility === "hide").length).toBeGreaterThan(0);
  });
});

describe("withSourceUrl", () => {
  const base = "https://data.source.coop/org/product";

  it("prepends a runnable SOURCE_URL cell as the first child when base is set", () => {
    const root = withSourceUrl(
      parseMarkdown("# Doc\n\n```{code-cell} python\nprint(1)\n```"),
      base,
    );
    const first = (root.children as Node[])[0];
    expect(first.type).toBe("block");
    expect(first.kind).toBe("notebook-code");
    const code = first.children?.find((n) => n.type === "code");
    expect(code?.executable).toBe(true);
    expect(code?.value).toContain(`SOURCE_URL = "${base}"`);
    // unique, non-empty key that doesn't collide with the other cell's block key
    expect(typeof first.key).toBe("string");
    expect((first.key ?? "").length).toBeGreaterThan(0);
    const keys = findAll(root as Node, (n) => n.type === "block").map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("escapes a stray quote in base into a valid python literal", () => {
    const root = withSourceUrl(parseMarkdown("# Doc"), 'https://x/a"b');
    const code = find(root as Node, (n) => n.type === "code");
    expect(code?.value).toContain('SOURCE_URL = "https://x/a\\"b"');
  });

  it("adds nothing when base is absent", () => {
    const parsed = parseMarkdown("# Doc\n\n```{code-cell} python\nprint(1)\n```");
    const before = JSON.stringify(parsed);
    const after = withSourceUrl(parsed, undefined);
    expect((after.children as Node[])[0].type).toBe("heading");
    expect(JSON.stringify(after)).toBe(before);
  });
});

describe("PEP 723 inline script metadata", () => {
  const block =
    "# /// script\n" +
    '# requires-python = ">=3.12"\n' +
    "# dependencies = [\n" +
    '#     "pandas==3.0.3",\n' +
    '#     "lonboard==0.16.0",\n' +
    "#     'pyarrow>=24',\n" +
    '#     "duckdb",\n' +
    "# ]\n" +
    "# ///";

  const mdWithBlock = `# Doc\n\n\`\`\`{code-cell} python\n${block}\nimport pandas\n\`\`\`\n`;

  const ipynbWithBlock = JSON.stringify({
    cells: [
      { cell_type: "code", source: [block, "\n"], outputs: [] },
      { cell_type: "code", source: ["import pandas\n"], outputs: [] },
    ],
    metadata: { language_info: { name: "python" } },
    nbformat: 4,
    nbformat_minor: 5,
  });

  it("extracts dependencies from the first executable cell (.md)", () => {
    expect(pep723Dependencies(parseMarkdown(mdWithBlock))).toEqual([
      "pandas==3.0.3",
      "lonboard==0.16.0",
      "pyarrow>=24",
      "duckdb",
    ]);
  });

  it("extracts dependencies from the first code cell (.ipynb, juv layout)", () => {
    expect(pep723Dependencies(parseNotebook(ipynbWithBlock))).toEqual([
      "pandas==3.0.3",
      "lonboard==0.16.0",
      "pyarrow>=24",
      "duckdb",
    ]);
  });

  it("prepends a %pip install cell with version pins stripped", () => {
    const root = withPep723Deps(parseMarkdown(mdWithBlock));
    const first = (root.children as Node[])[0];
    expect(first.kind).toBe("notebook-code");
    const code = first.children?.find((n) => n.type === "code");
    expect(code?.executable).toBe(true);
    expect(code?.value).toContain("%pip install -q pandas lonboard pyarrow duckdb");
    // keys stay distinct so output routing can't collide
    const keys = findAll(root as Node, (n) => n.type === "block").map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("composes with withSourceUrl without shadowing the document's first cell", () => {
    const root = withSourceUrl(withPep723Deps(parseMarkdown(mdWithBlock)), "https://x/y");
    const values = findAll(root as Node, (n) => n.type === "code").map((n) => n.value);
    expect(values[0]).toContain("SOURCE_URL");
    expect(values[1]).toContain("%pip install");
  });

  it("is a no-op without a metadata block, or when the block is not in the first cell", () => {
    const plain = parseMarkdown("# Doc\n\n```{code-cell} python\nprint(1)\n```");
    expect(withPep723Deps(plain)).toBe(plain);
    // juv's convention is first-cell-only; a block buried later is ignored
    const late = parseMarkdown(
      `# Doc\n\n\`\`\`{code-cell} python\nprint(1)\n\`\`\`\n\n\`\`\`{code-cell} python\n${block}\n\`\`\`\n`,
    );
    expect(pep723Dependencies(late)).toEqual([]);
  });

  it("ignores blocks in non-executable code fences", () => {
    expect(pep723Dependencies(parseMarkdown(`# Doc\n\n\`\`\`python\n${block}\n\`\`\`\n`))).toEqual(
      [],
    );
  });
});
