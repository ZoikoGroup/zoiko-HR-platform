// Resolves the employment status shown for an employee.
//
// The dashboard used to treat `status === "active"` as proof that an employee
// was on leave, so every active employee rendered as "On Leave" while user
// management correctly showed them as "Active". Employment status and
// attendance status are different fields and must not be conflated: an
// employee is on leave only when a leave signal actually says so.

import { pick } from "./fieldAccess.js";

// EmployeeStatus enum values (backend/app/modules/employee/models.py).
const EMPLOYMENT_LABELS = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
  on_leave: "On Leave",
  terminated: "Terminated",
  resigned: "Resigned",
  deactivated: "Deactivated",
  suspended: "Suspended",
  locked: "Locked",
  archived: "Archived",
};

// Employment states that mean the employee is not currently working.
const NOT_WORKING = new Set([
  "terminated",
  "resigned",
  "deactivated",
  "archived",
  "locked",
  "suspended",
]);

// Attendance/leave signals that put an employee on leave today.
const LEAVE_SIGNALS = new Set(["on_leave", "on leave", "on-leave"]);

/**
 * Normalize a raw status value to a comparable lowercase key.
 * Returns "" when the value is absent or not a usable string.
 */
function normalize(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

/**
 * The employee's employment status key, e.g. "active" or "on_leave".
 * Returns "" when the API payload carries no employment status at all.
 */
export function employmentStatusKey(emp) {
  return normalize(
    pick(emp, "status", "employment_status", "employmentStatus", "employee_status")
  );
}

/**
 * True only when an explicit leave signal is present. "active" is never a
 * leave signal - that was the dashboard/user-management disagreement.
 */
export function hasLeaveSignal(emp) {
  const leaveStatus = normalize(pick(emp, "leave_status", "leaveStatus"));
  const attendanceStatus = normalize(pick(emp, "attendance_status", "attendanceStatus"));
  return LEAVE_SIGNALS.has(leaveStatus) || LEAVE_SIGNALS.has(attendanceStatus);
}

/**
 * Display status for one employee row.
 *
 * @returns {{label: string, tone: "working"|"leave"|"attention"|"neutral", isOnLeave: boolean}}
 *   tone drives the status dot colour in the UI.
 */
export function resolveEmployeeDisplayStatus(emp) {
  const key = employmentStatusKey(emp);

  if (key === "on_leave" || hasLeaveSignal(emp)) {
    return { label: "On Leave", tone: "leave", isOnLeave: true };
  }

  if (!key) {
    // No employment status in the payload: fall back to whatever attendance
    // says, and treat the employee as working rather than guessing.
    return { label: "Working", tone: "working", isOnLeave: false };
  }

  if (key === "active") {
    return { label: "Active", tone: "working", isOnLeave: false };
  }

  if (key === "inactive" || key === "pending") {
    return { label: EMPLOYMENT_LABELS[key], tone: "attention", isOnLeave: false };
  }

  if (NOT_WORKING.has(key)) {
    return { label: EMPLOYMENT_LABELS[key] || key, tone: "neutral", isOnLeave: false };
  }

  // Unknown status value: surface it verbatim instead of silently mislabelling.
  return { label: EMPLOYMENT_LABELS[key] || key, tone: "neutral", isOnLeave: false };
}