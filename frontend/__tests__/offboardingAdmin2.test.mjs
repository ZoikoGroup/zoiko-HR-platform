/**
 * Offboarding admin, part 2: Clearance Board (grouped by owner; Assign and Mark done), Asset Recovery (resolve posts the
 * outcome), Settings (one page-level Save) and clearance checklists (create posts the items).
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const h = React.createElement;
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

const TASKS = [
  { id: 1, case_id: 7, title: "Revoke system and e-mail access", owner_role: "it", owner_label: "IT", assignee: null, mandatory: true,
    due_date: "2026-11-20", status: "open", overdue: true, case: { id: 7, case_number: "EXT-2026-0001", employee: { id: 5, name: "Emp User" } } },
  { id: 2, case_id: 7, title: "Prepare final settlement", owner_role: "finance", owner_label: "Finance", assignee: { id: 9, name: "Fin User" },
    mandatory: true, due_date: "2026-12-30", status: "open", overdue: false, case: { id: 7, case_number: "EXT-2026-0001", employee: { id: 5, name: "Emp User" } } },
];
const SETTINGS = {
  approver: "manager_or_hr", second_approval_for_hr_exits: false, default_notice_days: 30, interview_auto_send: true,
  interview_questions: [{ id: "q_role", text: "How satisfied were you with your role?", type: "rating", required: true }],
  encashable_leave_types: ["annual"], daily_rate_divisor: 30, task_assignees: { hr: null, it: null, finance: null, admin: null },
  reminder_every_days: 3, contract_end_lookahead_days: 30, close_requires_settlement: true, documents_link_days: 90,
  auto_issue_acknowledgement: true,
};

const impl = {};
const mocked = new WeakSet();
function mockServices(t, over = {}) {
  const calls = { task: [], asset: [], settings: [], create: [] };
  Object.assign(impl, {
    errorMessage: (e, f = "Something went wrong.") => (e && e.message) || f,
    getClearanceBoard: async () => ({ items: structuredClone(TASKS), total: 2, overdue: 1 }),
    updateClearanceTask: async (id, body) => { calls.task.push([id, body]); return {}; },
    listAssetReturns: async () => ({ items: [{ id: 3, case_id: 7, asset_id: 1, asset_name: "Laptop", asset_tag: "LAP-1", status: "pending",
      condition: null, note: null, recovery_amount: null, case_number: "EXT-2026-0001", last_working_day: "2026-12-23",
      employee: { id: 5, name: "Emp User", employee_code: "E5" } }] }),
    resolveAssetReturn: async (id, body) => { calls.asset.push([id, body]); return {}; },
    getOffboardingSettings: async () => ({ settings: structuredClone(SETTINGS),
      templates: [{ id: 1, name: "Standard clearance", exit_types: [], items: [{ title: "A", owner_role: "hr", due_offset_days: 0, mandatory: true }],
        is_default: true, is_active: true }],
      leave_types: ["annual", "earned", "sick"], question_types: ["choice", "rating", "nps", "text", "yesno"], reason_categories: [] }),
    saveOffboardingSettings: async (body) => { calls.settings.push(body); return { settings: body }; },
    createChecklistTemplate: async (body) => { calls.create.push(body); return { id: 2, ...body }; },
    updateChecklistTemplate: async () => ({}), deleteChecklistTemplate: async () => null,
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("../src/service/offboardingService.js", { exports: Object.fromEntries(Object.keys(impl).map((k) => [k, (...a) => impl[k](...a)])) });
    t.mock.module("../src/service/hrService.js", { exports: {
      getHrEmployees: async () => ({ items: [{ id: 11, first_name: "It", last_name: "Person", employee_code: "E11", is_active: true },
        { id: 12, first_name: "Hr", last_name: "Person", employee_code: "E12", is_active: true }] }),
      getDepartments: async () => ({ data: [] }),
    } });
  }
  return calls;
}

async function renderPage(file) {
  const { default: Page } = await import(`../src/modules/zoiko-hr/offboarding/${file}?t=${Math.random()}`);
  render(h(MemoryRouter, null, h(Page)));
  await settle();
}

test("the clearance board groups tasks by owner, and Mark done / Assign send the right change", async (t) => {
  const calls = mockServices(t);
  await renderPage("clearance.jsx");
  const it = screen.getByRole("region", { name: "IT tasks" });
  assert.ok(within(it).getByText("Revoke system and e-mail access"));
  assert.match(within(it).getByText(/Due/).textContent, /overdue/);
  assert.ok(within(screen.getByRole("region", { name: "Finance tasks" })).getByText("Assigned to Fin User"));
  assert.equal(within(screen.getByRole("region", { name: "HR tasks" })).queryByRole("listitem"), null);
  fireEvent.click(screen.getByRole("button", { name: "Mark Prepare final settlement done" }));
  await settle();
  assert.deepEqual(calls.task[0], [2, { done: true }]);
  fireEvent.click(screen.getByRole("button", { name: "Assign Revoke system and e-mail access" }));
  await settle();
  await settle(20);                        // the people list loads after the search pause
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Assign to"), { target: { value: "11" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(calls.task[1], [1, { assignee_id: 11 }]);
});

test("marking a task not needed needs a reason and sends it", async (t) => {
  const calls = mockServices(t);
  await renderPage("clearance.jsx");
  fireEvent.click(screen.getByRole("button", { name: "Revoke system and e-mail access not needed" }));
  await settle();
  const dialog = screen.getByRole("dialog");
  const confirm = within(dialog).getByRole("button", { name: "Mark not needed" });
  assert.equal(confirm.disabled, true);
  fireEvent.change(within(dialog).getByLabelText("Why is it not needed?"), { target: { value: "No accounts" } });
  fireEvent.click(confirm);
  await settle();
  assert.deepEqual(calls.task[0], [1, { exception_reason: "No accounts" }]);
});

test("asset recovery records a lost asset with the amount to recover", async (t) => {
  const calls = mockServices(t);
  await renderPage("assets.jsx");
  const row = screen.getByText("Laptop").closest("tr");
  fireEvent.click(within(row).getByRole("button", { name: "Record Laptop LAP-1" }));
  await settle();
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByLabelText("Lost"));
  fireEvent.change(within(dialog).getByLabelText("Amount to recover (optional)"), { target: { value: "2500" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await settle();
  assert.deepEqual(calls.asset[0], [3, { status: "lost", note: null, recovery_amount: "2500" }]);
});

test("settings are saved together with one Save", async (t) => {
  const calls = mockServices(t);
  await renderPage("settings.jsx");
  const save = screen.getByRole("button", { name: "Save" });
  assert.equal(save.disabled, true, "nothing changed yet");
  fireEvent.click(screen.getByLabelText("HR only"));
  fireEvent.change(screen.getByLabelText("Default notice (calendar days)"), { target: { value: "45" } });
  fireEvent.click(screen.getByLabelText("Earned"));
  await settle(20);                        // the people list loads after the search pause
  fireEvent.change(screen.getByLabelText("IT items"), { target: { value: "11" } });
  fireEvent.click(screen.getByRole("button", { name: "Add question" }));
  fireEvent.change(screen.getByLabelText("Question 2"), { target: { value: "Anything else?" } });
  assert.equal(save.disabled, false);
  fireEvent.click(save);
  await settle();
  assert.equal(calls.settings.length, 1);
  const body = calls.settings[0];
  assert.equal(body.approver, "hr");
  assert.equal(body.default_notice_days, 45);
  assert.deepEqual(body.encashable_leave_types, ["annual", "earned"]);
  assert.equal(body.task_assignees.it, 11);
  assert.equal(body.interview_questions.length, 2);
  assert.equal(body.interview_questions[1].text, "Anything else?");
  assert.match(screen.getByRole("status").textContent, /saved/);
});

test("a new clearance checklist posts its name, exit types and items", async (t) => {
  const calls = mockServices(t);
  await renderPage("settings.jsx");
  fireEvent.click(screen.getByRole("button", { name: "New checklist" }));
  await settle();
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Terminations" } });
  fireEvent.click(within(dialog).getByLabelText("Termination"));
  fireEvent.change(within(dialog).getByLabelText("Item 1 title"), { target: { value: "Escort out" } });
  fireEvent.change(within(dialog).getByLabelText("Owner"), { target: { value: "admin" } });
  fireEvent.change(within(dialog).getByLabelText("Due (days from last day)"), { target: { value: "-1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save checklist" }));
  await settle();
  assert.deepEqual(calls.create[0], { name: "Terminations", exit_types: ["termination"],
    items: [{ title: "Escort out", description: null, owner_role: "admin", due_offset_days: -1, mandatory: true }] });
  assert.equal(screen.queryByRole("dialog"), null);
});

test("settlements list approves a draft and interviews show the HR-only note and reasons", async (t) => {
  const calls = { status: [] };
  mockServices(t, {
    listSettlements: async () => ({ items: [{ id: 4, case_id: 7, currency: "INR", status: "draft", total_earnings: 7000, total_deductions: 0,
      net_amount: 7000, paid_on: null, payment_reference: null, case_number: "EXT-2026-0001", last_working_day: "2026-12-23",
      employee: { id: 5, name: "Emp User", employee_code: "E5" } }] }),
    setSettlementStatus: async (id, s) => { calls.status.push([id, s]); return {}; },
    exportSettlements: async () => {},
    getInterviewAnalytics: async () => ({ items: [], summary: { sent: 2, submitted: 1, response_rate: 50, enps: 100 },
      by_reason: [{ key: "compensation", label: "Compensation", count: 1 }], by_department: [], by_month: [] }),
  });
  await renderPage("settlements.jsx");
  fireEvent.click(screen.getByRole("button", { name: "Approve settlement for Emp User" }));
  await settle();
  assert.deepEqual(calls.status[0], [7, "approved"]);
  cleanup();
  await renderPage("interviews.jsx");
  assert.ok(screen.getByText(/visible to HR only/));
  assert.ok(within(screen.getByRole("list", { name: "Reasons for leaving" })).getByText("Compensation"));
});


test("an automatic clearance item says it ticks itself, and the setting to close cases automatically is saved", async (t) => {
  const auto = { ...TASKS[1], auto_key: "settlement", auto_hint: "Ticks itself when the final settlement is marked paid or not applicable." };
  const calls = mockServices(t, { getClearanceBoard: async () => ({ items: [structuredClone(TASKS[0]), auto], total: 2, overdue: 1 }) });
  await renderPage("clearance.jsx");
  const finance = screen.getByRole("region", { name: "Finance tasks" });
  assert.ok(within(finance).getByText("Ticks itself when the final settlement is marked paid or not applicable."));
  cleanup();
  await renderPage("settings.jsx");
  const toggle = screen.getByRole("checkbox", { name: /Close a case automatically/ });
  assert.equal(toggle.checked, true, "on by default");
  fireEvent.click(toggle);
  const save = screen.getAllByRole("button", { name: /Save/ })[0];
  fireEvent.click(save);
  await settle();
  assert.equal(calls.settings.at(-1).auto_close, false);
});
