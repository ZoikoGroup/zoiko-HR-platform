import { api } from "./api";

// Zoiko Connect / Hub / Workflow (ZHR-24/25/26). Super-admin only.
export const integrationsService = {
  // Connect
  getChannels: () => api.get("/super-admin/connect/channels"),
  saveChannel: (channel, data) => api.put(`/super-admin/connect/channels/${channel}`, data),
  removeChannel: (channel) => api.delete(`/super-admin/connect/channels/${channel}`),
  testChannel: (channel, data) => api.post(`/super-admin/connect/channels/${channel}/test`, data || {}),

  // Hub
  getApplications: () => api.get("/super-admin/hub/applications"),
  getEvents: () => api.get("/super-admin/hub/events"),
  getWebhooks: () => api.get("/super-admin/hub/webhooks"),
  createWebhook: (data) => api.post("/super-admin/hub/webhooks", data),
  updateWebhook: (id, data) => api.patch(`/super-admin/hub/webhooks/${id}`, data),
  deleteWebhook: (id) => api.delete(`/super-admin/hub/webhooks/${id}`),
  enableWebhook: (id) => api.post(`/super-admin/hub/webhooks/${id}/enable`),
  disableWebhook: (id) => api.post(`/super-admin/hub/webhooks/${id}/disable`),
  rotateWebhookSecret: (id) => api.post(`/super-admin/hub/webhooks/${id}/rotate-secret`),
  testWebhook: (id) => api.post(`/super-admin/hub/webhooks/${id}/test`),
  getDeliveries: (id, params) => api.get(`/super-admin/hub/webhooks/${id}/deliveries`, { params }),
  retryDelivery: (id) => api.post(`/super-admin/hub/deliveries/${id}/retry`),

  // Workflow
  getWorkflowMeta: () => api.get("/super-admin/workflow/meta"),
  getWorkflowOverview: () => api.get("/super-admin/workflow/overview"),
  getWorkspaces: (params) => api.get("/super-admin/workflow/workspaces", { params }),
  createWorkspace: (data) => api.post("/super-admin/workflow/workspaces", data),
  deleteWorkspace: (id) => api.delete(`/super-admin/workflow/workspaces/${id}`),
  getWorkflows: (params) => api.get("/super-admin/workflow/workflows", { params }),
  createWorkflow: (data) => api.post("/super-admin/workflow/workflows", data),
  updateWorkflow: (id, data) => api.patch(`/super-admin/workflow/workflows/${id}`, data),
  deleteWorkflow: (id) => api.delete(`/super-admin/workflow/workflows/${id}`),
  activateWorkflow: (id) => api.post(`/super-admin/workflow/workflows/${id}/activate`),
  deactivateWorkflow: (id) => api.post(`/super-admin/workflow/workflows/${id}/deactivate`),
  runWorkflow: (id) => api.post(`/super-admin/workflow/workflows/${id}/run`),
  getExecutions: (params) => api.get("/super-admin/workflow/executions", { params }),
  getExecution: (id) => api.get(`/super-admin/workflow/executions/${id}`),
};
