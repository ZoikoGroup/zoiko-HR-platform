"""Company documents (ZHR-DOCS-ARCH-001 §7.2, Module B): categories, files, versions, publishing, access rules and
acknowledgement rounds, and the employee's view of what is shared with them.

Visibility is decided only by access_resolver. A version becomes visible when it is approved (automatically unless the
category requires approval) AND the document is published (now, or at its scheduled time). A material new version of a
document that needs acknowledging opens a new acknowledgement round; a minor one keeps the current round.
"""
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.pagination import Page
from app.modules.hr.documents import access_resolver, audit_service, errors, lifecycle, notify, storage_service
from app.modules.hr.documents.automation import tasks as task_service
from app.modules.hr.documents.category_service import seed_org_categories
from app.modules.hr.documents.models import (
    HrCompanyDocumentCategory, HrDocumentAccessRule, HrDocumentAckRound, HrDocumentAcknowledgement, Visibility,
)
from app.modules.hr.documents.permissions import ORG_ADMIN, is_document_admin, role_of
from app.modules.hr.documents.precheck import COMPANY_EXTENSIONS

EXPIRING_SOON_DAYS = 30
ACK_DUE_DAYS = 14
VALID_ROLES = ("admin", "hr_admin", "manager", "employee")
CATEGORY_FIELDS = ("name", "icon", "requires_approval", "default_require_ack", "ack_reminder_after_days", "reack_interval_months",
                   "auto_unpublish_on_expiry", "locked_by_org_admin", "is_hidden", "sort_order")


def _doc_models():
    from app.modules.hr.models import HrDocument, HrDocumentCategory, HrDocumentFolder, HrDocumentStatus, HrDocumentVersion
    return HrDocument, HrDocumentCategory, HrDocumentFolder, HrDocumentStatus, HrDocumentVersion


def _iso(v):
    if v is None:
        return None
    return v.isoformat() + ("Z" if isinstance(v, datetime) else "")


def _person_name(db: Session, pid):
    if not pid:
        return None
    from app.modules.employee.models import Employee
    p = db.get(Employee, pid)
    return f"{p.first_name or ''} {p.last_name or ''}".strip() if p else None


def _category(db: Session, org: int, category_id: int) -> HrCompanyDocumentCategory:
    cat = (db.query(HrCompanyDocumentCategory)
           .filter(HrCompanyDocumentCategory.id == category_id, HrCompanyDocumentCategory.organization_id == org).first())
    if cat is None:
        raise errors.not_found("Category")
    return cat


def _company_doc(db: Session, org: int, document_id: int):
    HrDocument, *_ = _doc_models()
    doc = (db.query(HrDocument).filter(HrDocument.id == document_id, HrDocument.organization_id == org,
                                       HrDocument.scope == "company", HrDocument.is_deleted.is_(False)).first())
    if doc is None:
        raise errors.not_found()
    return doc


def current_round(db: Session, doc) -> Optional[HrDocumentAckRound]:
    return (db.query(HrDocumentAckRound).filter(HrDocumentAckRound.document_id == doc.id)
            .order_by(HrDocumentAckRound.round_no.desc()).first())


def _ack_counts(db: Session, doc) -> Optional[dict]:
    from app.modules.hr.documents.automation.models import DocumentTask
    rnd = current_round(db, doc)
    if rnd is None:
        return None
    done = (db.query(HrDocumentAcknowledgement.id)
            .filter(HrDocumentAcknowledgement.document_id == doc.id, HrDocumentAcknowledgement.round_no == rnd.round_no).count())
    pending = (db.query(DocumentTask.id).filter(DocumentTask.document_id == doc.id, DocumentTask.kind == "acknowledge",
                                                DocumentTask.ack_round_id == rnd.id,
                                                DocumentTask.status.in_(("open", "overdue"))).count())
    return {"round": rnd.round_no, "acknowledged": done, "pending": pending}


def serialize_company_file(db: Session, doc) -> dict:
    _, _, _, _, HrDocumentVersion = _doc_models()
    latest = (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == doc.id)
              .order_by(HrDocumentVersion.version.desc()).first())
    rule = access_resolver.effective_rule(db, doc.organization_id, doc)
    today = date.today()
    expiry_state = None
    if doc.expiry_date:
        expiry_state = ("expired" if doc.expiry_date < today else
                        "expiring_soon" if doc.expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS) else None)
    return {
        "id": doc.id, "title": doc.title, "description": doc.description, "category_id": doc.company_category_id,
        "folder_id": doc.folder_id, "file_name": (latest.file_name if latest else None) or doc.file_name,
        "mime_type": (latest.mime_type if latest else None) or doc.mime_type, "version": latest.version if latest else 1,
        "version_id": latest.id if latest else None, "status": latest.status if latest else "approved",
        "approved_version_id": doc.approved_version_id, "publish_state": doc.publish_state, "publish_at": _iso(doc.publish_at),
        "expiry_date": _iso(doc.expiry_date), "expiry_state": expiry_state,
        "uploaded_by": {"id": doc.uploaded_by, "name": _person_name(db, doc.uploaded_by)},
        "uploaded_at": _iso(latest.created_at if latest else doc.created_at), "updated_at": _iso(doc.updated_at),
        "access": access_resolver.summary(rule), "ack": _ack_counts(db, doc),
    }


# ── categories ─────────────────────────────────────────────────────────────────────────────────────────────────────

def _card(db: Session, org: int, c, stats: dict) -> dict:
    rule = access_resolver.effective_rule(db, org, category_id=c.id)
    n, last = stats.get(c.id, (0, None))
    return {"id": c.id, "key": c.key, "name": c.name, "icon": c.icon, "requires_approval": bool(c.requires_approval),
            "default_require_ack": bool(c.default_require_ack), "ack_reminder_after_days": c.ack_reminder_after_days,
            "reack_interval_months": c.reack_interval_months, "auto_unpublish_on_expiry": bool(c.auto_unpublish_on_expiry),
            "locked_by_org_admin": bool(c.locked_by_org_admin), "is_system": bool(c.is_system), "is_hidden": bool(c.is_hidden),
            "file_count": n, "last_updated": _iso(last), "access": access_resolver.summary(rule)}


def category_cards(db: Session, actor, access: Optional[str] = None, search: Optional[str] = None, *,
                   include_hidden: bool = False) -> list[dict]:
    HrDocument, *_ = _doc_models()
    org = actor.organization_id
    if seed_org_categories(db, org) != (0, 0):
        db.commit()
    cats = (db.query(HrCompanyDocumentCategory)
            .filter(HrCompanyDocumentCategory.organization_id == org, HrCompanyDocumentCategory.is_active.is_(True))
            .order_by(HrCompanyDocumentCategory.sort_order, HrCompanyDocumentCategory.id).all())
    stats = {cid: (n, last) for cid, n, last in
             db.query(HrDocument.company_category_id, func.count(HrDocument.id), func.max(HrDocument.updated_at))
             .filter(HrDocument.organization_id == org, HrDocument.scope == "company", HrDocument.is_deleted.is_(False))
             .group_by(HrDocument.company_category_id).all()}
    out = []
    for c in cats:
        if c.is_hidden and not include_hidden:
            continue
        card = _card(db, org, c, stats)
        vis = card["access"]["visibility"]
        if access == "admin_only" and vis != "admin_only":
            continue
        if access == "all" and vis != "all_employees":
            continue
        if access == "restricted" and vis in ("admin_only", "all_employees"):
            continue
        if search and search.strip().lower() not in c.name.lower():
            continue
        out.append(card)
    return out


def _clean_category(actor, data: dict) -> dict:
    out = {k: v for k, v in data.items() if k in CATEGORY_FIELDS}
    if "name" in out:
        out["name"] = " ".join((out["name"] or "").split())[:120]
        if not out["name"]:
            raise errors.invalid("Give the category a name.", "name")
    if "is_hidden" in out:
        out["is_hidden"] = bool(out["is_hidden"])
    if "locked_by_org_admin" in out and role_of(actor) != ORG_ADMIN:
        raise errors.forbidden("Only the Organization Admin can lock a category.")
    for k in ("ack_reminder_after_days", "reack_interval_months"):
        if out.get(k) is not None and int(out[k]) < 1:
            raise errors.invalid("Use a whole number of at least 1.", k)
    return out


def create_category(db: Session, actor, data: dict, ctx=None) -> dict:
    import re
    clean = _clean_category(actor, data)
    if not clean.get("name"):
        raise errors.invalid("Give the category a name.", "name")
    org = actor.organization_id
    _ensure_category_name_free(db, org, clean["name"])
    base = "custom_" + (re.sub(r"[^a-z0-9]+", "_", clean["name"].lower()).strip("_")[:40] or "category")
    key, i = base, 1
    while db.query(HrCompanyDocumentCategory.id).filter(HrCompanyDocumentCategory.organization_id == org,
                                                        HrCompanyDocumentCategory.key == key).first():
        i += 1
        key = f"{base}_{i}"[:50]
    cat = HrCompanyDocumentCategory(organization_id=org, key=key, is_system=False, created_by=actor.id, **clean)
    db.add(cat)
    db.flush()
    audit_service.record(db, org_id=org, actor=actor, action="category_changed", target_type="category", target_id=cat.id,
                         ctx=ctx, after={"created": key})
    db.commit()
    return _card(db, org, cat, {})


def update_category(db: Session, actor, category_id: int, data: dict, ctx=None) -> dict:
    cat = _category(db, actor.organization_id, category_id)
    if cat.locked_by_org_admin and role_of(actor) != ORG_ADMIN:
        raise errors.forbidden("The Organization Admin has locked this category.")
    clean = _clean_category(actor, data)
    if clean.get("name") and clean["name"].lower() != (cat.name or "").lower():
        _ensure_category_name_free(db, actor.organization_id, clean["name"], exclude_id=cat.id)
    before = {k: getattr(cat, k) for k in clean}
    hiding = "is_hidden" in clean and clean["is_hidden"] != bool(cat.is_hidden)
    for k, v in clean.items():
        setattr(cat, k, v)
    if hiding:
        _on_visibility_changed(db, cat)
    audit_service.record(db, org_id=actor.organization_id, actor=actor,
                         action=("category_hidden" if cat.is_hidden else "category_shown") if hiding else "category_changed",
                         target_type="category", target_id=cat.id, ctx=ctx, before=before, after=clean)
    db.commit()
    return _card(db, actor.organization_id, cat, _category_stats(db, actor.organization_id, cat.id))


def _category_stats(db: Session, org: int, category_id: int) -> dict:
    HrDocument, *_ = _doc_models()
    row = (db.query(func.count(HrDocument.id), func.max(HrDocument.updated_at))
           .filter(HrDocument.organization_id == org, HrDocument.company_category_id == category_id,
                   HrDocument.scope == "company", HrDocument.is_deleted.is_(False)).first())
    return {category_id: (row[0] or 0, row[1])} if row else {}


def _ensure_category_name_free(db: Session, org: int, name: str, exclude_id: Optional[int] = None) -> None:
    q = db.query(HrCompanyDocumentCategory.id).filter(HrCompanyDocumentCategory.organization_id == org,
                                                      HrCompanyDocumentCategory.is_active.is_(True),
                                                      func.lower(HrCompanyDocumentCategory.name) == name.lower())
    if exclude_id:
        q = q.filter(HrCompanyDocumentCategory.id != exclude_id)
    if q.first():
        raise errors.DocError(409, "DOC_CATEGORY_EXISTS", f"A category called \u201c{name}\u201d already exists.", {"field": "name"})


def _on_visibility_changed(db: Session, cat) -> None:
    """Hiding a category takes its files away from employees, so their open read-confirmation tasks are cancelled.
    Showing it again gives the current round back to everyone in the audience who has not confirmed yet."""
    HrDocument, *_ = _doc_models()
    docs = (db.query(HrDocument).filter(HrDocument.organization_id == cat.organization_id, HrDocument.company_category_id == cat.id,
                                        HrDocument.scope == "company", HrDocument.is_deleted.is_(False)).all())
    for doc in docs:
        if cat.is_hidden:
            task_service.close_tasks(db, doc.organization_id, kinds=["acknowledge"], document_id=doc.id, reason="category_hidden",
                                     status="cancelled")
            continue
        if not access_resolver._published(doc):
            continue
        rule = access_resolver.effective_rule(db, doc.organization_id, doc)
        if not rule.require_ack or current_round(db, doc) is None:
            continue
        for person in access_resolver.audience(db, doc.organization_id, rule):
            add_to_current_round(db, doc, person.id)


def delete_category(db: Session, actor, category_id: int, ctx=None) -> None:
    HrDocument, *_ = _doc_models()
    cat = _category(db, actor.organization_id, category_id)
    if cat.is_system:
        raise errors.DocError(409, "DOC_SYSTEM_CATEGORY", "Built-in categories can't be deleted.")
    if db.query(HrDocument.id).filter(HrDocument.company_category_id == cat.id, HrDocument.is_deleted.is_(False)).first():
        raise errors.DocError(409, "DOC_CATEGORY_NOT_EMPTY", "Move or delete the files in this category first.")
    from app.modules.hr.models import HrDocumentFolder
    if db.query(HrDocumentFolder.id).filter(HrDocumentFolder.company_category_id == cat.id).first():
        raise errors.DocError(409, "DOC_CATEGORY_NOT_EMPTY", "Delete the folders in this category first.")
    cat.is_active = False
    audit_service.record(db, org_id=actor.organization_id, actor=actor, action="category_changed", target_type="category",
                         target_id=cat.id, ctx=ctx, after={"deactivated": True})
    db.commit()


# ── files ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def _expiry_filter(q, HrDocument, expiry: Optional[str]):
    today = date.today()
    if expiry == "expired":
        return q.filter(HrDocument.expiry_date.isnot(None), HrDocument.expiry_date < today)
    if expiry == "expiring_soon":
        return q.filter(HrDocument.expiry_date.isnot(None), HrDocument.expiry_date >= today,
                        HrDocument.expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS))
    return q


def _folders_with_counts(db: Session, folders: list) -> list[dict]:
    """Folder cards with how many files and sub-folders each holds (two grouped queries, whatever the number of folders)."""
    HrDocument, _, HrDocumentFolder, _, _ = _doc_models()
    ids = [f.id for f in folders]
    files = dict(db.query(HrDocument.folder_id, func.count(HrDocument.id))
                 .filter(HrDocument.folder_id.in_(ids or [-1]), HrDocument.is_deleted.is_(False))
                 .group_by(HrDocument.folder_id).all())
    subs = dict(db.query(HrDocumentFolder.parent_id, func.count(HrDocumentFolder.id))
                .filter(HrDocumentFolder.parent_id.in_(ids or [-1])).group_by(HrDocumentFolder.parent_id).all())
    return [{"id": f.id, "name": f.name, "file_count": int(files.get(f.id, 0)), "folder_count": int(subs.get(f.id, 0))}
            for f in folders]


def list_items(db: Session, actor, category_id: int, folder_id: Optional[int] = None, expiry: Optional[str] = None,
               search: Optional[str] = None, page: int = 1, per_page: int = 50) -> dict:
    HrDocument, _, HrDocumentFolder, _, _ = _doc_models()
    from app.modules.hr.service import get_folder_breadcrumb
    org = actor.organization_id
    cat = _category(db, org, category_id)
    folders = db.query(HrDocumentFolder).filter(HrDocumentFolder.organization_id == org, HrDocumentFolder.company_category_id == cat.id)
    folders = folders.filter(HrDocumentFolder.parent_id == folder_id) if folder_id else folders.filter(HrDocumentFolder.parent_id.is_(None))
    q = db.query(HrDocument).filter(HrDocument.organization_id == org, HrDocument.scope == "company",
                                    HrDocument.company_category_id == cat.id, HrDocument.is_deleted.is_(False))
    q = q.filter(HrDocument.folder_id == folder_id) if folder_id else q.filter(HrDocument.folder_id.is_(None))
    q = _expiry_filter(q, HrDocument, expiry)
    if search and search.strip():
        q = q.filter(func.lower(HrDocument.title).like(f"%{search.strip().lower()}%"))
    total = q.count()
    docs = q.order_by(HrDocument.updated_at.desc(), HrDocument.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {
        "category": {"id": cat.id, "key": cat.key, "name": cat.name, "requires_approval": bool(cat.requires_approval),
                     "default_require_ack": bool(cat.default_require_ack), "locked_by_org_admin": bool(cat.locked_by_org_admin)},
        "breadcrumb": get_folder_breadcrumb(db, folder_id, org) if folder_id else [],
        "folders": _folders_with_counts(db, folders.order_by(HrDocumentFolder.name).all()),
        "files": Page(items=[serialize_company_file(db, d) for d in docs], total=total, page=page, per_page=per_page).model_dump(),
    }


def flat_files(db: Session, actor, expiry: Optional[str] = None, search: Optional[str] = None, page: int = 1,
               per_page: int = 50) -> dict:
    HrDocument, *_ = _doc_models()
    q = db.query(HrDocument).filter(HrDocument.organization_id == actor.organization_id, HrDocument.scope == "company",
                                    HrDocument.is_deleted.is_(False))
    q = _expiry_filter(q, HrDocument, expiry)
    if search and search.strip():
        q = q.filter(func.lower(HrDocument.title).like(f"%{search.strip().lower()}%"))
    total = q.count()
    docs = (q.order_by(HrDocument.expiry_date.is_(None), HrDocument.expiry_date, HrDocument.id)
            .offset((page - 1) * per_page).limit(per_page).all())
    return Page(items=[serialize_company_file(db, d) for d in docs], total=total, page=page, per_page=per_page).model_dump()


def _parse_date(value, field):
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise errors.invalid("Use the date format YYYY-MM-DD.", field) from None


def _parse_datetime(value, field):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", ""))
    except ValueError:
        raise errors.invalid("Use the date-time format YYYY-MM-DDTHH:MM.", field) from None


def upsert_rule(db: Session, org: int, target_type: str, target_id: int, data: dict, actor) -> HrDocumentAccessRule:
    rule = (db.query(HrDocumentAccessRule).filter(HrDocumentAccessRule.organization_id == org,
                                                  HrDocumentAccessRule.target_type == target_type,
                                                  HrDocumentAccessRule.target_id == target_id).first())
    if rule is None:
        rule = HrDocumentAccessRule(organization_id=org, target_type=target_type, target_id=target_id)
        db.add(rule)
    for k in ("inherit", "visibility", "permission", "require_ack", "department_ids", "roles", "employee_ids"):
        if k in data:
            setattr(rule, k, data[k])
    rule.updated_by = getattr(actor, "id", None)
    rule.updated_at = datetime.utcnow()
    db.flush()
    return rule


def upload(db: Session, actor, category_id: int, data: bytes, filename: str, *, title: Optional[str] = None,
           description: Optional[str] = None, folder_id: Optional[int] = None, expiry_date=None,
           require_ack: Optional[bool] = None, publish_at=None, notify_audience: bool = True, ctx=None) -> dict:
    HrDocument, HrDocumentCategory, HrDocumentFolder, HrDocumentStatus, _ = _doc_models()
    org = actor.organization_id
    cat = _category(db, org, category_id)
    if folder_id and not db.query(HrDocumentFolder.id).filter(HrDocumentFolder.id == folder_id,
                                                              HrDocumentFolder.organization_id == org).first():
        raise errors.not_found("Folder")
    expiry = _parse_date(expiry_date, "expiry_date")
    when = _parse_datetime(publish_at, "publish_at")
    stored = storage_service.store_upload(org, data, filename, allowed_extensions=COMPANY_EXTENSIONS)
    now = datetime.utcnow()
    doc = HrDocument(title=(title or stored.file_name).strip()[:255], description=description, category=HrDocumentCategory.COMPANY,
                     status=HrDocumentStatus.PENDING, employee_id=None, uploaded_by=actor.id, organization_id=org,
                     scope="company", company_category_id=cat.id, folder_id=folder_id, source="company",
                     file_name=stored.file_name, file_size=stored.size, mime_type=stored.mime_type, expiry_date=expiry,
                     publish_state="scheduled" if when and when > now else "published", publish_at=when if when and when > now else None,
                     current_version=0, created_at=now, updated_at=now)
    db.add(doc)
    db.flush()
    wanted_ack = cat.default_require_ack if require_ack is None else bool(require_ack)
    inherited = access_resolver.effective_rule(db, org, doc)
    if inherited.require_ack != wanted_ack:
        upsert_rule(db, org, "document", doc.id, {
            "inherit": False, "visibility": inherited.visibility, "permission": inherited.permission, "require_ack": wanted_ack,
            "department_ids": list(inherited.department_ids) or None, "roles": list(inherited.roles) or None,
            "employee_ids": list(inherited.employee_ids) or None}, actor)
    add_version(db, actor, doc, stored, expiry=expiry, notes="Uploaded", ctx=ctx, notify_audience=notify_audience)
    db.commit()
    return serialize_company_file(db, doc)


def add_version(db: Session, actor, doc, stored, *, expiry=None, notes=None, material_change=True, ctx=None,
                notify_audience=True):
    from app.modules.hr.documents import approval_service
    _, _, _, _, HrDocumentVersion = _doc_models()
    number = (db.query(HrDocumentVersion.version).filter(HrDocumentVersion.document_id == doc.id)
              .order_by(HrDocumentVersion.version.desc()).first())
    version = HrDocumentVersion(
        document_id=doc.id, organization_id=doc.organization_id, version=(number[0] if number else 0) + 1,
        file_name=stored.file_name, file_size=stored.size, mime_type=stored.mime_type, uploaded_by=actor.id,
        storage_key=stored.storage_key, is_encrypted=True, sha256=stored.sha256, scan_status=stored.precheck.scan_status,
        precheck=stored.precheck.as_dict(), expiry_date=expiry, change_notes=notes, material_change=bool(material_change),
        created_at=datetime.utcnow())
    version.document = doc
    reason = approval_service.auto_approval_reason(db, doc, version)
    if reason:
        lifecycle.apply_transition(db, version, lifecycle.Event.AUTO_APPROVE, actor, auto_reason=reason, ctx=ctx)
        if doc.publish_state == "published":
            on_published(db, doc, version, actor, material_change=material_change, notify_audience=notify_audience)
    else:
        lifecycle.apply_transition(db, version, lifecycle.Event.UPLOAD, actor, ctx=ctx)
        approval_service.create_steps_for_version(db, doc, version)
    return version


def new_version(db: Session, actor, document_id: int, data: bytes, filename: str, *, change_notes: Optional[str] = None,
                expiry_date=None, material_change: bool = True, ctx=None) -> dict:
    doc = _company_doc(db, actor.organization_id, document_id)
    stored = storage_service.store_upload(actor.organization_id, data, filename, allowed_extensions=COMPANY_EXTENSIONS)
    expiry = _parse_date(expiry_date, "expiry_date")
    if expiry:
        doc.expiry_date = expiry
    add_version(db, actor, doc, stored, expiry=expiry, notes=change_notes, material_change=material_change, ctx=ctx)
    doc.updated_at = datetime.utcnow()
    db.commit()
    return serialize_company_file(db, doc)


def versions(db: Session, actor, document_id: int) -> list[dict]:
    _, _, _, _, HrDocumentVersion = _doc_models()
    doc = _company_doc(db, actor.organization_id, document_id)
    rows = (db.query(HrDocumentVersion).filter(HrDocumentVersion.document_id == doc.id)
            .order_by(HrDocumentVersion.version.desc()).all())
    return [{"id": v.id, "version": v.version, "status": v.status, "file_name": v.file_name, "uploaded_at": _iso(v.created_at),
             "uploaded_by": _person_name(db, v.uploaded_by), "change_notes": v.change_notes,
             "material_change": bool(v.material_change), "is_current": v.id == doc.approved_version_id} for v in rows]


def publish(db: Session, actor, document_id: int, publish_at=None, ctx=None) -> dict:
    _, _, _, _, HrDocumentVersion = _doc_models()
    doc = _company_doc(db, actor.organization_id, document_id)
    when = _parse_datetime(publish_at, "publish_at")
    before = {"publish_state": doc.publish_state}
    if when and when > datetime.utcnow():
        doc.publish_state, doc.publish_at = "scheduled", when
    else:
        was_published = doc.publish_state == "published"
        doc.publish_state, doc.publish_at = "published", None
        if doc.approved_version_id and not was_published:
            on_published(db, doc, db.get(HrDocumentVersion, doc.approved_version_id), actor, material_change=False)
    audit_service.record(db, org_id=doc.organization_id, actor=actor, action="published", target_type="document",
                         target_id=doc.id, document_id=doc.id, ctx=ctx, before=before,
                         after={"publish_state": doc.publish_state, "publish_at": _iso(doc.publish_at)})
    db.commit()
    return serialize_company_file(db, doc)


def unpublish(db: Session, actor, document_id: int, ctx=None) -> dict:
    doc = _company_doc(db, actor.organization_id, document_id)
    before = {"publish_state": doc.publish_state}
    doc.publish_state = "unpublished"
    audit_service.record(db, org_id=doc.organization_id, actor=actor, action="unpublished", target_type="document",
                         target_id=doc.id, document_id=doc.id, ctx=ctx, before=before, after={"publish_state": "unpublished"})
    db.commit()
    return serialize_company_file(db, doc)


def delete_file(db: Session, actor, document_id: int, ctx=None) -> None:
    doc = _company_doc(db, actor.organization_id, document_id)
    doc.is_deleted = True
    task_service.close_tasks(db, doc.organization_id, kinds=["acknowledge"], document_id=doc.id, reason="document_removed",
                             status="cancelled")
    audit_service.record(db, org_id=doc.organization_id, actor=actor, action="deleted", target_type="document",
                         target_id=doc.id, document_id=doc.id, ctx=ctx)
    db.commit()


# ── publishing and acknowledgement rounds ──────────────────────────────────────────────────────────────────────────

def _ack_ladder(cat) -> list[dict]:
    from app.modules.hr.documents.automation.ladder import resolve_ladder
    n = getattr(cat, "ack_reminder_after_days", None)
    if n:
        n = int(n)
        return [{"after_days": 0, "action": "notify", "to": "assignee", "channels": ["in_app"], "mark_overdue": False},
                {"after_days": n, "action": "notify", "to": "assignee", "channels": ["in_app", "email"], "mark_overdue": False},
                {"after_days": n * 2, "action": "notify", "to": "assignee", "channels": ["in_app", "email"], "mark_overdue": True}]
    return resolve_ladder(getattr(cat, "escalation_ladder", None))


def _audience_for(db: Session, doc) -> list:
    from app.modules.hr.models import DocumentAssignment
    rule = access_resolver.effective_rule(db, doc.organization_id, doc)
    assigned = [eid for (eid,) in db.query(DocumentAssignment.employee_id).filter(DocumentAssignment.document_id == doc.id)]
    return access_resolver.audience(db, doc.organization_id, rule, assigned)


def open_ack_round(db: Session, doc, version, reason: str, actor=None, now: Optional[datetime] = None) -> Optional[HrDocumentAckRound]:
    """A new acknowledgement round for the current audience. The previous round's open tasks are cancelled (superseded)."""
    now = now or datetime.utcnow()
    rule = access_resolver.effective_rule(db, doc.organization_id, doc)
    if not rule.require_ack:
        return None
    previous = current_round(db, doc)
    rnd = HrDocumentAckRound(organization_id=doc.organization_id, document_id=doc.id, version_id=version.id,
                             round_no=(previous.round_no if previous else 0) + 1, reason=reason, opened_at=now,
                             due_at=now + timedelta(days=ACK_DUE_DAYS))
    db.add(rnd)
    db.flush()
    task_service.close_tasks(db, doc.organization_id, kinds=["acknowledge"], document_id=doc.id, reason="superseded",
                             status="cancelled", now=now)
    cat = db.get(HrCompanyDocumentCategory, doc.company_category_id) if doc.company_category_id else None
    ladder = _ack_ladder(cat)
    people = _audience_for(db, doc)
    for person in people:
        task, created = task_service.open_task(db, doc.organization_id, "acknowledge", employee_id=person.id, document_id=doc.id,
                                               version_id=version.id, ack_round_id=rnd.id, due_in_days=ACK_DUE_DAYS,
                                               ladder=ladder, source="system", created_by=getattr(actor, "id", None), now=now)
        if created:
            task.escalation_level = 1                     # the notice below is ladder step 0
    notify.send(db, doc.organization_id, people, "document.to_acknowledge", title=doc.title, link=notify.TO_ACTION_LINK,
                channels=["in_app"], document_id=doc.id, now=now)
    return rnd


def add_to_current_round(db: Session, doc, employee_id: int, now: Optional[datetime] = None) -> bool:
    """Someone joined the audience after the round opened (new joiner, role change): give them the acknowledge task."""
    rnd = current_round(db, doc)
    if rnd is None:
        return False
    if db.query(HrDocumentAcknowledgement.id).filter(HrDocumentAcknowledgement.document_id == doc.id,
                                                     HrDocumentAcknowledgement.round_no == rnd.round_no,
                                                     HrDocumentAcknowledgement.employee_id == employee_id).first():
        return False
    cat = db.get(HrCompanyDocumentCategory, doc.company_category_id) if doc.company_category_id else None
    if cat is not None and cat.is_hidden:
        return False
    _, created = task_service.open_task(db, doc.organization_id, "acknowledge", employee_id=employee_id, document_id=doc.id,
                                        version_id=rnd.version_id, ack_round_id=rnd.id, due_in_days=ACK_DUE_DAYS,
                                        ladder=_ack_ladder(cat), source="system", now=now)
    return created


def on_published(db: Session, doc, version, actor=None, *, material_change: bool = True, notify_audience: bool = True) -> None:
    """A version became visible: open an acknowledgement round when one is needed (a minor change keeps the current round);
    otherwise optionally tell the audience a new document is available."""
    if access_resolver.in_hidden_category(db, doc):
        return
    rule = access_resolver.effective_rule(db, doc.organization_id, doc)
    existing = current_round(db, doc)
    if rule.require_ack and (material_change or existing is None):
        open_ack_round(db, doc, version, "initial" if existing is None else "new_version", actor)
    elif notify_audience and rule.visibility != Visibility.ADMIN_ONLY.value:
        notify.send(db, doc.organization_id, _audience_for(db, doc), "document.issued", title=doc.title,
                    link="/employee/documents/company", channels=["in_app"], document_id=doc.id)


def ack_tracking(db: Session, actor, document_id: int, status: Optional[str] = None, page: int = 1, per_page: int = 50) -> dict:
    from app.modules.hr.documents.automation.models import DocumentTask
    doc = _company_doc(db, actor.organization_id, document_id)
    rnd = current_round(db, doc)
    if rnd is None:
        return {"round": None, "due_at": None, "acknowledged": 0, "pending": 0, "total": 0, "items": [], "page": page,
                "per_page": per_page}
    acks = {a.employee_id: a for a in db.query(HrDocumentAcknowledgement)
            .filter(HrDocumentAcknowledgement.document_id == doc.id, HrDocumentAcknowledgement.round_no == rnd.round_no)}
    tasks = (db.query(DocumentTask).filter(DocumentTask.document_id == doc.id, DocumentTask.kind == "acknowledge",
                                           DocumentTask.ack_round_id == rnd.id).all())
    pending_ids = {t.employee_id for t in tasks if t.status in ("open", "overdue")}
    rows = [{"employee_id": pid, "name": _person_name(db, pid), "status": "acknowledged",
             "acknowledged_at": _iso(a.acknowledged_at)} for pid, a in acks.items()]
    rows += [{"employee_id": pid, "name": _person_name(db, pid), "status": "pending", "acknowledged_at": None}
             for pid in pending_ids - set(acks)]
    rows.sort(key=lambda r: (r["status"] != "pending", r["name"] or ""))
    if status in ("acknowledged", "pending"):
        rows = [r for r in rows if r["status"] == status]
    return {"round": rnd.round_no, "due_at": _iso(rnd.due_at), "acknowledged": len(acks), "pending": len(pending_ids - set(acks)),
            "total": len(rows), "items": rows[(page - 1) * per_page: page * per_page], "page": page, "per_page": per_page}


def remind_acks(db: Session, actor, document_id: int, employee_ids: Optional[list[int]] = None, ctx=None) -> dict:
    from app.modules.employee.models import Employee
    from app.modules.hr.documents.automation.models import DocumentTask
    doc = _company_doc(db, actor.organization_id, document_id)
    rnd = current_round(db, doc)
    if rnd is None:
        return {"sent": 0}
    q = (db.query(DocumentTask.employee_id).filter(DocumentTask.document_id == doc.id, DocumentTask.kind == "acknowledge",
                                                   DocumentTask.ack_round_id == rnd.id,
                                                   DocumentTask.status.in_(("open", "overdue"))))
    if employee_ids:
        q = q.filter(DocumentTask.employee_id.in_(employee_ids))
    ids = {eid for (eid,) in q.all()}
    people = db.query(Employee).filter(Employee.id.in_(ids or {0}), Employee.is_active.is_(True)).all()
    n = notify.send(db, doc.organization_id, people, "document.to_acknowledge", title=doc.title, link=notify.TO_ACTION_LINK,
                    channels=["in_app", "email"],
                    email=notify.EmailPart(subject=f"Please acknowledge: {doc.title}", heading="Please read and acknowledge",
                                           message=f"Please read {doc.title} and confirm you have read it.",
                                           action_label="Open Documents to Action"),
                    reminder_kind="acknowledge", document_id=doc.id, sent_by=actor.id)
    audit_service.record(db, org_id=doc.organization_id, actor=actor, action="reminder_sent", target_type="document",
                         target_id=doc.id, document_id=doc.id, ctx=ctx, after={"acknowledge_reminders": n})
    db.commit()
    return {"sent": n}


# ── access rules ───────────────────────────────────────────────────────────────────────────────────────────────────

def _target_category(db: Session, org: int, target_type: str, target_id: int):
    _, _, HrDocumentFolder, _, _ = _doc_models()
    if target_type == "category":
        return _category(db, org, target_id)
    if target_type == "folder":
        f = db.query(HrDocumentFolder).filter(HrDocumentFolder.id == target_id, HrDocumentFolder.organization_id == org).first()
        if f is None:
            raise errors.not_found("Folder")
        return db.get(HrCompanyDocumentCategory, f.company_category_id) if f.company_category_id else None
    if target_type == "document":
        doc = _company_doc(db, org, target_id)
        return db.get(HrCompanyDocumentCategory, doc.company_category_id) if doc.company_category_id else None
    raise errors.invalid("Unknown target.", "target_type")


def validate_rule(db: Session, org: int, data: dict) -> dict:
    from app.modules.employee.models import Employee
    from app.modules.hr.models import Department
    v = data.get("visibility")
    if v not in {x.value for x in Visibility}:
        raise errors.invalid("Choose who can see this.", "visibility")
    out = {"visibility": v, "permission": "download" if data.get("permission") == "download" else "view",
           "require_ack": bool(data.get("require_ack")), "inherit": bool(data.get("inherit", False)),
           "department_ids": None, "roles": None, "employee_ids": None}
    try:
        if v == Visibility.DEPARTMENTS.value:
            ids = sorted({int(i) for i in data.get("department_ids") or []})
            if not ids:
                raise errors.invalid("Choose at least one department.", "department_ids")
            found = {i for (i,) in db.query(Department.id).filter(Department.id.in_(ids), Department.organization_id == org)}
            if set(ids) - found:
                raise errors.not_found("Department")
            out["department_ids"] = ids
        elif v == Visibility.ROLES.value:
            roles = sorted({str(r) for r in data.get("roles") or []})
            if not roles or set(roles) - set(VALID_ROLES):
                raise errors.invalid("Choose at least one valid role.", "roles")
            out["roles"] = roles
        elif v == Visibility.EMPLOYEES.value:
            ids = sorted({int(i) for i in data.get("employee_ids") or []})
            if not ids:
                raise errors.invalid("Choose at least one employee.", "employee_ids")
            found = {i for (i,) in db.query(Employee.id).filter(Employee.id.in_(ids), Employee.organization_id == org)}
            if set(ids) - found:
                raise errors.not_found("Employee")
            out["employee_ids"] = ids
    except (TypeError, ValueError):
        raise errors.invalid("Use whole-number ids.") from None
    return out


def _effective_for(db: Session, org: int, target_type: str, target_id: int):
    if target_type == "document":
        return access_resolver.effective_rule(db, org, _company_doc(db, org, target_id))
    if target_type == "folder":
        cat = _target_category(db, org, "folder", target_id)
        return access_resolver.effective_rule(db, org, folder_id=target_id, category_id=getattr(cat, "id", None))
    return access_resolver.effective_rule(db, org, category_id=target_id)


def get_access(db: Session, actor, target_type: str, target_id: int) -> dict:
    org = actor.organization_id
    _target_category(db, org, target_type, target_id)
    own = (db.query(HrDocumentAccessRule).filter(HrDocumentAccessRule.organization_id == org,
                                                 HrDocumentAccessRule.target_type == target_type,
                                                 HrDocumentAccessRule.target_id == target_id).first())
    effective = _effective_for(db, org, target_type, target_id)
    count = len(access_resolver.audience(db, org, effective))
    return {"rule": ({k: getattr(own, k) for k in ("inherit", "visibility", "permission", "require_ack", "department_ids",
                                                    "roles", "employee_ids")} if own else None),
            "effective": {**access_resolver.summary(effective, count), "department_ids": list(effective.department_ids),
                          "roles": list(effective.roles), "employee_ids": list(effective.employee_ids)}}


def put_access(db: Session, actor, target_type: str, target_id: int, data: dict, ctx=None) -> dict:
    _, _, _, _, HrDocumentVersion = _doc_models()
    org = actor.organization_id
    cat = _target_category(db, org, target_type, target_id)
    if cat is not None and cat.locked_by_org_admin and role_of(actor) != ORG_ADMIN:
        raise errors.forbidden("The Organization Admin has locked who can see this category.")
    clean = validate_rule(db, org, data)
    if target_type == "category":
        clean["inherit"] = False                         # a category is the top of the chain
    before = get_access(db, actor, target_type, target_id)["effective"]
    upsert_rule(db, org, target_type, target_id, clean, actor)
    after = get_access(db, actor, target_type, target_id)["effective"]
    keys = ("visibility", "permission", "require_ack", "audience_count")
    audit_service.record(db, org_id=org, actor=actor, action="access_changed", target_type=target_type, target_id=target_id,
                         document_id=target_id if target_type == "document" else None, ctx=ctx,
                         before={k: before[k] for k in keys}, after={k: after[k] for k in keys})
    if target_type == "document" and after["require_ack"] and not before["require_ack"]:
        doc = _company_doc(db, org, target_id)
        if doc.publish_state == "published" and doc.approved_version_id:
            open_ack_round(db, doc, db.get(HrDocumentVersion, doc.approved_version_id), "initial", actor)
    db.commit()
    return get_access(db, actor, target_type, target_id)


def preview_access(db: Session, actor, data: dict) -> dict:
    clean = validate_rule(db, actor.organization_id, data)
    rule = access_resolver.EffectiveRule(clean["visibility"], clean["permission"], clean["require_ack"], ("preview", 0),
                                         tuple(clean["department_ids"] or ()), tuple(clean["roles"] or ()),
                                         tuple(clean["employee_ids"] or ()))
    people = access_resolver.audience(db, actor.organization_id, rule)
    return {"audience_count": len(people),
            "sample": [{"id": p.id, "name": f"{p.first_name or ''} {p.last_name or ''}".strip()} for p in people[:10]]}


# ── the employee's side ────────────────────────────────────────────────────────────────────────────────────────────

def my_company_documents(db: Session, user, category_id: Optional[int] = None, search: Optional[str] = None) -> dict:
    viewer = access_resolver.viewer_for(user)
    rows = access_resolver.visible_company_documents(db, viewer, category_id)
    if search and search.strip():
        needle = search.strip().lower()
        rows = [(d, r) for d, r in rows if needle in (d.title or "").lower()]
    cats = {c.id: c for c in db.query(HrCompanyDocumentCategory).filter(HrCompanyDocumentCategory.organization_id == user.organization_id)}
    folders = _folder_paths(db, user.organization_id, {d.folder_id for d, _ in rows if getattr(d, "folder_id", None)})
    mine = {(a.document_id, a.round_no): a for a in db.query(HrDocumentAcknowledgement)
            .filter(HrDocumentAcknowledgement.employee_id == user.id)}
    groups: dict = {}
    for doc, rule in rows:
        rnd = current_round(db, doc) if rule.require_ack else None
        ack = mine.get((doc.id, rnd.round_no)) if rnd else None
        cat = cats.get(doc.company_category_id)
        item = {"id": doc.id, "title": doc.title, "description": doc.description,
                "category": {"id": cat.id, "key": cat.key, "name": cat.name} if cat else None,
                "version_id": doc.approved_version_id, "updated_at": _iso(doc.updated_at), "file_name": doc.file_name,
                "expiry_date": _iso(doc.expiry_date),
                "can_download": rule.permission == "download" or is_document_admin(user),
                "folder": folders.get(doc.folder_id) if getattr(doc, "folder_id", None) else None,
                "require_ack": bool(rule.require_ack), "needs_ack": bool(rnd) and ack is None,
                "acknowledged_at": _iso(ack.acknowledged_at) if ack else None}
        key = cat.id if cat else 0
        groups.setdefault(key, {"category": item["category"], "items": []})["items"].append(item)
    ordered = sorted(groups.values(), key=lambda g: (getattr(cats.get((g["category"] or {}).get("id")), "sort_order", 999),
                                                     (g["category"] or {}).get("name") or ""))
    return {"total": sum(len(g["items"]) for g in ordered), "groups": ordered}


def _folder_paths(db: Session, org: int, folder_ids: set) -> dict:
    """{folder_id: {"id", "name", "path"}} for the employee view's folder sections. The path walks up to the category
    ("Joining / Signed"). Folder names are not secret: the employee already sees the files inside."""
    from app.modules.hr.models import HrDocumentFolder
    if not folder_ids:
        return {}
    known: dict = {}
    todo = set(folder_ids)
    for _ in range(20):                                    # folders are shallow; this bounds a broken parent loop
        if not todo:
            break
        rows = db.query(HrDocumentFolder.id, HrDocumentFolder.name, HrDocumentFolder.parent_id).filter(
            HrDocumentFolder.organization_id == org, HrDocumentFolder.id.in_(todo)).all()
        todo = set()
        for fid, name, parent in rows:
            known[fid] = (name, parent)
            if parent and parent not in known:
                todo.add(parent)
    out = {}
    for fid in folder_ids:
        if fid not in known:
            continue
        parts, cur, seen = [], fid, set()
        while cur in known and cur not in seen:
            seen.add(cur)
            parts.append(known[cur][0])
            cur = known[cur][1]
        out[fid] = {"id": fid, "name": known[fid][0], "path": " / ".join(reversed(parts))}
    return out


def acknowledge(db: Session, user, document_id: int, version_id: Optional[int] = None, ctx=None) -> dict:
    from app.modules.hr.documents.automation import events as ev
    _, _, _, _, HrDocumentVersion = _doc_models()
    HrDocument, *_ = _doc_models()
    doc = (db.query(HrDocument).filter(HrDocument.id == document_id, HrDocument.organization_id == user.organization_id,
                                       HrDocument.is_deleted.is_(False)).first())
    if doc is None or not access_resolver.can_view(db, access_resolver.viewer_for(user), doc):
        raise errors.not_found()
    rnd = current_round(db, doc)
    if rnd is None:
        raise errors.invalid("This document doesn't need to be acknowledged.")
    if version_id and version_id != doc.approved_version_id:
        raise errors.stale_version()
    existing = (db.query(HrDocumentAcknowledgement).filter(HrDocumentAcknowledgement.document_id == doc.id,
                                                           HrDocumentAcknowledgement.round_no == rnd.round_no,
                                                           HrDocumentAcknowledgement.employee_id == user.id).first())
    if existing is not None:
        return {"acknowledged_at": _iso(existing.acknowledged_at), "round": rnd.round_no}
    version = db.get(HrDocumentVersion, doc.approved_version_id)
    now = datetime.utcnow()
    db.add(HrDocumentAcknowledgement(organization_id=doc.organization_id, document_id=doc.id, version_id=version.id,
                                     round_no=rnd.round_no, employee_id=user.id, acknowledged_at=now,
                                     ip_address=getattr(ctx, "ip", None), user_agent=getattr(ctx, "user_agent", None),
                                     document_sha256=version.sha256))
    task_service.close_tasks(db, doc.organization_id, kinds=["acknowledge"], employee_id=user.id, document_id=doc.id,
                             reason="acknowledged", now=now)
    audit_service.record(db, org_id=doc.organization_id, actor=user, action="acknowledged", target_type="document",
                         target_id=doc.id, document_id=doc.id, employee_id=user.id, ctx=ctx, after={"round": rnd.round_no})
    ev.emit(db, doc.organization_id, ev.UploadedDocumentAcknowledged(document_id=doc.id, version_id=version.id,
                                                                     kind="uploaded", employee_id=user.id))
    db.commit()
    return {"acknowledged_at": _iso(now), "round": rnd.round_no}
