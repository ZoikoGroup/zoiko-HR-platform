"""Scheduled jobs (registered in billing/scheduler._ensure_scheduler; run on the background leader only).

    reminders_job          daily  remind recipients on the variant's / distribution's reminder days before due
    expiry_job             hourly unsigned / unacknowledged documents past expires_at → EXPIRED, HR told
    expiry_collect_job     daily  HR-DOC-016 items: documents, uploaded documents and templates expiring within the window
    expiry_digest_job      weekly counts-only digest to HR admins
    retention_job          daily  flag documents past retention_until for review (deletion is never automatic)
    new_joiners_job        30 min new audience members of published policy distributions receive the policy

Each job opens its own session, works organization by organization, and logs ids only.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from app.modules.doc_templates import distribution, notify, signing, state
from app.modules.doc_templates.models import (DocTemplateSettings, DocumentEvent, DocumentExpiryItem, GeneratedDocument,
                                              PolicyDistribution, TemplateVariant)

logger = logging.getLogger("zoiko.doc_templates.jobs")
PENDING_ACTION = ("ISSUED",)


def _session():
    from app.database import SessionLocal
    return SessionLocal()


def _run(name, fn):
    db = _session()
    try:
        n = fn(db)
        logger.info("doc_templates %s: %s", name, n)
        return n
    except Exception:
        db.rollback()
        logger.exception("doc_templates %s failed", name)
        return None
    finally:
        db.close()


# ── reminders and expiry ─────────────────────────────────────────────────────────────────────────────────────────────

def send_reminders(db, now: datetime | None = None) -> int:
    from app.modules.employee.models import Employee
    now = now or datetime.utcnow()
    today = now.date()
    sent = 0
    docs = db.query(GeneratedDocument).filter(GeneratedDocument.status.in_(PENDING_ACTION), GeneratedDocument.execution_mode != "NONE",
                                              GeneratedDocument.due_by.isnot(None), GeneratedDocument.legal_hold.is_(False)).all()
    for doc in docs:
        days_left = (doc.due_by.date() - today).days
        if days_left not in (doc.reminder_days or []):
            continue
        if doc.last_reminded_at and doc.last_reminded_at.date() == today:
            continue
        if doc.recipient_employee_id is None:
            continue                                     # candidates: the link e-mail already carries the deadline
        person = db.get(Employee, doc.recipient_employee_id)
        if person is None or not person.is_active:
            continue
        notify.reminder(db, doc, person)
        doc.last_reminded_at = now
        state.add_event(db, doc, "reminded", actor_type="system", detail={"days_left": days_left})
        db.commit()
        sent += 1
    return sent


def expire_documents(db, now: datetime | None = None) -> int:
    now = now or datetime.utcnow()
    n = 0
    for doc in db.query(GeneratedDocument).filter(GeneratedDocument.status.in_(PENDING_ACTION), GeneratedDocument.execution_mode != "NONE",
                                                  GeneratedDocument.expires_at.isnot(None), GeneratedDocument.expires_at < now,
                                                  GeneratedDocument.legal_hold.is_(False)).all():
        state.transition(db, doc, "EXPIRED", actor_type="system")
        signing.revoke_candidate_tokens(db, doc)
        db.commit()
        notify.expired(db, doc)
        notify.event(db, "document.expired", doc)
        from app.modules.doc_templates import hooks
        hooks.dispatch(db, "expired", doc)
        n += 1
    return n


# ── HR-DOC-016 ───────────────────────────────────────────────────────────────────────────────────────────────────────

def _window(db, organization_id) -> int:
    row = db.query(DocTemplateSettings).filter(DocTemplateSettings.organization_id == organization_id).first()
    return row.expiry_warning_days if row else 30


def _upsert(db, org_id, item_type, ref_id, title, owner, expiry, action) -> bool:
    exists = db.query(DocumentExpiryItem).filter(DocumentExpiryItem.organization_id == org_id, DocumentExpiryItem.item_type == item_type,
                                                 DocumentExpiryItem.ref_id == ref_id, DocumentExpiryItem.expiry_date == expiry).first()
    if exists is not None:
        return False
    db.add(DocumentExpiryItem(organization_id=org_id, item_type=item_type, ref_id=ref_id, title=title[:255], owner_employee_id=owner,
                              expiry_date=expiry, action_required=action, status="OPEN"))
    return True


def collect_expiry_items(db, today: date | None = None) -> int:
    from app.modules.hr.models import HrDocument, Organization
    today = today or date.today()
    created = 0
    for org in db.query(Organization).all():
        horizon = today + timedelta(days=_window(db, org.id))
        for doc in db.query(GeneratedDocument).filter(GeneratedDocument.organization_id == org.id, GeneratedDocument.status == "ISSUED",
                                                      GeneratedDocument.expires_at.isnot(None)).all():
            if doc.expires_at.date() <= horizon:
                created += _upsert(db, org.id, "generated_document", doc.id, f"{doc.document_number} — {doc.title}", doc.issued_by,
                                   doc.expires_at.date(), "Chase the recipient or cancel and regenerate before it expires")
        for hd in db.query(HrDocument).filter(HrDocument.organization_id == org.id, HrDocument.is_deleted.is_(False),
                                              HrDocument.expiry_date.isnot(None), HrDocument.expiry_date <= horizon).all():
            created += _upsert(db, org.id, "hr_document", hd.id, hd.title, hd.uploaded_by, hd.expiry_date, "Renew or replace the document")
        for v in db.query(TemplateVariant).filter(TemplateVariant.owner_organization_id == org.id, TemplateVariant.status == "ACTIVE",
                                                  TemplateVariant.effective_to.isnot(None), TemplateVariant.effective_to <= horizon).all():
            created += _upsert(db, org.id, "template_variant", v.id, f"{v.canonical_id} v{v.version}", v.released_by, v.effective_to,
                               "Review the template and release a new version before it lapses")
        db.commit()
    return created


def send_expiry_digest(db, today: date | None = None) -> int:
    from app.modules.employee.models import Employee, UserRole
    from app.modules.hr.models import Organization
    from app.services import email_service
    today = today or date.today()
    sent = 0
    for org in db.query(Organization).all():
        items = db.query(DocumentExpiryItem).filter(DocumentExpiryItem.organization_id == org.id, DocumentExpiryItem.status == "OPEN").all()
        if not items:
            continue
        counts = {t: sum(1 for i in items if i.item_type == t) for t in ("generated_document", "hr_document", "template_variant")}
        overdue = sum(1 for i in items if i.expiry_date < today)
        for person in db.query(Employee).filter(Employee.organization_id == org.id, Employee.is_active.is_(True),
                                                Employee.role.in_([UserRole.ADMIN, UserRole.HR_ADMIN])).all():
            try:
                email_service.send_documents_expiry_digest_email(
                    person.work_email or person.email, person.first_name, _window(db, org.id), counts["generated_document"],
                    counts["hr_document"], counts["template_variant"], overdue,
                    notify.app_url("/zoiko-hr/documents/governance?report=expiries"), db=db, organization_id=org.id)
                sent += 1
            except Exception:
                logger.warning("doc_templates digest e-mail failed for organization %s", org.id)
    return sent


def flag_retention(db, today: date | None = None) -> int:
    today = today or date.today()
    n = 0
    for doc in db.query(GeneratedDocument).filter(GeneratedDocument.retention_until.isnot(None), GeneratedDocument.retention_until < today,
                                                  GeneratedDocument.retention_flagged_at.is_(None),
                                                  GeneratedDocument.legal_hold.is_(False)).all():
        doc.retention_flagged_at = datetime.utcnow()
        state.add_event(db, doc, "retention_review_due", actor_type="system")
        n += 1
    db.commit()
    return n


def include_new_joiners(db) -> int:
    n = 0
    for d in db.query(PolicyDistribution).filter(PolicyDistribution.status == "PUBLISHED",
                                                 PolicyDistribution.auto_include_new_joiners.is_(True)).all():
        try:
            n += distribution.include_new_joiners(db, d)
        except Exception:
            db.rollback()
            logger.exception("doc_templates new-joiner run failed for distribution %s", d.id)
    return n


# ── APScheduler entry points ─────────────────────────────────────────────────────────────────────────────────────────

def reminders_job():
    return _run("reminders", send_reminders)


def expiry_job():
    return _run("expiry", expire_documents)


def expiry_collect_job():
    return _run("expiry_collect", collect_expiry_items)


def expiry_digest_job():
    return _run("expiry_digest", send_expiry_digest)


def retention_job():
    return _run("retention", flag_retention)


def new_joiners_job():
    return _run("new_joiners", include_new_joiners)


def commencement_job():
    from app.modules.hr.onboarding_documents import commencement_job as run
    return _run("commencement", run)


def learning_expiry_job():
    from app.modules.hr.learning_documents import expiry_job as run
    return _run("learning_expiry", run)


def register(scheduler) -> None:
    from apscheduler.triggers.cron import CronTrigger
    jobs = [
        (reminders_job, CronTrigger(hour=7, minute=30), "doc_templates_reminders", "Remind recipients about documents due soon"),
        (expiry_job, CronTrigger(minute=5), "doc_templates_expiry", "Expire documents past their expiry time"),
        (expiry_collect_job, CronTrigger(hour=6, minute=0), "doc_templates_expiry_collect", "Collect HR-DOC-016 expiry items"),
        (expiry_digest_job, CronTrigger(day_of_week="mon", hour=7, minute=0), "doc_templates_expiry_digest", "Weekly expiry digest"),
        (retention_job, CronTrigger(hour=3, minute=30), "doc_templates_retention", "Flag documents past retention for review"),
        (commencement_job, CronTrigger(hour=6, minute=30), "doc_templates_commencement", "Confirm employment start dates (HR-ONB-007)"),
        (learning_expiry_job, CronTrigger(hour=2, minute=45), "doc_templates_learning_expiry",
         "Expiring certifications and mandatory training (HR-DOC-016, reminders)"),
    ]
    for fn, trigger, job_id, name in jobs:
        scheduler.add_job(fn, trigger, id=job_id, name=name, replace_existing=True, misfire_grace_time=3600)
    scheduler.add_job(new_joiners_job, "interval", minutes=30, id="doc_templates_new_joiners", name="Policies for new joiners",
                      replace_existing=True, coalesce=True, max_instances=1, misfire_grace_time=600)
