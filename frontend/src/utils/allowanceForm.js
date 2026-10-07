// Add / Edit Allowance: the same rules as the server (backend/app/modules/hr/schemas.py and service.py).
// The employee is CHOSEN from the organization's employees, never typed as a number: a typed number can match nobody.
export const EMPTY_ALLOWANCE = { employee_id: "", allowance_type: "", amount: "", effective_date: "" };
export const ALLOWANCE_LABELS = { employee_id: "Employee", allowance_type: "Allowance type", amount: "Amount", effective_date: "Effective date" };

export function employeeName(e) {
  const first = e.firstName || e.first_name;
  const last = e.lastName || e.last_name;
  return e.fullName || e.full_name || (first || last ? `${first || ""} ${last || ""}`.trim() : null) || e.email || `Employee #${e.id}`;
}

export function allowanceToForm(item) {
  return {
    employee_id: item.employee_id ? String(item.employee_id) : "",
    allowance_type: item.allowance_type || "",
    amount: item.amount == null || item.amount === "" ? "" : String(Number(item.amount)),
    effective_date: item.effective_date ? String(item.effective_date).slice(0, 10) : "",
  };
}

/** { field: message } for everything wrong with the form; `employeeIds` is the list the person could choose from. */
export function validateAllowanceForm(f, employeeIds = null) {
  const errors = {};
  if (!f.employee_id) errors.employee_id = "Choose the employee this allowance is for.";
  else if (employeeIds && !employeeIds.map(String).includes(String(f.employee_id))) errors.employee_id = "The selected employee was not found. Choose an employee from the list.";

  const type = String(f.allowance_type ?? "").trim().replace(/\s+/g, " ");
  if (!type) errors.allowance_type = "Allowance type is required.";
  else if (type.length > 100) errors.allowance_type = "Allowance type can be at most 100 characters.";

  const raw = String(f.amount ?? "").trim();
  if (!raw) errors.amount = "Amount is required.";
  else if (!/^\d+(\.\d+)?$/.test(raw)) errors.amount = "Amount must be a positive number.";
  else if (Number(raw) <= 0) errors.amount = "Amount must be greater than 0.";
  else if (Number(raw) > 99999999.99) errors.amount = "Amount is too large (the most is 99,999,999.99).";
  else if (!/^\d+(\.\d{1,2})?$/.test(raw)) errors.amount = "Amount can have at most 2 decimal places.";

  const date = String(f.effective_date ?? "");
  if (!date) errors.effective_date = "Effective date is required.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.effective_date = "Enter a valid date.";
  else if (Number(date.slice(0, 4)) < 2000 || Number(date.slice(0, 4)) > 2100) errors.effective_date = "Enter a date between the years 2000 and 2100.";
  return errors;
}

export function allowancePayload(f) {
  return {
    employee_id: Number(f.employee_id),
    allowance_type: String(f.allowance_type).trim().replace(/\s+/g, " "),
    amount: Number(String(f.amount).trim()),
    effective_date: f.effective_date,
  };
}

export function serverAllowanceErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    const key = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof key !== "string" || key === "body" || out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^value error,\s*/i.test(msg)) out[key] = msg.replace(/^value error,\s*/i, "");
    else if (/^field required$/i.test(msg)) out[key] = `${ALLOWANCE_LABELS[key] || key} is required.`;
    else out[key] = `${ALLOWANCE_LABELS[key] || key} is not valid.`;
  }
  return out;
}

/** A refusal about the employee that is not a validation list (the server's 400) belongs under the employee box. */
export function employeeRefusal(message) {
  return /employee/i.test(String(message || "")) && /not found|choose/i.test(String(message || ""));
}
