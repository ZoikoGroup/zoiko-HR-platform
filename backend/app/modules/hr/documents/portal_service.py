"""Employee portal glue (ZHR-DOCS-ARCH-001 §7.4, §17 D1): open document tasks as "Documents to Action" items, and the tab
badge counts. Generated-document actions stay in doc_templates/golive.my_actions, which merges these in.

Items carry ids, category names and document titles the person can already see; never another person's data.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.hr.documents.automation.models import DocumentTask, OPEN_TASK_STATUSES, TaskKind
from app.modules.hr.documents.models import HrEmployeeDocumentCategory

K = TaskKind
# The action word the UI shows, and the filter chip the item belongs to (All / Sign / Acknowledge / Upload).
TASK_ACTION = {K.UPLOAD_REQUIRED.value: "upload", K.REUPLOAD.value: "upload", K.RENEW.value: "upload",
               K.ACKNOWLEDGE.value: "acknowledge", K.SIGN.value: "sign", K.REVIEW.value: "review"}
TASK_TITLE = {K.UPLOAD_REQUIRED.value: "Upload your {what}", K.REUPLOAD.value: "Upload a new copy of your {what}",
              K.RENEW.value: "Renew your {what}", K.ACKNOWLEDGE.value: "Read and confirm {what}",
              K.SIGN.value: "Sign {what}", K.REVIEW.value: "Review {what}"}
CHIPS = ("sign", "acknowledge", "upload")


def task_actions(db: Session, user) -> list[dict]:
    """The person's open document tasks, as action-centre items."""
    from app.modules.hr.models import HrDocument
    tasks = (db.query(DocumentTask)
             .filter(DocumentTask.organization_id == user.organization_id, DocumentTask.employee_id == user.id,
                     DocumentTask.status.in_(OPEN_TASK_STATUSES))
             .order_by(DocumentTask.due_at.is_(None), DocumentTask.due_at, DocumentTask.id).limit(200).all())
    if not tasks:
        return []
    cat_ids = {t.employee_category_id for t in tasks if t.employee_category_id}
    doc_ids = {t.document_id for t in tasks if t.document_id}
    cats = ({c.id: c for c in db.query(HrEmployeeDocumentCategory).filter(HrEmployeeDocumentCategory.id.in_(cat_ids))}
            if cat_ids else {})
    docs = ({d.id: d for d in db.query(HrDocument).filter(HrDocument.id.in_(doc_ids), HrDocument.is_deleted.is_(False))}
            if doc_ids else {})
    now = datetime.utcnow()
    out = []
    for t in tasks:
        doc = docs.get(t.document_id)
        if t.document_id and doc is None:
            continue                                     # the document was removed: nothing left to do
        cat = cats.get(t.employee_category_id)
        what = (cat.name if cat else None) or (doc.title if doc else None) or "document"
        action = TASK_ACTION.get(t.kind, "review")
        if action == "acknowledge":
            link = f"/employee/documents/company?document={t.document_id}"
        elif action == "upload":
            link = f"/employee/documents/my-files?category={t.employee_category_id}" if t.employee_category_id else "/employee/documents/my-files"
        else:
            link = "/employee/documents/to-action"
        out.append({"kind": f"task.{t.kind}", "id": t.id, "task_id": t.id, "document_id": t.document_id,
                    "category_id": t.employee_category_id, "title": TASK_TITLE.get(t.kind, "{what}").format(what=what),
                    "action": action, "due_by": t.due_at, "overdue": t.status == "overdue" or bool(t.due_at and t.due_at < now),
                    "link": link})
    return out


def chip_of(item: dict) -> str:
    """Which filter chip an action-centre item falls under."""
    action = item.get("action")
    if action in ("sign", "acknowledge", "upload"):
        return action
    return "other"


def filter_kind(items: list[dict], kind: Optional[str]) -> list[dict]:
    if not kind or kind == "all":
        return items
    return [i for i in items if chip_of(i) == kind]


def counts(db: Session, user) -> dict:
    """Badges for the employee Documents tabs. `signatory_queue` is null for people who are not authorised signatories,
    so the UI can hide that tab."""
    from app.modules.doc_templates import golive
    from app.modules.hr.documents import company_docs
    from app.modules.hr.documents.me_service import containers_for
    to_action = golive.my_actions(db, user)["count"]
    try:
        company = company_docs.my_company_documents(db, user)
        acks = [i for g in company["groups"] for i in g["items"] if i.get("needs_ack")]
    except Exception:                                    # a broken rule must not take every badge down
        acks = []
    needs_ack = len(acks)
    policy_acks = sum(1 for i in acks if (i.get("category") or {}).get("key") == "company_policies")
    try:
        from app.modules.hr.policy_documents import my_policies
        policies_pending = sum(1 for p in my_policies(db, user) if p.get("action_required"))
    except Exception:
        policies_pending = 0
    attention = {"rejected", "reupload_requested", "expired"}
    my_files = sum(1 for c in containers_for(db, user.organization_id, user.id)
                   if c["status"] in attention or (c["is_required"] and c["can_upload"] and c["status"] == "not_uploaded"))
    return {"to_action": to_action, "policies_pending": policies_pending + policy_acks, "company_needs_ack": needs_ack,
            "my_files_attention": my_files, "signatory_queue": signatory_count(db, user)}


def signatory_count(db: Session, user) -> Optional[int]:
    from app.modules.doc_templates.router import signatory_items
    items = signatory_items(db, user)
    return None if items is None else len(items)
