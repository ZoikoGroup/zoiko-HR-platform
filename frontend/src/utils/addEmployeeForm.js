// "Add Employee" on the dashboard: the same rules as the server (employee/schema.EmployeeCreate), so the message is the same
// whether the browser or the server catches the problem. No password is asked for: the server makes a one-time temporary
// one, e-mails it, and shows it once to whoever added the person.
import { fieldProblem } from "./fieldRules";

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");

/** { field: message } for everything wrong with the form. */
export function validateAddEmployee(form) {
  const e = {};
  // B16–B19 / B8: the shared field rules (utils/fieldRules.js), the same as the server
  for (const [key, label] of [["first_name", "First name"], ["last_name", "Last name"]]) {
    const v = clean(form[key]);
    if (!v) e[key] = `${label} is required`;
    else if (fieldProblem("person_name", v)) e[key] = fieldProblem("person_name", v);
  }
  const email = clean(form.email);
  if (!email) e.email = "Email is required";
  else if (fieldProblem("email", email)) e.email = fieldProblem("email", email);

  if (clean(form.phone) && fieldProblem("phone", form.phone, { country: form.country })) e.phone = fieldProblem("phone", form.phone, { country: form.country });

  if (!clean(form.job_title)) e.job_title = "Job title is required";
  else if (fieldProblem("job_title", form.job_title)) e.job_title = fieldProblem("job_title", form.job_title);

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
