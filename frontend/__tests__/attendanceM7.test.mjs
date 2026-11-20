/**
 * Attendance M7: the approvals queue — status tabs with counts, type filter, what each request asks for and how long it
 * has waited, approve (overtime with compensation) and refuse (reason required), own requests not decidable, empty state.
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
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const QUEUE = {
  total: 3, page: 1, per_page: 25, pending_total: 3,
  counts: { correction: { pending: 2, approved: 1, rejected: 0 }, overtime: { pending: 1, approved: 4, rejected: 1 } },
  items: [
    { type: "correction", id: 11, employee_id: 4, employee_name: "Asha Rao", employee_code: "E-004", department: "Engineering", date: "2026-11-17",
      status: "PENDING", reason: "forgot", kind: "missed_punch", original_check_in: "09:00", original_check_out: null,
      requested_check_in: "09:00", requested_check_out: "18:30", waiting_hours: 30.2, can_decide: true, own: false },
    { type: "overtime", id: 21, employee_id: 4, employee_name: "Asha Rao", employee_code: "E-004", department: "Engineering", date: "2026-11-17",
      status: "PENDING", reason: "Release night", start_time: "18:00", end_time: "20:00", hours: 2, emergency: true, pre_approved: false,
      waiting_hours: 5, can_decide: true, own: false },
    { type: "correction", id: 12, employee_id: 3, employee_name: "Mgr Person", date: "2026-11-16", status: "PENDING", reason: "system_issue",
      kind: "wrong_status", requested_status: "remote", waiting_hours: 0.4, can_decide: false, own: true },
  ],
};

const impl = {};
const mocked = new WeakSet();
function mockAll(t, over = {}) {
  const calls = { list: [], corrections: [], overtime: [] };
  Object.assign(impl, {
    listAttendanceApprovals: async (p) => { calls.list.push(p); return structuredClone(QUEUE); },
    decideCorrection: async (id, body) => { calls.corrections.push([id, body]); return {}; },
    decideOvertime: async (id, body) => { calls.overtime.push([id, body]); return {}; },
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/attendanceService.js", { exports: { listAttendanceApprovals: (...a) => impl.listAttendanceApprovals(...a) } });
    t.mock.module("../src/service/workDocumentsService.js", { exports: {
      decideCorrection: (...a) => impl.decideCorrection(...a), decideOvertime: (...a) => impl.decideOvertime(...a) } });
  }
  return calls;
}

async function renderPage() {
  const { default: Page } = await import(`../src/modules/zoiko-hr/attendance/ApprovalsPage.jsx?t=${Math.random()}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(Page))));
  await settle();
}

test("the queue: counts, what is asked, how long it has waited, own requests", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  assert.deepEqual(calls.list[0], { status: "pending", type: "all", page: 1, per_page: 25 });
  assert.ok(screen.getByRole("tab", { name: "Pending (3)" }));
  assert.ok(screen.getByRole("tab", { name: "Approved (5)" }));
  const items = within(screen.getByRole("list", { name: "Requests" })).getAllByRole("listitem");
  assert.match(items[0].textContent, /Recorded 09:00–— → Missed punch: 09:00–18:30/);
  assert.match(items[0].textContent, /Forgot to check in\/out.*waiting 30 h/);
  assert.match(items[1].textContent, /Overtime 18:00–20:00 · 2 h · emergency/);
  assert.match(items[2].textContent, /Wrong status: Remote/);
  assert.match(items[2].textContent, /Your own request — someone else decides it/);
  assert.equal(within(items[2]).queryByRole("button", { name: /Approve/ }), null);
});

test("filters go to the server and the counts follow the type", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Overtime" }));
  await settle();
  assert.equal(calls.list.at(-1).type, "overtime");
  assert.ok(screen.getByRole("tab", { name: "Approved (4)" }));
  fireEvent.click(screen.getByRole("tab", { name: /Refused/ }));
  await settle();
  assert.equal(calls.list.at(-1).status, "rejected");
});

test("approving overtime asks how it is compensated", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Approve overtime for Asha Rao" }));
  const d = screen.getByRole("dialog", { name: "Approve overtime for Asha Rao" });
  fireEvent.change(within(d).getByLabelText("Compensation"), { target: { value: "time_off" } });
  fireEvent.click(within(d).getByRole("button", { name: "Approve" }));
  await settle();
  assert.deepEqual(calls.overtime, [[21, { approve: true, reason: null, compensation_method: "time_off" }]]);
  assert.match(screen.getByRole("status").textContent, /Approved/);
});

test("refusing a correction needs a reason", async (t) => {
  const calls = mockAll(t);
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Refuse correction for Asha Rao" }));
  const d = screen.getByRole("dialog", { name: "Refuse correction for Asha Rao" });
  const refuse = within(d).getByRole("button", { name: "Refuse" });
  assert.equal(refuse.disabled, true);
  fireEvent.change(within(d).getByLabelText(/Reason \(required/), { target: { value: "Badge shows you left at 17:00" } });
  fireEvent.click(refuse);
  await settle();
  assert.deepEqual(calls.corrections, [[11, { approve: false, reason: "Badge shows you left at 17:00" }]]);
});

test("a server refusal is shown, and an empty queue says all caught up", async (t) => {
  mockAll(t, { decideCorrection: async () => { throw new Error("This request has already been decided."); } });
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Approve correction for Asha Rao" }));
  const d = screen.getByRole("dialog", { name: "Approve correction for Asha Rao" });
  fireEvent.click(within(d).getByRole("button", { name: "Approve" }));
  await settle();
  assert.match(within(d).getByRole("alert").textContent, /already been decided/);
  cleanup();
  mockAll(t, { listAttendanceApprovals: async () => ({ ...structuredClone(QUEUE), items: [], total: 0 }) });
  await renderPage();
  assert.ok(screen.getByText(/All caught up/));
});
