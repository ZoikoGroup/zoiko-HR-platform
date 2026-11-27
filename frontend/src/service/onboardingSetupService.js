// Onboarding documents for every organisation: its own document fields, per-document rules and automation, starter sets,
// employer countersigners, the test package and the setup score (Onboarding › Settings and the documents panel).
import { api, API_BASE_URL, getAccessToken } from "./api";
// ── every organisation's own fields, rules, automation, countersigners, test package and setup score ───────────────
export const getCustomFields = () => api.get("/hr/onboarding/custom-fields");
export const saveCustomFields = (fields) => api.put("/hr/onboarding/custom-fields", { fields });
export const addCustomField = (field) => api.post("/hr/onboarding/custom-fields", field);
export const getPackageAutomation = () => api.get("/hr/onboarding/package/automation");
export const savePackageAutomation = (payload) => api.put("/hr/onboarding/package/automation", payload);
export const sendPreparedDocuments = (hireId, categories) =>
  api.post(`/hr/onboarding/new-hires/${hireId}/package/send-prepared`, categories ? { categories } : {}, { timeoutMs: 120000 });
export const getTestPackage = ({ engagement, role } = {}) =>
  api.get("/hr/onboarding/package/test", { params: { engagement: engagement || undefined, role: role || undefined }, timeoutMs: 120000 });
export const getSetupStatus = ({ fresh } = {}) =>
  api.get("/hr/onboarding/setup-status", { params: { fresh: fresh ? "true" : undefined }, timeoutMs: 120000 });
export const getStarterSets = () => api.get("/hr/onboarding/package/starter-sets");
export const applyStarterSet = (key, sendWhen) => api.post(`/hr/onboarding/package/starter-sets/${encodeURIComponent(key)}/apply`, { send_when: sendWhen });
export const getCountersigners = () => api.get("/hr/onboarding/package/countersigners");
export const addCountersigner = (payload) => api.post("/hr/onboarding/package/countersigners", payload);
export const removeCountersigner = (id) => api.delete(`/hr/onboarding/package/countersigners/${id}`);
export const getWordLayoutStatus = () => api.get("/hr/onboarding/package/word-layout");

/** A watermarked preview of one package document for the sample new hire (a PDF blob). */
export async function getTestPackagePreview(category, { engagement, role } = {}) {
  const qs = new URLSearchParams();
  if (engagement) qs.set("engagement", engagement);
  if (role) qs.set("role", role);
  const res = await fetch(`${API_BASE_URL}/hr/onboarding/package/test/${encodeURIComponent(category)}/preview.pdf?${qs}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) {
    let message = "The preview could not be made.";
    try { const body = await res.json(); message = body?.detail?.message || body?.detail || body?.message || message; } catch { /* not JSON */ }
    throw new Error(typeof message === "string" ? message : "The preview could not be made.");
  }
  return res.blob();
}
// Settings › Missing details: every value the documents still need, asked for in one place
export const getSettingsGaps = () => api.get("/hr/onboarding/settings-gaps", { timeoutMs: 120000 });
export const saveSettingsGaps = (payload) => api.put("/hr/onboarding/settings-gaps", payload, { timeoutMs: 120000 });
