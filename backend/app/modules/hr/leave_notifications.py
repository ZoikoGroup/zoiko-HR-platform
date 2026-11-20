"""
modules/hr/leave_notifications.py
---------------------------------
In-app notifications for leave events (A5, QA report 10 Nov 2026).

Called from the HR leave service layer (hr/service.py and hr/attendance_service.py), so every path that changes a leave's
status (HR review, update with a decision, ESS apply / withdraw, manager screens) notifies the right people:

  approved   -> the requester       "Your leave request for 12–14 Nov has been approved."
  rejected   -> the requester       "Your leave request for 12–14 Nov was not approved."
  submitted  -> the approver(s)     "New leave request from <name> awaiting your approval."
  cancelled  -> the approver(s)     "<name> cancelled their leave request for 12–14 Nov."

Never includes the leave reason, the decision reason or the leave type (sick / family leave details are sensitive).
Approvers follow LeaveSetting.approval_workflow: the reporting manager when the workflow involves a manager and the requester
has an active one, HR (admin / hr_admin) when it involves HR or there is no manager. The LeaveSetting notification_on_*
switches are honoured. A failure here is logged with ids only and never breaks the leave action.
"""
from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session

logger = logging.getLogger("zoiko.notifications.leave")

EMPLOYEE_LEAVE_LINK = "/employee/leaves?request={id}"
APPROVER_LEAVE_LINK = "/zoiko-hr/leave/requests?request={id}"


def period_label(start: date, end: date) -> str:
    """12 Nov · 12–14 Nov · 30 Nov – 2 Dec · 30 Dec 2026 – 2 Jan 2027"""
    if start is None:
        return ""
    end = end or start
    if start == end:
        return f"{start.day} {start:%b}"
    if start.year != end.year:
        return f"{start.day} {start:%b} {start.year} – {end.day} {end:%b} {end.year}"
    if start.month == end.month:
        return f"{start.day}–{end.day} {start:%b}"
    return f"{start.day} {start:%b} – {end.day} {end:%b}"


def _setting(db: Session, org_id: int):
    from app.modules.hr.models import LeaveSetting
    return db.query(LeaveSetting).filter(LeaveSetting.organization_id == org_id).first()


def _enabled(setting, flag: str) -> bool:
    value = getattr(setting, flag, None) if setting is not None else None
    return value is not False


def _status(record) -> str:
    return str(getattr(record.status, "value", record.status) or "").lower()


def approver_ids(db: Session, record, setting=None) -> list[int]:
    from app.modules.employee.models import Employee
    from app.modules.super_admin.admin_notifications import org_admin_user_ids

    workflow = str(getattr(setting, "approval_workflow", None) or "manager").lower()
    requester = db.query(Employee).filter(Employee.id == record.employee_id).first()
    ids: set[int] = set()
    manager_id = getattr(requester, "reporting_manager_id", None) if requester else None
    if "manager" in workflow and manager_id:
        ids.add(manager_id)
    if "hr" in workflow or "admin" in workflow or not ids:
        ids.update(org_admin_user_ids(db, record.organization_id))
    ids.discard(record.employee_id)                       # nobody approves their own request
    return sorted(ids)


def _requester_name(db: Session, record) -> str:
    from app.modules.employee.models import Employee
    e = db.query(Employee.first_name, Employee.last_name).filter(Employee.id == record.employee_id).first()
    name = f"{(e.first_name or '').strip()} {(e.last_name or '').strip()}".strip() if e else ""
    return name or "an employee"


def _send(db: Session, event: str, record, **kwargs) -> None:
    from app.modules.super_admin.admin_notifications import notify_users
    try:
        notify_users(db, org_id=record.organization_id, notification_type="leave", **kwargs)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("leave notification %s failed for leave %s (org %s)", event, getattr(record, "id", None),
                         getattr(record, "organization_id", None))


def leave_decided(db: Session, record) -> None:
    """Approved / rejected: tell the person who asked."""
    try:
        status = _status(record)
        if status not in ("approved", "rejected"):
            return
        setting = _setting(db, record.organization_id)
        if not _enabled(setting, "notification_on_approve" if status == "approved" else "notification_on_reject"):
            return
        period = period_label(record.start_date, record.end_date)
        if status == "approved":
            title, message = "Leave approved", f"Your leave request for {period} has been approved."
        else:
            title, message = "Leave not approved", f"Your leave request for {period} was not approved."
        _send(db, status, record, user_ids=[record.employee_id], title=title, message=message,
              link=EMPLOYEE_LEAVE_LINK.format(id=record.id))
    except Exception:
        logger.exception("leave notification decided failed for leave %s", getattr(record, "id", None))


def leave_submitted(db: Session, record) -> None:
    """A new request: tell whoever approves it."""
    try:
        setting = _setting(db, record.organization_id)
        if not _enabled(setting, "notification_on_submit"):
            return
        name = _requester_name(db, record)
        _send(db, "submitted", record, user_ids=approver_ids(db, record, setting), title="Leave request awaiting approval",
              message=f"New leave request from {name} awaiting your approval.", priority="normal",
              link=APPROVER_LEAVE_LINK.format(id=record.id))
    except Exception:
        logger.exception("leave notification submitted failed for leave %s", getattr(record, "id", None))


def leave_cancelled(db: Session, record) -> None:
    """The employee withdrew a request: tell whoever would have approved it."""
    try:
        setting = _setting(db, record.organization_id)
        name = _requester_name(db, record)
        period = period_label(record.start_date, record.end_date)
        _send(db, "cancelled", record, user_ids=approver_ids(db, record, setting), title="Leave request cancelled",
              message=f"{name} cancelled their leave request for {period}.",
              link=APPROVER_LEAVE_LINK.format(id=record.id))
    except Exception:
        logger.exception("leave notification cancelled failed for leave %s", getattr(record, "id", None))
