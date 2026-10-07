// Add / Edit Training Program: the same rules as the server (backend/app/modules/hr/schemas.py). Everything a learner
// needs in order to join a program is required, so a program can never be saved, or edited, with that missing.
export const PROGRAM_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// Where a program can go from each status (mirrors PROGRAM_TRANSITIONS in backend learning_service.py): a finished
// program stays finished and a cancelled one can only be planned again.
const NEXT = {
  planned: ["active", "completed", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: ["planned"],
};

export function statusOptions(current) {
  const cur = current || "planned";
  return [cur, ...(NEXT[cur] || [])].map((value) => PROGRAM_STATUSES.find((s) => s.value === value));
}

export const EMPTY_PROGRAM = { name: "", description: "", instructor_id: "", start_date: "", end_date: "", max_participants: "", department: "", resource_link: "", status: "planned" };

const LINK = /^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i;

export function programToForm(p) {
  return {
    name: p.name || "",
    description: p.description || "",
    instructor_id: p.instructor_id ? String(p.instructor_id) : "",
    start_date: p.start_date ? String(p.start_date).slice(0, 10) : "",
    end_date: p.end_date ? String(p.end_date).slice(0, 10) : "",
    max_participants: p.max_participants != null ? String(p.max_participants) : "",
    department: p.department || "",
    resource_link: p.resource_link || "",
    status: p.status || "planned",
  };
}

/** { field: message } for everything wrong with the form; empty when it can be saved. */
export function validateProgramForm(f) {
  const errors = {};
  const name = String(f.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Program name is required.";
  else if (name.length > 200) errors.name = "Program name can be at most 200 characters.";

  const description = String(f.description ?? "").trim();
  if (!description) errors.description = "Description is required, so learners know what the program covers.";
  else if (description.length > 5000) errors.description = "Description can be at most 5000 characters.";

  if (!f.instructor_id) errors.instructor_id = "Choose the instructor who will run the program.";

  const dateOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100;
  if (!f.start_date) errors.start_date = "Start date is required.";
  else if (!dateOk(f.start_date)) errors.start_date = "Enter a valid date between the years 2000 and 2100.";
  if (!f.end_date) errors.end_date = "End date is required.";
  else if (!dateOk(f.end_date)) errors.end_date = "Enter a valid date between the years 2000 and 2100.";
  if (!errors.start_date && !errors.end_date && f.end_date < f.start_date) errors.end_date = "The end date cannot be before the start date.";

  const cap = String(f.max_participants ?? "").trim();
  if (!cap) errors.max_participants = "Maximum participants is required.";
  else if (!/^\d+$/.test(cap)) errors.max_participants = "Maximum participants must be a whole number.";
  else if (Number(cap) < 1 || Number(cap) > 10000) errors.max_participants = "Maximum participants must be between 1 and 10000.";

  if (String(f.department ?? "").trim().length > 100) errors.department = "Department can be at most 100 characters.";
  const link = String(f.resource_link ?? "").trim();
  if (link && !LINK.test(link)) errors.resource_link = "Enter a valid link starting with http:// or https://.";
  else if (link.length > 500) errors.resource_link = "The resource link can be at most 500 characters.";
  return errors;
}

export function programPayload(f) {
  const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
  const optional = (v) => { const t = clean(v); return t === "" ? null : t; };
  return {
    name: clean(f.name),
    description: String(f.description).trim(),
    instructor_id: Number(f.instructor_id),
    start_date: f.start_date,
    end_date: f.end_date,
    max_participants: Number(String(f.max_participants).trim()),
    department: optional(f.department),
    resource_link: optional(f.resource_link),
    status: f.status || "planned",
  };
}

/** The server's refusal as { field: message }; the messages it writes for people are kept as they are. */
export function serverProgramErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  const labels = { name: "Program name", description: "Description", instructor_id: "Instructor", start_date: "Start date", end_date: "End date", max_participants: "Maximum participants", department: "Department", resource_link: "Resource link", status: "Status" };
  for (const item of detail) {
    const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    const key = typeof field === "string" && field !== "body" ? field : "end_date";   // a whole-form message (date order) belongs under the end date
    if (out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^value error,\s*/i.test(msg)) out[key] = msg.replace(/^value error,\s*/i, "");
    else if (/^field required$/i.test(msg)) out[key] = `${labels[key] || key} is required.`;
    else if (/valid date/i.test(msg)) out[key] = "Enter a valid date.";
    else out[key] = `${labels[key] || key} is not valid.`;
  }
  return out;
}

/** Which details learners rely on a saved program is still missing (older programs may have gaps). */
export function missingProgramDetails(p) {
  const gaps = [];
  if (!String(p?.description ?? "").trim()) gaps.push("description");
  if (!p?.instructor_id) gaps.push("instructor");
  if (!p?.start_date) gaps.push("start date");
  if (!p?.end_date) gaps.push("end date");
  if (!(Number(p?.max_participants) > 0)) gaps.push("maximum participants");
  return gaps;
}

export function dateText(value) {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return String(value);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
