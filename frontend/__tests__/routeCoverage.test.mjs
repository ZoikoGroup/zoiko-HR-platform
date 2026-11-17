/** QA report #13, BUG-6: a link built as `/some/path/${id}` must land on a route that takes that parameter. Clicking a saved
 * candidate went to /zoiko-hr/recruitment/candidates/12, which had no route, so the portal fell back to the login page. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Every path a route table declares (PortalApp's overrides, App.jsx's <Route path="…">).
const routeText = `${read("src/routes/PortalApp.jsx")}\n${read("src/App.jsx")}`;
const ROUTES = new Set([
  ...[...routeText.matchAll(/"(\/[^"\s]*)"\s*:/g)].map((m) => m[1]),
  ...[...routeText.matchAll(/path="(\/[^"\s]*)"/g)].map((m) => m[1]),
]);

// Bases whose every value has its own static route (each learning section is listed in PortalApp).
const WHITELIST = new Set(["/zoiko-hr/learning/", "/employee/learning/"]);

/** "/a/b/" + param -> is there a route "/a/b/:something" (or "/a/b/*")? */
const hasParamRoute = (base) => [...ROUTES].some((r) => r.startsWith(base) && /^(:[A-Za-z_]\w*|\*)$/.test(r.slice(base.length)));

test("every navigate(`/…/${…}`) and to={`/…/${…}`} lands on a route with a parameter", () => {
  const missing = [];
  for (const file of sourceFiles(path.join(root, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:navigate\(\s*|to=\{\s*)`(\/[^`$?#]*\/)\$\{/g)) {
      const base = m[1];
      if (WHITELIST.has(base) || hasParamRoute(base)) continue;
      missing.push(`${path.relative(root, file)}: ${base}\${…}`);
    }
  }
  assert.deepEqual(missing, [], `links without a matching "/…/:param" route:\n${missing.join("\n")}`);
});

test("the candidate profile has its own route and an unknown address shows Page not found, not the login page", () => {
  assert.ok(ROUTES.has("/zoiko-hr/recruitment/candidates/:id"));
  const portal = read("src/routes/PortalApp.jsx");
  assert.match(portal, /element \|\| <RouteBoundary><NotFoundPage \/><\/RouteBoundary>/);
  assert.doesNotMatch(portal, /element \|\| <Navigate to="\/login"/);
  assert.match(read("src/components/NotFoundPage.jsx"), /Page not found/);
});
