/** An unpublished plan never offers a Stripe redirect: its button stays disabled with the reason. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const mocked = new WeakSet();

const SUB = { organization_id: 7, status: "active", plan_code: "core", plan_name: "Core", quantity: 5 };
const PLANS = [
  { id: 1, code: "core", name: "Core", description: "Essentials", monthly_price: 10, annual_price: 100, is_contract_priced: false, is_published: true },
  { id: 2, code: "advanced", name: "Advanced", description: "More", monthly_price: 20, annual_price: 200, is_contract_priced: false, is_published: false },
];

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/billingService.js", { exports: {
    billingService: {
      getMySubscription: async () => SUB,
      getMyEntitlements: async () => ({ states: {} }),
      getPlans: async () => ({ list: PLANS }),
      createCheckoutSession: async () => { throw new Error("must not be called"); },
      confirmCheckoutSession: async () => ({ status: "confirmed" }),
      cancelMySubscription: async () => ({}),
      reactivateMySubscription: async () => ({}),
      myDowngradeImpact: async () => ({ eligible: true, blockers: [] }),
      getMyPendingPlanChange: async () => ({ pending: null }),
      scheduleMyDowngrade: async () => ({}),
      cancelMyPendingPlanChange: async () => ({}),
    } } });
  t.mock.module("../src/service/pricingService.js", { exports: { requestPricing: async () => ({}) } });
  t.mock.module("react-router-dom", { exports: {
    useNavigate: () => () => {},
    useSearchParams: () => [new URLSearchParams(""), () => {}],
  } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: {
    useAuth: () => ({ user: { role: "admin", organization_id: 7 } }),
  } });
  t.mock.module("../src/components/OrgAdminSkeleton.jsx", { exports: {
    BillingSkeleton: () => React.createElement("div", null, "loading"),
  } });
}

test("an unpublished plan cannot start checkout", async (t) => {
  register(t);
  const { default: Page } = await import("../src/modules/organization-admin/BillingPlanPage.jsx");
  render(React.createElement(Page));
  await settle();
  const btn = screen.getByRole("button", { name: "Advanced unavailable" });
  assert.equal(btn.disabled, true);
  assert.match(btn.title, /not published/);
  // The published current plan is untouched.
  assert.ok(screen.getByRole("button", { name: "Currently Subscribed" }));
});
