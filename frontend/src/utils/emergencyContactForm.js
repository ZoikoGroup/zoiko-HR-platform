// Emergency contacts: the same rules as backend/app/core/identity_formats.emergency_contacts, so the message is the same
// whether the browser or the server catches the problem.
import { phoneError } from "./phone";

export const MAX_CONTACTS = 5;
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const digits = (v) => String(v ?? "").replace(/\D/g, "").slice(-10);
const NAME = /^[A-Za-z][A-Za-z .'-]*$/;

/** Field messages for one contact being added or edited. `others` are the contacts already on the list (not the one being edited). */
export function validateContact(c, others = []) {
  const e = {};
  const name = clean(c.name);
  if (!name) e.name = "Name is required.";
  else if (!NAME.test(name)) e.name = "Name can contain only letters, spaces and . ' - and must start with a letter.";
  else if (name.length > 100) e.name = "Name can be at most 100 characters.";
  if (!clean(c.relationship)) e.relationship = "Choose a relationship.";
  if (!clean(c.primaryPhone)) e.primaryPhone = "Primary phone is required.";
  else if (phoneError(c.primaryPhone)) e.primaryPhone = phoneError(c.primaryPhone);
  if (clean(c.alternatePhone) && phoneError(c.alternatePhone)) e.alternatePhone = phoneError(c.alternatePhone);
  if (!clean(c.address)) e.address = "Home address is required.";
  else if (clean(c.address).length > 500) e.address = "Address can be at most 500 characters.";

  if (!e.primaryPhone && !e.alternatePhone && clean(c.alternatePhone) && digits(c.alternatePhone) === digits(c.primaryPhone)) {
    e.alternatePhone = "The alternate phone cannot be the same as the primary phone.";
  }
  if (!e.name && !e.relationship) {
    const dup = others.find((o) => clean(o.name).toLowerCase() === name.toLowerCase() && clean(o.relationship).toLowerCase() === clean(c.relationship).toLowerCase());
    if (dup) e.name = `${name} (${clean(c.relationship)}) is already in your emergency contacts.`;
  }
  for (const key of ["primaryPhone", "alternatePhone"]) {
    if (e[key] || !clean(c[key])) continue;
    const owner = others.find((o) => digits(o.primaryPhone) === digits(c[key]) || (clean(o.alternatePhone) && digits(o.alternatePhone) === digits(c[key])));
    if (owner) e[key] = `This number is already used for ${owner.name}. Each emergency contact needs their own number.`;
  }
  return e;
}

/** The contact as it is sent: trimmed text. */
export function cleanContact(c) {
  return { ...c, name: clean(c.name), relationship: clean(c.relationship), primaryPhone: clean(c.primaryPhone), alternatePhone: clean(c.alternatePhone), address: clean(c.address) };
}

/** Turns a server refusal on `emergency_contacts` into a message for the page. */
export function serverContactError(err) {
  const item = Array.isArray(err?.validation) ? err.validation.find((d) => Array.isArray(d.loc) && d.loc.includes("emergency_contacts")) : null;
  const msg = item?.msg;
  return typeof msg === "string" && /^value error,\s*/i.test(msg) ? msg.replace(/^value error,\s*/i, "") : null;
}
