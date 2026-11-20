// Checks for the Add / Edit Candidate form. Mirrors backend/app/modules/hr/schemas.py so the person sees the same
// field-level message whether the browser or the server catches the problem.
// QA report #13 (BUG-7…10): name, position and location follow the shared field rules (utils/fieldRules.js = the server's
// app/core/field_rules.py); the phone is checked for its country like everywhere else.
import { fieldProblem } from "./fieldRules";
import { personEmailError } from "./realEmail";

export const CANDIDATE_LABELS = {
  name: "Name", email: "Email", phone: "Phone", position: "Position", location: "Location", source: "Source",
  country: "Country", region: "State / region", city: "City",
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
  else if (fieldProblem("person_full_name", name)) errors.name = fieldProblem("person_full_name", name);

  if (!email) errors.email = "Email is required.";
  else if (!EMAIL.test(email)) errors.email = "Enter a valid email address, for example name@company.com.";
  else if (email.length > 255) errors.email = "Email can be at most 255 characters.";
  else if (personEmailError(email)) errors.email = personEmailError(email);

  if (!position) errors.position = "Position is required.";
  else if (fieldProblem("job_title", position)) errors.position = fieldProblem("job_title", position);

  const phone = fieldProblem("phone", f.phone);
  if (phone) errors.phone = phone;

  const location = fieldProblem("location", f.location);
  if (location) errors.location = location;

  // where the candidate lives: city and state / region are place names (a listed state is picked from the list)
  const city = fieldProblem("place_name", f.city);
  if (city) errors.city = city;
  const region = fieldProblem("place_name", f.region);
  if (region) errors.region = region;

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

const hasPlace = (f) => ["country", "region", "city"].some((k) => String(f?.[k] ?? "").trim() !== "");

/**
 * Splits a free-text location ("Hyderabad, Telangana, India") into city / state / country for the form.
 * countryOf(text) -> ISO code or null (also guesses from a well-known city); isCountryName(part) -> true when the part
 * names a country itself; regionsOf(code) -> the country's listed states (or null).
 */
export function placeFromLocation(location, countryOf, regionsOf, isCountryName = () => false) {
  const parts = String(location || "").split(/[,|]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { country: "", region: "", city: "" };
  const country = countryOf(location) || "";
  const listed = (country && regionsOf(country)) || [];
  const region = listed.find((r) => parts.some((p) => p.toLowerCase() === r.toLowerCase())) || "";
  const city = parts.find((p) => p.toLowerCase() !== region.toLowerCase() && !isCountryName(p)) || "";
  return { country, region, city };
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
    // with a country, state or city the server builds the location text from them ("Hyderabad, Telangana, India")
    ...(hasPlace(f)
      ? { country: f.country || null, region: text(f.region), city: text(f.city) && text(f.city).replace(/\s+/g, " ") }
      : { location: text(f.location) && text(f.location).replace(/\s+/g, " ") }),
    experience: f.experience === "" || f.experience == null ? null : Number(f.experience),
    resume_link: text(f.resume_link),
    notes: text(f.notes),
    requisition_id: f.requisition_id ? Number(f.requisition_id) : null,
  };
}
