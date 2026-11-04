import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });

test("Prompt 2 service calls use the mounted API prefixes and exact request bodies", async (t) => {
  const calls = [];
  const api = Object.fromEntries(["get", "post", "put"].map((method) => [method, (...args) => {
    calls.push([method, ...args]);
    return Promise.resolve({});
  }]));
  t.mock.module("../src/service/api.js", { exports: { api } });
  const svc = await import(`../src/service/onboardingPrompt2Service.js?t=${Math.random()}`);

  await svc.getPortalForms("a/b");
  await svc.savePortalForm("token", "HR-ONB-001", { city: "London" });
  await svc.submitPortalForm("token", "HR-ONB-003", { contact1_name: "Sam" }, true);
  await svc.getNewHireForms(42);
  await svc.verifyOnboardingForm(9);
  await svc.returnOnboardingForm(9, "Please correct");
  await svc.revealOnboardingForm(9);
  await svc.getPayrollVerifications();
  await svc.getFinanceViewers();
  await svc.setFinanceViewers([2, 3]);
  await svc.setChecklistException(7, { reason: "Waived", owner_id: 3, due_date: "2026-12-01", blocked_action: null });
  await svc.getMyOnboardingTasks();
  await svc.setMyOnboardingTaskCompleted(8, true);
  await svc.scheduleProbation(11, { start_date: "2026-11-01" });

  assert.deepEqual(calls[0], ["get", "/public/onboarding/a%2Fb/forms", { auth: false }]);
  assert.deepEqual(calls[1], ["put", "/public/onboarding/token/forms/HR-ONB-001", { values: { city: "London" } }, { auth: false }]);
  assert.deepEqual(calls[2], ["post", "/public/onboarding/token/forms/HR-ONB-003/submit",
    { values: { contact1_name: "Sam" }, declaration_accepted: true }, { auth: false }]);
  assert.deepEqual(calls.slice(3).map((call) => call[1]), [
    "/hr/onboarding/new-hires/42/forms", "/hr/onboarding/forms/9/verify", "/hr/onboarding/forms/9/return",
    "/hr/onboarding/forms/9/reveal", "/hr/onboarding/payroll-verifications", "/hr/onboarding/finance-viewers",
    "/hr/onboarding/finance-viewers", "/hr/onboarding/checklist-items/7/exception", "/hr/onboarding/my-tasks",
    "/hr/onboarding/my-tasks/8", "/hr/onboarding/probation/11",
  ]);
  assert.deepEqual(calls[5][2], { reason: "Please correct" });
  assert.deepEqual(calls[9][2], { employee_ids: [2, 3] });
  assert.deepEqual(calls[10][2], { reason: "Waived", owner_id: 3, due_date: "2026-12-01", blocked_action: null });
  assert.deepEqual(calls[12][2], { completed: true });
});

test("portal forms save drafts, submit with declaration, and keep masked values out of follow-up payloads", async (t) => {
  const calls = [];
  t.mock.module("../src/service/onboardingPrompt2Service.js", { exports: {
    getPortalForms: async () => ({ items: [{
      canonical_id: "HR-ONB-017", title: "Bank and Payroll Details", status: "DRAFT",
      values: { account_number: "•••• 1234" }, masked_keys: ["account_number"],
      fields: [
        { key: "account_number", label: "Account number", required: true, type: "text", classification: "FINANCIAL" },
        { key: "bank_name", label: "Bank name", required: true, type: "text" },
      ],
      declaration: "I confirm these details are correct.",
    }] }),
    savePortalForm: async (...args) => { calls.push(["save", ...args]); return { ...args[1], status: "DRAFT", values: { account_number: "•••• 1234", bank_name: args[2].bank_name }, masked_keys: ["account_number"] }; },
    submitPortalForm: async (...args) => { calls.push(["submit", ...args]); return { status: "SUBMITTED", values: { account_number: "•••• 1234", bank_name: args[2].bank_name }, masked_keys: ["account_number"] }; },
    errorMessage: (e, fallback) => e?.message || fallback,
  } });
  const { default: PortalStructuredForms } = await import(`../src/modules/zoiko-hr/onboarding/PortalStructuredForms.jsx?t=${Math.random()}`);
  render(React.createElement(PortalStructuredForms, { token: "portal-token" }));
  await settle();

  assert.equal(screen.getByLabelText("Account number *").getAttribute("placeholder"), "•••• 1234");
  fireEvent.change(screen.getByLabelText("Bank name *"), { target: { value: "North Bank" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await settle();
  assert.deepEqual(calls[0], ["save", "portal-token", "HR-ONB-017", { bank_name: "North Bank" }]);
  fireEvent.click(screen.getByLabelText("I confirm these details are correct."));
  fireEvent.click(screen.getByRole("button", { name: "Submit form" }));
  await settle();
  assert.deepEqual(calls[1], ["submit", "portal-token", "HR-ONB-017", { bank_name: "North Bank" }, true]);
  assert.ok(screen.getByRole("status").textContent.includes("submitted"));
});

test("HR review keeps payroll values masked until explicit reveal and handles finance denial", async (t) => {
  let revealCount = 0;
  let verifyCount = 0;
  t.mock.module("../src/service/onboardingPrompt2Service.js", { exports: {
    getNewHireForms: async () => ({ items: [{
      id: 12, canonical_id: "HR-ONB-017", title: "Bank and Payroll Details", status: "SUBMITTED",
      values: { account_number: "•••• 9876" }, masked_keys: ["account_number"],
      fields: [{ key: "account_number", label: "Account number", classification: "FINANCIAL" }],
    }], finance_permitted: false }),
    revealOnboardingForm: async () => { revealCount += 1; throw Object.assign(new Error("Only finance viewers"), { status: 403 }); },
    verifyOnboardingForm: async () => { verifyCount += 1; },
    returnOnboardingForm: async () => ({}),
    getPayrollVerifications: async () => ({ items: [] }),
    errorMessage: (error) => error.message,
  } });
  const { default: OnboardingFormsReview } = await import(`../src/modules/zoiko-hr/onboarding/OnboardingFormsReview.jsx?t=${Math.random()}`);
  render(React.createElement(OnboardingFormsReview, { hireId: 33 }));
  await settle();
  assert.ok(screen.getByText("•••• 9876"));
  assert.equal(screen.queryByText("123456789"), null);
  assert.equal(verifyCount, 0);
  fireEvent.click(screen.getByRole("button", { name: "Reveal financial details" }));
  await settle();
  assert.equal(revealCount, 1);
  assert.ok(screen.getByRole("alert").textContent.includes("Only finance viewers"));
  assert.equal(verifyCount, 0);
});

test("manager can complete an assigned onboarding task and gets a clear permission error", async (t) => {
  const calls = [];
  t.mock.module("../src/service/onboardingPrompt2Service.js", { exports: {
    getMyOnboardingTasks: async () => ({ items: [{
      id: 21, title: "Welcome the new hire", checklist: "Manager onboarding",
      new_hire_id: 8, new_hire_name: "Alex", due_date: "2026-11-01", completed: false,
      mandatory: true, overdue: true,
    }] }),
    setMyOnboardingTaskCompleted: async (...args) => { calls.push(args); throw Object.assign(new Error("Not your task"), { status: 403 }); },
    errorMessage: (error) => error.message,
  } });
  const { default: MyOnboardingTasks } = await import(`../src/modules/zoiko-hr/onboarding/MyOnboardingTasks.jsx?t=${Math.random()}`);
  render(React.createElement(MyOnboardingTasks));
  await settle();
  fireEvent.click(screen.getByRole("checkbox", { name: "Complete Welcome the new hire" }));
  await settle();
  assert.deepEqual(calls, [[21, true]]);
  assert.ok(screen.getByRole("alert").textContent.includes("Not your task"));
  assert.ok(screen.getByText("Overdue"));
});

test("probation schedule validates dates and submits review milestones in the backend shape", async (t) => {
  const calls = [];
  t.mock.module("../src/service/onboardingPrompt2Service.js", { exports: {
    scheduleProbation: async (...args) => { calls.push(args); return { event_id: 4 }; },
    errorMessage: (error) => error.message,
  } });
  const { default: ProbationScheduleForm } = await import(`../src/modules/zoiko-hr/onboarding/ProbationScheduleForm.jsx?t=${Math.random()}`);
  render(React.createElement(ProbationScheduleForm, {
    employeeId: 34,
    reviewers: [{ id: 5, first_name: "Jordan", last_name: "Manager" }],
  }));
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Overall reviewer"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Milestone name"), { target: { value: "Midpoint" } });
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-15" } });
  fireEvent.change(screen.getByLabelText("Objectives summary"), { target: { value: "Deliver agreed goals" } });
  fireEvent.click(screen.getByRole("button", { name: "Create probation schedule" }));
  await settle();
  assert.deepEqual(calls, [[34, {
    start_date: "2026-11-01",
    end_date: "2027-02-01",
    review_dates: [{ label: "Midpoint", date: "2026-12-15", with_id: 5 }],
    objectives_summary: "Deliver agreed goals",
    reviewer_id: 5,
  }]]);
  assert.ok(screen.getByRole("status").textContent.includes("created"));
});
