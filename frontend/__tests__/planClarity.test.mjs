/** Plans must say plainly what each one includes and what it does not. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { PLAN_MATRIX, planHighlights } from "../src/config/planMatrix.js";

afterEach(() => cleanup());

test("every row says something definite for both plans", () => {
  for (const group of PLAN_MATRIX) {
    assert.ok(group.rows.length > 0);
    for (const r of group.rows) {
      assert.ok(r.feature, group.section);
      for (const v of [r.core, r.advanced]) assert.ok(v === true || v === false || (typeof v === "string" && v.length > 0), `${r.feature}`);
    }
  }
});

test("Core lists what it leaves out and Advanced lists what it adds", () => {
  const core = planHighlights("core");
  const adv = planHighlights("advanced");
  assert.ok(core.includes.length >= 3 && core.excludes.length >= 3);
  assert.ok(core.excludes.some((f) => /performance|workflow|API|single sign/i.test(f)));
  assert.equal(adv.excludes.length, 0);
  assert.equal(adv.includes[0], "Everything in Core");
  assert.ok(adv.includes.length > 3);
});

test("the comparison table marks included, not-included and limited features and names the customer's plan", async () => {
  const { default: PlanComparison } = await import("../src/components/PlanComparison.jsx");
  render(React.createElement(PlanComparison, { highlight: "core" }));
  const table = screen.getByTestId("plan-comparison");
  assert.ok(within(table).getByText("Core (your plan)"));
  const perf = within(table).getByText("Performance reviews, goals & 1:1s").closest("tr");
  assert.ok(within(perf).getByText("Not included"), "Core does not include performance");
  const legal = within(table).getByText("Legal entities").closest("tr");
  assert.ok(within(legal).getByText("1 active legal entity") && within(legal).getByText("Multiple entities"));
  assert.ok(within(table).getByText(/Enterprise adds contract-grade security/));
});
