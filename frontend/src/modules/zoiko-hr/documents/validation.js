/**
 * Client-side checks for document forms (docs/new_docs/ZHR-DOCS-ARCH-001 §9.7). They give fast feedback only: the server
 * repeats every check (and runs content pre-checks the browser cannot).
 * Each validator returns an object of field -> message; an empty object means valid.
 */
import { EMPLOYEE_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES } from "./constants";
import { AccessVisibility } from "./types";

const extensionOf = (name) => {
  const n = String(name || "").toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i) : "";
};

/**
 * @param {{ file?: File|{name:string,size:number}|null, requiresExpiry?: boolean, expiryDate?: string, today?: string,
 *           allowedExtensions?: string[] }} input
 */
export function validateUpload({ file, requiresExpiry = false, expiryDate, today, allowedExtensions = EMPLOYEE_UPLOAD_EXTENSIONS }) {
  const errors = {};
  if (!file) {
    errors.file = "Choose a file to upload.";
  } else {
    if (!allowedExtensions.includes(extensionOf(file.name))) {
      errors.file = `This file type is not accepted. Allowed: ${allowedExtensions.map((e) => e.slice(1).toUpperCase()).join(", ")}.`;
    } else if (!file.size) {
      errors.file = "The file is empty.";
    } else if (file.size > MAX_UPLOAD_BYTES) {
      errors.file = `The file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
    }
  }
  const now = today || new Date().toISOString().slice(0, 10);
  if (requiresExpiry && !expiryDate) errors.expiryDate = "Enter the document's expiry date.";
  else if (expiryDate && expiryDate < now) errors.expiryDate = "This document has already expired. Upload a valid one.";
  return errors;
}

/** @param {{ reasonCode?: string, note?: string }} input */
export function validateReject({ reasonCode, note }) {
  const errors = {};
  if (!reasonCode) errors.reasonCode = "Choose a reason.";
  if (!note || note.trim().length < 5) errors.note = "Explain what needs to change (at least 5 characters).";
  return errors;
}

/** @param {import('./types').AccessRule} rule */
export function validateAccessRule(rule) {
  const errors = {};
  if (!rule || !Object.values(AccessVisibility).includes(rule.visibility)) {
    errors.visibility = "Choose who can see this.";
    return errors;
  }
  const needs = {
    [AccessVisibility.DEPARTMENTS]: ["department_ids", "Choose at least one department."],
    [AccessVisibility.ROLES]: ["roles", "Choose at least one role."],
    [AccessVisibility.EMPLOYEES]: ["employee_ids", "Choose at least one employee."],
  }[rule.visibility];
  if (needs && !(rule[needs[0]] || []).length) errors[needs[0]] = needs[1];
  return errors;
}

/** @param {import('./types').LadderStep[]} steps */
export function validateLadder(steps) {
  const errors = {};
  if (!Array.isArray(steps) || steps.length === 0) return { steps: "Add at least one step." };
  if (steps.length > 6) errors.steps = "At most 6 steps.";
  for (let i = 1; i < steps.length; i++) {
    if (!(Number(steps[i].after_days) > Number(steps[i - 1].after_days))) {
      errors.steps = "Each step must come later than the one before it.";
      break;
    }
  }
  return errors;
}

export const isValid = (errors) => Object.keys(errors || {}).length === 0;

const pad = (n) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" / "HH:MM" of a Date in the viewer's own time zone (what <input type="date|time"> show). */
export const localDateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTimeValue = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * The send time of a reminder (QA R1-15) from the dialog's date and time fields, read in the viewer's time zone.
 * Both empty: send now ({ scheduledFor: null }). A date without a time (or the reverse), or a moment that is not in the
 * future, is an error. `scheduledFor` is ISO UTC, ready for the API.
 *
 * @returns {{ scheduledFor: string|null, errors: { schedule?: string } }}
 */
export function reminderSchedule(date, time, now = new Date()) {
  if (!date && !time) return { scheduledFor: null, errors: {} };
  if (!date) return { scheduledFor: null, errors: { schedule: "Choose a date, or clear the time to send now." } };
  if (!time) return { scheduledFor: null, errors: { schedule: "Choose a time, or clear the date to send now." } };
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const when = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  if (Number.isNaN(when.getTime())) return { scheduledFor: null, errors: { schedule: "Enter a valid date and time." } };
  if (when.getTime() <= now.getTime()) return { scheduledFor: null, errors: { schedule: "Choose a time in the future." } };
  return { scheduledFor: when.toISOString(), errors: {} };
}
