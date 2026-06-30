import { mystParse } from "myst-parser";

// ponytail: derive the root type from the parser itself rather than adding a
// direct dependency on `myst-common` just for the `GenericParent` type.
export type MystRoot = ReturnType<typeof mystParse>;

// Minimal node shape we need to walk; mirrors the GenericNode fields we touch.
type AstNode = {
  type: string;
  children?: AstNode[];
  key?: string;
  id?: string;
  // code-cell / output carriers
  lang?: string;
  value?: string;
  executable?: boolean;
  kind?: string;
  jupyter_data?: unknown;
};

/**
 * `mystParse` leaves directives/roles as `mystDirective`/`mystRole` WRAPPER
 * nodes whose real content (an `admonition`, a `block > code`, …) sits in
 * `.children`. The full MyST pipeline runs transforms that lift these; we don't
 * pull those in (myst-transforms is transitive-only), so without this the
 * renderer matches `mystDirective` and shows a red "Unknown Directive" box.
 *
 * This unwrap replaces every directive/role node with its (recursively
 * unwrapped) children, so nested directives lift too and the AST is
 * render-ready. ponytail: ~a dozen lines beats a myst-transforms dependency.
 */
function unwrapDirectives(nodes: AstNode[]): AstNode[] {
  const out: AstNode[] = [];
  for (const node of nodes) {
    const children = node.children ? unwrapDirectives(node.children) : undefined;
    if (node.type === "mystDirective" || node.type === "mystRole") {
      if (children) out.push(...children);
    } else {
      out.push(children ? { ...node, children } : node);
    }
  }
  return out;
}

// Two jobs, one walk:
//  1. React keying — `MyST` renders each node with `key={node.key}`, so EVERY
//     keyless node needs one or React logs "unique key" warnings for sibling
//     prose (headings/paragraphs the routing pass below used to skip).
//  2. Compute routing — @myst-theme/jupyter keys each executable cell off the
//     `block.key` of its `block[kind=notebook-code]` and the `id`/`key` of the
//     cell's `outputs` node (see `notebookFromMdast`). The full MyST pipeline
//     assigns these via a transform we don't run; without them multiple cells
//     collide on `undefined` and route outputs to the wrong cell.
// Giving every keyless node `mv-${n}` satisfies (1) and, because `block`/
// `outputs` nodes are nodes too, also satisfies (2) — we just additionally
// ensure `outputs.id` (the field jupyter reads first) is set to its own key.
let keyCounter = 0;
function ensureKeys(nodes: AstNode[]): void {
  for (const node of nodes) {
    if (node.key == null) node.key = `mv-${++keyCounter}`;
    // jupyter routes outputs by `output.id ?? output.key`; mirror the key into
    // `id` so saved/live outputs stay matched to their cell.
    if (node.type === "outputs" && node.id == null) node.id = node.key;
    if (node.children) ensureKeys(node.children);
  }
}

/** Parse MyST markdown text into a render-ready MyST AST root. */
export function parseMarkdown(text: string): MystRoot {
  const root = mystParse(text);
  const children = unwrapDirectives(root.children as AstNode[]);
  ensureKeys(children);
  return { ...root, children: children as MystRoot["children"] };
}

/**
 * Parse Jupyter `.ipynb` JSON into a MyST AST root.
 *
 * Output reconciliation: rather than the bespoke `{type:'output', data}` node
 * this used to emit, each code cell is reconciled to the SAME MyST-native shape
 * that `.md` `{code-cell}` directives produce —
 *
 *   block[kind=notebook-code] > [ code{executable}, outputs > output[] ]
 *
 * — so both `.md` code-cells and `.ipynb` saved outputs render through the one
 * `@myst-theme/jupyter` path (`NotebookBlock` + `Outputs`/`Output`). Each saved
 * nbformat output is carried verbatim on `output.jupyter_data`, which is the
 * field `@myst-theme/jupyter`'s `Output` reads.
 *
 * ponytail: STATIC rendering of saved outputs (before Activate) is deferred —
 * the `outputs`/`output` renderers require an `ExecuteScopeProvider`, which we
 * only mount on Activate, so before then saved outputs render as nothing (never
 * "Unknown"). After Activate the kernel re-renders outputs live on run. Full
 * static saved-output rendering would mean mounting the execute scope passively
 * on load; out of scope for the opt-in MVP.
 */
export function parseNotebook(text: string): MystRoot {
  const nb = JSON.parse(text);
  const lang =
    nb.metadata?.language_info?.name ??
    nb.metadata?.kernelspec?.language ??
    "python";

  const children: AstNode[] = [];
  for (const cell of nb.cells ?? []) {
    const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source ?? "";
    if (cell.cell_type === "markdown") {
      children.push(...(parseMarkdown(source).children as AstNode[]));
    } else if (cell.cell_type === "code") {
      const outputNodes: AstNode[] = (cell.outputs ?? []).map((output: unknown) => ({
        type: "output",
        jupyter_data: output,
      }));
      children.push({
        type: "block",
        kind: "notebook-code",
        children: [
          { type: "code", lang, executable: true, value: source },
          { type: "outputs", children: outputNodes },
        ],
      });
    }
  }
  ensureKeys(children);
  return { type: "root", children: children as MystRoot["children"] };
}

/**
 * When the viewer is embedded with `?base=<product base URL>`, prepend ONE
 * visible, runnable code cell that defines `SOURCE_URL`, so authors' code can
 * read sibling files, e.g. `pd.read_parquet(f"{SOURCE_URL}/data.parquet")`.
 * The JupyterLite kernel keeps state across a session, so defining it in the
 * first cell makes it available to every later cell once the reader runs it.
 *
 * The cell uses the same executable shape as our reconciliation
 * (`block[kind=notebook-code] > [code, outputs]`) and goes through `ensureKeys`,
 * so it's runnable and its key/output routing can't collide with other cells.
 *
 * ponytail: public/unlisted products only. Restricted products are out of scope
 * — the viewer is a cross-origin iframe with no `sc_proxy_creds` cookie, so
 * presigned/cred-bearing URLs are a separate future design.
 */
export function withSourceUrl(root: MystRoot, base?: string): MystRoot {
  if (!base) return root;
  // JSON.stringify yields a valid double-quoted literal even for a stray `"`.
  const value = `SOURCE_URL = ${JSON.stringify(base)}  # base URL of this product's files`;
  const cell: AstNode = {
    type: "block",
    kind: "notebook-code",
    children: [
      { type: "code", lang: "python", executable: true, value },
      { type: "outputs", children: [] },
    ],
  };
  ensureKeys([cell]); // unique block.key / outputs.id (keyCounter is monotonic)
  return {
    ...root,
    children: [cell, ...(root.children as AstNode[])] as MystRoot["children"],
  };
}
