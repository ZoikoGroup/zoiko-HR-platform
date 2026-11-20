"""Scheduled jobs of the documents module (ZHR-DOCS-ARCH-001 §12). Registered from doc_templates.jobs.register, so they run
on the background leader only. Each job opens its own session, works organization by organization under that tenant's
context, skips organizations whose automation is paused or whose feature is off, and is idempotent (unique reminder keys,
status guards), so running it twice in a day sends nothing twice.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Callable, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger("zoiko.documents.jobs")

EXPIRY_ALERT_DAYS = (30, 15, 7)


def _session():
    from app.database import SessionLocal
    return SessionLocal()


def _orgs(db: Session) -> list[int]:
    from app.modules.hr.models import Organization
    return [oid for (oid,) in db.query(Organization.id).all()]


def _for_each_org(db: Session, feature: Optional[str], fn: Callable[[Session, int, datetime], int], now: datetime) -> int:
    from app.core.privacy import context as privacy_ctx
    from app.modules.hr.documents.automation import limits
    total = 0
    for org in _orgs(db):
        if not limits.automation_enabled(db, org, feature):
            continue
        try:
            with privacy_ctx.tenant_context(org, None):
                total += fn(db, org, now) or 0
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("documents job %s failed for organization %s", getattr(fn, "__name__", "?"), org)
    return total


# ── expire ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def expire_documents(db: Session, org: int, now: datetime) -> int:
    """Approved versions past their expiry date become expired (the lifecycle emits document.expired)."""
    from app.modules.hr.documents import lifecycle
    from app.modules.hr.models import HrDocument, HrDocumentVersion
    today = now.date()
    rows = (db.query(HrDocumentVersion, HrDocument)
            .join(HrDocument, HrDocument.approved_version_id == HrDocumentVersion.id)
            .filter(HrDocument.organization_id == org, HrDocument.is_deleted.is_(False), HrDocument.scope == "employee",
                    HrDocumentVersion.status == "approved", HrDocument.expiry_date.isnot(None), HrDocument.expiry_date < today)
            .all())
    for version, doc in rows:
        version.document = doc
        lifecycle.apply_transition(db, version, lifecycle.Event.EXPIRE, None)
    return len(rows)


# ── expiry alerts (30 / 15 / 7 days) ───────────────────────────────────────────────────────────────────────────────

def expiry_alerts(db: Session, org: int, now: datetime) -> int:
    from app.modules.employee.models import Employee
    from app.modules.hr.documents import notify
    from app.modules.hr.documents.automation import events as ev
    from app.modules.hr.documents.lifecycle import _category_key
    from app.modules.hr.models import HrDocument
    today = now.date()
    horizon = today + timedelta(days=max(EXPIRY_ALERT_DAYS))
    docs = (db.query(HrDocument)
            .filter(HrDocument.organization_id == org, HrDocument.is_deleted.is_(False), HrDocument.scope == "employee",
                    HrDocument.approved_version_id.isnot(None), HrDocument.employee_id.isnot(None),
                    HrDocument.expiry_date.isnot(None), HrDocument.expiry_date >= today, HrDocument.expiry_date <= horizon)
            .all())
    if docs and notify.quiet_until(db, org, ["email"], now):
        return 0                                   # quiet hours: the next run (or tomorrow's) sends them
    sent = 0
    for doc in docs:
        days_left = (doc.expiry_date - today).days
        threshold = next((d for d in sorted(EXPIRY_ALERT_DAYS) if days_left <= d), None)
        if threshold is None:
            continue
        key = f"expiry_{threshold}:doc{doc.id}:{doc.expiry_date.isoformat()}"
        emp = db.query(Employee).filter(Employee.id == doc.employee_id, Employee.organization_id == org).first()
        people = [emp] if emp is not None and emp.is_active else []
        n = notify.send(db, org, people, "document.expiring", title=doc.title, date=doc.expiry_date,
                        link=notify.MY_FILES_LINK,
                        email=notify.EmailPart(subject=f"Your {doc.title} expires soon", heading="Document expiring soon",
                                               message=f"Your {doc.title} expires on {doc.expiry_date:%d %b %Y}. Please upload a valid copy in My Files.",
                                               action_label="Open My Files", badge_tone="warning"),
                        reminder_kind=f"expiry_{threshold}", document_id=doc.id, dedupe_key=key, now=now)
        if n:
            ev.emit(db, org, ev.DocumentExpiring(document_id=doc.id, category_key=_category_key(db, doc),
                                                 employee_id=doc.employee_id, expiry_date=doc.expiry_date, days_left=days_left))
            sent += n
    return sent


# ── task escalation ladder ─────────────────────────────────────────────────────────────────────────────────────────

_TASK_TITLES = {"upload_required": "Uploading your {cat}", "reupload": "A new copy of your {cat}", "renew": "A valid copy of your {cat}",
                "acknowledge": "Acknowledging a company document", "review": "A document review", "sign": "Signing a document"}


def escalate_tasks(db: Session, org: int, now: datetime) -> int:
    from app.modules.hr.documents import notify
    from app.modules.hr.documents.automation import events as ev
    from app.modules.hr.documents.automation.ladder import due_step
    from app.modules.hr.documents.automation.models import OPEN_TASK_STATUSES, DocumentTask, TaskStatus
    from app.modules.hr.documents.models import HrEmployeeDocumentCategory
    tasks = (db.query(DocumentTask)
             .filter(DocumentTask.organization_id == org, DocumentTask.status.in_(OPEN_TASK_STATUSES)).all())
    if tasks and notify.quiet_until(db, org, ["email"], now):
        return 0
    sent = 0
    for task in tasks:
        nxt = due_step(task.ladder or [], task.created_at, task.escalation_level or 0, now)
        if nxt is None:
            continue
        level, step = nxt
        cat = db.get(HrEmployeeDocumentCategory, task.employee_category_id) if task.employee_category_id else None
        what = _TASK_TITLES.get(task.kind, "A document task").format(cat=cat.name if cat else "document")
        people = notify.recipients(db, org, step["to"], task.employee_id)
        to_assignee = step["to"] == "assignee"
        event = "document.upload_reminder" if to_assignee and task.kind == "upload_required" else "document.task_escalated"
        title = (cat.name if cat else "documents") if event == "document.upload_reminder" else what
        email = notify.EmailPart(
            subject="Reminder: documents to upload" if event == "document.upload_reminder" else f"Overdue: {what}",
            heading="Reminder" if to_assignee else "Overdue document task",
            message=(f"{what} is still waiting. Please complete it in Zoiko HR." if to_assignee
                     else f"{what} for one of your team is overdue."), badge_tone="warning")
        n = notify.send(db, org, people, event, title=title,
                        link=notify.MY_FILES_LINK if to_assignee else "/zoiko-hr/documents/employees",
                        channels=step.get("channels") or ["in_app"], email=email, reminder_kind="escalation",
                        task_id=task.id, level=level, dedupe_key=f"task{task.id}:level{level}", now=now)
        task.escalation_level = level
        if step.get("mark_overdue"):
            task.status = TaskStatus.OVERDUE.value
            ev.emit(db, org, ev.TaskOverdue(task_id=task.id, kind=task.kind, level=level, employee_id=task.employee_id,
                                            assignee_role=task.assignee_role))
        sent += n
    return sent


# ── approval SLA ───────────────────────────────────────────────────────────────────────────────────────────────────

def approval_sla(db: Session, org: int, now: datetime) -> int:
    """Pending reviews older than the SLA: remind the HR admins; at twice the SLA, tell the Org Admins. Once per level."""
    from app.modules.hr.documents import notify
    from app.modules.hr.documents.automation.limits import org_settings
    from app.modules.hr.models import DocumentApprovalStep, ApprovalStepStatus, HrDocument, HrDocumentVersion
    settings = org_settings(db, org)
    sla = timedelta(hours=int(settings.approval_sla_hours) if settings and settings.approval_sla_hours else 72)
    rows = (db.query(DocumentApprovalStep, HrDocumentVersion, HrDocument)
            .join(HrDocumentVersion, HrDocumentVersion.id == DocumentApprovalStep.version_id)
            .join(HrDocument, HrDocument.id == DocumentApprovalStep.document_id)
            .filter(DocumentApprovalStep.organization_id == org, DocumentApprovalStep.status == ApprovalStepStatus.PENDING,
                    DocumentApprovalStep.step_order == 1, HrDocumentVersion.status == "pending_approval",
                    HrDocument.is_deleted.is_(False))
            .all())
    if rows and notify.quiet_until(db, org, ["email"], now):
        return 0
    sent = 0
    for step, version, doc in rows:
        age = now - (version.created_at or now)
        level = 2 if age >= 2 * sla else (1 if age >= sla else 0)
        if level <= (step.sla_level or 0):
            continue
        to = "org_admins" if level == 2 else "hr_admins"
        people = [p for p in notify.recipients(db, org, to) if p.id not in (version.uploaded_by, doc.employee_id)]
        days = max(age.days, 1)
        n = notify.send(db, org, people, "document.review_needed", title=doc.title,
                        link=f"{notify.APPROVALS_LINK}?item={doc.id}", channels=["in_app", "email"],
                        email=notify.EmailPart(subject=f"Review overdue: {doc.title}", heading="Document review overdue",
                                               message=f"{doc.title} has been waiting for review for {days} day{'s' if days != 1 else ''}.",
                                               action_label="Open Approval Workflow", badge_tone="warning"),
                        reminder_kind="sla", level=level, document_id=doc.id,
                        dedupe_key=f"sla:doc{doc.id}:v{version.id}:l{level}", now=now)
        step.sla_level = level
        sent += n
    return sent


# ── weekly HR digest ───────────────────────────────────────────────────────────────────────────────────────────────

def weekly_digest(db: Session, org: int, now: datetime) -> int:
    """Monday summary for HR and Org Admins: reviews waiting (and past the SLA), incomplete employees, documents expiring in
    30 days, and automation runs that gave up. Counts only. Once per ISO week; nothing is sent when everything is zero."""
    from types import SimpleNamespace
    from app.modules.hr.documents import employee_docs_service, notify, queue_service
    from app.modules.hr.models import HrDocument
    actor = SimpleNamespace(organization_id=org, id=None)
    q = queue_service.summary(db, actor, now)
    people = employee_docs_service.status_counts(db, actor)
    today = now.date()
    expiring = (db.query(HrDocument.id)
                .filter(HrDocument.organization_id == org, HrDocument.is_deleted.is_(False), HrDocument.scope == "employee",
                        HrDocument.approved_version_id.isnot(None), HrDocument.expiry_date.isnot(None),
                        HrDocument.expiry_date >= today, HrDocument.expiry_date <= today + timedelta(days=30)).count())
    figures = {"awaiting_review": q["awaiting_review"], "sla_breached": q["sla_breached"],
               "incomplete": people.get("pending", 0) + people.get("needs_review", 0) + people.get("expired", 0),
               "expiring_30": expiring, "failed_automations": q["dead_runs"]}
    if not any(figures.values()):
        return 0
    year, week, _ = today.isocalendar()
    lines = [f"{figures['awaiting_review']} document(s) waiting for review ({figures['sla_breached']} past the {q['sla_hours']} h target)",
             f"{figures['incomplete']} employee(s) with documents missing, to review or expired",
             f"{figures['expiring_30']} document(s) expiring in the next 30 days"]
    if figures["failed_automations"]:
        lines.append(f"{figures['failed_automations']} automation run(s) failed and need a look")
    recipients = {p.id: p for p in notify.recipients(db, org, "hr_admins") + notify.recipients(db, org, "org_admins")}
    return notify.send(db, org, list(recipients.values()), "document.weekly_digest", title=f"{figures['awaiting_review']} to review",
                       link=notify.APPROVALS_LINK, channels=["in_app", "email"],
                       email=notify.EmailPart(subject="Your weekly documents summary", heading="Documents this week",
                                              message="\n".join(lines), action_label="Open Approval Workflow"),
                       reminder_kind="digest", dedupe_key=f"digest:o{org}:{year}w{week}", now=now)


# ── offboarding and retention ───────────────────────────────────────────────────────────────────────────────────────

OFFBOARDING_ARCHIVE_DAYS = 30        # default: files of a person who left are archived this long after their exit date


def _exit_dates(db: Session, org: int) -> dict:
    """{employee_id: exit date} for people who have left (latest exit event)."""
    from sqlalchemy import func
    from app.modules.employee.models import Employee
    from app.modules.hr.models import EmployeeLifecycle
    rows = (db.query(EmployeeLifecycle.employee_id, func.max(EmployeeLifecycle.event_date))
            .join(Employee, Employee.id == EmployeeLifecycle.employee_id)
            .filter(EmployeeLifecycle.organization_id == org, EmployeeLifecycle.event_type == "exit",
                    Employee.is_active.is_(False))
            .group_by(EmployeeLifecycle.employee_id).all())
    return {emp: when for emp, when in rows if when}


def _policies(db: Session, org: int) -> dict:
    from app.modules.hr.documents.automation.models import RetentionPolicy
    return {(p.scope, p.category_key): p for p in db.query(RetentionPolicy).filter(RetentionPolicy.organization_id == org)}


def _add_years(day, years: int):
    try:
        return day.replace(year=day.year + years)
    except ValueError:                                   # 29 February
        return day.replace(year=day.year + years, day=28)


def offboarding_finalize(db: Session, org: int, now: datetime) -> int:
    """People who left more than the organization's lock period (automation settings, default 30 days) ago: their files are archived, and the retention clock of
    categories kept "from exit" starts at the exit date. Files are never deleted here."""
    from app.modules.hr.documents import audit_service
    from app.modules.hr.documents.models import HrEmployeeDocumentCategory
    from app.modules.hr.models import HrDocument
    from app.modules.hr.documents.automation.limits import org_settings
    settings = org_settings(db, org)
    days = settings.lock_after_exit_days if settings is not None and settings.lock_after_exit_days is not None else OFFBOARDING_ARCHIVE_DAYS
    cutoff = now.date() - timedelta(days=days)
    leavers = {e: d for e, d in _exit_dates(db, org).items() if d <= cutoff}
    if not leavers:
        return 0
    policies = _policies(db, org)
    keys = {c.id: c.key for c in db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.organization_id == org)}
    docs = (db.query(HrDocument)
            .filter(HrDocument.organization_id == org, HrDocument.scope == "employee", HrDocument.is_deleted.is_(False),
                    HrDocument.is_archived.is_(False), HrDocument.employee_id.in_(list(leavers)))
            .all())
    for doc in docs:
        doc.is_archived = True
        policy = policies.get(("employee", keys.get(doc.employee_category_id)))
        if policy is not None and policy.clock == "from_exit" and doc.retention_until is None:
            doc.retention_until = _add_years(leavers[doc.employee_id], policy.retain_years)
        audit_service.record(db, org_id=org, actor=None, actor_type="system", action="archived", target_type="document",
                             target_id=doc.id, document_id=doc.id, employee_id=doc.employee_id, after={"reason": "offboarding"})
    return len(docs)


def retention_due_date(doc, policy, category_expiry=None):
    """When a file's retention period ends under `policy` (None: the clock has not started)."""
    if policy.clock == "from_upload":
        start = (doc.created_at.date() if doc.created_at else None)
        return _add_years(start, policy.retain_years) if start else None
    if policy.clock == "from_expiry":
        return _add_years(doc.expiry_date, policy.retain_years) if doc.expiry_date else None
    return doc.retention_until                           # from_exit: set when the person's files were archived


def retention_sweep(db: Session, org: int, now: datetime) -> int:
    """Apply the organization's retention policies (decision Q-D: archive unless the Org Admin chose otherwise).
    flag → HR is told the period ended; archive → the file is archived; delete → HR is told, and the file is removed
    `review_days` later unless someone put it on legal hold. Legal hold always wins. Once per file and action."""
    from app.modules.hr.documents import audit_service, notify
    from app.modules.hr.documents.models import HrCompanyDocumentCategory, HrDocumentReminder, HrEmployeeDocumentCategory
    from app.modules.hr.models import HrDocument
    policies = _policies(db, org)
    if not policies:
        return 0
    today = now.date()
    keys = {("employee", c.id): c.key for c in db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.organization_id == org)}
    keys.update({("company", c.id): c.key for c in db.query(HrCompanyDocumentCategory).filter(HrCompanyDocumentCategory.organization_id == org)})
    docs = (db.query(HrDocument).filter(HrDocument.organization_id == org, HrDocument.is_deleted.is_(False),
                                        HrDocument.legal_hold.is_(False), HrDocument.scope.in_(["employee", "company"])).all())
    done = 0
    flagged = []
    for doc in docs:
        cat_id = doc.employee_category_id if doc.scope == "employee" else doc.company_category_id
        policy = policies.get((doc.scope, keys.get((doc.scope, cat_id))))
        if policy is None:
            continue
        due = retention_due_date(doc, policy)
        if due is None or due > today:
            continue
        flag_key = f"retention:d{doc.id}:due"
        flag = db.query(HrDocumentReminder).filter(HrDocumentReminder.dedupe_key == flag_key).first()
        if flag is None:
            db.add(HrDocumentReminder(organization_id=org, kind="retention", level=0, dedupe_key=flag_key, document_id=doc.id,
                                      employee_id=doc.employee_id, channel="in_app", sent_at=now))
            audit_service.record(db, org_id=org, actor=None, actor_type="system", action="retention_due", target_type="document",
                                 target_id=doc.id, document_id=doc.id, employee_id=doc.employee_id,
                                 after={"policy": policy.action, "due": str(due)})
            flagged.append(doc)
            done += 1
        if policy.action == "archive" and not doc.is_archived:
            doc.is_archived = True
            audit_service.record(db, org_id=org, actor=None, actor_type="system", action="archived", target_type="document",
                                 target_id=doc.id, document_id=doc.id, employee_id=doc.employee_id, after={"reason": "retention"})
            done += 1
        elif policy.action == "delete" and flag is not None and flag.sent_at and flag.sent_at <= now - timedelta(days=policy.review_days):
            doc.is_deleted = True
            audit_service.record(db, org_id=org, actor=None, actor_type="system", action="deleted", target_type="document",
                                 target_id=doc.id, document_id=doc.id, employee_id=doc.employee_id,
                                 after={"reason": "retention", "policy_years": policy.retain_years})
            done += 1
    if flagged:
        n = len(flagged)
        notify.send(db, org, notify.recipients(db, org, "hr_admins") + notify.recipients(db, org, "org_admins"),
                    "document.retention_due", title=f"{n} document{'s' if n != 1 else ''}", link="/zoiko-hr/documents/settings/automation",
                    channels=["in_app"], reminder_kind="retention", dedupe_key=f"retention:o{org}:{today.isoformat()}", now=now)
    return done


# ── company documents: scheduled publishing, acknowledgement audience, re-acknowledgement, expiry ────────────────

def scheduled_publish(db: Session, org: int, now: datetime) -> int:
    from app.modules.hr.documents.company_docs import on_published
    from app.modules.hr.models import HrDocument, HrDocumentVersion
    docs = (db.query(HrDocument).filter(HrDocument.organization_id == org, HrDocument.scope == "company",
                                        HrDocument.is_deleted.is_(False), HrDocument.publish_state == "scheduled",
                                        HrDocument.publish_at.isnot(None), HrDocument.publish_at <= now).all())
    for doc in docs:
        doc.publish_state, doc.publish_at = "published", None
        if doc.approved_version_id:
            on_published(db, doc, db.get(HrDocumentVersion, doc.approved_version_id), None, material_change=True)
        from app.modules.hr.documents import audit_service
        audit_service.record(db, org_id=org, actor=None, action="published", target_type="document", target_id=doc.id,
                             document_id=doc.id, after={"scheduled": True})
    return len(docs)


def ack_new_audience(db: Session, org: int, now: datetime) -> int:
    """People who joined a document's audience after its acknowledgement round opened (new joiners, role or department
    changes) get their acknowledge task too."""
    from app.modules.hr.documents import access_resolver
    from app.modules.hr.documents.company_docs import _audience_for, add_to_current_round, current_round
    from app.modules.hr.models import HrDocument
    added = 0
    for doc in (db.query(HrDocument).filter(HrDocument.organization_id == org, HrDocument.scope == "company",
                                            HrDocument.is_deleted.is_(False), HrDocument.publish_state == "published",
                                            HrDocument.approved_version_id.isnot(None)).all()):
        if not access_resolver.effective_rule(db, org, doc).require_ack or current_round(db, doc) is None:
            continue
        for person in _audience_for(db, doc):
            added += 1 if add_to_current_round(db, doc, person.id, now) else 0
    return added


def periodic_reack(db: Session, org: int, now: datetime) -> int:
    """Categories with a re-acknowledgement interval: open a new round once the interval has passed."""
    from app.modules.hr.documents.company_docs import current_round, open_ack_round
    from app.modules.hr.documents.models import HrCompanyDocumentCategory
    from app.modules.hr.models import HrDocument, HrDocumentVersion
    opened = 0
    cats = (db.query(HrCompanyDocumentCategory).filter(HrCompanyDocumentCategory.organization_id == org,
                                                       HrCompanyDocumentCategory.reack_interval_months.isnot(None)).all())
    for cat in cats:
        months = int(cat.reack_interval_months)
        for doc in (db.query(HrDocument).filter(HrDocument.company_category_id == cat.id, HrDocument.is_deleted.is_(False),
                                                HrDocument.publish_state == "published", HrDocument.approved_version_id.isnot(None)).all()):
            rnd = current_round(db, doc)
            if rnd is None or rnd.opened_at + timedelta(days=round(months * 30.44)) > now:
                continue
            if open_ack_round(db, doc, db.get(HrDocumentVersion, doc.approved_version_id), "periodic", None, now):
                opened += 1
    return opened


def auto_unpublish(db: Session, org: int, now: datetime) -> int:
    from app.modules.hr.documents import audit_service
    from app.modules.hr.documents.models import HrCompanyDocumentCategory
    from app.modules.hr.models import HrDocument
    cat_ids = [c for (c,) in db.query(HrCompanyDocumentCategory.id).filter(
        HrCompanyDocumentCategory.organization_id == org, HrCompanyDocumentCategory.auto_unpublish_on_expiry.is_(True))]
    if not cat_ids:
        return 0
    docs = (db.query(HrDocument).filter(HrDocument.company_category_id.in_(cat_ids), HrDocument.is_deleted.is_(False),
                                        HrDocument.publish_state == "published", HrDocument.expiry_date.isnot(None),
                                        HrDocument.expiry_date < now.date()).all())
    for doc in docs:
        doc.publish_state = "unpublished"
        audit_service.record(db, org_id=org, actor=None, action="unpublished", target_type="document", target_id=doc.id,
                             document_id=doc.id, after={"reason": "expired"})
    return len(docs)


# ── job entry points ───────────────────────────────────────────────────────────────────────────────────────────────

def _run(name: str, feature: Optional[str], fn, now: Optional[datetime] = None) -> Optional[int]:
    from app.modules.hr.documents.automation import limits
    db = _session()
    try:
        if limits.globally_paused(db):
            return 0
        n = _for_each_org(db, feature, fn, now or datetime.utcnow())
        logger.info("documents %s: %s", name, n)
        return n
    except Exception:
        db.rollback()
        logger.exception("documents %s failed", name)
        return None
    finally:
        db.close()


def expire_job():
    return _run("expire", "expiry", expire_documents)


def expiry_alerts_job():
    return _run("expiry_alerts", "expiry", expiry_alerts)


def task_escalation_job():
    return _run("task_escalation", "reminders", escalate_tasks)


def approval_sla_job():
    return _run("approval_sla", "sla", approval_sla)


def scheduled_publish_job():
    return _run("scheduled_publish", "policy_auto", scheduled_publish)


def offboarding_job():
    return _run("offboarding_finalize", "offboarding", offboarding_finalize)


def retention_job():
    return _run("retention_sweep", None, retention_sweep)


def weekly_digest_job():
    return _run("weekly_digest", "digest", weekly_digest)


def company_ack_job():
    def both(db, org, now):
        return ack_new_audience(db, org, now) + periodic_reack(db, org, now) + auto_unpublish(db, org, now)
    return _run("company_acknowledgements", "policy_auto", both)


def register(scheduler) -> None:
    from apscheduler.triggers.cron import CronTrigger
    jobs = [
        (expire_job, CronTrigger(hour=1, minute=15), "hr_doc_expire", "Expire approved documents past their expiry date"),
        (expiry_alerts_job, CronTrigger(hour=7, minute=15), "hr_doc_expiry_alerts", "Document expiry alerts (30/15/7 days)"),
        (task_escalation_job, CronTrigger(minute=20), "hr_doc_task_escalation", "Document task reminders and escalation"),
        (approval_sla_job, CronTrigger(minute=35), "hr_doc_approval_sla", "Overdue document reviews: remind HR, then Org Admins"),
        (scheduled_publish_job, CronTrigger(minute="*/5"), "hr_doc_scheduled_publish", "Publish company documents at their scheduled time"),
        (offboarding_job, CronTrigger(hour=2, minute=30), "hr_doc_offboarding_finalize", "Archive the files of people who left"),
        (retention_job, CronTrigger(hour=3, minute=45), "hr_doc_retention_sweep", "Apply document retention policies"),
        (weekly_digest_job, CronTrigger(day_of_week="mon", hour=7, minute=10), "hr_doc_weekly_digest",
         "Weekly documents summary for HR"),
        (company_ack_job, CronTrigger(hour=5, minute=30), "hr_doc_company_acks",
         "Acknowledgements for new audience members, periodic re-acknowledgement, unpublish expired"),
    ]
    for fn, trigger, job_id, name in jobs:
        scheduler.add_job(fn, trigger, id=job_id, name=name, replace_existing=True, misfire_grace_time=3600,
                          coalesce=True, max_instances=1)
