/** ZHR-91 / ZHR-93: My Leave shows the leave the person really applied for, with the right type, newest first. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { formatLeaveType } from "../src/utils/leaveTypeUtils.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const REQUESTS = [
  { id: 12, leave_type: "casual", start_date: "2026-11-20", end_date: "2026-11-20", days: 1, status: "pending", created_at: "2026-10-08T10:00:00" },
  { id: 11, leave_type: "sick", start_date: "2026-10-12", end_date: "2026-10-13", days: 2, status: "pending", created_at: "2026-10-08T10:00:00" },
];
const BALANCES = [{ id: 1, leave_type: "sick", total_days: 10, used_days: 0, pending_days: 2, year: new Date().getFullYear() }];

async function load(t, { requests = REQUESTS, balances = BALANCES } = {}) {
  t.mock.module("../src/service/employee.js", { exports: { getLeaveRequests: async () => requests, getLeaveBalances: async () => balances, contactHR: async () => ({}), createLeaveRequest: async () => ({}) } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ id: 5 }), api: {}, API_BASE_URL: "" } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children, actions }) => React.createElement("div", null, actions, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Leaves/Employee_MyLeaveDashboard.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
}

test("the type is shown as applied: sick is Sick Leave, never Casual", () => {
  assert.equal(formatLeaveType("sick"), "Sick Leave");
  assert.equal(formatLeaveType("Sick Leave"), "Sick Leave");
  assert.equal(formatLeaveType("work_from_home"), "Work From Home");
});

test("both applied requests are listed with their own type, and the old sample request is gone", async (t) => {
  await load(t);
  const text = document.body.textContent;
  assert.match(text, /Sick Leave/);
  assert.match(text, /Casual Leave/);
  assert.doesNotMatch(text, /LR-2026-001/);
  assert.equal(document.querySelectorAll("h4").length, 2);
  assert.deepEqual([...document.querySelectorAll("h4")].map((h) => h.textContent), ["Casual Leave", "Sick Leave"], "newest request first");
  assert.match(text, /Pending Requests/);
});

test("filters work and the Apply for Leave button is on the page", async (t) => {
  await load(t, { requests: [...REQUESTS, { id: 10, leave_type: "annual", start_date: "2026-09-01", end_date: "2026-09-01", days: 1, status: "approved", created_at: "2026-09-01T10:00:00" }] });
  assert.ok(screen.getByRole("button", { name: /Apply for Leave/ }));
  fireEvent.click(screen.getByRole("button", { name: "approved" }));
  assert.equal(document.querySelectorAll("h4").length, 1);
  assert.match(document.body.textContent, /Annual Leave/);
  fireEvent.click(screen.getByRole("button", { name: "rejected" }));
  assert.match(document.body.textContent, /No rejected requests/);
});

test("with no balances the page says so and Contact HR opens a dialog", async (t) => {
  await load(t, { requests: [], balances: [] });
  assert.match(document.body.textContent, /No Leave Balances Configured/);
  fireEvent.click(screen.getByRole("button", { name: /Contact HR Department/ }));
  await settle();
  assert.ok(document.querySelector("[role=dialog]"));
});

// ── ZHR-97: an approval made after the page opened shows up without a manual reload
test("when HR approves while the page is open, the page shows Approved on the next refresh", async (t) => {
  let rows = REQUESTS.map((r) => ({ ...r }));
  let down = false;
  t.mock.module("../src/service/employee.js", { exports: { getLeaveRequests: async () => { if (down) throw new Error("offline"); return rows; }, getLeaveBalances: async () => BALANCES, contactHR: async () => ({}), createLeaveRequest: async () => ({}) } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ id: 5 }), api: {}, API_BASE_URL: "" } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children, actions }) => React.createElement("div", null, actions, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Leaves/Employee_MyLeaveDashboard.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  assert.equal(document.querySelectorAll("h4").length, 2);
  assert.doesNotMatch(document.body.textContent, /Approved by|Approved on/);
  rows = rows.map((r) => (r.id === 11 ? { ...r, status: "approved", reviewed_at: "2026-10-09T09:00:00", approved_by: "Priya Shah" } : r));
  // the person comes back to the tab
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  await act(async () => { window.dispatchEvent(new window.Event("focus")); await new Promise((r) => setTimeout(r, 80)); });
  assert.match(document.body.textContent, /Approved by Priya Shah on 09 Oct 2026/);
  fireEvent.click(screen.getByRole("button", { name: "approved" }));
  assert.equal(document.querySelectorAll("h4").length, 1);
  // a failed background refresh keeps what is on screen
  down = true;
  await act(async () => { window.dispatchEvent(new window.Event("focus")); await new Promise((r) => setTimeout(r, 80)); });
  assert.equal(document.querySelectorAll("h4").length, 1);
});
