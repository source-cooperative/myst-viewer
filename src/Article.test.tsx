import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Article } from "./Article";
import { parseMarkdown } from "./parse";

describe("Article", () => {
  const root = parseMarkdown('# Hello\n\n```python\nprint(1)\n```');

  it("renders heading text from the AST", () => {
    const { getByText } = render(<Article root={root} theme="light" />);
    expect(getByText("Hello")).toBeInTheDocument();
  });

  it("renders a code cell as static highlighted code", () => {
    const { container } = render(<Article root={root} theme="light" />);
    // myst-to-react's CodeBlock emits a <pre><code> for the code node.
    expect(container.querySelector("code")).toBeTruthy();
    expect(container.textContent).toContain("print(1)");
  });

  it("unwraps directives so admonitions render (no Unknown Directive)", () => {
    const directiveRoot = parseMarkdown(":::{note}\nhi there\n:::");
    const { container } = render(<Article root={directiveRoot} theme="light" />);
    expect(container.textContent).toContain("hi there");
    // A real admonition is an <aside>; the unrendered-directive fallback isn't.
    expect(container.querySelector("aside")).toBeTruthy();
    expect(container.textContent).not.toContain("Unknown Directive");
  });

  it("unwraps {code-cell} directives into a real code block", () => {
    const cellRoot = parseMarkdown("```{code-cell} python\nprint(1)\n```");
    const { container } = render(<Article root={cellRoot} theme="light" />);
    expect(container.querySelector("code")).toBeTruthy();
    expect(container.textContent).toContain("print(1)");
    expect(container.textContent).not.toContain("Unknown Directive");
  });

  it("applies the theme to the article wrapper", () => {
    const { container } = render(<Article root={root} theme="dark" />);
    const article = container.querySelector("article");
    expect(article).toHaveAttribute("data-theme", "dark");
    expect(article?.className).toContain("dark");
  });
});
