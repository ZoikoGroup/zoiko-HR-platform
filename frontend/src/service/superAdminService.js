import { api } from "./api";

// Slim super-admin API surface — mirrors the standalone HR platform's
// modules/super_admin router. Endpoints that exist only in the monolith
// (products, subscriptions, platform users, system-health, security events,
// support tickets, analytics) are intentionally absent here.
export const superAdminService = {
  // Dashboard
  getDashboardStats: () => api.get("/super-admin/dashboard/stats"),

  // Organizations
  getOrganizations: (params, opts) => api.get("/super-admin/organizations", { params, ...opts }),
  createOrganization: (data) => api.post("/super-admin/organizations", data),
  getOrganization: (id, opts) => api.get(`/super-admin/organizations/${id}`, opts),
  getOrganizationDetail: (id, opts) => api.get(`/super-admin/organizations/${id}`, opts),
  updateOrganizationStatus: (id, data) => api.post(`/super-admin/organizations/${id}/status`, data),

  // Two-step destructive action confirmation (Prompt 5): mint a one-time,
  // actor-bound token, then pass confirmation_id + confirmation_token back on
  // the status update, or X-Confirmation-Id/X-Confirmation-Token headers on delete.
  mintConfirmationToken: (id, purpose) =>
    api.post(`/super-admin/organizations/${id}/confirmation-tokens?purpose=${encodeURIComponent(purpose)}`),

  // Status shortcuts — all map to the single status endpoint
  suspendOrganization: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "suspended" }),
  putOnHold: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "on_hold" }),
  activateOrganization: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "active" }),
  approveOrganization: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "approved" }),
  rejectOrganization: (id, data) => api.post(`/super-admin/organizations/${id}/status`, { status: "rejected", reason: data?.reason }),
  reactivateOrganization: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "active" }),
  // Organization deletion is a soft delete with ONE endpoint (ZHR-35): the caller
  // must send the organization's exact name; the server verifies it.
  getOrganizationDeletionImpact: (id) => api.get(`/super-admin/organizations/${id}/deletion-impact`),
  deleteOrganization: (id, { confirm_name, reason } = {}) =>
    api.delete(`/super-admin/organizations/${id}`, { body: { confirm_name, reason: reason || null } }),
  restoreOrganization: (id) => api.post(`/super-admin/organizations/${id}/restore`),

  // Organization audit logs (org-scoped)
  getOrganizationAuditLogs: (orgId, params, opts) => api.get(`/super-admin/organizations/${orgId}/audit-logs`, { params, ...opts }),

  // Audit Logs
  getAuditLogs: (params, opts) => api.get("/super-admin/audit-logs", { params, ...opts }),
  getAuditLogFilters: (opts) => api.get("/super-admin/audit-logs/filters", opts),

  // Login Activity
  getLoginActivity: (params) => api.get("/super-admin/login-activity", { params }),

  // Notifications
  getNotifications: (params, opts) => api.get("/super-admin/notifications", { params, ...opts }),
  getNotification: (id) => api.get(`/super-admin/notifications/${id}`),
  createNotification: (data) => api.post("/super-admin/notifications", data),
  markNotificationRead: (id) => api.put(`/super-admin/notifications/${id}/read`),
  deleteNotification: (id) => api.delete(`/super-admin/notifications/${id}`),

  // Users
  getUsers: (params) => api.get("/super-admin/users", { params }),


  // Platform Command Center
  getCommandCenterOverview: (params, opts) => api.get("/super-admin/command-center/overview", { params, ...opts }),
  getCommandCenterAttention: (opts) => api.get("/super-admin/command-center/attention", opts),
  getCommandCenterCustomerHealth: (opts) => api.get("/super-admin/command-center/customer-health", opts),
  getCommandCenterCommercialHealth: (params, opts) => api.get("/super-admin/command-center/commercial-health", { params, ...opts }),
  getCommandCenterLifecycle: (opts) => api.get("/super-admin/command-center/lifecycle", opts),
  getCommandCenterPlatformHealth: (opts) => api.get("/super-admin/command-center/platform-health", opts),
  updateCommandCenterPlatformHealth: (serviceName, data) =>
    api.put(`/super-admin/command-center/platform-health/${serviceName}`, data),
  getCommandCenterSecurity: (params, opts) => api.get("/super-admin/command-center/security", { params, ...opts }),
  getCommandCenterIncidents: (params) => api.get("/super-admin/command-center/incidents", { params }),
  createCommandCenterIncident: (data) => api.post("/super-admin/command-center/incidents", data),
  resolveCommandCenterIncident: (id) => api.put(`/super-admin/command-center/incidents/${id}/resolve`),
};
