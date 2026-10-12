/** HR dashboard on the query cache: one fetch per visit window, refreshed every 60 s only while the tab is visible. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, cleanup, act } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";
import { keys } from "../src/service/queryKeys.js";

afterEach(() => cleanup());
const settle = (ms = 120) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const state = { stats: 0 };
const none = async () => ({});
mock.module("../src/service/hrService.js", { exports: { getHrDashboardStats: async () => { state.stats += 1; return {}; }, getHrEmployees: async () => [], getDepartments: async () => [], getAttendanceDashboard: none, getLeaveDashboard: none, getCompensationDashboard: none, getPerformanceDashboard: none } });
mock.module("../src/service/orgAdminService.js", { exports: { getOrganizationDetails: async () => ({ name: "Acme Cache Co" }) } });
mock.module("../src/service/employee.js", { exports: { getDesignations: async () => [], createEmployee: async () => ({}) } });
const { default: Page } = await import("../src/modules/zoiko-hr/HrDashBoard.jsx");
const ui = (client) => withQuery(React.createElement(MemoryRouter, null, React.createElement(Page)), client);

test("a revisit shows the cached dashboard without a new request, and polling is 60 s", async () => {
  state.stats = 0;
  const client = testQueryClient();
  const first = render(ui(client));
  await settle();
  assert.equal(state.stats, 1);
  assert.match(document.body.textContent, /Acme Cache Co/);
  const q = client.getQueryCache().find({ queryKey: keys.hr.dashboard() });
  assert.equal(q.observers[0].options.refetchInterval, 60_000);
  assert.ok(!q.observers[0].options.refetchIntervalInBackground, "no polling while the tab is hidden");
  first.unmount();
  render(ui(client));
  await settle();
  assert.equal(state.stats, 1);
  assert.match(document.body.textContent, /Acme Cache Co/);
});
