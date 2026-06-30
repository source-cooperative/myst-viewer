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
    // react-syntax-highlighter emits a <pre><code> for the code node.
    expect(container.querySelector("code")).toBeTruthy();
    expect(container.textContent).toContain("print(1)");
  });

  it("applies the theme to the article wrapper", () => {
    const { container } = render(<Article root={root} theme="dark" />);
    const article = container.querySelector("article");
    expect(article).toHaveAttribute("data-theme", "dark");
    expect(article?.className).toContain("dark");
  });
});
