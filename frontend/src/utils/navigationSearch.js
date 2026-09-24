/**
 * Pure navigation search helpers used by the sidebar SearchBar.
 *
 * The sidebar used to render a stateless search input that did nothing.
 * These helpers turn the filtered navigation tree into a flat list of
 * navigable links whose label, href, or badge matches the query. When a
 * whole section title matches (e.g. "billing"), every leaf link under that
 * section is returned so the user can jump anywhere inside it.
 */
export function collectNavMatches(sections, query) {
  const q = (query || "").trim().toLowerCase();
  const results = [];
  const seen = new Set();

  const add = (item) => {
    if (!item || !item.href || seen.has(item.href)) return;
    seen.add(item.href);
    results.push(item);
  };

  const collectLeafs = (items) => {
    for (const item of items || []) {
      if (!item || item.sidebar === false) continue;
      if (item.href) add(item);
      if (item.children) collectLeafs(item.children);
    }
  };

  const collectMatching = (items) => {
    for (const item of items || []) {
      if (!item || item.sidebar === false) continue;
      const haystack = `${item.label || ""} ${item.href || ""} ${item.badge || ""}`.toLowerCase();
      if (item.href && haystack.includes(q)) add(item);
      if (item.children) collectMatching(item.children);
    }
  };

  if (!q) return results;

  for (const section of sections || []) {
    if ((section.title || "").toLowerCase().includes(q)) {
      collectLeafs(section.items);
    } else {
      collectMatching(section.items);
    }
  }

  return results;
}