import { api, getAccessToken } from "./api";

// Just-in-time support access through temporary read-only sign-ins.
// Operator (super admin): /support-access/* ; organization admin: /org/me/support-access/* ; the session itself: /auth/support-session.
export const supportLoginService = {
  // operator
  createRequest: (data) => api.post("/support-access/requests", data),
  listRequests: (opts) => api.get("/support-access/requests", opts),
  cancelRequest: (id) => api.post(`/support-access/requests/${id}/cancel`),
  issueCredentials: (id) => api.post(`/support-access/requests/${id}/credentials`),
  endSession: (id) => api.post(`/support-access/requests/${id}/end`),

  // organization admin
  orgRequests: (opts) => api.get("/org/me/support-access/requests", opts),
  approve: (id, note) => api.post(`/org/me/support-access/requests/${id}/approve`, { note: note || null }),
  reject: (id, note) => api.post(`/org/me/support-access/requests/${id}/reject`, { note }),
  revoke: (id) => api.post(`/org/me/support-access/requests/${id}/revoke`),
  activity: (id) => api.get(`/org/me/support-access/requests/${id}/activity`),

  // the support session itself
  currentSession: () => api.get("/auth/support-session"),
};

/** The claims of the stored access token when it belongs to a temporary support session, else null. */
export function supportSessionClaims() {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return json && json.sls && json.ro ? json : null;
  } catch {
    return null;
  }
}
