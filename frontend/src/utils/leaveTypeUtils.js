/**
 * leaveTypeUtils.js
 * Shared leave-type label and colour helpers.
 *
 * Backend returns LeaveType enum values in lowercase (e.g. "sick", "annual").
 * These maps convert them to UI-friendly labels and brand colours.
 */

/** Human-readable display label for each backend LeaveType value. */
export const LEAVE_TYPE_LABELS = {
  annual:        "Annual Leave",
  sick:          "Sick Leave",
  casual:        "Casual Leave",
  unpaid:        "Unpaid Leave",
  maternity:     "Maternity Leave",
  paternity:     "Paternity Leave",
  bereavement:   "Bereavement Leave",
  work_from_home:"Work From Home",
  earned:        "Earned Leave",
  emergency:     "Emergency Leave",
  study:         "Study Leave",
  comp_off:      "Comp Off",
  sabbatical:    "Sabbatical Leave",
  other:         "Other",
};

/**
 * Brand colour per leave type.
 * These hex values are the source of truth; Tailwind class equivalents are
 * also listed in LEAVE_TYPE_ACCENT for components that need a CSS class.
 */
export const LEAVE_TYPE_COLORS = {
  annual:        "#3B82F6",  // blue-500
  sick:          "#059669",  // emerald-600
  casual:        "#0EA5E9",  // sky-500
  unpaid:        "#DC2626",  // red-600
  maternity:     "#8B5CF6",  // violet-500
  paternity:     "#6366F1",  // indigo-500
  bereavement:   "#F59E0B",  // amber-500
  work_from_home:"#10B981",  // emerald-500
  earned:        "#14B8A6",  // teal-500
  emergency:     "#EF4444",  // red-500
  study:         "#6366F1",  // indigo-500
  comp_off:      "#0EA5E9",  // sky-500
  sabbatical:    "#8B5CF6",  // violet-500
  other:         "#6B7280",  // gray-500
};

/** Tailwind text-colour class equivalents for colour-coded badge/icon use. */
export const LEAVE_TYPE_ACCENT = {
  annual:        "text-blue-600 dark:text-blue-400",
  sick:          "text-emerald-600 dark:text-emerald-400",
  casual:        "text-sky-600 dark:text-sky-400",
  unpaid:        "text-red-600 dark:text-red-400",
  maternity:     "text-violet-600 dark:text-violet-400",
  paternity:     "text-indigo-600 dark:text-indigo-400",
  bereavement:   "text-amber-600 dark:text-amber-400",
  work_from_home:"text-emerald-500 dark:text-emerald-400",
  earned:        "text-teal-600 dark:text-teal-400",
  emergency:     "text-red-500 dark:text-red-400",
  study:         "text-indigo-500 dark:text-indigo-400",
  comp_off:      "text-sky-500 dark:text-sky-400",
  sabbatical:    "text-violet-500 dark:text-violet-400",
  other:         "text-gray-500 dark:text-gray-400",
};

const FALLBACK_LABEL  = "Leave";
const FALLBACK_COLOR  = "#6B7280";
const FALLBACK_ACCENT = "text-gray-500 dark:text-gray-400";

/**
 * Normalise a leave_type value from the API (or a friendly label from the
 * frontend form) to the canonical lowercase key used in the maps above.
 *
 * Examples:
 *   "sick"       → "sick"
 *   "Sick Leave" → "sick"
 *   "ANNUAL"     → "annual"
 */
export function normalizeLeaveTypeKey(raw) {
  if (!raw) return null;
  const lower = String(raw).trim().toLowerCase();
  // Already a known key?
  if (LEAVE_TYPE_LABELS[lower]) return lower;
  // Try stripping " leave" suffix ("annual leave" → "annual")
  const stripped = lower.replace(/\s+leave$/, "").replace(/\s+/g, "_");
  if (LEAVE_TYPE_LABELS[stripped]) return stripped;
  // "work from home" → "work_from_home"
  const underscored = lower.replace(/\s+/g, "_");
  if (LEAVE_TYPE_LABELS[underscored]) return underscored;
  return null;
}

/**
 * Return a human-readable label for any leave_type value (API enum or form string).
 * Falls back to the raw value (capitalised) or "Leave".
 */
export function formatLeaveType(raw) {
  if (!raw) return FALLBACK_LABEL;
  const key = normalizeLeaveTypeKey(raw);
  if (key && LEAVE_TYPE_LABELS[key]) return LEAVE_TYPE_LABELS[key];
  // Graceful fallback: capitalise the raw string
  return String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
}

/** Return the hex colour for a leave type, or a neutral gray. */
export function leaveTypeColor(raw) {
  const key = normalizeLeaveTypeKey(raw);
  return (key && LEAVE_TYPE_COLORS[key]) || FALLBACK_COLOR;
}

/** Return the Tailwind accent class for a leave type. */
export function leaveTypeAccent(raw) {
  const key = normalizeLeaveTypeKey(raw);
  return (key && LEAVE_TYPE_ACCENT[key]) || FALLBACK_ACCENT;
}

