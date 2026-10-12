/** Shared Layers are Super Admin only: no sidebar section and no route access for any other role. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLE_ALLOWED_PREFIXES, ROLES } from "../src/config/roles.js";

const SHARED_LAYER_PATHS = [
  "/shared/id",
  "/shared/workflow",
  "/shared/hub",
  "/shared/connect",
  "/shared/documents",
  "/shared/expenses",
];

const ORG_ROLES = [ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE];

const allows = (role, path) =>
  ROLE_ALLOWED_PREFIXES[role].some((p) => path === p || path.startsWith(p.endsWith("/") ? p : p + "/"));
const hrefs = (list) =>
  list.flatMap((s) => s.items.flatMap((i) => [i.href, ...(i.children || []).map((c) => c.href)])).filter(Boolean);

for (const role of ORG_ROLES) {
  test(`${role} sidebar has no Shared Layers section or links`, () => {
    const nav = filterSectionsForRole(sections, role, [], "standard", null);
    assert.equal(nav.some((s) => s.title === "SHARED LAYERS"), false);
    const links = hrefs(nav);
    for (const p of SHARED_LAYER_PATHS) {
      assert.equal(links.includes(p), false, p);
    }
  });

  test(`${role} cannot open the Shared Layers pages, but keeps notifications`, () => {
    for (const p of SHARED_LAYER_PATHS) {
      assert.equal(allows(role, p), false, p);
    }
    assert.equal(allows(role, "/shared/notifications"), true);
    assert.ok(hrefs(filterSectionsForRole(sections, role, [], "standard", null)).includes("/shared/notifications"));
  });
}

test("no non-super-admin role holds a blanket /shared/ prefix", () => {
  for (const role of ORG_ROLES) {
    assert.equal(ROLE_ALLOWED_PREFIXES[role].includes("/shared/"), false, role);
  }
});

test("super admin still has Shared Layers", () => {
  const nav = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, [], "standard", null);
  assert.ok(nav.some((s) => s.title === "SHARED LAYERS"));
  const links = hrefs(nav);
  for (const p of SHARED_LAYER_PATHS) {
    assert.ok(links.includes(p), p);
  }
});
