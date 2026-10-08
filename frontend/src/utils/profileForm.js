// My Profile: format rules for personal, banking and identity details. They mirror backend/app/core/identity_formats.py
// and EmployeeSelfUpdate / EmployeeProfileUpdate, so the same message appears whether the browser or the server catches
// the problem. Every check returns "" when the value is fine or blank (a blank box clears the stored value).
import { phoneError } from "./phone";

const clean = (v) => String(v ?? "").trim();
const compact = (v) => clean(v).replace(/[\s-]/g, "");

export const FORMATS = {
  pan_number: (v) => (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(compact(v).toUpperCase()) ? "" : "Enter a valid PAN: 5 letters, 4 digits and 1 letter, for example ABCDE1234F."),
  aadhar_number: (v) => {
    const t = compact(v);
    if (!/^[0-9]{12}$/.test(t)) return "Enter a valid Aadhar number: 12 digits, for example 2345 6789 0123.";
    return /^[01]/.test(t) ? "An Aadhar number cannot start with 0 or 1." : "";
  },
  bank_ifsc: (v) => (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(compact(v).toUpperCase()) ? "" : "Enter a valid IFSC code: 4 letters, the digit 0, then 6 letters or digits, for example HDFC0001234."),
  bank_account: (v) => {
    const t = compact(v);
    if (!/^[0-9]{9,18}$/.test(t)) return "Enter a valid account number: 9 to 18 digits, with no letters or symbols.";
    return new Set(t).size === 1 ? "That account number is not valid." : "";
  },
  bank_name: (v) => {
    const t = clean(v).replace(/\s+/g, " ");
    if (t.length > 100) return "Bank name can be at most 100 characters.";
    return /^[A-Za-z][A-Za-z .,&'()-]*$/.test(t) ? "" : "Bank name can contain only letters, spaces and . , & ' ( ) - and must start with a letter.";
  },
  uan_number: (v) => (/^[0-9]{12}$/.test(compact(v)) ? "" : "Enter a valid UAN: 12 digits."),
  esic_number: (v) => (/^([0-9]{10}|[0-9]{17})$/.test(compact(v)) ? "" : "Enter a valid ESIC number: 10 or 17 digits."),
  pf_number: (v) => (/^[A-Z0-9][A-Z0-9/-]{4,29}$/.test(clean(v).replace(/\s/g, "").toUpperCase()) ? "" : "Enter a valid PF number: 5 to 30 letters, digits, / or -, for example MH/BAN/1234567/000/0001234."),
  passport_number: (v) => {
    const t = compact(v).toUpperCase();
    return /^[A-Z0-9]{6,9}$/.test(t) && /[0-9]/.test(t) ? "" : "Enter a valid passport number: 6 to 9 letters and digits, for example K1234567.";
  },
  visa_number: (v) => (/^[A-Z0-9]{5,20}$/.test(compact(v).toUpperCase()) ? "" : "Enter a valid visa number: 5 to 20 letters and digits."),
  phone: (v) => phoneError(v),
  emergency_contact_phone: (v) => phoneError(v),
  pincode: (v) => (/^[A-Z0-9-]{3,10}$/.test(clean(v).replace(/\s/g, "").toUpperCase()) ? "" : "Enter a valid pincode: 3 to 10 letters or digits (for example 560001)."),
  personal_email: (v) => (clean(v).length <= 255 && /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(clean(v)) ? "" : "Enter a valid email address, for example name@example.com."),
  emergency_contact_name: (v) => nameCheck(v, "Emergency contact name", 100),
  emergency_contact_relation: (v) => nameCheck(v, "Relation", 50),
  nationality: (v) => nameCheck(v, "Nationality", 50),
};

function nameCheck(v, label, max) {
  const t = clean(v).replace(/\s+/g, " ");
  if (t.length > max) return `${label} can be at most ${max} characters.`;
  return /^[A-Za-z][A-Za-z .'-]*$/.test(t) ? "" : `${label} can contain only letters, spaces and . ' - and must start with a letter.`;
}

const DATE_RANGE = (label) => (v) => {
  const d = clean(v);
  if (!d) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return `Enter a valid ${label.toLowerCase()}.`;
  const y = Number(d.slice(0, 4));
  return y < 2000 || y > 2100 ? `${label} must be between the years 2000 and 2100.` : "";
};

export const DATE_FORMATS = {
  passport_expiry: DATE_RANGE("Passport expiry"),
  visa_expiry: DATE_RANGE("Visa expiry"),
  work_permit_expiry: DATE_RANGE("Work permit expiry"),
};

/** Which tab (0 personal, 1 work, 2 banking) each field lives on, so a mistake can take the person to it. */
export const FIELD_TAB = {
  first_name: 0, last_name: 0, personal_email: 0, phone: 0, date_of_birth: 0, nationality: 0, emergency_contact_name: 0,
  emergency_contact_relation: 0, emergency_contact_phone: 0, current_address: 0, permanent_address: 0, city: 0, state: 0, country: 0, pincode: 0,
  company: 1, business_unit: 1, team: 1,
  bank_name: 2, bank_account: 2, bank_ifsc: 2, uan_number: 2, pf_number: 2, esic_number: 2, pan_number: 2, aadhar_number: 2,
  passport_number: 2, passport_expiry: 2, visa_number: 2, visa_expiry: 2, work_permit_expiry: 2,
};

/** Capital-letter fields are shown in capitals as they are typed. */
export const UPPERCASE_FIELDS = new Set(["pan_number", "bank_ifsc", "passport_number", "visa_number", "pf_number"]);

/** { field: message } for everything wrong with the form (only boxes that have something in them are checked). */
export function validateProfile(f) {
  const errors = {};
  for (const key of ["first_name", "last_name"]) {
    const t = clean(f[key]);
    if (!t) errors[key] = `${key === "first_name" ? "First" : "Last"} name is required.`;
    else if (!/^[A-Za-z][A-Za-z .'-]*$/.test(t)) errors[key] = `${key === "first_name" ? "First" : "Last"} name can contain only letters, spaces and . ' - and must start with a letter.`;
    else if (t.length > 100) errors[key] = `${key === "first_name" ? "First" : "Last"} name can be at most 100 characters.`;
  }
  for (const [key, check] of Object.entries(FORMATS)) {
    if (!clean(f[key])) continue;
    const msg = check(f[key]);
    if (msg) errors[key] = msg;
  }
  for (const [key, check] of Object.entries(DATE_FORMATS)) {
    const msg = check(f[key]);
    if (msg) errors[key] = msg;
  }
  const dob = clean(f.date_of_birth);
  if (dob) {
    const t = Date.parse(dob);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(t)) errors.date_of_birth = "Enter a valid date of birth.";
    else if (t >= Date.now()) errors.date_of_birth = "Date of birth must be in the past.";
    else if (Number(dob.slice(0, 4)) < 1900) errors.date_of_birth = "Enter a valid date of birth.";
    else if (Date.now() - t < 14 * 365 * 86400000) errors.date_of_birth = "An employee must be at least 14 years old.";
  }
  for (const [key, label, max] of [["current_address", "Current address", 500], ["permanent_address", "Permanent address", 500], ["company", "Company", 100], ["business_unit", "Business unit", 100], ["team", "Team", 100], ["city", "City", 100], ["state", "State", 100], ["country", "Country", 100]]) {
    if (clean(f[key]).length > max) errors[key] = `${label} can be at most ${max} characters.`;
  }
  return errors;
}

/** The value as it will be saved: formatted fields cleaned up, an emptied box becomes null so it really clears. */
export function cleanedValue(key, value) {
  const t = clean(value);
  if (!t) return null;
  if (["pan_number", "bank_ifsc", "passport_number", "visa_number"].includes(key)) return compact(t).toUpperCase();
  if (["aadhar_number", "bank_account", "uan_number", "esic_number"].includes(key)) return compact(t);
  if (key === "pf_number") return t.replace(/\s/g, "").toUpperCase();
  if (key === "pincode") return t.replace(/\s/g, "").toUpperCase();
  if (key === "personal_email") return t.toLowerCase();
  return t;
}

/** Only what changed is sent; a changed-to-empty box is sent as null. */
export function changedFields(keys, formData, original) {
  const out = {};
  for (const key of keys) {
    const now = cleanedValue(key, formData[key]);
    const before = cleanedValue(key, original[key]);
    if (now !== before) out[key] = now;
  }
  return out;
}

export function serverProfileErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    const key = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof key !== "string" || key === "body" || out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    out[key] = /^value error,\s*/i.test(msg) ? msg.replace(/^value error,\s*/i, "") : "This value is not valid.";
  }
  return out;
}
