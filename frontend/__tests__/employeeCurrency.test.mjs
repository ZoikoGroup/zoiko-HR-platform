import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyForCountry, salaryCurrencyCode, salaryCurrencyName, formatSalary } from "../src/utils/employeeCurrency.js";

test("countries map to their currency", () => {
  assert.deepEqual(currencyForCountry("India"), { code: "INR", locale: "en-IN" });
  assert.deepEqual(currencyForCountry("  UNITED STATES "), { code: "USD", locale: "en-US" });
  assert.equal(salaryCurrencyCode("Germany"), "EUR");
  assert.equal(salaryCurrencyCode("Atlantis"), "");
  assert.equal(salaryCurrencyCode(""), "");
  assert.equal(salaryCurrencyCode(null), "");
  assert.match(salaryCurrencyName("India"), /INR/);
  assert.equal(salaryCurrencyName("Atlantis"), "");
});

test("salaries format in the employee's currency", () => {
  const inr = formatSalary("1200000", "India");
  assert.match(inr, /₹/);
  assert.match(inr, /12,00,000/, "Indian digit grouping");
  assert.match(formatSalary(5000, "United States"), /\$/);
  assert.match(formatSalary(5000, "Germany"), /€/);
  // Unknown country: plain number, never a guessed symbol.
  assert.equal(formatSalary(5000, "Atlantis"), "5,000");
  assert.equal(formatSalary("", "India"), "");
  assert.equal(formatSalary(null, "India"), "");
  assert.equal(formatSalary("abc", "India"), "abc");
});
