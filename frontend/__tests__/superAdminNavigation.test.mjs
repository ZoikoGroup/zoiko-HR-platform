/**
 * Tests for the rebuilt super-admin sidebar in src/navigation.js.
 *
 * Asserts the six group titles exist, each contains exactly the items from
 * the rebuild spec in the same order, and that no group is titled "PLATFORM"
 * verbatim — that exact title is hidden for super_admin by SECTION_EXCLUSIONS
 * in useFilteredNavigation.js (it targets an unrelated section shared by
 * other roles), so reusing it here would silently render the group empty.
 *
 * Run with: node --test frontend/__tests__/superAdminNavigation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";

const EXPECTED_GROUPS = [
  {
    title: "COMMAND CENTER",
    items: [
      { label: "Dashboard", href: "/super-admin/dashboard" },
    ],
  },
  {
    title: "ORGANIZATIONS",
    items: [
      { label: "Organizations", href: "/super-admin/organizations" },
    ],
  },
  {
    title: "BILLING & SUBSCRIPTION",
    items: [
      { label: "Overview", href: "/super-admin/billing" },
      { label: "Plans & Catalog", href: "/super-admin/billing/plans" },
      { label: "Evaluations & Trials", href: "/super-admin/billing/evaluations" },
      { label: "Plan Changes", href: "/super-admin/billing/plan-changes" },
      { label: "Invoices", href: "/super-admin/billing/invoices" },
      { label: "Refunds & Credits", href: "/super-admin/billing/refunds" },
      { label: "Discounts", href: "/super-admin/billing/discounts" },
      { label: "Delinquency & Collections", href: "/super-admin/billing/delinquency" },
    ],
  },
  {
    title: "PAYMENTS & RECONCILIATION",
    items: [
      { label: "Webhook Events", href: "/super-admin/billing/webhook-events" },
      { label: "Provider Reconciliation", href: "/super-admin/billing/reconciliation" },
    ],
  },
  {
    title: "ACCESS & SECURITY",
    items: [
      { label: "Access & Role Management", href: "/super-admin/access" },
      { label: "Support Access Grants", href: "/super-admin/support-access" },
      { label: "Audit Logs", href: "/super-admin/audit-logs" },
    ],
  },
  {
    title: "PLATFORM ADMINISTRATION",
    items: [
      { label: "Platform Settings", href: "/super-admin/settings" },
      { label: "Notifications", href: "/super-admin/notifications" },
    ],
  },
];

function findSection(title) {
  return sections.find((s) => s.title === title);
}

test("all six super-admin group titles exist in the exported nav structure", () => {
  for (const group of EXPECTED_GROUPS) {
    assert.ok(findSection(group.title), `missing section titled "${group.title}"`);
  }
});

test("none of the six rebuilt super-admin group titles is 'PLATFORM' verbatim", () => {
  // navigation.js legitimately still has an unrelated section literally
  // titled "PLATFORM" (shared by other roles) — that one is expected to
  // exist. What must NOT happen is the rebuilt super-admin group reusing
  // that exact title: SECTION_EXCLUSIONS hides "PLATFORM" for super_admin
  // (see useFilteredNavigation.js), so doing that would silently render the
  // rebuilt group empty. The full collision check (against the actual
  // filtered super_admin nav) lives in useFilteredNavigation.superAdmin.test.mjs.
  const rebuiltTitles = EXPECTED_GROUPS.map((g) => g.title);
  assert.ok(!rebuiltTitles.includes("PLATFORM"));
});

for (const group of EXPECTED_GROUPS) {
  test(`"${group.title}" contains exactly the expected items, in order`, () => {
    const section = findSection(group.title);
    assert.ok(section, `section "${group.title}" not found`);
    assert.equal(section.items.length, group.items.length, `expected ${group.items.length} items in "${group.title}", got ${section.items.length}`);
    group.items.forEach((expected, idx) => {
      const actual = section.items[idx];
      assert.equal(actual.label, expected.label, `item ${idx} of "${group.title}": expected label "${expected.label}", got "${actual.label}"`);
      assert.equal(actual.href, expected.href, `item ${idx} of "${group.title}": expected href "${expected.href}", got "${actual.href}"`);
      assert.ok(actual.icon, `item "${actual.label}" must have an icon component`);
    });
  });
}

test("no group reuses an icon across two rows within the same section", () => {
  for (const group of EXPECTED_GROUPS) {
    const section = findSection(group.title);
    const icons = section.items.map((item) => item.icon);
    const uniqueIcons = new Set(icons);
    assert.equal(uniqueIcons.size, icons.length, `section "${group.title}" reuses an icon across its rows`);
  }
});
