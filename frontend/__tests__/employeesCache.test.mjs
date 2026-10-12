/** Employee directory on the query cache: revisit is instant, paging keeps rows, changes refresh the HR family. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, cleanup, act, screen } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";
import { keys } from "../src/service/queryKeys.js";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const state = { calls: [], fail: false };
const emp = (id, n) => ({ id, first_name: n, last_name: "Test", email: `${n}@x.com`, status: "active", job_title: "Eng" });
mock.module("../src/service/employee.js", { exports: {
  getEmployees: async (p) => { state.calls.push(p); if (state.fail && !p.per_page || state.fail && p.per_page === 25) throw new Error("directory down"); return { items: [emp(1, "Zelda")], total: 1 }; },
  getDepartments: async () => [], getDesignations: async () => [], createEmployee: async () => ({}), updateEmployee: async () => ({}), deleteEmployee: async () => ({}),
  getEmployeeById: async () => ({}), importEmployees: async () => ({}), downloadImportTemplate: async () => ({}),
} });
mock.module("../src/components/EmployeeBulkActions.jsx", { exports: { default: () => h("div") } });
mock.module("../src/service/userService.js", { exports: { resetPassword: async () => ({}) } });
mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => h("div", null, children) } });
const { default: Page } = await import("../src/pages/Peoples/Employees/EmployeeManagement/employees.jsx");
const ui = (client) => withQuery(h(MemoryRouter, null, h(Page)), client);

test("a revisit shows the rows from the cache with no new list request", async () => {
  state.calls = []; state.fail = false;
  const client = testQueryClient();
  const first = render(ui(client));
  await settle();
  assert.match(document.body.textContent, /Zelda/);
  const n = state.calls.length;
  first.unmount();
  render(ui(client));
  await settle();
  assert.equal(state.calls.length, n);
  assert.match(document.body.textContent, /Zelda/);
});

test("invalidating the HR family (what every employee change does) refetches the list", async () => {
  state.calls = [];
  const client = testQueryClient();
  render(ui(client));
  await settle();
  const n = state.calls.length;
  await act(async () => { await client.invalidateQueries({ queryKey: keys.hr.all }); });
  await settle();
  assert.ok(state.calls.length > n);
});
