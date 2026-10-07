// Where an interview can go from each status (mirrors INTERVIEW_TRANSITIONS in backend recruitment_service.py).
// A finished interview stays finished and a cancelled one can only be put back on the calendar, so a status can
// never flip between "completed" and "cancelled".
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
  if (!String(f.candidate_name ?? "").trim()) errors.candidate_name = "Candidate name is required.";
  else if (String(f.candidate_name).trim().length > 150) errors.candidate_name = "Candidate name can be at most 150 characters.";
  if (!String(f.position ?? "").trim()) errors.position = "Position is required.";
  else if (String(f.position).trim().length > 150) errors.position = "Position can be at most 150 characters.";
  if (!f.interview_date) errors.interview_date = "Interview date is required.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.interview_date) || Number.isNaN(Date.parse(f.interview_date))) errors.interview_date = "Enter a valid date.";
  if (String(f.interviewer ?? "").trim().length > 150) errors.interviewer = "Interviewer can be at most 150 characters.";
  return errors;
}
