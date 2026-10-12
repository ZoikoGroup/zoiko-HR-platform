/** Invoices on the query cache: a recent revisit makes no request; a failure shows Retry; page change keeps rows. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const state = { calls: [], fail: false, delay: 0 };
const inv = (id) => ({ id, organization_id: 1, organization_name: "Acme", stripe_invoice_id: `in_${id}`, amount_due_cents: 1000, amount_paid_cents: 1000, currency: "USD", status: "paid", created_at: "2026-10-01T00:00:00Z" });
mock.module("../src/service/billingService.js", { exports: { billingService: {
  getPlatformInvoices: async (p) => {
    state.calls.push(p);
    await new Promise((r) => setTimeout(r, state.delay));
    if (state.fail) throw new Error("invoices are down");
    return { list: [inv(p.page === 2 ? 222 : 111)], total: 45 };
  },
} } });
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: { getOrganizations: async () => ({ organizations: [], total: 0 }) } } });
const { default: Page } = await import("../src/modules/super-admin/BillingInvoicesPage.jsx");

test("a revisit within the freshness window shows invoices at once and makes no request", async () => {
  state.calls = []; state.fail = false; state.delay = 0;
  const client = testQueryClient();
  const first = render(withQuery(h(Page), client));
  await settle();
  assert.match(document.body.textContent, /in_111/);
  assert.equal(state.calls.length, 1);
  first.unmount();
  render(withQuery(h(Page), client));
  assert.match(document.body.textContent, /in_111/);
  await settle();
  assert.equal(state.calls.length, 1);
});

test("a failed load shows the error with Retry, and Retry recovers", async () => {
  state.calls = []; state.fail = true; state.delay = 0;
  render(withQuery(h(Page)));
  await settle(200);
  const alert = screen.getByText(/invoices are down/).closest("div");
  state.fail = false;
  fireEvent.click(alert.querySelector("button"));
  await settle(200);
  assert.match(document.body.textContent, /in_111/);
  assert.equal(screen.queryByText(/invoices are down/), null);
});

test("next page keeps the current invoices visible while it loads", async () => {
  state.calls = []; state.fail = false; state.delay = 0;
  render(withQuery(h(Page)));
  await settle();
  state.delay = 400;
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await settle(80);
  assert.match(document.body.textContent, /in_111/, "old rows remain");
  await settle(600);
  assert.match(document.body.textContent, /in_222/);
});
