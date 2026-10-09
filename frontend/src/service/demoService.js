import { api } from "./api";

/** POST /public/demo-requests: no sign-in needed. Resolves { reference, message, confirmation_email_sent }. */
export const requestDemo = (payload) => api.post("/public/demo-requests", payload, { auth: false });

// Super admin follow-up
export const listDemoRequests = (params = {}) => api.get("/super-admin/demo-requests", { params });
export const updateDemoRequest = (id, status) => api.patch(`/super-admin/demo-requests/${id}`, { status });
export const listPricingRequests = (params = {}) => api.get("/super-admin/pricing-requests", { params });
export const updatePricingRequest = (id, status) => api.patch(`/super-admin/pricing-requests/${id}`, { status });
