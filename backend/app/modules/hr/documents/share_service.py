"""Email sharing of company documents (Company Documents P4).

An admin (Admin / HR Admin: the COMPANY_MANAGE permission) sends a file, a folder or a whole category by email.

* mode "link" (default): the email lists the files and links to the employee portal. Employees only; every file must be
  published (and not in a hidden category), and every recipient must be able to open it there. When some cannot, the
  send is refused unless grant_portal_access is ticked, which assigns the files to those people (the access resolver
  already lets assigned people see a published file). Nothing widens anyone's access silently.
* mode "attachment": the files travel with the email. Only files whose "Who can see" allows download, at most 10 MB in
  total. This is the only way to reach people outside the company (they have no portal account).

The files are fixed when the share is made (document_ids), so a retry sends exactly the same set. Each recipient gets
their own email and their own delivery status (pending / sent / failed / skipped). Sending happens on the e-mail worker
in production and inline in tests. SMTP settings are read on the server only; nothing about them is returned except
whether email sending is set up at all.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents import access_resolver, audit_service, errors, storage_service
from app.modules.hr.documents.models import HrCompanyDocumentCategory, HrDocumentShare, HrDocumentShareRecipient

logger = logging.getLogger("zoiko.documents.share")

MODES = ("link", "attachment")
TARGETS = ("document", "folder", "category")
MAX_FILES = 50
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_RECIPIENTS = 200
MAX_EXTERNAL = 20
MESSAGE_MAX = 1000
PORTAL_PATH = "/employee/documents/company"
_EMAIL_RE = re.compile(r"^[^@\s<>,;\"']+@[^@\s<>,;\"']+\.[A-Za-z]{2,}$")


# ── settings ───────────────────────────────────────────────────────────────────────────────────────────────────────

def email_configured(db: Session) -> bool:
    """Whether the platform can send mail at all (a host and a sender address). Never exposes the settings."""
    from app.services import email_service
    smtp = email_service._get_smtp_settings(db=db)
    return bool(smtp.get("host")) and bool(smtp.get("from_email"))


def email_status(db: Session) -> dict:
    ok = email_configured(db)
    return {"configured": ok, "max_attachment_mb": MAX_ATTACHMENT_BYTES // (1024 * 1024), "max_recipients": MAX_RECIPIENTS,
            "max_external": MAX_EXTERNAL,
            "message": None if ok else "Email sending isn't set up yet. Ask your platform administrator to configure it."}


# ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _models():
    from app.modules.hr.models import DocumentAssignment, HrDocument, HrDocumentFolder, HrDocumentVersion
    return HrDocument, HrDocumentFolder, HrDocumentVersion, DocumentAssignment


def _employee_model():
    from app.modules.employee.models import Employee
    return Employee


def _name(person) -> str:
    return f"{person.first_name or ''} {person.last_name or ''}".strip() or (person.email or "Employee")


def _folder_tree(db: Session, org: int, root_id: int) -> list[int]:
    _, HrDocumentFolder, _, _ = _models()
    out, frontier = [root_id], [root_id]
    while frontier and len(out) < 500:
        frontier = [fid for (fid,) in db.query(HrDocumentFolder.id).filter(HrDocumentFolder.organization_id == org,
                                                                         HrDocumentFolder.parent_id.in_(frontier))]
        out += frontier
    return out


def _resolve_target(db: Session, org: int, target_type: str, target_id: int):
    """(name, [documents]) for what is being shared: one file, a folder with its sub-folders, or a whole category."""
    HrDocument, HrDocumentFolder, _, _ = _models()
    base = db.query(HrDocument).filter(HrDocument.organization_id == org, HrDocument.scope == "company",
                                       HrDocument.is_deleted.is_(False), HrDocument.approved_version_id.isnot(None))
    if target_type == "document":
        doc = base.filter(HrDocument.id == target_id).first()
        if doc is None:
            raise errors.not_found()
        return doc.title, [doc]
    if target_type == "folder":
        folder = db.query(HrDocumentFolder).filter(HrDocumentFolder.id == target_id, HrDocumentFolder.organization_id == org,
                                                   HrDocumentFolder.company_category_id.isnot(None)).first()
        if folder is None:
            raise errors.not_found("Folder")
        docs = base.filter(HrDocument.folder_id.in_(_folder_tree(db, org, folder.id))).order_by(HrDocument.title).all()
        return folder.name, docs
    cat = db.query(HrCompanyDocumentCategory).filter(HrCompanyDocumentCategory.id == target_id,
                                                     HrCompanyDocumentCategory.organization_id == org,
                                                     HrCompanyDocumentCategory.is_active.is_(True)).first()
    if cat is None:
        raise errors.not_found("Category")
    return cat.name, base.filter(HrDocument.company_category_id == cat.id).order_by(HrDocument.title).all()


def _current_version(db: Session, doc):
    _, _, HrDocumentVersion, _ = _models()
    return db.get(HrDocumentVersion, doc.approved_version_id) if doc.approved_version_id else None


def _attachment_name(doc, version) -> str:
    name = (getattr(version, "file_name", None) or doc.file_name or doc.title or f"document-{doc.id}").strip()
    return re.sub(r"[\r\n\"]+", " ", name)[:200]


def _list_ids(values, field: str, limit: int) -> list[int]:
    try:
        ids = sorted({int(v) for v in (values or [])})
    except (TypeError, ValueError):
        raise errors.invalid("Use whole-number ids.", field)
    if len(ids) > limit:
        raise errors.invalid(f"Choose at most {limit}.", field)
    return ids


# ── create ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def create_email_share(db: Session, actor, *, target_type: str, target_id: int, mode: str = "link",
                       employee_ids: Iterable[int] = (), department_ids: Iterable[int] = (), emails: Iterable[str] = (),
                       message: Optional[str] = None, grant_portal_access: bool = False, ctx=None) -> dict:
    org = actor.organization_id
    if target_type not in TARGETS:
        raise errors.invalid("Share a file, a folder or a category.", "target_type")
    if mode not in MODES:
        raise errors.invalid("Send a portal link or attachments.", "mode")
    message = (message or "").strip() or None
    if message and len(message) > MESSAGE_MAX:
        raise errors.invalid(f"Keep the message under {MESSAGE_MAX} characters.", "message")
    if not email_configured(db):
        raise errors.DocError(503, "DOC_EMAIL_NOT_CONFIGURED", email_status(db)["message"])

    name, docs = _resolve_target(db, org, target_type, target_id)
    if not docs:
        raise errors.invalid(f"“{name}” has no files to send yet.", "target")
    if len(docs) > MAX_FILES:
        raise errors.invalid(f"“{name}” has {len(docs)} files. Email at most {MAX_FILES} at a time: share a folder instead.", "target")

    # ── recipients ──
    Employee = _employee_model()
    chosen = set(_list_ids(employee_ids, "employee_ids", MAX_RECIPIENTS))
    ids = set(chosen)
    dept_ids = _list_ids(department_ids, "department_ids", 100)
    if dept_ids:
        ids |= {pid for (pid,) in db.query(Employee.id).filter(Employee.organization_id == org, Employee.is_active.is_(True),
                                                                Employee.department_id.in_(dept_ids))}
    people = (db.query(Employee).filter(Employee.organization_id == org, Employee.id.in_(ids or {0}), Employee.is_active.is_(True))
              .order_by(Employee.first_name, Employee.last_name).all())
    if chosen - {p.id for p in people}:
        raise errors.invalid("Some of the chosen people are not active employees of this organization.", "employee_ids")
    own_emails = {(p.email or "").strip().lower() for p in people}
    external: list[str] = []
    for raw in emails or []:
        addr = (raw or "").strip().lower()
        if not addr:
            continue
        if not _EMAIL_RE.match(addr) or len(addr) > 254:
            raise errors.invalid(f"“{raw}” is not a valid email address.", "emails")
        if addr not in own_emails and addr not in external:
            external.append(addr)
    if len(external) > MAX_EXTERNAL:
        raise errors.invalid(f"Add at most {MAX_EXTERNAL} outside addresses at a time.", "emails")
    if external and mode != "attachment":
        raise errors.invalid("People outside the company have no portal account, so they can only receive attachments.", "mode")
    if not people and not external:
        raise errors.invalid("Choose at least one person or email address.", "recipients")
    if len(people) + len(external) > MAX_RECIPIENTS:
        raise errors.invalid(f"Send to at most {MAX_RECIPIENTS} people at a time.", "recipients")

    # ── files ──
    total = 0
    rules = {d.id: access_resolver.effective_rule(db, org, d) for d in docs}
    if mode == "attachment":
        view_only = [d.title for d in docs if rules[d.id].permission != "download"]
        if view_only:
            raise errors.DocError(422, "DOC_SHARE_VIEW_ONLY",
                                  f"{_names(view_only)} {'is' if len(view_only) == 1 else 'are'} view-only, so "
                                  f"{'it' if len(view_only) == 1 else 'they'} can't be attached. Send a portal link instead, "
                                  f"or allow downloading in Who can see.", {"files": view_only[:10]})
        for d in docs:
            v = _current_version(db, d)
            total += int(getattr(v, "file_size", None) or d.file_size or 0)
        if total > MAX_ATTACHMENT_BYTES:
            raise errors.DocError(422, "DOC_SHARE_TOO_LARGE",
                                  f"Together the files are {total / (1024 * 1024):.1f} MB; one email can carry at most "
                                  f"{MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB. Send a portal link instead.", {"bytes": total})
    else:
        not_visible = [d.title for d in docs if not access_resolver._published(d) or access_resolver.in_hidden_category(db, d)]
        if not_visible:
            raise errors.DocError(422, "DOC_SHARE_NOT_PUBLISHED",
                                  f"{_names(not_visible)} {'is' if len(not_visible) == 1 else 'are'} not visible to employees "
                                  f"yet (unpublished, or in a hidden category). Publish first, or send attachments.",
                                  {"files": not_visible[:10]})
        viewer = lambda p: access_resolver.viewer_for(p)  # noqa: E731
        blocked = [p for p in people if not all(access_resolver.can_view(db, viewer(p), d, rules[d.id]) for d in docs)]
        if blocked and not grant_portal_access:
            raise errors.DocError(422, "DOC_SHARE_NO_ACCESS",
                                  f"{_names([_name(p) for p in blocked])} can't open {'this file' if len(docs) == 1 else 'all of these files'} "
                                  f"in the portal. Tick “Also give them access”, or change Who can see.",
                                  {"employees": len(blocked), "names": [_name(p) for p in blocked[:5]]})
        if grant_portal_access:
            _grant_access(db, actor, docs, blocked)

    share = HrDocumentShare(organization_id=org, target_type=target_type, target_id=target_id, target_name=name[:255], mode=mode,
                            message=message, grant_portal_access=bool(grant_portal_access and mode == "link"),
                            document_ids=[d.id for d in docs], total_bytes=total, status="sending", created_by=actor.id)
    db.add(share)
    db.flush()
    for p in people:
        email = (p.email or "").strip().lower() or None
        db.add(HrDocumentShareRecipient(share_id=share.id, organization_id=org, kind="employee", employee_id=p.id, email=email,
                                        status="pending" if email else "skipped",
                                        error=None if email else "No email address on file."))
    for addr in external:
        db.add(HrDocumentShareRecipient(share_id=share.id, organization_id=org, kind="external", email=addr, status="pending"))
    for d in docs:
        audit_service.record(db, org_id=org, actor=actor, action="shared_by_email", target_type="document", target_id=d.id,
                             document_id=d.id, ctx=ctx,
                             after={"share_id": share.id, "mode": share.mode, "employees": len(people), "external": len(external),
                                    "portal_access_granted": share.grant_portal_access})
    db.commit()
    dispatch(db, share.id, org, actor.id)
    db.refresh(share)
    return serialize(db, share)


def _names(items: list[str]) -> str:
    quoted = [f"“{t}”" for t in items[:3]]
    more = len(items) - len(quoted)
    text = ", ".join(quoted[:-1]) + (" and " if len(quoted) > 1 else "") + quoted[-1] if quoted else ""
    return f"{text} and {more} more" if more > 0 else text


def _grant_access(db: Session, actor, docs, people) -> None:
    """Q4: an email share opens portal access only when asked, by assigning each file to each person who lacks it."""
    if not people:
        return
    _, _, _, DocumentAssignment = _models()
    existing = {(a, b) for a, b in db.query(DocumentAssignment.document_id, DocumentAssignment.employee_id)
                .filter(DocumentAssignment.document_id.in_([d.id for d in docs]),
                        DocumentAssignment.employee_id.in_([p.id for p in people]))}
    for d in docs:
        for p in people:
            if (d.id, p.id) not in existing:
                db.add(DocumentAssignment(document_id=d.id, employee_id=p.id, assigned_by=actor.id, notes="Shared by email"))
        audit_service.record(db, org_id=actor.organization_id, actor=actor, action="access_granted_by_share", target_type="document",
                             target_id=d.id, document_id=d.id, after={"employees": len(people)})


# ── delivery ───────────────────────────────────────────────────────────────────────────────────────────────────────

def dispatch(db: Session, share_id: int, org: int, actor_id: int) -> None:
    """Send now in tests / without a worker; otherwise on the e-mail worker with its own session (the request returns at once)."""
    from app.services import email_service
    if not email_service._async_enabled():
        deliver(db, share_id)
        return
    email_service._enqueue_email(lambda: _deliver_in_own_session(share_id, org, actor_id))


def _deliver_in_own_session(share_id: int, org: int, actor_id: int) -> None:
    from app.core.privacy import context as privacy_ctx
    from app.core.privacy.jobs import JobNotAuthorized, recheck
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        with privacy_ctx.tenant_context(org, actor_id):
            try:
                recheck(db, org, actor_id)
            except JobNotAuthorized:
                _mark_all_failed(db, share_id, "Not sent: the sender's account is no longer active.")
                return
            deliver(db, share_id)
    except Exception:
        db.rollback()
        logger.exception("email share %s failed", share_id)
    finally:
        db.close()


def _mark_all_failed(db: Session, share_id: int, reason: str) -> None:
    for r in db.query(HrDocumentShareRecipient).filter(HrDocumentShareRecipient.share_id == share_id,
                                                       HrDocumentShareRecipient.status == "pending"):
        r.status, r.error = "failed", reason
    share = db.get(HrDocumentShare, share_id)
    if share is not None:
        share.status = _overall(db, share_id)
    db.commit()


def deliver(db: Session, share_id: int) -> None:
    from app.services import email_service
    share = db.get(HrDocumentShare, share_id)
    if share is None:
        return
    pending = (db.query(HrDocumentShareRecipient).filter(HrDocumentShareRecipient.share_id == share.id,
                                                         HrDocumentShareRecipient.status == "pending")
               .order_by(HrDocumentShareRecipient.id).all())
    if not pending:
        share.status = _overall(db, share.id)
        db.commit()
        return
    HrDocument, _, _, _ = _models()
    docs = (db.query(HrDocument).filter(HrDocument.id.in_(share.document_ids or [0]), HrDocument.organization_id == share.organization_id,
                                        HrDocument.is_deleted.is_(False)).order_by(HrDocument.title).all())
    attachments = None
    problem = None if docs else "The files were removed before they could be sent."
    if not problem and share.mode == "attachment":
        attachments = []
        for d in docs:
            version = _current_version(db, d)
            data = storage_service.open_for_read(version) if version is not None else None
            if data is None:
                problem = f"“{d.title}” could not be read from storage."
                break
            attachments.append((_attachment_name(d, version), data))
    sender = db.get(_employee_model(), share.created_by) if share.created_by else None
    sender_name = _name(sender) if sender else "Your HR team"
    base_url = email_service._frontend_url().rstrip("/")
    files = [{"title": d.title} for d in docs]
    for r in pending:
        r.attempts = (r.attempts or 0) + 1
        r.last_attempt_at = datetime.utcnow()
        if problem:
            r.status, r.error = "failed", problem[:500]
            continue
        person = db.get(_employee_model(), r.employee_id) if r.employee_id else None
        errs: list[str] = []
        try:
            ok = email_service.send_document_share_email(
                r.email, person.first_name if person else None, sender_name, share.target_name, files, share.mode,
                message=share.message, action_url=f"{base_url}{PORTAL_PATH}", attachments=attachments, error_out=errs,
                db=db, organization_id=share.organization_id)
        except Exception as e:                      # a broken send must not stop the rest
            ok, errs = False, [str(e)]
        if ok:
            r.status, r.error, r.sent_at = "sent", None, datetime.utcnow()
        else:
            r.status, r.error = "failed", ((errs[0] if errs else "The email could not be sent.") or "")[:500]
    db.flush()
    share.status = _overall(db, share.id)
    db.commit()


def _overall(db: Session, share_id: int) -> str:
    states = [s for (s,) in db.query(HrDocumentShareRecipient.status).filter(HrDocumentShareRecipient.share_id == share_id)]
    if any(s == "pending" for s in states):
        return "sending"
    sent = sum(1 for s in states if s == "sent")
    failed = sum(1 for s in states if s in ("failed", "skipped"))
    if sent and not failed:
        return "sent"
    return "partial" if sent else "failed"


def retry(db: Session, actor, share_id: int, ctx=None) -> dict:
    share = _share(db, actor.organization_id, share_id)
    failed = (db.query(HrDocumentShareRecipient).filter(HrDocumentShareRecipient.share_id == share.id,
                                                        HrDocumentShareRecipient.status == "failed").all())
    if not failed:
        raise errors.DocError(409, "DOC_SHARE_NOTHING_TO_RETRY", "Nothing failed, so there is nothing to retry.")
    if not email_configured(db):
        raise errors.DocError(503, "DOC_EMAIL_NOT_CONFIGURED", email_status(db)["message"])
    for r in failed:
        r.status, r.error = "pending", None
    share.status = "sending"
    audit_service.record(db, org_id=share.organization_id, actor=actor, action="share_retried", target_type="share",
                         target_id=share.id, ctx=ctx, after={"recipients": len(failed)})
    db.commit()
    dispatch(db, share.id, share.organization_id, actor.id)
    db.refresh(share)
    return serialize(db, share)


# ── read ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def _share(db: Session, org: int, share_id: int) -> HrDocumentShare:
    share = db.query(HrDocumentShare).filter(HrDocumentShare.id == share_id, HrDocumentShare.organization_id == org).first()
    if share is None:
        raise errors.not_found("Share")
    return share


def serialize(db: Session, share: HrDocumentShare) -> dict:
    Employee = _employee_model()
    rows = (db.query(HrDocumentShareRecipient).filter(HrDocumentShareRecipient.share_id == share.id)
            .order_by(HrDocumentShareRecipient.id).all())
    names = {p.id: _name(p) for p in db.query(Employee).filter(Employee.id.in_([r.employee_id for r in rows if r.employee_id] or [0]))}
    HrDocument, _, _, _ = _models()
    titles = {d.id: d.title for d in db.query(HrDocument.id, HrDocument.title).filter(HrDocument.id.in_(share.document_ids or [0]))}
    creator = db.get(Employee, share.created_by) if share.created_by else None
    counts = {k: sum(1 for r in rows if r.status == k) for k in ("sent", "failed", "pending", "skipped")}
    return {
        "id": share.id, "target_type": share.target_type, "target_id": share.target_id, "target_name": share.target_name,
        "mode": share.mode, "message": share.message, "grant_portal_access": bool(share.grant_portal_access),
        "status": share.status, "created_at": share.created_at.isoformat() if share.created_at else None,
        "created_by": {"id": creator.id, "name": _name(creator)} if creator else None,
        "files": [{"id": i, "title": titles.get(i)} for i in (share.document_ids or []) if i in titles],
        "counts": counts,
        "recipients": [{"id": r.id, "kind": r.kind, "employee_id": r.employee_id,
                        "name": names.get(r.employee_id) if r.employee_id else r.email, "email": r.email, "status": r.status,
                        "error": r.error, "attempts": r.attempts,
                        "sent_at": r.sent_at.isoformat() if r.sent_at else None} for r in rows],
    }


def list_shares(db: Session, actor, target_type: Optional[str] = None, target_id: Optional[int] = None,
                page: int = 1, per_page: int = 20) -> dict:
    q = db.query(HrDocumentShare).filter(HrDocumentShare.organization_id == actor.organization_id)
    if target_type:
        q = q.filter(HrDocumentShare.target_type == target_type)
    if target_id:
        q = q.filter(HrDocumentShare.target_id == target_id)
    total = q.count()
    rows = q.order_by(HrDocumentShare.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {"items": [serialize(db, s) for s in rows], "total": total, "page": page, "per_page": per_page}
