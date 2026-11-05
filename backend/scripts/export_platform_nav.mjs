// Exports the platform's left menu (frontend/src/navigation.js) to
// backend/app/modules/assistant/platform_nav.json, the screen map the assistant
// uses to answer "where do I ..." questions and to build the platform guide.
// Each screen records the roles whose sidebar shows it, computed with the
// sidebar's own filter (filterSectionsForRole), so the assistant never points
// someone at a screen their menu doesn't have.
// Re-run after changing the menu:  node backend/scripts/export_platform_nav.mjs
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../frontend/src");
const outFile = resolve(here, "../app/modules/assistant/platform_nav.json");

const { sections } = await import(pathToFileURL(resolve(src, "navigation.js")).href);
const { filterSectionsForRole } = await import(pathToFileURL(resolve(src, "hooks/useFilteredNavigation.js")).href);

// Roles that use the assistant (it is hidden for super_admin).
const ROLES = ["employee", "manager", "hr_admin", "admin"];

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

const screens = [...byHref.values()].filter((s) => s.roles.length);
writeFileSync(outFile, JSON.stringify({ generated_from: "frontend/src/navigation.js", screens }, null, 1) + "\n");
console.log(`${screens.length} screens visible to ${ROLES.join("/")} -> ${outFile}`);
