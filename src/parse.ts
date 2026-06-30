import { mystParse } from "myst-parser";

// ponytail: derive the root type from the parser itself rather than adding a
// direct dependency on `myst-common` just for the `GenericParent` type.
export type MystRoot = ReturnType<typeof mystParse>;

// Minimal node shape we need to walk; mirrors the GenericNode fields we touch.
type AstNode = { type: string; children?: AstNode[] };

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

/** Parse MyST markdown text into a render-ready MyST AST root. */
export function parseMarkdown(text: string): MystRoot {
  const root = mystParse(text);
  const children = unwrapDirectives(root.children as AstNode[]);
  return { ...root, children: children as MystRoot["children"] };
}

/**
 * Parse Jupyter `.ipynb` JSON into a MyST AST root: markdown cells are parsed
 * with `parseMarkdown`, code cells become a `code` node plus an `output` node
 * carrying any saved nbformat outputs verbatim (a later task renders them).
 */
export function parseNotebook(text: string): MystRoot {
  const nb = JSON.parse(text);
  const lang =
    nb.metadata?.language_info?.name ??
    nb.metadata?.kernelspec?.language ??
    "python";

  const children: MystRoot["children"] = [];
  for (const cell of nb.cells ?? []) {
    const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source ?? "";
    if (cell.cell_type === "markdown") {
      children.push(...parseMarkdown(source).children);
    } else if (cell.cell_type === "code") {
      children.push({ type: "code", lang, value: source });
      if (cell.outputs?.length) {
        children.push({ type: "output", data: cell.outputs });
      }
    }
  }
  return { type: "root", children };
}
