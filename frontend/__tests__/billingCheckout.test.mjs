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
      myDowngradeImpact: (...a) => svc.impact(...a),
      getMyPendingPlanChange: (...a) => svc.pending(...a),
      scheduleMyDowngrade: (...a) => svc.schedule(...a),
      cancelMyPendingPlanChange: (...a) => svc.keep(...a),
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
    impact: async () => ({ eligible: true, blockers: [{ category: "workflow", message: "Performance review cycles is not included in the Core plan.", severity: "warning" }] }),
    pending: async () => ({ pending: null }),
    schedule: async () => ({ effective_at: "2026-11-01T00:00:00Z", to_plan_code: "core" }),
    keep: async () => ({ pending: null }),
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
  assert.equal(screen.getByRole("button", { name: /Upgrade to Advanced via Stripe/ }).disabled, false);
});

test("an in-place price change (no Stripe redirect) says the plan changed", async (t) => {
  const calls = [];
  await open(t, {
    checkout: async (payload) => {
      calls.push(payload);
      return { checkout_url: null, updated: true, unchanged: false, message: "Plan updated. A confirmation email is on its way." };
    },
  });
  fireEvent.click(screen.getByRole("button", { name: /Upgrade to Advanced via Stripe/ }));
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
  fireEvent.click(screen.getByRole("button", { name: /Upgrade to Advanced via Stripe/ }));
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
  fireEvent.click(screen.getByRole("button", { name: /Upgrade to Advanced via Stripe/ }));
  await settle();
  assert.ok(screen.getAllByText(/past due/).length >= 1);
});


const ON_ADVANCED = { ...SUB, plan_code: "advanced", plan_name: "Advanced" };

test("on Advanced, the Core card says Downgrade, not Pay & Upgrade, and nothing happens until confirmed", async (t) => {
  const scheduled = [];
  await open(t, { sub: async () => ON_ADVANCED, schedule: async (p) => { scheduled.push(p); return { effective_at: "2026-11-01T00:00:00Z" }; } });
  assert.equal(screen.queryByRole("button", { name: /Pay & Upgrade/ }), null);
  fireEvent.click(screen.getByRole("button", { name: "Downgrade to Core" }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: "Confirm downgrade" });
  assert.match(dialog.textContent, /Performance review cycles is not included/);
  assert.match(dialog.textContent, /end of your current billing period/);
  assert.equal(scheduled.length, 0, "choosing a lower plan only shows the impact");
  fireEvent.click(screen.getByRole("button", { name: /Confirm downgrade to Core/ }));
  await settle();
  assert.deepEqual(scheduled, [{ target_plan_code: "core" }]);
});

test("a blocked downgrade explains why and cannot be confirmed", async (t) => {
  await open(t, { sub: async () => ON_ADVANCED, impact: async () => ({ eligible: false, blockers: [{ message: "SSO is configured." , severity: "blocking" }] }) });
  fireEvent.click(screen.getByRole("button", { name: "Downgrade to Core" }));
  await settle();
  assert.match(screen.getByRole("dialog", { name: "Confirm downgrade" }).textContent, /SSO is configured/);
  assert.equal(screen.getByRole("button", { name: /Confirm downgrade to Core/ }).disabled, true);
});

test("a scheduled downgrade is shown with its date and can be cancelled", async (t) => {
  const kept = [];
  await open(t, {
    sub: async () => ON_ADVANCED,
    pending: async () => ({ pending: { from_plan_code: "advanced", to_plan_code: "core", effective_at: "2026-11-01T00:00:00Z" } }),
    keep: async () => { kept.push(1); return { pending: null }; },
  });
  assert.match(document.body.textContent, /Downgrade scheduled\./);
  assert.ok(screen.getByRole("button", { name: /Switching on/ }).disabled);
  fireEvent.click(screen.getByRole("button", { name: /Keep my current plan/ }));
  await settle();
  assert.equal(kept.length, 1);
});

test("while still on the free evaluation the buttons say Subscribe", async (t) => {
  await open(t, { sub: async () => ({ ...SUB, status: "evaluation", plan_code: null, plan_name: null }) });
  assert.ok(screen.getByRole("button", { name: /Subscribe to Core via Stripe/ }));
  assert.ok(screen.getByRole("button", { name: /Subscribe to Advanced via Stripe/ }));
});

// ── ZHR-100: a settled payment is reflected in the current plan
test("coming back from Stripe the plan is read AFTER the payment is confirmed, so the new plan shows", async (t) => {
  const order = [];
  let paid = false;
  await open(t, {
    sub: async () => { order.push(paid ? "read-new" : "read-old"); return paid ? { ...SUB, plan_code: "advanced", plan_name: "Advanced" } : { ...SUB, status: "evaluation", plan_code: null, plan_name: null }; },
    confirm: async () => { order.push("confirm"); paid = true; return { status: "confirmed", message: "Payment confirmed. Your plan has been updated." }; },
  }, "?payment=success&session_id=cs_done_1");
  assert.deepEqual(order, ["confirm", "read-new"], "the pre-payment plan is never read first");
  const tiles = document.body.textContent;
  assert.match(tiles, /Advanced/);
  assert.match(tiles, /active/i);
});

test("a payment that cannot be confirmed yet says so and can be checked again", async (t) => {
  let attempts = 0;
  await open(t, {
    confirm: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Stripe checkout session retrieval failed");
      return { status: "confirmed", message: "Payment confirmed. Your plan has been updated." };
    },
  }, "?payment=success&session_id=cs_done_2");
  assert.match(document.body.textContent, /went through at Stripe, but we have not been able to confirm it/);
  fireEvent.click(screen.getByRole("button", { name: "Check payment again" }));
  await settle();
  assert.equal(attempts, 2);
  assert.doesNotMatch(document.body.textContent, /have not been able to confirm it/);
});

test("an extra payment that was refunded is explained, with no retry offered", async (t) => {
  await open(t, { confirm: async () => ({ status: "failed", message: "Your organization already has an active subscription, so this extra payment was cancelled and refunded." }) }, "?payment=success&session_id=cs_dup");
  assert.match(document.body.textContent, /cancelled and refunded/);
  assert.equal(screen.queryByRole("button", { name: "Check payment again" }), null);
});
