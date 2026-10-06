/** ZHR-55: Work From Home is requestable by employees, and visible/labelled for admins. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

test("an employee can pick Work From Home on the Apply Leave form and it is submitted", async (t) => {
  const sent = [];
  t.mock.module("react-router-dom", { exports: { useNavigate: () => () => {} } });
  t.mock.module("../src/service/employee.js", { exports: { createLeaveRequest: async (p) => { sent.push(p); return {}; } } });
  const { default: Form } = await import("../src/pages/Peoples/Employees/Leaves/Employee_ApplyLeaveForm.jsx");
  render(React.createElement(Form));
  const select = document.querySelector('select[name="leave_type"]');
  const options = [...select.querySelectorAll("option")].map((o) => o.value);
  assert.ok(options.includes("Work From Home"), `Work From Home must be offered, got: ${options.join(", ")}`);
  fireEvent.change(select, { target: { name: "leave_type", value: "Work From Home" } });
  const dates = document.querySelectorAll('input[type="date"]');
  fireEvent.change(dates[0], { target: { name: "start_date", value: "2026-10-12" } });
  fireEvent.change(dates[1], { target: { name: "end_date", value: "2026-10-13" } });
  fireEvent.change(document.querySelector("textarea"), { target: { name: "reason", value: "Plumber visiting the house on Monday" } });
  fireEvent.submit(select.closest("form"));
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].leave_type, "Work From Home"); // the backend maps this label to work_from_home
});

test("the ESS leave screen offers Work From Home too", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/ess/leave-management.jsx", "utf8");
  assert.match(src, /value: "work_from_home", label: "Work From Home"/);
});

test("admin screens know the type: colours and a readable label, not work_from_home", () => {
  assert.match(fs.readFileSync("src/modules/zoiko-hr/leave/leave-requests.jsx", "utf8"), /work_from_home: "bg-emerald-500"/);
  assert.match(fs.readFileSync("src/modules/zoiko-hr/leave/leave-requests.jsx", "utf8"), /replace\(\/_\/g, " "\)/);
  assert.match(fs.readFileSync("src/modules/zoiko-hr/leave/leave-calendar.jsx", "utf8"), /work_from_home: "Work From Home"/);
  assert.match(fs.readFileSync("src/components/Badge.jsx", "utf8"), /work_from_home:/);
});

test("the Leave Dashboard WFH figure comes from the server's wfh count", async (t) => {
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getLeaveDashboard: async () => ({ total_requests: 3, pending_requests: 0, approved_requests: 3, rejected_requests: 0, total_days_taken: 4, on_leave_today: 1, wfh: 7, employee_count: 20 }),
    getLeaveBalances: async () => [], getLeaveRequests: async () => [] } });
  const { default: Dashboard } = await import("../src/modules/zoiko-hr/leave/dashboard.jsx");
  render(React.createElement(Dashboard));
  for (let i = 0; i < 4; i++) await settle();
  const hero = screen.getAllByText(/7\s+WFH/)[0];
  assert.ok(hero, "the hero shows the real WFH headcount");
});
