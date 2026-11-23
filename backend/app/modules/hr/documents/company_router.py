"""Company documents endpoints (ZHR-DOCS-ARCH-001 §7.2) and the employee's view of them (§7.4). Mounted before hr_router."""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.hr.documents import company_docs as svc
from app.modules.hr.documents.audit_service import RequestCtx, request_ctx
from app.modules.hr.documents.permissions import DocAction, require_doc_permission
from app.modules.hr.documents.precheck import MAX_BYTES

router = APIRouter(prefix="/hr/documents", tags=["📄 HR Documents · Company documents"])
me_router = APIRouter(prefix="/hr/me/company-documents", tags=["📄 HR Documents · Me"])

TARGET = "^(category|folder|document)$"


class CategoryIn(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    icon: Optional[str] = Field(None, max_length=40)
    requires_approval: Optional[bool] = None
    default_require_ack: Optional[bool] = None
    ack_reminder_after_days: Optional[int] = None
    reack_interval_months: Optional[int] = None
    auto_unpublish_on_expiry: Optional[bool] = None
    locked_by_org_admin: Optional[bool] = None
    sort_order: Optional[int] = None


class AccessIn(BaseModel):
    visibility: str
    permission: str = Field("view", pattern="^(view|download)$")
    require_ack: bool = False
    inherit: bool = False
    department_ids: Optional[list[int]] = None
    roles: Optional[list[str]] = None
    employee_ids: Optional[list[int]] = None


class BulkAccessIn(AccessIn):
    document_ids: list[int] = Field(..., min_length=1, max_length=200)


class PublishIn(BaseModel):
    publish_at: Optional[str] = None


class RemindIn(BaseModel):
    employee_ids: Optional[list[int]] = None


class AckIn(BaseModel):
    version_id: Optional[int] = None


def _bool(v: Optional[str]) -> Optional[bool]:
    if v in (None, ""):
        return None
    return str(v).lower() in ("1", "true", "yes", "on")


# ── categories ─────────────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/company-categories", summary="Company document categories with file counts and who can see them")
def categories(access: Optional[str] = Query(None, pattern="^(admin_only|all|restricted)$"), search: Optional[str] = Query(None, max_length=120),
               db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE))):
    return svc.category_cards(db, user, access, search)


@router.post("/company-categories", status_code=201, summary="Add a company document category")
def create_category(body: CategoryIn, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)),
                    ctx: RequestCtx = Depends(request_ctx)):
    return svc.create_category(db, user, body.model_dump(exclude_unset=True), ctx)


@router.patch("/company-categories/{category_id}", summary="Change a company category's settings")
def update_category(category_id: int, body: CategoryIn, db: Session = Depends(get_db),
                    user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.update_category(db, user, category_id, body.model_dump(exclude_unset=True), ctx)


@router.delete("/company-categories/{category_id}", status_code=204, summary="Remove an empty custom category")
def delete_category(category_id: int, db: Session = Depends(get_db),
                    user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)), ctx: RequestCtx = Depends(request_ctx)):
    svc.delete_category(db, user, category_id, ctx)


@router.get("/company-categories/{category_id}/items", summary="Folders and files inside a company category")
def items(category_id: int, folder_id: Optional[int] = Query(None),
          expiry: Optional[str] = Query(None, pattern="^(all|expiring_soon|expired)$"), search: Optional[str] = Query(None, max_length=120),
          page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
          db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE))):
    return svc.list_items(db, user, category_id, folder_id, expiry, search, page, per_page)


@router.get("/company/files", summary="Company files across categories (expiring soon / expired views)")
def flat(expiry: Optional[str] = Query(None, pattern="^(all|expiring_soon|expired)$"), search: Optional[str] = Query(None, max_length=120),
         page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
         db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE))):
    return svc.flat_files(db, user, expiry, search, page, per_page)


# ── files ──────────────────────────────────────────────────────────────────────────────────────────────────────────

@router.post("/company-categories/{category_id}/files", status_code=201, summary="Upload a company document")
def upload(category_id: int, file: UploadFile = File(...), title: Optional[str] = Form(None, max_length=255),
           description: Optional[str] = Form(None, max_length=2000), folder_id: Optional[int] = Form(None),
           expiry_date: Optional[str] = Form(None), require_ack: Optional[str] = Form(None), publish_at: Optional[str] = Form(None),
           notify: Optional[str] = Form(None), db: Session = Depends(get_db),
           user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)), ctx: RequestCtx = Depends(request_ctx)):
    data = file.file.read(MAX_BYTES + 1)
    return svc.upload(db, user, category_id, data, file.filename or "", title=title, description=description, folder_id=folder_id,
                      expiry_date=expiry_date, require_ack=_bool(require_ack), publish_at=publish_at,
                      notify_audience=_bool(notify) is not False, ctx=ctx)


@router.post("/company/{document_id}/versions", status_code=201, summary="Upload a new version of a company document")
def new_version(document_id: int, file: UploadFile = File(...), change_notes: Optional[str] = Form(None, max_length=2000),
                expiry_date: Optional[str] = Form(None), material_change: Optional[str] = Form(None),
                db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)),
                ctx: RequestCtx = Depends(request_ctx)):
    data = file.file.read(MAX_BYTES + 1)
    return svc.new_version(db, user, document_id, data, file.filename or "", change_notes=change_notes, expiry_date=expiry_date,
                           material_change=_bool(material_change) is not False, ctx=ctx)


@router.get("/company/{document_id}/versions", summary="A company document's versions")
def versions(document_id: int, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE))):
    return svc.versions(db, user, document_id)


@router.post("/company/{document_id}/publish", summary="Publish now, or schedule (publish_at)")
def publish(document_id: int, body: PublishIn, db: Session = Depends(get_db),
            user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.publish(db, user, document_id, body.publish_at, ctx)


@router.post("/company/{document_id}/unpublish", summary="Hide a company document from employees")
def unpublish(document_id: int, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)),
              ctx: RequestCtx = Depends(request_ctx)):
    return svc.unpublish(db, user, document_id, ctx)


@router.delete("/company/{document_id}", status_code=204, summary="Remove a company document")
def delete(document_id: int, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)),
           ctx: RequestCtx = Depends(request_ctx)):
    svc.delete_file(db, user, document_id, ctx)


# ── access and acknowledgements ────────────────────────────────────────────────────────────────────────────────────

@router.get("/access/{target_type}/{target_id}", summary="Who can see a category, folder or document")
def get_access(target_type: str, target_id: int, db: Session = Depends(get_db),
               user=Depends(require_doc_permission(DocAction.COMPANY_SHARE))):
    return svc.get_access(db, user, target_type, target_id)


@router.put("/access/{target_type}/{target_id}", summary="Change who can see a category, folder or document")
def put_access(target_type: str, target_id: int, body: AccessIn, db: Session = Depends(get_db),
               user=Depends(require_doc_permission(DocAction.COMPANY_SHARE)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.put_access(db, user, target_type, target_id, body.model_dump(), ctx)


@router.put("/access/bulk", summary="Share several company documents in one action (the same rule on each)")
def put_access_bulk(body: BulkAccessIn, db: Session = Depends(get_db),
                    user=Depends(require_doc_permission(DocAction.COMPANY_SHARE)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.bulk_put_access(db, user, body.document_ids, body.model_dump(exclude={"document_ids"}), ctx)


@router.post("/access/preview", summary="How many people a rule would reach (nothing is saved)")
def preview_access(body: AccessIn, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_SHARE))):
    return svc.preview_access(db, user, body.model_dump())


@router.get("/company/{document_id}/acknowledgements", summary="Who has read a document, and who has not yet")
def acks(document_id: int, status: Optional[str] = Query(None, pattern="^(acknowledged|pending)$"),
         page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200),
         db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE))):
    return svc.ack_tracking(db, user, document_id, status, page, per_page)


@router.post("/company/{document_id}/acknowledgements/remind", summary="Remind people who have not acknowledged yet")
def remind(document_id: int, body: RemindIn, db: Session = Depends(get_db),
           user=Depends(require_doc_permission(DocAction.COMPANY_MANAGE)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.remind_acks(db, user, document_id, body.employee_ids, ctx)


# ── the employee's side ────────────────────────────────────────────────────────────────────────────────────────────

@me_router.get("", summary="Company documents shared with me, by category")
def my_company(category_id: Optional[int] = Query(None), search: Optional[str] = Query(None, max_length=120),
               db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.ME_VIEW))):
    return svc.my_company_documents(db, user, category_id, search)


@me_router.post("/{document_id}/acknowledge", summary="I have read this document")
def acknowledge(document_id: int, body: AckIn, db: Session = Depends(get_db),
                user=Depends(require_doc_permission(DocAction.ME_VIEW)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.acknowledge(db, user, document_id, body.version_id, ctx)
