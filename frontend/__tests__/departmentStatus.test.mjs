/** ZHR-51: Department List - the Active / Inactive status can be changed, not only filtered. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const svc = {};
const calls = { list: [], update: [] };
const mocked = new WeakSet();

const DEPTS = () => ([
  { id: 1, name: "Engineering", code: "ENG", department_code: "D1", is_active: true, employee_count: 3, budget: 1000 },
  { id: 2, name: "Design", code: "DSN", department_code: "D2", is_active: false, employee_count: 0, budget: 500 },
]);

async function open(t, over = {}) {
  calls.list.length = 0; calls.update.length = 0;
  let rows = DEPTS();
  Object.assign(svc, {
    getDepartments: async (p) => { calls.list.push(p); return { data: p?.include_inactive ? rows : rows.filter((d) => d.is_active) }; },
    createDepartment: async () => ({}),
    updateDepartment: async (id, body) => { calls.update.push([id, body]); rows = rows.map((d) => (d.id === id ? { ...d, ...body } : d)); return { data: {} }; },
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
    t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
    t.mock.module("../src/service/hrService.js", { exports: {
      getDepartments: (...a) => svc.getDepartments(...a), createDepartment: (...a) => svc.createDepartment(...a), updateDepartment: (...a) => svc.updateDepartment(...a) } });
  }
  const { default: Page } = await import("../src/modules/zoiko-hr/departments/department-list.jsx");
  render(React.createElement(Page));
  await settle();
}

test("the Inactive filter shows inactive departments (the list always includes them)", async (t) => {
  await open(t);
  assert.ok(calls.list.every((p) => p?.include_inactive === true));
  fireEvent.change(screen.getByDisplayValue("All Status"), { target: { value: "inactive" } });
  await settle();
  assert.ok(screen.getByText("Design"));
  assert.equal(screen.queryByText("Engineering"), null);
  assert.ok(calls.list.every((p) => p?.include_inactive === true), "switching the filter must not hide inactive rows from the data");
});

test("deactivating asks first, then saves the new status and shows the result", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Deactivate Engineering" }));
  const dlg = screen.getByRole("dialog", { name: "Deactivate department" });
  assert.deepEqual(calls.update, []); // nothing happens until it is confirmed
  fireEvent.click(within(dlg).getByRole("button", { name: "Deactivate" }));
  await settle();
  assert.deepEqual(calls.update, [[1, { is_active: false }]]);
  assert.ok(screen.getByText("Engineering is now inactive."));
  assert.ok(screen.getByRole("button", { name: "Activate Engineering" })); // the row reflects it
});

test("cancelling leaves the department untouched", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Deactivate Engineering" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.deepEqual(calls.update, []);
});

test("an inactive department can be activated again", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Activate Design" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Activate department" })).getByRole("button", { name: "Activate" }));
  await settle();
  assert.deepEqual(calls.update, [[2, { is_active: true }]]);
  assert.ok(screen.getByText("Design is now active."));
});

test("the server's reason is shown when a status change is refused", async (t) => {
  await open(t, { updateDepartment: async () => { throw new Error("Cannot deactivate 'Engineering'. It still has 3 active employee(s); move them to another department first."); } });
  fireEvent.click(screen.getByRole("button", { name: "Deactivate Engineering" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));
  await settle();
  assert.ok(screen.getByRole("alert").textContent.includes("3 active employee"));
  assert.ok(screen.getByRole("button", { name: "Deactivate Engineering" })); // still active in the list
});

test("the edit form has a Status field and sends it", async (t) => {
  await open(t);
  fireEvent.click(within(screen.getByText("Design").closest("tr")).getByRole("button", { name: /Edit/ }));
  const status = screen.getByLabelText("Status");
  assert.equal(status.value, "inactive");
  fireEvent.change(status, { target: { value: "active" } });
  for (const [label, value] of [[/Department Head/, "Ann"], [/Establishment Year/, "2020"]]) {
    const input = screen.getAllByRole("textbox").concat(screen.getAllByRole("spinbutton")).find((el) => el.closest("div")?.textContent.match(label));
    if (input && !input.value) fireEvent.change(input, { target: { value } });
  }
  fireEvent.submit(status.closest("form"));
  await settle();
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0][0], 2);
  assert.equal(calls.update[0][1].is_active, true);
});
