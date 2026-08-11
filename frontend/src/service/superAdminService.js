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

  // Status shortcuts — all map to the single status endpoint
  suspendOrganization: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "suspended" }),
  putOnHold: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "on_hold" }),
  activateOrganization: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "active" }),
  approveOrganization: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "approved" }),
  rejectOrganization: (id, data) => api.post(`/super-admin/organizations/${id}/status`, { status: "rejected", reason: data?.reason }),
  reactivateOrganization: (id) => api.post(`/super-admin/organizations/${id}/status`, { status: "active" }),

  // Audit Logs
  getAuditLogs: (params) => api.get("/super-admin/audit-logs", { params }),

  // Login Activity
  getLoginActivity: (params) => api.get("/super-admin/login-activity", { params }),

  // Notifications
  getNotifications: (params) => api.get("/super-admin/notifications", { params }),
  createNotification: (data) => api.post("/super-admin/notifications", data),
  markNotificationRead: (id) => api.put(`/super-admin/notifications/${id}/read`),
  deleteNotification: (id) => api.delete(`/super-admin/notifications/${id}`),

  // Platform Settings
  getSettings: () => api.get("/super-admin/platform-settings"),
  updateSetting: (key, data) => api.put(`/super-admin/platform-settings/${key}`, data),
};
