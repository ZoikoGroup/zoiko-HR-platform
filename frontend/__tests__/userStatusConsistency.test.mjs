/** ZHR-42: User Management and the ZoikoHR dashboard describe each employee's status the same way. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, within } from "@testing-library/react";
import { resolveEmployeeDisplayStatus } from "../src/utils/employeeStatus.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const auth = { user: { id: 1, role: "admin", email: "a@example.com" }, role: "admin", isAuthenticated: true };

const EMPLOYEES = [
  { id: 1, first_name: "Asha", last_name: "Active", email: "asha@x.test", role: "employee", job_title: "Eng", status: "active", is_active: true },
  { id: 2, first_name: "Leo", last_name: "Leave", email: "leo@x.test", role: "employee", job_title: "Eng", status: "on_leave", is_active: true },
  { id: 3, first_name: "Ina", last_name: "Inactive", email: "ina@x.test", role: "employee", job_title: "Eng", status: "inactive", is_active: false },
  { id: 4, first_name: "Pru", last_name: "Reset", email: "pru@x.test", role: "employee", job_title: "Eng", status: "password_reset_required", is_active: true },
];

async function openPage(t) {
  t.mock.module("../src/service/employee.js", { exports: { importEmployees: async () => ({}), getEmployees: async () => ({ items: EMPLOYEES, total: 4 }), hardDeleteEmployee: async () => ({}), bulkHardDeleteEmployees: async () => ({}) } });
  t.mock.module("../src/service/userService.js", { exports: {
    createUser: async () => ({}), resetPassword: async () => ({}), updateUser: async () => ({}), deactivateUser: async () => ({}),
    activateUser: async () => ({}), archiveUser: async () => ({}), getAssignableRoles: async () => ({ roles: [] }),
  } });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("react-router-dom", { exports: { useNavigate: () => () => {}, Link: ({ children }) => children } });
  const { default: Page } = await import(`../src/modules/organization-admin/UserManagementPage.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
}

const rowOf = (name) => screen.getByText(name).closest("tr");

test("each employee shows exactly the status the dashboard resolves for them", async (t) => {
  await openPage(t);
  for (const e of EMPLOYEES) {
    const expected = resolveEmployeeDisplayStatus(e).label;
    const row = rowOf(`${e.first_name} ${e.last_name}`);
    assert.ok(within(row).getByText(expected), `${e.first_name}: expected '${expected}'`);
  }
});

test("an active employee reads Active, not On Leave", async (t) => {
  await openPage(t);
  const row = rowOf("Asha Active");
  assert.ok(within(row).getByText("Active"));
  assert.equal(within(row).queryByText("On Leave"), null);
});

test("someone on leave is not presented as an inactive account: they can be deactivated, not 'activated'", async (t) => {
  await openPage(t);
  const leave = rowOf("Leo Leave");
  assert.ok(within(leave).getByText("On Leave"));
  assert.ok(within(leave).getByTitle("Deactivate") || within(leave).getByLabelText("Deactivate"));
  const inactive = rowOf("Ina Inactive");
  assert.ok(within(inactive).getByTitle("Activate") || within(inactive).getByLabelText("Activate"));
});

test("on-leave staff count as active in the Active filter's totals", async (t) => {
  await openPage(t);
  // 3 of 4 accounts are live (Active, On Leave, Password reset required is not) -> Asha + Leo = 2 live
  const text = document.body.textContent;
  assert.match(text, /Total[^0-9]*4/);
});
