/**
 * Tests for the sidebar navigation search helper (utils/navigationSearch.js).
 *
 * Run with: node --test frontend/__tests__/navigationSearch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sections } from "../src/navigation.js";
import { collectNavMatches } from "../src/utils/navigationSearch.js";

const COMMAND_CENTER = {
  title: "COMMAND CENTER",
  items: [
    { label: "Dashboard", href: "/super-admin/dashboard", icon: () => null },
  ],
};

const BILLING = {
  title: "BILLING & SUBSCRIPTION",
  items: [
    { label: "Overview", href: "/super-admin/billing", icon: () => null },
    { label: "Invoices", href: "/super-admin/billing/invoices", icon: () => null },
  ],
};

const NESTED = {
  title: "HR SUITE",
  items: [
    {
      label: "Performance",
      icon: () => null,
      children: [
        { label: "Reviews", href: "/zoiko-hr/performance/reviews", icon: () => null },
        { label: "Appraisals", href: "/zoiko-hr/performance/appraisals", icon: () => null },
      ],
    },
  ],
};

test("empty query returns no matches", () => {
  assert.deepEqual(collectNavMatches([COMMAND_CENTER, BILLING], ""), []);
  assert.deepEqual(collectNavMatches([COMMAND_CENTER, BILLING], "   "), []);
});

test("matches leaf items by label and href case-insensitively", () => {
  const results = collectNavMatches([COMMAND_CENTER, BILLING], "invoice");
  assert.equal(results.length, 1);
  assert.equal(results[0].href, "/super-admin/billing/invoices");

  const byHref = collectNavMatches([COMMAND_CENTER, BILLING], "billing/over");
  assert.equal(byHref.length, 1);
  assert.equal(byHref[0].href, "/super-admin/billing");
});

test("whole-section title match returns every leaf under the section", () => {
  const results = collectNavMatches([COMMAND_CENTER, BILLING], "billing");
  assert.deepEqual(results.map((r) => r.href), [
    "/super-admin/billing",
    "/super-admin/billing/invoices",
  ]);
});

test("searches into nested children", () => {
  const results = collectNavMatches([NESTED], "appraisals");
  assert.equal(results.length, 1);
  assert.equal(results[0].href, "/zoiko-hr/performance/appraisals");
});

test("does not duplicate matching results and never returns sidebar:hidden items", () => {
  const sectionsWithHidden = [
    {
      title: "MIXED",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: () => null },
        { label: "Secret", href: "/secret", sidebar: false, icon: () => null },
      ],
    },
  ];
  const results = collectNavMatches(sectionsWithHidden, "dashboard");
  assert.equal(results.length, 1);
  assert.equal(results[0].href, "/dashboard");
  assert.equal(collectNavMatches(sectionsWithHidden, "secret").length, 0);
});

test("every collected href resolves to a real route (no dead links)", () => {
  const results = collectNavMatches(sections, " ");
  assert.deepEqual(results, []);
  const all = sections.flatMap((s) => s.items ?? []);
  const sample = collectNavMatches(sections, all[0]?.label ?? "");
  for (const item of sample) {
    assert.ok(item.href, `collected item missing href: ${item.label}`);
  }
});