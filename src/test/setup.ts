import "@testing-library/jest-dom";

// This setup file runs for every suite, including the node-environment ones
// under api/, where there is no window to patch.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });

  // jsdom implements neither of these. Radix and cmdk call them on mount, so
  // without the stubs any test that opens a dialog or command palette throws
  // asynchronously — the test itself still passes, and the failure surfaces only
  // as an unhandled error after the run, which is easy to read as noise.
  if (!("ResizeObserver" in window)) {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    globalThis.ResizeObserver = (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver;
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
