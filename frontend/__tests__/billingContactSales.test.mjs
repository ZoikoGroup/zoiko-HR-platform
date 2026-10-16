/** Contact Sales on the Billing & Plan page opens a real request dialog and sends an
 *  Enterprise pricing request (stored, confirmed, visible to sales) instead of a dead-end toast. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const svc = { pricing: [] };
const router = { search: "" };
const mocked = new WeakSet();

const ORG_ID = 7;
const SUB = { organization_id: ORG_ID, status: "active", plan_code: "core", plan_name: "Core", quantity: 5 };
const PLANS = [
  { id: 1, code: "core", name: "Core plam", description: "Essentials", monthly_price: 10, annual_price: 100, is_contract_priced: false },
  { id: 3, code: "enterprise", name: "Enterprise", description: "Contract", monthly_price: null, annual_price: null, is_contract_priced: true },
];

function register(t) {
  if (mocked.has(t)) return;
  mocked.add(t);
  t.mock.module("../src/service/billingService.js", { exports: {
    billingService: {
      getMySubscription: async () => SUB,
      getMyEntitlements: async () => ({ states: {} }),
      getPlans: async () => ({ list: PLANS }),
      createCheckoutSession: async () => ({}),
      confirmCheckoutSession: async () => ({ status: "confirmed" }),
      cancelMySubscription: async () => ({}),
      reactivateMySubscription: async () => ({}),
      myDowngradeImpact: async () => ({ eligible: true, blockers: [] }),
      getMyPendingPlanChange: async () => ({ pending: null }),
      scheduleMyDowngrade: async () => ({}),
      cancelMyPendingPlanChange: async () => ({}),
    } } });
  t.mock.module("../src/service/pricingService.js", { exports: {
    requestPricing: async (p) => { svc.pricing.push(p); return { reference: "PR-TEST-1", message: "received", confirmation_email_sent: true }; },
  } });
  t.mock.module("react-router-dom", { exports: {
    useNavigate: () => () => {},
    useSearchParams: () => [new URLSearchParams(router.search), () => {}],
  } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: {
    useAuth: () => ({ user: { role: "admin", organization_id: ORG_ID, full_name: "Asha Rao", email: "asha@acmeltd.com" } }),
  } });
  t.mock.module("../src/components/OrgAdminSkeleton.jsx", { exports: {
    BillingSkeleton: () => React.createElement("div", null, "loading"),
  } });
}

async function open(t) {
  register(t);
  const { default: Page } = await import("../src/modules/organization-admin/BillingPlanPage.jsx");
  render(React.createElement(Page));
  await settle();
}

const fill = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("a typo in the stored plan name never reaches the page", async (t) => {
  await open(t);
  assert.ok(screen.getByRole("heading", { name: "Core" }), "the Core card shows the canonical label");
  assert.equal(document.body.textContent.includes("plam"), false);
});

test("Contact sales opens a prefilled dialog and sends an Enterprise request", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: /Contact sales/ }));
  await settle();
  assert.ok(screen.getByRole("dialog", { name: "Contact sales" }));
  assert.equal(document.getElementById("sales-fullName").value, "Asha Rao");
  assert.equal(document.getElementById("sales-workEmail").value, "asha@acmeltd.com");
  fill("sales-phone", "+91 98765 43210");
  fill("sales-company", "Acme Ltd");
  fill("sales-country", "India");
  fill("sales-companySize", "51-200");
  fill("sales-message", "Need EU hosting.");
  fireEvent.click(screen.getByText(/I agree that Zoiko HR may contact me/).previousElementSibling || document.querySelector('input[type="checkbox"]'));
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  await settle();
  assert.equal(svc.pricing.length, 1);
  assert.equal(svc.pricing[0].plan_interest, "enterprise");
  assert.equal(svc.pricing[0].work_email, "asha@acmeltd.com");
  assert.equal(svc.pricing[0].company, "Acme Ltd");
  assert.match(screen.getByRole("dialog", { name: "Contact sales" }).textContent, /PR-TEST-1/);
});

test("the dialog validates before anything is sent", async (t) => {
  svc.pricing.length = 0;
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: /Contact sales/ }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  await settle();
  assert.equal(svc.pricing.length, 0);
  const text = screen.getByRole("dialog", { name: "Contact sales" }).textContent;
  assert.match(text, /Enter your company name/);
  assert.match(text, /contact me about this request/);
});
