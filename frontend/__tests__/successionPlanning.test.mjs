/** ZHR-80: the Employee and Successor dropdowns list the organization's people, and the form refuses anyone else. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { employeeList, employeeLabel, employeeOptions } from "../src/utils/employeeOptions.js";
import { validateSuccession, successionPayload, successionToForm, serverSuccessionErrors, refusalField, EMPTY_SUCCESSION } from "../src/utils/successionForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("the employee list is read whether the API answers with a list or with { items }", () => {
  const people = [{ id: 1, first_name: "Ann", last_name: "Lee" }, { id: 2, fullName: "Bob Ray" }, { id: 3, email: "c@x.com" }];
  assert.equal(employeeList(people).length, 3);
  assert.equal(employeeList({ items: people }).length, 3);
  assert.equal(employeeList({ data: people }).length, 3);
  assert.deepEqual(employeeList(null), []);
  assert.deepEqual(employeeOptions(people).map((o) => o.name), ["Ann Lee", "Bob Ray", "c@x.com"]);
  assert.equal(employeeLabel({ id: 9 }), "Employee #9");
  // the real employees API sends camelCase names (firstName / fullName); the page used to read only snake_case, so every option was blank
  assert.equal(employeeLabel({ id: 4, firstName: "Eve", lastName: "Park", fullName: "Eve Park", email: "e@x.com" }), "Eve Park");
  assert.equal(employeeLabel({ id: 4, firstName: "Eve", lastName: "Park" }), "Eve Park");
});

test("the form needs a real employee, allows no successor yet, and never a person as their own successor", () => {
  const ok = { ...EMPTY_SUCCESSION, employee_id: "1", successor_employee_id: "2" };
  assert.deepEqual(validateSuccession(ok, [1, 2]), {});
  assert.deepEqual(validateSuccession({ ...ok, successor_employee_id: "" }, [1, 2]), {});
  assert.match(validateSuccession({ ...ok, employee_id: "" }, [1, 2]).employee_id, /Choose the employee/);
  assert.match(validateSuccession({ ...ok, employee_id: "99" }, [1, 2]).employee_id, /was not found/);
  assert.match(validateSuccession({ ...ok, successor_employee_id: "99" }, [1, 2]).successor_employee_id, /was not found/);
  assert.match(validateSuccession({ ...ok, successor_employee_id: "1" }, [1, 2]).successor_employee_id, /own successor/);
  assert.match(validateSuccession({ ...ok, review_date: "1999-05-05" }, [1, 2]).review_date, /2000 and 2100/);
  assert.deepEqual(successionPayload({ ...ok, target_position: "  Head  of Sales ", notes: " " }), {
    employee_id: 1, successor_employee_id: 2, readiness_level: "not_ready", risk_level: "medium", target_position: "Head of Sales", review_date: null, notes: null,
  });
  assert.equal(successionToForm({ employee_id: 3, successor_employee_id: null, review_date: "2026-11-01T00:00:00" }).review_date, "2026-11-01");
  assert.equal(refusalField("The selected successor was not found in this organization. Choose someone from the list."), "successor_employee_id");
  assert.equal(refusalField("The selected employee was not found in this organization."), "employee_id");
  assert.equal(refusalField("An employee cannot be their own successor. Choose a different successor."), "successor_employee_id");
  assert.equal(serverSuccessionErrors([{ loc: ["body", "risk_level"], msg: "Value error, Risk must be low, medium, high or critical." }]).risk_level, "Risk must be low, medium, high or critical.");
});

async function load(t, { employeesResponse, items = [], createError } = {}) {
  const calls = { create: [], update: [] };
  const svc = {
    getWfSuccessions: async () => ({ items }),
    createWfSuccession: async (p) => { calls.create.push(p); if (createError) throw createError; return {}; },
    updateWfSuccession: async (id, p) => { calls.update.push([id, p]); return {}; },
    deleteWfSuccession: async () => ({}),
    getHrEmployees: async () => { if (employeesResponse instanceof Error) throw employeesResponse; return employeesResponse; },
  };
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/workforce-planning/succession.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const PEOPLE = [{ id: 5, first_name: "Ann", last_name: "Lee" }, { id: 6, first_name: "Bob", last_name: "Ray" }, { id: 7, first_name: "Cy", last_name: "Poe" }];
const set = (id, v) => fireEvent.change(document.getElementById(id), { target: { value: v } });

test("THE REPORTED CASE: the API answers with a plain list and both dropdowns still show every person", async (t) => {
  await load(t, { employeesResponse: PEOPLE });
  fireEvent.click(screen.getByRole("button", { name: /Add Succession/ }));
  assert.deepEqual([...document.getElementById("sc-employee").options].map((o) => o.textContent), ["Select Employee", "Ann Lee", "Bob Ray", "Cy Poe"]);
  assert.deepEqual([...document.getElementById("sc-successor").options].map((o) => o.textContent), ["No successor named yet", "Ann Lee", "Bob Ray", "Cy Poe"]);
});

test("the same works when the API answers with { items }, and the successor list leaves out the chosen employee", async (t) => {
  await load(t, { employeesResponse: { items: PEOPLE } });
  fireEvent.click(screen.getByRole("button", { name: /Add Succession/ }));
  set("sc-employee", "5");
  assert.deepEqual([...document.getElementById("sc-successor").options].map((o) => o.textContent), ["No successor named yet", "Bob Ray", "Cy Poe"]);
});

test("a record is saved with the chosen people's ids", async (t) => {
  const calls = await load(t, { employeesResponse: PEOPLE });
  fireEvent.click(screen.getByRole("button", { name: /Add Succession/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Choose the employee this succession plan is for\./);
  assert.equal(calls.create.length, 0);
  set("sc-employee", "5"); set("sc-successor", "6");
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  assert.deepEqual(calls.create, [{ employee_id: 5, successor_employee_id: 6, readiness_level: "not_ready", risk_level: "medium", target_position: null, review_date: null, notes: null }]);
});

test("with no employees the dropdowns say so and nothing can be saved", async (t) => {
  const calls = await load(t, { employeesResponse: [] });
  fireEvent.click(screen.getByRole("button", { name: /Add Succession/ }));
  assert.equal(document.getElementById("sc-employee").disabled, true);
  assert.deepEqual([...document.getElementById("sc-employee").options].map((o) => o.textContent), ["No employees yet"]);
  assert.match(document.querySelector(".fixed").textContent, /There are no employees in this organization yet/);
  assert.equal(screen.getByRole("button", { name: "Create" }).disabled, true);
  assert.equal(calls.create.length, 0);
});

test("if the employee list cannot be loaded the form says so instead of looking empty", async (t) => {
  await load(t, { employeesResponse: new Error("Network down") });
  fireEvent.click(screen.getByRole("button", { name: /Add Succession/ }));
  assert.match(document.querySelector(".fixed").textContent, /list of employees could not be loaded/);
  assert.equal(screen.getByRole("button", { name: "Create" }).disabled, true);
});

test("a server refusal about the successor appears under the Successor box", async (t) => {
  await load(t, { employeesResponse: PEOPLE, createError: new Error("The selected successor was not found in this organization. Choose someone from the list.") });
  fireEvent.click(screen.getByRole("button", { name: /Add Succession/ }));
  set("sc-employee", "5"); set("sc-successor", "6");
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await settle();
  const alerts = [...document.querySelectorAll(".fixed [role=alert]")].map((a) => a.textContent);
  assert.ok(alerts.some((a) => /successor was not found/.test(a)));
});

test("Edit opens with the current employee and successor selected", async (t) => {
  await load(t, { employeesResponse: PEOPLE, items: [{ id: 1, employee_id: 5, employee_name: "Ann Lee", successor_employee_id: 6, successor_name: "Bob Ray", readiness_level: "ready", risk_level: "high", target_position: "Head" }] });
  fireEvent.click(screen.getByTitle("Edit"));
  assert.equal(document.getElementById("sc-employee").value, "5");
  assert.equal(document.getElementById("sc-successor").value, "6");
});
