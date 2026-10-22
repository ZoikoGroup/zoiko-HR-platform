import { api } from "./api";

// Prompt 2 onboarding endpoints live on their own routers, separate from the
// legacy onboarding CRUD API.
const HR_ONBOARDING = "/hr/onboarding";
const PORTAL = "/public/onboarding";

export const getPortalForms = (token) =>
  api.get(`${PORTAL}/${encodeURIComponent(token)}/forms`, { auth: false });
export const savePortalForm = (token, canonicalId, values) =>
  api.put(`${PORTAL}/${encodeURIComponent(token)}/forms/${encodeURIComponent(canonicalId)}`, { values }, { auth: false });
export const submitPortalForm = (token, canonicalId, values, declarationAccepted) =>
  api.post(`${PORTAL}/${encodeURIComponent(token)}/forms/${encodeURIComponent(canonicalId)}/submit`,
    { values, declaration_accepted: declarationAccepted }, { auth: false });

export const getNewHireForms = (hireId) => api.get(`${HR_ONBOARDING}/new-hires/${hireId}/forms`);
export const verifyOnboardingForm = (submissionId) => api.post(`${HR_ONBOARDING}/forms/${submissionId}/verify`);
export const returnOnboardingForm = (submissionId, reason) =>
  api.post(`${HR_ONBOARDING}/forms/${submissionId}/return`, { reason });
export const revealOnboardingForm = (submissionId) => api.get(`${HR_ONBOARDING}/forms/${submissionId}/reveal`);

export const getPayrollVerifications = () => api.get(`${HR_ONBOARDING}/payroll-verifications`);
export const getFinanceViewers = () => api.get(`${HR_ONBOARDING}/finance-viewers`);
export const setFinanceViewers = (employeeIds) =>
  api.put(`${HR_ONBOARDING}/finance-viewers`, { employee_ids: employeeIds });

export const setChecklistException = (itemId, exception) =>
  api.put(`${HR_ONBOARDING}/checklist-items/${itemId}/exception`, exception);
export const getMyOnboardingTasks = () => api.get(`${HR_ONBOARDING}/my-tasks`);
export const setMyOnboardingTaskCompleted = (itemId, completed) =>
  api.put(`${HR_ONBOARDING}/my-tasks/${itemId}`, { completed });
export const scheduleProbation = (employeeId, schedule) =>
  api.post(`${HR_ONBOARDING}/probation/${employeeId}`, schedule);

export function errorMessage(error, fallback) {
  if (error?.status === 403) {
    return error?.message || "You do not have permission to perform this action.";
  }
  if (error?.status === 401) return "Your session has expired. Please sign in again.";
  return error?.message || fallback;
}
