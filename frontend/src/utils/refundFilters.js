/**
 * utils/refundFilters.js
 * ----------------------
 * Pure helpers for the Refunds & Credit Management filters, kept out of the
 * page so the date/amount conversion is unit-testable.
 */

export const REFUND_STATUSES = [
  { value: "pending_approval", label: "Pending approval" },
  { value: "approved_and_processed", label: "Approved & processed" },
  { value: "rejected", label: "Rejected" },
];

export const REFUND_TYPES = [
  { value: "refund", label: "Refund" },
  { value: "credit", label: "Credit" },
];

export const EMPTY_REFUND_FILTERS = {
  organizationId: "",
  status: "",
  requestType: "",
  dateFrom: "", // yyyy-mm-dd, viewer's local calendar day
  dateTo: "", // yyyy-mm-dd, inclusive
  minAmount: "", // dollars, as typed
  maxAmount: "",
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local midnight of a yyyy-mm-dd day, or null when the string isn't one. */
function localMidnight(ymd, addDays = 0) {
  const m = DATE_RE.exec(ymd || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays, 0, 0, 0, 0);
}

/** Dollars typed by the user -> integer cents (no float drift), or null. */
export function dollarsToCents(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Filters -> API query params. The date range is inclusive of both days in the
 * viewer's timezone: from = local midnight of the first day, before = local
 * midnight of the day AFTER the last day (the backend bound is exclusive), both
 * sent as UTC instants.
 */
export function buildRefundParams(filters, { page = 1, pageSize = 20 } = {}) {
  const params = { page, page_size: pageSize };
  if (filters.organizationId) params.organization_id = filters.organizationId;
  if (filters.status) params.status = filters.status;
  if (filters.requestType) params.request_type = filters.requestType;
  const from = localMidnight(filters.dateFrom);
  if (from) params.created_from = from.toISOString();
  const before = localMidnight(filters.dateTo, 1);
  if (before) params.created_before = before.toISOString();
  const min = dollarsToCents(filters.minAmount);
  if (min !== null) params.min_amount_cents = min;
  const max = dollarsToCents(filters.maxAmount);
  if (max !== null) params.max_amount_cents = max;
  return params;
}

export function hasActiveRefundFilters(filters) {
  return Object.keys(EMPTY_REFUND_FILTERS).some((k) => filters[k] !== EMPTY_REFUND_FILTERS[k]);
}

/** Integer cents + ISO currency -> display string. */
export function formatMoney(cents, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);
  } catch {
    return `${currency} ${((cents || 0) / 100).toFixed(2)}`;
  }
}

/** Validates the New Refund dialog input; returns an error string or null. */
export function validateRefundForm({ amountDollars, reason, orgId }) {
  if (!orgId) return "Select an organization.";
  const cents = dollarsToCents(amountDollars);
  if (cents === null || cents <= 0) return "Enter an amount greater than zero.";
  if (!String(reason || "").trim()) return "Provide a reason for the audit trail.";
  return null;
}
