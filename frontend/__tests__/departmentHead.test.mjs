/** Departments: the head of department is picked from the organization's people (optional), the spent figure warns when
 * it goes over the budget, and the head's current name is shown. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const calls = { update: [] };
const mocked = new WeakSet();

const DEPTS = [
  { id: 1, name: "Engineering", code: "ENG", is_active: true, employee_count: 3, budget: 1000, spent_budget: 200,
    head: "Old typed name", head_employee_id: null, head_name: "Old typed name", establishment_year: 2020 },
  { id: 2, name: "Design", code: "DSN", is_active: true, employee_count: 1, budget: 500, spent_budget: 100,
    head: "Asha K", head_employee_id: 9, head_name: "Asha Kumar", establishment_year: 2021 },
];

async function open(t) {
  calls.update.length = 0;
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
    t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
    t.mock.module("../src/modules/zoiko-hr/learning/EmployeePicker.jsx", { exports: { default: ({ label, value, onChange }) =>
      React.createElement("div", null, `${label}: ${value ? value.name : "none"}`,
        React.createElement("button", { type: "button", onClick: () => onChange({ id: 7, name: "Ravi Shah" }) }, "pick Ravi"),
        React.createElement("button", { type: "button", onClick: () => onChange(null) }, "clear head")) } });
    t.mock.module("../src/service/hrService.js", { exports: {
      getDepartments: async () => ({ data: DEPTS }), createDepartment: async () => ({}),
      updateDepartment: async (id, body) => { calls.update.push([id, body]); return { data: {} }; },
      getDepartmentSettings: async () => ({}) } });
  }
  const { default: Page } = await import("../src/modules/zoiko-hr/departments/department-list.jsx");
  render(React.createElement(Page));
  await settle();
}

const editRow = (name) => {
  const row = screen.getByText(name).closest("tr");
  fireEvent.click(within(row).getByRole("button", { name: /edit/i }));
};
const save = async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); await settle(); };

test("the list shows the head's current name", async (t) => {
  await open(t);
  assert.ok(screen.getByText("Asha Kumar"));
});

test("picking a person sends their id, not typed text", async (t) => {
  await open(t);
  editRow("Engineering");
  assert.ok(screen.getByText(/typed, not linked to a person/));
  fireEvent.click(screen.getByRole("button", { name: "pick Ravi" }));
  await save();
  const [id, body] = calls.update[0];
  assert.equal(id, 1);
  assert.equal(body.head_employee_id, 7);
  assert.equal("head" in body, false);
});

test("an untouched head is left alone, and clearing it sends null", async (t) => {
  await open(t);
  editRow("Design");
  assert.ok(screen.getByText("Head of department (optional): Asha Kumar"));
  await save();
  assert.equal("head_employee_id" in calls.update[0][1], false);
  editRow("Design");
  fireEvent.click(screen.getByRole("button", { name: "clear head" }));
  await save();
  assert.equal(calls.update[1][1].head_employee_id, null);
});

test("spent over the budget shows a warning", async (t) => {
  await open(t);
  editRow("Engineering");
  fireEvent.change(screen.getByPlaceholderText("e.g., 250000"), { target: { value: "1500" } });
  assert.ok(screen.getByRole("status").textContent.includes("more than the budget"));
});
