/**
 * Offboarding admin pages: the exit cases list and its filters, the New Exit form (last day from the notice rules, the
 * request body), approving a case from its page, and the Close button held back by what is still open.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); }); };

const EMP = { id: 5, name: "Asha Rao", employee_code: "E-5", email: "asha@x.test", job_title: "Engineer", department: "Platform",
  designation: null, date_of_joining: "2024-01-05", manager: { id: 2, name: "Mina Manager", employee_code: "M-2" }, is_active: true };

function caseRow(over = {}) {
  return {
    id: 11, case_number: "EXT-2026-0001", status: "submitted", display_status: "submitted", exit_type: "resignation",
    exit_type_label: "Resignation", source: "employee", reason_category: "compensation", reason: "Better pay elsewhere", employee: EMP,
    resignation_date: "2026-11-23", requested_last_day: null, notice_days: 30, notice_end_date: "2026-12-23", notice_handling: "serve",
    notice_handling_label: "Serving notice", last_working_day: "2026-12-23", days_left: 30, decided_by: null, decided_at: null,
    decision_note: null, withdrawal_requested_at: null, withdrawal_reason: null, access_revoked_at: null, exited_at: null, closed_at: null,
    created_at: "2026-11-23T10:00:00", progress: { tasks_total: 10, tasks_done: 3, mandatory_open: 6, assets_total: 1, assets_pending: 1 },
    requested_by: { id: 5, name: "Asha Rao" }, reportees_to: null, rehire_eligible: null, hr_notes: null, rehire_notes: null,
    closed_by: null, can_close: false, close_blockers: [], can_decide: true, ...over,
  };
}

const impl = {};
const mocked = new WeakSet();
function mockServices(t, over = {}) {
  const calls = { list: [], start: [], approve: [], getCase: 0, preview: [] };
  Object.assign(impl, {
    listExitCases: async (p) => { calls.list.push(p); return { items: [caseRow()], total: 1, page: 1, per_page: 25 }; },
    exportExitCases: async () => {},
    getNoticePreview: async (id, d) => { calls.preview.push([id, d]); return { notice: { value: 30, unit: "calendar_days", label: "30 days", days: 30, end_date: "2026-12-23" },
      direct_reports: 2, manager: { id: 2, name: "Mina Manager" }, open_case: null, employee: { id: 5, name: "Asha Rao", employee_code: "E-5" } }; },
    startExit: async (body) => { calls.start.push(body); return { id: 77 }; },
    getExitCase: async () => { calls.getCase += 1; return caseRow(); },
    approveExit: async (id, body) => { calls.approve.push([id, body]); return caseRow({ status: "approved", display_status: "serving_notice" }); },
    rejectExit: async () => ({}), decideWithdrawal: async () => ({}), cancelExit: async () => ({}), stopExitAccess: async () => ({}),
    closeExitCase: async () => ({}), updateExitCase: async () => ({}), getExitActivity: async () => ({ items: [] }),
    getCaseTasks: async () => ({ items: [] }), addCaseTask: async () => ({}), updateClearanceTask: async () => ({}),
    listAssetReturns: async () => ({ items: [] }), syncCaseAssets: async () => ({ added: 0 }), resolveAssetReturn: async () => ({}),
    getSettlement: async () => ({ settlement: null }), saveSettlement: async () => ({}), setSettlementStatus: async () => ({}),
    getCaseInterview: async () => ({ interview: null }), sendCaseInterview: async () => ({}), updateCaseInterview: async () => ({}),
    getCaseDocuments: async () => ({ items: [], kinds: [] }), issueCaseDocument: async () => ({}), revokeCaseDocument: async () => ({}),
    downloadCaseDocument: async () => {}, getResignationsInbox: async () => ({ pending: [], withdrawals: [] }),
    getOffboardingDashboard: async () => ({ kpis: {}, upcoming: [], open_by_type: [], recent_activity: [] }),
    errorMessage: (e, f = "Something went wrong.") => (e && e.message) || f,
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/offboardingService.js", { exports: Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)])) });
    t.mock.module("../src/service/hrService.js", { exports: { getHrEmployees: async () => ({ items: [{ id: 9, full_name: "Ben Boss", employee_code: "B-9" }] }) } });
  }
  return calls;
}

async function renderAt(file, path, url) {
  const { default: Page } = await import(`../src/modules/zoiko-hr/offboarding/${file}?t=${Math.random()}`);
  render(h(MemoryRouter, { initialEntries: [url] }, h(Routes, null,
    h(Route, { path, element: h(Page) }),
    h(Route, { path: "/zoiko-hr/offboarding/cases/:id", element: h("p", null, "CASE PAGE") }))));
  await settle();
}

test("exit cases list shows each case and the filters ask the server again", async (t) => {
  const calls = mockServices(t);
  await renderAt("cases.jsx", "/cases", "/cases");
  assert.equal(calls.list[0].status, "open");
  const row = screen.getByRole("row", { name: /Open exit case of Asha Rao/ });
  assert.ok(within(row).getByText("Awaiting decision"));
  assert.ok(within(row).getByText("1 to return"));
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "closed" } });
  fireEvent.change(screen.getByLabelText("Exit type"), { target: { value: "termination" } });
  await settle();
  const last = calls.list.at(-1);
  assert.equal(last.status, "closed");
  assert.equal(last.exit_type, "termination");
  fireEvent.click(row);
  await settle();
  assert.ok(screen.getByText("CASE PAGE"));
});

test("new exit: the last day comes from the notice rules and the form sends what HR chose", async (t) => {
  const calls = mockServices(t);
  await renderAt("new-exit.jsx", "/new", "/new?employee=5");
  assert.deepEqual(calls.preview[0][0], 5);
  assert.ok(screen.getByText(/Asha Rao/));
  const lwd = screen.getByLabelText(/Last working day/);
  assert.equal(lwd.value, "2026-12-23");
  // submitting without a type explains what is missing
  fireEvent.click(screen.getByRole("button", { name: /Start exit/ }));
  await settle();
  assert.ok(screen.getByText("Choose the type of exit."));
  assert.equal(calls.start.length, 0);
  fireEvent.change(screen.getByLabelText(/Type of exit/), { target: { value: "termination" } });
  fireEvent.change(screen.getByLabelText(/^Notice$/), { target: { value: "pay_in_lieu" } });
  await settle();
  const noticeDate = screen.getByLabelText(/Notice date/).value;
  assert.equal(screen.getByLabelText(/Last working day/).value, noticeDate, "pay in lieu: the last day is the notice date");
  fireEvent.change(screen.getByLabelText(/HR notes/), { target: { value: "Restructure" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Stop access now/ }));
  fireEvent.click(screen.getByRole("button", { name: /Start exit/ }));
  await settle();
  assert.equal(calls.start.length, 1);
  const body = calls.start[0];
  assert.equal(body.employee_id, 5);
  assert.equal(body.exit_type, "termination");
  assert.equal(body.notice_handling, "pay_in_lieu");
  assert.equal(body.last_working_day, noticeDate);
  assert.equal(body.hr_notes, "Restructure");
  assert.equal(body.stop_access_now, true);
  assert.ok(screen.getByText("CASE PAGE"));
});

test("case page: approving sends the chosen last day and reloads the case", async (t) => {
  const calls = mockServices(t);
  await renderAt("CaseDetail.jsx", "/zoiko-hr/offboarding/cases/:id", "/zoiko-hr/offboarding/cases/11");
  assert.equal(calls.getCase, 1);
  fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);
  await settle();
  const dialog = screen.getByRole("dialog", { name: /Approve exit of Asha Rao/ });
  fireEvent.change(within(dialog).getByLabelText(/Last working day/), { target: { value: "2026-12-15" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  await settle();
  assert.equal(calls.approve.length, 1);
  assert.equal(calls.approve[0][0], 11);
  assert.equal(calls.approve[0][1].last_working_day, "2026-12-15");
  assert.equal(calls.approve[0][1].notice_handling, "serve");
  assert.equal(calls.getCase, 2, "the case is loaded again after the decision");
  assert.equal(screen.queryByRole("dialog"), null);
});

test("case page: Close stays disabled and lists what is still open", async (t) => {
  mockServices(t, {
    getExitCase: async () => caseRow({ status: "exited", display_status: "exited", can_decide: false, can_close: false,
      close_blockers: ["2 required clearance task(s) are still open.", "1 asset(s) are not returned or written off."] }),
  });
  await renderAt("CaseDetail.jsx", "/zoiko-hr/offboarding/cases/:id", "/zoiko-hr/offboarding/cases/11");
  const close = screen.getByRole("button", { name: /Close case/ });
  assert.equal(close.disabled, true);
  const note = screen.getByRole("note", { name: "Before the case can close" });
  assert.match(note.textContent, /2 required clearance task/);
  assert.match(note.textContent, /1 asset/);
  assert.equal(screen.queryByRole("button", { name: "Approve" }), null);
});
