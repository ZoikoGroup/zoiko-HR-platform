import { api } from "./api";

// Super Admin > Workflows > Activity (ZHR-36): what people did inside every organization.
export const activityService = {
  list: (params) => api.get("/super-admin/activity", { params }),
  filters: () => api.get("/super-admin/activity/filters"),
  get: (id) => api.get(`/super-admin/activity/${id}`),
};
