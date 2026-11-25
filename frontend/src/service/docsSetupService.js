// "Set up docs for your organisation", the organisation's onboarding package, portal forms and upload categories.
import { api, API_BASE_URL, getAccessToken } from "./api";
import { openFile } from "../utils/fileViewer";

const BASE = "/hr/onboarding/docs-setup";

// ── the wizard ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const getDocsSetupStatus = () => api.get(`${BASE}/status`);
export const openDocsSetupSession = () => api.post(`${BASE}/sessions`);
export const getDocsSetupSession = (id) => api.get(`${BASE}/sessions/${id}`);
export const setDocsSetupStep = (id, step) => api.put(`${BASE}/sessions/${id}/step`, { step });
export const uploadDocsSetupFile = (id, file, label) => {
  const fd = new FormData();
  fd.append("file", file);
  if (label) fd.append("label", label);
  return api.post(`${BASE}/sessions/${id}/files`, fd, { timeoutMs: 180000 });
};
export const deleteDocsSetupFile = (id, fileId) => api.delete(`${BASE}/sessions/${id}/files/${fileId}`);
export const setDocsSetupFileLabel = (id, fileId, label) => api.put(`${BASE}/sessions/${id}/files/${fileId}`, { label });
export const getDocsSetupFileLink = (id, fileId, { page, chunk } = {}) =>
  api.get(`${BASE}/sessions/${id}/files/${fileId}/view`, { params: { page, chunk } });
export const analyseDocsSetup = (id) => api.post(`${BASE}/sessions/${id}/analyse`, undefined, { timeoutMs: 300000 });
export const cancelDocsSetup = (id) => api.post(`${BASE}/sessions/${id}/cancel`);
export const getDocsSetupProposals = (id, target) => api.get(`${BASE}/sessions/${id}/proposals`, { params: { target } });
export const decideDocsSetupProposal = (id, pid, decision, finalValue) =>
  api.patch(`${BASE}/sessions/${id}/proposals/${pid}`, { decision, final_value: finalValue });
export const bulkDocsSetupProposals = (id, target, minConfidence, decision = "accepted") =>
  api.post(`${BASE}/sessions/${id}/proposals/bulk`, { target, min_confidence: minConfidence, decision });
export const addDocsSetupChange = (id, change) => api.post(`${BASE}/sessions/${id}/proposals/manual`, change);
export const getDocsSetupMapping = (id, fileId) => api.get(`${BASE}/sessions/${id}/mapping/${fileId}`);
export const setDocsSetupMapping = (id, fileId, mapping) => api.put(`${BASE}/sessions/${id}/mapping/${fileId}`, mapping);
export const getDocsSetupMappingOptions = (id) => api.get(`${BASE}/sessions/${id}/mapping-options`);
export const getDocsSetupSummary = (id) => api.get(`${BASE}/sessions/${id}/summary`);
export const setDocsSetupOptions = (id, options) => api.put(`${BASE}/sessions/${id}/options`, options);
export const applyDocsSetup = (id, key) => api.post(`${BASE}/sessions/${id}/apply`, undefined, { headers: { "Idempotency-Key": key }, timeoutMs: 180000 });
export const undoDocsSetup = (id) => api.post(`${BASE}/sessions/${id}/undo`);
export const approveReleaseDocsSetup = (id, body) => api.post(`${BASE}/sessions/${id}/approve-release`, body, { timeoutMs: 180000 });

/** The draft built from a mapped file, as a PDF blob (a watermarked preview). */
export async function getDocsSetupPreviewPdf(id, fileId) {
  const res = await fetch(`${API_BASE_URL}${BASE}/sessions/${id}/mapping/${fileId}/preview.pdf`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) {
    let message = "The preview could not be made.";
    try { const body = await res.json(); message = body?.detail?.message || body?.detail || body?.message || message; } catch { /* not JSON */ }
    throw new Error(typeof message === "string" ? message : "The preview could not be made.");
  }
  return res.blob();
}

/** An uploaded file, fetched through its short-lived link and shown in the in-app viewer at the cited page. */
export async function openDocsSetupSource(id, fileId, { page, chunk, filename } = {}) {
  const link = await getDocsSetupFileLink(id, fileId, { page, chunk });
  const url = (link?.url?.startsWith("http") ? link.url : `${API_BASE_URL}${link?.url || ""}`).split("#")[0];
  const res = await fetch(url);
  if (!res.ok) throw new Error("The source file could not be opened.");
  const blob = await res.blob();
  const match = /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") || "");
  openFile(blob, filename || match?.[1] || link?.filename || "Source document", "preview", { page });
}

// ── Word template import ────────────────────────────────────────────────────────────────────────────────────────────
export const checkDocxTemplate = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`${BASE}/docx-import/check`, fd, { timeoutMs: 120000 });
};
export const importDocxTemplate = (file, { title, target = "new", mapping = {} } = {}) => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("title", title || "");
  fd.append("target", target);
  fd.append("mapping", JSON.stringify(mapping));
  return api.post(`${BASE}/docx-import`, fd, { timeoutMs: 120000 });
};

// ── the organisation's package ──────────────────────────────────────────────────────────────────────────────────────
export const getPackageDocuments = () => api.get("/hr/onboarding/package/documents");
export const savePackageDocuments = (documents) => api.put("/hr/onboarding/package/documents", { documents });
export const addPackageDocument = (payload) => api.post("/hr/onboarding/package/documents", payload);
export const removePackageDocument = (category) => api.delete(`/hr/onboarding/package/documents/${encodeURIComponent(category)}`);
export const customisePackageDocument = (category) => api.post(`/hr/onboarding/package/documents/${encodeURIComponent(category)}/customise`);
export const createOrgTemplate = (payload) => api.post("/hr/onboarding/package/org-templates", payload);
export const decidePendingClause = (key, approve, counselReference) =>
  api.post(`/hr/onboarding/package/clauses/${encodeURIComponent(key)}/pending`, { approve, counsel_reference: counselReference });

// ── portal forms and upload categories ──────────────────────────────────────────────────────────────────────────────
export const getPortalFormSettings = (cid) => api.get(`/hr/onboarding/forms/${cid}/settings`);
export const savePortalFormSettings = (cid, payload) => api.put(`/hr/onboarding/forms/${cid}/settings`, payload);
export const getRequestCategories = () => api.get("/hr/onboarding/request-categories");
export const addRequestCategory = (payload) => api.post("/hr/onboarding/request-categories", payload);
export const updateRequestCategory = (id, payload) => api.put(`/hr/onboarding/request-categories/${id}`, payload);
export const deleteRequestCategory = (id) => api.delete(`/hr/onboarding/request-categories/${id}`);

