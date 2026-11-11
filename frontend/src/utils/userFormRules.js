/**
 * utils/userFormRules.js
 * ----------------------
 * Add User / Edit User (B16–B38): which shared rule (utils/fieldRules.js) each field follows, which fields are required, and
 * "only what changed" for edits, so an older record whose stored values predate the rules can still be saved. The server applies
 * the same map (app/core/field_rules.py EMPLOYEE_FIELDS).
 */
import { fieldProblem } from "./fieldRules";

export const USER_FIELD_RULES = {
  first_name: "person_name", last_name: "person_name",
  email: "email", work_email: "email", personal_email: "email",
  phone: "phone",
  job_title: "job_title",
  department_name: "org_unit", designation_name: "org_unit", business_unit: "org_unit", division: "org_unit", team: "org_unit",
  company: "org_name",
  current_address: "address", permanent_address: "address",
  city: "place_name", state: "state", country: "country", pincode: "postal_code",
  pan_number: "tax_id_person", uan_number: "social_payroll_ref", bank_account: "bank_account", bank_ifsc: "bank_routing",
};

export const ADD_REQUIRED = {
  first_name: "First name is required.", last_name: "Last name is required.", email: "Email is required.",
  role: "Role is required.", job_title: "Job title is required.", date_of_joining: "Date of joining is required.",
};
export const EDIT_REQUIRED = { first_name: "First name is required.", last_name: "Last name is required." };

/** The message for one field ("" when fine). Country-driven fields use the form's country. */
export function userFieldProblem(name, form, required = {}) {
  const value = form[name];
  if (String(value ?? "").trim() === "") return required[name] || "";
  const rule = USER_FIELD_RULES[name];
  return rule ? fieldProblem(rule, value, { country: form.country }) : "";
}

/** { field: message } for the whole form; `only` (a Set) limits the check to those fields. */
export function validateUserForm(form, { required = ADD_REQUIRED, only } = {}) {
  const errors = {};
  const names = new Set([...Object.keys(USER_FIELD_RULES), ...Object.keys(required)]);
  for (const name of names) {
    if (only && !only.has(name)) continue;
    const message = userFieldProblem(name, form, required);
    if (message) errors[name] = message;
  }
  return errors;
}

const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** The fields whose value differs from what was loaded. A changed country re-checks everything that depends on it. */
export function changedFields(form, initial) {
  const changed = new Set(Object.keys(form).filter((k) => norm(form[k]) !== norm(initial?.[k])));
  if (changed.has("country")) {
    for (const k of ["state", "pincode", "phone", "pan_number", "uan_number", "bank_account", "bank_ifsc"]) if (String(form[k] ?? "").trim()) changed.add(k);
  }
  return changed;
}

/** The field the form should focus first: the order the fields appear in on screen. */
export function firstInvalid(sections, errors) {
  for (const section of sections) for (const f of section.fields) if (errors[f.name]) return f.name;
  return null;
}
