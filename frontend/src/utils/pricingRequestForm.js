// Request Pricing form: the rules (the same ones the server applies) and the payload it sends.
import { realEmailError } from "./realEmail";

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
export const PLANS = [
  { value: "core", label: "Core", who: "Growing teams that need a clean people system of record.", points: ["Employee records & org chart", "Leave, documents & self-service", "Standard reports and approvals"] },
  { value: "advanced", label: "Advanced", who: "Organizations with several entities, custom workflows or reporting needs.", points: ["Everything in Core", "Custom workflows & report builder", "Multi-country leave, SSO, API access"] },
  { value: "enterprise", label: "Enterprise", who: "Large or regulated organizations that need contract-grade terms.", points: ["Everything in Advanced", "Sandbox environments & identity provisioning", "SLA, priced by contract"] },
];
export const PRODUCT_OPTIONS = [
  { value: "core_hr", label: "Core HR" },
  { value: "leave", label: "Leave Management" },
  { value: "docs_pro", label: "Zoiko Docs Pro" },
];
export const TIMELINES = [
  { value: "now", label: "As soon as possible" },
  { value: "1-3-months", label: "In 1-3 months" },
  { value: "3-6-months", label: "In 3-6 months" },
  { value: "just-exploring", label: "Just exploring" },
];

export const EMPTY_FORM = {
  fullName: "", workEmail: "", phone: "", company: "", jobTitle: "", country: "", companySize: "",
  planInterest: "", products: [], billingPreference: "", timeline: "", message: "", consent: false, website: "",
};

/** The plan that usually fits a company of this size: a starting point, the person can change it. */
export function suggestedPlan(size) {
  if (!size) return null;
  if (size === "1-10" || size === "11-50") return "core";
  if (size === "1000+") return "enterprise";
  return "advanced";
}

/** { field: message } for everything wrong; empty when the form can be sent. */
export function validatePricingForm(f) {
  const e = {};
  if (String(f.fullName).trim().length < 2) e.fullName = "Enter your full name.";
  const email = String(f.workEmail).trim();
  if (!email) e.workEmail = "Enter your work email.";
  else {
    const problem = realEmailError(email);
    if (problem) e.workEmail = problem;
  }
  const phone = String(f.phone).trim();
  if (phone && (!/^\+?[0-9 ()\-.]{7,20}$/.test(phone) || phone.replace(/\D/g, "").length < 7)) e.phone = "Enter a valid phone number, for example +1 555 010 0100.";
  if (String(f.company).trim().length < 2) e.company = "Enter your company name.";
  if (!f.country) e.country = "Choose your country.";
  if (!f.companySize) e.companySize = "Choose your company size.";
  if (String(f.message).length > 2000) e.message = "Keep your message under 2000 characters.";
  if (!f.consent) e.consent = "Please agree to be contacted about this request.";
  return e;
}

export function buildPricingPayload(f) {
  const clean = (v) => String(v ?? "").trim();
  return {
    full_name: clean(f.fullName),
    work_email: clean(f.workEmail).toLowerCase(),
    phone: clean(f.phone) || null,
    company: clean(f.company),
    job_title: clean(f.jobTitle) || null,
    country: f.country,
    company_size: f.companySize,
    plan_interest: f.planInterest || suggestedPlan(f.companySize) || "not_sure",
    products: f.products,
    billing_preference: f.billingPreference || null,
    timeline: f.timeline || null,
    message: clean(f.message) || null,
    consent: !!f.consent,
    website: f.website || null,
  };
}

/** Server validation errors ([{loc, msg}]) mapped back onto the form's fields. */
export function serverFieldErrors(validation) {
  const map = { full_name: "fullName", work_email: "workEmail", phone: "phone", company: "company", country: "country", company_size: "companySize", consent: "consent", message: "message" };
  const out = {};
  (Array.isArray(validation) ? validation : []).forEach((v) => {
    const field = map[v?.loc?.[v.loc.length - 1]];
    if (field && !out[field]) out[field] = String(v.msg || "").replace(/^Value error, /, "");
  });
  return out;
}
