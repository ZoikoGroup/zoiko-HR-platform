/** Attendance vocabulary, mirroring backend app/modules/hr/attendance/constants.py. */

export const STATUS = {
  present: { label: "Present", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", cell: "bg-emerald-500" },
  late: { label: "Late", chip: "bg-amber-50 text-amber-800 ring-amber-200", cell: "bg-amber-400" },
  half_day: { label: "Half day", chip: "bg-orange-50 text-orange-800 ring-orange-200", cell: "bg-orange-400" },
  absent: { label: "Absent", chip: "bg-rose-50 text-rose-800 ring-rose-200", cell: "bg-rose-500" },
  on_leave: { label: "On leave", chip: "bg-blue-50 text-blue-800 ring-blue-200", cell: "bg-blue-500" },
  remote: { label: "Remote", chip: "bg-teal-50 text-teal-800 ring-teal-200", cell: "bg-teal-500" },
  holiday: { label: "Holiday", chip: "bg-violet-50 text-violet-800 ring-violet-200", cell: "bg-violet-400" },
  weekly_off: { label: "Weekly off", chip: "bg-slate-100 text-slate-600 ring-slate-200", cell: "bg-slate-300" },
  missed_punch: { label: "Missed punch-out", chip: "bg-rose-50 text-rose-700 ring-rose-300", cell: "bg-white ring-2 ring-rose-400" },
};

export const LEGEND = ["present", "late", "half_day", "absent", "on_leave", "remote", "holiday", "weekly_off", "missed_punch"];

export const SOURCE_LABEL = { web: "Web", mobile: "Mobile", manual: "Manual", biometric: "Biometric", system: "System", correction: "Correction" };

// Friendly text for the server's error codes.
export const ERROR_TEXT = {
  ATT_ALREADY_IN: "You are already punched in.",
  ATT_NOT_IN: "You are not punched in.",
  ATT_ALREADY_OUT: "You have already punched out today.",
  ATT_ON_BREAK: "You are already on a break.",
  ATT_NOT_ON_BREAK: "You are not on a break.",
  ATT_DAY_CLOSED: "You have already punched in and out today. Request a correction to change it.",
  ATT_LOCKED: "HR has set today's attendance. Ask HR to change it.",
  ATT_PUNCH_DISABLED: "Punching in from the browser is turned off. Ask HR.",
};

export function errorText(e) {
  return ERROR_TEXT[e?.code] || e?.message || "That didn't work. Please try again.";
}

/** 545 -> "9h 05m" */
export function formatMinutes(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** An ISO UTC instant shown as HH:MM in the given IANA time zone. */
export function timeIn(iso, timeZone) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  } catch {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
}

const CORRECTION_KIND_LABEL = { missed_punch: "Missed punch", time_change: "Wrong times", wrong_status: "Wrong status", break: "Breaks" };
const hhmm = (v) => {
  if (!v) return "—";
  const m = /(\d{2}):(\d{2})/.exec(String(v).includes("T") ? String(v).split("T")[1] : String(v));
  return m ? `${m[1]}:${m[2]}` : String(v);
};

/** What a correction request asks for, in words: "Missed punch: 09:00–18:30", "Wrong status: Remote", "Breaks: 13:00–13:30". */
export function correctionSummary(r) {
  const kind = r?.kind || "missed_punch";
  const label = CORRECTION_KIND_LABEL[kind] || "Correction";
  if (kind === "wrong_status") return `${label}: ${STATUS[r.requested_status]?.label || r.requested_status || "—"}`;
  if (kind === "break") return `${label}: ${(r.requested_breaks || []).map((b) => `${b.start}–${b.end}`).join(", ") || "—"}`;
  return `${label}: ${hhmm(r.requested_check_in)}–${hhmm(r.requested_check_out)}`;
}
export { hhmm as wallTime };
