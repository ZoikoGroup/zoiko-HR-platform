/**
 * Organization Admin > User Management > Add User: takes the same information
 * the employee import takes, and reports real server errors.
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

const userSvc = {};
const empSvc = {};
const auth = { user: { id: 1, role: "admin", email: "a@example.com" }, role: "admin", isAuthenticated: true };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const mocked = new WeakSet();

function register(t) {
  Object.assign(empSvc, {
    importEmployees: async () => ({}), getEmployees: async () => ({ items: [], total: 0 }),
    hardDeleteEmployee: async () => ({}), bulkHardDeleteEmployees: async () => ({}),
  });
  Object.assign(userSvc, {
    createUser: async () => ({ message: "ok", temporary_password: null }), resetPassword: async () => ({}),
    updateUser: async () => ({}), deactivateUser: async () => ({}), activateUser: async () => ({}), archiveUser: async () => ({}),
    getAssignableRoles: async () => ({ roles: [{ value: "employee", label: "Employee", description: "Self-service access." }, { value: "hr_admin", label: "HR Admin", description: "Manages HR data." }] }),
  });
  if (mocked.has(t)) return;
  mocked.add(t);
  const wrap = (o) => Object.fromEntries(Object.keys(o).map((k) => [k, (...a) => o[k](...a)]));
  t.mock.module("../src/service/employee.js", { exports: wrap(empSvc) });
  t.mock.module("../src/service/userService.js", { exports: wrap(userSvc) });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("react-router-dom", { exports: { useNavigate: () => () => {}, Link: ({ children }) => children } });
}

async function open(t, over = {}) {
  register(t);
  Object.assign(userSvc, over);
  const { default: Page } = await import("../src/modules/organization-admin/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  await settle();
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test("Add User offers every field the import takes, with roles from the server", async (t) => {
  await open(t);
  for (const label of ["Date of joining", "Employment type", "Department", "Designation", "Company", "Business unit", "Division", "Team",
    "Date of birth", "Gender", "Work email", "Personal email", "Current address", "Permanent address", "City", "State", "Country", "Pincode",
    "Basic salary", "CTC", "PAN", "UAN", "Bank account number", "IFSC code"]) {
    assert.ok(screen.getByLabelText(new RegExp(`^${label}`)), label);
  }
  const roles = within(screen.getByLabelText(/^Role/)).getAllByRole("option").map((o) => o.textContent);
  assert.deepEqual(roles, ["Employee", "HR Admin"]);
  cleanup();
});

test("required fields are enforced and everything filled in is sent", async (t) => {
  const sent = [];
  await open(t, { createUser: async (p) => { sent.push(p); return { message: "User created successfully.", temporary_password: "Tmp-1234" }; } });
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(sent.length, 0);
  assert.ok(screen.getByText("First name is required") && screen.getByText("Job title is required"));

  type(/^First name/, "Rahul"); type(/^Last name/, "Mehta"); type(/^Email/, "rahul@example.com"); type(/^Job title/, "Engineer");
  type(/^Department/, "Platform"); type(/^Designation/, "Senior Engineer"); type(/^Gender/, "male"); type(/^Employment type/, "contract");
  type(/^City/, "Pune"); type(/^Basic salary/, "50000"); type(/^PAN/, "ABCDE1234F"); type(/^IFSC/, "HDFC0001234");
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(sent.length, 1);
  const p = sent[0];
  assert.deepEqual(
    [p.first_name, p.job_title, p.role, p.department_name, p.designation_name, p.gender, p.employment_type, p.city, p.basic_salary, p.pan_number, p.bank_ifsc],
    ["Rahul", "Engineer", "employee", "Platform", "Senior Engineer", "male", "contract", "Pune", "50000", "ABCDE1234F", "HDFC0001234"],
  );
  assert.match(p.date_of_joining, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.company, undefined); // blank optional fields are not sent
  assert.ok(screen.getByText("Temporary Password"));
  cleanup();
});

test("a server error is shown in the form and the form stays open", async (t) => {
  await open(t, { createUser: async () => { throw new Error("User with this email already exists."); } });
  type(/^First name/, "A"); type(/^Last name/, "B"); type(/^Email/, "a@example.com"); type(/^Job title/, "Dev");
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.ok(screen.getByRole("alert").textContent.includes("already exists"));
  assert.equal(screen.getByRole("button", { name: "Create User" }).disabled, false);
  cleanup();
});

test("import: an update-only file refreshes the list and says so", async (t) => {
  register(t);
  let loads = 0;
  empSvc.getEmployees = async () => { loads += 1; return { items: [], total: 0 }; };
  empSvc.importEmployees = async () => ({ total_rows: 2, created: 0, updated: 2, skipped: 0, failed: 0, errors: [] });
  const { default: Page } = await import("../src/modules/organization-admin/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  const before = loads;
  fireEvent.click(screen.getAllByRole("button", { name: /Import/ })[0]);
  await settle();
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(["x"], "people.xlsx")] } });
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  await settle();
  assert.ok(screen.getByText(/2 updated successfully/));
  assert.ok(loads > before, "the user list was reloaded after an update-only import");
  cleanup();
});
