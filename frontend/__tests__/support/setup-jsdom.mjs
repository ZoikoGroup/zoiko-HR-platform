/**
 * __tests__/support/setup-jsdom.mjs
 * ------------------------------------
 * Installs a jsdom `window`/`document` on globalThis before React/RTL load,
 * so component tests can render into a DOM under plain `node --test` (no
 * browser). Import this FIRST (before "react-dom" or "@testing-library/react")
 * in any test file that renders a component — ES module evaluation order
 * runs static imports top-to-bottom, so this must be the first import line.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;

for (const key of [
  "document", "navigator", "HTMLElement", "Element", "Node", "getComputedStyle",
  // @testing-library/dom's waitFor needs MutationObserver to react to DOM
  // changes; without it on globalThis it hangs instead of polling.
  "MutationObserver", "Event", "CustomEvent", "requestAnimationFrame", "cancelAnimationFrame",
]) {
  if (!(key in globalThis)) globalThis[key] = window[key];
}
globalThis.window = window;

if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
