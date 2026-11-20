"""The documents actions rules can run (ZHR-DOCS-ARCH-001 §13.1, §15.1). Registered into actions.ACTIONS on import.

Generic (usable in custom rules): notify, create_task, cancel_tasks.
System-rule actions: create_upload_tasks (onboarding checklist), notify_upload_for_review, notify_document_decision,
open_renew_task.

Every handler: reads ids from the run's context, changes only through domain helpers, honours dry runs, and returns
`defer_until` (instead of sending) when an email would fall inside the organization's quiet hours.
"""
from datetime import datetime
from typing import Optional

from app.modules.hr.documents import notify
from app.modules.hr.documents.automation.actions import PermanentError, StepResult, action
from app.modules.hr.documents.automation.ladder import resolve_ladder
from app.modules.hr.documents.automation.models import TaskKind
from app.modules.hr.documents.automation import tasks as task_service


def _org(ctx: dict) -> int:
    org = (ctx.get("org") or {}).get("id")
    if org is None:
        raise PermanentError("the run has no organization")
    return int(org)


def _data(ctx: dict) -> dict:
    return ctx.get("data") or {}


def _document(db, org: int, document_id) :
    from app.modules.hr.models import HrDocument
    if not document_id:
        return None
    return db.query(HrDocument).filter(HrDocument.id == document_id, HrDocument.organization_id == org).first()


def _category(db, org: int, *, key: Optional[str] = None, category_id: Optional[int] = None):
    from app.modules.hr.documents.models import HrEmployeeDocumentCategory
    q = db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.organization_id == org)
    if category_id:
        return q.filter(HrEmployeeDocumentCategory.id == category_id).first()
    if key:
        return q.filter(HrEmployeeDocumentCategory.key == key).first()
    return None


def _org_default_ladder(db, org: int):
    from app.modules.hr.documents.automation.limits import org_settings
    s = org_settings(db, org)
    return s.default_ladder if s else None


def _deferred(db, org: int, channels, now: datetime) -> Optional[datetime]:
    return notify.quiet_until(db, org, channels, now)


# ── generic ─────────────────────────────────────────────────────────────────────────────────────────────────────────

@action("notify")
def notify_action(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """{"type": "notify", "to": "assignee|manager|hr_admins|org_admins", "event": "<hr_notifications event>",
        "channels": ["in_app", "email"], "subject": "...", "heading": "...", "message": "..."}"""
    from app.modules.hr.hr_notifications import EVENTS
    org, data = _org(ctx), _data(ctx)
    event = params.get("event") or "document.review_needed"
    if event not in EVENTS:
        raise PermanentError(f"unknown notification {event!r}")
    channels = params.get("channels") or ["in_app"]
    people = notify.recipients(db, org, params.get("to") or "assignee", data.get("employee_id"))
    if dry:
        return StepResult(detail={"would_notify": len(people), "event": event, "channels": channels})
    until = _deferred(db, org, channels, now)
    if until:
        return StepResult(defer_until=until, detail={"deferred_until": until.isoformat()})
    doc = _document(db, org, data.get("document_id"))
    title = (doc.title if doc else None) or params.get("title") or "a document"
    email = None
    if "email" in channels and params.get("subject"):
        email = notify.EmailPart(subject=params["subject"][:150], heading=(params.get("heading") or params["subject"])[:150],
                                 message=(params.get("message") or "")[:1000])
    n = notify.send(db, org, people, event, title=title, link=params.get("link") or notify.TO_ACTION_LINK,
                    channels=channels, email=email, document_id=getattr(doc, "id", None), now=now)
    return StepResult(detail={"notified": n, "event": event})


@action("create_task")
def create_task_action(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """{"type": "create_task", "kind": "reupload|acknowledge|review|renew|upload_required", "due_in_days": 5}"""
    org, data = _org(ctx), _data(ctx)
    kind = params.get("kind")
    if kind not in {k.value for k in TaskKind}:
        raise PermanentError(f"unknown task kind {kind!r}")
    employee_id = data.get("employee_id")
    if not employee_id and kind != TaskKind.REVIEW.value:
        return StepResult(ok=False, detail={"skipped": "no person in the event"})
    cat = _category(db, org, key=data.get("category_key"))
    if dry:
        return StepResult(detail={"would_open": kind, "employee_id": employee_id})
    task, created = task_service.open_task(
        db, org, kind, employee_id=employee_id, assignee_role="hr_admin" if kind == TaskKind.REVIEW.value else None,
        document_id=data.get("document_id"), employee_category_id=getattr(cat, "id", None),
        due_in_days=params.get("due_in_days"), ladder=resolve_ladder(getattr(cat, "escalation_ladder", None), _org_default_ladder(db, org)),
        source="rule", rule_id=getattr(run, "rule_id", None), now=now)
    return StepResult(detail={"task_id": task.id, "created": created})


@action("cancel_tasks")
def cancel_tasks_action(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """{"type": "cancel_tasks", "kinds": ["upload_required", ...]}"""
    org, data = _org(ctx), _data(ctx)
    kinds = [k for k in (params.get("kinds") or []) if k in {t.value for t in TaskKind}]
    if not kinds or not data.get("employee_id"):
        raise PermanentError("cancel_tasks needs kinds and a person")
    if dry:
        return StepResult(detail={"would_cancel": kinds})
    n = task_service.close_tasks(db, org, kinds=kinds, employee_id=data["employee_id"], reason="cancelled_by_rule",
                                 status="cancelled", now=now)
    return StepResult(detail={"cancelled": n})


# ── system rules ────────────────────────────────────────────────────────────────────────────────────────────────────

def applicable_required_categories(db, org: int, employee) -> list:
    """Required, active, employee-uploaded categories that apply to this person (department / employment type)."""
    from app.modules.hr.documents.models import HrEmployeeDocumentCategory
    cats = (db.query(HrEmployeeDocumentCategory)
            .filter(HrEmployeeDocumentCategory.organization_id == org, HrEmployeeDocumentCategory.is_active.is_(True),
                    HrEmployeeDocumentCategory.is_required.is_(True), HrEmployeeDocumentCategory.uploader == "employee")
            .order_by(HrEmployeeDocumentCategory.sort_order).all())
    out = []
    emp_type = getattr(getattr(employee, "employment_type", None), "value", getattr(employee, "employment_type", None))
    for c in cats:
        rule = c.applies_to or {}
        depts, types = rule.get("department_ids") or [], rule.get("employment_types") or []
        if depts and getattr(employee, "department_id", None) not in depts:
            continue
        if types and str(emp_type) not in [str(t) for t in types]:
            continue
        out.append(c)
    return out


@action("create_upload_tasks")
def create_upload_tasks(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """Onboarding checklist: one upload task per required category this person has not uploaded, and one notice."""
    from app.modules.employee.models import Employee
    from app.modules.hr.models import HrDocument
    org, data = _org(ctx), _data(ctx)
    emp = db.query(Employee).filter(Employee.id == data.get("employee_id"), Employee.organization_id == org).first()
    if emp is None or not emp.is_active:
        return StepResult(ok=False, detail={"skipped": "person not found or inactive"})
    have = {cid for (cid,) in db.query(HrDocument.employee_category_id)
            .filter(HrDocument.organization_id == org, HrDocument.employee_id == emp.id, HrDocument.is_deleted.is_(False))}
    missing = [c for c in applicable_required_categories(db, org, emp) if c.id not in have]
    if dry:
        return StepResult(detail={"would_request": [c.key for c in missing]})
    if not missing:
        return StepResult(detail={"requested": []})
    until = _deferred(db, org, ["email"], now)
    if until:
        return StepResult(defer_until=until)
    default_ladder = _org_default_ladder(db, org)
    opened = []
    for c in missing:
        task, created = task_service.open_task(
            db, org, TaskKind.UPLOAD_REQUIRED.value, employee_id=emp.id, employee_category_id=c.id,
            due_in_days=params.get("due_in_days", 14), ladder=resolve_ladder(c.escalation_ladder, default_ladder),
            source="rule", rule_id=getattr(run, "rule_id", None), now=now)
        if created:
            task.escalation_level = 1          # the checklist below is ladder step 0
            opened.append((task, c))
    if opened:
        names = ", ".join(c.name for _, c in opened)
        notify.send(db, org, [emp], "document.upload_requested", title=names, link=notify.MY_FILES_LINK,
                    email=notify.EmailPart(subject="Documents to upload", heading="Please upload your documents",
                                           message=f"Please upload these documents in My Files: {names}.",
                                           action_label="Open My Files"),
                    reminder_kind="upload_missing", task_id=opened[0][0].id, level=0,
                    dedupe_key=f"checklist:{emp.id}:{','.join(str(t.id) for t, _ in opened)}", now=now)
    return StepResult(detail={"requested": [c.key for _, c in opened]})


@action("reassess_requirements")
def reassess_requirements(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """After a role / department / designation change: cancel upload tasks for categories that no longer apply (files are
    kept), then ask for any newly required category (same as the onboarding checklist)."""
    from app.modules.employee.models import Employee
    from app.modules.hr.documents.automation.models import DocumentTask, OPEN_TASK_STATUSES
    org, data = _org(ctx), _data(ctx)
    emp = db.query(Employee).filter(Employee.id == data.get("employee_id"), Employee.organization_id == org).first()
    if emp is None or not emp.is_active:
        return StepResult(ok=False, detail={"skipped": "person not found or inactive"})
    applicable = {c.id for c in applicable_required_categories(db, org, emp)}
    stale = (db.query(DocumentTask)
             .filter(DocumentTask.organization_id == org, DocumentTask.employee_id == emp.id,
                     DocumentTask.kind == TaskKind.UPLOAD_REQUIRED.value, DocumentTask.status.in_(OPEN_TASK_STATUSES),
                     DocumentTask.employee_category_id.isnot(None), DocumentTask.employee_category_id.notin_(applicable or {-1}))
             .all())
    if dry:
        return StepResult(detail={"would_cancel": [t.id for t in stale]})
    for t in stale:
        task_service.close_tasks(db, org, kinds=[t.kind], employee_id=emp.id, employee_category_id=t.employee_category_id,
                                 reason="no_longer_required", status="cancelled", now=now)
    result = create_upload_tasks(db, params, ctx, run, dry=False, now=now)
    detail = dict(result.detail or {})
    detail["cancelled"] = [t.id for t in stale]
    return StepResult(ok=result.ok, detail=detail, resume_at=result.resume_at, defer_until=result.defer_until)


@action("notify_upload_for_review")
def notify_upload_for_review(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """A person uploaded a file that needs review: tell the HR admins (in-app only; the queue is their worklist)."""
    org, data = _org(ctx), _data(ctx)
    if data.get("source") != "employee":
        return StepResult(detail={"skipped": "not an employee upload"})
    people = notify.recipients(db, org, "hr_admins")
    uploader = data.get("employee_id")
    people = [p for p in people if p.id != uploader]          # never ask someone to review their own upload
    if dry:
        return StepResult(detail={"would_notify": len(people)})
    doc = _document(db, org, data.get("document_id"))
    n = notify.send(db, org, people, "document.review_needed", title=getattr(doc, "title", None) or "A document",
                    link=f"{notify.APPROVALS_LINK}?item={data.get('document_id')}", channels=["in_app"], now=now)
    return StepResult(detail={"notified": n})


@action("notify_document_decision")
def notify_document_decision(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """Tell the person about a decision on their document; after a rejection, open their re-upload task."""
    from app.modules.employee.models import Employee
    org, data = _org(ctx), _data(ctx)
    event_type = (ctx.get("event") or {}).get("type")
    emp_id = data.get("employee_id")
    doc = _document(db, org, data.get("document_id"))
    if not emp_id or doc is None or doc.scope != "employee":
        return StepResult(detail={"skipped": "not an employee document"})
    emp = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == org).first()
    if emp is None:
        return StepResult(detail={"skipped": "person not found"})
    approved = event_type == "document.approved"
    if approved and data.get("decided_by") == emp_id:
        return StepResult(detail={"skipped": "own decision"})
    reupload = bool(data.get("reupload"))
    event = "document.approved" if approved else ("document.reupload_requested" if reupload else "document.rejected")
    if dry:
        return StepResult(detail={"would_notify": event})
    until = _deferred(db, org, ["email"], now)
    if until:
        return StepResult(defer_until=until)
    reason = None if approved else (doc.rejection_reason or None)
    if approved:
        email = notify.EmailPart(subject=f"Your {doc.title} has been approved", heading="Document approved",
                                 message=f"Your {doc.title} has been approved.", action_label="Open My Files", badge_tone="success")
        task_service.close_tasks(db, org, kinds=["reupload", "renew", "upload_required"], employee_id=emp_id,
                                 employee_category_id=doc.employee_category_id, reason="approved", now=now)
    else:
        heading = "New copy requested" if reupload else "Document not approved"
        email = notify.EmailPart(subject=f"Your {doc.title} needs a new copy" if reupload else f"Your {doc.title} was not approved",
                                 heading=heading, message=f"Please upload a new copy of your {doc.title} in My Files.",
                                 reason=reason, action_label="Open My Files", badge_tone="warning")
        cat = _category(db, org, category_id=doc.employee_category_id)
        task, created = task_service.open_task(
            db, org, TaskKind.REUPLOAD.value, employee_id=emp_id, document_id=doc.id,
            employee_category_id=doc.employee_category_id, due_in_days=params.get("due_in_days", 7),
            ladder=resolve_ladder(getattr(cat, "escalation_ladder", None), _org_default_ladder(db, org)),
            source="rule", rule_id=getattr(run, "rule_id", None), now=now)
        if created:
            task.escalation_level = 1          # the notice below is ladder step 0
    n = notify.send(db, org, [emp], event, title=doc.title, link=notify.MY_FILES_LINK, email=email,
                    document_id=doc.id, now=now)
    return StepResult(detail={"notified": n, "event": event})


@action("open_renew_task")
def open_renew_task(db, params: dict, ctx: dict, run, *, dry: bool, now: datetime) -> StepResult:
    """An approved document expired: ask the person for a valid copy and tell HR."""
    from app.modules.employee.models import Employee
    org, data = _org(ctx), _data(ctx)
    doc = _document(db, org, data.get("document_id"))
    if doc is None or doc.scope != "employee" or not doc.employee_id:
        return StepResult(detail={"skipped": "not an employee document"})
    if dry:
        return StepResult(detail={"would_open": "renew"})
    until = _deferred(db, org, ["email"], now)
    if until:
        return StepResult(defer_until=until)
    cat = _category(db, org, category_id=doc.employee_category_id)
    task, created = task_service.open_task(
        db, org, TaskKind.RENEW.value, employee_id=doc.employee_id, document_id=doc.id,
        employee_category_id=doc.employee_category_id, due_in_days=params.get("due_in_days", 14),
        ladder=resolve_ladder(getattr(cat, "escalation_ladder", None), _org_default_ladder(db, org)),
        source="rule", rule_id=getattr(run, "rule_id", None), now=now)
    if created:
        task.escalation_level = 1              # the notice below is ladder step 0
    emp = db.query(Employee).filter(Employee.id == doc.employee_id, Employee.organization_id == org).first()
    n = notify.send(db, org, [emp] if emp else [], "document.expired", title=doc.title, link=notify.MY_FILES_LINK,
                    email=notify.EmailPart(subject=f"Your {doc.title} has expired", heading="Document expired",
                                           message=f"Your {doc.title} has expired. Please upload a valid copy in My Files.",
                                           action_label="Open My Files", badge_tone="warning"),
                    document_id=doc.id, now=now)
    return StepResult(detail={"notified": n})
