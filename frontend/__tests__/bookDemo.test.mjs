/** Book a Demo: the rules, the public page, the login links, and the super admin follow-up page. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { EMPTY_DEMO, dateLimits, validateDemoForm, buildDemoPayload, serverDemoErrors } from "../src/utils/demoRequestForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const NOW = new Date(2026, 9, 9);
const GOOD = { ...EMPTY_DEMO, fullName: "Lee Park", workEmail: "lee@acme-corp.com", company: "Acme Corp", country: "India", companySize: "51-200", consent: true };

test("the rules, including the date window", () => {
  assert.deepEqual(validateDemoForm(GOOD, NOW), {});
  const e = validateDemoForm(EMPTY_DEMO, NOW);
  for (const k of ["fullName", "workEmail", "company", "country", "companySize", "consent"]) assert.ok(e[k], k);
  assert.ok(validateDemoForm({ ...GOOD, workEmail: "a@example.com" }, NOW).workEmail);
  assert.ok(validateDemoForm({ ...GOOD, preferredDate: "2026-10-08" }, NOW).preferredDate, "past date");
  assert.ok(validateDemoForm({ ...GOOD, preferredDate: "2027-06-01" }, NOW).preferredDate, "too far ahead");
  assert.equal(validateDemoForm({ ...GOOD, preferredDate: "2026-10-12" }, NOW).preferredDate, undefined);
  assert.deepEqual(dateLimits(NOW), { min: "2026-10-09", max: "2027-04-07" });
});

test("the payload", () => {
  const p = buildDemoPayload({ ...GOOD, workEmail: " Lee@ACME-corp.com ", interests: ["leave"], preferredTime: "morning" }, "Asia/Kolkata");
  assert.equal(p.work_email, "lee@acme-corp.com");
  assert.deepEqual(p.interests, ["leave"]);
  assert.equal(p.preferred_date, null);
  assert.equal(p.preferred_time, "morning");
  assert.equal(p.timezone, "Asia/Kolkata");
  assert.equal(p.demo_format, "live");
  assert.deepEqual(serverDemoErrors([{ loc: ["body", "preferred_date"], msg: "Value error, Choose today or a later date." }]), { preferredDate: "Choose today or a later date." });
});

async function open(t, impl) {
  const sent = [];
  t.mock.module("../src/service/demoService", { exports: {
    requestDemo: async (p) => { sent.push(p); return impl ? impl(p) : { reference: "DM-2026-000003", message: "ok", confirmation_email_sent: true }; },
    listDemoRequests: async () => ({ items: [], total: 0 }), updateDemoRequest: async () => ({}),
    listPricingRequests: async () => ({ items: [], total: 0 }), updatePricingRequest: async () => ({}),
  } });
  const { default: Page } = await import(`../src/pages/public/BookDemoPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/book-demo"] }, React.createElement(Routes, null, React.createElement(Route, { path: "/book-demo", element: React.createElement(Page) }))));
  return sent;
}
const val = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
const fill = () => {
  val("dm-fullName", "Lee Park"); val("dm-workEmail", "lee@acme-corp.com"); val("dm-company", "Acme Corp");
  val("dm-country", [...document.getElementById("dm-country").options].find((o) => o.value)?.value);
  val("dm-companySize", "51-200"); fireEvent.click(document.getElementById("dm-consent"));
};

test("an empty form shows what is missing and sends nothing", async (t) => {
  const sent = await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Book my demo" }));
  await settle();
  assert.ok(screen.getAllByRole("alert").length >= 5);
  assert.equal(sent.length, 0);
});

test("a booking is sent with topics, format and time, and the confirmation shows the reference", async (t) => {
  const sent = await open(t);
  fill();
  fireEvent.click(screen.getByText("Leave Management"));
  fireEvent.click(screen.getByRole("button", { name: /Recorded walkthrough/ }));
  fireEvent.click(screen.getByRole("button", { name: /Afternoon/ }));
  fireEvent.click(screen.getByRole("button", { name: "Book my demo" }));
  await settle();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].interests, ["leave"]);
  assert.equal(sent[0].demo_format, "recorded");
  assert.equal(sent[0].preferred_time, "afternoon");
  assert.match(document.body.textContent, /DM-2026-000003/);
  assert.match(document.body.textContent, /on its way to lee@acme-corp\.com/);
});

test("a server field error is shown on its field", async (t) => {
  await open(t, async () => { const e = new Error("bad"); e.status = 422; e.validation = [{ loc: ["body", "work_email"], msg: "Value error, Use a real email address." }]; throw e; });
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Book my demo" }));
  await settle();
  assert.match(document.getElementById("dm-workEmail-error").textContent, /real email/);
});

test("both Book a Demo buttons on the login page go to the page", async (t) => {
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ login: async () => {}, loginWithGoogle: async () => {}, error: null }) } });
  t.mock.module("../src/service/authService", { exports: { googleSignInEnabled: async () => false, resendVerification: async () => ({}) } });
  const { default: Login } = await import(`../src/pages/auth/LoginPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/login"] }, React.createElement(Login)));
  const links = screen.getAllByText("Book a Demo").map((el) => el.closest("a")?.getAttribute("href"));
  assert.deepEqual(links, ["/book-demo", "/book-demo"]);
});

test("the super admin page lists demo requests and changes a status", async (t) => {
  const updates = [];
  t.mock.module("../src/service/demoService", { exports: {
    requestDemo: async () => ({}),
    listDemoRequests: async () => ({ total: 1, items: [{ id: 5, reference: "DM-2026-000005", full_name: "Lee Park", job_title: "HR Director", work_email: "lee@acme-corp.com", phone: null, company: "Acme Corp", country: "India", company_size: "51-200", interests: ["leave"], preferred_date: "2026-10-12", preferred_time: "morning", timezone: "Asia/Kolkata", demo_format: "live", message: "Leave please", status: "new", created_at: "2026-10-09T10:00:00" }] }),
    updateDemoRequest: async (id, status) => { updates.push([id, status]); return { status }; },
    listPricingRequests: async () => ({ items: [], total: 0 }), updatePricingRequest: async () => ({}),
  } });
  const { default: Page } = await import(`../src/modules/super-admin/SalesRequestsPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/super-admin/demo-requests"] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/super-admin/:kind", element: React.createElement(Page) }))));
  await settle();
  assert.match(document.body.textContent, /DM-2026-000005/);
  assert.match(document.body.textContent, /Leave Management/);
  assert.match(document.body.textContent, /Asia\/Kolkata/);
  fireEvent.change(screen.getByLabelText("Status of DM-2026-000005"), { target: { value: "scheduled" } });
  await settle();
  assert.deepEqual(updates, [[5, "scheduled"]]);
});
