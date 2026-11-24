"""The final settlement record (Offboarding → Settlements and the case's Settlement tab).

Computed lines (source leave / notice / assets) are recalculated from the case; lines HR types (source manual) are kept as
they are. It is the record HR and finance agree on — not a payroll run.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.modules.employee.models import Employee
from app.modules.hr.offboarding import settings as S
from app.modules.hr.offboarding.models import OffboardingAssetReturn, OffboardingCase, OffboardingSettlement


def _money(v) -> float:
    return float(Decimal(str(v or 0)).quantize(Decimal("0.01")))


def _currency(db: Session, org_id: int) -> str:
    try:
        from app.modules.hr import org_config_service
        return (org_config_service.get_config_value_or_default(db, org_id, "default_currency") or "INR")[:3]
    except Exception:
        return "INR"


def leave_balance(db: Session, case: OffboardingCase) -> dict:
    """Unused leave of the types the organisation pays out, in the year of the last working day."""
    from app.modules.hr.models import LeaveBalance
    cfg = S.get_settings(db, case.organization_id)
    types = set(cfg["encashable_leave_types"])
    year = (case.last_working_day or date.today()).year
    lines, total = [], 0.0
    for b in db.query(LeaveBalance).filter(LeaveBalance.organization_id == case.organization_id,
                                           LeaveBalance.employee_id == case.employee_id, LeaveBalance.year == year):
        lt = getattr(b.leave_type, "value", b.leave_type)
        left = max(0, (b.total_days or 0) - (b.used_days or 0) - (b.pending_days or 0))
        lines.append({"leave_type": lt, "total": b.total_days or 0, "used": b.used_days or 0, "pending": b.pending_days or 0,
                      "remaining": left, "paid_out": lt in types})
        if lt in types:
            total += left
    return {"year": year, "lines": lines, "payable_days": total}


def daily_rate(db: Session, case: OffboardingCase) -> Optional[float]:
    emp = db.get(Employee, case.employee_id)
    divisor = S.get_settings(db, case.organization_id)["daily_rate_divisor"] or 30
    if emp is not None and emp.basic_salary:
        return _money(Decimal(str(emp.basic_salary)) / Decimal(divisor))
    if emp is not None and emp.ctc:
        return _money(Decimal(str(emp.ctc)) / Decimal(12) / Decimal(divisor))
    return None


def _computed_lines(db: Session, case: OffboardingCase, st: OffboardingSettlement) -> tuple:
    rate = float(st.daily_rate) if st.daily_rate is not None else None
    earnings, deductions = [], []
    leave = leave_balance(db, case)
    st.leave_days = leave["payable_days"]
    if leave["payable_days"] and rate:
        earnings.append({"label": f"Leave pay-out ({leave['payable_days']:g} days)", "amount": _money(leave["payable_days"] * rate),
                         "source": "leave"})
    notice_short = 0
    if case.notice_end_date and case.last_working_day and case.last_working_day < case.notice_end_date:
        notice_short = (case.notice_end_date - case.last_working_day).days
    if notice_short and rate:
        if case.notice_handling == "pay_in_lieu":
            earnings.append({"label": f"Pay in lieu of notice ({notice_short} days)", "amount": _money(notice_short * rate),
                             "source": "notice"})
        elif case.notice_handling == "serve" and case.exit_type == "resignation":
            deductions.append({"label": f"Notice not served ({notice_short} days)", "amount": _money(notice_short * rate),
                               "source": "notice"})
    for r in db.query(OffboardingAssetReturn).filter(OffboardingAssetReturn.case_id == case.id,
                                                     OffboardingAssetReturn.recovery_amount.isnot(None)):
        if r.recovery_amount and float(r.recovery_amount) > 0:
            deductions.append({"label": f"Asset recovery: {r.asset_name or r.asset_tag or 'asset'} ({r.status})",
                               "amount": _money(r.recovery_amount), "source": "assets"})
    return earnings, deductions


def _total(st: OffboardingSettlement) -> None:
    st.net_amount = _money(sum(_money(l["amount"]) for l in st.earnings or []) - sum(_money(l["amount"]) for l in st.deductions or []))


def ensure(db: Session, case: OffboardingCase) -> OffboardingSettlement:
    st = db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == case.id).first()
    if st is None:
        st = OffboardingSettlement(organization_id=case.organization_id, case_id=case.id, currency=_currency(db, case.organization_id),
                                   daily_rate=daily_rate(db, case), earnings=[], deductions=[])
        db.add(st)
        db.flush()
        refresh_computed(db, case, st)
    return st


def refresh_computed(db: Session, case: OffboardingCase, st: Optional[OffboardingSettlement] = None) -> Optional[OffboardingSettlement]:
    """Recalculate the computed lines, keep HR's own lines. A paid settlement is never changed."""
    st = st or db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == case.id).first()
    if st is None or st.status in ("paid", "not_applicable"):
        return st
    earn, ded = _computed_lines(db, case, st)
    st.earnings = earn + [l for l in st.earnings or [] if l.get("source") == "manual"]
    st.deductions = ded + [l for l in st.deductions or [] if l.get("source") == "manual"]
    _total(st)
    if st.status == "approved":
        st.status, st.approved_by, st.approved_at = "draft", None, None
    return st


def settlement_out(db: Session, st: Optional[OffboardingSettlement], case: Optional[OffboardingCase] = None,
                   with_leave: bool = True) -> Optional[dict]:
    if st is None:
        return None
    out = {"id": st.id, "case_id": st.case_id, "currency": st.currency, "status": st.status,
           "leave_days": float(st.leave_days) if st.leave_days is not None else None,
           "daily_rate": float(st.daily_rate) if st.daily_rate is not None else None,
           "earnings": st.earnings or [], "deductions": st.deductions or [],
           "total_earnings": _money(sum(_money(l["amount"]) for l in st.earnings or [])),
           "total_deductions": _money(sum(_money(l["amount"]) for l in st.deductions or [])),
           "net_amount": float(st.net_amount) if st.net_amount is not None else 0.0, "notes": st.notes,
           "approved_at": st.approved_at, "paid_on": st.paid_on, "payment_reference": st.payment_reference,
           "updated_at": st.updated_at}
    if with_leave and case is not None:
        out["leave"] = leave_balance(db, case)
    return out


def _lines(raw, kind: str) -> list:
    out = []
    for i, l in enumerate(raw or []):
        label = " ".join(str((l or {}).get("label") or "").split())
        if not label:
            raise BadRequestException(f"{kind} line {i + 1} needs a description.")
        try:
            amount = _money(l.get("amount"))
        except Exception:
            raise BadRequestException(f"{kind} line {i + 1}: the amount must be a number.")
        if amount < 0:
            raise BadRequestException(f"{kind} line {i + 1}: use a positive amount.")
        if amount > 1e10:
            raise BadRequestException(f"{kind} line {i + 1}: the amount is too large.")
        src = l.get("source") if l.get("source") in ("leave", "notice", "assets", "manual") else "manual"
        out.append({"label": label[:200], "amount": amount, "source": src})
    return out


def _get(db: Session, org_id: int, case_id: int) -> tuple:
    from app.modules.hr.offboarding.service import get_case
    case = get_case(db, org_id, case_id)
    st = db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == case.id).first()
    if st is None:
        if case.status not in ("approved", "exited"):
            raise NotFoundException("Settlement")
        st = ensure(db, case)
        db.commit()
    return case, st


def save(db: Session, actor: Employee, case_id: int, body: dict) -> OffboardingSettlement:
    from app.modules.hr.offboarding.service import log, require_hr
    require_hr(actor)
    case, st = _get(db, actor.organization_id, case_id)
    if st.status in ("paid", "not_applicable"):
        raise BadRequestException("This settlement is finished and cannot be changed. Reopen it first.")
    if "daily_rate" in body:
        v = body["daily_rate"]
        if v in (None, ""):
            st.daily_rate = None
        else:
            try:
                st.daily_rate = _money(v)
            except Exception:
                raise BadRequestException("The daily rate must be a number.")
            if float(st.daily_rate) < 0:
                raise BadRequestException("The daily rate cannot be negative.")
    if "earnings" in body:
        st.earnings = _lines(body["earnings"], "Earning")
    if "deductions" in body:
        st.deductions = _lines(body["deductions"], "Deduction")
    if "notes" in body:
        st.notes = (str(body["notes"] or "").strip()[:2000] or None)
    if body.get("recalculate"):
        refresh_computed(db, case, st)
    _total(st)
    st.status, st.approved_by, st.approved_at = "draft", None, None
    st.updated_by = actor.id
    log(db, case, actor.id, "settlement_saved", "Settlement updated", hr_only=True)
    db.commit()
    return st


def set_status(db: Session, actor: Employee, case_id: int, status: str, body: dict) -> OffboardingSettlement:
    from app.modules.hr.offboarding.service import OffboardingError, log, name_of, require_hr
    require_hr(actor)
    case, st = _get(db, actor.organization_id, case_id)
    if actor.id == case.employee_id:
        raise ForbiddenException("You cannot approve or pay your own settlement.")
    if status == "approved":
        if st.status != "draft":
            raise OffboardingError("Only a draft settlement can be approved.")
        st.status, st.approved_by, st.approved_at = "approved", actor.id, datetime.utcnow()
        log(db, case, actor.id, "settlement_approved", f"Settlement approved by {name_of(actor)}", hr_only=True)
    elif status == "paid":
        if st.status != "approved":
            raise OffboardingError("Approve the settlement before marking it paid.")
        paid_on = body.get("paid_on")
        try:
            st.paid_on = date.fromisoformat(str(paid_on)) if paid_on else date.today()
        except ValueError:
            raise BadRequestException("The payment date is not valid.")
        st.payment_reference = (str(body.get("payment_reference") or "").strip()[:120] or None)
        st.status = "paid"
        log(db, case, actor.id, "settlement_paid", f"Settlement marked paid on {st.paid_on}", hr_only=True)
    elif status == "not_applicable":
        if st.status == "paid":
            raise OffboardingError("A paid settlement cannot be marked not applicable.")
        st.status = "not_applicable"
        log(db, case, actor.id, "settlement_na", "Settlement marked not applicable", hr_only=True)
    elif status == "draft":
        if st.status == "paid" and not body.get("confirm_reopen_paid"):
            raise OffboardingError("This settlement is already paid. Confirm to reopen it.")
        st.status, st.approved_by, st.approved_at, st.paid_on = "draft", None, None, None
        log(db, case, actor.id, "settlement_reopened", "Settlement reopened", hr_only=True)
    else:
        raise BadRequestException("Unknown settlement status.")
    db.commit()
    return st


def list_settlements(db: Session, org_id: int, status: Optional[str] = None) -> list:
    from app.modules.hr.offboarding.service import name_of
    q = (db.query(OffboardingSettlement, OffboardingCase, Employee)
         .join(OffboardingCase, OffboardingCase.id == OffboardingSettlement.case_id)
         .join(Employee, Employee.id == OffboardingCase.employee_id)
         .filter(OffboardingSettlement.organization_id == org_id,
                 OffboardingCase.status.in_(("approved", "exited", "closed"))))
    if status == "pending":
        q = q.filter(OffboardingSettlement.status.in_(("draft", "approved")))
    elif status:
        q = q.filter(OffboardingSettlement.status == status)
    out = []
    for st, case, emp in q.order_by(OffboardingCase.last_working_day.desc()).all():
        row = settlement_out(db, st, case, with_leave=False)
        row.update({"case_number": case.case_number, "case_status": case.status, "last_working_day": case.last_working_day,
                    "exit_type": case.exit_type,
                    "employee": {"id": emp.id, "name": name_of(emp), "employee_code": emp.employee_code}})
        out.append(row)
    return out
