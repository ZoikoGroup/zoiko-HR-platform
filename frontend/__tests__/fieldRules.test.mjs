/** B7–B13, B16–B38: the shared field rules. The same fixture runs against backend/app/core/field_rules.py, so the browser and
 * the server accept and refuse exactly the same values with exactly the same messages. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanField, fieldProblem, validateFields, RULES, countryIso, callingCode, ibanOk, abaOk, bankAccountInputFilter, phoneInputFilter }
  from "../src/utils/fieldRules.js";

const { cases } = JSON.parse(readFileSync(new URL("../../backend/tests/fixtures/field_rules_cases.json", import.meta.url), "utf8"));

for (const c of cases) {
  test(`fieldRules ${c.rule} ${JSON.stringify(c.value)} ${c.country || ""} -> ${c.valid ? "ok" : "refused"}`, () => {
    if (c.valid) {
      const out = cleanField(c.rule, c.value, { country: c.country, idKey: c.id_key });
      if ("normalized" in c) assert.equal(out, c.normalized === null ? "" : c.normalized);
      assert.equal(fieldProblem(c.rule, c.value, { country: c.country, idKey: c.id_key }), "");
    } else {
      assert.equal(fieldProblem(c.rule, c.value, { country: c.country, idKey: c.id_key }), c.message);
    }
  });
}

test("every rule has fixture cases", () => {
  const covered = new Set(cases.map((c) => c.rule));
  for (const r of RULES) assert.ok(covered.has(r), r);
});

test("helpers: country lookup, calling codes, IBAN and ABA check digits, input filters", () => {
  assert.equal(countryIso("india"), "IN");
  assert.equal(countryIso("Bangalore"), null, "a city is not a country");
  assert.equal(callingCode("India"), "+91");
  assert.equal(callingCode("US"), "+1");
  assert.ok(ibanOk("GB82WEST12345698765432"));
  assert.ok(!ibanOk("GB82WEST12345698765433"));
  assert.ok(abaOk("021000021"));
  assert.equal(bankAccountInputFilter("12ab-34 56", "India"), "1234 56");
  assert.equal(bankAccountInputFilter("de89 3704!", "Germany"), "DE89 3704");
  assert.equal(phoneInputFilter("+91 98abc765-43210"), "+91 98765-43210");
});

test("validateFields maps every problem to its field, honours required and the changed-only filter", () => {
  const form = { first_name: "John3", last_name: "", city: "Pune", email: "x@example.com" };
  const spec = { first_name: "person_name", last_name: ["person_name", { required: true, requiredMessage: "Last name is required" }], city: "place_name", email: "email" };
  const errors = validateFields(form, spec);
  assert.match(errors.first_name, /Use letters only/);
  assert.equal(errors.last_name, "Last name is required");
  assert.equal(errors.city, undefined);
  assert.match(errors.email, /Placeholder/);
  assert.deepEqual(Object.keys(validateFields(form, spec, { only: new Set(["city"]) })), []);
});
