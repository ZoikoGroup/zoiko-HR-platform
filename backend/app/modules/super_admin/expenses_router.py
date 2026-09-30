"""Super Admin expenses oversight (ZHR-30).

Cross-organization, read-only view of the same expense claims the organization
and employee portals use (TravelExpense), plus operational budgets. Money is
returned as decimal strings with an explicit currency; amounts in different
currencies are never added together - totals are grouped per currency."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_super_admin
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.modules.employee.models import Employee
from app.modules.hr.models import (
    Organization, RequestStatus, TravelApproval, TravelExpense, TravelReceipt,
)
from app.modules.super_admin.models import AuditAction, AuditLog, ExpenseBudget

router = APIRouter(
    prefix="/super-admin/expenses", tags=["Super Admin Expenses"],
    dependencies=[Depends(get_current_super_admin)],
)

PENDING = (RequestStatus.PENDING, RequestStatus.IN_PROGRESS)
STATUS_GROUPS = {
    "pending": PENDING,
    "approved": (RequestStatus.APPROVED,),
    "paid": (RequestStatus.COMPLETED,),
    "rejected": (RequestStatus.REJECTED,),
    "cancelled": (RequestStatus.CANCELLED,),
}
COUNTED_AS_SPEND = (RequestStatus.APPROVED, RequestStatus.COMPLETED)
ZERO = Decimal("0.00")


def _money(value) -> str:
    return f"{Decimal(value or 0):.2f}"


def _iso(dt) -> Optional[str]:
    return dt.isoformat() + "Z" if isinstance(dt, datetime) else None


def _status_name(status) -> str:
    for name, group in STATUS_GROUPS.items():
        if status in group:
            return name
    return str(getattr(status, "value", status))


def _org_name(o: Optional[Organization]) -> Optional[str]:
    return (o.organization_name or o.display_name or o.name) if o else None


def _safe_receipt_url(url: Optional[str]) -> Optional[str]:
    """Receipts are stored as URL strings (no upload endpoint exists). Only
    http(s) links are exposed; local/other schemes are never served."""
    u = (url or "").strip()
    return u if u.lower().startswith(("https://", "http://")) else None


def _claims_query(db: Session, organization_id, category, currency, date_from, date_to,
                  min_amount, max_amount, q):
    query = (
        db.query(TravelExpense, Employee, Organization)
        .join(Employee, Employee.id == TravelExpense.employee_id)
        .join(Organization, Organization.id == TravelExpense.organization_id)
    )
    if organization_id:
        query = query.filter(TravelExpense.organization_id == organization_id)
    if category:
        query = query.filter(func.lower(TravelExpense.expense_type) == category.strip().lower())
    if currency:
        query = query.filter(TravelExpense.currency == currency.upper())
    if date_from:
        query = query.filter(TravelExpense.submitted_at >= date_from.replace(tzinfo=None))
    if date_to:
        query = query.filter(TravelExpense.submitted_at <= date_to.replace(tzinfo=None))
    if min_amount is not None:
        query = query.filter(TravelExpense.amount >= min_amount)
    if max_amount is not None:
        query = query.filter(TravelExpense.amount <= max_amount)
    term = (q or "").strip().lower()
    if term:
        like = f"%{term}%"
        query = query.filter(or_(
            func.lower(Employee.first_name).like(like),
            func.lower(Employee.last_name).like(like),
            func.lower(Employee.first_name + " " + Employee.last_name).like(like),
            func.lower(Employee.email).like(like),
            func.lower(func.coalesce(TravelExpense.description, "")).like(like),
        ))
    return query


def _claim_view(e: TravelExpense, emp: Employee, org: Organization, approver: Optional[str] = None,
                receipts=None) -> dict:
    out = {
        "id": e.id, "organization_id": e.organization_id, "organization_name": _org_name(org),
        "employee_id": e.employee_id, "employee_name": f"{emp.first_name} {emp.last_name}".strip(),
        "employee_email": emp.email, "category": e.expense_type, "description": e.description,
        "amount": _money(e.amount), "currency": e.currency or "USD", "status": _status_name(e.status),
        "submitted_at": _iso(e.submitted_at), "approved_at": _iso(e.approved_at),
        "reimbursed_at": _iso(e.reimbursed_at), "approver": approver,
        "has_receipt": bool(_safe_receipt_url(e.receipt_url)) or bool(receipts),
    }
    if receipts is not None:
        out["receipt_url"] = _safe_receipt_url(e.receipt_url)
        out["receipts"] = [
            {"id": r.id, "receipt_number": r.receipt_number, "vendor": r.vendor_name, "amount": _money(r.amount),
             "expense_date": r.expense_date.isoformat() if r.expense_date else None, "verified": bool(r.verified),
             "url": _safe_receipt_url(r.receipt_url)}
            for r in receipts
        ]
    return out


def _approvers_for(db: Session, request_ids) -> dict:
    """request_id -> name of the approver who approved the linked travel request."""
    if not request_ids:
        return {}
    rows = (
        db.query(TravelApproval.request_id, Employee.first_name, Employee.last_name)
        .join(Employee, Employee.id == TravelApproval.approver_id)
        .filter(TravelApproval.request_id.in_(set(request_ids)), TravelApproval.status == RequestStatus.APPROVED)
        .order_by(TravelApproval.approval_level)
        .all()
    )
    return {rid: f"{f} {l}".strip() for rid, f, l in rows}


@router.get("/claims")
def list_claims(
    status: str = Query("all"),
    organization_id: Optional[int] = None,
    category: Optional[str] = None,
    currency: Optional[str] = Query(None, min_length=3, max_length=3),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    min_amount: Optional[Decimal] = Query(None, ge=0),
    max_amount: Optional[Decimal] = Query(None, ge=0),
    q: Optional[str] = Query(None, max_length=200),
    sort: str = Query("submitted_at"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if status != "all" and status not in STATUS_GROUPS:
        raise BadRequestException("status must be one of: all, " + ", ".join(STATUS_GROUPS) + ".")
    if sort not in ("submitted_at", "amount", "status"):
        raise BadRequestException("sort must be one of: submitted_at, amount, status.")
    if order not in ("asc", "desc"):
        raise BadRequestException("order must be asc or desc.")
    query = _claims_query(db, organization_id, category, currency, date_from, date_to, min_amount, max_amount, q)
    if status != "all":
        query = query.filter(TravelExpense.status.in_(STATUS_GROUPS[status]))
    total = query.count()
    col = {"submitted_at": TravelExpense.submitted_at, "amount": TravelExpense.amount, "status": TravelExpense.status}[sort]
    ordering = (col.asc() if order == "asc" else col.desc(), TravelExpense.id.desc())
    rows = query.order_by(*ordering).offset((page - 1) * page_size).limit(page_size).all()
    approvers = _approvers_for(db, [e.request_id for e, _, _ in rows if e.request_id])
    return {"total": total, "page": page, "page_size": page_size,
            "claims": [_claim_view(e, emp, org, approvers.get(e.request_id)) for e, emp, org in rows]}


@router.get("/claims/{claim_id}")
def get_claim(claim_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(TravelExpense, Employee, Organization)
        .join(Employee, Employee.id == TravelExpense.employee_id)
        .join(Organization, Organization.id == TravelExpense.organization_id)
        .filter(TravelExpense.id == claim_id)
        .first()
    )
    if row is None:
        raise NotFoundException("Expense claim", claim_id)
    e, emp, org = row
    receipts = db.query(TravelReceipt).filter(TravelReceipt.expense_id == e.id).all()
    approver = _approvers_for(db, [e.request_id] if e.request_id else []).get(e.request_id)
    return _claim_view(e, emp, org, approver, receipts=receipts)


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    rows = db.query(TravelExpense.expense_type).distinct().order_by(TravelExpense.expense_type).all()
    return {"categories": [r[0] for r in rows if r[0]]}


@router.get("/summary")
def claims_summary(
    organization_id: Optional[int] = None,
    category: Optional[str] = None,
    currency: Optional[str] = Query(None, min_length=3, max_length=3),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """Totals per currency: {currency: {claimed, pending, approved, paid, rejected}} plus counts."""
    base = _claims_query(db, organization_id, category, currency, date_from, date_to, None, None, None).subquery()
    exp = TravelExpense
    rows = (
        db.query(exp.currency, exp.status, func.count(exp.id), func.coalesce(func.sum(exp.amount), 0))
        .join(base, base.c.id == exp.id)
        .group_by(exp.currency, exp.status)
        .all()
    )
    totals: dict = {}
    counts = {name: 0 for name in STATUS_GROUPS}
    for cur, status, n, amount in rows:
        bucket = totals.setdefault(cur or "USD", {k: ZERO for k in ("claimed", "pending", "approved", "paid", "rejected")})
        name = _status_name(status)
        counts[name] = counts.get(name, 0) + n
        if name in bucket:
            bucket[name] += Decimal(amount)
        if name != "cancelled":
            bucket["claimed"] += Decimal(amount)
    return {
        "totals": {cur: {k: _money(v) for k, v in vals.items()} for cur, vals in sorted(totals.items())},
        "counts": counts,
        "claim_count": sum(counts.values()),
    }


# ─────────────────────────────── budgets ───────────────────────────────

class BudgetIn(BaseModel):
    organization_id: int
    name: str = Field(min_length=1, max_length=150)
    category: Optional[str] = Field(default=None, max_length=100)
    period_start: date
    period_end: date
    currency: str = Field(default="USD", min_length=3, max_length=3)
    allocated_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


def _budget_view(db: Session, b: ExpenseBudget, org: Optional[Organization]) -> dict:
    q = db.query(func.coalesce(func.sum(TravelExpense.amount), 0)).filter(
        TravelExpense.organization_id == b.organization_id,
        TravelExpense.currency == b.currency,
        TravelExpense.status.in_(COUNTED_AS_SPEND),
        TravelExpense.submitted_at >= datetime.combine(b.period_start, time.min),
        TravelExpense.submitted_at < datetime.combine(b.period_end + timedelta(days=1), time.min),
    )
    if b.category:
        q = q.filter(func.lower(TravelExpense.expense_type) == b.category.lower())
    spent = Decimal(q.scalar() or 0)
    allocated = Decimal(b.allocated_amount)
    remaining = allocated - spent
    utilization = (spent / allocated * 100) if allocated > 0 else Decimal(0)
    return {
        "id": b.id, "organization_id": b.organization_id, "organization_name": _org_name(org),
        "name": b.name, "category": b.category, "period_start": b.period_start.isoformat(),
        "period_end": b.period_end.isoformat(), "currency": b.currency,
        "allocated": _money(allocated), "spent": _money(spent), "remaining": _money(remaining),
        "utilization_pct": float(round(utilization, 1)), "over_budget": spent > allocated,
    }


@router.get("/budgets")
def list_budgets(organization_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = (db.query(ExpenseBudget, Organization)
         .join(Organization, Organization.id == ExpenseBudget.organization_id)
         .filter(ExpenseBudget.is_active.is_(True)))
    if organization_id:
        q = q.filter(ExpenseBudget.organization_id == organization_id)
    rows = q.order_by(ExpenseBudget.period_end.desc(), ExpenseBudget.id.desc()).all()
    return {"budgets": [_budget_view(db, b, o) for b, o in rows]}


@router.post("/budgets", status_code=201)
def create_budget(body: BudgetIn, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    org = db.query(Organization).filter(Organization.id == body.organization_id).first()
    if org is None:
        raise BadRequestException("The selected organization does not exist.")
    if body.period_end < body.period_start:
        raise BadRequestException("The budget period must end on or after its start date.")
    b = ExpenseBudget(
        organization_id=org.id, name=body.name.strip(), category=(body.category or "").strip() or None,
        period_start=body.period_start, period_end=body.period_end, currency=body.currency.upper(),
        allocated_amount=body.allocated_amount, created_by=user.id,
    )
    db.add(b)
    db.flush()
    db.add(AuditLog(action=AuditAction.CREATE, entity_type="ExpenseBudget", entity_id=b.id,
                    performed_by=user.id, performed_by_email=user.email,
                    details={"event": "expenses.budget_created", "organization_id": org.id, "name": b.name,
                             "allocated": _money(b.allocated_amount), "currency": b.currency}))
    db.commit()
    return _budget_view(db, b, org)


@router.delete("/budgets/{budget_id}")
def archive_budget(budget_id: int, db: Session = Depends(get_db), user=Depends(get_current_super_admin)):
    b = db.query(ExpenseBudget).filter(ExpenseBudget.id == budget_id).first()
    if b is None:
        raise NotFoundException("Budget", budget_id)
    if not b.is_active:
        return {"message": "Budget was already archived.", "already_archived": True}
    b.is_active = False  # archived, not deleted
    db.add(AuditLog(action=AuditAction.DELETE, entity_type="ExpenseBudget", entity_id=b.id,
                    performed_by=user.id, performed_by_email=user.email,
                    details={"event": "expenses.budget_archived", "organization_id": b.organization_id, "name": b.name}))
    db.commit()
    return {"message": f"Budget '{b.name}' was archived.", "already_archived": False}
