/** Super admin dashboard: one query per card, each card independent. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, cleanup, act, fireEvent, screen } from "@testing-library/react";

afterEach(() => cleanup());
const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;

// recharts draws nothing in jsdom and is slow to load: stub it
const Null = () => null;
mock.module("recharts", { exports: { Area: Null, AreaChart: Null, CartesianGrid: Null, Line: Null, LineChart: Null, ResponsiveContainer: Null, Tooltip: Null, XAxis: Null, YAxis: Null } });

const calls = {};
const behaviour = {};
const wrap = (name, ok) => async (...args) => {
  calls[name] = (calls[name] || 0) + 1;
  const fn = behaviour[name];
  if (fn) return fn(...args);
  return ok;
};
const OVERVIEW = {
  period_days: 30, active_organizations: { value: 12, delta_pct: 1, series: { dates: [], values: [] } }, subscribed_workforce: { value: 340, delta_pct: 1, series: { dates: [], values: [] } },
  mrr_cents: { value: 120000, delta_pct: 1, series: { dates: [], values: [] } }, activation_rate_pct: { value: 55, delta_pct: 1, series: { dates: [], values: [] } },
  platform_reliability_pct: 99.9, critical_attention_count: 2, banner_status: "operational", active_p1_incidents: 0, mrr_pricing_configured: true, pending_exception_approvals: 0,
};
const svc = {
  getCommandCenterOverview: wrap("overview", OVERVIEW),
  getCommandCenterAttention: wrap("attention", { items: [] }),
  getCommandCenterCustomerHealth: wrap("customerHealth", { healthy: 3, watch: 1, at_risk: 0, top_at_risk: [] }),
  getCommandCenterCommercialHealth: wrap("commercialHealth", { trend: [], revenue_next_30_days_cents: 0, failed_payments_cents: 0, failed_payments_org_count: 0, plan_overages_cents: 0, plan_overages_org_count: 0, entitlement_mismatch_count: 0, pricing_configured: true }),
  getCommandCenterLifecycle: wrap("lifecycle", { created: 5, provisioned: 4, configured: 3, activated: 2, adopted: 1, conversion_rate_pct: 20 }),
  getCommandCenterPlatformHealth: wrap("platformHealth", [{ service_name: "hr_core", display_name: "HR Core", status: "healthy", availability_pct: 99.9 }]),
  getCommandCenterSecurity: wrap("security", { failed_logins: 0, privileged_actions: 0, mfa: null, trend: [], tiles: [] }),
  getAuditLogs: wrap("audit", { logs: [], total: 0 }),
  updateCommandCenterPlatformHealth: wrap("updateHealth", { service_name: "hr_core", display_name: "HR Core", status: "warning", availability_pct: 99.9 }),
};
mock.module("../src/service/superAdminService", { exports: { superAdminService: svc } });
const { default: Dashboard } = await import("../src/modules/super-admin/DashboardPage.jsx");
const { useUpdateServiceStatus } = await import("../src/modules/super-admin/command-center/useCommandCenter.js");
const { keys } = await import("../src/service/queryKeys.js");

const reset = () => { for (const k of Object.keys(calls)) delete calls[k]; for (const k of Object.keys(behaviour)) delete behaviour[k]; };
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  render(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(Dashboard))));
  return client;
};

test("one failing endpoint breaks only its own card; the rest render, and Retry refetches only that card", async () => {
  reset();
  behaviour.attention = async () => { throw new Error("attention is down"); };
  mount();
  await settle(150);
  const alert = screen.getAllByRole("alert").find((a) => /attention is down/.test(a.textContent));
  assert.ok(alert, "the failed card shows its own error");
  assert.match(document.body.textContent, /340|340/);                     // key figures (overview) still rendered
  assert.match(document.body.textContent, /Customer Health/);
  const before = { ...calls };
  behaviour.attention = async () => ({ items: [] });
  fireEvent.click(alert.querySelector("button"));
  await settle(150);
  assert.equal(calls.attention, before.attention + 1, "only the failed card was refetched");
  assert.equal(calls.overview, before.overview);
  assert.equal(calls.security, before.security);
  assert.equal(screen.queryAllByRole("alert").filter((a) => /attention is down/.test(a.textContent)).length, 0);
});

test("a slow endpoint does not hold back the others", async () => {
  reset();
  let release;
  behaviour.security = () => new Promise((resolve) => { release = () => resolve({ failed_logins: 0, privileged_actions: 0, trend: [], tiles: [] }); });
  mount();
  await settle(150);
  assert.match(document.body.textContent, /Lifecycle|Organization/i, "lifecycle card is shown while security is still loading");
  assert.ok(document.querySelector(".animate-pulse"), "the slow card shows its own skeleton");
  assert.equal(calls.overview, 1);
  release();
  await settle(100);
});

test("changing the period refetches only the cards that depend on it", async () => {
  reset();
  mount();
  await settle(150);
  const before = { ...calls };
  fireEvent.change(document.querySelector("select"), { target: { value: "Last 90 days" } });
  await settle(200);
  assert.equal(calls.overview, before.overview + 1);
  assert.equal(calls.commercialHealth, before.commercialHealth + 1);
  assert.equal(calls.security, before.security + 1);
  for (const k of ["attention", "customerHealth", "lifecycle", "platformHealth", "audit"]) assert.equal(calls[k], before[k], `${k} is not period-dependent`);
});

test("the refresh button refetches every card", async () => {
  reset();
  mount();
  await settle(150);
  const before = { ...calls };
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await settle(250);
  for (const k of ["overview", "attention", "customerHealth", "commercialHealth", "lifecycle", "platformHealth", "security", "audit"]) {
    assert.equal(calls[k], before[k] + 1, `${k} refetched`);
  }
});

test("changing a service's status updates the platform-health data in place and refreshes only the overview", async () => {
  reset();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  client.setQueryData(keys.superAdmin.commandCenter.platformHealth(), [{ service_name: "hr_core", status: "healthy" }, { service_name: "auth", status: "healthy" }]);
  client.setQueryData(keys.superAdmin.commandCenter.overview(30), OVERVIEW);
  const wrapper = ({ children }) => h(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useUpdateServiceStatus(), { wrapper });
  await act(async () => { result.current.mutate({ serviceName: "hr_core", status: "warning", existing: { availability_pct: 99.9 } }); });
  await settle(100);
  const data = client.getQueryData(keys.superAdmin.commandCenter.platformHealth());
  assert.equal(data.find((s) => s.service_name === "hr_core").status, "warning");
  assert.equal(data.find((s) => s.service_name === "auth").status, "healthy", "the other service is untouched");
  assert.equal(client.getQueryState(keys.superAdmin.commandCenter.overview(30)).isInvalidated, true, "the overview is marked for refresh");
});
