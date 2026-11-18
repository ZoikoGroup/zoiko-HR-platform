/**
 * modules/zoiko-hr/recruitment/recruitmentRules.js
 * ------------------------------------------------
 * Form checks shared by Job Requisitions, Candidates, Interviews, Offers and Onboarding › New hires (QA report #13,
 * BUG-1…BUG-28). The free-text rules and their messages come from utils/fieldRules.js, which the server mirrors in
 * app/core/field_rules.py; the number / currency / department messages are the server's (app/modules/hr/schemas.py and
 * recruitment_service.py), word for word. The server is the authority: these only let people see the problem before sending.
 */
import { fieldProblem } from "../../../utils/fieldRules";

export const WHOLE_AMOUNT_MESSAGE = "Enter a whole amount with no decimals, for example 600000.";
export const EQUITY_MESSAGE = "Enter a percentage between 0 and 100, for example 0.25.";
export const CURRENCY_MESSAGE = "Choose a currency from the list.";
export const DEPARTMENT_MESSAGE = "Choose a department from the list.";
export const PAY_AMOUNT_MESSAGE = "Enter an amount greater than 0.";
export const IN_PERSON_LOCATION_MESSAGE = "Enter where the in-person interview takes place.";
export const INTERVIEWER_MESSAGE = "Choose an interviewer, or enter the name of someone outside the system.";
export const BUDGET_ORDER_MESSAGE = "The budget maximum cannot be below the minimum.";
const MAX_BUDGET = 999999999999;

const blank = (v) => v === null || v === undefined || String(v).trim() === "";

/** Budget from / to: whole numbers from 1 to 999,999,999,999; blank is allowed. "" when fine. */
export function wholeAmountProblem(value) {
  if (blank(value)) return "";
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return WHOLE_AMOUNT_MESSAGE;
  const n = Number(text);
  return n >= 1 && n <= MAX_BUDGET ? "" : WHOLE_AMOUNT_MESSAGE;
}

/** Equity: a percentage from 0 to 100 with at most two decimals; blank is allowed. "" when fine. */
export function equityProblem(value) {
  if (blank(value)) return "";
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return EQUITY_MESSAGE;
  const n = Number(text);
  return n >= 0 && n <= 100 ? "" : EQUITY_MESSAGE;
}

/** keydown handler for a number box: the keys that can never be part of a valid value are not typed at all. */
export const blockKeys = (keys) => (e) => {
  if (keys.includes(e.key)) e.preventDefault();
};
export const WHOLE_NUMBER_BLOCKED = [".", ",", "e", "E", "+", "-"];
export const PERCENT_BLOCKED = ["e", "E", "+", "-"];

/** onPaste handler: a pasted value that is not `pattern` is refused (the box keeps what it had). */
export const pasteOnly = (pattern) => (e) => {
  const text = e.clipboardData?.getData("text") ?? "";
  if (!pattern.test(text.trim())) e.preventDefault();
};
export const WHOLE_NUMBER_PASTE = /^\d+$/;
export const PERCENT_PASTE = /^\d+(\.\d{0,2})?$/;

/** A search box's query: trimmed, without control / zero-width characters, at most 100 characters. "" when it has no
 * letter or digit at all (then no request is made and "No matching …" is shown). Typing is never refused. */
export function searchQuery(value) {
  const text = String(value ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return /[\p{L}\p{Nd}]/u.test(text) ? text : "";
}

/** The rule's message for one field ("" when fine); `required` gives `requiredMessage` for a blank value. */
export function ruleProblem(rule, value, { required = false, requiredMessage = "This is required." } = {}) {
  if (blank(value)) return required ? requiredMessage : "";
  return fieldProblem(rule, value);
}

const sameText = (a, b) => String(a ?? "").trim().replace(/\s+/g, " ").toLowerCase() === String(b ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** The department record a requisition's department name stands for (case-insensitive, trimmed), or null. */
export const findDepartment = (departments, name) => (departments || []).find((d) => sameText(d.name, name)) || null;

const LIMITS = { description: 10000, requirements: 10000, openings: 1000 };

/**
 * New / edit requisition. `departments`: [{ id, name }] of the organization's active departments (null while loading);
 * `currencies`: ["INR", "USD", …] (null while loading). Returns { field: message }.
 */
export function validateRequisition(form, filled = 0, { departments = null, currencies = null } = {}) {
  const e = {};
  const put = (key, message) => { if (message) e[key] = message; };
  put("title", ruleProblem("job_title", form.title, { required: true, requiredMessage: "Give the role a title." }));
  if (blank(form.department)) e.department = "Choose the department that is hiring.";
  else if (departments && !findDepartment(departments, form.department)) e.department = DEPARTMENT_MESSAGE;
  put("location", ruleProblem("location", form.location));
  const openings = Number(form.openings);
  if (form.openings === "" || !Number.isInteger(openings) || openings < 1) e.openings = "Openings must be a whole number of at least 1.";
  else if (openings > LIMITS.openings) e.openings = `At most ${LIMITS.openings} openings per requisition.`;
  else if (filled && openings < filled) e.openings = `${filled} position${filled === 1 ? " is" : "s are"} already filled, so openings cannot go below ${filled}.`;
  put("budget_min", wholeAmountProblem(form.budget_min));
  put("budget_max", wholeAmountProblem(form.budget_max));
  if (!e.budget_min && !e.budget_max && !blank(form.budget_min) && !blank(form.budget_max) && Number(form.budget_min) > Number(form.budget_max)) {
    e.budget_max = BUDGET_ORDER_MESSAGE;
  }
  const currency = String(form.currency ?? "").trim().toUpperCase();
  if (currency && currencies && !currencies.includes(currency)) e.currency = CURRENCY_MESSAGE;
  else if (!currency && (!blank(form.budget_min) || !blank(form.budget_max))) e.currency = "Choose the budget's currency.";
  if ((form.description || "").length > LIMITS.description) e.description = `Keep the description within ${LIMITS.description.toLocaleString()} characters.`;
  if ((form.requirements || "").length > LIMITS.requirements) e.requirements = `Keep the requirements within ${LIMITS.requirements.toLocaleString()} characters.`;
  return e;
}

/** New / edit offer (BUG-18…23). Returns { field: message }. */
export function validateOfferForm(form) {
  const e = {};
  const put = (key, message) => { if (message) e[key] = message; };
  put("candidate_name", ruleProblem("person_full_name", form.candidate_name, { required: true, requiredMessage: "Candidate name is required." }));
  put("position", ruleProblem("job_title", form.position, { required: true, requiredMessage: "Position title is required." }));
  put("work_location", ruleProblem("location", form.work_location));
  put("work_pattern", ruleProblem("work_pattern", form.work_pattern));
  const amount = form.pay?.amount;
  if (amount !== "" && amount != null) {
    const n = Number(amount);
    if (Number.isNaN(n) || n < 0) e.salary = "Enter a valid amount.";
    else if (n <= 0 && ["salary", "stipend"].includes(form.pay?.remuneration_type)) e.salary = PAY_AMOUNT_MESSAGE;
  }
  if (form.employment_type !== "internship") put("equity", equityProblem(form.equity));
  return e;
}

/** FastAPI's 422 list on an api.js error -> { field: message } for the fields a form has (the "Value error, " prefix dropped). */
export function serverFieldErrors(err, fields) {
  const out = {};
  for (const v of Array.isArray(err?.validation) ? err.validation : []) {
    const field = [...(v?.loc || [])].reverse().find((p) => fields.includes(p));
    if (field && !out[field]) out[field] = String(v.msg || "").replace(/^Value error,\s*/i, "");
  }
  const named = err?.detail?.field;
  if (named && fields.includes(named) && !out[named]) out[named] = err.detail.message || err.message;
  return out;
}
