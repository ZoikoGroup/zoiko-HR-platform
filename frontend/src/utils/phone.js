// Phone rule shared by the user forms (mirrors backend/app/core/phone.py): the 10-digit national number,
// optionally preceded by a country code. Spaces, hyphens, dots and brackets are allowed as separators.
export const PHONE_ERROR = "Enter a valid 10-digit phone number, optionally with a country code (for example +91 9876543210).";
// Longest thing a person could legitimately type: +NNN, 10 digits and a few separators.
export const PHONE_MAX_LENGTH = 20;

/** "" when the value is blank or valid, otherwise the message to show under the field. */
export function phoneError(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const compact = text.replace(/[\s\-().]/g, "");
  return /^(\+\d{1,3})?\d{10}$/.test(compact) ? "" : PHONE_ERROR;
}
