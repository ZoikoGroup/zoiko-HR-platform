/** Onboarding Settings is a real form backed by the API, and the Joining Report says what its average is based on. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const SETTINGS = {
  auto_template_ids: [2], required_document_categories: ["id_proof"], auto_send_portal_invite: true,
  portal_link_days: 30, reminder_days: 3, require_checklists_complete: true, require_documents_approved: false, welcome_message: "Hi",
};

function mockShell(t) {
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
}

async function loadSettings(t, over = {}) {
  const calls = { save: [] };
  let fails = over.failTimes || 0;
  mockShell(t);
  t.mock.module("../src/service/hrService.js", { exports: {
    getOnboardingSettings: async () => { if (fails > 0) { fails -= 1; throw new Error("Network down"); } return SETTINGS; },
    getOnboardingChecklistTemplates: async () => [{ id: 1, name: "IT Setup", category: "it" }, { id: 2, name: "HR Basics", category: "hr" }],
    saveOnboardingSettings: async (p) => { calls.save.push(p); if (over.saveError) throw over.saveError; return p; },
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/settings.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("settings load from the server and save exactly what the form shows", async (t) => {
  const calls = await loadSettings(t);
  assert.doesNotMatch(document.body.textContent, /Security Awareness|Company Overview|Facilities & Security/);
  assert.equal(screen.getByLabelText(/HR Basics/).checked, true);
  fireEvent.click(screen.getByLabelText(/IT Setup/));
  fireEvent.click(screen.getByLabelText("Bank details"));
  fireEvent.change(document.getElementById("os-reminder-days"), { target: { value: "0" } });
  assert.match(document.body.textContent, /0 means no reminders/);
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await settle();
  assert.deepEqual(calls.save[0], { ...SETTINGS, auto_template_ids: [2, 1], required_document_categories: ["id_proof", "bank_details"], reminder_days: 0 });
  assert.match(screen.getByRole("status").textContent, /saved/);
});

test("out-of-range values are refused before saving, and server refusals show under the field", async (t) => {
  const err = Object.assign(new Error("Link valid for must be 180 or less"), { validation: [{ loc: ["body", "portal_link_days"], msg: "Input should be less than or equal to 180" }] });
  const calls = await loadSettings(t, { saveError: err });
  fireEvent.change(document.getElementById("os-link-days"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await settle();
  assert.equal(calls.save.length, 0);
  assert.match(document.body.textContent, /1 to 180/);
  fireEvent.change(document.getElementById("os-link-days"), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  await settle();
  assert.equal(calls.save.length, 1);
  assert.ok(screen.getAllByRole("alert").some((a) => /180 or less/.test(a.textContent)));
});

test("a failed settings load shows Retry, and Retry loads the form", async (t) => {
  await loadSettings(t, { failTimes: 1 });
  assert.match(screen.getByRole("alert").textContent, /Network down/);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await settle();
  assert.ok(screen.getByRole("button", { name: "Save Settings" }));
});

async function loadReport(t, data, fail = 0) {
  let fails = fail;
  mockShell(t);
  t.mock.module("../src/service/hrService.js", { exports: {
    getOnboardingJoiningReport: async () => { if (fails > 0) { fails -= 1; throw new Error("Report broke"); } return data; },
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/onboarding/reports.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
}

test("the average says how many hires it is based on", async (t) => {
  await loadReport(t, { totalJoiners: 5, thisMonth: 1, thisQuarter: 2, completed: 3, avgDaysToOnboard: 12.5, avgDaysMeasured: 3, monthlyTrend: [{ month: "Oct 2026", count: 2 }] });
  assert.match(document.body.textContent, /Avg days from joining to completion \(based on 3 hires\)/);
  assert.match(document.body.textContent, /12\.5/);
  assert.ok(screen.getByText("Oct 2026"));
});

test("with no completed hires the average shows -", async (t) => {
  await loadReport(t, { totalJoiners: 0, thisMonth: 0, thisQuarter: 0, completed: 0, avgDaysToOnboard: 0, avgDaysMeasured: 0, monthlyTrend: [] });
  assert.ok(screen.getByText("-"));
});

test("a failed report load shows the error with Retry", async (t) => {
  await loadReport(t, { totalJoiners: 1, avgDaysMeasured: 0, monthlyTrend: [] }, 1);
  assert.match(screen.getByRole("alert").textContent, /Report broke/);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await settle();
  assert.ok(screen.getByText("Joining Report"));
});
