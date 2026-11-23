/** Attendance vocabulary, mirroring backend app/modules/hr/attendance/constants.py. */

import { formatTime12h as formatClockTime } from "../../../utils/dateTime";

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

/** 3725 -> "01:02:05" (a running timer; hours keep counting past 99). */
export function formatDuration(seconds) {
  const t = Math.max(0, Math.floor(Number(seconds) || 0));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}

/**
 * {worked, breaks} in seconds for a day at the instant `atMs`, from the punch-in and break instants the server sent
 * (the same rule as the server: breaks clipped to the worked span). Never below the server's own minute totals.
 */
export function dayTotalsAt(today, atMs) {
  const floor = { worked: (today?.worked_minutes || 0) * 60, breaks: (today?.break_minutes || 0) * 60 };
  const start = today?.check_in_at ? Date.parse(today.check_in_at) : NaN;
  if (Number.isNaN(start) || Number.isNaN(atMs)) return floor;
  const end = today.check_out_at ? Date.parse(today.check_out_at) : atMs;
  const span = Math.max(0, end - start);
  let taken = 0;
  for (const b of today.breaks || []) {
    const bs = Math.max(Date.parse(b.start_at), start);
    const be = Math.min(b.end_at ? Date.parse(b.end_at) : end, end);
    if (!Number.isNaN(bs) && !Number.isNaN(be) && be > bs) taken += be - bs;
  }
  taken = Math.min(taken, span);
  return { worked: Math.max(floor.worked, Math.floor((span - taken) / 1000)), breaks: Math.max(floor.breaks, Math.floor(taken / 1000)) };
}

// The clock format lives in utils/dateTime.js (one helper for the whole product); attendance keeps its own names.
export { DEFAULT_HOUR12, dayOffset, formatTime12h as formatClockTime } from "../../../utils/dateTime";

/** An ISO UTC instant shown in the given IANA time zone, in the attendance time format. */
export function timeIn(iso, timeZone) {
  return iso ? formatClockTime(iso, { timeZone }) : "—";
}

/** The same instant as 24-hour HH:MM, for prefilling an <input type="time">. */
export function timeIn24(iso, timeZone) {
  return iso ? formatClockTime(iso, { timeZone, hour12: false, empty: "" }) : "";
}

const CORRECTION_KIND_LABEL = { missed_punch: "Missed punch", time_change: "Wrong times", wrong_status: "Wrong status", break: "Breaks" };
const hhmm = (v) => (v ? formatClockTime(v) : "—");

/** What a correction request asks for, in words: "Missed punch: 09:00 AM–06:30 PM", "Wrong status: Remote", "Breaks: 01:00 PM–01:30 PM". */
export function correctionSummary(r) {
  const kind = r?.kind || "missed_punch";
  const label = CORRECTION_KIND_LABEL[kind] || "Correction";
  if (kind === "wrong_status") return `${label}: ${STATUS[r.requested_status]?.label || r.requested_status || "—"}`;
  if (kind === "break") return `${label}: ${(r.requested_breaks || []).map((b) => `${hhmm(b.start)}–${hhmm(b.end)}`).join(", ") || "—"}`;
  return `${label}: ${hhmm(r.requested_check_in)}–${hhmm(r.requested_check_out)}`;
}
export { hhmm as wallTime };
