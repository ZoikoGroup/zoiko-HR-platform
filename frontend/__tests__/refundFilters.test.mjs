import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRefundParams, dollarsToCents, hasActiveRefundFilters, EMPTY_REFUND_FILTERS,
  formatMoney, validateRefundForm,
} from "../src/utils/refundFilters.js";

test("date range is inclusive: from = local midnight first day, before = local midnight AFTER last day", () => {
  const p = buildRefundParams({ ...EMPTY_REFUND_FILTERS, dateFrom: "2026-09-10", dateTo: "2026-09-12" });
  assert.equal(p.created_from, new Date(2026, 8, 10).toISOString());
  assert.equal(p.created_before, new Date(2026, 8, 13).toISOString()); // exclusive bound
});

test("single-day range spans exactly that local day", () => {
  const p = buildRefundParams({ ...EMPTY_REFUND_FILTERS, dateFrom: "2026-01-31", dateTo: "2026-01-31" });
  assert.equal(new Date(p.created_before) - new Date(p.created_from) > 0, true);
  assert.equal(p.created_before, new Date(2026, 1, 1).toISOString()); // rolls over month end
});

test("only set filters are sent, amounts become integer cents", () => {
  const p = buildRefundParams({ ...EMPTY_REFUND_FILTERS, status: "rejected", minAmount: "12.34", maxAmount: "0" },
    { page: 3, pageSize: 50 });
  assert.deepEqual(p, { page: 3, page_size: 50, status: "rejected", min_amount_cents: 1234, max_amount_cents: 0 });
});

test("dollarsToCents avoids float drift and rejects junk", () => {
  assert.equal(dollarsToCents("19.99"), 1999);
  assert.equal(dollarsToCents("1.005") >= 100, true);
  assert.equal(dollarsToCents(""), null);
  assert.equal(dollarsToCents("abc"), null);
  assert.equal(dollarsToCents("-1"), null);
});

test("hasActiveRefundFilters drives the Clear filters affordance", () => {
  assert.equal(hasActiveRefundFilters(EMPTY_REFUND_FILTERS), false);
  assert.equal(hasActiveRefundFilters({ ...EMPTY_REFUND_FILTERS, requestType: "credit" }), true);
});

test("formatMoney handles cents, zero and bad currency codes", () => {
  assert.equal(formatMoney(150000, "USD"), "$1,500.00");
  assert.equal(formatMoney(undefined, "USD"), "$0.00");
  assert.match(formatMoney(100, "???"), /1\.00/);
});

test("dialog validation messages", () => {
  assert.match(validateRefundForm({ amountDollars: "5", reason: "x", orgId: null }), /organization/i);
  assert.match(validateRefundForm({ amountDollars: "0", reason: "x", orgId: 1 }), /greater than zero/);
  assert.match(validateRefundForm({ amountDollars: "5", reason: "  ", orgId: 1 }), /reason/i);
  assert.equal(validateRefundForm({ amountDollars: "5", reason: "ok", orgId: 1 }), null);
});
