// New / Edit Orientation Session: the same rules as the server (backend/app/modules/hr/schemas.py), so each message
// shows next to its own field whether the browser or the server catches the problem.
export const SESSION_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const LINK = /^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Today as YYYY-MM-DD in the browser's own time zone (what the date box shows as "today"). */
export function todayIso(now = new Date()) {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/**
 * { field: message } for everything wrong with the form. `originalDate` is the saved date when editing: a session
 * that already sits on a past day stays editable as long as its date is not moved to another past day.
 */
export function validateSessionForm(f, { originalDate = null, today = todayIso() } = {}) {
  const errors = {};
  const title = String(f.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) errors.title = "Title is required.";
  else if (title.length > 200) errors.title = "Title can be at most 200 characters.";

  const date = String(f.date ?? "");
  if (!date) errors.date = "Date is required.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.date = "Enter a valid date.";
  else {
    const year = Number(date.slice(0, 4));
    if (year < 2000 || year > 2100) errors.date = "Enter a date between the years 2000 and 2100.";
    else if (date < today && date !== originalDate) errors.date = "Choose today or a later date.";
  }

  const time = String(f.time ?? "").trim();
  if (time && !TIME.test(time)) errors.time = "Enter the time as HH:MM, for example 10:30.";
  if (String(f.location ?? "").trim().length > 200) errors.location = "Location can be at most 200 characters.";
  if (String(f.presenter ?? "").trim().length > 200) errors.presenter = "Presenter can be at most 200 characters.";
  const link = String(f.meeting_link ?? "").trim();
  if (link && !LINK.test(link)) errors.meeting_link = "Enter a valid link starting with http:// or https://.";
  else if (link.length > 500) errors.meeting_link = "The meeting link can be at most 500 characters.";
  return errors;
}

/** The payload to send: trimmed text, empty optional fields as null, status only when editing. */
export function sessionPayload(f, editing) {
  const text = (v) => { const t = String(v ?? "").trim(); return t === "" ? null : t; };
  const payload = {
    title: String(f.title).trim().replace(/\s+/g, " "),
    date: f.date,
    time: text(f.time),
    location: text(f.location),
    meeting_link: text(f.meeting_link),
    presenter: text(f.presenter),
  };
  if (editing && f.status) payload.status = f.status;
  return payload;
}

/** The server's refusal as { field: message }; the messages it writes for people are kept as they are. */
export function serverSessionErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  const labels = { title: "Title", date: "Date", time: "Time", location: "Location", meeting_link: "Meeting link", presenter: "Presenter", status: "Status" };
  for (const item of detail) {
    const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof field !== "string" || out[field]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^value error,\s*/i.test(msg)) out[field] = msg.replace(/^value error,\s*/i, "");
    else if (/^field required$/i.test(msg)) out[field] = `${labels[field] || field} is required.`;
    else if (/valid date/i.test(msg)) out[field] = "Enter a valid date.";
    else out[field] = `${labels[field] || field} is not valid.`;
  }
  return out;
}
