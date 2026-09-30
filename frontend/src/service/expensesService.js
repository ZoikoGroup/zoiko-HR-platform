import { api } from "./api";

// Super Admin expenses oversight (ZHR-30). Amounts are decimal strings with an
// explicit currency and are never summed across currencies.
export const expensesService = {
  claims: (params) => api.get("/super-admin/expenses/claims", { params }),
  claim: (id) => api.get(`/super-admin/expenses/claims/${id}`),
  summary: (params) => api.get("/super-admin/expenses/summary", { params }),
  categories: () => api.get("/super-admin/expenses/categories"),
  budgets: (params) => api.get("/super-admin/expenses/budgets", { params }),
  createBudget: (data) => api.post("/super-admin/expenses/budgets", data),
  archiveBudget: (id) => api.delete(`/super-admin/expenses/budgets/${id}`),
};

export function formatMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency || ""}`.trim();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
