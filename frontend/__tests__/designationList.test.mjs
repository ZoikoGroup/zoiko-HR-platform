/** ZHR-53: Designation List - refresh really refreshes, failures are shown, and each row says where it came from. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const svc = {};
const calls = { desig: [], dept: [], emp: [], deleted: [], holders: [], assigned: [] };
const mocked = new WeakSet();

const ROW = (o) => ({ department_name: "Eng", level: "L3", status: "active", employees_count: 0, created_at: "2026-09-01T10:00:00Z", ...o });
const ROWS = () => ([
  ROW({ id: 1, title: "Staff Engineer", designation_code: "DES001", source: "manual", created_by_name: "Priya Shah", employees_count: 2 }),
  ROW({ id: 2, title: "Analyst", designation_code: "DES002", source: "import", created_by_name: "Gina Lopez" }),
  ROW({ id: 3, title: "Legacy Role", designation_code: "DES003", source: null }),
]);

async function open(t, over = {}) {
  Object.keys(calls).forEach((k) => { calls[k].length = 0; });
  let rows = ROWS();
  Object.assign(svc, {
    getDesignations: async (p) => { calls.desig.push(p); return { data: rows }; },
    getDepartments: async (p) => { calls.dept.push(p); return { data: [{ id: 1, name: "Eng" }] }; },
    getHrEmployees: async (p) => { calls.emp.push(p); return { data: [] }; },
    getDesignationSettings: async () => ({}),
    createDesignation: async () => ({ data: { id: 9 } }),
    updateDesignation: async () => ({}),
    deleteDesignation: async (id) => { calls.deleted.push(id); rows = rows.filter((r) => r.id !== id); return {}; },
    getDesignationHolders: async (id) => { calls.holders.push(id); return [{ id: 5, name: "Asha Rao", employee_code: "E5", status: "active" }, { id: 6, name: "Old Hand", status: "resigned" }]; },
    assignDesignation: async (id, body) => { calls.assigned.push([id, body]); return { assigned: body.employee_ids.length, unchanged: 0 }; },
    searchLearningPeople: async () => ({ items: [{ id: 21, first_name: "Ravi", last_name: "Shah", email: "ravi@x.com" }, { id: 22, first_name: "Meena", last_name: "Iyer", email: "m@x.com" }] }),
    ...over,
  });
  if (!mocked.has(t)) {
    mocked.add(t);
    t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
    t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
    t.mock.module("../src/components/documents/GenerateDocumentButton.jsx", { exports: { default: () => null } });
    t.mock.module("../src/service/hrService.js", { exports: {
      getDesignations: (...a) => svc.getDesignations(...a), getDepartments: (...a) => svc.getDepartments(...a), getHrEmployees: (...a) => svc.getHrEmployees(...a),
      getDesignationSettings: (...a) => svc.getDesignationSettings(...a), getDesignationHolders: (...a) => svc.getDesignationHolders(...a),
      assignDesignation: (...a) => svc.assignDesignation(...a), searchLearningPeople: (...a) => svc.searchLearningPeople(...a),
      createDesignation: (...a) => svc.createDesignation(...a), updateDesignation: (...a) => svc.updateDesignation(...a), deleteDesignation: (...a) => svc.deleteDesignation(...a) } });
    t.mock.module("../src/service/employee.js", { exports: { updateEmployee: (...a) => svc.updateEmployee(...a) } });
  }
  const { default: Page } = await import("../src/modules/zoiko-hr/designations/designation-list.jsx");
  render(React.createElement(Page));
  await settle();
}

test("the Refresh button reloads from the server with a cache-busting request and says so", async (t) => {
  await open(t);
  assert.equal(calls.desig.length, 1);
  assert.equal(calls.desig[0], undefined); // the first load can use the cache
  fireEvent.click(screen.getByRole("button", { name: "Refresh designations" }));
  await settle();
  assert.equal(calls.desig.length, 2);
  assert.ok(calls.desig[1]?._, "a refresh must not be answered from the server's two-minute cache");
  assert.ok(calls.dept[1]?._);
  assert.equal(calls.emp.length, 0, "the page no longer loads a 20-person employee list");
  assert.ok(screen.getByText("Designation list refreshed."));
});

test("a refresh shows new rows from the database", async (t) => {
  let n = 0;
  await open(t, { getDesignations: async () => ({ data: n++ === 0 ? ROWS().slice(0, 1) : [...ROWS(), ROW({ id: 4, title: "Brand New", source: "import" })] }) });
  assert.equal(screen.queryByText("Brand New"), null);
  fireEvent.click(screen.getByRole("button", { name: "Refresh designations" }));
  await settle();
  assert.ok(screen.getByText("Brand New"));
});

test("a failed refresh is reported instead of silently doing nothing", async (t) => {
  let n = 0;
  await open(t, { getDesignations: async () => { if (n++ > 0) throw new Error("Server unavailable"); return { data: ROWS() }; } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh designations" }));
  await settle();
  assert.ok(screen.getByRole("alert").textContent.includes("Server unavailable"));
  assert.ok(screen.getByText("Staff Engineer")); // the last good data stays on screen
});

test("each row says where the designation came from", async (t) => {
  await open(t);
  const row = (title) => screen.getByText(title).closest("tr");
  assert.ok(within(row("Staff Engineer")).getByText("Added manually"));
  assert.ok(within(row("Analyst")).getByText("Employee import"));
  assert.ok(within(row("Legacy Role")).getByText("Before tracking"));
  assert.ok(within(row("Analyst")).getByText(/Gina Lopez/));
});

test("the source filter and search narrow the list", async (t) => {
  await open(t);
  fireEvent.change(screen.getByLabelText("Filter by source"), { target: { value: "import" } });
  assert.ok(screen.getByText("Analyst"));
  assert.equal(screen.queryByText("Staff Engineer"), null);
  fireEvent.change(screen.getByLabelText("Filter by source"), { target: { value: "none" } });
  assert.ok(screen.getByText("Legacy Role"));
  assert.equal(screen.queryByText("Analyst"), null);
  fireEvent.change(screen.getByLabelText("Filter by source"), { target: { value: "all" } });
  fireEvent.change(screen.getByLabelText("Search designations"), { target: { value: "nothing-matches" } });
  assert.ok(screen.getByText("No designations match your search or filter."));
});

test("a designation held by employees cannot be deleted from the list", async (t) => {
  await open(t);
  const held = within(screen.getByText("Staff Engineer").closest("tr")).getByRole("button", { name: "Delete" });
  assert.equal(held.disabled, true);
  assert.match(held.title, /2 employee/);
  const free = within(screen.getByText("Analyst").closest("tr")).getByRole("button", { name: "Delete" });
  assert.equal(free.disabled, false);
});

test("deleting an unused designation confirms, removes it and refreshes", async (t) => {
  const original = window.confirm;
  window.confirm = () => true;
  try {
    await open(t);
    fireEvent.click(within(screen.getByText("Analyst").closest("tr")).getByRole("button", { name: "Delete" }));
    await settle();
    assert.deepEqual(calls.deleted, [2]);
    assert.equal(screen.queryByText("Analyst"), null);
    assert.ok(screen.getByText("Designation deleted."));
  } finally { window.confirm = original; }
});

test("a delete the server refuses shows the reason", async (t) => {
  const original = window.confirm;
  window.confirm = () => true;
  try {
    await open(t, { deleteDesignation: async () => { throw new Error("Cannot delete 'Analyst'. 1 employee(s) hold this designation."); } });
    fireEvent.click(within(screen.getByText("Analyst").closest("tr")).getByRole("button", { name: "Delete" }));
    await settle();
    assert.ok(screen.getByRole("alert").textContent.includes("hold this designation"));
  } finally { window.confirm = original; }
});

test("a save the server refuses (duplicate title) is shown in the form", async (t) => {
  await open(t, { createDesignation: async () => { throw new Error("Designation with this title already exists."); } });
  fireEvent.click(screen.getByRole("button", { name: /Add Designation/ }));
  const form = document.querySelector("form");
  fireEvent.change(form.querySelector('input[type="text"]'), { target: { value: "Analyst" } });
  fireEvent.change(form.querySelector("select"), { target: { value: "Eng" } });
  fireEvent.submit(form);
  await settle();
  assert.ok(within(form).getByRole("alert").textContent.includes("already exists"));
});

// ── Designation code removed; Assign to employees (any role, searched on the server); optional department and level ──
const pick = async (name) => {
  fireEvent.focus(screen.getAllByRole("combobox").at(-1));
  fireEvent.change(screen.getAllByRole("combobox").at(-1), { target: { value: name.slice(0, 3) } });
  await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
  fireEvent.click(screen.getByText(new RegExp(name)));
  await settle();
};

test("the designation code is not shown anywhere on the list", async (t) => {
  await open(t);
  assert.equal(screen.queryByText("Designation Code"), null);
  assert.equal(screen.queryByText("DES001"), null);
  assert.ok(screen.getByText("Employees"));
  assert.ok(within(screen.getByText("Staff Engineer").closest("tr")).getByText("2 people"));
});

test("Assign gives the designation to several people at once", async (t) => {
  await open(t);
  fireEvent.click(screen.getByRole("button", { name: "Assign Analyst to employees" }));
  const dlg = screen.getByRole("dialog", { name: "Assign Analyst" });
  await pick("Ravi Shah");
  await pick("Meena Iyer");
  assert.ok(within(dlg).getByRole("button", { name: "Remove Ravi Shah" }));
  fireEvent.click(within(dlg).getByRole("button", { name: "Assign 2" }));
  await settle();
  assert.deepEqual(calls.assigned, [[2, { employee_ids: [21, 22], sync_job_title: true }]]);
  assert.ok(screen.getByText(/given to 2 people/));
});

test("an inactive designation cannot be assigned", async (t) => {
  await open(t, { getDesignations: async () => ({ data: [ROW({ id: 7, title: "Retired Role", status: "inactive" })] }) });
  assert.equal(screen.getByRole("button", { name: "Assign Retired Role to employees" }).disabled, true);
});

test("the detail panel lists who holds the designation, current people first", async (t) => {
  await open(t);
  fireEvent.click(screen.getByText("Staff Engineer"));
  await settle();
  assert.deepEqual(calls.holders, [1]);
  const list = screen.getByRole("region", { name: "People with this designation" });
  assert.ok(within(list).getByText("Asha Rao"));
  assert.ok(within(list).getByText("resigned"));
});

test("a new designation needs no department or level and can be given to people straight away", async (t) => {
  const created = [];
  await open(t, { createDesignation: async (p) => { created.push(p); return { data: { id: 9, status: "active" } }; } });
  fireEvent.click(screen.getByRole("button", { name: /Add Designation/ }));
  const form = document.querySelector("form");
  fireEvent.change(form.querySelector('input[type="text"]'), { target: { value: "Team Lead" } });
  fireEvent.change(screen.getByLabelText("Hierarchy Level"), { target: { value: "" } });
  await pick("Ravi Shah");
  fireEvent.submit(form);
  await settle();
  assert.equal(created[0].department_name, null);
  assert.equal(created[0].level, null);
  assert.equal("designation_code" in created[0], false);
  assert.deepEqual(calls.assigned, [[9, { employee_ids: [21], sync_job_title: true }]]);
  assert.ok(screen.getByText(/Given to 1 person/));
});
