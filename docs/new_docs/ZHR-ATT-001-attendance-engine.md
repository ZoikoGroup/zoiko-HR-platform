# ZHR-ATT-001: Attendance engine

How Zoiko HR records, calculates and closes working days. Built in milestones M0–M9 on the `venu` branch (commits
`c405e48` for M0–M7, and the M8–M9 commit that adds this document).

## Contents

1. [What it does](#1-what-it-does)
2. [How a day's status is decided](#2-how-a-days-status-is-decided)
3. [Time zones, work dates and night shifts](#3-time-zones-work-dates-and-night-shifts)
4. [Settings](#4-settings)
5. [Who sees and does what](#5-who-sees-and-does-what)
6. [API](#6-api)
7. [Corrections and approvals](#7-corrections-and-approvals)
8. [The end-of-day job](#8-the-end-of-day-job)
9. [Audit trail](#9-audit-trail)
10. [Data model and migrations](#10-data-model-and-migrations)
11. [Code map](#11-code-map)
12. [Rollout checklist](#12-rollout-checklist)
13. [Demo data and tests](#13-demo-data-and-tests)
14. [Known limits and later phases](#14-known-limits-and-later-phases)

## 1. What it does

| For | Capability |
|---|---|
| Employees | Punch in and out, take breaks, see a live timer, a month calendar, KPIs over working days, and each day's history; ask for a correction |
| Managers | The same for themselves; their team in the attendance log, the live Today panel and the approvals queue |
| HR and Org Admin | The whole organization: the attendance log with filters and exports, add or edit a day (with a reason), remove a day (soft delete), each record's history, approvals |
| The system | Calculates late, half day, hours and overtime on every change; closes each finished day with a stored status |

## 2. How a day's status is decided

The rules live in one pure function (`hr/attendance/status_engine.py: resolve`). Order of precedence:

| # | Situation | Status |
|---|---|---|
| 1 | Not employed that day (before joining, after leaving) | none |
| 2 | HR set the status (`status_locked`) | kept as set (totals still recalculated) |
| 3 | Holiday | **Holiday** (if they worked: **Present**, all of it counted as beyond the standard day) |
| 4 | Not a working day for the person | **Weekly off** (same rule if they worked) |
| 5 | Approved leave | **On leave**; work-from-home leave: **Remote**; half-day leave with a punch: **Half day** |
| 6 | No punch-in, day over | **Absent** (while the day runs: no status yet) |
| 7 | Punched in, never out, day over | **Missed punch-out** (0 hours until a correction is approved) |
| 8 | Net worked time below the half-day threshold | **Half day** |
| 9 | Punch-in after shift start + grace | **Late** |
| 10 | Otherwise | **Present** |

- **Net worked time** = punch-out − punch-in − breaks (breaks clipped to the worked span).
- **Beyond the standard day** = net time − standard day (shift, else organization setting, else 8 h). It counts as
  overtime only when an overtime request is approved (`overtime_authorized_hours`).
- **No shift assigned** = nobody is late; hours count against the standard day.

**My Attendance KPIs** (`me_service.month_view`, revised 2026-11-23, B4/B5):

| KPI | Formula |
|---|---|
| Working days (due) | Working days up to yesterday, plus today once punched in (holidays and weekly offs never count) |
| Expected days | Due working days − approved leave days |
| Present days | Attended due working days (present, late, remote = 1, half day = ½) / expected days. Work on a weekly off or holiday is not attendance, so the rate never exceeds 100% |
| Punctuality | Punch-ins on due working days with no late minutes / all such punch-ins (leave without a punch is not "on time") |
| Average daily hours | Worked minutes / days with a punch-out (holiday and weekly-off work excluded; missed punch-outs excluded) |

**Leave decided after the day closed** (B6): approving, cancelling, re-dating or deleting leave recalculates the stored
days it covers up to today (`hr/attendance/leave_sync.py`), so Absent becomes On leave and back. HR-locked statuses
are kept; each change is audited as `auto_marked` with the reason.
- **Which shift applies:** that date's roster entry → the person's assigned shift for the period (`employee_shifts`)
  → the organization's default shift → none.

## 3. Time zones, work dates and night shifts

- Instants are stored in **UTC** (`check_in_at`, `check_out_at`, break `start_at` / `end_at`). The old `check_in` /
  `check_out` columns are kept as the **local wall-clock** mirror for the existing dashboard, analytics and exports.
- A person's time zone is their own (`employees.timezone`), else the organization's (`organizations.timezone`), else UTC.
- The **work date** is the local date of the punch-in. A punch-out after midnight closes the day it started (up to 20
  hours later), so night shifts work without special handling.
- Durations are measured between UTC instants, so a day with a daylight-saving change is 23 or 25 hours long.
- "Today" on dashboards and presets is the organization's local date.

## 4. Settings

Stored per organization in `organization_configs` (`hr/work_settings.py`).

| Key | Default | Meaning |
|---|---|---|
| `attendance.grace_minutes` | 10 | Minutes after shift start before a check-in is late (a shift with 0 grace uses this) |
| `attendance.half_day_min_hours` | 4 | Net hours below which a day is a half day (a shift may set its own) |
| `attendance.standard_workday_hours` | 8 | Standard day when the shift sets none |
| `attendance.overtime_requires_approval` | true | Overtime counts only when approved |
| `attendance.default_shift_id` | none | Shift for people with no roster entry or assignment |
| `attendance.auto_close_punch_out` | true | The end-of-day job closes a missing punch-out as Missed punch-out |
| `attendance.allow_web_punch` | true | Employees may punch in the browser |
| `attendance.edit_lock_days` | none | Days after which past attendance can no longer be edited |

Working days come from Leave settings (`leave_settings.working_days`, Mon–Fri when unset); a shift may override them.

## 5. Who sees and does what

| Action | Employee | Manager | HR Admin / Org Admin |
|---|---|---|---|
| Punch, breaks, own month, own day, corrections | own | own | own |
| Attendance log, record history | own rows only (no history) | self + reports (read) | everyone, read and write |
| Add / edit / remove a record (reason required) | — | — | ✓ |
| Live Today panel | — | self + reports | everyone |
| Approvals queue | — | self + reports; decides for reports only | everyone; decides for anyone |
| Decide own request | never | never | never |

The rule lives in `attendance_service.viewer_scope()`. Records and rosters only name people and shifts of the caller's
own organization. All routes are in the entitlement map under `hr.attendance.core`.

## 6. API

**Self-service (`/hr/me/attendance`)**

| Method | Path | Purpose |
|---|---|---|
| GET | `/today` | Today's punches, breaks, live totals, shift and which actions are allowed |
| POST | `/punch-in` | Punch in (a repeat within 2 minutes returns the day with `already: true`) |
| POST | `/punch-out` | `{note?}`; ends a running break |
| POST | `/break/start`, `/break/end` | Breaks |
| GET | `?month=YYYY-MM` | Every day of the month with a status, plus KPIs over working days |
| GET | `/days/{date}` | One day with breaks and history |

Errors carry a code: `ATT_ALREADY_IN`, `ATT_NOT_IN`, `ATT_ALREADY_OUT`, `ATT_ON_BREAK`, `ATT_NOT_ON_BREAK`,
`ATT_DAY_CLOSED`, `ATT_LOCKED`, `ATT_PUNCH_DISABLED`, `ATT_EXISTS`, `ATT_INVALID`, `ATT_NOT_FOUND`. Punches are rate
limited (12 per minute).

**Administration (`/hr/attendance`)**

| Method | Path | Purpose |
|---|---|---|
| GET | `/records` | Log: `page, per_page ≤ 200, preset (today, yesterday, this_week, this_month, last_month), date_from, date_to, status, department_id, source, search, employee_id, sort_by, sort_order` |
| POST | `/records` | Add (reason required) |
| GET | `/records/{id}` | One record with breaks |
| PATCH / PUT | `/records/{id}` | Change (reason required; `unlock_status` returns to the calculated status) |
| DELETE | `/records/{id}?reason=` | Soft delete |
| GET | `/records/{id}/audit` | History |
| GET | `/export/csv`, `/export/excel` | Same filters as the log |
| GET | `/dashboard/today` | Live Today panel (includes `last_closed`) |
| GET | `/approvals` | `type (all, correction, overtime), status (pending, approved, rejected, all), page, per_page` |
| GET / POST / PUT / DELETE | `/shifts`, `/shifts/{id}` | Shifts with `standard_hours`, `working_days`, `half_day_min_minutes`, `min_present_minutes`; a shift in use cannot be deleted (409 `SHIFT_IN_USE`: deactivate it) |
| GET | `/shift-assignments` | Who works which shift: `employee_id, shift_id, active_on, page, per_page` |
| POST | `/shift-assignments` | `{shift_id, effective_from, effective_to?, employee_ids[], department_id?}`; a running assignment ends the day before (its remainder continues after a dated one); one that starts inside the new period is refused (409 `SHIFT_ASSIGNMENT_OVERLAP`); audited `shift_assigned`, notified `shift.assigned`, event `attendance.shift.assigned` |
| POST | `/shift-assignments/{id}/end` | `{effective_to}`; audited `shift_ended`, notified `shift.changed` |

`GET /hr/me/attendance/today` also returns `required_minutes`, `next_shift_change` (`{date, shift}` within 60 days) and
`pending_shift_notice` (a shift notice document still waiting for the person's acknowledgement).

**Admin screen:** Attendance → **Shifts & Work Policy** (`/zoiko-hr/attendance/shifts`) with tabs Shifts, Assignments,
Roster & notices (publish a pattern / change shifts, moved from Working time requests) and Work policy (every
`attendance.*` setting, moved from Working time requests → Settings). Publishing or changing a roster also sends the
in-app `shift.assigned` / `shift.changed` notification.

**Requests (`/hr/time`)**: `POST /corrections` (kinds: `missed_punch`, `time_change`, `wrong_status`, `break`),
`POST /corrections/{id}/decision`, `POST /overtime`, `POST /overtime/{id}/decision`.

## 7. Corrections and approvals

| Kind | The person gives | On approval |
|---|---|---|
| Missed punch | check-out (check-in optional) | the day is completed and recalculated |
| Wrong times | check-in and check-out (overnight understood) | times replaced, recalculated |
| Wrong status | Present, Remote or Half day (leave goes through Leave) | status set and locked |
| Breaks | up to 6 breaks | breaks replaced, recalculated |

One pending request per person per day; only today or past days. A refusal needs a reason and changes nothing.
An approval writes the local and UTC times and recalculates the day, and adds a `corrected` audit entry. Approved
overtime adds an `overtime_approved` entry. The originals stay on the request.

## 8. The end-of-day job

`hr_attendance_end_of_day` runs every 30 minutes on the scheduler leader (`hr/attendance/jobs.py`, registered from
`doc_templates/jobs.register`). For each organization, once the day is past **00:30 the next morning in every time zone
its people work in** (the organization's own and each person's personal time zone, B7), it closes
the finished day: Absent / On leave / Remote / Holiday / Weekly off rows for people without a record, Missed punch-out for
open days (one in-app notice, none if a correction is already waiting), and a final recalculation of complete days.

| Safety rule | How |
|---|---|
| Never deletes | Only creates (`source=system`, `auto_marked=true`) or updates totals and unlocked statuses |
| HR decisions kept | A locked status is never changed |
| Runs twice safely | Each closed day is stored in `attendance_day_closures` |
| No retroactive absences | Only organizations with attendance in the last 30 days; the first run closes one day; catch-up (up to 7 days) never goes before the first closed day |
| Pauses | Organization automation pause, global pause (`HR_AUTOMATION_PAUSED` or the platform setting), `HR_BACKGROUND_JOBS=off` |
| Leavers and joiners | Only people employed that day |

## 9. Audit trail

`attendance_audit_log` is append-only and written only through `hr/attendance/audit.record`.

| Action | Written by |
|---|---|
| `punch_in`, `punch_out`, `break_start`, `break_end` | the person |
| `created`, `updated`, `deleted` | HR, with the reason |
| `corrected`, `overtime_approved` | the approver |
| `auto_marked` | the system (end-of-day job) |
| `merged` | the M1 migration (duplicate days) |

Each entry holds the actor, the time, before and after values of the changed fields, the reason, IP and user agent.

## 10. Data model and migrations

| Table | Purpose |
|---|---|
| `attendance_records` (extended) | One live record per person per day: local and UTC times, status, source, shift, late / break / worked / overtime minutes, status lock, auto-marked, created / updated by |
| `attendance_breaks` | Breaks (UTC) |
| `employee_shifts` | A person's shift over a period |
| `shift_rosters` (extended) | Now has `organization_id` |
| `attendance_correction_requests` (extended) | `kind`, `requested_status`, `requested_breaks` |
| `attendance_audit_log` | Trail (above) |
| `attendance_day_closures` | Days closed by the job |

New statuses: `weekly_off`, `missed_punch`.

| Revision | What it does |
|---|---|
| `a7c1d2e3f4a0` | New tables, columns, indexes; status values on PostgreSQL |
| `a7c1d2e3f4a1` | Merges duplicate days (newest kept, others soft-deleted with a `merged` audit entry), fills UTC times from the local times, fills roster organizations |
| `a7c1d2e3f4a2` | Unique index: one live record per (organization, employee, date) |
| `a7c1d2e3f4a3` | `attendance_day_closures` |

All four are guarded (safe to re-run) and reversible. The data steps run only through `alembic upgrade head`, never on
application start.

## 11. Code map

```
backend/app/modules/hr/attendance/
  constants.py        statuses, sources, error codes
  models.py           breaks, employee shifts, audit log, day closures
  clock.py            time zones, work dates, UTC <-> local
  policy.py           settings, working days, shift precedence, holidays, leave (single day and ranges)
  status_engine.py    the rules (pure)
  audit.py            the only writer of the trail
  punch_service.py    punching, breaks, recompute(), today
  me_service.py       month view and KPIs, day detail
  me_router.py        /hr/me/attendance/*
  records_service.py  the admin log
  dashboard_today.py  live Today
  approvals_service.py approvals queue
  day_close.py        end-of-day close
  jobs.py             scheduler entry point
  backfill.py         migration data steps
  shift_assignments.py who works which shift (employee_shifts): list, assign, end
  leave_sync.py       a leave decision recalculates stored days
backend/app/modules/hr/attendance_router.py, attendance_service.py, time_documents.py  (existing, extended)
backend/scripts/seed_attendance.py
frontend/src/service/attendanceService.js
frontend/src/modules/zoiko-hr/attendance/
  constants.js, hooks/ (useMyAttendance, useAttendanceAdmin, useAttendanceToday, useAttendanceApprovals)
  components/ (PunchCard, ShiftInfoCard, AttendanceCalendar, DayDetailDrawer, CorrectionForm, AttendanceStatusChip,
               AttendanceSubNav, DateRangeFilter, RecordFormDialog, AuditTrailDrawer, TodayPanel)
  daily-records.jsx, ApprovalsPage.jsx, dashboard.jsx
frontend/src/pages/Peoples/Employees/ESS/Employee_EssAttendance.jsx, Employee_TimeRequests.jsx
```

## 12. Rollout checklist

1. Run `alembic upgrade head` on **staging**; check one organization's attendance page and log.
2. Make sure each organization's time zone is right (Settings → Organization).
3. Optionally set a default shift, grace and half-day threshold, and assign shifts.
4. Keep background jobs on (`HR_BACKGROUND_JOBS` not `off`) so the end-of-day job runs.
5. Then production.

## 13. Demo data and tests

- `python scripts/seed_attendance.py --org <id>` fills one organization with 30 days of realistic, closed days (local
  databases only unless `--force`).
- Backend tests: `tests/attendance/` (M0–M9). Frontend tests: `__tests__/attendance*.test.mjs`.

## 14. Known limits and later phases

| Not in this release | Planned |
|---|---|
| Several punch sessions in one day | Phase 2 |
| Work from home / on duty / field punch types, GPS or IP capture, geo-fence | Phase 2 |
| Missed-punch reminders during the day, weekly hours chart, work-log note | Phase 2 |
| Late-mark rules (e.g. 3 lates = half day), monthly sheet, payroll export, absence alerts | Phase 2 |
| Biometric / RFID sync, face recognition, mobile offline punch, comp-off | Phase 3 |
