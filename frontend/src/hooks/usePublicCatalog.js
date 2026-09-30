import { useEffect, useState } from "react";
import { catalogService } from "../service/catalogService";

/**
 * Published plan rates for pre-auth pages (registration, public pricing).
 *
 * Rates come from the customer's published catalog version, so a Super Admin
 * re-price shows up here without a redeploy. Two deliberate behaviours:
 *
 *  - On failure, `catalog` stays null. Callers must then render NO price
 *    rather than a blank or "$0.00" — a wrong number is worse than none.
 *  - Only `is_contract_priced` plans hide their figure; a self-serve plan with
 *    no published price is a data problem and is reported via `error`.
 */
export function usePublicCatalog() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    catalogService
      .getPublicCatalog()
      .then((data) => {
        setCatalog(data);
        setError(null);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Index by plan code for O(1) lookup while rendering.
  const byCode = {};
  for (const p of catalog?.list || []) {
    byCode[String(p.code).toLowerCase()] = p;
  }

  return { catalog, byCode, loading, error, reload: load };
}

/** Format a plan's rate for display, or null when it must not show a number. */
export function formatRate(plan, cycle = "monthly") {
  if (!plan) return null;
  if (plan.is_contract_priced) return null;
  const raw = cycle === "annual" ? plan.annual_price : plan.monthly_price;
  if (raw === null || raw === undefined) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
