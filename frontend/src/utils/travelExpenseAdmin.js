// Admin Travel Expenses page: money is shown in each claim's own currency (claims from the employee portal are in rupees),
// and totals are never added across currencies.

export function formatMoney(amount, currency = "INR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "-";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** The group a claim's status belongs to on the page: pending, approved, rejected or reimbursed. */
export function claimState(status) {
  const v = String(status || "").toLowerCase();
  if (v === "completed" || v.includes("reimburs") || v === "paid") return "reimbursed";
  if (v === "approved") return "approved";
  if (v === "rejected") return "rejected";
  if (v === "cancelled") return "cancelled";
  return "pending";
}

/** [{ currency, amount }] for the claims in the given states, one line per currency (largest first). */
export function totalsByCurrency(claims, states) {
  const sums = new Map();
  for (const c of claims || []) {
    if (states && !states.includes(claimState(c.status))) continue;
    const n = parseFloat(c.amount);
    if (!Number.isFinite(n)) continue;
    const cur = c.currency || "INR";
    sums.set(cur, (sums.get(cur) || 0) + n);
  }
  return [...sums.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}

/** Total per category, in the claims' common currency when there is only one, otherwise grouped by "category (CUR)". */
export function categoryTotals(claims) {
  const sums = new Map();
  const currencies = new Set((claims || []).map((c) => c.currency || "INR"));
  const mixed = currencies.size > 1;
  for (const c of claims || []) {
    const n = parseFloat(c.amount);
    if (!Number.isFinite(n)) continue;
    const label = c.expense_type || c.category || "General";
    const cur = c.currency || "INR";
    const key = mixed ? `${label} (${cur})` : label;
    const prev = sums.get(key) || { label: key, currency: cur, amount: 0 };
    prev.amount += n;
    sums.set(key, prev);
  }
  return [...sums.values()].sort((a, b) => b.amount - a.amount);
}
