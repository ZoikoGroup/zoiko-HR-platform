/** The organization admin is offered Core, Advanced and Enterprise only, in that order. */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { offeredPlans } from "../src/modules/organization-admin/BillingPlanPage.jsx";

test("only the three plans are offered, in order, whatever else exists", () => {
  const list = [{ code: "starter" }, { code: "ENTERPRISE" }, { code: "core" }, { code: "legacy" }, { code: "advanced" }, { code: "core" }];
  assert.deepEqual(offeredPlans(list).map((p) => p.code.toLowerCase()), ["core", "advanced", "enterprise"]);
  assert.deepEqual(offeredPlans([{ code: "advanced" }]).map((p) => p.code), ["advanced"]);
  assert.deepEqual(offeredPlans(undefined), []);
});
