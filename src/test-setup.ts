import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement ResizeObserver, which myst-to-react's code block uses
// (via useIsScrollable) to make wide code regions keyboard-scrollable. Stub it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
