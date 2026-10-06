/**
 * ZHR-48: the Billing & Plan page must reflect a plan that was actually paid for.
 *
 * Three things used to be missing here:
 *   - the current plan offered a "Pay & Renew" button that would re-charge an
 *     org that already owned the plan,
 *   - an in-place price change (no Stripe redirect) reported "session created"
 *     and looked like nothing happened,
 *   - returning from Stripe only read `?payment=success`, which never proves
 *     the money moved, so the page could stay on the old plan forever.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const svc = {};
const router = { search: "", navigated: null };
const mocked = new WeakSet();

const ORG_ID = 7;

const SUB = {
  organization_id: ORG_ID,
  status: "active",
  plan_code: "core",
  plan_name: "Core",
  quantity: 5,
  renewal_anchor_date: "2026-11-01T00:00:00Z",
};

const PLANS = [
  { id: 1, code: "core", name: "Core", description: "Essentials", monthly_price: 10, annual_price: 100, is_contract_priced: false },
  { id: 2, code: "advanced", name: "Advanced", description: "More", monthly_price: 20, annual_price: 200, is_contract_priced: false },
];

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/billingService.js", { exports: {
    billingService: {
      getMySubscription: (...a) => svc.sub(...a),
      getMyEntitlements: (...a) => svc.ent(...a),
      getPlans: (...a) => svc.plans(...a),
      createCheckoutSession: (...a) => svc.checkout(...a),
      confirmCheckoutSession: (...a) => svc.confirm(...a),
      cancelMySubscription: (...a) => svc.cancel(...a),
      reactivateMySubscription: (...a) => svc.cancel(...a),
      myDowngradeImpact: (...a) => svc.cancel(...a),
    } } });
  t.mock.module("react-router-dom", { exports: {
    useNavigate: () => (path) => { router.navigated = path; },
    // Mirrors react-router: the setter persists the mutated params back into
    // the URL, which is what stops the page's param-cleanup effect from
    // looping forever once it has stripped `session_id`/`payment`.
    useSearchParams: () => [
      new URLSearchParams(router.search),
      (next) => { router.search = typeof next === "string" ? next : String(next); },
    ],
  } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: {
    useAuth: () => ({ user: { role: "admin", organization_id: ORG_ID } }),
  } });
  t.mock.module("../src/components/OrgAdminSkeleton.jsx", { exports: {
    BillingSkeleton: () => React.createElement("div", null, "loading"),
  } });
}

async function open(t, over = {}, search = "") {
  register(t);
  router.search = search;
  Object.assign(svc, {
    sub: async () => SUB,
    ent: async () => ({ states: {} }),
    plans: async () => ({ list: PLANS }),
    checkout: async () => ({ checkout_url: "https://checkout.stripe.com/c/pay/cs_1", checkout_session_id: "cs_1" }),
    confirm: async () => ({ status: "confirmed", message: "Payment confirmed. Your plan has been updated." }),
    cancel: async () => ({}),
  }, over);
  const { default: Page } = await import("../src/modules/organization-admin/BillingPlanPage.jsx");
  render(React.createElement(Page));
  await settle();
}

test("the plan the org already pays for offers no button that re-charges it", async (t) => {
  await open(t);
  assert.ok(screen.getAllByText("Currently Subscribed").length >= 1);
  const disabled = screen.getAllByRole("button", { name: /Currently Subscribed/ });
  assert.ok(disabled.length >= 1);
  assert.equal(disabled[0].disabled, true);
  // The other tier is still purchasable.
  assert.equal(screen.getByRole("button", { name: /Pay & Upgrade via Stripe/ }).disabled, false);
});

test("an in-place price change (no Stripe redirect) says the plan changed", async (t) => {
  const calls = [];
  await open(t, {
    checkout: async (payload) => {
      calls.push(payload);
      return { checkout_url: null, updated: true, unchanged: false, message: "Plan updated. A confirmation email is on its way." };
    },
  });
  fireEvent.click(screen.getByRole("button", { name: /Pay & Upgrade via Stripe/ }));
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].organization_id, ORG_ID);
  assert.equal(calls[0].plan_id, 2);
  assert.ok(screen.getByText(/Plan updated/));
  // No redirect: the page stayed and re-read the subscription.
  assert.equal(router.navigated, null);
});

test("buying the plan you are already on explains itself instead of double-billing", async (t) => {
  await open(t, {
    checkout: async () => ({
      checkout_url: null, updated: false, unchanged: true,
      message: "You are already on this plan — it renews automatically.",
    }),
  });
  fireEvent.click(screen.getByRole("button", { name: /Pay & Upgrade via Stripe/ }));
  await settle();
  assert.ok(screen.getByText(/renews automatically/));
});

test("returning from Stripe confirms the session before claiming success", async (t) => {
  const confirms = [];
  await open(t, {
    confirm: async (payload) => {
      confirms.push(payload);
      return { status: "confirmed", message: "Payment confirmed. Your plan has been updated." };
    },
  }, "?payment=success&session_id=cs_done_9");
  assert.equal(confirms.length, 1);
  assert.deepEqual(confirms[0], { organization_id: ORG_ID, checkout_session_id: "cs_done_9" });
  assert.ok(screen.getByText(/Payment confirmed/));
});

test("a failed checkout shows the server message rather than a generic error", async (t) => {
  await open(t, {
    checkout: async () => { throw new Error("Your subscription is past due. Settle the outstanding invoice before changing plans."); },
  });
  fireEvent.click(screen.getByRole("button", { name: /Pay & Upgrade via Stripe/ }));
  await settle();
  assert.ok(screen.getAllByText(/past due/).length >= 1);
});
