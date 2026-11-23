// Where an interview can go from each status (mirrors INTERVIEW_TRANSITIONS in backend recruitment_service.py).
// A finished interview stays finished and a cancelled one can only be put back on the calendar, so a status can
// never flip between "completed" and "cancelled".
import { fieldProblem } from "./fieldRules";

// the server's words (app/modules/hr/schemas.py)
export const INTERVIEWER_MESSAGE = "Choose an interviewer, or enter the name of someone outside the system.";
export const IN_PERSON_LOCATION_MESSAGE = "Enter where the in-person interview takes place.";
const LOCATION_TYPES = new Set(["in_person", "technical", "panel", "hr"]);

export const INTERVIEW_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];

export const STATUS_LABELS = { scheduled: "Scheduled", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };

const NEXT = {
  scheduled: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: ["scheduled"],
};

/** Statuses an interview may move to from `current` (not including `current` itself). */
export function nextStatuses(current) {
  return NEXT[current || "scheduled"] || [];
}

/** The buttons a card offers: what each one does, what it asks before doing it. */
export function cardActions(current) {
  const label = {
    in_progress: { text: "Start", tone: "blue" },
    completed: { text: "Mark completed", tone: "green" },
    cancelled: { text: "Cancel interview", tone: "red", confirm: "Cancel this interview?" },
    scheduled: { text: "Reschedule", tone: "gray" },
  };
  return nextStatuses(current).map((status) => ({ status, ...label[status] }));
}

/** Options for the Status box when editing: the current status plus what it may change to. */
export function statusOptions(current) {
  const cur = current || "scheduled";
  return [cur, ...nextStatuses(cur)].map((value) => ({ value, label: STATUS_LABELS[value] }));
}

// QA-R1-1: the server refuses a schedule that has already passed (recruitment_service._check_interview_not_past).
export const PAST_INTERVIEW_MESSAGE = "An interview cannot be scheduled in the past. Choose a date and time that has not passed yet.";

const pad2 = (n) => String(n).padStart(2, "0");

/** Wall-clock "now" in `tz` (IANA; empty → this browser's zone): { day: "YYYY-MM-DD", time: "HH:MM" }. */
export function nowIn(tz, nowMs = Date.now()) {
  const at = new Date(nowMs);
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at).map((p) => [p.type, p.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${pad2(Number(parts.hour) % 24)}:${parts.minute}` };
  } catch {
    return { day: `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`, time: `${pad2(at.getHours())}:${pad2(at.getMinutes())}` };
  }
}

const scheduleKey = (f) => [f?.interview_date || "", f?.start_time || "", f?.end_time || "", f?.timezone || ""].join("|");

/** Whether the form sets the schedule: a new interview, a changed date / time / zone, or a cancelled one put back on the
 * calendar. Editing anything else on an interview whose time has passed is allowed (mirrors the server). */
export function schedulesTime(f, original) {
  if (!original) return true;
  if (original.status === "cancelled" && f.status === "scheduled") return true;
  return scheduleKey(f) !== scheduleKey(original);
}

/** { interview_date | start_time: message } when the schedule being set has already passed in the interview's zone. */
export function pastScheduleErrors(f, { original = null, now = Date.now() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f?.interview_date || "") || !schedulesTime(f, original)) return {};
  const here = nowIn(f.timezone, now);
  if (f.interview_date < here.day) return { interview_date: PAST_INTERVIEW_MESSAGE };
  if (f.interview_date === here.day && f.start_time && String(f.start_time).slice(0, 5) <= here.time) return { start_time: PAST_INTERVIEW_MESSAGE };
  return {};
}

/** Messages for the schedule / edit form, by field. Pass `{ now }` (and `original`, the interview as it opened, when editing)
 * to also refuse a schedule that has already passed. */
export function validateInterviewForm(f, opts) {
  const errors = {};
  const put = (key, message) => { if (message && !errors[key]) errors[key] = message; };
  // QA report #13 (BUG-12…16): names, positions and places follow the shared field rules (the server's own); a linked
  // candidate's name and position come from their record and are not typed here.
  if (!f.candidate_id) {
    if (!String(f.candidate_name ?? "").trim()) errors.candidate_name = "Candidate name is required.";
    else put("candidate_name", fieldProblem("person_full_name", f.candidate_name));
    if (!String(f.position ?? "").trim()) errors.position = "Position is required.";
    else put("position", fieldProblem("job_title", f.position));
  }
  if (!f.interview_date) errors.interview_date = "Interview date is required.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.interview_date) || Number.isNaN(Date.parse(f.interview_date))) errors.interview_date = "Enter a valid date.";
  if (!f.interviewer_id) {
    if (!String(f.interviewer ?? "").trim()) errors.interviewer = INTERVIEWER_MESSAGE;
    else put("interviewer", fieldProblem("person_full_name", f.interviewer));
  }
  if (f.interview_type === "in_person" && !String(f.location ?? "").trim()) errors.location = IN_PERSON_LOCATION_MESSAGE;
  else if (LOCATION_TYPES.has(f.interview_type)) put("location", fieldProblem("location", f.location));
  if (f.start_time && f.end_time && f.end_time <= f.start_time) errors.end_time = "The end time must be after the start time.";
  const link = String(f.meeting_link ?? "").trim();
  if (link && !/^https:\/\/\S+$/i.test(link)) errors.meeting_link = "Use a full https:// meeting link.";
  if (opts?.now != null && !errors.interview_date) {
    for (const [k, v] of Object.entries(pastScheduleErrors(f, opts))) put(k, v);
  }
  return errors;
}
