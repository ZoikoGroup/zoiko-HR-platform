/** A feature the plan does not include shows an upgrade notice, and blocked API calls read as sentences. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

async function gate(t, entitlements) {
  t.mock.module("react-router-dom", { exports: { Link: ({ to, children }) => React.createElement("a", { href: to }, children) } });
  t.mock.module("../src/service/billingService.js", { exports: { billingService: { getMyEntitlements: entitlements } } });
  const mod = await import(`../src/components/PlanGate.jsx?t=${Math.random()}`);
  mod.resetPlanGateCache();
  render(React.createElement(mod.default, { featureKey: "hr.performance.cycles", title: "Performance management" }, React.createElement("p", null, "THE PAGE")));
  await settle();
}

test("a plan without the feature sees an upgrade notice, not the page", async (t) => {
  await gate(t, async () => ({ states: { "hr.performance.cycles": "NOT_ENTITLED" } }));
  assert.equal(screen.queryByText("THE PAGE"), null);
  assert.match(screen.getByTestId("plan-gate").textContent, /Performance management is part of the Advanced plan/);
  assert.equal(screen.getByRole("link", { name: /See plans and upgrade/ }).getAttribute("href"), "/organization-admin/billing-and-plan");
});

test("a plan with the feature (or an evaluation) sees the page", async (t) => {
  await gate(t, async () => ({ states: { "hr.performance.cycles": "ENTITLED_AVAILABLE" } }));
  assert.ok(screen.getByText("THE PAGE"));
});

test("when the plan cannot be read the page still shows and the server decides", async (t) => {
  await gate(t, async () => { throw new Error("offline"); });
  assert.ok(screen.getByText("THE PAGE"));
});

test("a blocked request reads as a sentence and carries the upgrade details", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false, status: 403, statusText: "Forbidden", headers: { get: () => "application/json" },
    json: async () => ({ detail: "Performance review cycles is not included in your plan. It is available on the Advanced plan. Go to Billing & Plan to upgrade.", feature_key: "hr.performance.core", state: "NOT_ENTITLED", required_plan: "advanced", upgrade_url: "/organization-admin/billing-and-plan" }),
  });
  try {
    const { api } = await import(`../src/service/api.js?t=${Math.random()}`);
    await assert.rejects(api.get("/hr/performance"), (e) => {
      assert.match(e.message, /not included in your plan/);
      assert.equal(e.entitlement.required_plan, "advanced");
      assert.equal(e.entitlement.upgrade_url, "/organization-admin/billing-and-plan");
      return true;
    });
    globalThis.fetch = async () => ({
      ok: false, status: 403, statusText: "Forbidden", headers: { get: () => "application/json" },
      json: async () => ({ detail: { entitlement_state: "NOT_ENTITLED", feature_key: "hr.documents.bulk_distribution", message: "Bulk document distribution / targeting is not included in your plan.", required_plan: "advanced" } }),
    });
    await assert.rejects(api.post("/hr/documents/1/assign", {}), (e) => {
      assert.equal(e.message, "Bulk document distribution / targeting is not included in your plan.");
      assert.equal(e.entitlement.feature_key, "hr.documents.bulk_distribution");
      return true;
    });
  } finally { globalThis.fetch = realFetch; }
});
