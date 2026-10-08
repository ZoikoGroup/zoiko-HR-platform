// Employee expense claim: the same rules as hr/schemas.TravelExpenseCreateSimple, so the message is the same whether
// the browser or the server catches the problem.

export const EXPENSE_CATEGORIES = ["Hotel", "Flight", "Cab", "Meals", "Transport", "Other"];
export const MAX_EXPENSE_AMOUNT = 10000000;

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");

/** { field: message } for everything wrong with the claim. Fields: category, amount, description. */
export function validateExpenseForm(form) {
  const e = {};
  if (!EXPENSE_CATEGORIES.includes(form.category)) e.category = "Choose a category from the list.";

  const raw = String(form.amount ?? "").trim();
  if (!raw) e.amount = "Enter the amount.";
  else if (!/^\d+(\.\d+)?$/.test(raw)) e.amount = "Enter the amount as a number.";
  else if (Number(raw) <= 0) e.amount = "The amount must be more than zero.";
  else if (Number(raw) > MAX_EXPENSE_AMOUNT) e.amount = "The amount is too large. Contact HR for claims above 1,00,00,000.";
  else if (!/^\d+(\.\d{1,2})?$/.test(raw)) e.amount = "The amount can have at most 2 decimal places.";

  const description = clean(form.description);
  if (description.length < 3) e.description = "Describe what the expense was for (at least 3 characters).";
  else if (description.length > 500) e.description = "The description can be at most 500 characters.";
  return e;
}

/** The body the server expects. */
export function expensePayload(form) {
  const body = { expense_type: form.category, amount: String(form.amount).trim(), description: clean(form.description), currency: "INR" };
  if (form.tripId) body.request_id = Number(form.tripId);
  return body;
}

const SERVER_FIELD = { expense_type: "category", amount: "amount", description: "description", request_id: "tripId" };

/** Maps a refusal from the server onto the form: { fieldErrors, message } (message is for anything not about one box). */
export function serverExpenseErrors(err) {
  const fieldErrors = {};
  if (Array.isArray(err?.validation)) {
    for (const item of err.validation) {
      const key = Array.isArray(item?.loc) ? SERVER_FIELD[item.loc[item.loc.length - 1]] : null;
      const msg = typeof item?.msg === "string" ? item.msg.replace(/^value error,\s*/i, "") : "";
      if (key && msg && !fieldErrors[key]) fieldErrors[key] = msg;
    }
  }
  const message = err?.message || "";
  if (!Object.keys(fieldErrors).length && /trip/i.test(message)) fieldErrors.tripId = message;
  return { fieldErrors, message: Object.keys(fieldErrors).length ? "" : message || "The expense claim could not be submitted." };
}

/** "₹4,500.50" for a stored claim (its own currency code decides the symbol). */
export function formatClaimAmount(amount, currency = "INR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "-";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
