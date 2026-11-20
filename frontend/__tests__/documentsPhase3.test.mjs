/**
 * Documents Phase 3 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A4): the rebuilt Approval Workflow — one count source, no
 * "Pending (0)" while loading, a real error with Retry, "All caught up", separation of duties shown on the row, decisions
 * with a required reason, bulk approval with per-item results, the review lock, and the audit log tab.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const never = () => new Promise(() => {});

const ITEM = (over = {}) => ({
  document_id: 1, version_id: 11, version: 1, title: "Passport", category_key: "identity_proof", category_name: "Identity Proof",
  scope: "employee", source: "employee", employee: { id: 7, name: "Asha Rao", employee_id_str: "EMP-007" },
  uploaded_by: { id: 7, name: "Asha Rao" }, submitted_at: "2026-11-10T09:00:00Z", waiting_days: 5, overdue: true,
  status: "pending_approval", precheck: { status: "warn", checks: [{ code: "duplicate", status: "warn", message: "Same file as an earlier upload." }] },
  steps: [{ role: "hr_admin", status: "pending" }, { role: "admin", status: "pending" }], lock: null, can_decide: true,
  cannot_decide_reason: null, ...over,
});

const impl = {};
const mocked = new WeakSet();
function mockService(t, over = {}) {
  const calls = { approve: [], reject: [], reupload: [], bulk: [], lock: [], release: [] };
  Object.assign(impl, {
    getApprovalSummary: async () => ({ awaiting_review: 2, approved: 5, rejected: 1, sla_breached: 1 }),
    listApprovals: async () => ({ items: [ITEM(), ITEM({ document_id: 2, version_id: 22, title: "Degree", can_decide: false, cannot_decide_reason: "self", waiting_days: 1 })], total: 2, page: 1, per_page: 25 }),
    listDocumentAudit: async () => ({ items: [{ id: 1, at: "2026-11-12T10:00:00Z", action: "approved", actor: { name: "Hr User", role: "hr_admin" }, document_title: "Passport", employee: { name: "Asha Rao" } },
                                              { id: 2, at: "2026-11-12T11:00:00Z", action: "expired", actor: null, actor_type: "system" }], total: 2, page: 1, per_page: 50 }),
    exportDocumentAuditCsv: async () => "at,action\n",
    approveDocumentVersion: async (v) => { calls.approve.push(v); return {}; },
    rejectDocumentVersion: async (v) => { calls.reject.push(v); return {}; },
    requestDocumentReupload: async (v) => { calls.reupload.push(v); return {}; },
    bulkApproveDocuments: async (items) => { calls.bulk.push(items); return { results: [{ document_id: 1, ok: true }] }; },
    acquireReviewLock: async (id) => { calls.lock.push(id); return { locked_until: "x" }; },
    releaseReviewLock: async (id) => { calls.release.push(id); return null; },
    ...over,
  });
  if (!mocked.has(t)) {                          // a second call in the same test only swaps the implementation
    mocked.add(t);
    const exports = Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)]));
    t.mock.module("../src/service/documentsService.js", { exports });
  }
  return calls;
}

async function renderPage(path = "/zoiko-hr/documents/approvals") {
  const { default: Page } = await import(`../src/modules/zoiko-hr/documents/approvals/ApprovalWorkflowPage.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, { initialEntries: [path] }, h(Page))));
  await settle();
}

test("while loading, the Pending tab has no count; then the cards and the tab show the same number", async (t) => {
  mockService(t, { getApprovalSummary: never, listApprovals: never });
  await renderPage();
  assert.ok(screen.getByRole("tab", { name: /^Pending$/ }));
  assert.equal(screen.queryByText(/Pending \(0\)/), null);
  assert.equal(screen.getByTestId("card-awaiting_review").textContent, "—");
  cleanup();
  mockService(t);
  await renderPage();
  assert.ok(screen.getByRole("tab", { name: "Pending (2)" }));
  assert.equal(screen.getByTestId("card-awaiting_review").textContent, "2");
});

test("a failed load shows an error with Retry, and an empty queue says all caught up", async (t) => {
  mockService(t, { listApprovals: async () => { throw Object.assign(new Error("Server unavailable"), { status: 503 }); } });
  await renderPage();
  assert.match(screen.getByRole("alert").textContent, /Server unavailable/);
  assert.ok(screen.getByRole("button", { name: "Retry" }));
  assert.equal(screen.queryByText("All caught up"), null);
  cleanup();
  mockService(t, { listApprovals: async () => ({ items: [], total: 0, page: 1, per_page: 25 }) });
  await renderPage();
  assert.ok(screen.getByText("All caught up"));
});

test("rows show how long they wait, pre-check warnings, and why someone cannot decide", async (t) => {
  mockService(t);
  await renderPage();
  const passport = screen.getByText("Passport").closest("li");
  assert.match(within(passport).getByTestId("waiting").className, /rose/);              // > 3 days is red
  assert.ok(within(passport).getByText("1 warning"));
  const degree = screen.getByText("Degree").closest("li");
  const approve = within(degree).getByRole("button", { name: /Approve/ });
  assert.ok(approve.disabled);
  assert.match(approve.getAttribute("title"), /You uploaded this/);
});

test("rejecting needs a reason; the decision carries the version", async (t) => {
  const calls = mockService(t);
  await renderPage();
  fireEvent.click(within(screen.getByText("Passport").closest("li")).getByRole("button", { name: /Reject/ }));
  const dialog = screen.getByRole("dialog", { name: /Reject: Passport/ });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
  assert.equal(calls.reject.length, 0);
  fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "illegible" } });
  fireEvent.change(within(dialog).getByLabelText("What needs to change"), { target: { value: "Too blurry to read" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
  await settle();
  assert.deepEqual(calls.reject, [{ documentId: 1, versionId: 11, reasonCode: "illegible", note: "Too blurry to read" }]);
});

test("approving sends the version; bulk approval reports each item", async (t) => {
  const calls = mockService(t);
  await renderPage();
  fireEvent.click(within(screen.getByText("Passport").closest("li")).getByRole("button", { name: /Approve/ }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
  await settle();
  assert.deepEqual(calls.approve, [{ documentId: 1, versionId: 11, remark: undefined }]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Passport" }));
  assert.ok(screen.getByRole("checkbox", { name: "Select Degree" }).disabled);
  fireEvent.click(screen.getByRole("button", { name: "Approve selected" }));
  await settle();
  assert.deepEqual(calls.bulk, [[{ documentId: 1, versionId: 11 }]]);
  assert.match(screen.getByRole("status").textContent, /Approved 1/);
});

test("previewing a pending item holds the review lock and releases it on close", async (t) => {
  const calls = mockService(t);
  t.mock.module("../src/service/hrService.js", { exports: { getDocumentFile: async () => ({ blob: new Blob(["x"], { type: "image/png" }), filename: "p.png" }) } });
  await renderPage("/zoiko-hr/documents/approvals?item=1");
  assert.deepEqual(calls.lock, [1]);
  assert.ok(screen.getByRole("region", { name: /Preview of/ }));
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
  await settle();
  assert.deepEqual(calls.release, [1]);
});

test("the audit log tab lists who did what, including the system", async (t) => {
  mockService(t);
  await renderPage("/zoiko-hr/documents/approvals?tab=audit");
  const rows = screen.getAllByRole("row");
  assert.equal(rows.length, 3);
  assert.ok(within(rows[1]).getByText("Approved"));
  assert.ok(within(rows[2]).getByText("System"));
  assert.ok(screen.getByRole("button", { name: /Export CSV/ }));
});
