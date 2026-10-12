// Add / Edit Course: the same rules as the server (backend/app/modules/hr/schemas.py). Everything a learner needs in
// order to choose a course is required, so a course can never be saved, or edited, with that information missing.
export const COURSE_TYPES = [
  { value: "online", label: "Online" },
  { value: "in_person", label: "In Person" },
  { value: "hybrid", label: "Hybrid" },
  { value: "self_paced", label: "Self Paced" },
];

export const COURSE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export const EMPTY_COURSE = { title: "", description: "", course_type: "", category: "", provider: "", duration: "", department: "", resource_link: "", status: "active" };

const LINK = /^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i;

export function typeLabel(value) {
  return COURSE_TYPES.find((t) => t.value === value)?.label || (value ? String(value).replace(/_/g, " ") : "");
}

/** The form values for an existing course (what the Edit dialog starts from). */
export function courseToForm(course) {
  return {
    title: course.course_name || "",
    description: course.description || "",
    course_type: course.course_type || "",
    category: course.category || "",
    provider: course.provider || "",
    duration: course.duration_hours != null ? String(course.duration_hours) : "",
    department: course.department || "",
    resource_link: course.resource_link || "",
    status: course.status || "active",
  };
}

/** { field: message } for everything wrong with the form; empty when it can be saved. */
export function validateCourseForm(f) {
  const errors = {};
  const need = (key, text, label, max) => {
    const v = String(f[key] ?? "").trim().replace(/\s+/g, " ");
    if (!v) errors[key] = text || `${label} is required.`;
    else if (v.length > max) errors[key] = `${label} can be at most ${max} characters.`;
  };
  need("title", null, "Course name", 200);
  need("description", "Description is required, so learners know what the course covers.", "Description", 5000);
  need("category", null, "Category", 100);
  need("provider", null, "Provider", 150);
  if (!f.course_type) errors.course_type = "Course type is required.";
  else if (!COURSE_TYPES.some((t) => t.value === f.course_type)) errors.course_type = "Choose one of the listed course types.";

  const raw = String(f.duration ?? "").trim();
  if (!raw) errors.duration = "Duration is required.";
  else if (!/^\d+$/.test(raw)) errors.duration = "Duration must be a whole number of hours.";
  else if (Number(raw) < 1 || Number(raw) > 1000) errors.duration = "Duration must be between 1 and 1000 hours.";

  if (String(f.department ?? "").trim().length > 100) errors.department = "Department can be at most 100 characters.";
  const link = String(f.resource_link ?? "").trim();
  if (link && !LINK.test(link)) errors.resource_link = "Enter a valid link starting with http:// or https://.";
  else if (link.length > 500) errors.resource_link = "The resource link can be at most 500 characters.";
  return errors;
}

/** The payload to send: every field trimmed, the optional ones null when empty. */
export function coursePayload(f) {
  const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
  const optional = (v) => { const t = clean(v); return t === "" ? null : t; };
  return {
    course_name: clean(f.title),
    description: String(f.description).trim(),
    course_type: f.course_type,
    category: clean(f.category),
    provider: clean(f.provider),
    duration_hours: Number(String(f.duration).trim()),
    department: optional(f.department),
    resource_link: optional(f.resource_link),
    status: f.status || "active",
  };
}

/** The server's refusal as { field: message }; the messages it writes for people are kept as they are. */
export function serverCourseErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  const field = { course_name: "title", duration_hours: "duration" };
  const labels = { title: "Course name", description: "Description", course_type: "Course type", category: "Category", provider: "Provider", duration: "Duration", department: "Department", resource_link: "Resource link", status: "Status" };
  for (const item of detail) {
    const raw = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof raw !== "string") continue;
    const key = field[raw] || raw;
    if (out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^value error,\s*/i.test(msg)) out[key] = msg.replace(/^value error,\s*/i, "");
    else if (/^field required$/i.test(msg)) out[key] = `${labels[key] || key} is required.`;
    else out[key] = `${labels[key] || key} is not valid.`;
  }
  return out;
}

/** Which of the details learners rely on a saved course is still missing (older courses may have gaps). */
export function missingDetails(course) {
  const gaps = [];
  if (!String(course?.description ?? "").trim()) gaps.push("description");
  if (!String(course?.category ?? "").trim()) gaps.push("category");
  if (!String(course?.provider ?? "").trim()) gaps.push("provider");
  if (!String(course?.course_type ?? "").trim()) gaps.push("course type");
  if (!(Number(course?.duration_hours) > 0)) gaps.push("duration");
  return gaps;
}
