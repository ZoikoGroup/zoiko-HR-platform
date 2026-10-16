/** Organization-admin user management on the query cache. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const state = { list: 0, fail: false };
mock.module("../src/service/employee.js", { exports: {
  getEmployees: async () => { state.list += 1; if (state.fail) throw new Error("users are down"); return { items: [{ id: 1, first_name: "Zelda", last_name: "Hyrule", email: "z@x.com", status: "active", role: "employee" }], total: 1 }; },
  importEmployees: async () => ({}), downloadImportTemplate: async () => ({}), getImportTemplateCountries: async () => [{ name: "United States", currency: "USD", identifiers: ["SSN", "State payroll ID (optional)", "Routing number"] }, { name: "Germany", currency: "EUR", identifiers: ["Tax ID (Steuer-ID)", "Social insurance number (SV-Nummer)", "BIC (optional)"] }], hardDeleteEmployee: async () => ({}), bulkHardDeleteEmployees: async () => ({}),
} });
const noop = async () => ({});
mock.module("../src/service/userService.js", { exports: { createUser: noop, resetPassword: noop, updateUser: noop, deactivateUser: noop, activateUser: noop, archiveUser: noop, getUser: noop, getAssignableRoles: async () => ({ roles: [{ value: "employee", label: "Employee" }] }) } });
mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({ user: { id: 99, role: "admin" }, role: "admin" }) } });
const { default: Page } = await import("../src/modules/organization-admin/UserManagementPage.jsx");

test("a revisit shows the list with no new request", async () => {
  state.list = 0; state.fail = false;
  const client = testQueryClient();
  const first = render(withQuery(React.createElement(Page), client));
  await settle();
  assert.match(document.body.textContent, /Zelda Hyrule/);
  assert.equal(state.list, 1);
  first.unmount();
  render(withQuery(React.createElement(Page), client));
  await settle();
  assert.match(document.body.textContent, /Zelda Hyrule/);
  assert.equal(state.list, 1);
});

test("a failed load shows the error and Retry refetches", async () => {
  state.list = 0; state.fail = true;
  render(withQuery(React.createElement(Page), testQueryClient()));
  await settle();
  assert.match(document.body.textContent, /users are down/);
  state.fail = false;
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  await settle();
  assert.match(document.body.textContent, /Zelda Hyrule/);
});
