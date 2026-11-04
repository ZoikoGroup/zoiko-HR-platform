import { api } from "./api";

const base = "/hr/workforce";

export const getJobDescriptions = (params = {}) => api.get(`${base}/job-descriptions`, { params });
export const getJobDescription = (id) => api.get(`${base}/job-descriptions/${id}`);
export const createJobDescription = (payload) => api.post(`${base}/job-descriptions`, payload);
export const updateJobDescription = (id, payload) => api.put(`${base}/job-descriptions/${id}`, payload);
export const checkJobDescriptionLanguage = (id) => api.post(`${base}/job-descriptions/${id}/language-check`);
export const submitJobDescription = (id) => api.post(`${base}/job-descriptions/${id}/submit`);
export const decideJobDescription = (id, payload) => api.post(`${base}/job-descriptions/${id}/decision`, payload);
export const createJobDescriptionVersion = (id) => api.post(`${base}/job-descriptions/${id}/new-version`);

export const submitHeadcountAuthorization = (id, payload) => api.post(`${base}/headcount/${id}/submit`, payload);
export const decideHeadcountAuthorization = (id, payload) => api.post(`${base}/headcount/${id}/decision`, payload);
export const getHeadcountAuthorization = (id) => api.get(`${base}/headcount/${id}/authorization`);

export const requestPositionApproval = (id, payload) => api.post(`${base}/positions/${id}/request`, payload);
export const decidePositionApproval = (id, payload) => api.post(`${base}/positions/${id}/decision`, payload);
export const getPositionAuthorization = (id) => api.get(`${base}/positions/${id}/authorization`);

export const submitSuccessionAuthorization = (id, payload) => api.post(`${base}/succession/${id}/submit`, payload);
export const decideSuccessionAuthorization = (id, payload) => api.post(`${base}/succession/${id}/decision`, payload);
export const getSuccessionPlanDocument = (id) => api.get(`${base}/succession/${id}/plan-document`);
