/** Add/Edit User (B8 rule): a phone number is checked for its country and refused with a message under the field. */
import "./support/setup-jsdom.mjs";
import { withQuery } from "./support/queryWrapper.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { fieldProblem } from "../src/utils/fieldRules.js";

const userSvc = {};
const auth = { user: { id: 1, role: "admin", email: "a@gmail.com" }, role: "admin", isAuthenticated: true };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const mocked = new WeakSet();

function register(t) {
  Object.assign(userSvc, {
    createUser: async () => ({ message: "ok", temporary_password: null }), resetPassword: async () => ({}),
    updateUser: async () => ({}), deactivateUser: async () => ({}), activateUser: async () => ({}), archiveUser: async () => ({}),
    getUser: async () => ({}),
    getAssignableRoles: async () => ({ roles: [{ value: "employee", label: "Employee", description: "" }] }),
  });
  if (mocked.has(t)) return;
  mocked.add(t);
  const wrap = (o) => Object.fromEntries(Object.keys(o).map((k) => [k, (...a) => o[k](...a)]));
  t.mock.module("../src/service/employee.js", { exports: { importEmployees: async () => ({}), downloadImportTemplate: async () => ({}), getImportTemplateCountries: async () => [{ name: "United States", currency: "USD", identifiers: ["SSN", "State payroll ID (optional)", "Routing number"] }, { name: "Germany", currency: "EUR", identifiers: ["Tax ID (Steuer-ID)", "Social insurance number (SV-Nummer)", "BIC (optional)"] }], getEmployees: async () => ({ items: [], total: 0 }), hardDeleteEmployee: async () => ({}), bulkHardDeleteEmployees: async () => ({}) } });
  t.mock.module("../src/service/userService.js", { exports: wrap(userSvc) });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("react-router-dom", { exports: { useNavigate: () => () => {}, Link: ({ children }) => children } });
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function openAddUser(t) {
  register(t);
  const { default: Page } = await import("../src/modules/organization-admin/UserManagementPage.jsx");
  render(withQuery(React.createElement(Page)));
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  await settle();
}

const phone = () => document.getElementById("add-user-phone");
const typePhone = (value) => fireEvent.change(phone(), { target: { value } });
const INDIA = "Enter a valid phone number for India.";
const fillRequired = () => {
  type(/^First name/, "Rahul"); type(/^Last name/, "Mehta"); type(/^Email/, "rahul@gmail.com"); type(/^Job title/, "Engineer");
  fireEvent.change(screen.getByLabelText(/^Date of joining/), { target: { value: "2026-10-01" } });
  fireEvent.change(document.getElementById("add-user-country"), { target: { value: "India" } });
};

test("B8 the phone rule is per country (libphonenumber), not a fixed 10 digits", () => {
  assert.equal(fieldProblem("phone", "+91 98765 43210"), "");
  assert.equal(fieldProblem("phone", "(415) 555-2671", { country: "United States" }), "");
  assert.equal(fieldProblem("phone", "+65 6123 4567"), "", "an 8-digit Singapore number is fine");
  assert.equal(fieldProblem("phone", "98765432101", { country: "India" }), INDIA);
  assert.equal(fieldProblem("phone", "98765abc10", { country: "India" }), INDIA);
});

test("Add User refuses a wrong phone for the country, shows why, and sends nothing; a valid one is sent with its code", async (t) => {
  const sent = [];
  await openAddUser(t);
  userSvc.createUser = async (p) => { sent.push(p); return { message: "User created successfully.", temporary_password: null }; };
  fillRequired();
  typePhone("98765 4321 01");
  fireEvent.blur(phone());
  await settle();
  assert.ok(screen.getByText(INDIA), "the message appears as soon as the field is left");
  assert.equal(phone().getAttribute("aria-invalid"), "true");
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(sent.length, 0);

  typePhone("98765 43210");
  assert.equal(screen.queryByText(INDIA), null, "the message clears while correcting");
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].phone, "+91 98765 43210");
  cleanup();
});

test("a wrong phone is also caught when the form is submitted without leaving the field", async (t) => {
  const sent = [];
  await openAddUser(t);
  userSvc.createUser = async (p) => { sent.push(p); return { message: "ok" }; };
  fillRequired();
  typePhone("123456789012");
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.ok(screen.getByText(INDIA));
  assert.equal(sent.length, 0);
  cleanup();
});

test("the phone field has a calling-code selector, a telephone keypad, and refuses letters as they are typed", async (t) => {
  await openAddUser(t);
  assert.ok(screen.getByLabelText("Phone country code"));
  assert.equal(phone().getAttribute("maxlength"), "20");
  assert.equal(phone().getAttribute("type"), "tel");
  typePhone("98765abc");
  assert.equal(phone().value, "98765");
  cleanup();
});
