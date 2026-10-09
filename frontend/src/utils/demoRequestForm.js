// Book a Demo form: the rules (the same ones the server applies) and the payload it sends.
import { realEmailError } from "./realEmail";

export const DEMO_INTERESTS = [
  { value: "core_hr", label: "Core HR" },
  { value: "leave", label: "Leave Management" },
  { value: "docs_pro", label: "Zoiko Docs Pro" },
  { value: "attendance", label: "Attendance" },
  { value: "payroll", label: "Payroll" },
  { value: "recruitment", label: "Recruitment" },
  { value: "performance", label: "Performance" },
  { value: "learning", label: "Learning" },
];
export const TIME_SLOTS = [
  { value: "morning", label: "Morning", sub: "9am - 12pm" },
  { value: "afternoon", label: "Afternoon", sub: "12pm - 4pm" },
  { value: "evening", label: "Evening", sub: "4pm - 7pm" },
];
export const DEMO_FORMATS = [
  { value: "live", label: "Live video call", sub: "30 minutes with a product specialist" },
  { value: "recorded", label: "Recorded walkthrough", sub: "Watch at your own pace" },
  { value: "in_person", label: "In person", sub: "For larger teams, where available" },
];
export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

export const EMPTY_DEMO = {
  fullName: "", workEmail: "", phone: "", company: "", jobTitle: "", country: "", companySize: "",
  interests: [], preferredDate: "", preferredTime: "", demoFormat: "live", message: "", consent: false, website: "",
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function dateLimits(now = new Date()) {
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 180);
  return { min: iso(now), max: iso(max) };
}

export function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

export function validateDemoForm(f, now = new Date()) {
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
  if (f.preferredDate) {
    const { min, max } = dateLimits(now);
    if (f.preferredDate < min) e.preferredDate = "Choose today or a later date.";
    else if (f.preferredDate > max) e.preferredDate = "Choose a date within the next six months.";
  }
  if (String(f.message).length > 2000) e.message = "Keep your message under 2000 characters.";
  if (!f.consent) e.consent = "Please agree to be contacted about this demo.";
  return e;
}

export function buildDemoPayload(f, tz = browserTimezone()) {
  const clean = (v) => String(v ?? "").trim();
  return {
    full_name: clean(f.fullName),
    work_email: clean(f.workEmail).toLowerCase(),
    phone: clean(f.phone) || null,
    company: clean(f.company),
    job_title: clean(f.jobTitle) || null,
    country: f.country,
    company_size: f.companySize,
    interests: f.interests,
    preferred_date: f.preferredDate || null,
    preferred_time: f.preferredTime || null,
    timezone: tz || null,
    demo_format: f.demoFormat || "live",
    message: clean(f.message) || null,
    consent: !!f.consent,
    website: f.website || null,
  };
}

export function serverDemoErrors(validation) {
  const map = { full_name: "fullName", work_email: "workEmail", phone: "phone", company: "company", country: "country", company_size: "companySize", preferred_date: "preferredDate", consent: "consent", message: "message" };
  const out = {};
  (Array.isArray(validation) ? validation : []).forEach((v) => {
    const field = map[v?.loc?.[v.loc.length - 1]];
    if (field && !out[field]) out[field] = String(v.msg || "").replace(/^Value error, /, "");
  });
  return out;
}
