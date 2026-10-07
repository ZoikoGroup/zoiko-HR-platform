// Assessment and question forms: the same rules as the server (backend/app/modules/hr/schemas.py).
// Nothing is filled in for the person: the passing score in particular must be typed, as a percentage from 1 to 100.
export const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short Answer" },
  { value: "essay", label: "Essay (marked by a person)" },
];

export const EMPTY_ASSESSMENT = { title: "", description: "", course_id: "", passing_score: "", max_attempts: "", duration_minutes: "", resource_link: "", is_active: true };
export const EMPTY_QUESTION = { question_text: "", question_type: "multiple_choice", options: "", correct_answer: "", points: "" };

const LINK = /^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i;

const whole = (raw, label, low, high, { required = false, unit = "" } = {}) => {
  const v = String(raw ?? "").trim();
  if (!v) return required ? `${label} is required.` : "";
  if (!/^\d+$/.test(v)) return `${label} must be a whole number.`;
  const n = Number(v);
  if (n < low || n > high) return `${label} must be between ${low} and ${high}${unit}.`;
  return "";
};

export function assessmentToForm(a) {
  return {
    title: a.title || "",
    description: a.description || "",
    course_id: a.course_id ? String(a.course_id) : "",
    passing_score: a.passing_score != null ? String(a.passing_score) : "",
    max_attempts: a.max_attempts != null ? String(a.max_attempts) : "",
    duration_minutes: a.duration_minutes != null ? String(a.duration_minutes) : "",
    resource_link: a.resource_link || "",
    is_active: a.is_active !== false,
  };
}

/** { field: message } for everything wrong with the form; empty when it can be saved. */
export function validateAssessmentForm(f) {
  const errors = {};
  const title = String(f.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) errors.title = "Title is required.";
  else if (title.length > 200) errors.title = "Title can be at most 200 characters.";
  const description = String(f.description ?? "").trim();
  if (!description) errors.description = "Description is required, so learners know what the assessment covers.";
  else if (description.length > 5000) errors.description = "Description can be at most 5000 characters.";
  if (!f.course_id) errors.course_id = "Choose the course this assessment belongs to.";
  const passing = whole(f.passing_score, "Passing score", 1, 100, { required: true, unit: " percent" });
  if (passing) errors.passing_score = passing;
  const attempts = whole(f.max_attempts, "Maximum attempts", 1, 100);
  if (attempts) errors.max_attempts = attempts;
  const minutes = whole(f.duration_minutes, "Duration", 1, 600, { unit: " minutes" });
  if (minutes) errors.duration_minutes = minutes;
  const link = String(f.resource_link ?? "").trim();
  if (link && !LINK.test(link)) errors.resource_link = "Enter a valid link starting with http:// or https://.";
  else if (link.length > 500) errors.resource_link = "The resource link can be at most 500 characters.";
  return errors;
}

export function assessmentPayload(f, editing) {
  const num = (v) => (String(v ?? "").trim() === "" ? null : Number(String(v).trim()));
  const text = (v) => { const t = String(v ?? "").trim(); return t === "" ? null : t; };
  const payload = {
    course_id: Number(f.course_id),
    title: String(f.title).trim().replace(/\s+/g, " "),
    description: String(f.description).trim(),
    passing_score: Number(String(f.passing_score).trim()),
    max_attempts: num(f.max_attempts),
    duration_minutes: num(f.duration_minutes),
    resource_link: text(f.resource_link),
  };
  if (editing) payload.is_active = !!f.is_active;
  return payload;
}

/** "Red, Blue ,, red" -> ["Red", "Blue"] (trimmed, no blanks, no repeats). */
export function parseOptions(raw) {
  const out = [];
  for (const part of String(raw ?? "").split(/[,\n]/)) {
    const t = part.trim().replace(/\s+/g, " ");
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

export function questionToForm(q) {
  return {
    question_text: q.question_text || "",
    question_type: q.question_type || "multiple_choice",
    options: Array.isArray(q.options) ? q.options.join(", ") : "",
    correct_answer: q.correct_answer || "",
    points: q.points != null ? String(q.points) : "",
  };
}

export function validateQuestionForm(f) {
  const errors = {};
  const text = String(f.question_text ?? "").trim();
  if (!text) errors.question_text = "Question text is required.";
  else if (text.length > 2000) errors.question_text = "Question text can be at most 2000 characters.";
  const points = whole(f.points, "Points", 1, 100, { required: true });
  if (points) errors.points = points;
  const answer = String(f.correct_answer ?? "").trim();
  if (f.question_type === "multiple_choice") {
    const opts = parseOptions(f.options);
    if (opts.length < 2) errors.options = "Enter at least two different options, separated by commas.";
    if (!answer) errors.correct_answer = "Choose the correct answer.";
    else if (!opts.some((o) => o.toLowerCase() === answer.toLowerCase())) errors.correct_answer = "The correct answer must be one of the options.";
  } else if (f.question_type === "true_false") {
    if (!["true", "false"].includes(answer.toLowerCase())) errors.correct_answer = "Choose True or False.";
  } else if (f.question_type === "short_answer") {
    if (!answer) errors.correct_answer = "Enter the correct answer, so the quiz can be marked.";
  }
  return errors;
}

export function questionPayload(f) {
  const type = f.question_type;
  return {
    question_text: String(f.question_text).trim(),
    question_type: type,
    options: type === "multiple_choice" ? parseOptions(f.options) : null,
    correct_answer: type === "essay" ? null : String(f.correct_answer).trim(),
    points: Number(String(f.points).trim()),
  };
}

/** The server's refusal as { field: message }; the messages it writes for people are kept as they are. */
export function serverFormErrors(detail, labels = {}) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    const key = typeof field === "string" && field !== "body" ? field : "correct_answer";   // a whole-question message belongs under the answer
    if (out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^value error,\s*/i.test(msg)) out[key] = msg.replace(/^value error,\s*/i, "");
    else if (/^field required$/i.test(msg)) out[key] = `${labels[key] || key} is required.`;
    else out[key] = `${labels[key] || key} is not valid.`;
  }
  return out;
}

export const ASSESSMENT_LABELS = { title: "Title", description: "Description", course_id: "Course", passing_score: "Passing score", max_attempts: "Maximum attempts", duration_minutes: "Duration", resource_link: "Resource link" };
export const QUESTION_LABELS = { question_text: "Question text", question_type: "Question type", options: "Options", correct_answer: "Correct answer", points: "Points" };

export function resultOf(attempt) {
  if (attempt.status !== "completed") return { label: "In progress", tone: "blue" };
  return attempt.passed ? { label: "Passed", tone: "green" } : { label: "Failed", tone: "red" };
}

export function scoreText(attempt) {
  return attempt.score == null ? "-" : `${attempt.score}%`;
}
