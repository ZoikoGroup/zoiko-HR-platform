// Employee travel request form: the same rules as the server (hr/schemas.TravelRequestCreate and
// hr/service.check_travel_dates), so the message is the same whether the browser or the server catches the problem.

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");

export const PAST_TRAVEL_MESSAGE = "Travel dates cannot be in the past. Choose today or a later date.";

/** Today as YYYY-MM-DD in the person's own time zone (toISOString would give the UTC date). */
export function todayString(now = new Date()) {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** { field: message } for everything wrong with the form. Fields are destination, purpose, from, to. */
export function validateTravelForm(form, today = todayString()) {
  const e = {};
  const destination = clean(form.destination);
  if (!destination) e.destination = "Destination is required.";
  else if (destination.length < 2) e.destination = "Destination must be at least 2 characters.";
  else if (destination.length > 200) e.destination = "Destination can be at most 200 characters.";
  else if (!/[A-Za-zÀ-ɏऀ-ॿ]/.test(destination)) e.destination = "Enter a real place name for the destination.";

  const purpose = clean(form.purpose);
  if (!purpose) e.purpose = "Purpose is required.";
  else if (purpose.length > 500) e.purpose = "Purpose can be at most 500 characters.";

  const from = String(form.from || "").trim();
  const to = String(form.to || "").trim();
  if (!from) e.from = "Choose the travel start date.";
  else if (!isDate(from)) e.from = "Enter a valid start date.";
  else if (from < today) e.from = PAST_TRAVEL_MESSAGE;

  if (!to) e.to = "Choose the travel end date.";
  else if (!isDate(to)) e.to = "Enter a valid end date.";
  else if (to < today) e.to = PAST_TRAVEL_MESSAGE;
  else if (!e.from && from && to < from) e.to = "The end date cannot be before the start date.";
  return e;
}

/** The body the server expects. */
export function travelPayload(form) {
  return { destination: clean(form.destination), purpose: clean(form.purpose), start_date: String(form.from).trim(), end_date: String(form.to).trim() };
}

const SERVER_FIELD = { destination: "destination", purpose: "purpose", start_date: "from", end_date: "to" };

/** Maps a refusal from the server onto the form: { fieldErrors, message } (message is for anything not about one box). */
export function serverTravelErrors(err) {
  const fieldErrors = {};
  if (Array.isArray(err?.validation)) {
    for (const item of err.validation) {
      const key = Array.isArray(item?.loc) ? SERVER_FIELD[item.loc[item.loc.length - 1]] : null;
      const msg = typeof item?.msg === "string" ? item.msg.replace(/^value error,\s*/i, "") : "";
      if (key && msg && !fieldErrors[key]) fieldErrors[key] = msg;
    }
  }
  const message = err?.message || "";
  if (!Object.keys(fieldErrors).length) {
    if (/past/i.test(message)) fieldErrors.from = message;
    else if (/end date/i.test(message)) fieldErrors.to = message;
  }
  return { fieldErrors, message: Object.keys(fieldErrors).length ? "" : message || "The travel request could not be submitted." };
}
