/** Request Pricing: the rules, the page, and what is sent to the server. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { EMPTY_FORM, suggestedPlan, validatePricingForm, buildPricingPayload, serverFieldErrors } from "../src/utils/pricingRequestForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const GOOD = { ...EMPTY_FORM, fullName: "Lee Park", workEmail: "lee@acme-corp.com", company: "Acme Corp", country: "India", companySize: "51-200", consent: true };

test("the rules", () => {
  assert.deepEqual(validatePricingForm(GOOD), {});
  const e = validatePricingForm(EMPTY_FORM);
  for (const k of ["fullName", "workEmail", "company", "country", "companySize", "consent"]) assert.ok(e[k], k);
  assert.ok(validatePricingForm({ ...GOOD, workEmail: "x@example.com" }).workEmail, "placeholder email");
  assert.ok(validatePricingForm({ ...GOOD, workEmail: "x@mailinator.com" }).workEmail, "disposable email");
  assert.ok(validatePricingForm({ ...GOOD, phone: "abc" }).phone);
  assert.equal(validatePricingForm({ ...GOOD, phone: "+91 98765 43210" }).phone, undefined);
});

test("a plan is suggested from the company size, and the payload is clean", () => {
  assert.equal(suggestedPlan("11-50"), "core");
  assert.equal(suggestedPlan("201-500"), "advanced");
  assert.equal(suggestedPlan("1000+"), "enterprise");
  assert.equal(suggestedPlan(""), null);
  const p = buildPricingPayload({ ...GOOD, workEmail: "  Lee@Acme-Corp.com ", phone: "", products: ["leave"] });
  assert.equal(p.work_email, "lee@acme-corp.com");
  assert.equal(p.phone, null);
  assert.equal(p.plan_interest, "advanced");
  assert.deepEqual(p.products, ["leave"]);
  assert.equal(buildPricingPayload({ ...GOOD, planInterest: "core" }).plan_interest, "core");
});

test("server validation errors land on their fields", () => {
  const out = serverFieldErrors([{ loc: ["body", "work_email"], msg: "Value error, Use a real email." }, { loc: ["body", "consent"], msg: "Please agree." }]);
  assert.deepEqual(out, { workEmail: "Use a real email.", consent: "Please agree." });
});

async function open(t, impl) {
  const sent = [];
  t.mock.module("../src/service/pricingService", { exports: { requestPricing: impl ? (p) => { sent.push(p); return impl(p); } : async (p) => { sent.push(p); return { reference: "PR-2026-000007", message: "ok", confirmation_email_sent: true }; } } });
  const { default: Page } = await import(`../src/pages/public/RequestPricingPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/request-pricing"] }, React.createElement(Routes, null, React.createElement(Route, { path: "/request-pricing", element: React.createElement(Page) }))));
  return sent;
}
const val = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
const fill = () => {
  val("pr-fullName", "Lee Park"); val("pr-workEmail", "lee@acme-corp.com"); val("pr-company", "Acme Corp");
  val("pr-country", [...document.getElementById("pr-country").options].find((o) => o.value)?.value);
  val("pr-companySize", "51-200"); fireEvent.click(document.getElementById("pr-consent"));
};

test("an empty form shows what is missing and sends nothing", async (t) => {
  const sent = await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Request pricing" }));
  await settle();
  assert.ok(screen.getAllByRole("alert").length >= 5);
  assert.equal(sent.length, 0);
});

test("a filled form is sent, the size suggests a plan, and the confirmation shows the reference", async (t) => {
  const sent = await open(t);
  fill();
  assert.match(document.body.textContent, /SUGGESTED FOR YOUR SIZE/);
  fireEvent.click(screen.getByText("Leave Management"));
  fireEvent.click(screen.getByRole("button", { name: "Request pricing" }));
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].plan_interest, "advanced");
  assert.deepEqual(sent[0].products, ["leave"]);
  assert.match(document.body.textContent, /PR-2026-000007/);
  assert.match(document.body.textContent, /lee@acme-corp\.com/);
});

test("when the confirmation email could not be sent the person is told, and the request is still received", async (t) => {
  await open(t, async () => ({ reference: "PR-2026-000008", message: "ok", confirmation_email_sent: false }));
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Request pricing" }));
  await settle();
  assert.match(document.body.textContent, /could not send the confirmation email/);
  assert.match(document.body.textContent, /PR-2026-000008/);
});

test("server errors are shown and the form stays", async (t) => {
  await open(t, async () => { const e = new Error("boom"); e.status = 429; throw e; });
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Request pricing" }));
  await settle();
  assert.match(screen.getAllByRole("alert")[0].textContent, /several requests/);
  assert.ok(screen.getByRole("button", { name: "Request pricing" }));
});

test("the login page card links to the page", async (t) => {
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ login: async () => {}, loginWithGoogle: async () => {}, error: null }) } });
  t.mock.module("../src/service/authService", { exports: { googleSignInEnabled: async () => false, resendVerification: async () => ({}) } });
  const { default: Login } = await import(`../src/pages/auth/LoginPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login"] }, React.createElement(Login)));
  assert.equal(screen.getByText("Request Pricing").closest("a").getAttribute("href"), "/request-pricing");
});
