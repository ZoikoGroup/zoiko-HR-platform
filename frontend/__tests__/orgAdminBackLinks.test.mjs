/** QA bug 33: sidebar pages (Billing & Plan, Metrics) have no extra "Back to Dashboard" button; Pay Invoice, opened from
 * Billing & Plan, goes back there. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (name) => readFileSync(new URL(`../src/modules/organization-admin/${name}`, import.meta.url), "utf8");

test("Billing & Plan and Metrics have no Back to Dashboard button", () => {
  for (const page of ["BillingPlanPage.jsx", "MetricsPage.jsx"]) assert.ok(!src(page).includes("Back to Dashboard"), page);
});

test("Pay Invoice goes back to Billing & Plan", () => {
  const s = src("PayInvoicePage.jsx");
  assert.ok(!s.includes("Back to Dashboard"));
  assert.equal((s.match(/navigate\("\/organization-admin\/billing-and-plan"\)/g) || []).length, 2);
});
