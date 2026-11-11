/**
 * utils/fieldRules.js
 * -------------------
 * One rule set per kind of field (QA reports of 6 and 10 Nov 2026: B7–B13, B16–B38). The server has the same rules with the
 * same messages in backend/app/core/field_rules.py; both are tested against backend/tests/fixtures/field_rules_cases.json.
 * The country / region / industry / postal / statutory tables come from fieldRulesData.js, generated from the server's tables.
 *
 *   fieldProblem(rule, value, { country, idKey })   -> the message, or "" when the value is fine (or blank)
 *   cleanField(rule, value, { country })            -> the normalised value ("" for blank); throws Error(message)
 *
 * Required-ness is the caller's business: a blank value is never an error here. The rules are field-appropriate, not "letters
 * only" everywhere: 3M, AT&T, Engineer II, C++ Developer, O'Brien, José, 王伟, अनिल and "12 MG Road" are all accepted.
 */
import { parsePhoneNumberFromString, getCountryCallingCode } from "libphonenumber-js/max";
import { realEmailError } from "./realEmail";
import {
  COUNTRIES, COUNTRY_ALIASES, REGIONS, STATE_CODES, BUSINESS_IDS, DEFAULT_BUSINESS_IDS, EU_VAT, INDUSTRIES, POSTAL, IBAN_COUNTRIES, IBAN_LENGTHS, STATUTORY, GENERIC_STATUTORY,
} from "./fieldRulesData";

export { INDUSTRIES };

export const MESSAGES = {
  person_name: "Use letters only. Spaces, hyphens (-), apostrophes (') and full stops are allowed.",
  org_name: "Use letters, numbers, spaces and & . , ' - ( ) / only. Include at least one letter.",
  org_unit: "Use letters, numbers, spaces and & - / , . ( ) only. Include at least one letter.",
  job_title: "Use letters, numbers, spaces and & - / , . ( ) + # only. Include at least one letter.",
  industry: "Select an industry.",
  place_name: "Use letters only. Spaces, hyphens, apostrophes and full stops are allowed.",
  country: "Select a country.",
  state: "Select a state/region.",
  address: "Enter a full address (for example: 12 MG Road, Indiranagar). Only letters, numbers and , . - / # ' ( ) : are allowed.",
  email: "Enter a valid email address, for example name@company.com.",
  email_no_mail: "This email domain can't receive email. Check the address.",
  country_first: "Select the employee's country first so this number can be checked.",
};

export const LENGTHS = {
  person_name: [1, 50], person_full_name: [2, 100], org_name: [2, 150], org_unit: [2, 100], job_title: [2, 100],
  place_name: [2, 80], address: [5, 250], industry_other: [2, 100],
};

export const lengthMessage = (rule) => `Use ${LENGTHS[rule][0]} to ${LENGTHS[rule][1]} characters.`;

export class FieldRuleError extends Error {}

// ── character classes ───────────────────────────────────────────────────────────────────────────────────────────────
const isLetter = (ch) => /^\p{L}$/u.test(ch);
const isMark = (ch) => /^\p{M}$/u.test(ch);
const isDigit = (ch) => /^\p{Nd}$/u.test(ch);
const chars = (text) => Array.from(text);           // code points, so emoji and astral letters count as one character

function tidy(value, multiline = false) {
  const text = String(value).replace(/\r\n?/g, "\n");
  if (multiline) return text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
  return text.split(/\s+/).filter(Boolean).join(" ");
}

function repeatedSymbols(text) {
  let run = 0;
  let last = "";
  for (const ch of chars(text)) {
    if (ch === last && !(isLetter(ch) || isDigit(ch) || /\s/.test(ch))) {
      run += 1;
      if (run >= 3) return true;
    } else {
      run = 1;
      last = ch;
    }
  }
  return false;
}

function textRule(text, { allowed, digits, startLetter, endOk, startOk = "", newline = false }) {
  const list = chars(text);
  for (const ch of list) {
    if (isLetter(ch) || isMark(ch) || ch === " " || allowed.includes(ch)) continue;
    if (digits && isDigit(ch)) continue;
    if (newline && ch === "\n") continue;
    return false;
  }
  if (!list.some(isLetter)) return false;
  const first = list[0];
  const last = list[list.length - 1];
  if (startLetter && !isLetter(first)) return false;
  if (!(isLetter(first) || (digits && isDigit(first)) || startOk.includes(first))) return false;
  if (!(isLetter(last) || isMark(last) || (digits && isDigit(last)) || endOk.includes(last))) return false;
  return !repeatedSymbols(text);
}

function freeText(rule, value) {
  const text = tidy(value, rule === "address");
  const [lo, hi] = LENGTHS[rule];
  let ok;
  if (rule === "person_name" || rule === "person_full_name" || rule === "place_name") {
    ok = textRule(text, { allowed: "'’-.", digits: false, startLetter: true, endOk: "." });
  } else if (rule === "org_name") {
    ok = textRule(text, { allowed: "&.,'’-()/", digits: true, startLetter: false, endOk: ")." });
  } else if (rule === "org_unit" || rule === "industry_other") {
    ok = textRule(text, { allowed: "&-/,.()", digits: true, startLetter: false, endOk: ")." });
  } else if (rule === "job_title") {
    ok = textRule(text, { allowed: "&-/,.()+#", digits: true, startLetter: false, endOk: ").+#" });
  } else if (rule === "address") {
    ok = textRule(text, { allowed: ",.-/#'’():", digits: true, startLetter: false, endOk: ").", startOk: "#", newline: true });
    if (ok) {
      const words = text.split(/[\s,]+/).filter(Boolean);
      ok = chars(text).some(isDigit) || words.filter((w) => chars(w).some(isLetter)).length >= 2;
    }
  } else {
    throw new Error(`unknown rule ${rule}`);
  }
  if (!ok) {
    const key = rule === "person_full_name" ? "person_name" : rule === "industry_other" ? "org_unit" : rule;
    throw new FieldRuleError(MESSAGES[key]);
  }
  const length = chars(text).length;
  if (length < lo || length > hi) throw new FieldRuleError(lengthMessage(rule));
  return text;
}

// ── industry ────────────────────────────────────────────────────────────────────────────────────────────────────────
function industry(value) {
  const text = tidy(value);
  const hit = INDUSTRIES.find((i) => i.toLowerCase() === text.toLowerCase());
  if (hit) return hit;
  if (text.toLowerCase().startsWith("other:")) return `Other: ${freeText("industry_other", text.split(":").slice(1).join(":"))}`;
  throw new FieldRuleError(MESSAGES.industry);
}

// ── country / state ─────────────────────────────────────────────────────────────────────────────────────────────────
const BY_CODE = Object.fromEntries(COUNTRIES.map(([c, n]) => [c, n]));
const BY_NAME = Object.fromEntries(COUNTRIES.map(([c, n]) => [n.toLowerCase(), c]));

/** "IN" for "India", "in", "Bharat"; null when it is not a country (strict: no guessing from free text). */
export function countryIso(value) {
  const t = String(value ?? "").trim().replace(/^\.+|\.+$/g, "").toLowerCase();
  if (!t) return null;
  if (t.length === 2 && BY_CODE[t.toUpperCase()]) return t.toUpperCase();
  return BY_NAME[t] || COUNTRY_ALIASES[t] || COUNTRY_ALIASES[`${t}.`] || null;
}

export const countryName = (iso) => (iso && BY_CODE[iso]) || null;

/** [{ code, name }] for a country dropdown (the server's list, alphabetical). */
export const COUNTRY_CHOICES = COUNTRIES.map(([code, name]) => ({ code, name }));

/** The fixed region list for a country (India's states, US states, …) or null when it is typed freely. */
export const regionsFor = (country) => REGIONS[countryIso(country) || ""] || null;

function state(value, country) {
  const text = tidy(value);
  const list = regionsFor(country);
  if (list) {
    const byCode = (STATE_CODES[countryIso(country)] || {})[text.toUpperCase().replace(/\./g, "")];
    if (byCode) return byCode;
    const hit = list.find((r) => r.toLowerCase() === text.toLowerCase());
    if (!hit) throw new FieldRuleError(MESSAGES.state);
    return hit;
  }
  return freeText("place_name", text);
}

// ── email ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function email(value) {
  const text = String(value).trim();
  if (text.length > 254 || !EMAIL.test(text) || text.split("@")[0].length > 64) throw new FieldRuleError(MESSAGES.email);
  const at = text.lastIndexOf("@");
  const normalised = `${text.slice(0, at)}@${text.slice(at + 1).toLowerCase()}`;
  const placeholder = realEmailError(normalised);          // placeholder / disposable domains (same words as the server)
  if (placeholder) throw new FieldRuleError(placeholder);
  return normalised;
}

// ── phone ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export const DEFAULT_PHONE_REGION = "IN";
export const phoneMessage = (iso) => `Enter a valid phone number for ${countryName(iso) || "the selected country"}.`;

function phone(value, country) {
  const text = String(value).trim();
  const iso = countryIso(country) || DEFAULT_PHONE_REGION;
  if (!/^[0-9 +\-()]+$/.test(text) || (text.match(/\+/g) || []).length > 1 || (text.includes("+") && !text.startsWith("+"))) {
    throw new FieldRuleError(phoneMessage(iso));
  }
  const parsed = parsePhoneNumberFromString(text, text.startsWith("+") ? undefined : iso);
  if (!parsed) throw new FieldRuleError(phoneMessage(iso));
  if (!parsed.isValid()) throw new FieldRuleError(phoneMessage(text.startsWith("+") ? (parsed.country || iso) : iso));
  return parsed.number;                                   // E.164
}

/** Digits, spaces and + - ( ) only: what a phone box lets through while typing. */
export const phoneInputFilter = (value) => String(value ?? "").replace(/[^0-9 +\-()]/g, "");

/** Calling code for a country's dropdown ("+91"), or "" when unknown. */
export function callingCode(country) {
  const iso = countryIso(country);
  if (!iso) return "";
  try {
    return `+${getCountryCallingCode(iso)}`;
  } catch {
    return "";
  }
}

// ── postal code ─────────────────────────────────────────────────────────────────────────────────────────────────────
const POSTAL_GENERIC = /^[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$/;

export function postalMessage(iso) {
  const example = (POSTAL[iso || ""] || [null, "560001"])[1];
  return `Enter a valid postal code for ${countryName(iso) || "the selected country"} (for example ${example}).`;
}

export const postalExample = (country) => (POSTAL[countryIso(country) || ""] || [null, "560001"])[1];

function postal(value, country) {
  const iso = countryIso(country);
  const text = String(value).trim().toUpperCase().split(/\s+/).join(" ");
  const pattern = POSTAL[iso || ""] ? new RegExp(POSTAL[iso][0]) : POSTAL_GENERIC;
  if (!pattern.test(text)) throw new FieldRuleError(postalMessage(iso));
  return text;
}

// ── organization registration / tax number (per country and ID type, with check digits: app/core/business_ids.py) ──────
/** The ID types for a country ([{ key, label, placeholder, pattern, hint, checksum }]), the first is the default. */
export const businessIdTypes = (country) => BUSINESS_IDS[countryIso(country) || ""] || DEFAULT_BUSINESS_IDS;
export const businessIdType = (country, key) => {
  const ids = businessIdTypes(country);
  return ids.find((i) => i.key === key) || ids[0];
};

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHECKSUMS = {
  gstin: (v) => {
    let total = 0;
    for (let i = 0; i < 14; i++) {
      const product = ALNUM.indexOf(v[i]) * (i % 2 ? 2 : 1);
      total += Math.floor(product / 36) + (product % 36);
    }
    return ALNUM[(36 - (total % 36)) % 36] === v[14];
  },
  abn: (v) => {
    const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    const digits = Array.from(v, Number);
    digits[0] -= 1;
    return digits.reduce((sum, d, i) => sum + d * weights[i], 0) % 89 === 0;
  },
  acn: (v) => {
    const total = [8, 7, 6, 5, 4, 3, 2, 1].reduce((sum, w, i) => sum + Number(v[i]) * w, 0);
    return (10 - (total % 10)) % 10 === Number(v[8]);
  },
};

export const cleanBusinessId = (value) => String(value ?? "").replace(/[\s.\-/]/g, "").toUpperCase();

function orgRegistration(value, country, idKey) {
  const iso = countryIso(country);
  const t = businessIdType(iso, idKey);
  const cleaned = cleanBusinessId(value);
  let v = cleaned;
  if (t.key === "vat" && iso && EU_VAT.includes(iso)) {
    const prefix = iso === "GR" ? "EL" : iso;
    if (v.startsWith(prefix)) v = v.slice(prefix.length);
  }
  if (!new RegExp(t.pattern).test(v)) throw new FieldRuleError(`That doesn't look like a valid ${t.label}. ${t.hint}`);
  const check = CHECKSUMS[t.checksum || ""];
  if (check && !check(v)) throw new FieldRuleError(`That ${t.label} fails its check digit. Please re-check the number.`);
  return cleaned;
}

// ── statutory (labels follow the employee's country) ─────────────────────────────────────────────────────────────────
/** [label, example] for pan_number / uan_number / bank_account / bank_ifsc in this country. */
export function statutoryLabel(field, country) {
  const iso = countryIso(country);
  const row = (iso && STATUTORY[iso]) || null;
  return row ? row[field] : GENERIC_STATUTORY[field];
}

export function ibanOk(text) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(text)) return false;
  const expected = IBAN_LENGTHS[text.slice(0, 2)];
  if (expected && text.length !== expected) return false;
  const rearranged = text.slice(4) + text.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export function abaOk(text) {
  if (!/^\d{9}$/.test(text)) return false;
  const d = Array.from(text, Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

function ssnOk(digits) {
  const area = digits.slice(0, 3);
  const group = digits.slice(3, 5);
  const serial = digits.slice(5);
  if (area === "000" || area === "666" || group === "00" || serial === "0000") return false;
  if (area.startsWith("9")) {
    const g = Number(group);
    return (g >= 50 && g <= 65) || (g >= 70 && g <= 88) || (g >= 90 && g <= 92) || (g >= 94 && g <= 99);
  }
  return true;
}

const STATUTORY_FIELD = { tax_id_person: "pan_number", social_payroll_ref: "uan_number", bank_account: "bank_account", bank_routing: "bank_ifsc" };

function statutory(rule, value, country, label) {
  const iso = countryIso(country);
  if (!iso) throw new FieldRuleError(MESSAGES.country_first);
  const [name, example] = statutoryLabel(STATUTORY_FIELD[rule], iso);
  const raw = String(value).trim().toUpperCase();
  const compact = raw.replace(/[\s-]/g, "");
  let bad = `Enter a valid ${label || name}${example ? ` (for example ${example}).` : "."}`;
  let ok;
  if (rule === "tax_id_person") {
    if (iso === "IN") ok = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(compact);
    else if (iso === "US") ok = /^\d{3}-?\d{2}-?\d{4}$/.test(raw.replace(/ /g, "")) && ssnOk(compact);
    else if (iso === "GB") ok = /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/.test(compact);
    else ok = /^[A-Z0-9]{4,20}$/.test(compact);
    if (!ok) throw new FieldRuleError(bad);
    return compact;
  }
  if (rule === "social_payroll_ref") {
    let result = compact;
    if (iso === "IN") ok = /^\d{12}$/.test(compact);
    else {
      result = raw.replace(/ /g, "");
      ok = /^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/.test(result);
    }
    if (!ok) throw new FieldRuleError(bad);
    return result;
  }
  if (rule === "bank_account") {
    if (IBAN_COUNTRIES.includes(iso)) {
      ok = ibanOk(compact);
      bad = `Enter a valid IBAN (for example ${example || "DE89 3704 0044 0532 0130 00"}).`;
    } else if (iso === "IN") {
      ok = /^\d{9,18}$/.test(compact);
      bad = "Enter a valid bank account number (digits only, 9–18 for India).";
    } else if (iso === "US") {
      ok = /^\d{4,17}$/.test(compact);
      bad = "Enter a valid bank account number (digits only, 4–17 for the United States).";
    } else {
      ok = /^\d{6,20}$/.test(compact);
      bad = "Enter a valid bank account number (digits only, 6–20).";
    }
    if (ok && !IBAN_COUNTRIES.includes(iso) && new Set(compact).size === 1) ok = false;
    if (!ok) throw new FieldRuleError(bad);
    return compact;
  }
  // bank_routing
  const swift = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
  if (iso === "IN") ok = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(compact);
  else if (iso === "US") ok = abaOk(compact);
  else if (iso === "GB" || iso === "AU") ok = /^\d{6}$/.test(compact);
  else if (IBAN_COUNTRIES.includes(iso)) ok = swift.test(compact);
  else ok = swift.test(compact) || /^\d{3,12}$/.test(compact);
  if (!ok) throw new FieldRuleError(bad);
  return compact;
}

/** Does this country use IBANs for bank accounts? */
export const isIbanCountry = (country) => IBAN_COUNTRIES.includes(countryIso(country) || "");

/** Characters that can never be valid while typing a bank account in this country (digits only outside IBAN countries). */
export function bankAccountInputFilter(value, country) {
  const iso = countryIso(country);
  if (iso && IBAN_COUNTRIES.includes(iso)) return String(value ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  return String(value ?? "").replace(/[^0-9 ]/g, "");
}

// ── the API ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const FREE_TEXT = ["person_name", "person_full_name", "org_name", "org_unit", "job_title", "place_name", "address"];
export const RULES = [...FREE_TEXT, "industry", "country", "state", "email", "phone", "postal_code", "org_registration",
  "tax_id_person", "social_payroll_ref", "bank_account", "bank_routing"];

export function cleanField(rule, value, { country, label, idKey } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  if (FREE_TEXT.includes(rule)) return freeText(rule, value);
  switch (rule) {
    case "industry": return industry(value);
    case "country": {
      const iso = countryIso(value);
      if (!iso) throw new FieldRuleError(MESSAGES.country);
      return countryName(iso);
    }
    case "state": return state(value, country);
    case "email": return email(value);
    case "phone": return phone(value, country);
    case "postal_code": return postal(value, country);
    case "org_registration": return orgRegistration(value, country, idKey);
    case "tax_id_person":
    case "social_payroll_ref":
    case "bank_account":
    case "bank_routing": return statutory(rule, value, country, label);
    default: throw new Error(`unknown rule ${rule}`);
  }
}

export function fieldProblem(rule, value, options = {}) {
  try {
    cleanField(rule, value, options);
    return "";
  } catch (e) {
    if (e instanceof FieldRuleError) return e.message;
    throw e;
  }
}

/** { field: message } for a form: `spec` is { field: rule } (or { field: [rule, { country, label, required, requiredMessage }] }).
 *  `only` (a Set of field names) limits the check, e.g. to the fields an edit actually changed. */
export function validateFields(form, spec, { only } = {}) {
  const errors = {};
  for (const [field, entry] of Object.entries(spec)) {
    if (only && !only.has(field)) continue;
    const [rule, opts = {}] = Array.isArray(entry) ? entry : [entry, {}];
    const value = form[field];
    if (opts.required && String(value ?? "").trim() === "") {
      errors[field] = opts.requiredMessage || "This is required.";
      continue;
    }
    const message = fieldProblem(rule, value, opts);
    if (message) errors[field] = message;
  }
  return errors;
}
