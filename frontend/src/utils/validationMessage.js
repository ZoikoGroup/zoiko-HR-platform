/**
 * utils/validationMessage.js
 * --------------------------
 * Turns a FastAPI/Pydantic 422 error object into one line a user can act on.
 *
 * Pydantic's `msg` strings are written for developers, and they used to reach
 * the UI verbatim — a plan form with a blank price box rendered "Input should be
 * a valid number, unable to parse string as a number". This module rewrites the
 * handful of messages ordinary input can trigger, labels plan fields by their
 * on-screen names, and falls back to an honest generic line instead of leaking
 * framework jargon.
 *
 * Kept free of import.meta.env / DOM access so it can be unit tested directly.
 */

// Pydantic 422 `msg` strings we can reach from normal user input.
const VALIDATION_MSG_REWRITES = [
  [/^Field required$/i, "is required"],
  [/^Input should be a valid number, unable to parse string as a number$/i, "must be a number"],
  [/^Input should be a valid number$/i, "must be a number"],
  [/^Input should be a valid string$/i, "must be text"],
  [/^Input should be a valid boolean$/i, "must be true or false"],
  [/^Input should be ('.+')$/i, "must be $1"],
  [/^Input should be less than or equal to (\S+)$/i, "must be $1 or less"],
  [/^Input should be greater than or equal to (\S+)$/i, "must be $1 or greater"],
  [/^ensure this value is less than or equal to (\S+)$/i, "must be $1 or less"],
  [/^ensure this value is greater than or equal to (\S+)$/i, "must be $1 or greater"],
];

// Screen labels for fields whose API name is not user-facing.
const FIELD_LABELS = {
  monthly_price: "Monthly Price",
  annual_price: "Annual Price",
  catalog_version: "Catalog Version",
  billing_metric: "Billing Metric",
  is_contract_priced: "Contract Priced",
};

export function humanizeValidationError(err) {
  const rawField = err?.loc ? err.loc[err.loc.length - 1] : "Field";
  const label = FIELD_LABELS[rawField] || rawField;
  let msg = typeof err?.msg === "string" ? err.msg : "";

  for (const [pattern, replacement] of VALIDATION_MSG_REWRITES) {
    msg = msg.replace(pattern, replacement);
  }
  msg = msg.replace(/^Value error,\s*/, "").replace(/^Input\s+/i, "");

  if (!msg) return `${label} has an invalid value`;
  if (/^is invalid$/i.test(msg)) return `${label} has an invalid value`;
  if (/^(must be|should be|is required|is not|cannot be|can not be|has )/.test(msg)) {
    return `${label} ${msg}`;
  }
  return `${label}: ${msg}`;
}

export default humanizeValidationError;
