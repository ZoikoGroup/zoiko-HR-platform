// Add / Edit Succession record: the same rules as the server (backend/app/modules/hr/schemas.py, workforce_service.py).
export const READINESS_LEVELS = ["not_ready", "moderately_ready", "ready", "fully_ready"];
export const RISK_LEVELS = ["low", "medium", "high", "critical"];
export const EMPTY_SUCCESSION = { employee_id: "", successor_employee_id: "", readiness_level: "not_ready", risk_level: "medium", target_position: "", review_date: "", notes: "" };
export const SUCCESSION_LABELS = { employee_id: "Employee", successor_employee_id: "Successor", readiness_level: "Readiness", risk_level: "Risk", target_position: "Target position", review_date: "Review date", notes: "Notes" };

export function successionToForm(item) {
  return {
    employee_id: item.employee_id ? String(item.employee_id) : "",
    successor_employee_id: item.successor_employee_id ? String(item.successor_employee_id) : "",
    readiness_level: item.readiness_level || "not_ready",
    risk_level: item.risk_level || "medium",
    target_position: item.target_position || "",
    review_date: item.review_date ? String(item.review_date).slice(0, 10) : "",
    notes: item.notes || "",
  };
}

/** { field: message }; `ids` is the list of people the person could choose from (null when it could not be loaded). */
export function validateSuccession(f, ids = null) {
  const errors = {};
  const known = ids ? ids.map(String) : null;
  if (!f.employee_id) errors.employee_id = "Choose the employee this succession plan is for.";
  else if (known && !known.includes(String(f.employee_id))) errors.employee_id = "The selected employee was not found. Choose someone from the list.";
  if (f.successor_employee_id) {
    if (known && !known.includes(String(f.successor_employee_id))) errors.successor_employee_id = "The selected successor was not found. Choose someone from the list.";
    else if (String(f.successor_employee_id) === String(f.employee_id)) errors.successor_employee_id = "An employee cannot be their own successor.";
  }
  if (!READINESS_LEVELS.includes(f.readiness_level)) errors.readiness_level = "Choose a readiness level.";
  if (!RISK_LEVELS.includes(f.risk_level)) errors.risk_level = "Choose a risk level.";
  if (String(f.target_position ?? "").trim().length > 150) errors.target_position = "Target position can be at most 150 characters.";
  const date = String(f.review_date ?? "");
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.review_date = "Enter a valid date.";
    else if (Number(date.slice(0, 4)) < 2000 || Number(date.slice(0, 4)) > 2100) errors.review_date = "Enter a date between the years 2000 and 2100.";
  }
  if (String(f.notes ?? "").length > 5000) errors.notes = "Notes can be at most 5000 characters.";
  return errors;
}

export function successionPayload(f) {
  const text = (v) => { const t = String(v ?? "").trim().replace(/\s+/g, " "); return t === "" ? null : t; };
  return {
    employee_id: Number(f.employee_id),
    successor_employee_id: f.successor_employee_id ? Number(f.successor_employee_id) : null,
    readiness_level: f.readiness_level,
    risk_level: f.risk_level,
    target_position: text(f.target_position),
    review_date: f.review_date || null,
    notes: String(f.notes ?? "").trim() || null,
  };
}

export function serverSuccessionErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    const key = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof key !== "string" || key === "body" || out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    out[key] = /^value error,\s*/i.test(msg) ? msg.replace(/^value error,\s*/i, "") : `${SUCCESSION_LABELS[key] || key} is not valid.`;
  }
  return out;
}

/** Which field a plain server refusal (a 400) belongs under. */
export function refusalField(message) {
  const m = String(message || "");
  if (/successor/i.test(m) && /not found|own successor/i.test(m)) return "successor_employee_id";
  if (/employee/i.test(m) && /not found/i.test(m)) return "employee_id";
  return null;
}
