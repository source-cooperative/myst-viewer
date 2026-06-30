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

// Live computation (@myst-theme/jupyter) keys each executable cell off the
// `block.key` of its `block[kind=notebook-code]` and the `id`/`key` of the
// cell's `outputs` node (see `notebookFromMdast` in @myst-theme/jupyter). The
// full MyST pipeline assigns these via a transform we don't run, so we assign
// our own stable, unique keys here. Without them multiple cells would collide
// on `undefined` and execute/route outputs to the wrong cell.
let keyCounter = 0;
function ensureKeys(nodes: AstNode[]): void {
  for (const node of nodes) {
    if (node.type === "block" && node.key == null) node.key = `mv-${++keyCounter}`;
    if (node.type === "outputs" && node.id == null && node.key == null) {
      node.id = `mv-out-${++keyCounter}`;
    }
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
