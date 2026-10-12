/**
 * ZHR-33/34: no super-admin nav item may do nothing. Every link the super admin
 * sees must (a) have a route registered in App.jsx, (b) be allowed for the role
 * and not hard-blocked by ProtectedRoute, and (c) the two assistant items must
 * resolve to super-admin-owned pages instead of the blocked /hr-admin/ URLs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLE_ALLOWED_PREFIXES, ROLES } from "../src/config/roles.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const protectedSource = fs.readFileSync(new URL("../src/components/ProtectedRoute.jsx", import.meta.url), "utf8");

// Same list ProtectedRoute uses to bounce super_admin away.
const BLOCKED = (protectedSource.match(/blockedPrefixes = \[([^\]]+)\]/)?.[1] || "")
  .split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);

function hrefs(items, out = []) {
  for (const item of items || []) {
    if (item.href) out.push(item);
    if (item.children) hrefs(item.children, out);
  }
  return out;
}

const superAdminNav = filterSectionsForRole(sections, ROLES.SUPER_ADMIN)
  .flatMap((s) => hrefs(s.items))
  .map((i) => ({ label: i.label, path: i.href.split(/[?#]/)[0] }));

const allowed = (path) =>
  (ROLE_ALLOWED_PREFIXES[ROLES.SUPER_ADMIN] || []).some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
const blocked = (path) => BLOCKED.some((p) => path === p.slice(0, -1) || path.startsWith(p));
const registered = (path) => appSource.includes(`"${path}":`);

test("the route guard really blocks super_admin from /hr-admin/ (the original cause)", () => {
  assert.ok(BLOCKED.includes("/hr-admin/"), `blocked prefixes: ${BLOCKED}`);
});

test("every link a super admin sees has a registered route and passes the guard", () => {
  assert.ok(superAdminNav.length >= 20);
  const broken = [];
  for (const { label, path } of superAdminNav) {
    if (!registered(path)) broken.push(`${label} (${path}): no route registered`);
    else if (blocked(path)) broken.push(`${label} (${path}): blocked for super_admin`);
    else if (!allowed(path)) broken.push(`${label} (${path}): not in the super_admin allow-list`);
  }
  assert.deepEqual(broken, []);
});

test("Assistant Knowledge and Support Tickets open super-admin pages", () => {
  const byLabel = Object.fromEntries(superAdminNav.map((i) => [i.label, i.path]));
  assert.equal(byLabel["Assistant Knowledge"], "/super-admin/assistant-knowledge");
  assert.equal(byLabel["Support Tickets"], "/super-admin/support-tickets");
  assert.match(appSource, /"\/super-admin\/assistant-knowledge": <SuperAdminKnowledgePage \/>/);
  assert.match(appSource, /"\/super-admin\/support-tickets": <SuperAdminSupportTicketsPage \/>/);
});

test("organization admins keep their original /hr-admin/ links", () => {
  const orgNav = filterSectionsForRole(sections, ROLES.HR_ADMIN).flatMap((s) => hrefs(s.items)).map((i) => i.href);
  assert.ok(orgNav.includes("/hr-admin/assistant-knowledge"));
  assert.ok(orgNav.includes("/hr-admin/assistant-handoffs"));
  assert.ok(registered("/hr-admin/assistant-knowledge") && registered("/hr-admin/assistant-handoffs"));
});

test("super admin routes are guarded by role at the router level", () => {
  assert.match(appSource, /getAllowedRolesForPath\(path\)/);
  assert.ok(allowed("/super-admin/support-tickets") && allowed("/super-admin/assistant-knowledge"));
  for (const role of [ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.EMPLOYEE]) {
    const prefixes = ROLE_ALLOWED_PREFIXES[role] || [];
    assert.equal(prefixes.some((p) => "/super-admin/support-tickets".startsWith(p) && p !== "/"), false, role);
  }
});
