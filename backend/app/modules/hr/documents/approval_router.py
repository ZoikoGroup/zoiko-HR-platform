"""Approval Workflow endpoints (ZHR-DOCS-ARCH-001 §7.3). Mounted before hr_router so its literal paths win.

The existing POST /hr/documents/{id}/approve and /reject stay (hr/router.py) and delegate to approval_service for
versioned documents; the endpoints here add the version-aware decisions, the review lock and bulk approval.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.hr.documents import approval_service, audit_service as audit, me_service, queue_service
from app.modules.hr.documents.audit_service import RequestCtx, request_ctx
from app.modules.hr.documents.permissions import DocAction, require_doc_permission

router = APIRouter(prefix="/hr/documents", tags=["📄 HR Documents · Approvals"])


class DecisionIn(BaseModel):
    version_id: Optional[int] = None
    remark: Optional[str] = Field(None, max_length=1000)


class RejectIn(BaseModel):
    version_id: Optional[int] = None
    reason_code: str
    note: str = Field(..., max_length=2000)


class BulkItem(BaseModel):
    document_id: int
    version_id: Optional[int] = None


class BulkIn(BaseModel):
    items: list[BulkItem] = Field(..., min_length=1, max_length=100)
    remark: Optional[str] = Field(None, max_length=1000)


def _out(db, document, version) -> dict:
    return me_service.serialize_file(db, document, version)


@router.post("/{document_id}/decision/approve", summary="Approve a version (HR Admin or Org Admin)")
def approve(document_id: int, body: DecisionIn, db: Session = Depends(get_db),
            user=Depends(require_doc_permission(DocAction.APPROVAL_DECIDE)), ctx: RequestCtx = Depends(request_ctx)):
    return _out(db, *approval_service.approve(db, user, document_id, body.version_id, body.remark, ctx))


@router.post("/{document_id}/decision/reject", summary="Reject a version (reason required)")
def reject(document_id: int, body: RejectIn, db: Session = Depends(get_db),
           user=Depends(require_doc_permission(DocAction.APPROVAL_DECIDE)), ctx: RequestCtx = Depends(request_ctx)):
    return _out(db, *approval_service.reject(db, user, document_id, body.version_id, body.reason_code, body.note, ctx))


@router.post("/{document_id}/request-reupload", summary="Ask for a new copy (reason required)")
def request_reupload(document_id: int, body: RejectIn, db: Session = Depends(get_db),
                     user=Depends(require_doc_permission(DocAction.APPROVAL_DECIDE)), ctx: RequestCtx = Depends(request_ctx)):
    return _out(db, *approval_service.request_reupload(db, user, document_id, body.version_id, body.reason_code, body.note, ctx))


@router.post("/approvals/bulk-approve", summary="Approve several versions; each succeeds or fails on its own")
def bulk_approve(body: BulkIn, db: Session = Depends(get_db),
                 user=Depends(require_doc_permission(DocAction.APPROVAL_DECIDE)), ctx: RequestCtx = Depends(request_ctx)):
    items = [approval_service.DecisionRef(i.document_id, i.version_id) for i in body.items]
    return {"results": approval_service.bulk_approve(db, user, items, body.remark, ctx)}


@router.post("/{document_id}/review-lock", summary="Hold a document while you review it (10 minutes, renewable)")
def lock(document_id: int, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.APPROVAL_QUEUE))):
    until = approval_service.acquire_lock(db, user, document_id)
    return {"locked_until": until.isoformat() + "Z"}


@router.delete("/{document_id}/review-lock", status_code=204, summary="Release your review lock")
def unlock(document_id: int, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.APPROVAL_QUEUE))):
    approval_service.release_lock(db, user, document_id)


# ── queue, summary and audit trail ─────────────────────────────────────────────────────────────────────────────────

@router.get("/approvals/summary", summary="Counts for the Approval Workflow cards and tab badges")
def approvals_summary(db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.APPROVAL_QUEUE))):
    return queue_service.summary(db, user)


@router.get("/approvals", summary="The approval queue (tab=pending) or the decision history (tab=all), paged")
def approvals_list(
    tab: str = Query("pending", pattern="^(pending|all)$"),
    status: Optional[str] = Query(None), category_key: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None), source: Optional[str] = Query(None, pattern="^(employee|company)$"),
    precheck: Optional[str] = Query(None, pattern="^(pass|warn)$"),
    date_from: Optional[date] = Query(None), date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None, max_length=120),
    page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.APPROVAL_QUEUE)),
):
    f = queue_service.ApprovalFilter(tab=tab, status=status, category_key=category_key, department_id=department_id,
                                     source=source, precheck=precheck, date_from=date_from, date_to=date_to, search=search)
    return queue_service.list_items(db, user, f, page, per_page)


def _audit_filter(action, actor_id, actor_type, employee_id, document_id, date_from, date_to):
    return queue_service.AuditFilter(actions=[a for a in (action or []) if a], actor_id=actor_id, actor_type=actor_type,
                                     employee_id=employee_id, document_id=document_id, date_from=date_from, date_to=date_to)


@router.get("/audit", summary="The documents audit trail (views, downloads, uploads, decisions, access changes)")
def audit_list(
    action: Optional[list[str]] = Query(None), actor_id: Optional[int] = Query(None),
    actor_type: Optional[str] = Query(None, pattern="^(user|system|automation)$"),
    employee_id: Optional[int] = Query(None), document_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None), date_to: Optional[date] = Query(None),
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.AUDIT_VIEW)),
):
    f = _audit_filter(action, actor_id, actor_type, employee_id, document_id, date_from, date_to)
    return queue_service.audit_page(db, user, f, page, per_page)


@router.get("/audit.csv", summary="The documents audit trail as CSV (filters as /audit)")
def audit_export(
    action: Optional[list[str]] = Query(None), actor_id: Optional[int] = Query(None),
    actor_type: Optional[str] = Query(None, pattern="^(user|system|automation)$"),
    employee_id: Optional[int] = Query(None), document_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None), date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.AUDIT_VIEW)),
    ctx: RequestCtx = Depends(request_ctx),
):
    f = _audit_filter(action, actor_id, actor_type, employee_id, document_id, date_from, date_to)
    audit.record(db, org_id=user.organization_id, actor=user, action="exported", target_type="audit", target_id=0, ctx=ctx,
                 after={"actions": f.actions, "employee_id": employee_id, "document_id": document_id})
    db.commit()
    return StreamingResponse(queue_service.audit_csv(db, user, f), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="documents-audit.csv"',
                                      "Cache-Control": "private, no-store"})
