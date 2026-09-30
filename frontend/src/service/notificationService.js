import { api } from "./api";

// Recipient-side notifications (Organization + User portals). The server derives
// the audience from the logged-in user; nothing here sends a user or org id.
export const notificationService = {
  list: (params) => api.get("/notifications", { params }),
  getUnreadCount: () => api.get("/notifications/unread-count"),
  // Opening a notification also marks it read (idempotent) and returns the new count.
  get: (id) => api.get(`/notifications/${id}`),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markUnread: (id) => api.post(`/notifications/${id}/unread`),
  markAllRead: () => api.post("/notifications/read-all"),
};
