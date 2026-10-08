// Employee Travel Settings: the same rules as employee/schema._clean_travel_preferences, so the message is the same
// whether the browser or the server catches the problem.

export const TRAVEL_CURRENCIES = ["INR", "USD", "EUR", "GBP"];
export const MAX_PER_DIEM = 1000000;
export const DEFAULT_TRAVEL_SETTINGS = { currency: "INR", perDiem: "", autoNotify: false };

/** The form values from what the server holds (or empty defaults for someone who never saved). */
export function readTravelSettings(profile) {
  const saved = (profile && (profile.travelPreferences || profile.travel_preferences)) || {};
  return {
    currency: TRAVEL_CURRENCIES.includes(saved.currency) ? saved.currency : DEFAULT_TRAVEL_SETTINGS.currency,
    perDiem: saved.per_diem != null ? String(saved.per_diem) : "",
    autoNotify: typeof saved.auto_notify === "boolean" ? saved.auto_notify : DEFAULT_TRAVEL_SETTINGS.autoNotify,
  };
}

/** { field: message } for everything wrong. Fields: currency, perDiem. */
export function validateTravelSettings(form) {
  const e = {};
  if (!TRAVEL_CURRENCIES.includes(form.currency)) e.currency = "Choose a currency from the list.";
  const raw = String(form.perDiem ?? "").trim();
  if (!raw) e.perDiem = "Enter your daily per diem limit.";
  else if (!/^\d+(\.\d+)?$/.test(raw)) e.perDiem = "Enter the per diem limit as a number.";
  else if (Number(raw) <= 0) e.perDiem = "The per diem limit must be more than zero.";
  else if (Number(raw) > MAX_PER_DIEM) e.perDiem = "The per diem limit is too large.";
  else if (!/^\d+(\.\d{1,2})?$/.test(raw)) e.perDiem = "The per diem limit can have at most 2 decimal places.";
  return e;
}

/** The body the server expects. */
export function travelSettingsPayload(form) {
  return { travel_preferences: { currency: form.currency, per_diem: String(form.perDiem).trim(), auto_notify: !!form.autoNotify } };
}

/** True when the form differs from what was last loaded or saved. */
export function settingsChanged(form, saved) {
  const norm = (v) => { const t = String(v ?? "").trim(); return t === "" || Number.isNaN(Number(t)) ? t : String(Number(t)); };
  return form.currency !== saved.currency || norm(form.perDiem) !== norm(saved.perDiem) || !!form.autoNotify !== !!saved.autoNotify;
}

/** Maps a refusal from the server onto the form: { fieldErrors, message }. */
export function serverSettingsErrors(err) {
  const fieldErrors = {};
  if (Array.isArray(err?.validation)) {
    for (const item of err.validation) {
      const loc = Array.isArray(item?.loc) ? item.loc : [];
      if (!loc.includes("travel_preferences")) continue;
      const msg = typeof item.msg === "string" ? item.msg.replace(/^value error,\s*/i, "") : "";
      if (/currency/i.test(msg)) fieldErrors.currency = fieldErrors.currency || msg;
      else if (msg) fieldErrors.perDiem = fieldErrors.perDiem || msg;
    }
  }
  return { fieldErrors, message: Object.keys(fieldErrors).length ? "" : err?.message || "The settings could not be saved." };
}
