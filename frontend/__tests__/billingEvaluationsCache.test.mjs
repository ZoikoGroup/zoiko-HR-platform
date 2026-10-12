/** Evaluations on the query cache: cached revisit, and ending an evaluation refreshes everything it touches. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const calls = { list: 0, plans: 0, ended: [] };
let active = true;
const EV = () => ({ id: 3, organization_id: 8, organization_name: "Acme", status: active ? "active" : "evaluation_ended", evaluation_ends_at: "2026-11-01T00:00:00Z", approved_package_scope: "core", data_classification: "synthetic", conversion_owner: "Ann", created_at: "2026-10-01T00:00:00Z" });
mock.module("../src/service/billingService.js", { exports: { billingService: {
  getPlatformEvaluations: async () => { calls.list += 1; return { list: [EV()], total: 1 }; },
  getEvaluations: async () => ({ list: [EV()] }), getConversions: async () => ({ list: [] }),
  getPlans: async () => { calls.plans += 1; return { list: [{ id: 1, code: "core", name: "Core" }] }; },
  endEvaluation: async (id) => { calls.ended.push(id); active = false; return {}; },
} } });
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: { getOrganizations: async () => ({ organizations: [], total: 0 }) } } });
const { default: Page } = await import("../src/modules/super-admin/BillingEvaluationsPage.jsx");
const { keys } = await import("../src/service/queryKeys.js");

test("a revisit within the freshness window shows evaluations at once and makes no new request", async () => {
  calls.list = 0; calls.plans = 0; active = true;
  const client = testQueryClient();
  const first = render(withQuery(h(Page), client));
  await settle(300);
  assert.match(document.body.textContent, /Acme/);
  assert.deepEqual([calls.list, calls.plans], [1, 1]);
  first.unmount();
  render(withQuery(h(Page), client));
  assert.match(document.body.textContent, /Acme/);
  await settle(300);
  assert.deepEqual([calls.list, calls.plans], [1, 1]);
});

test("ending an evaluation refetches the list and marks organizations and the dashboard stale", async () => {
  calls.list = 0; calls.ended = []; active = true;
  const client = testQueryClient();
  client.setQueryData(keys.superAdmin.organizations.list({ page: 1, page_size: 20 }), { organizations: [], total: 0 });
  client.setQueryData(keys.superAdmin.commandCenter.lifecycle(), { created: 1 });
  render(withQuery(h(Page), client));
  await settle(300);
  fireEvent.click(screen.getByRole("button", { name: /^end$/i }));
  await settle(400);
  assert.deepEqual(calls.ended, [3]);
  assert.equal(calls.list, 2, "list refetched");
  assert.match(document.body.textContent, /evaluation ended/i);
  assert.equal(client.getQueryState(keys.superAdmin.organizations.list({ page: 1, page_size: 20 })).isInvalidated, true);
  assert.equal(client.getQueryState(keys.superAdmin.commandCenter.lifecycle()).isInvalidated, true);
});

test("a failed load shows the error with Retry", async () => {
  const mod = await import("../src/service/billingService.js");
  const original = mod.billingService.getPlatformEvaluations;
  mod.billingService.getPlatformEvaluations = async () => { throw new Error("evaluations are down"); };
  render(withQuery(h(Page)));
  await settle(300);
  const alert = screen.getByRole("alert");
  assert.match(alert.textContent, /evaluations are down/);
  assert.match(alert.textContent, /Retry/);
  mod.billingService.getPlatformEvaluations = original;
  fireEvent.click(alert.querySelector("button"));
  await settle(300);
  assert.match(document.body.textContent, /Acme/);
});
