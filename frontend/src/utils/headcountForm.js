// New / Edit Headcount record: the same rules as the server (backend/app/modules/hr/schemas.py, workforce_service.py).
export const CURRENT_YEAR = new Date().getFullYear();
export const EMPTY_HEADCOUNT = { department_id: "", fiscal_year: String(CURRENT_YEAR), approved_positions: "", filled_positions: "", vacant_positions: "", planned_hires: "", projected_cost: "" };
export const HEADCOUNT_LABELS = { department_id: "Department", fiscal_year: "Fiscal year", approved_positions: "Approved positions", filled_positions: "Filled positions", vacant_positions: "Vacant positions", planned_hires: "Planned hires", projected_cost: "Projected cost" };

export function headcountToForm(item) {
  const n = (v) => (v == null ? "" : String(v));
  return {
    department_id: item.department_id ? String(item.department_id) : "",
    fiscal_year: n(item.fiscal_year) || String(CURRENT_YEAR),
    approved_positions: n(item.approved_positions),
    filled_positions: n(item.filled_positions),
    vacant_positions: n(item.vacant_positions),
    planned_hires: n(item.planned_hires),
    projected_cost: item.projected_cost == null ? "" : String(Number(item.projected_cost)),
  };
}

const count = (raw, label) => {
  const v = String(raw ?? "").trim();
  if (!v) return "";                                       // an empty count means 0
  if (!/^\d+$/.test(v)) return `${label} must be a whole number, 0 or more.`;
  if (Number(v) > 100000) return `${label} must be between 0 and 100000.`;
  return "";
};

const num = (raw) => (String(raw ?? "").trim() === "" ? 0 : Number(String(raw).trim()));

/** { field: message }; `ids` is the list of departments the person could choose from (null if it could not be loaded). */
export function validateHeadcount(f, ids = null) {
  const errors = {};
  if (!f.department_id) errors.department_id = "Choose the department this headcount is for.";
  else if (ids && !ids.map(String).includes(String(f.department_id))) errors.department_id = "The selected department was not found. Choose a department from the list.";

  const year = String(f.fiscal_year ?? "").trim();
  if (!year) errors.fiscal_year = "Fiscal year is required.";
  else if (!/^\d{4}$/.test(year)) errors.fiscal_year = "Fiscal year must be a four-digit year.";
  else if (Number(year) < 2020 || Number(year) > 2100) errors.fiscal_year = "Fiscal year must be between 2020 and 2100.";

  for (const key of ["approved_positions", "filled_positions", "vacant_positions", "planned_hires"]) {
    const msg = count(f[key], HEADCOUNT_LABELS[key]);
    if (msg) errors[key] = msg;
  }
  const cost = String(f.projected_cost ?? "").trim();
  if (cost) {
    if (!/^\d+(\.\d+)?$/.test(cost)) errors.projected_cost = "Projected cost must be a positive number.";
    else if (!/^\d+(\.\d{1,2})?$/.test(cost)) errors.projected_cost = "Projected cost can have at most 2 decimal places.";
  }
  if (!errors.approved_positions && !errors.filled_positions && !errors.vacant_positions) {
    const approved = num(f.approved_positions), filled = num(f.filled_positions), vacant = num(f.vacant_positions);
    if (filled > approved) errors.filled_positions = "Filled positions cannot be more than approved positions.";
    else if (vacant > approved) errors.vacant_positions = "Vacant positions cannot be more than approved positions.";
    else if (filled + vacant > approved) errors.vacant_positions = "Filled plus vacant positions cannot be more than approved positions.";
  }
  return errors;
}

export function headcountPayload(f) {
  return {
    department_id: Number(f.department_id),
    fiscal_year: Number(String(f.fiscal_year).trim()),
    approved_positions: num(f.approved_positions),
    filled_positions: num(f.filled_positions),
    vacant_positions: num(f.vacant_positions),
    planned_hires: num(f.planned_hires),
    projected_cost: num(f.projected_cost),
  };
}

/** The server's refusal as { field: message }; a whole-record message (the totals) belongs under Vacant positions. */
export function serverHeadcountErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    const raw = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    const key = typeof raw === "string" && raw !== "body" ? raw : "vacant_positions";
    if (out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    out[key] = /^value error,\s*/i.test(msg) ? msg.replace(/^value error,\s*/i, "") : `${HEADCOUNT_LABELS[key] || key} is not valid.`;
  }
  return out;
}

/** Which field a plain server refusal (a 400) belongs under. */
export function headcountRefusalField(message) {
  const m = String(message || "");
  if (/department/i.test(m) && /not found/i.test(m)) return "department_id";
  if (/already has a headcount record/i.test(m)) return "fiscal_year";
  if (/positions cannot/i.test(m) || /Filled plus vacant/i.test(m)) return "vacant_positions";
  return null;
}

/** What the Department column shows: the name from the server, then the department list, then the id; never a bare dash. */
export function departmentText(row, departments = []) {
  if (row.department_name) return row.department_name;
  const found = departments.find((d) => String(d.id) === String(row.department_id));
  if (found?.name) return found.name;
  return row.department_id ? `Department #${row.department_id}` : "No department";
}
