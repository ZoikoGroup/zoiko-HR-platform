// Prompt 4: probation, appraisals, PIPs, training records, employment changes, and the go-live tooling (documents to action,
// automation, country activation, retention, reporting) plus the platform's emergency controls. No document contents.
import { api } from "./api";

const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : "";
};

// ── documents to action ──────────────────────────────────────────────────────────────────────────────────────────────
export const getMyDocumentActions = () => api.get("/hr/me/document-actions");
export const getTeamDocumentActions = () => api.get("/hr/document-centre/team-actions");

// ── probation, appraisals, PIPs ──────────────────────────────────────────────────────────────────────────────────────
const PRF = "/hr/performance-documents";
export const listProbationReviews = (employeeId) => api.get(`${PRF}/probation-reviews${qs({ employee_id: employeeId })}`);
export const submitProbationReview = (body) => api.post(`${PRF}/probation-reviews`, body);
export const issueProbationReview = (id) => api.post(`${PRF}/probation-reviews/${id}/issue`, {});
export const requestProbationOutcome = (employeeId, body) => api.post(`${PRF}/probation/${employeeId}/outcome`, body);
export const submitManagerAssessment = (appraisalId, body) => api.post(`${PRF}/appraisals/${appraisalId}/manager-assessment`, body);
export const calibrateAppraisal = (appraisalId) => api.post(`${PRF}/appraisals/${appraisalId}/calibrate`, {});
export const finaliseAppraisal = (appraisalId, body) => api.post(`${PRF}/appraisals/${appraisalId}/finalise`, body);
export const getAppraisalDocuments = (appraisalId) => api.get(`${PRF}/appraisals/${appraisalId}/documents`);
export const listPips = (status) => api.get(`${PRF}/pips${qs({ status })}`);
export const createPip = (body) => api.post(`${PRF}/pips`, body);
export const submitPip = (id) => api.post(`${PRF}/pips/${id}/submit`, {});
export const decidePip = (id, body) => api.post(`${PRF}/pips/${id}/decision`, body);
export const addPipReviewNote = (id, note) => api.post(`${PRF}/pips/${id}/reviews`, { note });
export const closePip = (id, body) => api.post(`${PRF}/pips/${id}/outcome`, body);
export const listMyProbationReviews = () => api.get("/hr/me/performance/probation-reviews");
export const commentOnMyProbationReview = (id, comments) => api.post(`/hr/me/performance/probation-reviews/${id}/comments`, { comments });
export const listMyAppraisals = () => api.get("/hr/me/performance/appraisals");
export const submitSelfAssessment = (appraisalId, body) => api.post(`/hr/me/performance/appraisals/${appraisalId}/self-assessment`, body);
export const commentOnMyAppraisal = (appraisalId, comments) => api.post(`/hr/me/performance/appraisals/${appraisalId}/comments`, { comments });

// ── employment changes ───────────────────────────────────────────────────────────────────────────────────────────────
export const listChanges = (params) => api.get(`/hr/changes${qs(params)}`);
export const createChange = (body) => api.post("/hr/changes", body);
export const decideChange = (id, body) => api.post(`/hr/changes/${id}/decision`, body);
export const completeChange = (id) => api.post(`/hr/changes/${id}/complete`, {});
export const getChangeDocuments = (id) => api.get(`/hr/changes/${id}/documents`);
export const bulkManagerChange = (body) => api.post("/hr/changes/bulk-manager-change", body);
export const listMyTransferRequests = () => api.get("/hr/me/transfer-requests");
export const requestTransfer = (body) => api.post("/hr/me/transfer-requests", body);

// ── training records ─────────────────────────────────────────────────────────────────────────────────────────────────
export const getTrainingCompliance = () => api.get("/hr/learning-documents/compliance");
export const runTrainingExpiryCheck = () => api.post("/hr/learning-documents/run-expiry-check", {});

// ── documents centre (HR) ────────────────────────────────────────────────────────────────────────────────────────────
const DC = "/hr/document-centre";
export const getAutomationRules = () => api.get(`${DC}/automation`);
export const saveAutomationRules = (changes) => api.put(`${DC}/automation`, changes);
export const getActivationOverview = () => api.get(`${DC}/activation`);
export const getCountryActivation = (country) => api.get(`${DC}/activation/${encodeURIComponent(country)}`);
export const counselPackUrl = (country, format = "csv") => `${DC}/activation/${encodeURIComponent(country)}/counsel-pack?format=${format}`;
export const getRetentionSettings = () => api.get(`${DC}/retention`);
export const saveRetentionSettings = (body) => api.put(`${DC}/retention`, body);
export const getRetentionQueue = () => api.get(`${DC}/retention/queue`);
export const reviewRetention = (documentId, body) => api.post(`${DC}/retention/${documentId}/review`, body);
export const getLegacySummary = () => api.get(`${DC}/legacy`);
export const getDocumentReport = () => api.get(`${DC}/reports`);
export const getTemplateLanguages = () => api.get(`${DC}/languages`);

// ── platform (Super Admin) ───────────────────────────────────────────────────────────────────────────────────────────
export const listPlatformPacks = () => api.get("/super-admin/doc-templates/packs");
export const suspendPlatformPack = (id, reason) => api.post(`/super-admin/doc-templates/packs/${id}/suspend`, { reason });
export const suspendPlatformVariant = (id, reason) => api.post(`/super-admin/doc-templates/variants/${id}/suspend`, { reason });
export const getCountryDemand = () => api.get("/super-admin/doc-templates/country-demand");

export const PROMPT4_REASON_TEXT = {
  PROBATION_EXTENSION_NOT_RECOMMENDED: "No probation review recommends an extension yet.",
  PROBATION_LIMIT_NOT_CONFIGURED: "The released extension clause does not state the maximum probation length.",
  PROBATION_LIMIT_EXCEEDED: "The new end date is beyond the maximum probation length for this country.",
  PROBATION_DECISION_NOT_APPROVED: "The probation decision has not been approved by HR yet.",
  PROBATION_CHECKLIST_INCOMPLETE: "The unsuccessful-probation checklist is not complete.",
  CONTRACT_VARIATION_REQUIRED: "This change also changes the country, region, hours or contract type: a terms variation agreement is needed.",
  LINKED_COMPENSATION_NOT_APPROVED: "The linked salary revision has not been approved.",
  CHANGE_NOT_APPROVED: "The change has not been approved yet.",
  APPRAISAL_NOT_FINAL: "The appraisal is not final yet.",
  PIP_NOT_APPROVED: "The improvement plan has not been approved by HR.",
  TEMPLATES_DISABLED: "Document generation is switched off for your organization.",
  PLAN_FEATURE_REQUIRED: "Your plan does not include this. Upgrade to use it.",
};
