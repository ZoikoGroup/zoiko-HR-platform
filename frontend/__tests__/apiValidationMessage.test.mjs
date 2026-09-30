/**
 * Tests for src/utils/validationMessage.js
 *
 * A price box left blank used to surface raw Pydantic 422 text ("Input should
 * be a valid number, unable to parse string as a number") to the user, and the
 * plan form only caught errors by substring-matching the banner string. These
 * tests pin the rewritten, human-readable output — especially the plan price
 * fields — so the developer-facing wording can never leak back into the UI.
 *
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { humanizeValidationError } from "../src/utils/validationMessage.js";

const err = (msg, field) => ({ msg, loc: ["body", field] });

test("blank price box is reported by field name, not developer jargon", () => {
  const out = humanizeValidationError(
    err("Input should be a valid number, unable to parse string as a number", "annual_price")
  );
  assert.equal(out, "Annual Price must be a number");
  assert.ok(!/Input should be/.test(out), "leaked raw Pydantic wording");
  assert.ok(!/unable to parse/.test(out), "leaked raw Pydantic wording");
});

test("every plan price field maps to its label", () => {
  const cases = [
    ["monthly_price", "Monthly Price"],
    ["annual_price", "Annual Price"],
    ["catalog_version", "Catalog Version"],
    ["billing_metric", "Billing Metric"],
    ["is_contract_priced", "Contract Priced"],
  ];
  for (const [field, label] of cases) {
    const out = humanizeValidationError(err("Input should be a valid number", field));
    assert.ok(out.startsWith(label), `expected '${label}' prefix, got '${out}'`);
  }
});

test("numeric bounds are restated in plain language", () => {
  const out = humanizeValidationError(
    err("Input should be less than or equal to 99999999", "monthly_price")
  );
  assert.equal(out, "Monthly Price must be 99999999 or less");
});

test("enum rejection reads as a requirement, not a Pydantic sentence", () => {
  const out = humanizeValidationError(
    err("Input should be 'active_workforce' or 'committed_workforce'", "billing_metric")
  );
  assert.ok(!/Input should be/.test(out), "leaked raw Pydantic wording");
  assert.ok(out.startsWith("Billing Metric"), `got '${out}'`);
});

test("missing field falls back to a generic but honest message", () => {
  assert.equal(humanizeValidationError(err("Field required", "catalog_version")),
    "Catalog Version is required");
  assert.equal(humanizeValidationError({ msg: undefined, loc: ["body", "monthly_price"] }),
    "Monthly Price has an invalid value");
  assert.equal(humanizeValidationError({}), "Field has an invalid value");
  assert.equal(humanizeValidationError(), "Field has an invalid value");
});

test("multiple field errors stay comma separated for the banner", () => {
  const joined = [
    err("Input should be a valid number", "monthly_price"),
    err("Input should be a valid number", "annual_price"),
  ].map(humanizeValidationError).join(", ");
  assert.equal(joined, "Monthly Price must be a number, Annual Price must be a number");
});
