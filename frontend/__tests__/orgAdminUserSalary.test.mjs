/**
 * Organization Admin > Users: every salary is shown in the employee's own currency,
 * derived from their registered country — never one org-wide currency.
 */
import "./support/setup-jsdom.mjs";
import { withQuery } from "./support/queryWrapper.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const userSvc = {};
const empSvc = {};
const auth = { user: { id: 1, role: "admin", email: "a@gmail.com" }, role: "admin", isAuthenticated: true };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const mocked = new WeakSet();

const EMPLOYEES = [
  { id: 1, firstName: "Rahul", lastName: "Mehta", email: "rahul@x.com", role: "employee", jobTitle: "Engineer", status: "active", ctc: "1200000", country: "India" },
  { id: 2, firstName: "John", lastName: "Doe", email: "john@x.com", role: "employee", jobTitle: "Designer", status: "active", ctc: "80000", country: "United States" },
  { id: 3, firstName: "No", lastName: "Country", email: "nc@x.com", role: "employee", jobTitle: "Intern", status: "active", ctc: "5000", country: "" },
];

function register(t) {
  Object.assign(empSvc, {
    importEmployees: async () => ({}),
    downloadImportTemplate: async () => ({}), getImportTemplateCountries: async () => [{ name: "United States", currency: "USD", identifiers: ["SSN", "State payroll ID (optional)", "Routing number"] }, { name: "Germany", currency: "EUR", identifiers: ["Tax ID (Steuer-ID)", "Social insurance number (SV-Nummer)", "BIC (optional)"] }],
    getEmployees: async () => ({ items: EMPLOYEES, total: EMPLOYEES.length }),
    hardDeleteEmployee: async () => ({}), bulkHardDeleteEmployees: async () => ({}),
  });
  Object.assign(userSvc, {
    createUser: async () => ({}), resetPassword: async () => ({}),
    updateUser: async () => ({}), deactivateUser: async () => ({}), activateUser: async () => ({}), archiveUser: async () => ({}),
    getUser: async (id) => ({ id, first_name: "Rahul", last_name: "Mehta", email: "rahul@x.com", role: "employee", country: "India", ctc: "1200000", basic_salary: "800000" }),
    getAssignableRoles: async () => ({ roles: [{ value: "employee", label: "Employee" }] }),
  });
  if (mocked.has(t)) return;
  mocked.add(t);
  const wrap = (o) => Object.fromEntries(Object.keys(o).map((k) => [k, (...a) => o[k](...a)]));
  t.mock.module("../src/service/employee.js", { exports: wrap(empSvc) });
  t.mock.module("../src/service/userService.js", { exports: wrap(userSvc) });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("react-router-dom", { exports: { useNavigate: () => () => {}, Link: ({ children }) => children } });
}

async function open(t) {
  register(t);
  const { default: Page } = await import(`../src/modules/organization-admin/UserManagementPage.jsx?t=${Math.random()}`);
  render(withQuery(React.createElement(Page)));
  await settle();
}

afterEach(() => cleanup());

test("the list shows each CTC in that employee's currency", async (t) => {
  await open(t);
  const body = document.body.textContent;
  assert.match(body, /₹12,00,000/, "Indian CTC in INR with lakh grouping");
  assert.match(body, /\$80,000/, "US CTC in USD");
  assert.match(body, /5,000/, "unknown country falls back to a plain number");
});

test("View shows the salary with its currency code", async (t) => {
  await open(t);
  fireEvent.click(screen.getAllByTitle("View")[0]);
  await settle();
  const dialog = document.body.textContent;
  assert.match(dialog, /₹8,00,000/);
  assert.match(dialog, /\(INR\)/);
});

test("the import dialog offers searchable per-country templates", async (t) => {
  await open(t);
  const calls = [];
  empSvc.downloadImportTemplate = async (c) => { calls.push(c); return {}; };
  fireEvent.click(screen.getByRole("button", { name: "Import Users" }));
  await settle();
  const search = screen.getByLabelText("Search country for template");
  assert.ok(screen.getByText("Default template"));
  // before searching: the countries with their own template, each naming the identifiers its columns use
  assert.ok(screen.getByText("Germany"));
  assert.match(document.body.textContent, /Tax ID \(Steuer-ID\)/);
  fireEvent.change(search, { target: { value: "japan" } });
  await settle();
  assert.match(document.body.textContent, /International template/, "a country without its own template says so");
  fireEvent.change(search, { target: { value: "united" } });
  await settle();
  assert.ok(screen.getByText("United States"));
  assert.ok(screen.getByText("United Kingdom"));
  assert.equal(screen.queryByText("India"), null);
  fireEvent.click(screen.getByText("United States"));
  await settle();
  assert.deepEqual(calls, ["United States"]);
  fireEvent.click(screen.getByText("Default template"));
  await settle();
  assert.deepEqual(calls, ["United States", undefined]);
});

test("the Add form names the salary currency from the entered country", async (t) => {
  await open(t);
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  await settle();
  fireEvent.change(screen.getByLabelText(/^Country/), { target: { value: "Germany" } });
  await settle();
  assert.match(document.body.textContent, /Amounts in .*\(EUR\)/);
});

test("statutory fields relabel with the entered country", async (t) => {
  await open(t);
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  await settle();
  // No country yet: generic labels.
  assert.ok(screen.getByLabelText(/^Tax identification number/));
  fireEvent.change(screen.getByLabelText(/^Country/), { target: { value: "India" } });
  await settle();
  assert.ok(screen.getByLabelText(/^PAN/));
  assert.ok(screen.getByLabelText(/^UAN/));
  assert.ok(screen.getByLabelText(/^IFSC code/));
  fireEvent.change(screen.getByLabelText(/^Country/), { target: { value: "United States" } });
  await settle();
  assert.ok(screen.getByLabelText(/^SSN/));
  assert.ok(screen.getByLabelText(/^Routing number/));
  assert.equal(screen.queryByLabelText(/^PAN/), null);
});
