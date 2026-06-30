import { describe, it, expect, vi, afterEach } from "vitest";
import { postHeight } from "./iframeBridge";

describe("postHeight", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts the content height to the parent window", () => {
    const spy = vi.spyOn(window.parent, "postMessage");
    postHeight(742);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      { type: "myst-viewer:height", height: 742 },
      "*",
    );
  });
});
