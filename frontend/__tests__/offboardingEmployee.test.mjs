/**
 * Offboarding, the employee side: the My Exit folder (Resign, Exit Status, Exit Tasks, Exit Interview, Exit Documents),
 * Offboarding Tasks (clearance work and a manager's decisions) and the public exit-documents link.
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 15)); }); };

const REASONS = [{ key: "better_opportunity", label: "Better opportunity" }, { key: "compensation", label: "Compensation" },
  { key: "performance", label: "Performance" }];
const NOTICE = { value: 30, unit: "calendar_days", label: "30 days", days: 30, end_date: "2099-12-31" };
const CASE = (over = {}) => ({
  id: 7, case_number: "EXT-2026-0007", status: "submitted", display_status: "submitted", exit_type: "resignation",
  exit_type_label: "Resignation", reason_category: "better_opportunity", reason: "New role", resignation_date: "2026-11-23",
  last_working_day: "2026-12-23", days_left: 30, notice_handling: "serve", notice_handling_label: "Serving notice",
  progress: { tasks_total: 3, tasks_done: 1, assets_pending: 1 }, ...over });
const ME = (over = {}) => ({ case: null, notice: NOTICE, reason_categories: REASONS, can_resign: true, summary: null, activity: [], ...over });

const impl = {};
const mocked = new WeakSet();
function mockService(t, over = {}) {
  const calls = { resign: [], withdraw: [], interview: [], decide: [], task: [] };
  Object.assign(impl, {
    getMyExit: async () => ME(), submitResignation: async (b) => { calls.resign.push(b); return { case: CASE() }; },
    withdrawResignation: async (r) => { calls.withdraw.push(r); return { case: CASE({ status: "withdrawn" }) }; },
    getMyExitTasks: async () => ({ items: [] }), setMyExitTask: async () => ({}),
    getMyExitInterview: async () => ({ interview: null }),
    saveMyExitInterview: async (answers, submit) => { calls.interview.push([answers, submit]);
      return { interview: { status: submit ? "submitted" : "draft", questions: impl._questions || [], answers } }; },
    getMyExitDocuments: async () => ({ items: [] }), downloadMyExitDocument: async () => {},
    getAssignedOffboardingTasks: async () => ({ items: [], open: 0, decisions: [] }),
    setAssignedOffboardingTask: async (...a) => { calls.task.push(a); return {}; },
    decideTeamResignation: async (...a) => { calls.decide.push(a); return {}; },
    getPublicExitDocument: async () => { throw Object.assign(new Error("Document not found"), { status: 404 }); },
    publicExitDocumentUrl: (tok) => `/public/offboarding/documents/${tok}/pdf`,
    errorMessage: (e, f) => (e && e.message) || f,
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/offboardingService.js", { exports: Object.fromEntries(
      Object.keys(impl).filter((k) => !k.startsWith("_")).map((k) => [k, (...a) => impl[k](...a)])) });
  }
  return calls;
}

async function renderAt(file, path, routePath = path) {
  const { default: Page } = await import(`${file}?t=${Math.random()}`);
  const Other = () => h("p", null, "redirected");
  render(h(MemoryRouter, { initialEntries: [path] }, h(Routes, null,
    h(Route, { path: routePath, element: h(Page) }),
    h(Route, { path: "*", element: h(Other) }))));
  await settle();
}
const PAGE = (name) => `../src/pages/Peoples/Employees/ESS/MyExit/${name}.jsx`;

test("with no exit, My Exit shows only the Resign tab", async (t) => {
  mockService(t);
  await renderAt(PAGE("Resign"), "/employee/ess/exit/resign");
  const nav = screen.getByRole("navigation", { name: "My Exit sections" });
  assert.deepEqual(within(nav).getAllByRole("link").map((a) => a.textContent), ["Resign"]);
  assert.match(screen.getByText(/Your notice period is/).textContent, /30 days/);
});

test("the resignation form checks its fields and sends them", async (t) => {
  const calls = mockService(t);
  await renderAt(PAGE("Resign"), "/employee/ess/exit/resign");
  fireEvent.click(screen.getByRole("button", { name: /Submit resignation/ }));
  await settle();
  assert.equal(screen.getAllByRole("alert").length, 2);
  assert.equal(calls.resign.length, 0);
  // performance / conduct are not reasons a person picks for themselves
  assert.equal(screen.queryByRole("option", { name: "Performance" }), null);
  fireEvent.change(screen.getByLabelText("Main reason"), { target: { value: "compensation" } });
  fireEvent.change(screen.getByLabelText("Your reason"), { target: { value: "  Better pay elsewhere " } });
  fireEvent.click(screen.getByRole("button", { name: /Submit resignation/ }));
  await settle();
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Submit resignation" }));
  await settle();
  assert.deepEqual(calls.resign, [{ reason_category: "compensation", reason: "Better pay elsewhere", requested_last_day: null }]);
});

test("once an approved resignation exists the other tabs appear", async (t) => {
  mockService(t, { getMyExit: async () => ME({ case: CASE({ status: "approved", display_status: "serving_notice" }), can_resign: false,
    summary: { my_tasks_total: 3, my_tasks_open: 2, interview_status: "sent", settlement_status: "draft", documents: 1, can_withdraw: true } }) });
  await renderAt(PAGE("ExitStatus"), "/employee/ess/exit/status");
  const nav = screen.getByRole("navigation", { name: "My Exit sections" });
  assert.deepEqual(within(nav).getAllByRole("link").map((a) => a.textContent),
    ["Resign", "Exit Status", "Exit Tasks", "Exit Interview", "Exit Documents"]);
  assert.ok(screen.getByText("1 of 3 done"));
  assert.ok(screen.getByText("Approved — serving notice"));
});

test("a hidden tab sends the person back to a visible one", async (t) => {
  mockService(t);
  await renderAt(PAGE("ExitTasks"), "/employee/ess/exit/tasks");
  assert.ok(screen.getByText("redirected"));
});

test("withdrawing after approval needs a reason for HR", async (t) => {
  const calls = mockService(t, { getMyExit: async () => ME({ case: CASE({ status: "approved", display_status: "serving_notice" }), can_resign: false,
    summary: { can_withdraw: true, documents: 0 } }) });
  await renderAt(PAGE("Resign"), "/employee/ess/exit/resign");
  fireEvent.click(screen.getByRole("button", { name: /Request withdrawal/ }));
  await settle();
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
  await settle();
  assert.match(within(screen.getByRole("alertdialog")).getByText(/Tell HR why/).textContent, /Tell HR why/);
  assert.equal(calls.withdraw.length, 0);
  fireEvent.change(within(screen.getByRole("alertdialog")).getByLabelText("Reason for withdrawing"), { target: { value: "Counter offer" } });
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Send request" }));
  await settle();
  assert.deepEqual(calls.withdraw, ["Counter offer"]);
});

test("the exit interview refuses a submit with required answers missing, then submits", async (t) => {
  const questions = [{ id: "q_reason", text: "Main reason?", type: "choice", required: true, options: ["compensation", "better_opportunity"] },
    { id: "q_role", text: "Role satisfaction", type: "rating", required: true },
    { id: "q_better", text: "What could we do better?", type: "text", required: false }];
  impl._questions = questions;
  const calls = mockService(t, {
    getMyExit: async () => ME({ case: CASE({ status: "approved", display_status: "serving_notice" }), can_resign: false,
      summary: { interview_status: "sent", documents: 0 } }),
    getMyExitInterview: async () => ({ interview: { status: "sent", questions, answers: {} } }) });
  await renderAt(PAGE("ExitInterview"), "/employee/ess/exit/interview");
  assert.ok(screen.getByText(/seen by HR only, not your manager/));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /2 left/);
  assert.equal(calls.interview.length, 0);
  fireEvent.click(screen.getByRole("radio", { name: "Compensation" }));
  fireEvent.click(screen.getByRole("radio", { name: "4" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await settle();
  assert.deepEqual(calls.interview, [[{ q_reason: "compensation", q_role: 4 }, true]]);
  assert.ok(screen.getByText(/Your exit interview is submitted/));
});

test("a manager approves and rejects a direct report's resignation in Offboarding Tasks", async (t) => {
  const decision = (id, name) => ({ id, case_number: `EXT-${id}`, reason_category: "compensation", last_working_day: "2026-12-23",
    notice_end_date: "2026-12-23", employee: { id: id * 10, name, job_title: "Engineer" } });
  const calls = mockService(t, { getAssignedOffboardingTasks: async () => ({ items: [], open: 0,
    decisions: [decision(1, "Asha Rao"), decision(2, "Ben Lee")] }) });
  await renderAt("../src/pages/Peoples/Employees/ESS/OffboardingTasks.jsx", "/employee/ess/offboarding-tasks");
  fireEvent.click(screen.getByRole("button", { name: "Approve resignation of Asha Rao" }));
  await settle();
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Approve" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Reject resignation of Ben Lee" }));
  await settle();
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reject" }));
  await settle();
  assert.equal(calls.decide.length, 1, "a rejection needs a reason");
  fireEvent.change(within(screen.getByRole("alertdialog")).getByLabelText("Decision note"), { target: { value: "Team is short-staffed" } });
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reject" }));
  await settle();
  assert.deepEqual(calls.decide, [[1, "approve", null], [2, "reject", "Team is short-staffed"]]);
});

test("clearance tasks are grouped by leaver and can be marked done", async (t) => {
  const task = { id: 5, title: "Revoke system access", owner_label: "IT", status: "open", due_date: "2020-01-01", overdue: true,
    case: { id: 7, case_number: "EXT-7", last_working_day: "2026-12-23", employee: { id: 1, name: "Asha Rao" } } };
  const calls = mockService(t, { getAssignedOffboardingTasks: async () => ({ items: [task], open: 1, decisions: [] }) });
  await renderAt("../src/pages/Peoples/Employees/ESS/OffboardingTasks.jsx", "/employee/ess/offboarding-tasks");
  assert.ok(screen.getByText("Asha Rao") && screen.getByText(/overdue/));
  fireEvent.click(screen.getByRole("button", { name: "Mark Revoke system access done" }));
  await settle();
  assert.deepEqual(calls.task, [[5, true, null]]);
});

test("the public exit-documents link explains an expired or wrong link", async (t) => {
  mockService(t);
  await renderAt("../src/pages/ExitDocumentsPage.jsx", "/exit-documents/abc", "/exit-documents/:token");
  assert.match(screen.getByRole("alert").textContent, /expired or is not valid/);
});

test("the public exit-documents link offers the download", async (t) => {
  mockService(t, { getPublicExitDocument: async () => ({ title: "Relieving letter", organization: "Acme Ltd", employee_name: "Asha Rao",
    expires_at: "2027-02-21T00:00:00" }) });
  await renderAt("../src/pages/ExitDocumentsPage.jsx", "/exit-documents/tok123", "/exit-documents/:token");
  assert.ok(screen.getByRole("heading", { name: "Relieving letter" }));
  assert.equal(screen.getByRole("link", { name: /Download PDF/ }).getAttribute("href"), "/public/offboarding/documents/tok123/pdf");
});
