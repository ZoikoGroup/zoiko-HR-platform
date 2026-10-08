/** ZHR-102: Add Employee on the dashboard does not ask for (or demand) a password and tells the person what is missing. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateAddEmployee, addEmployeePayload, serverAddEmployeeErrors } from "../src/utils/addEmployeeForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

const GOOD = { first_name: "Aarav", last_name: "Sharma", email: "aarav@example.com", phone: "", job_title: "Engineer", department_id: "", designation_id: "", employment_type: "full_time", date_of_joining: "2026-10-01", basic_salary: "", ctc: "" };

test("rules: nothing about a password, and every required box is named", () => {
  assert.deepEqual(validateAddEmployee(GOOD), {});
  assert.equal("password" in addEmployeePayload(GOOD), false);
  const empty = validateAddEmployee({ ...GOOD, first_name: "", last_name: " ", email: "", job_title: "", date_of_joining: "" });
  assert.deepEqual(Object.keys(empty).sort(), ["date_of_joining", "email", "first_name", "job_title", "last_name"]);
  assert.match(validateAddEmployee({ ...GOOD, email: "nope" }).email, /valid email/);
  assert.match(validateAddEmployee({ ...GOOD, phone: "123" }).phone, /10-digit/);
  assert.match(validateAddEmployee({ ...GOOD, basic_salary: "500", ctc: "100" }).ctc, /less than the basic/);
  assert.match(validateAddEmployee({ ...GOOD, first_name: "R2D2" }).first_name, /only letters/);
  assert.deepEqual(addEmployeePayload({ ...GOOD, email: " Aarav@Example.com ", department_id: "4", basic_salary: "100" }).department_id, 4);
  assert.equal(serverAddEmployeeErrors({ message: "Employee with this email already exists" }).fieldErrors.email, "An employee with this email already exists");
  assert.equal(serverAddEmployeeErrors({ validation: [{ loc: ["body", "password"], msg: "Field required" }] }).fieldErrors.password, "This is required");
});

async function openPage(t, create) {
  const calls = [];
  const none = async () => ({});
  t.mock.module("../src/service/hrService.js", { exports: { getHrDashboardStats: none, getHrEmployees: async () => [], getDepartments: async () => [], getAttendanceDashboard: none, getLeaveDashboard: none, getCompensationDashboard: none, getPerformanceDashboard: none } });
  t.mock.module("../src/service/orgAdminService.js", { exports: { getOrganizationDetails: async () => ({ name: "Acme" }) } });
  t.mock.module("../src/service/employee.js", { exports: { getDesignations: async () => [], createEmployee: create || (async (p) => { calls.push(p); return { id: 9, email: p.email, temporaryPassword: "Tmp#Pass12345" }; }) } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/HrDashBoard.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name: /Add Employee/ })[0]);
  await settle();
  return calls;
}
const type = (placeholder, value) => fireEvent.change(document.querySelector(`input[placeholder="${placeholder}"]`), { target: { value } });
const submit = async () => { fireEvent.click(document.querySelector('button[form="add-employee-form"]')); await settle(); };

test("the form has no password box, and saving with details missing names what is missing", async (t) => {
  const calls = await openPage(t);
  assert.equal(document.querySelector('input[type="password"]'), null);
  assert.doesNotMatch(document.getElementById("add-employee-form").textContent, /Status/);
  type("e.g. Aarav", "Aarav");
  await submit();
  assert.equal(calls.length, 0);
  const text = document.getElementById("add-employee-form").textContent;
  assert.match(text, /Last name is required/);
  assert.match(text, /Email is required/);
  assert.match(text, /Job title is required/);
  assert.match(text, /Date of joining is required/);
  assert.doesNotMatch(text, /assword/);
});

test("a complete form adds the employee, sends no password, and shows the temporary one once", async (t) => {
  const calls = await openPage(t);
  type("e.g. Aarav", "Aarav"); type("e.g. Sharma", "Sharma"); type("name@company.com", "aarav@example.com"); type("e.g. Software Engineer", "Engineer");
  fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: "2026-10-01" } });
  await submit();
  assert.equal(calls.length, 1);
  assert.equal("password" in calls[0], false);
  assert.equal(document.querySelector('[data-testid="temp-password"]').textContent, "Tmp#Pass12345");
  assert.match(document.body.textContent, /Aarav Sharma can now sign in/);
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  assert.equal(document.querySelector('[data-testid="temp-password"]'), null);
});

test("a refusal from the server shows under the box it is about", async (t) => {
  await openPage(t, async () => { throw Object.assign(new Error("x"), { validation: [{ loc: ["body", "email"], msg: "value is not a valid email address" }] }); });
  type("e.g. Aarav", "Aarav"); type("e.g. Sharma", "Sharma"); type("name@company.com", "aarav@example.com"); type("e.g. Software Engineer", "Engineer");
  fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: "2026-10-01" } });
  await submit();
  assert.match(document.getElementById("add-employee-form").textContent, /not a valid email address/);
});
