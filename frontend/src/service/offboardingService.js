/*
 * Offboarding API (backend: app/modules/hr/offboarding/router.py).
 *  - /hr/offboarding/*     the Offboarding module (HR and organisation admins)
 *  - /hr/me/offboarding/*  My Exit (the person's own exit) and Offboarding Tasks (clearance work assigned to them)
 *  - /public/offboarding/* the e-mailed exit-documents link (no sign-in)
 */
import { api, API_BASE_URL, getAccessToken } from "./api";

const HR = "/hr/offboarding";
const ME = "/hr/me/offboarding";
const PUBLIC = "/public/offboarding";

// ── HR: dashboard and lists ──────────────────────────────────────────────────────────────────────────────────────────
export const getOffboardingDashboard = () => api.get(`${HR}/dashboard`);
export const getOffboardingMeta = () => api.get(`${HR}/meta`);
export const getNoticePreview = (employeeId, noticeDate) =>
  api.get(`${HR}/notice-preview`, { params: { employee_id: employeeId, notice_date: noticeDate || undefined } });
export const listExitCases = (params = {}) => api.get(`${HR}/cases`, { params });
export const getResignationsInbox = () => api.get(`${HR}/resignations`);

// ── HR: one case ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const startExit = (body) => api.post(`${HR}/cases`, body);
export const getExitCase = (id) => api.get(`${HR}/cases/${id}`);
export const updateExitCase = (id, body) => api.patch(`${HR}/cases/${id}`, body);
export const approveExit = (id, body = {}) => api.post(`${HR}/cases/${id}/approve`, body);
export const rejectExit = (id, note) => api.post(`${HR}/cases/${id}/reject`, { note });
export const decideWithdrawal = (id, accept, note) => api.post(`${HR}/cases/${id}/withdrawal`, { accept, note });
export const cancelExit = (id, reason) => api.post(`${HR}/cases/${id}/cancel`, { reason });
export const stopExitAccess = (id) => api.post(`${HR}/cases/${id}/stop-access`, {});
export const closeExitCase = (id) => api.post(`${HR}/cases/${id}/close`, {});
export const getExitActivity = (id) => api.get(`${HR}/cases/${id}/activity`);

// ── HR: clearance ────────────────────────────────────────────────────────────────────────────────────────────────────
export const getCaseTasks = (id) => api.get(`${HR}/cases/${id}/tasks`);
export const addCaseTask = (id, body) => api.post(`${HR}/cases/${id}/tasks`, body);
export const getClearanceBoard = (params = {}) => api.get(`${HR}/tasks`, { params });
export const updateClearanceTask = (taskId, body) => api.put(`${HR}/tasks/${taskId}`, body);

// ── HR: assets ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const listAssetReturns = (params = {}) => api.get(`${HR}/assets`, { params });
export const syncCaseAssets = (id) => api.post(`${HR}/cases/${id}/assets/sync`, {});
export const resolveAssetReturn = (returnId, body) => api.put(`${HR}/assets/${returnId}`, body);

// ── HR: settlement ───────────────────────────────────────────────────────────────────────────────────────────────────
export const listSettlements = (params = {}) => api.get(`${HR}/settlements`, { params });
export const getSettlement = (id) => api.get(`${HR}/cases/${id}/settlement`);
export const saveSettlement = (id, body) => api.put(`${HR}/cases/${id}/settlement`, body);
/** status: approved | paid | not_applicable | draft */
export const setSettlementStatus = (id, status, body = {}) => api.post(`${HR}/cases/${id}/settlement/${status}`, body);

// ── HR: exit interview ───────────────────────────────────────────────────────────────────────────────────────────────
export const getInterviewAnalytics = (params = {}) => api.get(`${HR}/interviews`, { params });
export const getCaseInterview = (id) => api.get(`${HR}/cases/${id}/interview`);
export const sendCaseInterview = (id) => api.post(`${HR}/cases/${id}/interview/send`, {});
export const updateCaseInterview = (id, body) => api.put(`${HR}/cases/${id}/interview`, body);

// ── HR: documents ────────────────────────────────────────────────────────────────────────────────────────────────────
export const getCaseDocuments = (id) => api.get(`${HR}/cases/${id}/documents`);
export const issueCaseDocument = (id, kind) => api.post(`${HR}/cases/${id}/documents`, { kind });
export const revokeCaseDocument = (id, docId) => api.delete(`${HR}/cases/${id}/documents/${docId}`);

// ── HR: settings ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const getOffboardingSettings = () => api.get(`${HR}/settings`);
export const saveOffboardingSettings = (body) => api.put(`${HR}/settings`, body);
export const createChecklistTemplate = (body) => api.post(`${HR}/checklists`, body);
export const updateChecklistTemplate = (id, body) => api.put(`${HR}/checklists/${id}`, body);
export const deleteChecklistTemplate = (id) => api.delete(`${HR}/checklists/${id}`);

// ── the signed-in person: My Exit ────────────────────────────────────────────────────────────────────────────────────
export const getMyExit = () => api.get(ME);
export const submitResignation = (body) => api.post(`${ME}/resignation`, body);
export const withdrawResignation = (reason) => api.post(`${ME}/withdraw`, { reason });
export const getMyExitTasks = () => api.get(`${ME}/tasks`);
export const setMyExitTask = (taskId, done, note) => api.put(`${ME}/tasks/${taskId}`, { done, note });
export const getMyExitInterview = () => api.get(`${ME}/interview`);
export const saveMyExitInterview = (answers, submit = false) => api.put(`${ME}/interview`, { answers, submit });
export const getMyExitDocuments = () => api.get(`${ME}/documents`);

// ── the signed-in person: Offboarding Tasks ──────────────────────────────────────────────────────────────────────────
export const getAssignedOffboardingTasks = () => api.get(`${ME}/assigned-tasks`);
export const setAssignedOffboardingTask = (taskId, done, note) => api.put(`${ME}/assigned-tasks/${taskId}`, { done, note });
/** decision: approve | reject */
export const decideTeamResignation = (caseId, decision, note) => api.post(`${ME}/decisions/${caseId}/${decision}`, { note });

// ── public link ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const getPublicExitDocument = (token) => api.get(`${PUBLIC}/documents/${encodeURIComponent(token)}`, { auth: false });
export const publicExitDocumentUrl = (token) => `${API_BASE_URL}${PUBLIC}/documents/${encodeURIComponent(token)}/pdf`;

// ── file downloads (PDF letters, CSV exports) ────────────────────────────────────────────────────────────────────────
async function download(path, filename) {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try { const data = await res.json(); message = data?.message || data?.detail || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const safeName = (s) => String(s || "document").replace(/[^A-Za-z0-9._-]+/g, "_");
export const downloadCaseDocument = (caseId, doc) =>
  download(`${HR}/cases/${caseId}/documents/${doc.id}/pdf`, `${safeName(doc.title)}.pdf`);
export const downloadMyExitDocument = (doc) => download(`${ME}/documents/${doc.id}/pdf`, `${safeName(doc.title)}.pdf`);
export const exportExitCases = (status) =>
  download(`${HR}/cases/export${status ? `?status=${encodeURIComponent(status)}` : ""}`, "exit_cases.csv");
export const exportSettlements = (status) =>
  download(`${HR}/settlements/export${status ? `?status=${encodeURIComponent(status)}` : ""}`, "final_settlements.csv");

/** A readable message from an API error. */
export const errorMessage = (err, fallback = "Something went wrong. Please try again.") =>
  (err && (err.message || err.detail)) || fallback;
