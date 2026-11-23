/**
 * Documents module API (docs/new_docs/ZHR-DOCS-ARCH-001 §7). Thin wrappers over service/api.js; errors carry
 * `.status`, `.code` (e.g. DOC_SELF_APPROVAL) and, where relevant, `.checks` / `.locked_by_name`.
 */
import { api, apiRequest } from "./api";

// ── me ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const getMyDocumentCounts = () => api.get("/hr/me/documents/counts");
export const getMyDocumentCategories = () => api.get("/hr/me/documents/categories");
export const getMyDocuments = (categoryId) => api.get("/hr/me/documents", categoryId ? { params: { category_id: categoryId } } : undefined);

/** @param {{ categoryId:number, file:File, title?:string, expiryDate?:string, replacesDocumentId?:number }} input */
export function uploadMyDocument({ categoryId, file, title, expiryDate, replacesDocumentId, idNumber }) {
  const form = new FormData();
  form.append("category_id", String(categoryId));
  form.append("file", file);
  if (title) form.append("title", title);
  if (expiryDate) form.append("expiry_date", expiryDate);
  if (replacesDocumentId) form.append("replaces_document_id", String(replacesDocumentId));
  if (idNumber) form.append("id_number", idNumber);
  // uploads may take longer than ordinary requests on slow connections
  return apiRequest("/hr/me/documents", { method: "POST", body: form, timeoutMs: 120000 });
}

export const withdrawMyDocument = (documentId) => api.delete(`/hr/me/documents/${documentId}`);

// ── approvals ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const approveDocumentVersion = ({ documentId, versionId, remark }) =>
  api.post(`/hr/documents/${documentId}/decision/approve`, { version_id: versionId ?? null, remark: remark || null });
export const rejectDocumentVersion = ({ documentId, versionId, reasonCode, note }) =>
  api.post(`/hr/documents/${documentId}/decision/reject`, { version_id: versionId ?? null, reason_code: reasonCode, note });
export const requestDocumentReupload = ({ documentId, versionId, reasonCode, note }) =>
  api.post(`/hr/documents/${documentId}/request-reupload`, { version_id: versionId ?? null, reason_code: reasonCode, note });
export const bulkApproveDocuments = (items, remark) =>
  api.post("/hr/documents/approvals/bulk-approve", { items: items.map(({ documentId, versionId }) => ({ document_id: documentId, version_id: versionId ?? null })), remark: remark || null });
export const acquireReviewLock = (documentId) => api.post(`/hr/documents/${documentId}/review-lock`);
export const releaseReviewLock = (documentId) => api.delete(`/hr/documents/${documentId}/review-lock`);

// ── queue, summary, audit ───────────────────────────────────────────────────────────────────────────────────────────
const clean = (p = {}) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));
export const getApprovalSummary = () => api.get("/hr/documents/approvals/summary");
export const listApprovals = (params, opts = {}) => api.get("/hr/documents/approvals", { params: clean(params), ...opts });

function auditQuery(params = {}) {
  const parts = [];
  for (const [k, v] of Object.entries(clean(params))) {
    if (Array.isArray(v)) v.forEach((x) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(x)}`));
    else parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}
export const listDocumentAudit = (params) => api.get(`/hr/documents/audit${auditQuery(params)}`);
/** The audit trail as CSV text (the server streams it; filters as listDocumentAudit). */
export const exportDocumentAuditCsv = (params) => apiRequest(`/hr/documents/audit.csv${auditQuery(params)}`, { timeoutMs: 120000 });

// ── admin: employee documents ───────────────────────────────────────────────────────────────────────────────────────
export const listDocumentEmployees = (params, opts = {}) => api.get("/hr/documents/employees", { params: clean(params), ...opts });
export const getDocumentEmployeesSummary = () => api.get("/hr/documents/employees/summary");
export const getDocumentEmployee = (employeeId) => api.get(`/hr/documents/employees/${employeeId}`);
export const getEmployeeCategoryFiles = (employeeId, categoryId) =>
  api.get(`/hr/documents/employees/${employeeId}/categories/${categoryId}/files`);
export const sendEmployeeReminder = ({ employeeId, categoryIds, message, channel }) =>
  api.post(`/hr/documents/employees/${employeeId}/reminders`, { category_ids: categoryIds || null, message: message || null, channel: channel || "both" });
export const sendBulkReminders = ({ employeeIds, message }) =>
  api.post("/hr/documents/reminders/bulk", { employee_ids: employeeIds, message: message || null });
export async function downloadEmployeeZip(employeeId, approvedOnly = true) {
  const { fetchAuthenticatedFile } = await import("./hrService");
  return fetchAuthenticatedFile(`/hr/documents/employees/${employeeId}/export.zip?approved_only=${approvedOnly}`, `employee-${employeeId}-documents.zip`);
}
export const listEmployeeCategories = () => api.get("/hr/documents/employee-categories");
export const createEmployeeCategory = (data) => api.post("/hr/documents/employee-categories", data);
export const updateEmployeeCategory = (id, data) => api.patch(`/hr/documents/employee-categories/${id}`, data);
export const deleteEmployeeCategory = (id) => api.delete(`/hr/documents/employee-categories/${id}`);

// ── admin: company documents ────────────────────────────────────────────────────────────────────────────────────────
export const listCompanyCategories = (params) => api.get("/hr/documents/company-categories", { params: clean(params) });
export const createCompanyCategory = (data) => api.post("/hr/documents/company-categories", data);
export const updateCompanyCategory = (id, data) => api.patch(`/hr/documents/company-categories/${id}`, data);
export const deleteCompanyCategory = (id) => api.delete(`/hr/documents/company-categories/${id}`);
export const listCompanyItems = (categoryId, params) => api.get(`/hr/documents/company-categories/${categoryId}/items`, { params: clean(params) });
export const listCompanyFiles = (params) => api.get("/hr/documents/company/files", { params: clean(params) });
export function uploadCompanyDocument({ categoryId, file, title, description, folderId, expiryDate, requireAck, publishAt, notify }) {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  if (description) form.append("description", description);
  if (folderId) form.append("folder_id", String(folderId));
  if (expiryDate) form.append("expiry_date", expiryDate);
  if (requireAck !== undefined) form.append("require_ack", String(Boolean(requireAck)));
  if (publishAt) form.append("publish_at", publishAt);
  if (notify !== undefined) form.append("notify", String(Boolean(notify)));
  return apiRequest(`/hr/documents/company-categories/${categoryId}/files`, { method: "POST", body: form, timeoutMs: 120000 });
}
export function uploadCompanyVersion({ documentId, file, changeNotes, expiryDate, materialChange }) {
  const form = new FormData();
  form.append("file", file);
  if (changeNotes) form.append("change_notes", changeNotes);
  if (expiryDate) form.append("expiry_date", expiryDate);
  form.append("material_change", String(materialChange !== false));
  return apiRequest(`/hr/documents/company/${documentId}/versions`, { method: "POST", body: form, timeoutMs: 120000 });
}
export const listCompanyVersions = (documentId) => api.get(`/hr/documents/company/${documentId}/versions`);
export const publishCompanyDocument = (documentId, publishAt) => api.post(`/hr/documents/company/${documentId}/publish`, { publish_at: publishAt || null });
export const unpublishCompanyDocument = (documentId) => api.post(`/hr/documents/company/${documentId}/unpublish`);
export const deleteCompanyDocument = (documentId) => api.delete(`/hr/documents/company/${documentId}`);
export const createCompanyFolder = ({ name, categoryId, parentId }) => {
  const form = new FormData();
  form.append("name", name);
  if (categoryId) form.append("company_category_id", String(categoryId));
  if (parentId) form.append("parent_id", String(parentId));
  return api.post("/hr/document-folders", form);
};
export const renameCompanyFolder = ({ folderId, name }) => {
  const form = new FormData();
  form.append("name", name);
  return api.patch(`/hr/document-folders/${folderId}`, form);
};
export const deleteCompanyFolder = (folderId) => api.delete(`/hr/document-folders/${folderId}`);
// ── admin: email sharing (Company Documents P4/P5) ────────────────────────────────────────────────────────────────────
export const getEmailStatus = () => api.get("/hr/documents/email-status");
export const shareByEmail = (body) => api.post("/hr/documents/shares/email", body);
export const listShares = (params) => api.get("/hr/documents/shares", { params: clean(params) });
export const retryShare = (shareId) => api.post(`/hr/documents/shares/${shareId}/retry`);
export const getAccessRule = (targetType, targetId) => api.get(`/hr/documents/access/${targetType}/${targetId}`);
export const putAccessRule = (targetType, targetId, rule) => api.put(`/hr/documents/access/${targetType}/${targetId}`, rule);
export const previewAccessRule = (rule) => api.post("/hr/documents/access/preview", rule);
export const getAckTracking = (documentId, params) => api.get(`/hr/documents/company/${documentId}/acknowledgements`, { params: clean(params) });
export const remindAcks = (documentId, employeeIds) => api.post(`/hr/documents/company/${documentId}/acknowledgements/remind`, { employee_ids: employeeIds || null });

// ── me: company documents ───────────────────────────────────────────────────────────────────────────────────────────
export const getMyCompanyDocuments = (params) => api.get("/hr/me/company-documents", { params: clean(params) });
export const acknowledgeCompanyDocument = (documentId, versionId) =>
  api.post(`/hr/me/company-documents/${documentId}/acknowledge`, { version_id: versionId ?? null });

// ── automation: notification wording ────────────────────────────────────────────────────────────────────────────────
export const listNotificationTemplates = () => api.get("/hr/automation/templates");
export const saveNotificationTemplate = ({ key, channel, subject, body }) =>
  api.put(`/hr/automation/templates/${encodeURIComponent(key)}/${channel}`, { subject: subject || null, body });
export const revertNotificationTemplate = ({ key, channel }) => api.delete(`/hr/automation/templates/${encodeURIComponent(key)}/${channel}`);
export const previewNotificationTemplate = ({ key, channel, subject, body }) =>
  api.post(`/hr/automation/templates/${encodeURIComponent(key)}/${channel}/preview`, { subject: subject || null, body });

// ── automation: retention policies ──────────────────────────────────────────────────────────────────────────────────
export const listRetentionPolicies = () => api.get("/hr/automation/retention-policies");
export const saveRetentionPolicy = ({ scope, key, retainYears, clock, action, reviewDays }) =>
  api.put(`/hr/automation/retention-policies/${scope}/${key}`, { retain_years: retainYears, clock, action, review_days: reviewDays ?? 30 });
export const deleteRetentionPolicy = ({ scope, key }) => api.delete(`/hr/automation/retention-policies/${scope}/${key}`);

// ── automation: rules engine ────────────────────────────────────────────────────────────────────────────────────────
export const getAutomationCatalog = () => api.get("/hr/automation/catalog");
export const listAutomationRules = (params) => api.get("/hr/automation/rules", { params: clean(params) });
export const createAutomationRule = (rule) => api.post("/hr/automation/rules", rule);
export const updateAutomationRule = ({ id, ...changes }) => api.patch(`/hr/automation/rules/${id}`, changes);
export const deleteAutomationRule = (id) => api.delete(`/hr/automation/rules/${id}`);
export const setAutomationRuleStatus = ({ id, status }) => api.post(`/hr/automation/rules/${id}/status`, { status });
export const dryRunAutomationRule = ({ id, definition, triggerEvent, sample, lastN }) =>
  api.post(id ? `/hr/automation/rules/${id}/dry-run` : "/hr/automation/rules/dry-run",
    { definition: definition ?? null, trigger_event: triggerEvent ?? null, sample: sample ?? null, last_n: lastN ?? 20 });
export const listAutomationRuns = (params) => api.get("/hr/automation/runs", { params: clean(params) });
export const getAutomationRun = (id) => api.get(`/hr/automation/runs/${id}`);
export const retryAutomationRun = (id) => api.post(`/hr/automation/runs/${id}/retry`);
export const getAutomationSettings = () => api.get("/hr/automation/settings");
export const saveAutomationSettings = (changes) => api.put("/hr/automation/settings", changes);
