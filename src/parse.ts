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
  data?: { tags?: string[] };
  visibility?: "hide" | "remove";
};

/**
 * Map the standard Jupyter/MyST cell tags (`remove-input`, `hide-output`, …)
 * onto the `visibility` field that `myst-to-react` / `@myst-theme/jupyter`
 * already honor. Execution is unaffected — `notebookFromMdast` collects cells
 * regardless of visibility, so hidden code still runs. The full MyST pipeline
 * does this in a myst-cli transform we don't run.
 *
 * `remove-*` is deliberately DEMOTED to `hide-*` (a collapsed disclosure, not
 * `visibility: "remove"`): hidden cells still execute on Activate/`?run`, and
 * readers must always be able to inspect code before running it — never
 * fully-invisible executable code.
 */
function applyCellTags(block: AstNode): void {
  const tags = block.data?.tags;
  if (!tags?.length) return;
  const set = (node: AstNode | undefined, part: string) => {
    if (!node) return;
    if (tags.includes(`remove-${part}`) || tags.includes(`hide-${part}`))
      node.visibility = "hide";
  };
  set(block, "cell");
  set(block.children?.find((n) => n.type === "code"), "input");
  set(block.children?.find((n) => n.type === "outputs"), "output");
}

// `{code-cell}` directives put `:tags:` on `block.data.tags`; find them.
function applyTagVisibility(nodes: AstNode[]): void {
  for (const node of nodes) {
    if (node.type === "block") applyCellTags(node);
    if (node.children) applyTagVisibility(node.children);
  }
}

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
  applyTagVisibility(children);
  ensureKeys(children);
  // @myst-theme/jupyter's notebookFromMdast runs `node.children.reduce(...)`
  // over every top-level node when building the ThebeNotebook on Activate;
  // childless ones (thematicBreak, plain code fences) crash it. Inert for
  // rendering, so give them an empty array.
  for (const node of children) node.children ??= [];
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
      const block: AstNode = {
        type: "block",
        kind: "notebook-code",
        data: { tags: cell.metadata?.tags },
        children: [
          { type: "code", lang, executable: true, value: source },
          { type: "outputs", children: outputNodes },
        ],
      };
      applyCellTags(block);
      children.push(block);
    }
  }
  ensureKeys(children);
  return { type: "root", children: children as MystRoot["children"] };
}

// One runnable python cell in the same shape our reconciliation emits
// (`block[kind=notebook-code] > [code, outputs]`), keyed so its output routing
// can't collide with other cells (keyCounter is monotonic).
function pythonCell(value: string): AstNode {
  const cell: AstNode = {
    type: "block",
    kind: "notebook-code",
    children: [
      { type: "code", lang: "python", executable: true, value },
      { type: "outputs", children: [] },
    ],
  };
  ensureKeys([cell]);
  return cell;
}

/**
 * When the viewer is embedded with `?base=<product base URL>`, prepend ONE
 * visible, runnable code cell that defines `SOURCE_URL`, so authors' code can
 * read sibling files, e.g. `pd.read_parquet(f"{SOURCE_URL}/data.parquet")`.
 * The JupyterLite kernel keeps state across a session, so defining it in the
 * first cell makes it available to every later cell once the reader runs it.
 *
 * ponytail: public/unlisted products only. Restricted products are out of scope
 * — the viewer is a cross-origin iframe with no `sc_proxy_creds` cookie, so
 * presigned/cred-bearing URLs are a separate future design.
 */
export function withSourceUrl(root: MystRoot, base?: string): MystRoot {
  if (!base) return root;
  // JSON.stringify yields a valid double-quoted literal even for a stray `"`.
  const cell = pythonCell(
    `SOURCE_URL = ${JSON.stringify(base)}  # base URL of this product's files`,
  );
  return {
    ...root,
    children: [cell, ...(root.children as AstNode[])] as MystRoot["children"],
  };
}

function firstExecutableCode(nodes: AstNode[]): AstNode | undefined {
  for (const node of nodes) {
    if (node.type === "code" && node.executable) return node;
    const hit = node.children && firstExecutableCode(node.children);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Extract PEP 723 inline-script-metadata `dependencies` from the document's
 * FIRST executable code cell — the `juv` convention for `.ipynb`, mirrored for
 * `.md` `{code-cell}`s:
 *
 *   # /// script
 *   # dependencies = ["pandas==3.0.3", "lonboard"]
 *   # ///
 *
 * ponytail: no TOML parser — `dependencies = [...]` is the only field we read,
 * so a regex over the uncommented block covers it. Multi-field blocks work
 * because unrelated fields are simply never matched.
 */
export function pep723Dependencies(root: MystRoot): string[] {
  const code = firstExecutableCode(root.children as AstNode[]);
  const block = code?.value?.match(
    /^#\s*\/\/\/\s*script\s*$([\s\S]*?)^#\s*\/\/\/\s*$/m,
  );
  if (!block) return [];
  const toml = block[1].replace(/^#\s?/gm, "");
  const deps = toml.match(/dependencies\s*=\s*\[([^\]]*)\]/);
  if (!deps) return [];
  return [...deps[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
}

/**
 * If the document declares PEP 723 dependencies, prepend ONE visible, runnable
 * `%pip install` cell so the packages are installed in the JupyterLite kernel
 * before the rest of the document executes ("Run all" and `?run` go
 * top-to-bottom; manual readers see the install cell first).
 *
 * ponytail: version pins and markers are stripped ("pandas==3.0.3" → "pandas")
 * — Pyodide ships fixed builds of compiled packages, so micropip usually can't
 * honor exact pins; installing by name lets it resolve what the runtime has.
 * Extras (`pkg[extra]`) survive. Honoring pins when satisfiable is micropip's
 * call anyway, not ours.
 */
export function withPep723Deps(root: MystRoot): MystRoot {
  const names = [
    ...new Set(
      pep723Dependencies(root)
        .map((d) => d.replace(/\s*[=<>!~;@].*$/, "").trim())
        .filter(Boolean),
    ),
  ];
  if (!names.length) return root;
  // The annotation MUST be its own line: JupyterLite's `%pip install` magic
  // splits the install line on whitespace and hands every token to micropip, so
  // a trailing `# comment` there becomes bogus package names ("#", "from", …).
  const cell = pythonCell(
    `# installed from PEP 723 inline script metadata\n%pip install -q ${names.join(" ")}`,
  );
  return {
    ...root,
    children: [cell, ...(root.children as AstNode[])] as MystRoot["children"],
  };
}
