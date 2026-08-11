// Employee management service (production-ready)
// This module is the single integration layer for employee CRUD operations
// and employee-management endpoints.
//
// Shared HR functions are re-exported from hrService.js to avoid duplication.

import { api, API_BASE_URL } from "./api";

// Re-export shared functions from hrService to eliminate duplication
export {
  getDocuments,
  getDocumentById,
  uploadDocument,
  deleteDocument,
  updateDocumentStatus,
  updateDocument,
  getLeaveRequests,
  getLeaveRequest,
  createLeaveRequest,
  updateLeaveRequest,
  deleteLeaveRequest,
  getLeaveBalances,
  getLeaveTypeConfigs,
  getLeaveDashboard,
  getLeaveCalendar,
  getLeaveStatistics,
  getAttendanceRecords,
  getHolidays,
  getCourses,
  getTrainingPrograms,
  getAssessments,
  getQuizAttempts,
} from "./hrService";

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

export const getEmployeeDashboard = () => api.get("/hr/employee-management/dashboard");

export const getEmployees = (params = {}) => api.get("/hr/employee-management/employees", { params });
export const getEmployeeById = (id) => api.get(`/hr/employee-management/employees/${id}`);

export const createEmployee = (payload) => api.post("/hr/employee-management/employees", payload);
export const updateEmployee = (id, payload) => api.put(`/hr/employee-management/employees/${id}`, payload);
export const deleteEmployee = (id) => api.delete(`/hr/employee-management/employees/${id}`);
export const hardDeleteEmployee = (id) => api.delete(`/hr/employee-management/employees/${id}/hard-delete`);
export const bulkHardDeleteEmployees = (ids) => api.post(`/hr/employee-management/employees/bulk-hard-delete`, { employee_ids: ids });

export const getEmployeeProfile = (employeeId) => api.get(`/hr/employee-management/employees/${employeeId}/profile`);
export const updateEmployeeProfile = (employeeId, payload) => api.put(`/hr/employee-management/employees/${employeeId}/profile`, payload);

// ── Organization Structure ───────────────────────────────────────────────

export const getOrgChart = (organizationId) => api.get(`/hr/employee-management/org-chart?organization_id=${organizationId}`);
export const changeManager = (payload) => api.put("/hr/employee-management/change-manager", payload);

// ── Employee Lifecycle ───────────────────────────────────────────────────

export const getEmployeeLifecycle = (employeeId) => {
  const params = employeeId ? { employee_id: employeeId } : {};
  return api.get("/hr/employee-management/lifecycle", { params });
};

export const confirmProbation = (payload) => api.post("/hr/employee-management/confirm", payload);
export const promoteEmployee = (payload) => api.post("/hr/employee-management/promote", payload);
export const transferEmployee = (payload) => api.post("/hr/employee-management/transfer", payload);
export const resignEmployee = (payload) => api.post("/hr/employee-management/resign", payload);
export const exitEmployee = (payload) => api.post("/hr/employee-management/exit", payload);

// ── Reports ──────────────────────────────────────────────────────────────

export const getEmployeeReports = (filters) => api.get(`/hr/employee-management/reports`, { params: filters });
export const exportEmployeeReports = (payload) => api.post("/hr/employee-management/export", payload);

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE IMPORT
// ════════════════════════════════════════════════════════════════════════════

export async function importEmployees(file) {
  const { getAccessToken, API_BASE_URL } = await import("./api");
  const token = getAccessToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/hr/employee-management/employees/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const err = new Error(detail?.detail || detail?.message || `Import failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function downloadImportTemplate() {
  const { getAccessToken, API_BASE_URL } = await import("./api");
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/hr/employee-management/employees/import/template`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to download template");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "employee-import-template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Supporting Master Data ───────────────────────────────────────────────

export const getDepartments = () => api.get("/hr/departments").then((data) => data);
export const getDesignations = () => api.get("/hr/designations");

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE SELF-SERVICE — TRAVEL
// ════════════════════════════════════════════════════════════════════════════

export const getTravel = (employeeId) => api.get(`/hr/travel${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getTravelById = (id) => api.get(`/hr/travel/${id}`);
export const createTravel = (payload) => api.post("/hr/travel", payload);
export const updateTravel = (id, payload) => api.put(`/hr/travel/${id}`, payload);
export const deleteTravel = (id) => api.delete(`/hr/travel/${id}`);

export const createTravelExpense = (payload) => api.post("/hr/travel/expenses", payload);

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE SELF-SERVICE — ESS (Employee Self Service)
// ════════════════════════════════════════════════════════════════════════════

export const getEss = (employeeId) => api.get(`/hr/ess${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const createEss = (payload) => api.post("/hr/ess", payload);
export const updateEss = (id, payload) => api.put(`/hr/ess/${id}`, payload);
export const deleteEss = (id) => api.delete(`/hr/ess/${id}`);

// ── My Profile ──────────────────────────────────────────────────────────

export const getMyProfile = () => api.get("/hr/employees/me");
export const updateMyProfile = (payload) => api.put("/hr/employees/me", payload);

// ════════════════════════════════════════════════════════════════════════════
// EMPLOYEE SELF-SERVICE — ASSETS
// ════════════════════════════════════════════════════════════════════════════

export const getMyAssets = (employeeId) => api.get(`/hr/assets${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const createAssetRequest = (payload) => api.post("/hr/assets/requests", payload);
export const getAssetRequests = (params = {}) => api.get("/hr/assets/requests", { params });

// ════════════════════════════════════════════════════════════════════════════
// HR EMPLOYEES LIST (for manager/employee lookups)
// ════════════════════════════════════════════════════════════════════════════

export const getHrEmployees = (params = {}) => api.get("/hr/employees", { params });
