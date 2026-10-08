// "Add Employee" on the dashboard: the same rules as the server (employee/schema.EmployeeCreate), so the message is the same
// whether the browser or the server catches the problem. No password is asked for: the server makes a one-time temporary
// one, e-mails it, and shows it once to whoever added the person.
import { phoneError } from "./phone";

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ .'-]*$/;

/** { field: message } for everything wrong with the form. */
export function validateAddEmployee(form) {
  const e = {};
  for (const [key, label] of [["first_name", "First name"], ["last_name", "Last name"]]) {
    const v = clean(form[key]);
    if (!v) e[key] = `${label} is required`;
    else if (!NAME.test(v)) e[key] = `${label} can contain only letters, spaces and . ' -`;
    else if (v.length > 100) e[key] = `${label} can be at most 100 characters`;
  }
  const email = clean(form.email);
  if (!email) e.email = "Email is required";
  else if (!EMAIL.test(email)) e.email = "Enter a valid email address";

  const phone = phoneError(form.phone);
  if (clean(form.phone) && phone) e.phone = phone;

  if (!clean(form.job_title)) e.job_title = "Job title is required";
  else if (clean(form.job_title).length > 150) e.job_title = "Job title can be at most 150 characters";

  if (!form.date_of_joining) e.date_of_joining = "Date of joining is required";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_joining) || Number(form.date_of_joining.slice(0, 4)) < 1980) e.date_of_joining = "Enter a valid date of joining";

  const salary = String(form.basic_salary ?? "").trim();
  const ctc = String(form.ctc ?? "").trim();
  if (salary && !(Number(salary) >= 0)) e.basic_salary = "Enter the salary as a number, zero or more";
  if (ctc && !(Number(ctc) >= 0)) e.ctc = "Enter the CTC as a number, zero or more";
  if (!e.basic_salary && !e.ctc && salary && ctc && Number(ctc) < Number(salary)) e.ctc = "CTC cannot be less than the basic salary";
  return e;
}

/** The body the server expects (no password: the server generates one). */
export function addEmployeePayload(form) {
  return {
    first_name: clean(form.first_name),
    last_name: clean(form.last_name),
    email: clean(form.email).toLowerCase(),
    phone: clean(form.phone) || null,
    job_title: clean(form.job_title),
    employment_type: form.employment_type,
    department_id: form.department_id ? Number(form.department_id) : null,
    designation_id: form.designation_id ? Number(form.designation_id) : null,
    date_of_joining: form.date_of_joining,
    basic_salary: String(form.basic_salary ?? "").trim() ? Number(form.basic_salary) : null,
    ctc: String(form.ctc ?? "").trim() ? Number(form.ctc) : null,
  };
}

/** Maps a refusal from the server onto the form: { fieldErrors, message }. */
export function serverAddEmployeeErrors(err) {
  const fieldErrors = {};
  if (Array.isArray(err?.validation)) {
    for (const item of err.validation) {
      const key = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
      let msg = typeof item?.msg === "string" ? item.msg.replace(/^value error,\s*/i, "") : "";
      if (/^field required$/i.test(msg)) msg = "This is required";
      if (typeof key === "string" && key !== "body" && msg && !fieldErrors[key]) fieldErrors[key] = msg;
    }
  }
  const message = err?.message || "";
  if (!Object.keys(fieldErrors).length && /already exists|already.*email|email.*already/i.test(message)) fieldErrors.email = "An employee with this email already exists";
  return { fieldErrors, message: Object.keys(fieldErrors).length ? "" : message || "The employee could not be added." };
}
