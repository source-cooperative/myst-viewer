import { mystParse } from "myst-parser";

// ponytail: derive the root type from the parser itself rather than adding a
// direct dependency on `myst-common` just for the `GenericParent` type.
type MystRoot = ReturnType<typeof mystParse>;

/** Parse MyST markdown text into a MyST AST root. */
export function parseMarkdown(text: string): MystRoot {
  return mystParse(text);
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
