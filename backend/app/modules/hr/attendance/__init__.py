"""Attendance engine (attendance plan, milestones M1–M9): punches and breaks, the status engine, shift and policy
resolution, time zones, the audit log and the end-of-day job.

Layering: routers -> services -> (policy, clock, status_engine, audit) -> models. `status_engine` is pure (no database)
so every rule can be unit-tested; only `audit.record` writes attendance_audit_log. The legacy attendance_router /
attendance_service keep serving the dashboard, analytics, holidays and exports.
"""
