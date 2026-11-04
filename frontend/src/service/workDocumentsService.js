// Prompt 3 document flows: company policies (library, publish wizard, hub, Mira sync), leave records, working-time requests
// and notices, compensation approvals and letters. Every document is rendered and stored by the server; these calls never
// carry document contents.
import { api } from "./api";

// ── policies ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const listPolicies = () => api.get("/hr/policies");
export const getPolicySettings = () => api.get("/hr/policies/settings");
export const updatePolicySettings = (body) => api.put("/hr/policies/settings", body);
export const previewPolicyAudience = (canonicalId, audience) =>
  api.post("/hr/policies/audience-preview", { canonical_id: canonicalId, audience });
export const retryPolicyKnowledgeSync = (distributionId) => api.post(`/hr/policies/distributions/${distributionId}/knowledge-sync`, {});
// creating and publishing a distribution: docTemplatesService.createPolicyDistribution / publishPolicyDistribution
export const listMyPolicies = () => api.get("/hr/me/policies");

// ── leave ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const getLeaveDocuments = (leaveId) => api.get(`/hr/leave-documents/${leaveId}`);
export const confirmFamilyLeave = (leaveId, body) => api.post(`/hr/leave-documents/${leaveId}/confirm-family-leave`, body);
export const revealSensitiveLeaveReason = (leaveId) => api.get(`/hr/leave-documents/${leaveId}/sensitive-reason`);
export const reviewLeave = (leaveId, body) => api.put(`/hr/leaves/${leaveId}/review`, body);
export const getLeaveDocumentSettings = () => api.get("/hr/leave-documents/settings/current");
export const updateLeaveDocumentSettings = (body) => api.put("/hr/leave-documents/settings/current", body);

// ── working time ─────────────────────────────────────────────────────────────────────────────────────────────────────
const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : "";
};
export const listOvertime = (params) => api.get(`/hr/time/overtime${qs(params)}`);
export const requestOvertime = (body) => api.post("/hr/time/overtime", body);
export const decideOvertime = (id, body) => api.post(`/hr/time/overtime/${id}/decision`, body);
export const listCorrections = (params) => api.get(`/hr/time/corrections${qs(params)}`);
export const requestCorrection = (body) => api.post("/hr/time/corrections", body);
export const decideCorrection = (id, body) => api.post(`/hr/time/corrections/${id}/decision`, body);
export const publishRoster = (body) => api.post("/hr/time/rosters/publish", body);
export const changeShifts = (body) => api.post("/hr/time/rosters/change", body);
export const getTimeRecordDocuments = (kind, id) => api.get(`/hr/time/documents/${kind}/${id}`);
export const getTimeSettings = () => api.get("/hr/time/settings");
export const updateTimeSettings = (body) => api.put("/hr/time/settings", body);

// ── compensation ─────────────────────────────────────────────────────────────────────────────────────────────────────
const CMP = "/hr/compensation-documents";
export const listRevisions = (status) => api.get(`${CMP}/revisions${qs({ status })}`);
export const createRevision = (body) => api.post(`${CMP}/revisions`, body);
export const submitRevision = (id) => api.post(`${CMP}/revisions/${id}/submit`, {});
export const decideRevision = (id, body) => api.post(`${CMP}/revisions/${id}/decision`, body);
export const listAllowanceAwards = (status) => api.get(`${CMP}/allowance-awards${qs({ status })}`);
export const requestAllowanceAward = (body) => api.post(`${CMP}/allowance-awards`, body);
export const decideAllowanceAward = (id, body) => api.post(`${CMP}/allowance-awards/${id}/decision`, body);
export const decideExpense = (id, body) => api.post(`${CMP}/expenses/${id}/decision`, body);
export const runStatements = (body) => api.post(`${CMP}/statements/run`, body);
export const getCompensationRecordDocuments = (kind, id) => api.get(`${CMP}/documents/${kind}/${id}`);
export const getCompensationSettings = () => api.get(`${CMP}/settings`);
export const updateCompensationSettings = (body) => api.put(`${CMP}/settings`, body);
export const getMyCompensation = () => api.get("/hr/me/compensation");
export const requestMyStatement = (periodLabel) => api.post("/hr/me/compensation/statement", { period_label: periodLabel || null });

// Plain-language text for the reasons a module refuses a document (the engine's own codes go through reasonText()).
export const MODULE_REASON_TEXT = {
  LEAVE_NOT_DECIDED: "The leave request has not been decided yet.",
  OVERTIME_NOT_DECIDED: "The overtime request has not been decided yet.",
  CORRECTION_NOT_DECIDED: "The correction has not been decided yet.",
  REVISION_NOT_APPROVED: "The salary revision has not been approved yet.",
  REVISION_IS_A_CORRECTION: "Corrections are not announced with a salary increase letter.",
  SALARY_DECREASE_NOT_ALLOWED: "This revision lowers the salary. A salary reduction needs a different, legally reviewed letter.",
  ALLOWANCE_NOT_APPROVED: "The allowance award has not been approved yet.",
  EXPENSE_NOT_DECIDED: "The claim has not been decided yet.",
};
