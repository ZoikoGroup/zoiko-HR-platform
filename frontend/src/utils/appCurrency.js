/**
 * Unified app-wide currency resolution for both Organization Admins and Employee Admins.
 *
 * Priority:
 *   1. The organization's currency from the API (`user.currency` or `organization.currency`)
 *   2. Derived from the organization's country via `getCurrencyForCountry()`
 *   3. Fallback: "USD"
 *
 * Usage:
 *   import { useAppCurrency, getCurrentAppCurrency, formatCurrencyForUser } from "../utils/appCurrency";
 *
 *   // Inside a React component:
 *   const currency = useAppCurrency();           // e.g. "INR"
 *   const formatted = formatCurrencyForUser(85000); // e.g. "₹85,000"
 *
 *   // Outside React (services, helpers):
 *   const code = getCurrentAppCurrency();
 */

import { useMemo } from "react";
import { getStoredUser } from "../service/api";
import { getCurrencyForCountry } from "./currency";
import { currencyForCountry } from "./employeeCurrency";

const FALLBACK_CURRENCY = "USD";

/**
 * Resolve the ISO 4217 currency code from a user object or a country string.
 * Works with both the full user object from /auth/me and the organization details.
 */
export function resolveCurrencyForCountry(country) {
  if (!country) return null;
  // Try the comprehensive currency.js lookup first (returns object with .code)
  const entry = getCurrencyForCountry(country);
  if (entry?.code) return entry.code;
  // Fall back to the employeeCurrency.js lookup
  const empEntry = currencyForCountry(country);
  if (empEntry?.code) return empEntry.code;
  return null;
}

/**
 * Read the current app currency from localStorage (the cached user).
 * Safe to call outside React.
 */
export function getCurrentAppCurrency() {
  try {
    const user = getStoredUser();
    if (!user) return FALLBACK_CURRENCY;

    // 1. Explicit currency from the API (set by the backend from org.currency)
    const explicit = user.currency || user.organizationCurrency;
    if (explicit) return explicit;

    // 2. Derive from the organization's country
    const orgCountry = user.organizationCountry || user.organization_country || user.country;
    const derived = resolveCurrencyForCountry(orgCountry);
    if (derived) return derived;

    return FALLBACK_CURRENCY;
  } catch {
    return FALLBACK_CURRENCY;
  }
}

/**
 * React hook: returns the current user's app-wide currency code.
 * Re-derives on every render (cheap).
 */
export function useAppCurrency(user) {
  return useMemo(() => {
    if (user) {
      const explicit = user.currency || user.organizationCurrency;
      if (explicit) return explicit;
      const orgCountry = user.organizationCountry || user.organization_country || user.country;
      const derived = resolveCurrencyForCountry(orgCountry);
      if (derived) return derived;
      return FALLBACK_CURRENCY;
    }
    return getCurrentAppCurrency();
  }, [user]);
}

/**
 * Format an amount in the current user's currency (or a given currency).
 * Thin wrapper around Intl.NumberFormat.
 */
export function formatCurrencyForUser(amount, currencyOverride, { compact = false } = {}) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  const code = currencyOverride || getCurrentAppCurrency();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `${code} ${n.toLocaleString()}`.trim();
  }
}

/**
 * Get the currency symbol for the current user's currency.
 */
export function getCurrencySymbol(currencyCode) {
  const code = currencyCode || getCurrentAppCurrency();
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency: code }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency");
    return sym?.value || code;
  } catch {
    return code;
  }
}

