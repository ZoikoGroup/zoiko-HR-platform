import { api } from "./api";

export const getOrganizationDetails = () => api.get("/hr/organization");
export const updateOrganizationDetails = (data) => api.put("/hr/organization", data);
export const getOrganizationDashboardStats = () => api.get("/hr/organization/dashboard");
export const getOrganizationDetailedMetrics = () => api.get("/hr/organization/metrics");
