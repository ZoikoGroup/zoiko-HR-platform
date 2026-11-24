// Exports the platform's left menu (frontend/src/navigation.js) to
// backend/app/modules/assistant/platform_nav.json, the screen map the assistant
// uses to answer "where do I ..." / "how do I ..." questions and to build the
// platform guide.
// - roles: the roles whose sidebar shows the screen, computed with the
//   sidebar's own filter (filterSectionsForRole), so the assistant never
//   points someone at a screen their menu doesn't have.
// - about: what the page itself says it is for — its heading, description,
//   section titles and helper text, read from the page component the route
//   renders (routes/PortalApp.jsx) and the local components it imports. This
//   is how the assistant knows that "add a new employee" is Onboarding → New
//   Hires, not just a screen whose name contains "Employees".
// Re-run after changing the menu or page copy:  node backend/scripts/export_platform_nav.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../frontend/src");
const outFile = resolve(here, "../app/modules/assistant/platform_nav.json");

const { sections } = await import(pathToFileURL(resolve(src, "navigation.js")).href);
const { filterSectionsForRole } = await import(pathToFileURL(resolve(src, "hooks/useFilteredNavigation.js")).href);

// Roles that use the assistant (it is hidden for super_admin).
const ROLES = ["employee", "manager", "hr_admin", "admin"];

// ── route -> page component file ─────────────────────────────────────────────
const portalFile = resolve(src, "routes/PortalApp.jsx");
const portal = readFileSync(portalFile, "utf-8");
const componentFile = {};
for (const m of portal.matchAll(/const\s+(\w+)\s*=\s*lazyRoute\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g)) {
  componentFile[m[1]] = resolve(dirname(portalFile), m[2]);
}
for (const m of portal.matchAll(/import\s+(\w+)\s+from\s+["'](\.[^"']+)["']/g)) {
  componentFile[m[1]] ??= resolve(dirname(portalFile), m[2]);
}
// "/path": <Page />  or  "/path": <PlanGate featureKey="hr.x" ...><Page /></PlanGate> — read the page, not the gate,
// and remember which plan feature the screen needs.
const routeComponent = {};
const routePlanFeature = {};
for (const m of portal.matchAll(/["'](\/[^"']*)["']\s*:\s*(?:<PlanGate\b([^>]*)>\s*)?<\s*(\w+)/g)) {
  routeComponent[m[1]] = m[3];
  const feature = m[2] && m[2].match(/featureKey=["']([^"']+)["']/);
  if (feature) routePlanFeature[m[1]] = feature[1];
}

const withExt = (p) => [p, `${p}.jsx`, `${p}.js`, `${p}/index.jsx`, `${p}/index.js`].find((c) => existsSync(c) && c.match(/\.(jsx|js)$/));

// ── the text a page shows ────────────────────────────────────────────────────
// Human-readable copy only: starts with a capital, a few words, no code, CSS classes, URLs or template syntax.
const CODE = /[{}<>=`$\\|;]|=>|\bclassName\b|\bhttps?:|^\s*[A-Z_]{3,}\s*$|\.(jsx?|css|png|svg)\b/;
const isCopy = (s) => {
  const t = s.trim();
  if (t.length < 12 || t.length > 220 || CODE.test(t)) return false;
  if (!/^[A-Z0-9"“'(]/.test(t)) return false;
  return t.split(/\s+/).length >= 3;
};
// Status, empty-state, error and form-label copy says nothing about what a page is for.
const NOISE = /^(No |Loading|Failed|Unable|Error|Something went wrong|Try |Are you sure|Delete |Enter (a|an|the) |Please (enter|select)|Select |Search |Showing |Page \d|Back to )|\*$|\.\.\.$|…$|\b(successfully|not available|is required|already exists)\b|^[A-Z]\d|^[A-Z][a-z]+ (Mono|Sans|Serif)\b|^Zoiko HR Portal$/i;
// The page's own heading / description: title="...", subtitle: "...", const DESCRIPTION = "..."
const DESCRIBED = /\b(?:title|subtitle|description|heading|helper|intro|SUBTITLE|DESCRIPTION|TITLE|INTRO)\w*\s*[=:]\s*\{?\s*(["'])((?:(?!\1)[^\\\n]){12,220})\1/g;
const harvest = (code) => {
  const first = [], rest = [];
  for (const m of code.matchAll(DESCRIBED)) first.push(m[2]);
  // JSX text: >Some words<
  for (const m of code.matchAll(/>\s*([^<>{}]{12,220}?)\s*</g)) rest.push(m[1]);
  // other string literals used as copy
  for (const m of code.matchAll(/(["'])((?:(?!\1)[^\\\n]){12,220})\1/g)) rest.push(m[2]);
  const clean = (list) => list.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => isCopy(s) && !NOISE.test(s));
  return [...clean(first), ...clean(rest)];
};
const localImports = (file, code) =>
  [...code.matchAll(/import\s+[\w{},\s*]+\s+from\s+["'](\.{1,2}\/[^"']+)["']/g)]
    .map((m) => withExt(resolve(dirname(file), m[1])))
    .filter((f) => f && !/components[\\/](ui|common|shared)[\\/]|utils|hooks|service|api|context|config/i.test(f));

const MAX_ABOUT = 700;
function aboutFor(href) {
  const name = routeComponent[href];
  const file = name && withExt(componentFile[name] || "");
  if (!file) return "";
  const seen = new Set();
  const phrases = [];
  const visit = (f, depth) => {
    if (seen.has(f) || seen.size > 6) return;
    seen.add(f);
    const code = readFileSync(f, "utf-8");
    for (const p of harvest(code)) if (!phrases.includes(p)) phrases.push(p);
    if (depth < 1) for (const child of localImports(f, code)) visit(child, depth + 1);
  };
  visit(file, 0);
  let about = "";
  for (const p of phrases) {
    if (about.length + p.length + 3 > MAX_ABOUT) break;
    about += (about ? " · " : "") + p;
  }
  return about;
}

// ── menu walk ────────────────────────────────────────────────────────────────
const byHref = new Map();
const walk = (item, trail, section, role) => {
  const label = item.label || item.title || item.name;
  const path = [...trail, label];
  if (item.href) {
    const screen = byHref.get(item.href) || { section, path, href: item.href, roles: [] };
    if (role && !screen.roles.includes(role)) screen.roles.push(role);
    byHref.set(item.href, screen);
  }
  for (const child of item.children || []) walk(child, path, section, role);
};
for (const section of sections) for (const item of section.items) walk(item, [], section.title, null);
for (const role of ROLES) {
  for (const section of filterSectionsForRole(sections, role)) {
    for (const item of section.items) walk(item, [], section.title, role);
  }
}

const screens = [...byHref.values()].filter((s) => s.roles.length).map((s) => ({
  ...s,
  about: aboutFor(s.href),
  // plan feature the screen needs (PlanGate); the assistant checks it against the asker's organization at answer time
  ...(routePlanFeature[s.href] ? { plan_feature: routePlanFeature[s.href] } : {}),
}));
writeFileSync(outFile, JSON.stringify({ generated_from: "frontend/src/navigation.js + routes/PortalApp.jsx page copy", screens }, null, 1) + "\n");
const described = screens.filter((s) => s.about).length;
console.log(`${screens.length} screens (${described} with page text) visible to ${ROLES.join("/")} -> ${outFile}`);
