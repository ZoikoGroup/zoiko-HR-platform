/**
 * Tests for useFilteredNavigation.js's filtering behavior on the super_admin
 * role, using the exported `filterSectionsForRole` pure-logic core rather
 * than the default hook — `node --test` has no React render context or
 * `localStorage` global, so the hook itself (which calls useMemo +
 * localStorage) can't be invoked directly here. `filterSectionsForRole` is
 * the exact same filtering logic the hook runs inside useMemo.
 *
 * This is the test that would have caught the "PLATFORM" title-collision
 * landmine documented in navigation.js and useFilteredNavigation.js: if the
 * rebuilt "PLATFORM ADMINISTRATION" group were ever renamed back to
 * "PLATFORM", SECTION_EXCLUSIONS.super_admin would silently drop it, and the
 * assertions below would fail loudly instead.
 *
 * Run with: node --test frontend/__tests__/useFilteredNavigation.superAdmin.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";
import { filterSectionsForRole } from "../src/hooks/useFilteredNavigation.js";
import { ROLES } from "../src/config/roles.js";

const EXPECTED_TITLES_IN_ORDER = [
  "COMMAND CENTER",
  "ORGANIZATIONS",
  "BILLING & SUBSCRIPTION",
  "PAYMENTS & RECONCILIATION",
  "ACCESS & SECURITY",
  "PLATFORM ADMINISTRATION",
];

test("useFilteredNavigation's filtering core returns all six groups for super_admin", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, []);
  const titles = filtered.map((s) => s.title);

  for (const title of EXPECTED_TITLES_IN_ORDER) {
    assert.ok(titles.includes(title), `super_admin filtered nav is missing section "${title}"`);
  }
});

test("USER MANAGEMENT still shows for super_admin", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, []);
  assert.ok(filtered.some((s) => s.title === "USER MANAGEMENT"));
});

test("every new billing/payments/access item survives filtering for super_admin", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, []);
  const allHrefs = filtered.flatMap((s) => s.items.map((i) => i.href));

  const expectedHrefs = [
    "/super-admin/dashboard",
    "/super-admin/organizations",
    "/super-admin/billing",
    "/super-admin/billing/plans",
    "/super-admin/billing/evaluations",
    "/super-admin/billing/plan-changes",
    "/super-admin/billing/invoices",
    "/super-admin/billing/refunds",
    "/super-admin/billing/discounts",
    "/super-admin/billing/delinquency",
    "/super-admin/billing/webhook-events",
    "/super-admin/billing/reconciliation",
    "/super-admin/access",
    "/super-admin/support-access",
    "/super-admin/audit-logs",
    "/super-admin/settings",
    "/super-admin/notifications",
  ];

  for (const href of expectedHrefs) {
    assert.ok(allHrefs.includes(href), `super_admin filtered nav is missing item with href "${href}"`);
  }
});

test("filtered super-admin nav never contains a section titled 'PLATFORM' verbatim", () => {
  const filtered = filterSectionsForRole(sections, ROLES.SUPER_ADMIN, []);
  assert.ok(!filtered.some((s) => s.title === "PLATFORM"));
});

test("regression guard: a group literally titled 'PLATFORM' would be dropped by SECTION_EXCLUSIONS", () => {
  // Proves the landmine is real: if navigation.js is ever edited to rename
  // "PLATFORM ADMINISTRATION" back to "PLATFORM", filtering silently drops
  // the whole group for super_admin — this is exactly the bug Step 0.2 of
  // the sidebar rebuild warned about.
  const decoySections = [
    ...sections,
    { title: "PLATFORM", items: [{ label: "Decoy", href: "/super-admin/decoy", icon: () => null }] },
  ];
  const filtered = filterSectionsForRole(decoySections, ROLES.SUPER_ADMIN, []);
  assert.ok(!filtered.some((s) => s.title === "PLATFORM"), "a section titled 'PLATFORM' must be excluded for super_admin");
});
