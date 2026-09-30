import { api } from "./api";

// Super Admin approvals oversight (ZHR-29). Real leave requests across orgs.
export const approvalsService = {
  list: (params) => api.get("/super-admin/approvals", { params }),
  summary: (params) => api.get("/super-admin/approvals/summary", { params }),
  approveLeave: (id, comment) => api.post(`/super-admin/approvals/leave/${id}/approve`, { comment: comment || null }),
  rejectLeave: (id, comment) => api.post(`/super-admin/approvals/leave/${id}/reject`, { comment }),
};
