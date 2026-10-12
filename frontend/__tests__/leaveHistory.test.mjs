/** ZHR-93: Leave History lists every request the person applied for, newest first, with the type they chose. */
import "./support/setup-jsdom.mjs";
import { withQuery } from "./support/queryWrapper.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());
// mocked once: the shared hook module is cached across tests, so per-test mocks would not reach it
const svc = { getLeaveRequests: async () => [] };
mock.module("../src/service/employee.js", { exports: { getLeaveRequests: (...a) => svc.getLeaveRequests(...a) } });
mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ id: 5 }) } });
mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("two applied leaves both appear, newest first, with the right type", async (t) => {
  const rows = [
    { id: 20, leave_type: "sick", start_date: "2026-10-12", end_date: "2026-10-12", days: 1, status: "pending", created_at: "2026-10-08T10:00:00" },
    { id: 21, leave_type: "casual", start_date: "2026-11-20", end_date: "2026-11-21", days: 2, status: "pending", created_at: "2026-10-08T10:00:00" },
  ];
  svc.getLeaveRequests = async () => rows;
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Leaves/Employee_LeaveHistory.jsx?t=${Math.random()}`);
  render(withQuery(React.createElement(Page)));
  await settle();
  const text = document.body.textContent;
  assert.ok(text.indexOf("Casual Leave") !== -1 && text.indexOf("Sick Leave") !== -1);
  assert.ok(text.indexOf("Casual Leave") < text.indexOf("Sick Leave"), "newest (id 21) first");
});

// ── ZHR-99
test("the approver column shows the name of whoever decided, and never a bare dash", async (t) => {
  const rows = [
    { id: 3, leave_type: "sick", start_date: "2026-10-12", end_date: "2026-10-12", days: 1, status: "approved", approved_by: "Priya Shah", reviewer_name: "Priya Shah", created_at: "2026-10-08T10:00:00" },
    { id: 2, leave_type: "casual", start_date: "2026-11-12", end_date: "2026-11-12", days: 1, status: "approved", approved_by: "-", reviewer_name: null, created_at: "2026-10-07T10:00:00" },
    { id: 1, leave_type: "annual", start_date: "2026-12-12", end_date: "2026-12-12", days: 1, status: "pending", approved_by: "-", reviewer_name: null, created_at: "2026-10-06T10:00:00" },
  ];
  svc.getLeaveRequests = async () => rows;
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Leaves/Employee_LeaveHistory.jsx?t=${Math.random()}`);
  render(withQuery(React.createElement(Page)));
  await settle();
  const cells = [...document.querySelectorAll("tbody tr")].map((tr) => tr.textContent);
  assert.match(cells[0], /Priya Shah/);
  assert.match(cells[1], /HR team/);
  assert.match(cells[2], /Awaiting approval/);
  assert.ok(cells.every((c) => !/(^|\s)-(\s|$)/.test(c.replace(/\d{2} \w{3} \d{4}/g, ""))), "no bare dash left in the rows");
});
