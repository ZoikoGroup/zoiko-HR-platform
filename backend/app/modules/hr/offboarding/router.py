"""Offboarding HTTP API.

/hr/offboarding/*      HR and organisation admins (the Offboarding module). A manager may decide a direct report's
                       resignation when the organisation allows it (approve / reject only).
/hr/me/offboarding/*   the signed-in person: My Exit (their own case) and Offboarding Tasks (clearance work assigned to
                       them, and resignations of their direct reports to decide).
/public/offboarding/*  the e-mailed download link for exit documents after the last working day.
"""
import csv
import io
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.employee.models import Employee
from app.modules.hr.offboarding import documents as D, service as svc, settings as S, settlement as ST
from app.modules.hr.offboarding.models import (OffboardingAssetReturn, OffboardingCase, OffboardingInterview,
                                               OffboardingSettlement, OffboardingTask)

router = APIRouter(prefix="/hr/offboarding", tags=["Offboarding"])
me_router = APIRouter(prefix="/hr/me/offboarding", tags=["Offboarding (self-service)"])
public_router = APIRouter(prefix="/public/offboarding", tags=["Offboarding documents link"])


class Body(BaseModel):
    model_config = {"extra": "allow"}


def _hr(user):
    svc.require_hr(user)
    return user


def _case_detail(db: Session, case: OffboardingCase, view: str) -> dict:
    out = svc.case_out(db, case, view)
    out["can_close"] = view == "hr" and case.status == "exited" and not svc.close_blockers(db, case)
    out["close_blockers"] = svc.close_blockers(db, case) if view == "hr" else []
    return out


def _pdf(doc) -> Response:
    data = D.render_pdf(doc)
    fname = f"{doc.title.replace(' ', '_')}_{(doc.content or {}).get('case_number', '')}.pdf"
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}"',
                                                                        "Cache-Control": "no-store"})


# ── HR: dashboard, lists ─────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    return svc.dashboard(db, user.organization_id)


@router.get("/meta")
def meta(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Choices for the forms: exit types, notice handling, reasons, owner roles."""
    _hr(user)
    return {"exit_types": [{"key": k, "label": v} for k, v in svc.EXIT_TYPE_LABELS.items()],
            "notice_handling": [{"key": k, "label": v} for k, v in svc.NOTICE_LABELS.items()],
            "reason_categories": S.REASON_CATEGORIES,
            "owner_roles": [{"key": k, "label": v} for k, v in svc.ROLE_LABELS.items()]}


@router.get("/notice-preview")
def notice_preview(employee_id: int, notice_date: Optional[date] = None, db: Session = Depends(get_db),
                   user=Depends(get_current_user)):
    _hr(user)
    emp = svc._employee(db, user.organization_id, employee_id)
    n = svc.notice_for_employee(db, emp, notice_date)
    reportees = db.query(Employee).filter(Employee.organization_id == user.organization_id,
                                          Employee.reporting_manager_id == emp.id, Employee.is_active.is_(True)).count()
    existing = svc.open_case_of(db, user.organization_id, emp.id)
    return {"notice": n, "direct_reports": reportees,
            "employee": {"id": emp.id, "name": svc.name_of(emp), "employee_code": emp.employee_code,
                         "job_title": emp.job_title, "is_active": bool(emp.is_active)},
            "manager": ({"id": emp.reporting_manager_id, "name": svc.name_of(db.get(Employee, emp.reporting_manager_id))}
                        if emp.reporting_manager_id else None),
            "open_case": {"id": existing.id, "case_number": existing.case_number} if existing else None}


@router.get("/cases")
def cases(status: Optional[str] = None, exit_type: Optional[str] = None, department_id: Optional[int] = None,
          search: Optional[str] = None, lwd_from: Optional[str] = None, lwd_to: Optional[str] = None,
          page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=100),
          db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    return svc.list_cases(db, user.organization_id, status=status, exit_type=exit_type, department_id=department_id,
                          search=search, lwd_from=lwd_from, lwd_to=lwd_to, page=page, per_page=per_page)


@router.get("/cases/export")
def export_cases(status: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    data = svc.list_cases(db, user.organization_id, status=status, page=1, per_page=100)
    rows, page = list(data["items"]), 1
    while len(rows) < data["total"]:
        page += 1
        rows += svc.list_cases(db, user.organization_id, status=status, page=page, per_page=100)["items"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Case", "Employee", "Employee code", "Department", "Exit type", "Status", "Notice date", "Last working day",
                "Tasks done", "Tasks total", "Assets pending"])
    for c in rows:
        e = c["employee"] or {}
        w.writerow([c["case_number"], e.get("name"), e.get("employee_code"), e.get("department"), c["exit_type_label"],
                    c["display_status"], c["resignation_date"], c["last_working_day"], c["progress"]["tasks_done"],
                    c["progress"]["tasks_total"], c["progress"]["assets_pending"]])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="exit_cases.csv"'})


@router.get("/resignations")
def resignations(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Waiting for a decision: new resignations / exits needing approval, and withdrawal requests."""
    _hr(user)
    q = db.query(OffboardingCase).filter(OffboardingCase.organization_id == user.organization_id)
    pending = q.filter(OffboardingCase.status == "submitted").order_by(OffboardingCase.created_at).all()
    withdrawals = (q.filter(OffboardingCase.status == "approved", OffboardingCase.withdrawal_requested_at.isnot(None))
                   .order_by(OffboardingCase.withdrawal_requested_at).all())
    people: dict = {}
    return {"pending": [dict(svc.case_out(db, c, "hr", people), can_decide=svc.can_decide(db, c, user)) for c in pending],
            "withdrawals": [svc.case_out(db, c, "hr", people) for c in withdrawals]}


@router.post("/cases", status_code=201)
def start(body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.start_exit(db, user, body.model_dump())
    return _case_detail(db, case, "hr")


@router.get("/cases/{case_id}")
def case_detail(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    if case.employee_id == user.id:
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException("Your own exit is in My Exit.")
    out = _case_detail(db, case, "hr")
    out["can_decide"] = case.status == "submitted" and svc.can_decide(db, case, user)
    return out


@router.patch("/cases/{case_id}")
def update(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    svc.update_case(db, case, user, body.model_dump())
    return _case_detail(db, case, "hr")


@router.post("/cases/{case_id}/approve")
def approve(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    svc.approve(db, case, user, body.model_dump())
    db.refresh(case)
    return _case_detail(db, case, "hr" if svc.is_hr(user) else "manager")


@router.post("/cases/{case_id}/reject")
def reject(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    svc.reject(db, case, user, body.model_dump().get("note"))
    return _case_detail(db, case, "hr" if svc.is_hr(user) else "manager")


@router.post("/cases/{case_id}/withdrawal")
def withdrawal(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    b = body.model_dump()
    case = svc.get_case(db, user.organization_id, case_id)
    svc.decide_withdrawal(db, case, user, bool(b.get("accept")), b.get("note") or "")
    return _case_detail(db, case, "hr")


@router.post("/cases/{case_id}/cancel")
def cancel(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    svc.cancel(db, case, user, body.model_dump().get("reason"))
    return _case_detail(db, case, "hr")


@router.post("/cases/{case_id}/stop-access")
def stop_access(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    svc.stop_access(db, case, user)
    return _case_detail(db, case, "hr")


@router.post("/cases/{case_id}/close")
def close(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    svc.close(db, case, user)
    return _case_detail(db, case, "hr")


@router.get("/cases/{case_id}/activity")
def case_activity(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    return {"items": svc.activity(db, svc.get_case(db, user.organization_id, case_id), True)}


# ── HR: tasks ────────────────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/cases/{case_id}/tasks")
def case_tasks(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    people: dict = {}
    rows = (db.query(OffboardingTask).filter(OffboardingTask.case_id == case.id)
            .order_by(OffboardingTask.sort_order, OffboardingTask.id).all())
    return {"items": [svc.task_out(db, t, people) for t in rows]}


@router.post("/cases/{case_id}/tasks", status_code=201)
def add_task(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    return svc.task_out(db, svc.add_task(db, user, case, body.model_dump()))


@router.get("/tasks")
def board(owner_role: Optional[str] = None, overdue: bool = False, assignee_id: Optional[int] = None,
          db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    items = svc.task_board(db, user.organization_id, owner_role=owner_role, overdue_only=overdue, assignee_id=assignee_id)
    return {"items": items, "total": len(items), "overdue": sum(1 for i in items if i["overdue"])}


@router.put("/tasks/{task_id}")
def update_task(task_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    b = body.model_dump()
    if "assignee_id" in b or "due_date" in b:
        t = svc.assign_task(db, user, task_id, b.get("assignee_id"), b.get("due_date"))
    if "done" in b:
        t = svc.set_task_done(db, user, task_id, bool(b["done"]), b.get("note"))
    if b.get("exception_reason"):
        t = svc.task_exception(db, user, task_id, b["exception_reason"])
    if not any(k in b for k in ("assignee_id", "due_date", "done", "exception_reason")):
        from app.core.exceptions import BadRequestException
        raise BadRequestException("Nothing to change.")
    return svc.task_out(db, t)


# ── HR: assets ───────────────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/assets")
def assets(status: Optional[str] = "pending", case_id: Optional[int] = None, db: Session = Depends(get_db),
           user=Depends(get_current_user)):
    _hr(user)
    q = (db.query(OffboardingAssetReturn, OffboardingCase, Employee)
         .join(OffboardingCase, OffboardingCase.id == OffboardingAssetReturn.case_id)
         .join(Employee, Employee.id == OffboardingCase.employee_id)
         .filter(OffboardingAssetReturn.organization_id == user.organization_id))
    if case_id:
        q = q.filter(OffboardingAssetReturn.case_id == case_id)
    else:
        q = q.filter(OffboardingCase.status.in_(("approved", "exited", "closed")))
    if status and status != "all":
        q = q.filter(OffboardingAssetReturn.status == status)
    rows = q.order_by(OffboardingCase.last_working_day, OffboardingAssetReturn.id).all()
    return {"items": [svc.asset_out(r, c, e) for r, c, e in rows]}


@router.post("/cases/{case_id}/assets/sync")
def sync_assets(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    if case.status not in ("approved", "exited"):
        raise svc.OffboardingError("Assets are listed once the exit is approved.")
    added = svc.sync_assets(db, case)
    db.commit()
    return {"added": added}


@router.put("/assets/{return_id}")
def resolve_asset(return_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = svc.resolve_asset(db, user, return_id, body.model_dump())
    return svc.asset_out(r)


# ── HR: settlement ───────────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/settlements")
def settlements(status: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    return {"items": ST.list_settlements(db, user.organization_id, status)}


@router.get("/settlements/export")
def export_settlements(status: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Case", "Employee", "Employee code", "Last working day", "Currency", "Earnings", "Deductions", "Net amount",
                "Status", "Paid on", "Payment reference"])
    for s in ST.list_settlements(db, user.organization_id, status):
        w.writerow([s["case_number"], s["employee"]["name"], s["employee"]["employee_code"], s["last_working_day"], s["currency"],
                    f"{s['total_earnings']:.2f}", f"{s['total_deductions']:.2f}", f"{s['net_amount']:.2f}", s["status"],
                    s["paid_on"] or "", s["payment_reference"] or ""])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="final_settlements.csv"'})


@router.get("/cases/{case_id}/settlement")
def get_settlement(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    st = db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == case.id).first()
    if st is None and case.status in ("approved", "exited"):
        st = ST.ensure(db, case)
        db.commit()
    return {"settlement": ST.settlement_out(db, st, case)}


@router.put("/cases/{case_id}/settlement")
def save_settlement(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    st = ST.save(db, user, case_id, body.model_dump())
    return {"settlement": ST.settlement_out(db, st, svc.get_case(db, user.organization_id, case_id))}


@router.post("/cases/{case_id}/settlement/{status}")
def settlement_status(case_id: int, status: str, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    st = ST.set_status(db, user, case_id, status, body.model_dump())
    return {"settlement": ST.settlement_out(db, st, svc.get_case(db, user.organization_id, case_id))}


# ── HR: exit interview ───────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/interviews")
def interviews(date_from: Optional[str] = None, date_to: Optional[str] = None, department_id: Optional[int] = None,
               db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    return svc.interview_analytics(db, user.organization_id, date_from=date_from, date_to=date_to, department_id=department_id)


@router.get("/cases/{case_id}/interview")
def get_interview(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    iv = db.query(OffboardingInterview).filter(OffboardingInterview.case_id == case.id).first()
    out = svc.interview_out(iv)
    if out:
        out["hr_summary"] = iv.hr_summary
    return {"interview": out}


@router.post("/cases/{case_id}/interview/send")
def send_interview(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    return {"interview": svc.interview_out(svc.send_interview(db, case, user))}


@router.put("/cases/{case_id}/interview")
def interview_summary(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    iv = db.query(OffboardingInterview).filter(OffboardingInterview.case_id == case.id).first()
    if iv is None:
        raise svc.OffboardingError("Send the exit interview first.")
    b = body.model_dump()
    if "hr_summary" in b:
        iv.hr_summary = (str(b["hr_summary"] or "").strip()[:4000] or None)
    if b.get("declined") and iv.status in ("sent", "draft", "not_sent"):
        iv.status = "declined"
        svc.log(db, case, user.id, "interview_declined", "Exit interview marked as declined", hr_only=True)
    db.commit()
    out = svc.interview_out(iv)
    out["hr_summary"] = iv.hr_summary
    return {"interview": out}


# ── HR: documents ────────────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/cases/{case_id}/documents")
def case_documents(case_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    return {"items": D.list_docs(db, case, include_revoked=True),
            "kinds": [{"key": k, "label": v} for k, v in D.TITLES.items()]}


@router.post("/cases/{case_id}/documents", status_code=201)
def issue_document(case_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    return D.doc_out(D.issue(db, case, user, body.model_dump().get("kind")))


@router.delete("/cases/{case_id}/documents/{doc_id}")
def revoke_document(case_id: int, doc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    return D.doc_out(D.revoke(db, user, case, doc_id))


@router.get("/cases/{case_id}/documents/{doc_id}/pdf")
def document_pdf(case_id: int, doc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    case = svc.get_case(db, user.organization_id, case_id)
    return _pdf(D.get_doc(db, case, doc_id, allow_revoked=True))


# ── HR: settings ─────────────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    from app.modules.hr.models import LeaveType
    cfg = S.get_settings(db, user.organization_id)
    names = {}
    for role, pid in (cfg.get("task_assignees") or {}).items():
        if pid:
            p = db.query(Employee).filter(Employee.id == pid, Employee.organization_id == user.organization_id).first()
            names[role] = svc.name_of(p) if p else None
    return {"settings": cfg, "task_assignee_names": names, "templates": S.list_templates(db, user.organization_id),
            "leave_types": [t.value for t in LeaveType], "question_types": list(S.QUESTION_TYPES),
            "reason_categories": S.REASON_CATEGORIES}


@router.put("/settings")
def put_settings(body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    return {"settings": S.save_settings(db, user.organization_id, user.id, body.model_dump())}


@router.post("/checklists", status_code=201)
def create_checklist(body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    return S.save_template(db, user.organization_id, user.id, body.model_dump())


@router.put("/checklists/{template_id}")
def update_checklist(template_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    return S.save_template(db, user.organization_id, user.id, body.model_dump(), template_id)


@router.delete("/checklists/{template_id}", status_code=204)
def delete_checklist(template_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _hr(user)
    S.delete_template(db, user.organization_id, template_id)
    return Response(status_code=204)


# ── the signed-in person: My Exit ────────────────────────────────────────────────────────────────────────────────────

def _latest_own(db: Session, user) -> Optional[OffboardingCase]:
    """The exit My Exit shows: the one in progress, else the latest finished one. An exit HR cancelled never happened for
    the person, so it is not shown (and does not stand in the way of resigning)."""
    case = svc.open_case_of(db, user.organization_id, user.id)
    if case is None:
        case = (db.query(OffboardingCase)
                .filter(OffboardingCase.organization_id == user.organization_id, OffboardingCase.employee_id == user.id,
                        OffboardingCase.status != "cancelled")
                .order_by(OffboardingCase.id.desc()).first())
    return case


@me_router.get("")
def my_exit(db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = _latest_own(db, user)
    notice = svc.notice_for_employee(db, user)
    out = {"case": None, "notice": notice, "reason_categories": S.REASON_CATEGORIES,
           "can_resign": svc.open_case_of(db, user.organization_id, user.id) is None}
    if case is not None:
        out["case"] = svc.case_out(db, case, "employee")
        iv = db.query(OffboardingInterview).filter(OffboardingInterview.case_id == case.id).first()
        tasks = db.query(OffboardingTask).filter(OffboardingTask.case_id == case.id, OffboardingTask.owner_role == "employee",
                                                 OffboardingTask.status != "cancelled").all()
        st = db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == case.id).first()
        out["summary"] = {
            "my_tasks_total": len(tasks), "my_tasks_open": sum(1 for t in tasks if t.status == "open"),
            "interview_status": iv.status if iv else None,
            "settlement_status": st.status if st else None,
            "documents": len(D.list_docs(db, case, include_revoked=False)),
            "can_withdraw": case.exit_type == "resignation" and (case.status == "submitted"
                                                                  or (case.status == "approved" and not case.withdrawal_requested_at)),
        }
        out["activity"] = svc.activity(db, case, False)[:15]
    return out


@me_router.post("/resignation", status_code=201)
def resign(body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.submit_resignation(db, user, body.model_dump())
    return {"case": svc.case_out(db, case, "employee")}


@me_router.post("/withdraw")
def withdraw(body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.open_case_of(db, user.organization_id, user.id)
    if case is None:
        raise svc.OffboardingError("You have no resignation to withdraw.", status_code=404, code="NOT_FOUND")
    svc.withdraw(db, case, user, body.model_dump().get("reason"))
    return {"case": svc.case_out(db, case, "employee")}


@me_router.get("/tasks")
def my_exit_tasks(db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = _latest_own(db, user)
    if case is None:
        return {"items": []}
    rows = (db.query(OffboardingTask).filter(OffboardingTask.case_id == case.id, OffboardingTask.owner_role == "employee",
                                             OffboardingTask.status != "cancelled")
            .order_by(OffboardingTask.due_date, OffboardingTask.sort_order).all())
    return {"items": [svc.task_out(db, t) for t in rows]}


@me_router.put("/tasks/{task_id}")
def my_exit_task(task_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    b = body.model_dump()
    t = svc._task(db, user.organization_id, task_id)
    case = svc.get_case(db, user.organization_id, t.case_id)
    if case.employee_id != user.id or t.owner_role != "employee":
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException("This task is not yours.")
    return svc.task_out(db, svc.set_task_done(db, user, task_id, bool(b.get("done")), b.get("note")))


@me_router.get("/interview")
def my_interview(db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = _latest_own(db, user)
    iv = db.query(OffboardingInterview).filter(OffboardingInterview.case_id == case.id).first() if case else None
    return {"interview": svc.interview_out(iv)}


@me_router.put("/interview")
def my_interview_save(body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    b = body.model_dump()
    iv = svc.save_interview(db, user, b.get("answers") or {}, bool(b.get("submit")))
    return {"interview": svc.interview_out(iv)}


@me_router.get("/documents")
def my_documents(db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = _latest_own(db, user)
    return {"items": D.list_docs(db, case, include_revoked=False) if case else []}


@me_router.get("/documents/{doc_id}/pdf")
def my_document_pdf(doc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = _latest_own(db, user)
    if case is None:
        from app.core.exceptions import NotFoundException
        raise NotFoundException("Document", doc_id)
    doc = D.get_doc(db, case, doc_id, allow_revoked=False)
    from datetime import datetime
    doc.downloaded_at = doc.downloaded_at or datetime.utcnow()
    db.commit()
    return _pdf(doc)


# ── the signed-in person: Offboarding Tasks (work for other people's exits) ─────────────────────────────────────────

@me_router.get("/assigned-tasks")
def assigned(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = (db.query(OffboardingTask, OffboardingCase).join(OffboardingCase, OffboardingCase.id == OffboardingTask.case_id)
            .filter(OffboardingTask.organization_id == user.organization_id, OffboardingTask.assignee_id == user.id,
                    OffboardingCase.employee_id != user.id, OffboardingCase.status.in_(("approved", "exited", "closed")),
                    OffboardingTask.status != "cancelled")
            .order_by(OffboardingTask.status, OffboardingTask.due_date).all())
    people: dict = {}
    items = []
    for t, c in rows:
        row = svc.task_out(db, t, people)
        emp = people.get(c.employee_id) or db.get(Employee, c.employee_id)
        people[c.employee_id] = emp
        row["case"] = {"id": c.id, "case_number": c.case_number, "last_working_day": c.last_working_day, "status": c.status,
                       "employee": {"id": emp.id, "name": svc.name_of(emp), "job_title": emp.job_title}}
        items.append(row)
    decisions = []
    cfg = S.get_settings(db, user.organization_id)
    if cfg["approver"] == "manager_or_hr":
        team = (db.query(OffboardingCase).join(Employee, Employee.id == OffboardingCase.employee_id)
                .filter(OffboardingCase.organization_id == user.organization_id, OffboardingCase.status == "submitted",
                        OffboardingCase.exit_type == "resignation", Employee.reporting_manager_id == user.id).all())
        decisions = [svc.case_out(db, c, "manager", people) for c in team]
    return {"items": items, "open": sum(1 for i in items if i["status"] == "open"), "decisions": decisions,
            "reason_categories": S.REASON_CATEGORIES}


@me_router.put("/assigned-tasks/{task_id}")
def assigned_update(task_id: int, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    b = body.model_dump()
    t = svc._task(db, user.organization_id, task_id)
    if t.assignee_id != user.id:
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException("This task is not assigned to you.")
    return svc.task_out(db, svc.set_task_done(db, user, task_id, bool(b.get("done")), b.get("note")))


@me_router.post("/decisions/{case_id}/{decision}")
def manager_decision(case_id: int, decision: str, body: Body, db: Session = Depends(get_db), user=Depends(get_current_user)):
    case = svc.get_case(db, user.organization_id, case_id)
    b = body.model_dump()
    if decision == "approve":
        svc.approve(db, case, user, {"note": b.get("note")})
    elif decision == "reject":
        svc.reject(db, case, user, b.get("note"))
    else:
        from app.core.exceptions import BadRequestException
        raise BadRequestException("Unknown decision.")
    db.refresh(case)
    return {"case": svc.case_out(db, case, "manager")}


# ── public: the e-mailed link ────────────────────────────────────────────────────────────────────────────────────────

@public_router.get("/documents/{token}")
@limiter.limit("30/minute")
def public_document(request: Request, token: str, db: Session = Depends(get_db)):
    doc = D.by_token(db, token)
    from app.modules.hr.models import Organization
    org = db.get(Organization, doc.organization_id)
    return {"title": doc.title, "issued_at": doc.issued_at, "expires_at": doc.access_expires_at,
            "organization": getattr(org, "organization_name", None) or getattr(org, "display_name", None),
            "employee_name": (doc.content or {}).get("employee_name")}


@public_router.get("/documents/{token}/pdf")
@limiter.limit("30/minute")
def public_document_pdf(request: Request, token: str, db: Session = Depends(get_db)):
    doc = D.by_token(db, token)
    from datetime import datetime
    doc.downloaded_at = doc.downloaded_at or datetime.utcnow()
    db.commit()
    return _pdf(doc)
