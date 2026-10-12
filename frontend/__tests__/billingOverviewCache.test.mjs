/** Billing Overview on the query cache: shares the dashboard's data, fails and retries cleanly. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const calls = {};
const behaviour = {};
const wrap = (name, ok) => async () => { calls[name] = (calls[name] || 0) + 1; return behaviour[name] ? behaviour[name]() : ok; };
const PLAN = { id: 1, code: "core", name: "Core", is_active: true, is_self_serve_enabled: true, is_contract_priced: false, monthly_price: 12 };
mock.module("../src/service/billingService.js", { exports: { billingService: {
  getPlans: wrap("plans", { list: [PLAN], total: 1 }), getDiscounts: wrap("discounts", { list: [], total: 0 }), getPlatformDelinquency: wrap("delinquency", { list: [], total: 0 }),
} } });
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: {
  getOrganizations: wrap("orgs", { organizations: [], total: 0 }),
  getCommandCenterCommercialHealth: wrap("commercial", { revenue_next_30_days_cents: 500000 }),
  getCommandCenterLifecycle: wrap("lifecycle", { conversion_rate_pct: 42 }),
} } });
const { default: Page } = await import("../src/modules/super-admin/BillingOverviewPage.jsx");
const { keys } = await import("../src/service/queryKeys.js");
const reset = () => { for (const k of Object.keys(calls)) delete calls[k]; for (const k of Object.keys(behaviour)) delete behaviour[k]; };
const ui = (client) => withQuery(h(MemoryRouter, null, h(Page)), client);

test("data already cached by the dashboard (commercial health, lifecycle) is not requested again", async () => {
  reset();
  const client = testQueryClient();
  client.setQueryData(keys.superAdmin.commandCenter.commercialHealth(30), { revenue_next_30_days_cents: 500000 });
  client.setQueryData(keys.superAdmin.commandCenter.lifecycle(), { conversion_rate_pct: 42 });
  render(ui(client));
  await settle();
  assert.equal(calls.commercial, undefined);
  assert.equal(calls.lifecycle, undefined);
  assert.equal(calls.plans, 1);
  assert.match(document.body.textContent, /42%/);
});

test("a failed plans request shows the error and Retry loads it", async () => {
  reset();
  behaviour.plans = async () => { throw new Error("billing is down"); };
  render(ui(testQueryClient()));
  await settle(200);
  const alert = screen.getByRole("alert", { hidden: true });
  assert.match(alert.textContent, /billing is down/);
  behaviour.plans = async () => ({ list: [PLAN], total: 1 });
  fireEvent.click(alert.querySelector("button"));
  await settle(200);
  assert.equal(screen.queryByText(/billing is down/), null);
});
