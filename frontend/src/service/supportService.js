import { api } from "./api";

// Super Admin support desk (ZHR-34): cross-organization tickets.
export const supportService = {
  list: (params) => api.get("/super-admin/support/tickets", { params }),
  get: (id) => api.get(`/super-admin/support/tickets/${id}`),
  update: (id, data) => api.patch(`/super-admin/support/tickets/${id}`, data),
  reply: (id, body, resolve = false) => api.post(`/super-admin/support/tickets/${id}/reply`, { body, resolve }),
  assignees: () => api.get("/super-admin/support/assignees"),
};
