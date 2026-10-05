/**
 * Tests for src/utils/employeeStatus.js
 *
 * Bug ZHR 42: the ZoikoHr dashboard's "Employee Status Overview" showed most
 * employees as "On Leave" while user management showed the same employees as
 * "Active". Cause: the dashboard treated `status === "active"` as a leave
 * signal. Employment status and attendance status are separate fields, and an
 * active employee is working.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEmployeeDisplayStatus,
  employmentStatusKey,
  hasLeaveSignal,
} from "../src/utils/employeeStatus.js";

test("an active employee is Active, never On Leave (ZHR 42 regression)", () => {
  const { label, isOnLeave } = resolveEmployeeDisplayStatus({
    status: "active",
    email: "a@zoiko.one",
  });
  assert.equal(label, "Active");
  assert.equal(isOnLeave, false);
});

test("a full active employee payload does not read as On Leave", () => {
  // Shape as returned by /hr/employees -> EmployeeResponse.
  const employee = {
    id: 7,
    email: "dana@zoiko.one",
    role: "employee",
    is_active: true,
    first_name: "Dana",
    last_name: "Reyes",
    full_name: "Dana Reyes",
    job_title: "Engineer",
    employment_type: "full_time",
    status: "active",
    date_of_joining: "2024-02-01",
  };
  const { label, isOnLeave } = resolveEmployeeDisplayStatus(employee);
  assert.equal(label, "Active");
  assert.equal(isOnLeave, false);
});

test("dashboard and user management agree for every EmployeeStatus value", () => {
  // The values user management renders, and the label it shows.
  const userManagement = {
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
  for (const [status, expected] of Object.entries(userManagement)) {
    assert.equal(
      resolveEmployeeDisplayStatus({ status }).label,
      expected,
      `status '${status}' must render as '${expected}'`
    );
  }
});

test("an explicit leave signal puts the employee on leave", () => {
  for (const key of ["leave_status", "attendance_status", "leaveStatus", "attendanceStatus"]) {
    const r = resolveEmployeeDisplayStatus({ status: "active", [key]: "on_leave" });
    assert.equal(r.label, "On Leave", `${key} on_leave should win`);
    assert.equal(r.isOnLeave, true);
  }
});

test("is_active boolean is not treated as a leave signal", () => {
  const r = resolveEmployeeDisplayStatus({ status: "active", is_active: true });
  assert.equal(r.isOnLeave, false);
  assert.equal(r.label, "Active");
});

test("a present attendance record overrides nothing on an active employee", () => {
  const r = resolveEmployeeDisplayStatus({
    status: "active",
    attendance_status: "present",
  });
  assert.equal(r.label, "Active");
  assert.equal(r.isOnLeave, false);
});

test("absent and late attendance still report employment status, not leave", () => {
  for (const status of ["absent", "late", "remote", "half_day", "holiday"]) {
    const r = resolveEmployeeDisplayStatus({ status: "active", attendance_status: status });
    assert.equal(r.label, "Active", `attendance '${status}' must not imply leave`);
    assert.equal(r.isOnLeave, false);
  }
});

test("missing status falls back to Working instead of guessing leave", () => {
  const r = resolveEmployeeDisplayStatus({ email: "x@zoiko.one" });
  assert.equal(r.label, "Working");
  assert.equal(r.isOnLeave, false);
});

test("unknown status values surface verbatim rather than being mislabelled", () => {
  const r = resolveEmployeeDisplayStatus({ status: "sabbatical" });
  assert.equal(r.label, "sabbatical");
  assert.equal(r.isOnLeave, false);
});

test("status matching is case- and whitespace-insensitive", () => {
  assert.equal(resolveEmployeeDisplayStatus({ status: " ACTIVE " }).label, "Active");
  assert.equal(resolveEmployeeDisplayStatus({ status: "On_Leave" }).label, "On Leave");
  assert.equal(resolveEmployeeDisplayStatus({ status: "active", leave_status: "On Leave" }).label, "On Leave");
});

test("employmentStatusKey and hasLeaveSignal agree with the resolved status", () => {
  assert.equal(employmentStatusKey({ status: "active" }), "active");
  assert.equal(employmentStatusKey({}), "");
  assert.equal(hasLeaveSignal({ status: "active" }), false);
  assert.equal(hasLeaveSignal({ leave_status: "on_leave" }), true);
});

test("a terminated employee is not working and not on leave", () => {
  const r = resolveEmployeeDisplayStatus({ status: "terminated" });
  assert.equal(r.label, "Terminated");
  assert.equal(r.isOnLeave, false);
  assert.equal(r.tone, "neutral");
});

test("status takes precedence over an unrelated leave field", () => {
  // on_leave in employment status wins even without attendance data.
  const r = resolveEmployeeDisplayStatus({ status: "on_leave" });
  assert.equal(r.label, "On Leave");
  assert.equal(r.isOnLeave, true);
});