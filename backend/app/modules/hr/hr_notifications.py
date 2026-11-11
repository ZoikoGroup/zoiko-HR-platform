"""
modules/hr/hr_notifications.py
------------------------------
In-app notifications to the employee an HR action is about (A5, QA report 10 Nov 2026).

One call per event, from the service function that makes the decision, so every screen that decides gets it:

    notify_employee(db, org_id, employee_id, EVENT, link="/employee/...")

Rules (ZHR-PRIV-001): the text names the event and, at most, the date or document title. It never carries a reason,
an amount, a leave type or any other detail; the employee opens the linked page for those. A failure is logged with ids
only and never breaks the action. The notification is written in a savepoint and committed by this helper, so it is
saved even when the action's own transaction was already committed by the caller.

Support tickets and assistant workflows are owned elsewhere and must not call this module.
"""
from __future__ import annotations

import logging
from typing import Iterable, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger("zoiko.notifications.hr")

# event -> (type, title, message). Messages may use {date} / {title} only.
EVENTS = {
    "overtime.approved": ("attendance", "Overtime approved", "Your overtime request for {date} has been approved."),
    "overtime.rejected": ("attendance", "Overtime not approved", "Your overtime request for {date} was not approved."),
    "correction.approved": ("attendance", "Attendance correction approved", "Your attendance correction for {date} has been approved."),
    "correction.rejected": ("attendance", "Attendance correction not approved", "Your attendance correction for {date} was not approved."),
    "expense.approved": ("expense", "Expense claim approved", "Your expense claim has been approved."),
    "expense.rejected": ("expense", "Expense claim not approved", "Your expense claim was not approved."),
    "expense.reimbursed": ("expense", "Expense claim reimbursed", "Your expense claim has been marked as reimbursed."),
    "travel.approved": ("travel", "Travel request approved", "Your travel request has been approved."),
    "travel.rejected": ("travel", "Travel request not approved", "Your travel request was not approved."),
    "document.to_sign": ("document", "Document to sign", "“{title}” is ready for your signature."),
    "document.to_acknowledge": ("document", "Document to acknowledge", "Please read and acknowledge “{title}”."),
    "document.issued": ("document", "New document", "“{title}” has been issued to you."),
    "onboarding.tasks_assigned": ("onboarding", "Onboarding tasks assigned", "You have new onboarding tasks to complete."),
    "performance.review_shared": ("performance", "Performance review shared", "Your performance review has been shared with you."),
}


def _fmt_date(value) -> str:
    try:
        return f"{value.day} {value:%b %Y}"
    except Exception:
        return "the selected date"


def notify_employee(db: Session, org_id: Optional[int], employee_ids, event: str, *, link: Optional[str] = None,
                    date=None, title: Optional[str] = None, commit: bool = True) -> None:
    """Notify one or more employees (login ids = employees.id) of ``event``. Never raises."""
    if org_id is None or event not in EVENTS:
        return
    ids: Iterable = employee_ids if isinstance(employee_ids, (list, tuple, set)) else [employee_ids]
    kind, heading, template = EVENTS[event]
    safe_title = (title or "a document").strip()[:120]
    message = template.format(date=_fmt_date(date), title=safe_title)
    try:
        from app.modules.super_admin.admin_notifications import notify_users
        with db.begin_nested():
            notify_users(db, org_id=org_id, user_ids=list(ids), title=heading, message=message,
                         notification_type=kind, link=link)
        if commit:
            db.commit()
    except Exception:
        logger.exception("notification %s failed (org %s)", event, org_id)
        try:
            if commit:
                db.rollback()
        except Exception:
            pass
