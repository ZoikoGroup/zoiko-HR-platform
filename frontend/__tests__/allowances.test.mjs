/** ZHR-76: an allowance is for an employee chosen from the organization's employees, never a typed-in number. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateAllowanceForm, allowancePayload, allowanceToForm, employeeName, serverAllowanceErrors, employeeRefusal, EMPTY_ALLOWANCE } from "../src/utils/allowanceForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const FULL = { employee_id: "5", allowance_type: "Housing", amount: "1500", effective_date: "2026-11-01" };

test("the employee must be one of the people offered, and the other fields are checked", () => {
  assert.deepEqual(validateAllowanceForm(FULL, [5, 6]), {});
  assert.deepEqual(Object.keys(validateAllowanceForm({ ...EMPTY_ALLOWANCE })).sort(), ["allowance_type", "amount", "effective_date", "employee_id"]);
  assert.match(validateAllowanceForm({ ...FULL, employee_id: "999" }, [5, 6]).employee_id, /was not found/);
  assert.equal(validateAllowanceForm({ ...FULL, employee_id: "" }, [5]).employee_id, "Choose the employee this allowance is for.");
  assert.equal(validateAllowanceForm({ ...FULL, amount: "0" }).amount, "Amount must be greater than 0.");
  assert.match(validateAllowanceForm({ ...FULL, amount: "1.234" }).amount, /2 decimal places/);
  assert.match(validateAllowanceForm({ ...FULL, effective_date: "1999-01-01" }).effective_date, /2000 and 2100/);
});

test("payload, names and server messages", () => {
  assert.deepEqual(allowancePayload({ ...FULL, allowance_type: "  Travel   Pay " }), { employee_id: 5, allowance_type: "Travel Pay", amount: 1500, effective_date: "2026-11-01" });
  assert.equal(employeeName({ first_name: "Ann", last_name: "Roy" }), "Ann Roy");
  assert.equal(allowanceToForm({ employee_id: 5, allowance_type: "H", amount: "1500.00", effective_date: "2026-11-01T00:00:00" }).amount, "1500");
  assert.equal(serverAllowanceErrors([{ loc: ["body", "employee_id"], msg: "Value error, Choose the employee this allowance is for." }]).employee_id, "Choose the employee this allowance is for.");
  assert.equal(employeeRefusal("The selected employee was not found in this organization. Choose an employee from the list."), true);
  assert.equal(employeeRefusal("Network down"), false);
});

async function load(t, { employees, items = [], createError } = {}) {
  const calls = { create: [], update: [] };
  const svc = {
    getAllowances: async () => items,
    createAllowance: async (p) => { calls.create.push(p); if (createError) throw createError; return {}; },
    updateAllowance: async (id, p) => { calls.update.push([id, p]); return {}; },
    deleteAllowance: async () => ({}),
    getHrEmployees: async () => ({ items: employees }),
  };
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/compensation/allowances.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const set = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("with NO employees there is nothing to type: the box says so and Create is disabled", async (t) => {
  const calls = await load(t, { employees: [] });
  fireEvent.click(screen.getByRole("button", { name: "+ Add Allowance" }));
  const select = document.getElementById("al-employee");
  assert.equal(select.tagName, "SELECT", "the employee is chosen, not typed as a number");
  assert.equal(select.disabled, true);
  assert.deepEqual([...select.options].map((o) => o.textContent), ["No employees yet"]);
  assert.match(document.querySelector(".fixed").textContent, /There are no employees in this organization yet/);
  assert.equal(screen.getByRole("button", { name: "Create Allowance" }).disabled, true);
  assert.equal(calls.create.length, 0);
});

test("the employee is picked by name from the organization's people, and saved by their real id", async (t) => {
  const calls = await load(t, { employees: [{ id: 5, first_name: "Sam", last_name: "Lee" }, { id: 6, first_name: "Ann", last_name: "Roy" }] });
  fireEvent.click(screen.getByRole("button", { name: "+ Add Allowance" }));
  assert.deepEqual([...document.getElementById("al-employee").options].map((o) => o.textContent), ["Select employee...", "Sam Lee", "Ann Roy"]);
  fireEvent.click(screen.getByRole("button", { name: "Create Allowance" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Choose the employee this allowance is for\./);
  assert.equal(calls.create.length, 0);
  set("al-employee", "6"); set("al-type", "Housing"); set("al-amount", "1500"); set("al-date", "2026-11-01");
  fireEvent.click(screen.getByRole("button", { name: "Create Allowance" }));
  await settle();
  assert.deepEqual(calls.create, [{ employee_id: 6, allowance_type: "Housing", amount: 1500, effective_date: "2026-11-01" }]);
});

test("a refusal about the employee from the server appears under the employee box", async (t) => {
  const err = new Error("The selected employee was not found in this organization. Choose an employee from the list.");
  await load(t, { employees: [{ id: 5, first_name: "Sam", last_name: "Lee" }], createError: err });
  fireEvent.click(screen.getByRole("button", { name: "+ Add Allowance" }));
  set("al-employee", "5"); set("al-type", "Housing"); set("al-amount", "10"); set("al-date", "2026-11-01");
  fireEvent.click(screen.getByRole("button", { name: "Create Allowance" }));
  await settle();
  const alerts = [...document.querySelectorAll(".fixed [role=alert]")].map((a) => a.textContent);
  assert.ok(alerts.some((a) => /was not found in this organization/.test(a)));
});

test("the list shows the employee's name, not a bare number", async (t) => {
  await load(t, { employees: [{ id: 5, first_name: "Sam", last_name: "Lee" }], items: [{ id: 1, employee_id: 5, employee_name: "Sam Lee", allowance_type: "Housing", amount: "1500.00", effective_date: "2026-11-01" }] });
  const row = document.querySelector("tbody tr").textContent;
  assert.match(row, /Sam Lee/);
  assert.match(row, /\$1,500/);
  assert.match(row, /1 Nov 2026|01 Nov 2026|Nov/);
});

test("ZHR-77: Edit lets the employee be changed, and the new employee is what is sent", async (t) => {
  const calls = await load(t, {
    employees: [{ id: 5, first_name: "Sam", last_name: "Lee" }, { id: 6, first_name: "Ann", last_name: "Roy" }],
    items: [{ id: 1, employee_id: 5, employee_name: "Sam Lee", allowance_type: "Housing", amount: "1500.00", effective_date: "2026-11-01" }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  assert.equal(document.getElementById("al-employee").value, "5", "the current employee is selected");
  set("al-employee", "6");
  fireEvent.click(screen.getByRole("button", { name: "Update Allowance" }));
  await settle();
  assert.deepEqual(calls.update, [[1, { employee_id: 6, allowance_type: "Housing", amount: 1500, effective_date: "2026-11-01" }]]);
});
