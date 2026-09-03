/**
 * Tests for src/utils/catalogPriceUtil.js
 *
 * Section 17: a catalog record with no approved numeric price must NEVER render
 * a raw null/NaN/blank value. This proves the formatter — the single source of
 * truth used by every plan/catalog price cell — always emits the "pricing
 * pending" sentinel for any null/NaN/empty input.
 *
 * Run with: node --test frontend/__tests__/catalogPriceUtil.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRICING_PENDING_TEXT,
  hasApprovedPrice,
  formatCatalogPrice,
} from "../src/utils/catalogPriceUtil.js";

const NULLISH_INPUTS = [null, undefined, "", " ", NaN, Number.NaN, "abc", [], {}];

test("null-price states never render raw null/NaN/blank", () => {
  for (const input of NULLISH_INPUTS) {
    const out = formatCatalogPrice(input);
    assert.equal(
      out,
      PRICING_PENDING_TEXT,
      `formatCatalogPrice(${String(input)}) returned raw value '${out}' instead of pending sentinel`
    );
    assert.notEqual(out, "null");
    assert.notEqual(out, "NaN");
    assert.notEqual(out, "undefined");
    assert.ok(out.trim().length > 0, "must never be blank");
    assert.ok(out.includes("Pricing pending"), "must be a human notice, not a raw value");
  }
});

test("hasApprovedPrice recognizes only real finite numbers", () => {
  assert.equal(hasApprovedPrice(10), true);
  assert.equal(hasApprovedPrice(10.5), true);
  assert.equal(hasApprovedPrice("42"), true);
  assert.equal(hasApprovedPrice(0), true);
  assert.equal(hasApprovedPrice(null), false);
  assert.equal(hasApprovedPrice(undefined), false);
  assert.equal(hasApprovedPrice(NaN), false);
  assert.equal(hasApprovedPrice(""), false);
  assert.equal(hasApprovedPrice(Infinity), false);
  assert.equal(hasApprovedPrice(-Infinity), false);
});

test("real prices format as a human currency string", () => {
  const out = formatCatalogPrice(1000, { suffix: "/mo" });
  assert.equal(out, "$1,000/mo");
  assert.notEqual(out, PRICING_PENDING_TEXT);
});

test("the pending sentinel is a stable, brand-consistent phrase", () => {
  // Backend + frontend contract: frontend and any public catalog render the
  // same human notice, never a null/NaN/blank cell.
  assert.equal(PRICING_PENDING_TEXT, "Pricing pending — contact sales");
});
