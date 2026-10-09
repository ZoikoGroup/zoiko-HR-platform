/** ZHR-102: adding an employee on Employee Management never asks for, or demands, a password. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

async function open(t, create) {
  const calls = [];
  const none = async () => ({ items: [] });
  t.mock.module("../src/service/employee.js", { exports: {
    getEmployees: none, getDepartments: async () => [], getDesignations: async () => [], updateEmployee: async () => ({}), deleteEmployee: async () => ({}),
    getEmployeeById: async () => ({}), importEmployees: async () => ({}), downloadImportTemplate: async () => ({}),
    createEmployee: create || (async (p) => { calls.push(p); return { id: 9, email: p.email, temporaryPassword: "Tmp#Pass12345" }; }),
  } });
  t.mock.module("../src/components/EmployeeBulkActions.jsx", { exports: { default: () => React.createElement("div") } });
  t.mock.module("../src/service/userService.js", { exports: { resetPassword: async () => ({}) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/EmployeeManagement/employees.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  return calls;
}

const addButton = () => screen.getAllByRole("button").find((b) => /^\+?\s*(Add|New)\b.*Employee/i.test(b.textContent.trim()));

test("the Add Employee form has no password box and saving without one is not refused", async (t) => {
  const calls = await open(t);
  fireEvent.click(addButton());
  await settle();
  assert.equal(document.querySelector('input[type="password"]'), null, "no password box");
  assert.doesNotMatch(document.body.textContent, /Password \*|Password is required/);
  assert.match(document.body.textContent, /No password is needed/);
  const type = (placeholder, value) => fireEvent.change(document.querySelector(`input[placeholder="${placeholder}"]`) || document.querySelector("form input"), { target: { value } });
  const inputs = [...document.querySelectorAll("form input")];
  const byLabel = (label) => { const l = [...document.querySelectorAll("form label")].find((x) => x.textContent.trim().startsWith(label)); return l?.parentElement.querySelector("input,select,textarea"); };
  fireEvent.change(byLabel("First Name"), { target: { value: "Aarav" } });
  fireEvent.change(byLabel("Last Name"), { target: { value: "Sharma" } });
  fireEvent.change(byLabel("Email (Login)"), { target: { value: "aarav@gmail.com" } });
  fireEvent.change(byLabel("Job Title"), { target: { value: "Engineer" } });
  fireEvent.change(byLabel("Joining Date"), { target: { value: "2026-10-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.equal(calls.length, 1, "it was sent");
  assert.equal("password" in calls[0], false);
  assert.doesNotMatch(document.body.textContent, /password is required/i);
  assert.equal(document.querySelector('[data-testid="temp-password"]').textContent, "Tmp#Pass12345");
  assert.match(document.body.textContent, /Aarav Sharma has been added/);
  assert.ok(inputs.length > 0);
});
