"""Admin → Employee Documents endpoints (ZHR-DOCS-ARCH-001 §7.1). Read-only: admins browse, remind and export; they never
upload for an employee. Mounted before hr_router."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.hr.documents import employee_docs_service as svc, id_validators
from app.modules.hr.documents.audit_service import RequestCtx, request_ctx
from app.modules.hr.documents.permissions import DocAction, require_doc_permission

router = APIRouter(prefix="/hr/documents", tags=["📄 HR Documents · Employee documents"])


class ReminderIn(BaseModel):
    category_ids: Optional[list[int]] = None
    message: Optional[str] = Field(None, max_length=500)
    channel: str = Field("both", pattern="^(both|email|in_app)$")
    # ISO date-time, ideally with an offset ("2026-12-01T09:30:00Z"); one without is taken as UTC. Empty: send now.
    scheduled_for: Optional[str] = Field(None, max_length=40)


class BulkReminderIn(BaseModel):
    employee_ids: list[int] = Field(..., min_length=1, max_length=500)
    category_ids: Optional[list[int]] = None
    message: Optional[str] = Field(None, max_length=500)
    scheduled_for: Optional[str] = Field(None, max_length=40)


class CategoryIn(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    is_required: Optional[bool] = None
    requires_expiry: Optional[bool] = None
    max_files: Optional[int] = None
    id_number_field: Optional[str] = None
    applies_to: Optional[dict] = None
    escalation_ladder: Optional[list[dict]] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/employees", summary="Employees with their document completion (paged, searchable)")
def employees(search: Optional[str] = Query(None, max_length=120), department_id: Optional[int] = Query(None),
              status: Optional[str] = Query(None, pattern="^(complete|pending|needs_review|expired)$"),
              joined_from: Optional[date] = Query(None), joined_to: Optional[date] = Query(None),
              page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=200),
              db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.EMP_DOCS_VIEW))):
    return svc.employee_summaries(db, user, search=search, department_id=department_id, status=status,
                                  joined_from=joined_from, joined_to=joined_to, page=page, per_page=per_page)


@router.get("/employees/summary", summary="How many employees are complete, pending, need review or have expired files")
def employees_summary(db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.EMP_DOCS_VIEW))):
    return svc.status_counts(db, user)


@router.get("/employees/{employee_id}", summary="One employee's document containers")
def employee_detail(employee_id: int, db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.EMP_DOCS_VIEW))):
    return svc.employee_detail(db, user, employee_id)


@router.get("/employees/{employee_id}/categories/{category_id}/files", summary="The files in one of an employee's containers")
def employee_category_files(employee_id: int, category_id: int, db: Session = Depends(get_db),
                            user=Depends(require_doc_permission(DocAction.EMP_DOCS_VIEW))):
    return svc.category_files(db, user, employee_id, category_id)


@router.post("/employees/{employee_id}/reminders",
             summary="Remind an employee to upload, now or at a chosen time (one reminder per document per 24 hours)")
def remind(employee_id: int, body: ReminderIn, db: Session = Depends(get_db),
           user=Depends(require_doc_permission(DocAction.EMP_DOCS_REMIND)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.send_reminders(db, user, employee_id, body.category_ids, body.message, body.channel, ctx=ctx,
                              scheduled_for=body.scheduled_for)


@router.post("/reminders/bulk", summary="Remind several employees, now or at a chosen time")
def remind_bulk(body: BulkReminderIn, db: Session = Depends(get_db),
                user=Depends(require_doc_permission(DocAction.EMP_DOCS_REMIND)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.bulk_reminders(db, user, body.employee_ids, body.category_ids, body.message, ctx=ctx,
                              scheduled_for=body.scheduled_for)


@router.delete("/reminders/{reminder_id}", summary="Cancel a scheduled reminder that has not been sent yet")
def cancel_reminder(reminder_id: int, db: Session = Depends(get_db),
                    user=Depends(require_doc_permission(DocAction.EMP_DOCS_REMIND)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.cancel_scheduled_reminder(db, user, reminder_id, ctx=ctx)


@router.get("/employees/{employee_id}/export.zip", summary="Download an employee's documents as a ZIP (audited)")
def export_zip(employee_id: int, approved_only: bool = Query(True), db: Session = Depends(get_db),
               user=Depends(require_doc_permission(DocAction.EMP_DOCS_EXPORT)), ctx: RequestCtx = Depends(request_ctx)):
    name, data = svc.export_zip(db, user, employee_id, approved_only, ctx=ctx)
    return Response(content=data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "private, no-store"})


@router.get("/employee-categories", summary="Employee document categories (containers) and their settings")
def categories(db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.EMP_DOCS_VIEW))):
    return {"items": svc.list_employee_categories(db, user), "id_number_checks": id_validators.choices()}


@router.post("/employee-categories", status_code=201, summary="Add a custom employee document category")
def create_category(body: CategoryIn, db: Session = Depends(get_db),
                    user=Depends(require_doc_permission(DocAction.CATEGORY_MANAGE)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.create_employee_category(db, user, body.model_dump(exclude_unset=True), ctx=ctx)


@router.patch("/employee-categories/{category_id}", summary="Change a category's settings (required, expiry, checks, ladder)")
def update_category(category_id: int, body: CategoryIn, db: Session = Depends(get_db),
                    user=Depends(require_doc_permission(DocAction.CATEGORY_MANAGE)), ctx: RequestCtx = Depends(request_ctx)):
    return svc.update_employee_category(db, user, category_id, body.model_dump(exclude_unset=True), ctx=ctx)


@router.delete("/employee-categories/{category_id}", status_code=204,
               summary="Delete a custom category (one that holds files is turned off instead)")
def delete_category(category_id: int, db: Session = Depends(get_db),
                    user=Depends(require_doc_permission(DocAction.CATEGORY_MANAGE)), ctx: RequestCtx = Depends(request_ctx)):
    svc.delete_employee_category(db, user, category_id, ctx=ctx)
