import test from "node:test";
import assert from "node:assert/strict";
import { organizationIdOf } from "../src/service/api.js";

test("the signed-in person's organization id is read whichever key style the API used", () => {
  assert.equal(organizationIdOf({ organizationId: 6 }), 6);          // what /auth/login and /auth/me send
  assert.equal(organizationIdOf({ organization_id: 17 }), 17);       // older stored copies
  assert.equal(organizationIdOf(null), null);
  assert.equal(organizationIdOf({}), null);
});
