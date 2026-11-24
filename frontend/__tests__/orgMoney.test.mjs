/**
 * Organization money (Departments and other organization figures): the organization's currency, written the way that
 * currency is — an India organization sees ₹1,20,000 (not $1,20,000), a US one $120,000 — and compact totals like
 * "₹1.2L" / "$1.2M" instead of a hard-coded "$0.1M".
 */
import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatOrgMoney, orgCurrency } from "../src/utils/money.js";

test("amounts are written the way their currency is", () => {
  assert.equal(formatOrgMoney(120000, { currency: "INR" }), "₹1,20,000");
  assert.equal(formatOrgMoney(120000, { currency: "USD" }), "$120,000");
  assert.equal(formatOrgMoney(120000, { currency: "GBP" }), "£120,000");
  assert.equal(formatOrgMoney(12500.5, { currency: "INR" }), "₹12,500.50");
  assert.equal(formatOrgMoney(null), "—");
});

test("compact totals use the currency's own scale", () => {
  assert.equal(formatOrgMoney(132000, { currency: "INR", compact: true }), "₹1.3L");
  assert.equal(formatOrgMoney(1200000, { currency: "USD", compact: true }), "$1.2M");
});

test("the organization's currency comes from the signed-in user (set from the registered country)", async () => {
  const { setSession } = await import("../src/service/api.js");
  setSession({ accessToken: "t", refreshToken: "r", user: { id: 1, currency: "INR", organizationCountry: "India" } });
  assert.equal(orgCurrency(), "INR");
  assert.equal(formatOrgMoney(120000), "₹1,20,000");
  setSession({ accessToken: "t", refreshToken: "r", user: { id: 1, organizationCountry: "United Kingdom" } });
  assert.equal(orgCurrency(), "GBP");                                              // derived from the country
});
