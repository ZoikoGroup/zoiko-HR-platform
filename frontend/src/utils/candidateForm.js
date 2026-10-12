// Checks for the Add / Edit Candidate form. Mirrors backend/app/modules/hr/schemas.py so the person sees the same
// field-level message whether the browser or the server catches the problem.
import { phoneError } from "./phone";

export const CANDIDATE_LABELS = {
  name: "Name", email: "Email", phone: "Phone", position: "Position", location: "Location", source: "Source",
  experience: "Experience", resume_link: "Resume link", notes: "Notes", requisition_id: "Job requisition", status: "Status",
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const LINK = /^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i;

/** Returns { field: message } for everything wrong with the form; empty when it can be saved. */
export function validateCandidateForm(f) {
  const errors = {};
  const name = String(f.name ?? "").trim();
  const email = String(f.email ?? "").trim();
  const position = String(f.position ?? "").trim();

  if (!name) errors.name = "Name is required.";
  else if (name.length > 150) errors.name = "Name can be at most 150 characters.";

  if (!email) errors.email = "Email is required.";
  else if (!EMAIL.test(email)) errors.email = "Enter a valid email address, for example name@company.com.";
  else if (email.length > 255) errors.email = "Email can be at most 255 characters.";

  if (!position) errors.position = "Position is required.";
  else if (position.length > 150) errors.position = "Position can be at most 150 characters.";

  const phone = phoneError(f.phone);
  if (phone) errors.phone = phone;

  if (String(f.location ?? "").trim().length > 150) errors.location = "Location can be at most 150 characters.";

  if (f.experience !== "" && f.experience != null) {
    const n = Number(f.experience);
    if (!Number.isFinite(n) || !Number.isInteger(n)) errors.experience = "Experience must be a whole number of years.";
    else if (n < 0 || n > 60) errors.experience = "Experience must be between 0 and 60 years.";
  }

  const link = String(f.resume_link ?? "").trim();
  if (link && !LINK.test(link)) errors.resume_link = "Enter a valid link starting with http:// or https://.";

  if (String(f.notes ?? "").length > 5000) errors.notes = "Notes can be at most 5000 characters.";
  return errors;
}

/**
 * The server's own refusal, as { field: message }. Pydantic's technical words ("Field required", "Value error, ...")
 * are rewritten; messages the server wrote for people are kept as they are.
 */
export function serverFieldErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof field !== "string" || out[field]) continue;
    const label = CANDIDATE_LABELS[field] || field;
    let msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^Field required$/i.test(msg)) msg = `${label} is required.`;
    else if (/^value error,\s*/i.test(msg)) msg = msg.replace(/^value error,\s*/i, "");
    else if (/valid integer|valid number/i.test(msg)) msg = `${label} must be a number.`;
    else if (/less than or equal to (\S+)/i.test(msg)) msg = `${label} must be ${msg.match(/less than or equal to (\S+)/i)[1]} or less.`;
    else if (/greater than or equal to (\S+)/i.test(msg)) msg = `${label} must be ${msg.match(/greater than or equal to (\S+)/i)[1]} or more.`;
    else if (/at most (\d+) characters/i.test(msg)) msg = `${label} can be at most ${msg.match(/at most (\d+) characters/i)[1]} characters.`;
    else msg = `${label} is not valid.`;
    out[field] = msg;
  }
  return out;
}

/** The payload to send: trimmed text, a whole-number experience, empty optional fields left out as null. */
export function candidatePayload(f) {
  const text = (v) => { const t = String(v ?? "").trim(); return t === "" ? null : t; };
  return {
    name: String(f.name).trim().replace(/\s+/g, " "),
    email: String(f.email).trim(),
    position: String(f.position).trim().replace(/\s+/g, " "),
    phone: text(f.phone),
    status: f.status,
    source: text(f.source),
    location: text(f.location),
    experience: f.experience === "" || f.experience == null ? null : Number(f.experience),
    resume_link: text(f.resume_link),
    notes: text(f.notes),
    requisition_id: f.requisition_id ? Number(f.requisition_id) : null,
  };
}
