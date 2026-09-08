import { api } from "./api";

// Billing & Subscription API client — mirrors the backend billing router.
export const billingService = {
  // ── Plans ────────────────────────────────────────────────────────────────
  getPlans: (params) => api.get("/billing/plans", { params }),
  createPlan: (data) => api.post("/billing/plans", data),
  updatePlan: (id, data) => api.put(`/billing/plans/${id}`, data),

  // ── Evaluations ──────────────────────────────────────────────────────────
  getPlatformEvaluations: (params) => api.get("/billing/evaluations", { params }),
  getEvaluations: (orgId) => api.get(`/billing/evaluations/${orgId}`),
  startEvaluation: (data) => api.post("/billing/evaluations", data),
  endEvaluation: (id, data) => api.post(`/billing/evaluations/${id}/end`, data),

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
  createCheckoutSession: (data, idempotencyKey) => {
    const key = idempotencyKey || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ik-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    return api.post("/billing/checkout-session", data, {
      headers: { "Idempotency-Key": key },
    });
  },

  // ── Invoices ─────────────────────────────────────────────────────────────
  getInvoices: (orgId) => api.get(`/billing/invoices/${orgId}`),
  getPlatformInvoices: (params) => api.get("/billing/invoices", { params }),

  // ── Provider refs (Stripe customer/subscription IDs) ─────────────────────
  getProviderRefs: (orgId) => api.get(`/billing/provider-refs/${orgId}`),

  // ── Delinquency & Support Access (Prompt 5, Section 10 G1-G5 / O3) ───────
  getDelinquency: (orgId) =>
    api.get(`/billing/organizations/${orgId}/delinquency`),

  getDelinquencyStatus: (orgId) =>
    api.get(`/billing/organizations/${orgId}/delinquency`),

  getPlatformDelinquency: () =>
    api.get("/billing/delinquency"),


  createSupportAccess: (data) =>
    api.post("/billing/support-access", data),

  // orgId is optional — omit it to list grants across every organization
  // (genuinely platform-wide, unlike evaluations/invoices/delinquency).
  listSupportAccess: (orgId) =>
    api.get("/billing/support-access", { params: orgId ? { organization_id: orgId } : {} }),

  revokeSupportAccess: (grantId) =>
    api.post(`/billing/support-access/${grantId}/revoke`),

  // ── Webhook Events — platform-wide list & manual replay ─────────────────
  listWebhookEvents: (limit = 50) =>
    api.get("/billing/webhook-events", { params: { limit } }),

  replayWebhookEvent: (eventId) =>
    api.post(`/billing/webhook-events/${eventId}/replay`),

  // ── Provider Reconciliation — action & case management ──────────────────
  reconcileSubscription: (organizationId) =>
    api.post("/billing/internal/reconcile", { organization_id: organizationId }),

  listReconciliationCases: (params = {}) =>
    api.get("/billing/reconciliation/cases", { params }),

  resolveReconciliationCase: (caseId, data = {}) =>
    api.post(`/billing/reconciliation/cases/${caseId}/resolve`, data),

  // ── Plan Changes (Prompt 4) ─────────────────────────────────────────────
  previewPlanChange: (orgId, data) =>
    api.post(`/billing/plan-changes/preview`, data, { params: { org_id: orgId } }),

  schedulePlanChange: (orgId, data) =>
    api.post(`/billing/plan-changes/schedule`, data, { params: { org_id: orgId } }),

  cancelPlanChange: (changeId, data) =>
    api.post(`/billing/plan-changes/${changeId}/cancel`, data),

  listPlanChanges: (orgId) =>
    api.get(orgId ? `/billing/plan-changes/${orgId}` : "/billing/plan-changes"),

  // ── Refunds (Section 12 I3) ────────────────────────────────────────────
  requestRefund: (orgId, data) =>
    api.post(`/billing/refunds/request`, data, { params: { org_id: orgId } }),

  approveRefund: (requestId, data = {}) =>
    api.post(`/billing/refunds/${requestId}/approve`, data),

  rejectRefund: (requestId, data = {}) =>
    api.post(`/billing/refunds/${requestId}/reject`, data),

  listRefundRequests: (orgId, params) =>
    api.get(orgId ? `/billing/refunds/${orgId}` : "/billing/refunds", { params }),

  // ── Customer Self-Serve Billing (/billing/me/* — Prompt 6) ───────────────
  // Scoped to the caller's own organization via their JWT; owner sees full
  // financial detail, admin/hr_admin see a trimmed (plan + usage) view.
  getMySubscription: () => api.get("/billing/me/subscription"),
  getQuotationInvoice: (invoiceNumber) => api.get(`/billing/me/quotation-invoice/${invoiceNumber}`),
  getMyEntitlements: () => api.get("/billing/me/entitlements"),
  cancelMySubscription: (data) => api.post("/billing/me/cancel", data),
  reactivateMySubscription: (data) => api.post("/billing/me/reactivate", data),
  myDowngradeImpact: (data) => api.post("/billing/me/downgrade-impact", data),

  // ── Existing foundation endpoints ────────────────────────────────────────
  getOverview: (orgId) => api.get(`/billing/organizations/${orgId}/overview`),
  getWorkforce: (orgId) => api.get(`/billing/organizations/${orgId}/workforce`),
  recomputeWorkforce: (orgId) => api.post(`/billing/organizations/${orgId}/workforce/recompute`),
  updateClassification: (orgId, data) => api.put(`/billing/organizations/${orgId}/classification`, data),
  getAuditLogs: (orgId, params) => api.get(`/billing/organizations/${orgId}/audit-logs`, { params }),
};
