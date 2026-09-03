// Section 17: every catalog record with no approved numeric price must render a
// clear "pricing pending" notice — NEVER a raw null/NaN/blank. This pure helper
// centralises that rule so it is unit-testable without a DOM, and is reused by
// every plan/catalog price cell.
export const PRICING_PENDING_TEXT = "Pricing pending — contact sales";

/**
 * Returns true only when `price` is a real, finite number (a published amount).
 * null / undefined / "" / NaN / non-numeric all mean "not yet approved".
 */
export function hasApprovedPrice(price) {
  if (price === null || price === undefined) return false;
  // Reject arrays/objects (Number([]) -> 0 would fake a valid price).
  if (typeof price === "object") return false;
  // Blank / whitespace-only strings are "not yet approved", never price 0.
  if (typeof price === "string" && price.trim() === "") return false;
  const n = Number(price);
  return Number.isFinite(n);
}

/**
 * Formats a catalog price for display. When the price is null/NaN/unapproved,
 * returns the PRICING_PENDING_TEXT sentinel instead of a raw null/NaN value.
 */
export function formatCatalogPrice(price, options = {}) {
  const { suffix = "", currencySymbol = "$", locale = "en-US" } = options;
  if (!hasApprovedPrice(price)) {
    return PRICING_PENDING_TEXT;
  }
  const n = Number(price);
  const formatted = Number.isInteger(n)
    ? n.toLocaleString(locale)
    : n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currencySymbol}${formatted}${suffix}`;
}
