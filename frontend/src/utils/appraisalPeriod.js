// The period an appraisal covers. Mirrors backend/app/core/appraisal_period.py so the form and the API agree.
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const PERIOD_HELP = "Enter a year (2025), consecutive years (2024-2025), or a quarter or half (Q1 2026, H2 2025).";

const yearOk = (y) => y >= MIN_YEAR && y <= MAX_YEAR;

/** Returns { value, error }: the period in its standard written form, or a message for the user. */
export function parseAppraisalPeriod(raw) {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return { value: "", error: `The appraisal period is required. ${PERIOD_HELP}` };

  let m = text.match(/^(\d{4})$/);
  if (m) {
    const y = Number(m[1]);
    return yearOk(y) ? { value: String(y), error: "" } : { value: "", error: `${y} is not a valid year. Use a year between ${MIN_YEAR} and ${MAX_YEAR}.` };
  }

  m = text.match(/^(\d{4})\s*[-–—/]\s*(\d{4}|\d{2})$/);
  if (m) {
    const start = Number(m[1]);
    const end = m[2].length === 4 ? Number(m[2]) : Math.floor(start / 100) * 100 + Number(m[2]);
    if (!yearOk(start) || !yearOk(end)) return { value: "", error: `"${text}" has a year outside ${MIN_YEAR}-${MAX_YEAR}. Years must have four digits, like 2024-2025.` };
    if (end !== start + 1) return { value: "", error: `"${text}" is not a valid period. The second year must be the year after the first, like ${start}-${start + 1}.` };
    return { value: `${start}-${end}`, error: "" };
  }

  m = text.match(/^([QH])(\d)[\s-]*(\d{4})$/i);
  if (m) {
    const kind = m[1].toUpperCase();
    const n = Number(m[2]);
    if ((kind === "Q" && n >= 1 && n <= 4) || (kind === "H" && n >= 1 && n <= 2)) {
      const y = Number(m[3]);
      if (!yearOk(y)) return { value: "", error: `${y} is not a valid year. Use a year between ${MIN_YEAR} and ${MAX_YEAR}.` };
      return { value: `${kind}${n} ${y}`, error: "" };
    }
  }

  return { value: "", error: `"${text}" is not a valid appraisal period. ${PERIOD_HELP}` };
}

/** Checks the whole appraisal form; returns { errors: {field: message}, cycle } with the standardised period. */
export function validateAppraisalForm(f) {
  const errors = {};
  if (!f.employee_id) errors.employee_id = "Choose the employee being appraised.";
  const period = parseAppraisalPeriod(f.cycle);
  if (period.error) errors.cycle = period.error;
  if (f.reviewer_id && String(f.reviewer_id) === String(f.employee_id)) errors.reviewer_id = "An employee cannot be their own manager reviewer.";
  for (const [key, label] of [["self_score", "Self score"], ["manager_score", "Manager score"], ["final_score", "Final score"]]) {
    if (f[key] === "" || f[key] == null) continue;
    const n = Number(f[key]);
    if (!Number.isFinite(n) || n < 0 || n > 5) errors[key] = `${label} must be between 0 and 5.`;
  }
  if (f.salary_hike !== "" && f.salary_hike != null) {
    const n = Number(f.salary_hike);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.salary_hike = "Salary hike must be between 0 and 100 percent.";
  }
  return { errors, cycle: period.value };
}
