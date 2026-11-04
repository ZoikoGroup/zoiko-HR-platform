import { getCurrentAppCurrency } from "./appCurrency";
// Money shown the way its currency is written (₹1,20,000 · €45,000 · $90,000), with what kind of pay it is.

export const REMUNERATION_TYPES = [
  { value: "salary", label: "Salary" },
  { value: "stipend", label: "Stipend" },
  { value: "fee", label: "Fee" },
];

export const PAY_PERIODS = [
  { value: "annual", label: "per year", short: "/yr" },
  { value: "monthly", label: "per month", short: "/mo" },
  { value: "weekly", label: "per week", short: "/wk" },
  { value: "hourly", label: "per hour", short: "/hr" },
  { value: "one_time", label: "one-time", short: "" },
];

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance / consultant" },
];

/** The default pay period for a kind of pay. */
export const DEFAULT_PERIOD = { salary: "annual", stipend: "monthly", fee: "one_time" };

/** An internship is paid a stipend; freelance work a fee; everything else a salary. */
export function remunerationFor(employmentType, current) {
  if (employmentType === "internship") return "stipend";
  if (employmentType === "freelance") return current === "salary" || !current ? "fee" : current;
  return current === "stipend" ? "salary" : current || "salary";
}

export function formatMoney(amount, currency, { compact = false } = {}) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  // Resolve currency: explicit arg > app-wide user currency > "USD"
  let code = currency;
  if (!code) {
    try {
      code = getCurrentAppCurrency();
    } catch {
      code = "USD";
    }
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code || "USD",
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `${code || ""} ${n.toLocaleString()}`.trim();
  }
}

export function currencySymbol(currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find((p) => p.type === "currency")?.value || currency;
  } catch {
    return currency;
  }
}

export function periodSuffix(period) {
  return PAY_PERIODS.find((p) => p.value === period)?.short ?? "";
}

export function remunerationLabel(type) {
  return REMUNERATION_TYPES.find((r) => r.value === type)?.label || "Salary";
}
