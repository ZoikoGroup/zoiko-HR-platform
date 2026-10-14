import { api } from "./api";

// Just-in-time support access (ZHR-PRIV-001 Prompt 2). Mirrors the backend support_access router.
// Platform namespace: /super-admin/support-access/* ; tenant namespace: /hr/support-access/*.
// Every mutating call needs a fresh-MFA token; the API layer attaches the bearer.
export const supportAccessService = {
  // ── platform: requests and approvals ───────────────────────────────────
  // what may be asked for (purpose categories, actions, requestable fields and their classification)
  catalog: (opts) => api.get("/super-admin/support-access/catalog", opts),
  createRequest: (data) => api.post("/super-admin/support-access/requests", data),
  myRequests: (opts) => api.get("/super-admin/support-access/requests", opts),
  // high-risk requests from OTHER platform people that need a Security / Privacy co-approval
  awaitingIndependent: (opts) => api.get("/super-admin/support-access/requests/awaiting-independent", opts),
  cancelRequest: (id) => api.post(`/super-admin/support-access/requests/${id}/cancel`),
  independentApprove: (id, data) =>
    api.post(`/super-admin/support-access/requests/${id}/independent-approve`, data),
  // the capability comes back as an httpOnly cookie scoped to /support, so the browser must accept (and later send) it
  activate: (id) => api.post(`/super-admin/support-access/requests/${id}/activate`, undefined, { credentials: "include" }),

  // ── platform: grants and revocations ───────────────────────────────────
  grants: (opts) => api.get("/super-admin/support-access/grants", opts),
  revokeGrant: (grantId, reason) =>
    api.post(`/super-admin/support-access/grants/${grantId}/revoke`, null, { params: { reason } }),
  killSwitch: (data) => api.post("/super-admin/support-access/kill-switch", data),
  revocations: (opts) => api.get("/super-admin/support-access/revocations", opts),

  // ── platform: break-glass ──────────────────────────────────────────────
  startBreakGlass: (data) => api.post("/super-admin/support-access/breakglass", data),
  activeBreakGlass: (opts) => api.get("/super-admin/support-access/breakglass", opts),
  confirmBreakGlass: (id) => api.post(`/super-admin/support-access/breakglass/${id}/confirm`, undefined, { credentials: "include" }),
  endBreakGlass: (id) => api.post(`/super-admin/support-access/breakglass/${id}/end`),

  // ── platform: assurance ────────────────────────────────────────────────
  detections: (opts) => api.get("/super-admin/support-access/detections", opts),
  reconciliation: (opts) => api.get("/super-admin/support-access/reconciliation", opts),
  recertification: (opts) => api.get("/super-admin/support-access/recertification", opts),
  verifyAudit: (opts) => api.get("/super-admin/support-access/audit/verify", opts),

  // ── platform: the enforced data path (only fields the live grant allows; the grant cookie is required) ──
  supportEmployees: (tenantId, opts) =>
    api.get(`/support/tenants/${tenantId}/employees`, { ...opts, credentials: "include" }),

  // ── tenant ─────────────────────────────────────────────────────────────
  tenantRequests: (opts) => api.get("/hr/support-access/requests", opts),
  tenantApprove: (id, data) => api.post(`/hr/support-access/requests/${id}/approve`, data),
  tenantReject: (id, data) => api.post(`/hr/support-access/requests/${id}/reject`, data),
  tenantGrants: (opts) => api.get("/hr/support-access/grants", opts),
  tenantRevoke: (grantId, reason) =>
    api.post(`/hr/support-access/grants/${grantId}/revoke`, null, { params: { reason } }),
  tenantBreakGlass: (opts) => api.get("/hr/support-access/breakglass", opts),
  tenantRevocations: (opts) => api.get("/hr/support-access/revocations", opts),
  tenantActivity: (opts) => api.get("/hr/support-access/activity", opts),
};
