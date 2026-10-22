"""Mandatory training and certifications (Prompt 4 §A): HR-PRF-018 and HR-PRF-020.

* Completing an enrollment in a mandatory course (`learning_courses.is_mandatory`) produces the completion record; with
  `renewal_months` the completion expires and must be renewed.
* Issuing or renewing a certification produces the certification record (the number is printed masked, last 4 only).
* A nightly job feeds HR-DOC-016 expiry items for expiring certifications and trainings and sends ID-only reminders at the
  organization's reminder days (default 60/30/7).
* HR's compliance report: mandatory courses by department, who is complete, overdue or never completed (no personal content).
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.doc_templates import access, formatting, hooks
from app.modules.doc_templates.models import DocumentExpiryItem
from app.modules.hr import work_settings
from app.modules.hr.models import LearningCertification, LearningCourse, LearningEnrollment
from app.modules.hr.recruitment_documents import _try_generate, system_actor

logger = logging.getLogger("zoiko.doc_templates")


def _add_months(d: date, months: int) -> date:
    from app.modules.hr.policy_documents import _add_months as add
    return add(d, months)


def _actor(db, organization_id, actor):
    return actor or system_actor(db, organization_id)


def on_enrollment_updated(db, enrollment: LearningEnrollment, actor=None) -> None:
    """Called after an enrollment is saved: a completed mandatory course gets its completion record (once)."""
    if enrollment.status != "completed" or enrollment.document_id:
        return
    course = db.get(LearningCourse, enrollment.course_id)
    if course is None or not course.is_mandatory:
        return
    done = (enrollment.completed_at.date() if enrollment.completed_at else date.today())
    if course.renewal_months:
        enrollment.expires_on = _add_months(done, int(course.renewal_months))
    if not enrollment.completed_at:
        from datetime import datetime
        enrollment.completed_at = datetime.utcnow()
    db.commit()
    doc = _try_generate(db, _actor(db, enrollment.organization_id, actor), canonical_id="HR-PRF-018", subject_type="employee",
                        subject_id=enrollment.employee_id, source_ref=f"learning_enrollment:{enrollment.id}", trigger="learning_enrollment.completed")
    if doc is not None:
        enrollment = db.get(LearningEnrollment, enrollment.id)
        enrollment.document_id = doc.id
        db.commit()


def on_certification_saved(db, cert: LearningCertification, actor=None, *, renewed_from: Optional[date] = None) -> None:
    """A new certification, or a renewal (the expiry moved later): issue the certification record."""
    if renewed_from is not None:
        cert.renewal_history = list(cert.renewal_history or []) + [{"renewed_on": date.today().isoformat(), "previous_expiry": renewed_from.isoformat(),
                                                                    "document_id": cert.document_id}]
        cert.reminders_sent = []
        db.commit()
    doc = _try_generate(db, _actor(db, cert.organization_id, actor), canonical_id="HR-PRF-020", subject_type="employee",
                        subject_id=cert.employee_id, source_ref=f"learning_certification:{cert.id}",
                        trigger="learning_certification.renewed" if renewed_from else "learning_certification.issued")
    if doc is not None:
        cert = db.get(LearningCertification, cert.id)
        cert.document_id = doc.id
        db.commit()


def _mask(number: Optional[str]) -> Optional[str]:
    if not number:
        return None
    tail = number.strip()[-4:]
    return "••••" + tail if len(number.strip()) > 4 else "••••"


def _training_context(ctx) -> None:
    e = ctx.source
    if e is None or type(e).__name__ != "LearningEnrollment" or e.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("TRAINING_SOURCE_MISMATCH")
        return
    c = ctx.db.get(LearningCourse, e.course_id)
    if e.status != "completed":
        ctx.denials.append("TRAINING_NOT_COMPLETED")
    ctx.extra.update({"training.course": getattr(c, "course_name", None), "training.version": getattr(c, "version", None),
                      "training.completed_on": e.completed_at, "training.score": f"{e.score}%" if e.score is not None else None,
                      "training.valid_until": e.expires_on, "training.provider": getattr(c, "provider", None)})


def _cert_context(ctx) -> None:
    c = ctx.source
    if c is None or type(c).__name__ != "LearningCertification" or c.employee_id != getattr(ctx.subject, "id", None):
        ctx.denials.append("CERTIFICATION_SOURCE_MISMATCH")
        return
    hist = []
    for h in c.renewal_history or []:
        from app.modules.doc_templates.models import GeneratedDocument
        d = ctx.db.get(GeneratedDocument, h.get("document_id")) if h.get("document_id") else None
        hist.append([formatting.format_date(date.fromisoformat(h["renewed_on"]), ctx.language, ctx.country()), getattr(d, "document_number", "") or ""])
    ctx.extra.update({"cert.name": c.certification_name, "cert.issuing_body": c.issuing_organization, "cert.number_masked": _mask(c.certificate_number),
                      "cert.issued_on": c.issue_date, "cert.expires_on": c.expiry_date, "cert.renewal_requirements": c.renewal_requirements,
                      "cert.renewal_history": hist or None})


hooks.context(["HR-PRF-018"], _training_context)
hooks.context(["HR-PRF-020"], _cert_context)


# ── expiry and reminders (nightly) ───────────────────────────────────────────────────────────────────────────────────

def _reminder_days(db, organization_id: int) -> list[int]:
    raw = work_settings.get(db, organization_id, "learning.reminder_days") or "60,30,7"
    try:
        return sorted({int(x) for x in str(raw).split(",") if x.strip()}, reverse=True)
    except ValueError:
        return [60, 30, 7]


def _expiry_item(db, organization_id, kind, ref_id, title, owner, expiry: date, action: str) -> None:
    exists = db.query(DocumentExpiryItem.id).filter(DocumentExpiryItem.organization_id == organization_id, DocumentExpiryItem.item_type == kind,
                                                    DocumentExpiryItem.ref_id == ref_id, DocumentExpiryItem.expiry_date == expiry).first()
    if exists is None:
        db.add(DocumentExpiryItem(organization_id=organization_id, item_type=kind, ref_id=ref_id, title=title[:255], owner_employee_id=owner,
                                  expiry_date=expiry, action_required=action, status="OPEN"))


def expiry_job(db, today: Optional[date] = None, organization_id: Optional[int] = None) -> dict:
    """Expiring certifications and mandatory trainings → HR-DOC-016 items and reminders (counts returned, ids only).
    The nightly job runs for every organization; HR's manual run only for their own."""
    today = today or date.today()
    items = reminders = 0
    horizon = today + timedelta(days=90)
    cq = db.query(LearningCertification).filter(LearningCertification.expiry_date.isnot(None), LearningCertification.expiry_date <= horizon)
    eq = db.query(LearningEnrollment).filter(LearningEnrollment.expires_on.isnot(None), LearningEnrollment.expires_on <= horizon)
    if organization_id is not None:
        cq = cq.filter(LearningCertification.organization_id == organization_id)
        eq = eq.filter(LearningEnrollment.organization_id == organization_id)
    certs = cq.all()
    for c in certs:
        _expiry_item(db, c.organization_id, "certification", c.id, f"Certification {c.id} renewal", c.employee_id, c.expiry_date,
                     "Renew the certification and record the new expiry date")
        items += 1
        days_left = (c.expiry_date - today).days
        sent = set(c.reminders_sent or [])
        due = [d for d in _reminder_days(db, c.organization_id) if days_left <= d and d not in sent]
        if due and days_left >= 0:
            _remind(db, c.organization_id, c.employee_id)
            c.reminders_sent = sorted(sent | set(due))
            reminders += 1
    enrolls = eq.all()
    for e in enrolls:
        _expiry_item(db, e.organization_id, "training", e.id, f"Mandatory training {e.course_id} renewal", e.employee_id, e.expires_on,
                     "Re-enrol the employee in the course before the completion expires")
        items += 1
    db.commit()
    return {"expiry_items_checked": items, "reminders_sent": reminders}


def _remind(db, organization_id: int, employee_id: int) -> None:
    from app.modules.employee.models import Employee
    from app.services import email_service
    from app.modules.doc_templates import notify
    p = db.get(Employee, employee_id)
    if p is None or not (p.work_email or p.email):
        return
    try:
        email_service.send_documents_to_action_email(p.work_email or p.email, p.first_name or "there", 1,
                                                     notify.app_url("/employee/learning"), db=db, organization_id=organization_id)
    except Exception:
        logger.warning("learning reminder failed for employee id %s", employee_id)


# ── compliance report ────────────────────────────────────────────────────────────────────────────────────────────────

def compliance_report(db, user) -> dict:
    """Per mandatory course and department: required, complete and valid, expired, never completed. Small groups suppressed."""
    access.require_hr(user)
    from app.modules.doc_templates import distribution
    from app.modules.hr.models import Department
    depts = {d.id: d.name for d in db.query(Department).filter(Department.organization_id == user.organization_id).all()}
    today = date.today()
    out = []
    for c in db.query(LearningCourse).filter(LearningCourse.organization_id == user.organization_id, LearningCourse.is_mandatory.is_(True)).all():
        people = distribution.audience_employees(db, user.organization_id, c.mandatory_audience or {"type": "all"})
        enr = {e.employee_id: e for e in db.query(LearningEnrollment).filter(LearningEnrollment.course_id == c.id,
                                                                             LearningEnrollment.status == "completed").all()}
        by_dept: dict = {}
        overdue = []
        for p in people:
            row = by_dept.setdefault(depts.get(p.department_id, "Unassigned"), {"required": 0, "complete": 0, "expired": 0, "missing": 0})
            row["required"] += 1
            e = enr.get(p.id)
            if e is None:
                row["missing"] += 1
                overdue.append(p.id)
            elif e.expires_on and e.expires_on < today:
                row["expired"] += 1
                overdue.append(p.id)
            else:
                row["complete"] += 1
        rows = [{"department": k, **(v if v["required"] >= SMALL_GROUP else {"required": v["required"], "suppressed": True})}
                for k, v in sorted(by_dept.items())]
        out.append({"course_id": c.id, "course": c.course_name, "departments": rows, "overdue_employee_ids": overdue})
    return {"courses": out, "small_group_threshold": SMALL_GROUP}


SMALL_GROUP = 3


router = APIRouter(prefix="/hr/learning-documents", tags=["Training records"])


@router.get("/compliance")
def compliance(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return compliance_report(db, user)


@router.post("/run-expiry-check")
def run_expiry(db: Session = Depends(get_db), user=Depends(get_current_user)):
    access.require_hr(user)
    return expiry_job(db, organization_id=user.organization_id)
