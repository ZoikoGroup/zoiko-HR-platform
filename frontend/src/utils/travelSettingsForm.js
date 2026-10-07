// Travel settings: the same rules as the server (backend/app/modules/hr/schemas.py, TravelSettingUpdate).
export const WORKFLOWS = [
  { value: "manager", label: "Manager Only" },
  { value: "manager+director", label: "Manager + Director" },
  { value: "manager+director+finance", label: "Manager + Director + Finance" },
];

export const DEFAULT_SETTINGS = {
  approval_workflow: "manager",
  expense_limit_per_day: "500",
  max_trip_duration: "30",
  auto_approve_threshold: "1000",
  reimbursement_deadline: "30",
  notification_enabled: true,
};

export const SETTING_LABELS = {
  approval_workflow: "Approval workflow",
  expense_limit_per_day: "Daily expense limit",
  max_trip_duration: "Maximum trip duration",
  auto_approve_threshold: "Auto-approve threshold",
  reimbursement_deadline: "Reimbursement deadline",
};

export function settingsToForm(data) {
  const text = (v, fallback) => (v == null || v === "" ? fallback : String(Number(v)));
  return {
    approval_workflow: WORKFLOWS.some((w) => w.value === data?.approval_workflow) ? data.approval_workflow : DEFAULT_SETTINGS.approval_workflow,
    expense_limit_per_day: text(data?.expense_limit_per_day, DEFAULT_SETTINGS.expense_limit_per_day),
    max_trip_duration: text(data?.max_trip_duration, DEFAULT_SETTINGS.max_trip_duration),
    auto_approve_threshold: text(data?.auto_approve_threshold, DEFAULT_SETTINGS.auto_approve_threshold),
    reimbursement_deadline: text(data?.reimbursement_deadline, DEFAULT_SETTINGS.reimbursement_deadline),
    notification_enabled: data?.notification_enabled !== false,
  };
}

const bounded = (raw, label, low, high, { whole = true, unit = "" } = {}) => {
  const v = String(raw ?? "").trim();
  if (!v) return `${label} is required.`;
  if (!/^\d+(\.\d+)?$/.test(v)) return `${label} must be a number.`;
  if (whole && !/^\d+$/.test(v)) return `${label} must be a whole number.`;
  const n = Number(v);
  if (n < low || n > high) return `${label} must be between ${low} and ${high}${unit}.`;
  if (!whole && !/^\d+(\.\d{1,2})?$/.test(v)) return `${label} can have at most 2 decimal places.`;
  return "";
};

/** { field: message } for everything wrong with the settings; empty when they can be saved. */
export function validateSettings(f) {
  const errors = {};
  if (!WORKFLOWS.some((w) => w.value === f.approval_workflow)) errors.approval_workflow = "Choose Manager Only, Manager + Director, or Manager + Director + Finance.";
  const checks = [
    ["expense_limit_per_day", bounded(f.expense_limit_per_day, SETTING_LABELS.expense_limit_per_day, 0, 1000000, { whole: false })],
    ["max_trip_duration", bounded(f.max_trip_duration, SETTING_LABELS.max_trip_duration, 1, 365, { unit: " days" })],
    ["auto_approve_threshold", bounded(f.auto_approve_threshold, SETTING_LABELS.auto_approve_threshold, 0, 10000000)],
    ["reimbursement_deadline", bounded(f.reimbursement_deadline, SETTING_LABELS.reimbursement_deadline, 1, 365, { unit: " days" })],
  ];
  for (const [key, msg] of checks) if (msg) errors[key] = msg;
  return errors;
}

export function settingsPayload(f) {
  return {
    approval_workflow: f.approval_workflow,
    expense_limit_per_day: Number(String(f.expense_limit_per_day).trim()),
    max_trip_duration: Number(String(f.max_trip_duration).trim()),
    auto_approve_threshold: Number(String(f.auto_approve_threshold).trim()),
    reimbursement_deadline: Number(String(f.reimbursement_deadline).trim()),
    notification_enabled: !!f.notification_enabled,
  };
}

export function serverSettingErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    const key = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof key !== "string" || key === "body" || out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^value error,\s*/i.test(msg)) out[key] = msg.replace(/^value error,\s*/i, "");
    else out[key] = `${SETTING_LABELS[key] || key} is not valid.`;
  }
  return out;
}
