"""The onboarding flow around the CRUD in service.py:

    offer accepted / new hire added
        -> start_onboarding: checklist templates from Settings are assigned (task owners emailed), the Settings' required
           documents are requested, and the new hire is emailed a pre-onboarding link
    pre-onboarding link (no account needed)
        -> the new hire uploads requested documents and enters their address and emergency contact
    HR reviews documents (a rejection emails the new hire to upload again), works the checklists, runs orientation
    complete
        -> only when the checklists are done and documents approved (Settings can relax this, or HR can override):
           the employee account is created and admins + the manager are emailed

Emails never undo or fail the change that triggered them.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, NotFoundException
from app.modules.hr.models import (
    OnboardingChecklist, OnboardingChecklistItem, OnboardingDocument, OnboardingNewHire, OnboardingOrientation,
    OnboardingOrientationAttendee, OnboardingSettings,
)

logger = logging.getLogger("zoiko.onboarding")

# ── vocabulary ───────────────────────────────────────────────────────────────────────────────────────────────────────
STATUS_TRANSITIONS = {
    "offer_sent": {"offer_accepted", "cancelled"},
    "offer_accepted": {"pre_joining", "in_progress", "cancelled"},
    "pre_joining": {"offer_accepted", "in_progress", "cancelled"},
    "in_progress": {"pre_joining", "completed", "cancelled"},
    "completed": set(),
    "cancelled": {"offer_accepted"},               # reopened
}
STATUSES = tuple(STATUS_TRANSITIONS)
ACTIVE_STATUSES = ("offer_sent", "offer_accepted", "pre_joining", "in_progress")
JOINING_STATUSES = ("not_joined", "joined", "no_show", "deferred")
ATTENDEE_STATUSES = ("pending", "attended", "absent", "excused")
DOCUMENT_LABELS = {
    "id_proof": "ID proof", "offer_letter": "Signed offer letter", "nda": "Signed NDA",
    "education_certificates": "Education certificates", "experience_letters": "Experience letters",
    "bank_details": "Bank details", "other": "Other document",
}


def check_status_transition(current: str, new: Optional[str]) -> None:
    if new is None or new == current:
        return
    if new not in STATUS_TRANSITIONS:
        raise BadRequestException(f"Unknown onboarding status: {new}.")
    if new not in STATUS_TRANSITIONS.get(current, set()):
        if current == "completed":
            raise BadRequestException("Onboarding is already completed; the employee account exists.")
        raise BadRequestException(f"Onboarding cannot move from {current.replace('_', ' ')} to {new.replace('_', ' ')}.")


# ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def app_base() -> str:
    try:
        from app.services.email_service import _login_url
        return _login_url().rsplit("/login", 1)[0]
    except Exception:
        return ""


def _org_name(db: Session, organization_id) -> str:
    from app.modules.hr.models import Organization
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return (org.name if org is not None else "") or "your new employer"


def _first_name(hire: OnboardingNewHire) -> str:
    return (hire.candidate_name or "").strip().split(" ")[0] or "there"


def _date_display(d) -> Optional[str]:
    return d.strftime("%a, %b %d, %Y") if d else None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _admins(db: Session, organization_id, roles=("admin", "hr_admin")):
    from app.modules.employee.models import Employee, UserRole
    return (db.query(Employee)
            .filter(Employee.organization_id == organization_id, Employee.role.in_([UserRole(r) for r in roles]),
                    Employee.is_active.is_(True)).all())


# ── settings ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def get_settings(db: Session, organization_id: int) -> OnboardingSettings:
    row = db.query(OnboardingSettings).filter(OnboardingSettings.organization_id == organization_id).first()
    if row is None:
        row = OnboardingSettings(organization_id=organization_id, auto_template_ids=[],
                                 required_document_categories=["id_proof", "bank_details"], auto_send_portal_invite=True,
                                 portal_link_days=30, reminder_days=3, require_checklists_complete=True,
                                 require_documents_approved=True)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def update_settings(db: Session, organization_id: int, data: dict) -> OnboardingSettings:
    row = get_settings(db, organization_id)
    if "auto_template_ids" in data and data["auto_template_ids"] is not None:
        ids = sorted({int(i) for i in data["auto_template_ids"]})
        found = {i for (i,) in db.query(OnboardingChecklist.id).filter(
            OnboardingChecklist.id.in_(ids), OnboardingChecklist.organization_id == organization_id,
            OnboardingChecklist.onboarding_new_hire_id.is_(None), OnboardingChecklist.is_deleted == False).all()}  # noqa: E712
        if found != set(ids):
            raise BadRequestException("One of the selected checklist templates no longer exists.")
        data["auto_template_ids"] = ids
    if "required_document_categories" in data and data["required_document_categories"] is not None:
        bad = [c for c in data["required_document_categories"] if c not in DOCUMENT_LABELS]
        if bad:
            raise BadRequestException(f"Unknown document categories: {', '.join(bad)}.")
    for field, value in data.items():
        if value is not None or field == "welcome_message":
            setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


# ── pre-onboarding link ──────────────────────────────────────────────────────────────────────────────────────────────
def portal_url(token: str) -> str:
    return f"{app_base()}/onboarding-portal/{token}"


def issue_portal_link(db: Session, hire: OnboardingNewHire, send: bool = True) -> dict:
    """A fresh link (any older one stops working). Emails it to the new hire when send=True."""
    if hire.status not in ACTIVE_STATUSES:
        raise BadRequestException("A pre-onboarding link can only be sent while onboarding is active.")
    settings = get_settings(db, hire.organization_id)
    token = secrets.token_urlsafe(32)
    days = max(int(settings.portal_link_days or 30), 1)
    expires = datetime.utcnow() + timedelta(days=days)
    if hire.joining_date:
        expires = max(expires, datetime.combine(hire.joining_date, datetime.min.time()) + timedelta(days=7))
    hire.portal_token_hash = _hash(token)
    try:
        from app.core.crypto import encrypt_secret
        hire.portal_token_enc = encrypt_secret(token)
    except Exception:
        hire.portal_token_enc = None
    hire.portal_expires_at = expires
    hire.portal_invited_at = datetime.utcnow()
    db.commit()
    sent = False
    if send:
        try:
            from app.services.email_service import send_onboarding_invite
            requested = db.query(OnboardingDocument).filter(
                OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
                OnboardingDocument.status.in_(["requested", "rejected"])).count()
            sent = bool(send_onboarding_invite(
                hire.email, _first_name(hire), _org_name(db, hire.organization_id), hire.position, portal_url(token),
                expires.strftime("%b %d, %Y"), joining_date_display=_date_display(hire.joining_date),
                manager_name=hire.manager_name, documents_requested=requested, welcome_message=settings.welcome_message,
                db=db, organization_id=hire.organization_id))
        except Exception:
            logger.exception("onboarding invite email failed")
    from app.modules.hr.service import log_onboarding_activity
    log_onboarding_activity(db, hire.id, "Pre-onboarding link sent" if sent else "Pre-onboarding link created",
                            f"Pre-onboarding link for {hire.candidate_name}, valid until {expires:%b %d, %Y}.", hire.organization_id)
    return {"url": portal_url(token), "expires_at": expires, "email_sent": sent}


def hire_for_token(db: Session, token: str) -> OnboardingNewHire:
    if not token or len(token) < 20:
        raise NotFoundException("Pre-onboarding link")
    hire = (db.query(OnboardingNewHire)
            .filter(OnboardingNewHire.portal_token_hash == _hash(token), OnboardingNewHire.is_deleted == False)  # noqa: E712
            .first())
    if hire is None or hire.portal_expires_at is None or hire.portal_expires_at < datetime.utcnow() \
            or hire.status not in ACTIVE_STATUSES:
        raise NotFoundException("Pre-onboarding link")
    return hire


def portal_view(db: Session, hire: OnboardingNewHire) -> dict:
    docs = (db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False)  # noqa: E712
            .order_by(OnboardingDocument.id).all())
    sessions = (db.query(OnboardingOrientation)
                .join(OnboardingOrientationAttendee, OnboardingOrientationAttendee.session_id == OnboardingOrientation.id)
                .filter(OnboardingOrientationAttendee.onboarding_new_hire_id == hire.id,
                        OnboardingOrientationAttendee.is_deleted == False, OnboardingOrientation.is_deleted == False,  # noqa: E712
                        OnboardingOrientation.status != "cancelled").all())
    return {
        "candidate_name": hire.candidate_name,
        "position": hire.position,
        "organization_name": _org_name(db, hire.organization_id),
        "joining_date": hire.joining_date,
        "manager_name": hire.manager_name,
        "department_name": hire.department_name,
        "welcome_message": get_settings(db, hire.organization_id).welcome_message,
        "expires_at": hire.portal_expires_at,
        "details": hire.profile_details or {},
        "phone": hire.phone,
        "documents": [{"id": d.id, "title": d.title, "category": d.category, "status": d.status,
                       "rejection_reason": d.rejection_reason, "uploaded": bool(d.file_path)} for d in docs],
        "orientation": [{"title": s.title, "date": s.date, "time": s.time, "location": s.location,
                         "meeting_link": s.meeting_link} for s in sessions],
    }


def save_portal_details(db: Session, hire: OnboardingNewHire, data: dict) -> dict:
    details = dict(hire.profile_details or {})
    for key in ("address", "city", "state", "country", "postal_code", "emergency_contact_name",
                "emergency_contact_relation", "emergency_contact_phone"):
        if key in data:
            value = (data.get(key) or "").strip()
            details[key] = value[:300] if value else None
    if data.get("phone"):
        hire.phone = str(data["phone"]).strip()[:50]
    hire.profile_details = details
    db.commit()
    from app.modules.hr.service import log_onboarding_activity
    log_onboarding_activity(db, hire.id, "Details submitted", f"{hire.candidate_name} updated their personal details.", hire.organization_id)
    return portal_view(db, hire)


# ── automatic start ──────────────────────────────────────────────────────────────────────────────────────────────────
def request_documents(db: Session, hire: OnboardingNewHire, categories: list[str], notify: bool = True) -> list[OnboardingDocument]:
    """Ask the new hire for documents. A category already requested, uploaded or approved is not asked for twice."""
    bad = [c for c in categories if c not in DOCUMENT_LABELS]
    if bad:
        raise BadRequestException(f"Unknown document categories: {', '.join(bad)}.")
    have = {d.category for d in db.query(OnboardingDocument).filter(
        OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
        OnboardingDocument.status != "rejected").all()}
    created = []
    for cat in dict.fromkeys(categories):
        if cat in have:
            continue
        doc = OnboardingDocument(title=DOCUMENT_LABELS[cat], category=cat, file_path=None, status="requested",
                                 onboarding_new_hire_id=hire.id, organization_id=hire.organization_id)
        db.add(doc)
        created.append(doc)
    db.commit()
    if created and notify and hire.portal_token_hash:
        notify_document_request(db, hire, [{"title": d.title, "note": "Requested"} for d in created])
    return created


def start_onboarding(db: Session, hire: OnboardingNewHire) -> None:
    """Apply the organization's settings to a new hire: checklists, document requests, the pre-onboarding invite."""
    try:
        settings = get_settings(db, hire.organization_id)
        from app.modules.hr import service
        for template_id in settings.auto_template_ids or []:
            try:
                service.assign_checklist_template(db, hire.id, int(template_id), hire.organization_id)
            except Exception:
                db.rollback()
                logger.warning("auto checklist %s could not be assigned to new hire %s", template_id, hire.id)
        if settings.required_document_categories:
            request_documents(db, hire, list(settings.required_document_categories), notify=False)
        if settings.auto_send_portal_invite and hire.email and hire.status in ACTIVE_STATUSES:
            issue_portal_link(db, hire, send=True)
    except Exception:
        db.rollback()
        logger.exception("starting onboarding failed for new hire %s", hire.id)


# ── completion ───────────────────────────────────────────────────────────────────────────────────────────────────────
def progress(db: Session, hire: OnboardingNewHire) -> dict:
    items = (db.query(OnboardingChecklistItem)
             .join(OnboardingChecklist, OnboardingChecklistItem.checklist_id == OnboardingChecklist.id)
             .filter(OnboardingChecklist.onboarding_new_hire_id == hire.id, OnboardingChecklist.is_deleted == False,  # noqa: E712
                     OnboardingChecklistItem.is_deleted == False).all())  # noqa: E712
    docs = db.query(OnboardingDocument).filter(OnboardingDocument.onboarding_new_hire_id == hire.id,
                                               OnboardingDocument.is_deleted == False).all()  # noqa: E712
    attend = (db.query(OnboardingOrientationAttendee)
              .join(OnboardingOrientation, OnboardingOrientationAttendee.session_id == OnboardingOrientation.id)
              .filter(OnboardingOrientationAttendee.onboarding_new_hire_id == hire.id,
                      OnboardingOrientationAttendee.is_deleted == False, OnboardingOrientation.is_deleted == False).all())  # noqa: E712
    settings = get_settings(db, hire.organization_id)
    blockers = []
    open_items = [i for i in items if not i.completed]
    if settings.require_checklists_complete and open_items:
        blockers.append(f"{len(open_items)} checklist item(s) are not done")
    not_approved = [d for d in docs if d.status != "approved"]
    if settings.require_documents_approved and not_approved:
        blockers.append(f"{len(not_approved)} document(s) are not approved")
    done = len(items) - len(open_items)
    return {
        "checklist_total": len(items), "checklist_done": done,
        "documents_total": len(docs), "documents_approved": len(docs) - len(not_approved),
        "documents_waiting": sum(d.status in ("requested", "rejected") for d in docs),
        "orientation_sessions": len(attend), "orientation_attended": sum(a.status == "attended" for a in attend),
        "portal_invited_at": hire.portal_invited_at, "portal_expires_at": hire.portal_expires_at,
        "percent": round(100 * (done + len(docs) - len(not_approved)) / (len(items) + len(docs))) if (items or docs) else 0,
        "blockers": blockers,
    }


def completion_blockers(db: Session, hire: OnboardingNewHire) -> list[str]:
    return progress(db, hire)["blockers"]


def notify_completed(db: Session, hire: OnboardingNewHire, employee) -> int:
    try:
        from app.services.email_service import send_onboarding_completed
        recipients = {a.email: a.first_name or "there" for a in _admins(db, hire.organization_id)}
        if hire.manager is not None and hire.manager.email:
            recipients[hire.manager.email] = hire.manager.first_name or "there"
        org = _org_name(db, hire.organization_id)
        n = 0
        for email, name in recipients.items():
            n += bool(send_onboarding_completed(email, name, hire.candidate_name, employee.employee_code, hire.position, org,
                                                f"{app_base()}/zoiko-hr/employees", _date_display(hire.joining_date),
                                                db=db, organization_id=hire.organization_id))
        return n
    except Exception:
        logger.exception("onboarding completed email failed")
        return 0


# ── other emails ─────────────────────────────────────────────────────────────────────────────────────────────────────
def current_portal_url(db: Session, hire: OnboardingNewHire) -> Optional[str]:
    """The live link the new hire already has (so a new email does not invalidate an older one), else a fresh one."""
    if hire.status not in ACTIVE_STATUSES:
        return None
    if hire.portal_token_enc and hire.portal_expires_at and hire.portal_expires_at > datetime.utcnow():
        try:
            from app.core.crypto import decrypt_secret
            token = decrypt_secret(hire.portal_token_enc)
            if token and _hash(token) == hire.portal_token_hash:
                return portal_url(token)
        except Exception:
            logger.warning("stored pre-onboarding link could not be read; issuing a new one")
    return issue_portal_link(db, hire, send=False)["url"]


def notify_document_request(db: Session, hire: OnboardingNewHire, documents: list[dict], is_reminder: bool = False) -> bool:
    if not hire.email or hire.status not in ACTIVE_STATUSES:
        return False
    try:
        from app.services.email_service import send_onboarding_document_request
        url = current_portal_url(db, hire)
        return bool(send_onboarding_document_request(
            hire.email, _first_name(hire), _org_name(db, hire.organization_id), documents, url,
            joining_date_display=_date_display(hire.joining_date), is_reminder=is_reminder, db=db,
            organization_id=hire.organization_id))
    except Exception:
        logger.exception("document request email failed")
        return False


def notify_task_assignees(db: Session, hire: OnboardingNewHire, items: list[OnboardingChecklistItem]) -> int:
    by_person: dict[int, list] = {}
    for item in items:
        if item.assignee_employee_id:
            by_person.setdefault(item.assignee_employee_id, []).append(item)
    if not by_person:
        return 0
    try:
        from app.modules.employee.models import Employee
        from app.services.email_service import send_onboarding_task_assigned
        org = _org_name(db, hire.organization_id)
        n = 0
        for emp_id, its in by_person.items():
            emp = db.query(Employee).filter(Employee.id == emp_id, Employee.is_active.is_(True)).first()
            if emp is None or not emp.email:
                continue
            n += bool(send_onboarding_task_assigned(
                emp.email, emp.first_name or "there", hire.candidate_name, hire.position, org,
                [{"title": i.title, "due": i.due_date.strftime("%b %d, %Y") if i.due_date else None} for i in its],
                f"{app_base()}/zoiko-hr/onboarding/checklists", _date_display(hire.joining_date), db=db,
                organization_id=hire.organization_id))
        return n
    except Exception:
        logger.exception("task assigned email failed")
        return 0


def notify_orientation(db: Session, session: OnboardingOrientation, kind: str, hires: Optional[list] = None) -> int:
    """kind: invite | updated | cancelled. hires defaults to everyone on the session."""
    try:
        from app.services.email_service import send_orientation_invite
        if hires is None:
            hires = [a.new_hire for a in session.attendees if not a.is_deleted and a.new_hire is not None]
        org = _org_name(db, session.organization_id)
        n = 0
        for hire in hires:
            if not hire.email or hire.is_deleted:
                continue
            n += bool(send_orientation_invite(hire.email, _first_name(hire), org, session.title, _date_display(session.date),
                                              session.time, session.location, session.meeting_link, session.presenter,
                                              kind=kind, db=db, organization_id=session.organization_id))
        return n
    except Exception:
        logger.exception("orientation email failed")
        return 0


# ── daily reminders ──────────────────────────────────────────────────────────────────────────────────────────────────
def run_document_reminders(db: Session, today: Optional[date] = None) -> int:
    """Remind new hires about documents they still owe, every `reminder_days` days after their invite."""
    today = today or date.today()
    sent = 0
    for settings in db.query(OnboardingSettings).filter(OnboardingSettings.reminder_days > 0).all():
        if settings.last_reminder_run == today:
            continue
        hires = (db.query(OnboardingNewHire)
                 .filter(OnboardingNewHire.organization_id == settings.organization_id, OnboardingNewHire.is_deleted == False,  # noqa: E712
                         OnboardingNewHire.status.in_(ACTIVE_STATUSES), OnboardingNewHire.portal_invited_at.isnot(None)).all())
        for hire in hires:
            days = (today - hire.portal_invited_at.date()).days
            if days <= 0 or days % settings.reminder_days:
                continue
            owed = db.query(OnboardingDocument).filter(
                OnboardingDocument.onboarding_new_hire_id == hire.id, OnboardingDocument.is_deleted == False,  # noqa: E712
                OnboardingDocument.status.in_(["requested", "rejected"])).all()
            if owed:
                invited = hire.portal_invited_at
                sent += notify_document_request(db, hire, [{"title": d.title, "note": f"Rejected: {d.rejection_reason}" if d.rejection_reason else "Still needed"} for d in owed], is_reminder=True)
                hire.portal_invited_at = invited          # if the link had to be renewed, keep the reminder rhythm
                db.commit()
        settings.last_reminder_run = today
        db.commit()
    return sent


def reminder_job() -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        n = run_document_reminders(db)
        if n:
            logger.info("[onboarding] sent %d document reminder(s)", n)
    except Exception:
        logger.exception("onboarding reminder job failed")
    finally:
        db.close()
