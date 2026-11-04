/** The organization admin is offered Core, Advanced and Enterprise only, in that order. */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { offeredPlans, planDisplayName } from "../src/modules/organization-admin/BillingPlanPage.jsx";

test("only the three plans are offered, in order, whatever else exists", () => {
  const list = [{ code: "starter" }, { code: "ENTERPRISE" }, { code: "core" }, { code: "legacy" }, { code: "advanced" }, { code: "core" }];
  assert.deepEqual(offeredPlans(list).map((p) => p.code.toLowerCase()), ["core", "advanced", "enterprise"]);
  assert.deepEqual(offeredPlans([{ code: "advanced" }]).map((p) => p.code), ["advanced"]);
  assert.deepEqual(offeredPlans(undefined), []);
});

test("the label comes from the plan code, never a typo in the stored name", () => {
  assert.equal(planDisplayName({ code: "core", name: "Core plam" }), "Core");
  assert.equal(planDisplayName({ code: "CORE", name: "core plam" }), "Core");
  assert.equal(planDisplayName({ code: "advanced", name: "Advanced" }), "Advanced");
  assert.equal(planDisplayName({ code: "enterprise", name: "Enterprise plam" }), "Enterprise");
  assert.equal(planDisplayName({ code: "starter", name: "Starter" }), "Starter", "unknown codes keep their stored name");
  assert.equal(planDisplayName({ code: "starter" }), "STARTER", "unknown codes without a name fall back to the code label");
});
