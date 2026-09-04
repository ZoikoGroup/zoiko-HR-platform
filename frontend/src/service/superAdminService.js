import { api } from "./api";

// Slim super-admin API surface — mirrors the standalone HR platform's
// modules/super_admin router. Endpoints that exist only in the monolith
// (products, subscriptions, platform users, system-health, security events,
// support tickets, analytics) are intentionally absent here.
export const superAdminService = {
  // Dashboard
  getDashboardStats: () => api.get("/super-admin/dashboard/stats"),

  // Organizations
  getOrganizations: (params) => api.get("/super-admin/organizations", { params }),
  getOrganization: (id) => api.get(`/super-admin/organizations/${id}`),
  getOrganizationDetail: (id) => api.get(`/super-admin/organizations/${id}`),
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
  deleteOrganization: (id, confirmation) =>
    api.delete(`/super-admin/organizations/${id}`, {
      headers: confirmation
        ? { "X-Confirmation-Id": String(confirmation.id), "X-Confirmation-Token": confirmation.token }
        : undefined,
    }),

  // Organization audit logs (org-scoped)
  getOrganizationAuditLogs: (orgId, params) => api.get(`/super-admin/organizations/${orgId}/audit-logs`, { params }),

  // Audit Logs
  getAuditLogs: (params) => api.get("/super-admin/audit-logs", { params }),

  // Login Activity
  getLoginActivity: (params) => api.get("/super-admin/login-activity", { params }),

  // Notifications
  getNotifications: (params) => api.get("/super-admin/notifications", { params }),
  createNotification: (data) => api.post("/super-admin/notifications", data),
  markNotificationRead: (id) => api.put(`/super-admin/notifications/${id}/read`),
  deleteNotification: (id) => api.delete(`/super-admin/notifications/${id}`),

  // Users
  getUsers: (params) => api.get("/super-admin/users", { params }),

  // Platform Settings
  getSettings: () => api.get("/super-admin/platform-settings"),
  updateSetting: (key, data) => api.put(`/super-admin/platform-settings/${key}`, data),

  // Platform Command Center
  getCommandCenterOverview: (params) => api.get("/super-admin/command-center/overview", { params }),
  getCommandCenterAttention: () => api.get("/super-admin/command-center/attention"),
  getCommandCenterCustomerHealth: () => api.get("/super-admin/command-center/customer-health"),
  getCommandCenterCommercialHealth: (params) => api.get("/super-admin/command-center/commercial-health", { params }),
  getCommandCenterLifecycle: () => api.get("/super-admin/command-center/lifecycle"),
  getCommandCenterPlatformHealth: () => api.get("/super-admin/command-center/platform-health"),
  updateCommandCenterPlatformHealth: (serviceName, data) =>
    api.put(`/super-admin/command-center/platform-health/${serviceName}`, data),
  getCommandCenterSecurity: (params) => api.get("/super-admin/command-center/security", { params }),
  getCommandCenterIncidents: (params) => api.get("/super-admin/command-center/incidents", { params }),
  createCommandCenterIncident: (data) => api.post("/super-admin/command-center/incidents", data),
  resolveCommandCenterIncident: (id) => api.put(`/super-admin/command-center/incidents/${id}/resolve`),
};
