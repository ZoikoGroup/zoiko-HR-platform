import { api } from "./api";

const BASE = "/hr/recruitment";

export const getOfferDocument = (id) => api.get(`${BASE}/offers/${id}/document`);
export const getOfferLetterPreflight = (id) => api.get(`${BASE}/offers/${id}/letter/preflight`);
// every prerequisite of the offer letter checked on its own (plan, entity, signatory, pack, template, clauses, approval), with fix links
export const getOfferLetterReadiness = (id) => api.get(`${BASE}/offers/${id}/letter/readiness`);
export const getOfferLetterDraftPreview = (id) => api.get(`${BASE}/offers/${id}/letter/draft-preview`);
// one-step offer letter setup for a work country: employer, signatory, pack and the starter templates (organization admin)
// Setup creates a jurisdiction pack, releases several templates and stores signed approval PDFs.
// These operations can exceed the generic 20s API deadline when the document store is under load.
export const getOfferLetterSetup = (country) => api.get(`${BASE}/offer-letter-setup`, {
  params: country ? { country } : {}, timeoutMs: 60000,
});
export const runOfferLetterSetup = (body) => api.post(`${BASE}/offer-letter-setup`, body, { timeoutMs: 120000 });
export const approveOfferDocument = (id, comment = null) => api.post(`${BASE}/offers/${id}/approve`, { comment });
export const generateOfferLetter = (id) => api.post(`${BASE}/offers/${id}/letter`, {});
export const sendOfferLetter = (id) => api.post(`${BASE}/offers/${id}/letter/send`, {}, { timeoutMs: 180000 });
export const resendOfferLetter = (id) => api.post(`${BASE}/offers/${id}/letter/resend`, {}, { timeoutMs: 180000 });
export const issueOfferLetter = (id) => api.post(`${BASE}/offers/${id}/letter/issue`, {}, { timeoutMs: 180000 });
export const amendOffer = (id, changes) => api.post(`${BASE}/offers/${id}/amend`, { changes });
export const requestOfferWithdrawal = (id, body) => api.post(`${BASE}/offers/${id}/withdrawal`, body);
export const clearOfferCondition = (id, index) => api.post(`${BASE}/offers/${id}/conditions/${index}/clear`, {});

export const getCandidateDocumentsStatus = (id) => api.get(`${BASE}/candidates/${id}/documents-status`);
export const sendCandidatePrivacyNotice = (id) => api.post(`${BASE}/candidates/${id}/privacy-notice`, {});
export const bulkRejectCandidates = (candidateIds, notes = {}, preview = true) =>
  api.post(`${BASE}/candidates/bulk-reject`, { candidate_ids: candidateIds, notes, preview });

export const submitInterviewScorecard = (id, body) => api.post(`${BASE}/interviews/${id}/scorecard`, body);
export const getRequisitionScorecards = (id) => api.get(`${BASE}/requisitions/${id}/scorecards`);
export const getRequisitionAuthorization = (id) => api.get(`${BASE}/requisitions/${id}/authorization`);

export const getRecruitmentPrivacySettings = () => api.get(`${BASE}/privacy-settings`);
export const updateRecruitmentPrivacySettings = (body) => api.put(`${BASE}/privacy-settings`, body);
