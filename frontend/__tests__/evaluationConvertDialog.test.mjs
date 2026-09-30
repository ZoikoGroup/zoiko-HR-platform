import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../src/modules/super-admin/BillingEvaluationsPage.jsx", import.meta.url),
  "utf8",
);

test("convert failures render inside the dialog, not only the page banner", () => {
  assert.match(src, /setConvertError\(e\.message/);
  assert.match(src, /\{convertError && \(/);
  const handler = src.slice(src.indexOf("const handleConvert"), src.indexOf("const inputClass"));
  assert.doesNotMatch(handler, /setError\(e\.message \|\| "Failed to convert/);
});

test("dialog stays open on failure and closes only on success", () => {
  const handler = src.slice(src.indexOf("const handleConvert"), src.indexOf("const inputClass"));
  const closeAt = handler.indexOf("setConvertModal(null)");
  assert.ok(closeAt > handler.indexOf("await billingService.convertEvaluation"));
  assert.ok(closeAt < handler.indexOf("catch"));
});

test("double submission is guarded and success is announced", () => {
  assert.match(src, /convertInFlight\.current\) return/);
  assert.match(src, /disabled=\{busy === "convert"\}/);
  assert.match(src, /was converted to a commercial account/);
  assert.match(src, /await loadData\(\)/);
});
