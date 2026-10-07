/** Add/Edit User: a phone number with more (or fewer) than 10 digits is rejected with a message. */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { phoneError, PHONE_ERROR } from "../src/utils/phone.js";

const userSvc = {};
const auth = { user: { id: 1, role: "admin", email: "a@example.com" }, role: "admin", isAuthenticated: true };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const mocked = new WeakSet();

function register(t) {
  Object.assign(userSvc, {
    createUser: async () => ({ message: "ok", temporary_password: null }), resetPassword: async () => ({}),
    updateUser: async () => ({}), deactivateUser: async () => ({}), activateUser: async () => ({}), archiveUser: async () => ({}),
    getAssignableRoles: async () => ({ roles: [{ value: "employee", label: "Employee", description: "" }] }),
  });
  if (mocked.has(t)) return;
  mocked.add(t);
  const wrap = (o) => Object.fromEntries(Object.keys(o).map((k) => [k, (...a) => o[k](...a)]));
  t.mock.module("../src/service/employee.js", { exports: { importEmployees: async () => ({}), getEmployees: async () => ({ items: [], total: 0 }), hardDeleteEmployee: async () => ({}), bulkHardDeleteEmployees: async () => ({}) } });
  t.mock.module("../src/service/userService.js", { exports: wrap(userSvc) });
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => auth } });
  t.mock.module("react-router-dom", { exports: { useNavigate: () => () => {}, Link: ({ children }) => children } });
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function openAddUser(t) {
  register(t);
  const { default: Page } = await import("../src/modules/organization-admin/UserManagementPage.jsx");
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name: /Add User/ })[0]);
  await settle();
}

test("the phone rule: 10 digits, optional country code, separators allowed", () => {
  for (const ok of ["", "   ", "9876543210", "+91 98765 43210", "+91-9876543210", "(555) 010-0100", "+1 (555) 010-0100", "555.010.0100"]) assert.equal(phoneError(ok), "", ok);
  for (const bad of ["98765432101", "123456789", "987654321012345", "+91 9876543", "abcdefghij", "98765 4321x", "+12 34", "12-34"]) assert.equal(phoneError(bad), PHONE_ERROR, bad);
});

test("Add User refuses an 11-digit phone, shows why, and sends nothing; a valid one is sent", async (t) => {
  const sent = [];
  await openAddUser(t);
  userSvc.createUser = async (p) => { sent.push(p); return { message: "User created successfully.", temporary_password: null }; };
  type(/^First name/, "Rahul"); type(/^Last name/, "Mehta"); type(/^Email/, "rahul@example.com"); type(/^Job title/, "Engineer");
  fireEvent.change(screen.getByLabelText(/^Date of joining/), { target: { value: "2026-10-01" } });

  type(/^Phone/, "98765432101");
  fireEvent.blur(screen.getByLabelText(/^Phone/));
  await settle();
  assert.ok(screen.getByText(PHONE_ERROR), "the message appears as soon as the field is left");
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.equal(sent.length, 0);

  type(/^Phone/, "+91 98765 43210");
  assert.equal(screen.queryByText(PHONE_ERROR), null, "the message clears while correcting");
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
  type(/^First name/, "Rahul"); type(/^Last name/, "Mehta"); type(/^Email/, "rahul@example.com"); type(/^Job title/, "Engineer");
  fireEvent.change(screen.getByLabelText(/^Date of joining/), { target: { value: "2026-10-01" } });
  type(/^Phone/, "123456789012");
  fireEvent.click(screen.getByRole("button", { name: "Create User" }));
  await settle();
  assert.ok(screen.getByText(PHONE_ERROR));
  assert.equal(sent.length, 0);
  cleanup();
});

test("the phone field limits how much can be typed and uses a telephone keypad", async (t) => {
  await openAddUser(t);
  const input = screen.getByLabelText(/^Phone/);
  assert.equal(input.getAttribute("maxlength"), "20");
  assert.equal(input.getAttribute("type"), "tel");
  cleanup();
});
