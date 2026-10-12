/** Refunds on the query cache: cached revisit, filters keep rows, and a decision refreshes the list, summary and invoices. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const calls = { list: 0, summary: 0, approve: [] };
let pending = true;
const REQ = { id: 5, organization_id: 2, organization_name: "Acme", request_type: "refund", amount_cents: 4200, currency: "USD", reason: "dup", requested_by: "ops@x.com", status: "pending_approval", created_at: "2026-10-09T10:00:00Z" };
mock.module("../src/service/billingService.js", { exports: { billingService: {
  listRefunds: async () => { calls.list += 1; return { list: pending ? [REQ] : [{ ...REQ, status: "approved_and_processed", approved_by: "root" }], total: 1 }; },
  getRefundSummary: async () => { calls.summary += 1; return { pending_count: pending ? 1 : 0, processed_count: pending ? 0 : 1, currency: "USD" }; },
  approveRefund: async (id) => { calls.approve.push(id); pending = false; return {}; }, rejectRefund: async () => ({}), requestRefund: async () => ({}),
} } });
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: { getOrganizations: async () => ({ organizations: [], total: 0 }) } } });
mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ role: "super_admin", user: { id: 1 } }) } });
mock.module("react-router-dom", { exports: { useParams: () => ({}), useNavigate: () => () => {} } });
const { default: Page } = await import("../src/modules/super-admin/BillingRefundsPage.jsx");
const { keys } = await import("../src/service/queryKeys.js");

test("a revisit within the freshness window shows the table at once with no new requests", async () => {
  calls.list = 0; calls.summary = 0; pending = true;
  const client = testQueryClient();
  const first = render(withQuery(h(Page), client));
  await settle(500);
  assert.equal(calls.list, 1);
  assert.equal(calls.summary, 1);
  assert.match(document.body.textContent, /Acme/);
  first.unmount();
  render(withQuery(h(Page), client));
  assert.match(document.body.textContent, /Acme/, "rows on the very first render");
  await settle(500);
  assert.equal(calls.list, 1);
  assert.equal(calls.summary, 1);
});

test("approving a request refetches the list and the summary and marks invoices stale", async () => {
  calls.list = 0; calls.summary = 0; calls.approve = []; pending = true;
  const client = testQueryClient();
  client.setQueryData(keys.billing.invoices.list({ page: 1, limit: 20 }), { list: [], total: 0 });
  render(withQuery(h(Page), client));
  await settle(500);
  fireEvent.click(screen.getAllByRole("button", { name: /^approve$/i })[0]);
  await settle(100);
  fireEvent.click(screen.getByRole("button", { name: /confirm approve/i }));
  await settle(500);
  assert.deepEqual(calls.approve, [5]);
  assert.equal(calls.list, 2, "list refetched");
  assert.equal(calls.summary, 2, "summary refetched");
  assert.equal(client.getQueryState(keys.billing.invoices.list({ page: 1, limit: 20 })).isInvalidated, true, "invoices marked stale");
  assert.match(document.body.textContent, /Approved by root/);
});
