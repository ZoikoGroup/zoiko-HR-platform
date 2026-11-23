"""Admin → Employee Documents (ZHR-DOCS-ARCH-001 §7.1, Module A): a READ-ONLY browser of every employee's containers.

Admins never upload here (employees upload in My Files; decisions happen in Approval Workflow). Completion counts approved,
unexpired files in REQUIRED categories that apply to the person; the status chip takes the most urgent state:
expired > needs review (pending / rejected / new copy requested) > pending (required document missing) > complete.
"""
import io
import zipfile
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Iterator, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.pagination import Page
from app.modules.hr.documents import audit_service, errors, notify
from app.modules.hr.documents.automation import tasks as task_service
from app.modules.hr.documents.automation.doc_actions import applicable_required_categories
from app.modules.hr.documents.me_service import containers_for, ensure_categories
from app.modules.hr.documents.models import (
    HrDocumentReminder, HrDocumentReminderRequest, HrEmployeeDocumentCategory, VersionStatus,
)

V = VersionStatus
logger = logging.getLogger("zoiko.documents.reminders")

REMINDER_COOLDOWN = timedelta(hours=24)            # per person AND per document (QA R1-16)
SCHEDULE_GRACE = timedelta(seconds=90)            # a schedule time this old still counts as "now"
MAX_SCHEDULE_AHEAD = timedelta(days=365)
MAX_ZIP_BYTES = 500 * 1024 * 1024
STATUSES = ("complete", "pending", "needs_review", "expired")


def _employee_model():
    from app.modules.employee.models import Employee, EmployeeStatus
    return Employee, EmployeeStatus


def _name(e) -> str:
    return f"{e.first_name or ''} {e.last_name or ''}".strip()


def _get_employee(db: Session, organization_id: int, employee_id: int):
    Employee, _ = _employee_model()
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.organization_id == organization_id).first()
    if emp is None:
        raise errors.not_found("Employee")
    return emp


def completion(containers: list[dict], required_ids: set) -> dict:
    required = [c for c in containers if c["id"] in required_ids]
    approved = sum(1 for c in required if c["status"] == V.APPROVED.value)
    states = [c["status"] for c in containers]
    out = {
        "required": len(required), "approved": approved,
        "pending": sum(1 for s in states if s == V.PENDING_APPROVAL.value),
        "rejected": sum(1 for s in states if s in (V.REJECTED.value, V.REUPLOAD_REQUESTED.value)),
        "expired": sum(1 for s in states if s == V.EXPIRED.value),
        "missing": sum(1 for c in required if c["status"] == "not_uploaded"),
    }
    out["percent"] = round(100 * approved / len(required)) if required else 100
    return out


def derive_status(c: dict) -> str:
    if c["expired"]:
        return "expired"
    if c["pending"] or c["rejected"]:
        return "needs_review"
    if c["missing"] or c["approved"] < c["required"]:
        return "pending"
    return "complete"


def _summary_for(db: Session, org: int, emp) -> dict:
    containers = containers_for(db, org, emp.id)
    required_ids = {c.id for c in applicable_required_categories(db, org, emp)}
    comp = completion(containers, required_ids)
    return {"completion": comp, "status": derive_status(comp), "containers": containers}


def _applies(cat, emp) -> bool:
    rule = cat.applies_to or {}
    depts, types = rule.get("department_ids") or [], rule.get("employment_types") or []
    emp_type = getattr(getattr(emp, "employment_type", None), "value", getattr(emp, "employment_type", None))
    if depts and getattr(emp, "department_id", None) not in depts:
        return False
    if types and str(emp_type) not in [str(t) for t in types]:
        return False
    return True


def bulk_summaries(db: Session, org: int, employees: list) -> dict:
    """{employee_id: {"completion", "status"}} for many people in three queries (categories, documents with their latest
    version's status) instead of per-person / per-file lookups. Same rules as containers_for + completion."""
    from app.modules.hr.models import HrDocument, HrDocumentVersion
    if not employees:
        return {}
    ensure_categories(db, org)
    cats = (db.query(HrEmployeeDocumentCategory)
            .filter(HrEmployeeDocumentCategory.organization_id == org, HrEmployeeDocumentCategory.is_active.is_(True)).all())
    ids = [e.id for e in employees]
    latest = (db.query(HrDocumentVersion.document_id.label("doc_id"), func.max(HrDocumentVersion.version).label("v"))
              .group_by(HrDocumentVersion.document_id).subquery())
    rows = (db.query(HrDocument.employee_id, HrDocument.employee_category_id, HrDocument.expiry_date, HrDocument.status,
                     HrDocumentVersion.status)
            .outerjoin(latest, latest.c.doc_id == HrDocument.id)
            .outerjoin(HrDocumentVersion, (HrDocumentVersion.document_id == HrDocument.id) & (HrDocumentVersion.version == latest.c.v))
            .filter(HrDocument.organization_id == org, HrDocument.employee_id.in_(ids), HrDocument.scope == "employee",
                    HrDocument.is_deleted.is_(False))
            .all())
    today = date.today()
    states: dict = {}                                    # (employee, category) -> [file status, ...]
    for emp_id, cat_id, expiry, doc_status, v_status in rows:
        s = v_status or V.APPROVED.value
        if s == V.APPROVED.value and expiry and expiry < today:
            s = V.EXPIRED.value
        if str(getattr(doc_status, "value", doc_status) or "").lower() == "reupload_requested":
            s = V.REUPLOAD_REQUESTED.value
        states.setdefault((emp_id, cat_id), []).append(s)
    from app.modules.hr.documents.me_service import container_status
    out = {}
    for emp in employees:
        containers = []
        for c in cats:
            files = [{"status": s} for s in states.get((emp.id, c.id), [])]
            containers.append({"id": c.id, "status": container_status(files, bool(c.is_required))})
        required_ids = {c.id for c in cats if c.is_required and c.uploader == "employee" and _applies(c, emp)}
        comp = completion(containers, required_ids)
        out[emp.id] = {"completion": comp, "status": derive_status(comp)}
    return out


def _employee_row(emp, summary: dict) -> dict:
    return {"id": emp.id, "name": _name(emp), "employee_id_str": emp.employee_id or emp.employee_code,
            "department_id": emp.department_id, "designation_id": getattr(emp, "designation_id", None),
            "department": getattr(getattr(emp, "department", None), "name", None),
            "designation": getattr(getattr(emp, "designation", None), "name", None) or getattr(emp, "job_title", None),
            "joined_on": emp.date_of_joining.isoformat() if emp.date_of_joining else None,
            "is_active": bool(emp.is_active), "completion": summary["completion"], "status": summary["status"]}


def employee_summaries(db: Session, actor, *, search: Optional[str] = None, department_id: Optional[int] = None,
                       status: Optional[str] = None, joined_from: Optional[date] = None, joined_to: Optional[date] = None,
                       include_inactive: bool = False, page: int = 1, per_page: int = 25) -> dict:
    Employee, _ = _employee_model()
    org = actor.organization_id
    ensure_categories(db, org)
    q = db.query(Employee).filter(Employee.organization_id == org)
    if not include_inactive:
        q = q.filter(Employee.is_active.is_(True))
    if search and search.strip():
        needle = f"%{search.strip().lower()}%"
        q = q.filter(or_(func.lower(func.coalesce(Employee.first_name, "") + " " + func.coalesce(Employee.last_name, "")).like(needle),
                         func.lower(func.coalesce(Employee.employee_id, "")).like(needle),
                         func.lower(func.coalesce(Employee.employee_code, "")).like(needle)))
    if department_id:
        q = q.filter(Employee.department_id == department_id)
    if joined_from:
        q = q.filter(Employee.date_of_joining >= joined_from)
    if joined_to:
        q = q.filter(Employee.date_of_joining <= joined_to)
    q = q.order_by(Employee.first_name, Employee.last_name, Employee.id)
    if status in STATUSES:
        people = q.all()                                 # the status is computed: filter, then page
        summaries = bulk_summaries(db, org, people)
        rows = [_employee_row(emp, summaries[emp.id]) for emp in people if summaries[emp.id]["status"] == status]
        total = len(rows)
        items = rows[(page - 1) * per_page: page * per_page]
    else:
        total = q.count()
        people = q.offset((page - 1) * per_page).limit(per_page).all()
        summaries = bulk_summaries(db, org, people)
        items = [_employee_row(emp, summaries[emp.id]) for emp in people]
    return Page(items=items, total=total, page=page, per_page=per_page).model_dump()


def status_counts(db: Session, actor) -> dict:
    Employee, _ = _employee_model()
    org = actor.organization_id
    counts = {s: 0 for s in STATUSES}
    people = db.query(Employee).filter(Employee.organization_id == org, Employee.is_active.is_(True)).all()
    for s in bulk_summaries(db, org, people).values():
        counts[s["status"]] += 1
    return counts


def _last_reminder(db: Session, org: int, employee_id: int) -> Optional[datetime]:
    row = (db.query(func.max(HrDocumentReminder.sent_at))
           .filter(HrDocumentReminder.organization_id == org, HrDocumentReminder.employee_id == employee_id,
                   HrDocumentReminder.kind == "upload_missing").scalar())
    return row


def employee_detail(db: Session, actor, employee_id: int) -> dict:
    org = actor.organization_id
    emp = _get_employee(db, org, employee_id)
    s = _summary_for(db, org, emp)
    required_ids = {c.id for c in applicable_required_categories(db, org, emp)}
    last = _last_reminder(db, org, emp.id)
    recent = recently_reminded(db, org, emp.id)
    for c in s["containers"]:
        c["is_required"] = c["id"] in required_ids
        at = recent.get(c["id"])
        c["reminded_at"] = at.isoformat() + "Z" if at else None      # within the 24-hour cooldown of this document
    return {"employee": _employee_row(emp, s), "categories": s["containers"],
            "last_reminder_at": last.isoformat() + "Z" if last else None,
            "scheduled_reminders": scheduled_reminders(db, org, emp.id)}


def category_files(db: Session, actor, employee_id: int, category_id: int) -> dict:
    detail = employee_detail(db, actor, employee_id)
    cat = next((c for c in detail["categories"] if c["id"] == category_id), None)
    if cat is None:
        raise errors.not_found("Category")
    return {"employee": detail["employee"], "category": {k: v for k, v in cat.items() if k != "files"}, "files": cat["files"]}


# ── reminders ──────────────────────────────────────────────────────────────────────────────────────────────────────

def _parse_when(value) -> Optional[datetime]:
    """A schedule time as naive UTC. Accepts a datetime or an ISO string; one with an offset ("Z", "+05:30") is converted."""
    if value in (None, ""):
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            raise errors.invalid("Use a date and time like 2026-12-01T09:30.", "scheduled_for") from None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def schedule_time(value, now: Optional[datetime] = None) -> Optional[datetime]:
    """The validated send time: None means "send now". A time in the past is refused; one a few seconds old (the picker's
    current minute, network delay) counts as now."""
    now = now or datetime.utcnow()
    when = _parse_when(value)
    if when is None or now - SCHEDULE_GRACE <= when <= now:
        return None
    if when < now:
        raise errors.invalid("Choose a time in the future.", "scheduled_for")
    if when > now + MAX_SCHEDULE_AHEAD:
        raise errors.invalid(f"Choose a time within the next {MAX_SCHEDULE_AHEAD.days} days.", "scheduled_for")
    return when


def recently_reminded(db: Session, org: int, employee_id: int, now: Optional[datetime] = None) -> dict:
    """{category id: when} for the documents this person was reminded about within the cooldown (QA R1-16: the cooldown is
    per person AND per document, not per person)."""
    now = now or datetime.utcnow()
    rows = (db.query(HrDocumentReminderRequest.sent_category_ids, HrDocumentReminderRequest.sent_at)
            .filter(HrDocumentReminderRequest.organization_id == org, HrDocumentReminderRequest.employee_id == employee_id,
                    HrDocumentReminderRequest.status == "sent", HrDocumentReminderRequest.sent_at >= now - REMINDER_COOLDOWN)
            .all())
    out: dict = {}
    for ids, at in rows:
        for cid in ids or []:
            if cid not in out or at > out[cid]:
                out[cid] = at
    return out


def _deliver(db: Session, actor, emp, request: HrDocumentReminderRequest, now: datetime, ctx=None) -> dict:
    """Send `request` now: the person's missing / to-replace documents (or the ones HR picked), minus those already reminded
    about within the cooldown. Records the outcome on the request. Raises DOC_REMINDER_COOLDOWN when every document it is
    about is cooling down."""
    org = actor.organization_id
    containers = containers_for(db, org, emp.id)
    required_ids = {c.id for c in applicable_required_categories(db, org, emp)}
    wanted = set(request.category_ids or [])
    targets = [c for c in containers if c["can_upload"] and (c["id"] in wanted if wanted else
               (c["id"] in required_ids and c["status"] == "not_uploaded") or c["status"] in
               (V.REJECTED.value, V.REUPLOAD_REQUESTED.value, V.EXPIRED.value))]
    if not targets:
        request.status, request.detail, request.sent_category_ids = "skipped", "Nothing is missing.", []
        return {"sent": 0, "categories": [], "cooling_down": []}
    recent = recently_reminded(db, org, emp.id, now)
    cooling = [c for c in targets if c["id"] in recent]
    targets = [c for c in targets if c["id"] not in recent]
    if not targets:
        last = max(recent[c["id"]] for c in cooling)
        names = ", ".join(c["name"] for c in cooling)
        request.status, request.sent_category_ids = "skipped", []
        request.detail = f"Already reminded about {names} in the last 24 hours."[:255]
        raise errors.DocError(429, "DOC_REMINDER_COOLDOWN",
                              f"A reminder about {names} was already sent in the last 24 hours.",
                              {"last_reminder_at": last.isoformat() + "Z", "categories": [c["key"] for c in cooling]})
    names = ", ".join(c["name"] for c in targets)
    for c in targets:
        if c["status"] == "not_uploaded":
            task_service.open_task(db, org, "upload_required", employee_id=emp.id, employee_category_id=c["id"],
                                   source="manual", created_by=actor.id, now=now)
    channels = {"both": ["in_app", "email"], "email": ["email"], "in_app": ["in_app"]}.get(request.channel, ["in_app", "email"])
    message = request.message
    extra = f" Note from HR: {message.strip()[:500]}" if message and message.strip() else ""
    n = notify.send(db, org, [emp], "document.upload_reminder", title=names, link=notify.MY_FILES_LINK, channels=channels,
                    email=notify.EmailPart(subject="Reminder: documents to upload", heading="Please upload your documents",
                                           message=f"Please upload these documents in My Files: {names}.{extra}",
                                           action_label="Open My Files", badge_tone="warning"),
                    reminder_kind="upload_missing", employee_category_id=targets[0]["id"] if len(targets) == 1 else None,
                    sent_by=actor.id, now=now)
    if not n:
        request.status, request.sent_category_ids = "skipped", []
        request.detail = "Not delivered: the daily reminder limit was reached or automation is paused."
        return {"sent": 0, "categories": [], "cooling_down": [c["key"] for c in cooling], "reason": request.detail}
    request.status, request.sent_at, request.sent_category_ids = "sent", now, [c["id"] for c in targets]
    request.detail = None
    audit_service.record(db, org_id=org, actor=actor, action="reminder_sent", target_type="employee", target_id=emp.id,
                         employee_id=emp.id, ctx=ctx, after={"categories": [c["key"] for c in targets],
                                                             "scheduled": request.scheduled_for is not None})
    return {"sent": n, "categories": [c["key"] for c in targets], "cooling_down": [c["key"] for c in cooling]}


def send_reminders(db: Session, actor, employee_id: int, category_ids: Optional[list[int]] = None,
                   message: Optional[str] = None, channel: str = "both", now: Optional[datetime] = None,
                   ctx=None, commit: bool = True, scheduled_for=None) -> dict:
    """Remind one person about missing (or to-be-replaced) documents, now or at `scheduled_for` (UTC). One reminder per
    person per document per 24 hours: documents reminded about recently are left out, and when nothing else is left the
    request is refused (429)."""
    now = now or datetime.utcnow()
    org = actor.organization_id
    emp = _get_employee(db, org, employee_id)
    if not emp.is_active:
        raise errors.invalid("This person is no longer active.")
    when = schedule_time(scheduled_for, now)
    request = HrDocumentReminderRequest(organization_id=org, employee_id=emp.id,
                                        category_ids=list(category_ids) if category_ids else None,
                                        message=(message or "").strip()[:500] or None, channel=channel or "both",
                                        scheduled_for=when, status="scheduled", created_by=getattr(actor, "id", None),
                                        created_at=now)
    if when is not None:
        db.add(request)
        db.flush()
        audit_service.record(db, org_id=org, actor=actor, action="reminder_scheduled", target_type="employee",
                             target_id=emp.id, employee_id=emp.id, ctx=ctx,
                             after={"scheduled_for": when.isoformat() + "Z", "category_ids": request.category_ids})
        if commit:
            db.commit()
        return {"sent": 0, "scheduled": True, "id": request.id, "scheduled_for": when.isoformat() + "Z", "categories": []}
    result = _deliver(db, actor, emp, request, now, ctx)
    db.add(request)
    if commit:
        db.commit()
    return result


def bulk_reminders(db: Session, actor, employee_ids: list[int], category_ids: Optional[list[int]] = None,
                   message: Optional[str] = None, ctx=None, scheduled_for=None, now: Optional[datetime] = None) -> dict:
    now = now or datetime.utcnow()
    when = schedule_time(scheduled_for, now)               # validated once, before anything is sent
    sent = skipped = scheduled = 0
    for emp_id in employee_ids[:500]:
        try:
            r = send_reminders(db, actor, emp_id, category_ids, message, ctx=ctx, now=now, scheduled_for=when)
            if r.get("scheduled"):
                scheduled += 1
            elif r["sent"]:
                sent += 1
            else:
                skipped += 1
        except errors.DocError:
            db.rollback()
            skipped += 1
    return {"sent": sent, "skipped": skipped, "scheduled": scheduled}


def scheduled_reminders(db: Session, org: int, employee_id: int) -> list[dict]:
    rows = (db.query(HrDocumentReminderRequest)
            .filter(HrDocumentReminderRequest.organization_id == org, HrDocumentReminderRequest.employee_id == employee_id,
                    HrDocumentReminderRequest.status == "scheduled")
            .order_by(HrDocumentReminderRequest.scheduled_for).all())
    return [{"id": r.id, "scheduled_for": r.scheduled_for.isoformat() + "Z" if r.scheduled_for else None,
             "category_ids": r.category_ids, "message": r.message} for r in rows]


def cancel_scheduled_reminder(db: Session, actor, reminder_id: int, ctx=None) -> dict:
    r = (db.query(HrDocumentReminderRequest)
         .filter(HrDocumentReminderRequest.id == reminder_id,
                 HrDocumentReminderRequest.organization_id == actor.organization_id).first())
    if r is None:
        raise errors.not_found("Reminder")
    if r.status != "scheduled":
        raise errors.DocError(409, "DOC_REMINDER_NOT_SCHEDULED", "This reminder has already been sent or cancelled.")
    r.status, r.detail = "cancelled", "Cancelled by HR."
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="reminder_cancelled", target_type="employee",
                         target_id=r.employee_id, employee_id=r.employee_id, ctx=ctx, after={"reminder_id": r.id})
    db.commit()
    return {"id": r.id, "status": r.status}


def send_due_reminders(db: Session, org: int, now: datetime) -> int:
    """Background job (automation/jobs.py, background leader only): send the scheduled reminders whose time has come. Each
    is sent at most once: its status leaves "scheduled" whatever the outcome."""
    from types import SimpleNamespace
    Employee, _ = _employee_model()
    due = (db.query(HrDocumentReminderRequest)
           .filter(HrDocumentReminderRequest.organization_id == org, HrDocumentReminderRequest.status == "scheduled",
                   HrDocumentReminderRequest.scheduled_for.isnot(None), HrDocumentReminderRequest.scheduled_for <= now)
           .order_by(HrDocumentReminderRequest.scheduled_for, HrDocumentReminderRequest.id).all())
    sent = 0
    for request in due:
        creator = db.get(Employee, request.created_by) if request.created_by else None
        actor = creator if creator is not None and creator.organization_id == org else SimpleNamespace(
            organization_id=org, id=None, role=None)
        emp = db.query(Employee).filter(Employee.id == request.employee_id, Employee.organization_id == org).first()
        if emp is None or not emp.is_active:
            request.status, request.detail = "skipped", "The person is no longer active."
            continue
        try:
            with db.begin_nested():
                sent += 1 if _deliver(db, actor, emp, request, now)["sent"] else 0
        except errors.DocError as e:                     # every document is cooling down
            request.status = "skipped"
            request.detail = (getattr(e, "message", None) or "Skipped.")[:255]
        except Exception:
            logger.exception("scheduled document reminder %s failed", request.id)
            request.status, request.detail = "failed", "The reminder could not be sent."
    return sent


# ── ZIP export ─────────────────────────────────────────────────────────────────────────────────────────────────────

def export_zip(db: Session, actor, employee_id: int, approved_only: bool = True, ctx=None) -> tuple[str, bytes]:
    """(file name, zip bytes) of a person's documents, one folder per category. Audited."""
    from app.modules.hr.documents import storage_service
    from app.modules.hr.models import HrDocument, HrDocumentVersion
    org = actor.organization_id
    emp = _get_employee(db, org, employee_id)
    cats = {c.id: c for c in db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.organization_id == org)}
    docs = (db.query(HrDocument).filter(HrDocument.organization_id == org, HrDocument.employee_id == emp.id,
                                        HrDocument.scope == "employee", HrDocument.is_deleted.is_(False)).all())
    buf = io.BytesIO()
    total, names = 0, set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for d in docs:
            if approved_only and d.approved_version_id:
                version = db.get(HrDocumentVersion, d.approved_version_id)
            elif approved_only:
                continue
            else:
                version = (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == d.id)
                           .order_by(HrDocumentVersion.version.desc()).first())
            data = storage_service.open_for_read(version) if version is not None else None
            if data is None:
                data = storage_service.open_for_read(d)
            if data is None:
                continue
            total += len(data)
            if total > MAX_ZIP_BYTES:
                raise errors.invalid("These documents are too large to download together.")
            folder = getattr(cats.get(d.employee_category_id), "name", "Other").replace("/", "-")
            base = (getattr(version, "file_name", None) or d.file_name or f"document-{d.id}").replace("/", "-")
            path = f"{folder}/{base}"
            i = 1
            while path in names:
                i += 1
                path = f"{folder}/{i}-{base}"
            names.add(path)
            zf.writestr(path, data)
    audit_service.record(db, org_id=org, actor=actor, action="exported", target_type="employee", target_id=emp.id,
                         employee_id=emp.id, ctx=ctx, after={"files": len(names), "approved_only": approved_only})
    db.commit()
    safe = "".join(ch for ch in _name(emp) if ch.isalnum() or ch in " -_").strip().replace(" ", "-") or f"employee-{emp.id}"
    return f"{safe}-documents.zip", buf.getvalue()


# ── category settings ──────────────────────────────────────────────────────────────────────────────────────────────

EDITABLE = ("name", "description", "is_required", "requires_expiry", "max_files", "id_number_field", "applies_to",
            "escalation_ladder", "sort_order", "is_active")


def list_employee_categories(db: Session, actor) -> list[dict]:
    ensure_categories(db, actor.organization_id)
    cats = (db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.organization_id == actor.organization_id)
            .order_by(HrEmployeeDocumentCategory.sort_order, HrEmployeeDocumentCategory.id).all())
    return [_cat_out(c) for c in cats]


def _cat_out(c) -> dict:
    return {k: getattr(c, k) for k in ("id", "key", "name", "description", "is_required", "uploader", "requires_expiry",
                                       "max_files", "sensitivity", "applies_to", "id_number_field", "human_approval_required",
                                       "escalation_ladder", "sort_order", "is_system", "is_active")}


def _clean(data: dict) -> dict:
    from app.modules.hr.documents import id_validators
    from app.modules.hr.documents.automation.ladder import LadderInvalid, validate_ladder
    out = {k: v for k, v in data.items() if k in EDITABLE}
    if "name" in out:
        out["name"] = (out["name"] or "").strip()[:120]
        if not out["name"]:
            raise errors.invalid("Give the category a name.", "name")
    if out.get("id_number_field") not in (None, "") and out["id_number_field"] not in id_validators.REGISTRY:
        raise errors.invalid("Unknown identity-number check.", "id_number_field")
    if out.get("id_number_field") == "":
        out["id_number_field"] = None
    if out.get("escalation_ladder"):
        try:
            out["escalation_ladder"] = validate_ladder(out["escalation_ladder"])
        except LadderInvalid as exc:
            raise errors.invalid(str(exc), "escalation_ladder") from None
    if "max_files" in out and out["max_files"] is not None and int(out["max_files"]) < 1:
        raise errors.invalid("Allow at least one file.", "max_files")
    return out


def create_employee_category(db: Session, actor, data: dict, ctx=None) -> dict:
    import re
    clean = _clean(data)
    if "name" not in clean:
        raise errors.invalid("Give the category a name.", "name")
    key = "custom_" + (re.sub(r"[^a-z0-9]+", "_", clean["name"].lower()).strip("_")[:40] or "category")
    org = actor.organization_id
    base, i = key, 1
    while db.query(HrEmployeeDocumentCategory.id).filter(HrEmployeeDocumentCategory.organization_id == org,
                                                         HrEmployeeDocumentCategory.key == key).first():
        i += 1
        key = f"{base}_{i}"[:50]
    cat = HrEmployeeDocumentCategory(organization_id=org, key=key, uploader="employee", is_system=False, created_by=actor.id,
                                     **{k: v for k, v in clean.items()})
    db.add(cat)
    db.flush()
    audit_service.record(db, org_id=org, actor=actor, action="category_changed", target_type="category", target_id=cat.id,
                         ctx=ctx, after={"created": key})
    db.commit()
    return _cat_out(cat)


def update_employee_category(db: Session, actor, category_id: int, data: dict, ctx=None) -> dict:
    cat = (db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.id == category_id,
                                                       HrEmployeeDocumentCategory.organization_id == actor.organization_id).first())
    if cat is None:
        raise errors.not_found("Category")
    clean = _clean(data)
    if cat.human_approval_required and "is_active" in clean and not clean["is_active"]:
        pass  # deactivating is allowed; the human-approval guarantee is about approvals, not visibility
    before = {k: getattr(cat, k) for k in clean}
    for k, v in clean.items():
        setattr(cat, k, v)
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="category_changed", target_type="category",
                         target_id=cat.id, ctx=ctx, before=before, after=clean)
    db.commit()
    return _cat_out(cat)


def delete_employee_category(db: Session, actor, category_id: int, ctx=None) -> None:
    from app.modules.hr.models import HrDocument
    cat = (db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.id == category_id,
                                                       HrEmployeeDocumentCategory.organization_id == actor.organization_id).first())
    if cat is None:
        raise errors.not_found("Category")
    if cat.is_system:
        raise errors.DocError(409, "DOC_SYSTEM_CATEGORY", "Built-in categories can't be deleted. Turn them off instead.")
    in_use = db.query(HrDocument.id).filter(HrDocument.employee_category_id == cat.id, HrDocument.is_deleted.is_(False)).first()
    if in_use:
        cat.is_active = False                      # keep the files' container; hide it from new uploads
    else:
        db.delete(cat)
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="category_changed", target_type="category",
                         target_id=category_id, ctx=ctx, after={"deleted": not in_use, "deactivated": bool(in_use)})
    db.commit()
