/** Prefetch on intent: chunks start once, and prefetched data is exactly what the page then reads (no second request). */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { withQuery } from "./support/queryWrapper.mjs";
import { queryClient } from "../src/lib/queryClient.js";

afterEach(() => { cleanup(); queryClient.clear(); });
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const calls = { orgs: 0, emps: 0 };
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: {
  getOrganizations: async () => { calls.orgs += 1; return { organizations: [{ id: 1, name: "Prefetched Co", status: "active" }], total: 1 }; },
  getCommandCenterOverview: async () => ({}),
} } });
mock.module("../src/service/employee.js", { exports: {
  getEmployees: async (p) => { if (p.page === 1 && p.per_page === 10) calls.emps += 1; return { items: [{ id: 1, first_name: "Prefetched", last_name: "Person", email: "p@x.com", status: "active" }], total: 1 }; },
  getDepartments: async () => [], getDesignations: async () => [], createEmployee: async () => ({}), updateEmployee: async () => ({}), deleteEmployee: async () => ({}),
  getEmployeeById: async () => ({}), importEmployees: async () => ({}), downloadImportTemplate: async () => ({}), getImportTemplateCountries: async () => [{ name: "United States", currency: "USD", identifiers: ["SSN", "State payroll ID (optional)", "Routing number"] }, { name: "Germany", currency: "EUR", identifiers: ["Tax ID (Steuer-ID)", "Social insurance number (SV-Nummer)", "BIC (optional)"] }],
} });
mock.module("../src/components/EmployeeBulkActions.jsx", { exports: { default: () => h("div") } });
mock.module("../src/service/userService.js", { exports: { resetPassword: async () => ({}) } });
mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => h("div", null, children) } });
const { lazyRoute } = await import("../src/lib/lazyRoute.js");
const { registerRoutes, prefetchRoute, preloadChunk, prefetchAfterLogin } = await import("../src/lib/prefetch.js");

test("a route's chunk is requested once, however often the link is hovered, and a failed load can be retried", async () => {
  let loads = 0;
  const Page = lazyRoute(() => { loads += 1; return Promise.resolve({ default: () => null }); });
  registerRoutes({ "/a": h(Page) });
  prefetchRoute("/a"); prefetchRoute("/a?x=1"); preloadChunk("/a#top");
  await settle(20);
  assert.equal(loads, 1);
  let tries = 0;
  const Bad = lazyRoute(() => { tries += 1; return Promise.reject(new Error("offline")); });
  registerRoutes({ "/b": h(Bad) });
  prefetchRoute("/b"); await settle(20); prefetchRoute("/b"); await settle(20);
  assert.equal(tries, 2, "a failed prefetch is not remembered");
  prefetchRoute("/nope");                                    // unknown links are ignored
});

test("Organizations: prefetched data is what the page reads, so opening it makes no list request", async () => {
  registerRoutes({});
  calls.orgs = 0;
  await act(async () => { prefetchRoute("/super-admin/organizations"); await new Promise((r) => setTimeout(r, 100)); });
  assert.equal(calls.orgs, 1);
  const { default: Page } = await import("../src/modules/super-admin/OrganizationsPage.jsx");
  render(withQuery(h(MemoryRouter, null, h(Page)), queryClient));
  await settle();
  assert.match(document.body.textContent, /Prefetched Co/);
  assert.equal(calls.orgs, 1, "the page used the prefetched entry");
});

test("Employees: prefetched data is what the page reads", async () => {
  calls.emps = 0;
  await act(async () => { prefetchRoute("/zoiko-hr/employee-management/employees"); await new Promise((r) => setTimeout(r, 100)); });
  assert.equal(calls.emps, 1);
  const { default: Page } = await import("../src/pages/Peoples/Employees/EmployeeManagement/employees.jsx");
  render(withQuery(h(MemoryRouter, null, h(Page)), queryClient));
  await settle();
  assert.match(document.body.textContent, /Prefetched/);
  assert.equal(calls.emps, 1);
});

test("after login only the code of the likely next pages is warmed, after a delay, and only for roles that have a list", async () => {
  let loads = 0;
  const Page = lazyRoute(() => { loads += 1; return Promise.resolve({ default: () => null }); });
  registerRoutes({ "/super-admin/organizations": h(Page) });
  const cancel = prefetchAfterLogin("super_admin", { delayMs: 20 });
  assert.equal(loads, 0, "nothing on the spot");
  await settle(80);
  assert.equal(loads, 1);
  cancel();
  prefetchAfterLogin("employee", { delayMs: 0 });
  await settle(40);
  assert.equal(loads, 1);
});
