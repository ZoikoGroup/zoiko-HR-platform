import { api } from "./api";

// Billing & Subscription API client — mirrors the backend billing router.
export const billingService = {
  // ── Plans ────────────────────────────────────────────────────────────────
  getPlans: (params) => api.get("/billing/plans", { params }),
  createPlan: (data) => api.post("/billing/plans", data),
  updatePlan: (id, data) => api.put(`/billing/plans/${id}`, data),

  // ── Evaluations ──────────────────────────────────────────────────────────
  getEvaluations: (orgId) => api.get(`/billing/evaluations/${orgId}`),
  startEvaluation: (data) => api.post("/billing/evaluations", data),
  endEvaluation: (id) => api.post(`/billing/evaluations/${id}/end`),

  // ── Conversions ──────────────────────────────────────────────────────────
  convertEvaluation: (id, data) => api.post(`/billing/evaluations/${id}/convert`, data),
  getConversions: (orgId) => api.get(`/billing/evaluations/${orgId}/conversions`),

  // ── Subscriptions ────────────────────────────────────────────────────────
  getSubscription: (orgId) => api.get(`/billing/subscriptions/${orgId}`),
  upgradeSubscription: (orgId, data) => api.post(`/billing/subscriptions/${orgId}/upgrade`, data),
  downgradeDryRun: (orgId, data) => api.post(`/billing/subscriptions/${orgId}/downgrade-dry-run`, data),
  downgradeSubscription: (orgId, data) => api.post(`/billing/subscriptions/${orgId}/downgrade`, data),
  cancelSubscription: (orgId, data) => api.post(`/billing/subscriptions/${orgId}/cancel`, data),

  // ── Discounts ────────────────────────────────────────────────────────────
  getDiscounts: (params) => api.get("/billing/discounts", { params }),
  createDiscount: (data) => api.post("/billing/discounts", data),

  // ── Checkout (Stripe hosted) ─────────────────────────────────────────────
  createCheckoutSession: (data, idempotencyKey) =>
    api.post("/billing/checkout-session", data, {
      headers: { "Idempotency-Key": idempotencyKey },
    }),

  // ── Invoices ─────────────────────────────────────────────────────────────
  getInvoices: (orgId) => api.get(`/billing/invoices/${orgId}`),

  // ── Provider refs (Stripe customer/subscription IDs) ─────────────────────
  getProviderRefs: (orgId) => api.get(`/billing/provider-refs/${orgId}`),

  // ── Plan Changes (Prompt 4) ─────────────────────────────────────────────
  previewPlanChange: (orgId, data) =>
    api.post(`/billing/plan-changes/preview`, data, { params: { org_id: orgId } }),

  schedulePlanChange: (orgId, data) =>
    api.post(`/billing/plan-changes/schedule`, data, { params: { org_id: orgId } }),

  cancelPlanChange: (changeId, data) =>
    api.post(`/billing/plan-changes/${changeId}/cancel`, data),

  listPlanChanges: (orgId) =>
    api.get(`/billing/plan-changes/${orgId}`),

  // ── Refunds (Section 12 I3) ────────────────────────────────────────────
  requestRefund: (orgId, data) =>
    api.post(`/billing/refunds/request`, data, { params: { org_id: orgId } }),

  approveRefund: (requestId, data = {}) =>
    api.post(`/billing/refunds/${requestId}/approve`, data),

  rejectRefund: (requestId, data = {}) =>
    api.post(`/billing/refunds/${requestId}/reject`, data),

  listRefundRequests: (orgId) =>
    api.get(`/billing/refunds/${orgId}`),

  // ── Existing foundation endpoints ────────────────────────────────────────
  getOverview: (orgId) => api.get(`/billing/organizations/${orgId}/overview`),
  getWorkforce: (orgId) => api.get(`/billing/organizations/${orgId}/workforce`),
  recomputeWorkforce: (orgId) => api.post(`/billing/organizations/${orgId}/workforce/recompute`),
  updateClassification: (orgId, data) => api.put(`/billing/organizations/${orgId}/classification`, data),
  getAuditLogs: (orgId, params) => api.get(`/billing/organizations/${orgId}/audit-logs`, { params }),
};
