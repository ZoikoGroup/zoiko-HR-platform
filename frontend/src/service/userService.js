import { api } from "./api";

const BASE = "/hr/admin/users";

export const getUsers = (params = {}, opts) => api.get(BASE, { params, ...opts });
export const getUser = (id) => api.get(`${BASE}/${id}`);
export const createUser = (payload) => api.post(BASE, payload);
export const updateUser = (id, payload) => api.put(`${BASE}/${id}`, payload);
export const resetPassword = (id, method = "link") => api.post(`${BASE}/${id}/reset-password`, { method });
export const getAssignableRoles = (opts) => api.get("/hr/admin/roles", opts);
export const deactivateUser = (id) => api.delete(`${BASE}/${id}`);
export const hardDeleteUser = (id) => api.delete(`${BASE}/${id}/hard-delete`);
export const activateUser = (id) => api.post(`${BASE}/${id}/activate`);
export const suspendUser = (id) => api.post(`${BASE}/${id}/suspend`);
export const archiveUser = (id) => api.post(`${BASE}/${id}/archive`);
