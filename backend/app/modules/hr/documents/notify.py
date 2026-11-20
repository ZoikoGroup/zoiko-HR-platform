"""Notifications of the documents module: in-app (hr_notifications) and email (document_notice.html).

Respects, in this order: the global / organization pause (automation.limits), quiet hours for email (callers that can wait
ask `quiet_until` first), the person's email opt-out for non-mandatory notices, and a daily cap on reminders per person.
Never raises: a notification problem must not undo the business change that caused it.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents.models import HrDocumentReminder

logger = logging.getLogger("zoiko.documents.notify")

# Notices people receive even if they turned email off: they need to act on them.
MANDATORY_EVENTS = frozenset({"document.rejected", "document.reupload_requested", "document.expired"})
REMINDER_EVENTS = frozenset({"document.upload_reminder", "document.task_escalated"})
DEFAULT_DAILY_REMINDER_CAP = 5

MY_FILES_LINK = "/employee/documents/my-files"
TO_ACTION_LINK = "/employee/documents/to-action"
APPROVALS_LINK = "/zoiko-hr/documents/approvals"


@dataclass
class EmailPart:
    subject: str
    heading: str
    message: str
    reason: Optional[str] = None
    action_label: Optional[str] = None
    badge_tone: str = "info"


def recipients(db: Session, organization_id: int, to: str, employee_id: Optional[int] = None) -> list:
    """People for a ladder / rule recipient keyword: assignee | manager | hr_admins | org_admins."""
    from app.modules.employee.models import Employee, UserRole
    base = db.query(Employee).filter(Employee.organization_id == organization_id, Employee.is_active.is_(True))
    if to == "assignee":
        return base.filter(Employee.id == employee_id).all() if employee_id else []
    if to == "manager":
        if not employee_id:
            return []
        emp = db.query(Employee).filter(Employee.id == employee_id, Employee.organization_id == organization_id).first()
        if emp is None or not emp.reporting_manager_id:
            return []
        return base.filter(Employee.id == emp.reporting_manager_id).all()
    if to == "hr_admins":
        return base.filter(Employee.role == UserRole.HR_ADMIN).all()
    if to == "org_admins":
        return base.filter(Employee.role == UserRole.ADMIN).all()
    return []


def _wants_email(person, event: str) -> bool:
    if event in MANDATORY_EVENTS:
        return True
    prefs = getattr(person, "notification_preferences", None) or {}
    return prefs.get("email", True) is not False


def reminders_sent_today(db: Session, organization_id: int, employee_id: int, now: Optional[datetime] = None) -> int:
    now = now or datetime.utcnow()
    start = datetime(now.year, now.month, now.day)
    return (db.query(HrDocumentReminder)
            .filter(HrDocumentReminder.organization_id == organization_id, HrDocumentReminder.employee_id == employee_id,
                    HrDocumentReminder.sent_at >= start, HrDocumentReminder.sent_at < start + timedelta(days=1))
            .count())


def quiet_until(db: Session, organization_id: int, channels: Iterable[str], now: Optional[datetime] = None) -> Optional[datetime]:
    """When `channels` include email/SMS and the organization is in its quiet hours: when they end."""
    from app.modules.hr.documents.automation import limits
    settings = limits.org_settings(db, organization_id)
    for channel in channels:
        until = limits.quiet_defer_until(settings, channel, now)
        if until:
            return until
    return None


def _org_name(db: Session, organization_id: int) -> str:
    try:
        from app.modules.hr.models import Organization
        org = db.get(Organization, organization_id)
        return getattr(org, "name", None) or ""
    except Exception:
        return ""


def _fmt(value) -> str:
    if value is None:
        return ""
    try:
        return f"{value.day} {value:%b %Y}"
    except Exception:
        return str(value)


def send(db: Session, organization_id: int, people: list, event: str, *, title: str, link: str,
         channels: Iterable[str] = ("in_app", "email"), date=None, email: Optional[EmailPart] = None,
         reminder_kind: Optional[str] = None, task_id: Optional[int] = None, level: int = 0,
         document_id: Optional[int] = None, employee_category_id: Optional[int] = None,
         dedupe_key: Optional[str] = None, sent_by: Optional[int] = None, now: Optional[datetime] = None) -> int:
    """Notify `people`. Returns how many were notified. Writes one hr_document_reminders row per person when
    `reminder_kind` is given (with `dedupe_key`, a second identical send is skipped)."""
    from app.modules.hr.hr_notifications import notify_employee
    from app.modules.hr.documents.automation import limits
    now = now or datetime.utcnow()
    channels = list(channels)
    if not people or not limits.automation_enabled(db, organization_id):
        return 0
    settings = limits.org_settings(db, organization_id)
    from app.modules.hr.documents.automation import templates as wording
    in_app_override = wording.override(db, organization_id, event, "in_app") if "in_app" in channels else None
    email_override = wording.override(db, organization_id, event, "email") if (email is not None and "email" in channels) else None
    org_name = _org_name(db, organization_id) if (in_app_override or email_override) else None
    cap = int(((settings.rate_limits or {}) if settings else {}).get("reminders_per_employee_per_day", DEFAULT_DAILY_REMINDER_CAP))
    sent = 0
    for person in people:
        key = f"{dedupe_key}:p{person.id}" if dedupe_key else None
        if key and db.query(HrDocumentReminder.id).filter(HrDocumentReminder.dedupe_key == key).first():
            continue
        if event in REMINDER_EVENTS and reminders_sent_today(db, organization_id, person.id, now) >= cap:
            logger.info("reminder cap reached for person %s (org %s)", person.id, organization_id)
            continue
        ctx = {"first_name": person.first_name or "there", "title": title, "date": _fmt(date), "organization": org_name}
        if "in_app" in channels:
            notify_employee(db, organization_id, [person.id], event, link=link, date=date, title=title, commit=False,
                            heading=wording.render(in_app_override.subject, ctx) if in_app_override else None,
                            message=wording.render(in_app_override.body, ctx) if in_app_override else None)
        used = "in_app"
        if "email" in channels and email is not None and person.email and _wants_email(person, event):
            try:
                from app.config import settings as app_settings
                from app.services.email_service import send_document_notice_email
                base = (getattr(app_settings, "FRONTEND_URL", "") or "").rstrip("/")
                subject, heading, message = email.subject, email.heading, email.message
                if email_override is not None:
                    message = wording.render(email_override.body, ctx)
                    if email_override.subject:
                        subject = heading = wording.render(email_override.subject, ctx)
                send_document_notice_email(
                    person.email, person.first_name, subject, heading, message,
                    action_url=f"{base}{link}" if base else None, action_label=email.action_label, reason=email.reason,
                    badge_tone=email.badge_tone, organization_id=organization_id)
                used = "both" if "in_app" in channels else "email"
            except Exception:
                logger.exception("document email failed (org %s, person %s)", organization_id, person.id)
        if reminder_kind:
            db.add(HrDocumentReminder(
                organization_id=organization_id, task_id=task_id, kind=reminder_kind[:20], level=level, dedupe_key=key,
                employee_id=person.id, document_id=document_id, employee_category_id=employee_category_id,
                sent_by=sent_by, channel=used, sent_at=now))
        sent += 1
    db.flush()
    return sent
