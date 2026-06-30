// Bridge to the host page when embedded as an iframe in source.coop.

// ponytail: height is non-sensitive, so target "*" rather than threading the
// parent origin through a param.
export function postHeight(height: number): void {
  window.parent.postMessage({ type: "myst-viewer:height", height }, "*");
}

/** Call `cb(el.scrollHeight)` whenever `el` resizes; returns a disconnect cleanup. */
export function observeHeight(
  el: Element,
  cb: (height: number) => void,
): () => void {
  const ro = new ResizeObserver(() => cb(el.scrollHeight));
  ro.observe(el);
  return () => ro.disconnect();
}
