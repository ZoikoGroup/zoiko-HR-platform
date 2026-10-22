// Document template engine API (backend app/modules/doc_templates; docs/templates/architecture.md).
// Every function resolves to the parsed JSON body. Errors are thrown by api.js with .status and .detail-derived message;
// structured details (preflight reasons, missing fields, separation-of-duties codes) are on error.validation / error.code.
import { api, API_BASE_URL, getAccessToken } from "./api";

const q = (params = {}) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return s ? `?${s}` : "";
};

// ── catalogue, settings, fields ─────────────────────────────────────────────────────────────────────────────────────
export const listTemplates = (params) => api.get(`/hr/templates${q(params)}`);
export const listTemplateFamilies = () => api.get("/hr/templates/families");
export const listTemplateFields = () => api.get("/hr/templates/fields");
export const getTemplate = (canonicalId) => api.get(`/hr/templates/${encodeURIComponent(canonicalId)}`);
export const getTemplateSettings = () => api.get("/hr/templates/settings");
export const updateTemplateSettings = (body) => api.put("/hr/templates/settings", body);

// ── variants (organization versions of a template) ─────────────────────────────────────────────────────────────────
export const createVariant = (canonicalId, body) => api.post(`/hr/templates/${encodeURIComponent(canonicalId)}/variants`, body);
export const getVariant = (id) => api.get(`/hr/templates/variants/${id}`);
export const updateVariant = (id, body) => api.put(`/hr/templates/variants/${id}`, body);
export const validateVariant = (id, body) => api.post(`/hr/templates/variants/${id}/validate`, body);
export const previewVariant = (id, body = {}) => api.post(`/hr/templates/variants/${id}/preview`, body);
export const submitVariant = (id) => api.post(`/hr/templates/variants/${id}/submit-review`, {});
export const approveVariantLegal = (id, body) => api.post(`/hr/templates/variants/${id}/approve-legal`, body);
export const releaseVariant = (id) => api.post(`/hr/templates/variants/${id}/release`, {});
export const suspendVariant = (id, reason) => api.post(`/hr/templates/variants/${id}/suspend`, { reason });
export const retireVariant = (id, reason) => api.post(`/hr/templates/variants/${id}/retire`, { reason });
export const diffVariants = (id, otherId) => api.get(`/hr/templates/variants/${id}/diff/${otherId}`);

// ── clauses ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const listClauses = (params) => api.get(`/hr/templates/clauses${q(params)}`);
export const getClause = (id) => api.get(`/hr/templates/clauses/${id}`);
export const createClause = (body) => api.post("/hr/templates/clauses", body);
export const updateClause = (id, body) => api.put(`/hr/templates/clauses/${id}`, body);
// action: submit | approve | release | suspend | retire  (approve needs { attestation_accepted: true })
export const clauseAction = (id, action, body = {}) => api.post(`/hr/templates/clauses/${id}/${action}`, body);

// ── jurisdiction packs ──────────────────────────────────────────────────────────────────────────────────────────────
export const listPacks = (params) => api.get(`/hr/templates/packs${q(params)}`);
export const getPack = (id) => api.get(`/hr/templates/packs/${id}`);
export const createPack = (body) => api.post("/hr/templates/packs", body);
export const updatePack = (id, body) => api.put(`/hr/templates/packs/${id}`, body);
export const submitPack = (id) => api.post(`/hr/templates/packs/${id}/submit`, {});
export const activatePack = (id, body) => api.post(`/hr/templates/packs/${id}/activate`, body);
// action: suspend | retire | reinstate | return-to-draft
export const packAction = (id, action) => api.post(`/hr/templates/packs/${id}/${action}`, {});

// ── generated documents (HR / managers) ─────────────────────────────────────────────────────────────────────────────
export const preflightDocument = (body) => api.post("/hr/generated-documents/preflight", body);
export const generateDocument = (body) => api.post("/hr/generated-documents/generate", body);
export const bulkGenerateDocuments = (body) => api.post("/hr/generated-documents/bulk-generate", body);
export const getBulkRun = (id) => api.get(`/hr/generated-documents/bulk-runs/${id}`);
export const listGeneratedDocuments = (params) => api.get(`/hr/generated-documents${q(params)}`);
export const getGeneratedDocument = (id) => api.get(`/hr/generated-documents/${id}`);
export const previewGeneratedDocument = (id) => api.get(`/hr/generated-documents/${id}/preview`);
export const getDocumentTimeline = (id) => api.get(`/hr/generated-documents/${id}/timeline`);
export const approveGeneratedDocument = (id, comment) => api.post(`/hr/generated-documents/${id}/approve`, { comment });
export const rejectGeneratedDocument = (id, comment) => api.post(`/hr/generated-documents/${id}/reject`, { comment });
export const issueGeneratedDocument = (id) => api.post(`/hr/generated-documents/${id}/issue`, {});
export const cancelGeneratedDocument = (id, reason) => api.post(`/hr/generated-documents/${id}/cancel`, { reason });
export const correctGeneratedDocument = (id, reason) => api.post(`/hr/generated-documents/${id}/correct`, { reason });
export const setLegalHold = (id, reason) => api.post(`/hr/generated-documents/${id}/legal-hold`, { reason });
export const releaseLegalHold = (id) => api.post(`/hr/generated-documents/${id}/release-hold`, {});
export const overrideSignerName = (id, body) => api.post(`/hr/generated-documents/${id}/name-override`, body);
export const employerSignOtp = (id) => api.post(`/hr/generated-documents/${id}/employer-sign/otp`, {});
export const employerSign = (id, body) => api.post(`/hr/generated-documents/${id}/employer-sign`, body);

// A short-lived (≤5 min) signed URL, then opened by the browser. `original` = the unsigned original of an executed document.
// `signatory`: an authorised signatory (any role) downloading a document waiting for their approval or signature.
export async function downloadGeneratedDocument(id, { original = false, self = false, signatory = false } = {}) {
  const path = signatory
    ? `/hr/me/generated-documents/signatory-queue/${id}/download-link`
    : self ? `/hr/me/generated-documents/${id}/download-link` : `/hr/generated-documents/${id}/download-link${original ? "?original=true" : ""}`;
  const { url } = await api.post(path, {});
  window.open(`${API_BASE_URL}${url}`, "_blank", "noopener");
}

// ── governance reports (HR-DOC family) ──────────────────────────────────────────────────────────────────────────────
export const governanceRegister = () => api.get("/hr/generated-documents/governance/register");
export const governanceApprovals = (params) => api.get(`/hr/generated-documents/governance/approvals${q(params)}`);
export const governanceVersions = (variantId) => api.get(`/hr/generated-documents/governance/versions${q({ variant_id: variantId })}`);
export const governanceGenerationInstructions = (params) => api.get(`/hr/generated-documents/governance/generation-instructions${q(params)}`);
export const governanceGenerationInstruction = (docId) => api.get(`/hr/generated-documents/governance/generation-instructions/${docId}`);
export const governanceWorkflowApproval = (docId) => api.get(`/hr/generated-documents/governance/workflow-approvals/${docId}`);
export const governanceSignatureEvidence = (docId) => api.get(`/hr/generated-documents/governance/signature-evidence/${docId}`);
export const governanceAcknowledgements = (params) => api.get(`/hr/generated-documents/governance/acknowledgements${q(params)}`);
export const governanceAcknowledgement = (id) => api.get(`/hr/generated-documents/governance/acknowledgements/${id}`);
export const governanceDistribution = (id) => api.get(`/hr/generated-documents/governance/distributions/${id}`);
export const governanceExpiries = (params) => api.get(`/hr/generated-documents/governance/expiries${q(params)}`);
export const resolveExpiryItem = (id, body) => api.put(`/hr/generated-documents/governance/expiries/${id}`, body);
export const governanceSupersessions = () => api.get("/hr/generated-documents/governance/supersessions");
export const governanceSupersession = (id) => api.get(`/hr/generated-documents/governance/supersessions/${id}`);

// Authenticated file export (CSV or PDF) of any governance report path above.
export async function exportGovernance(path, format, filename) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API_BASE_URL}${path}${sep}format=${format}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── self-service (employee) ─────────────────────────────────────────────────────────────────────────────────────────
export const listMyGeneratedDocuments = (params) => api.get(`/hr/me/generated-documents${q(params)}`);
export const myPendingDocumentCount = () => api.get("/hr/me/generated-documents/pending-count");
export const getSigningStatements = () => api.get("/hr/me/generated-documents/statements");
export const getMyGeneratedDocument = (id) => api.get(`/hr/me/generated-documents/${id}`);
export const previewMyGeneratedDocument = (id) => api.get(`/hr/me/generated-documents/${id}/preview`);
export const acknowledgeMyDocument = (id, textVersion) => api.post(`/hr/me/generated-documents/${id}/acknowledge`, { text_version: textVersion });
export const requestMySignOtp = (id) => api.post(`/hr/me/generated-documents/${id}/sign/otp`, {});
// body: { typed_name, method: "TYPED"|"DRAWN", drawn_signature?: dataURL, consent_version, otp_code? }
export const signMyDocument = (id, body) => api.post(`/hr/me/generated-documents/${id}/sign`, body);
export const declineMyDocument = (id, reason) => api.post(`/hr/me/generated-documents/${id}/decline`, { reason });
export const getSignatoryQueue = () => api.get("/hr/me/generated-documents/signatory-queue");
export const previewSignatoryDocument = (id) => api.get(`/hr/me/generated-documents/signatory-queue/${id}/preview`);

// ── public (candidate signing link, verification) ───────────────────────────────────────────────────────────────────
const enc = encodeURIComponent;
export const getPublicSigning = (token) => api.get(`/public/documents/sign/${enc(token)}`, { auth: false });
export const publicSigningPdfUrl = (token) => `${API_BASE_URL}/public/documents/sign/${enc(token)}/pdf`;
export const requestPublicSignOtp = (token) => api.post(`/public/documents/sign/${enc(token)}/otp`, {}, { auth: false });
export const publicSign = (token, body) => api.post(`/public/documents/sign/${enc(token)}/sign`, body, { auth: false });
export const publicDecline = (token, reason) => api.post(`/public/documents/sign/${enc(token)}/decline`, { reason }, { auth: false });
export const verifyDocument = (documentNumber, hash16) =>
  api.get(`/public/documents/verify/${enc(documentNumber)}${q({ h: hash16 })}`, { auth: false });

// ── legal entities, signatories, worker jurisdiction ────────────────────────────────────────────────────────────────
export const listLegalEntities = () => api.get("/hr/legal-entities");
export const getLegalEntity = (id) => api.get(`/hr/legal-entities/${id}`);
export const createLegalEntity = (body) => api.post("/hr/legal-entities", body);
export const updateLegalEntity = (id, body) => api.put(`/hr/legal-entities/${id}`, body);
export const setDefaultLegalEntity = (id) => api.post(`/hr/legal-entities/${id}/default`, {});
export const setLegalEntityStatus = (id, status) => api.post(`/hr/legal-entities/${id}/status`, { status });
export const listSignatories = (entityId) => api.get(`/hr/legal-entities/signatories${q({ entity_id: entityId })}`);
export const createSignatory = (body) => api.post("/hr/legal-entities/signatories", body);
export const updateSignatory = (id, body) => api.put(`/hr/legal-entities/signatories/${id}`, body);
export const getJurisdictionGaps = () => api.get("/hr/legal-entities/jurisdiction-gaps");
export const getEmployeeJurisdiction = (employeeId) => api.get(`/hr/employees/${employeeId}/jurisdiction`);
export const updateEmployeeJurisdiction = (employeeId, body) => api.put(`/hr/employees/${employeeId}/jurisdiction`, body);

// ── policy distributions (HR-DOC-014) ───────────────────────────────────────────────────────────────────────────────
export const listPolicyDistributions = (params) => api.get(`/hr/policy-distributions${q(params)}`);
export const getPolicyDistribution = (id) => api.get(`/hr/policy-distributions/${id}`);
export const createPolicyDistribution = (body) => api.post("/hr/policy-distributions", body);
export const updatePolicyDistribution = (id, body) => api.put(`/hr/policy-distributions/${id}`, body);
export const publishPolicyDistribution = (id, confirmPartial = false) =>
  api.post(`/hr/policy-distributions/${id}/publish`, { confirm_partial: confirmPartial });
export const closePolicyDistribution = (id) => api.post(`/hr/policy-distributions/${id}/close`, {});

// Human-readable text for preflight reason codes (shown in the Generate dialog and the library).
export const REASON_TEXT = {
  NO_ACTIVE_PACK: "No active jurisdiction pack covers where this person works.",
  NO_ACTIVE_VARIANT: "There is no released version of this template for this jurisdiction and language.",
  VARIANT_EXPIRED: "The released version of this template has expired.",
  AMBIGUOUS_VARIANT: "More than one released version matches. Retire one of them.",
  TENANT_VARIANTS_DISABLED: "Organization-approved templates are switched off for your plan or settings.",
  WORK_COUNTRY_UNKNOWN: "The person's work country is not recorded.",
  CROSS_BORDER_UNRESOLVED: "The employer and the work country differ and no released version covers that combination.",
  NO_EMPLOYER_ENTITY: "No legal entity is set up for your organization.",
  EMPLOYER_ENTITY_INCOMPLETE: "The employer's legal entity needs a legal name and a country.",
  NOT_IMPLEMENTED: "This template is not available yet.",
  ENGINE_RECORD_ONLY: "This governance record is produced automatically.",
  NOT_ENTITLED: "Your plan does not include document templates.",
  ROLE_NOT_ALLOWED: "Your role cannot request this kind of document.",
  SUBJECT_NOT_AUTHORISED: "You cannot create documents about this person.",
  SUBJECT_NOT_FOUND: "That person was not found.",
  NO_AUTHORISED_SIGNATORY: "No authorised signatory can sign this document for the employer.",
  INSUFFICIENT_APPROVERS: "Not enough different people can approve this document.",
  RECIPIENT_EMAIL_MISSING: "The recipient has no e-mail address.",
  RECIPIENT_NOT_AN_EMPLOYEE: "This document can only be issued to an employee.",
  RECIPIENT_HAS_NO_PORTAL_ACCOUNT: "The recipient has no active account.",
  LANGUAGE_NOT_APPROVED: "That language is not approved for this template.",
};

export function reasonText(code) {
  if (!code) return "";
  const [head, arg] = String(code).split(":");
  if (head === "MISSING_FIELD") return `Missing information: ${arg}`;
  if (head === "CLAUSE_UNRESOLVED") return `The required clause "${arg}" has no released text in this jurisdiction.`;
  if (head === "PROHIBITED_CLAUSE") return `The clause "${arg}" is not allowed in this template.`;
  if (head === "UNKNOWN_FIELD") return `Unknown field: ${arg}`;
  return REASON_TEXT[head] || code;
}
