import { test } from "node:test";
import assert from "node:assert/strict";
import { statutoryField, statutoryFields } from "../src/utils/employeeStatutory.js";

test("statutory labels follow the country", () => {
  assert.equal(statutoryField("pan_number", "India").label, "PAN");
  assert.equal(statutoryField("bank_ifsc", "India").label, "IFSC code");
  assert.equal(statutoryField("pan_number", "United States").label, "SSN");
  assert.equal(statutoryField("bank_ifsc", "United States").label, "Routing number");
  assert.equal(statutoryField("pan_number", "United Kingdom").label, "National Insurance number");
  assert.equal(statutoryField("bank_ifsc", "United Kingdom").label, "Sort code");
  assert.equal(statutoryField("pan_number", "Canada").label, "SIN");
  assert.equal(statutoryField("bank_ifsc", "Australia").label, "BSB");
  assert.equal(statutoryField("bank_account", "Germany").label, "IBAN");
  // Aliases and case do not matter.
  assert.equal(statutoryField("pan_number", "  USA ").label, "SSN");
  assert.equal(statutoryField("pan_number", "uk").label, "National Insurance number");
});

test("unknown countries fall back to generic labels, backend names never change", () => {
  assert.equal(statutoryField("pan_number", "Atlantis").label, "Tax identification number");
  assert.equal(statutoryField("bank_ifsc", "").label, "Bank branch / routing code");
  assert.equal(statutoryField("first_name", "India"), null);
  assert.deepEqual(statutoryFields("India").map((f) => f.name), ["pan_number", "uan_number", "bank_account", "bank_ifsc"]);
});
