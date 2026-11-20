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

/** Messages for the schedule / edit form, by field. */
export function validateInterviewForm(f) {
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
  return errors;
}
