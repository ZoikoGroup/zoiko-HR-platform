from datetime import datetime
from typing import Optional

from sqlalchemy import func, desc, asc
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundException, BadRequestException
from app.modules.hr.models import (
    WfPlan, WfHeadcount, WfSuccession, WfReport,
    Employee, Department,
)
from app.modules.hr.schemas import (
    WfPlanCreate, WfPlanUpdate,
    WfHeadcountCreate, WfHeadcountUpdate,
    WfSuccessionCreate, WfSuccessionUpdate,
    WfReportCreate,
)

SORTABLE_PLANS = {
    "title": WfPlan.title,
    "plan_year": WfPlan.plan_year,
    "status": WfPlan.status,
    "budget": WfPlan.budget,
    "created_at": WfPlan.created_at,
    "updated_at": WfPlan.updated_at,
}

SORTABLE_HEADCOUNT = {
    "fiscal_year": WfHeadcount.fiscal_year,
    "approved_positions": WfHeadcount.approved_positions,
    "filled_positions": WfHeadcount.filled_positions,
    "created_at": WfHeadcount.created_at,
}

SORTABLE_SUCCESSION = {
    "readiness_level": WfSuccession.readiness_level,
    "risk_level": WfSuccession.risk_level,
    "review_date": WfSuccession.review_date,
    "created_at": WfSuccession.created_at,
}

SORTABLE_REPORTS = {
    "report_name": WfReport.report_name,
    "report_type": WfReport.report_type,
    "generated_at": WfReport.generated_at,
}


# ── Helpers ──────────────────────────────────────────────────────────────

def _apply_pagination(query, page, per_page, sortable_map, sort_by, sort_order):
    per_page = min(per_page, 100)
    total = query.count()
    sort_col = sortable_map.get(sort_by, list(sortable_map.values())[0])
    sort_fn = desc if sort_order == "desc" else asc
    items = query.order_by(sort_fn(sort_col)).offset((page - 1) * per_page).limit(per_page).all()
    return total, items


def _org_filter(query, model, org_id):
    return query.filter(model.organization_id == org_id, model.deleted_at.is_(None))


# ════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ════════════════════════════════════════════════════════════════════════════

def get_dashboard(db: Session, org_id: int) -> dict:
    plans = db.query(WfPlan).filter(WfPlan.organization_id == org_id, WfPlan.deleted_at.is_(None)).all()
    headcounts = db.query(WfHeadcount).filter(WfHeadcount.organization_id == org_id, WfHeadcount.deleted_at.is_(None)).all()
    successions = db.query(WfSuccession).filter(WfSuccession.organization_id == org_id, WfSuccession.deleted_at.is_(None)).all()

    total_plans = len(plans)
    active_plans = sum(1 for p in plans if p.status in ("active", "approved"))
    total_target = sum(p.target_headcount or 0 for p in plans)
    total_current = sum(p.current_headcount or 0 for p in plans)
    total_budget = float(sum(p.budget or 0 for p in plans))
    total_approved = sum(h.approved_positions or 0 for h in headcounts)
    total_filled = sum(h.filled_positions or 0 for h in headcounts)
    total_vacant = sum(h.vacant_positions or 0 for h in headcounts)
    total_planned_hires = sum(h.planned_hires or 0 for h in headcounts)
    total_projected_cost = float(sum(h.projected_cost or 0 for h in headcounts))
    succession_count = len(successions)
    high_risk = sum(1 for s in successions if s.risk_level == "high")
    ready = sum(1 for s in successions if s.readiness_level == "ready")

    dept_ids = set()
    for p in plans:
        if p.department_id:
            dept_ids.add(p.department_id)
    for h in headcounts:
        if h.department_id:
            dept_ids.add(h.department_id)

    dept_map = {}
    if dept_ids:
        depts = db.query(Department).filter(Department.id.in_(dept_ids)).all()
        dept_map = {d.id: d.name for d in depts}

    dept_breakdown = []
    for pid in dept_ids:
        dept_name = dept_map.get(pid, f"Dept #{pid}")
        p_count = sum(1 for p in plans if p.department_id == pid)
        h_count = sum(h.approved_positions or 0 for h in headcounts if h.department_id == pid)
        dept_breakdown.append({"department": dept_name, "plans": p_count, "positions": h_count})

    recent_plans = []
    for p in sorted(plans, key=lambda x: x.created_at or datetime.min, reverse=True)[:5]:
        recent_plans.append({
            "id": p.id,
            "title": p.title,
            "status": p.status,
            "budget": float(p.budget or 0),
            "plan_year": p.plan_year,
        })

    headcount_by_dept = []
    dept_group = {}
    for h in headcounts:
        did = h.department_id or 0
        if did not in dept_group:
            dept_group[did] = {"approved": 0, "filled": 0, "vacant": 0, "planned": 0}
        dept_group[did]["approved"] += h.approved_positions or 0
        dept_group[did]["filled"] += h.filled_positions or 0
        dept_group[did]["vacant"] += h.vacant_positions or 0
        dept_group[did]["planned"] += h.planned_hires or 0
    for did, vals in dept_group.items():
        if did:
            dept_name = dept_map.get(did, f"Dept #{did}")
        else:
            dept_name = "Unassigned"
        headcount_by_dept.append({"department": dept_name, **vals})

    return {
        "total_plans": total_plans,
        "active_plans": active_plans,
        "total_headcount_target": total_target,
        "total_current_headcount": total_current,
        "total_budget": total_budget,
        "total_approved_positions": total_approved,
        "total_filled_positions": total_filled,
        "total_vacant_positions": total_vacant,
        "total_planned_hires": total_planned_hires,
        "total_projected_cost": total_projected_cost,
        "succession_count": succession_count,
        "high_risk_count": high_risk,
        "ready_successors": ready,
        "department_breakdown": dept_breakdown,
        "recent_plans": recent_plans,
        "headcount_by_dept": headcount_by_dept,
    }


# ════════════════════════════════════════════════════════════════════════════
# PLANS CRUD
# ════════════════════════════════════════════════════════════════════════════

def list_plans(db: Session, org_id: int, page: int = 1, per_page: int = 20,
               search: Optional[str] = None, status: Optional[str] = None,
               department_id: Optional[int] = None, plan_year: Optional[int] = None,
               sort_by: str = "created_at", sort_order: str = "desc") -> dict:
    query = db.query(WfPlan).options(joinedload(WfPlan.owner))
    query = _org_filter(query, WfPlan, org_id)

    if search:
        like = f"%{search}%"
        query = query.filter(WfPlan.title.ilike(like))
    if status:
        query = query.filter(WfPlan.status == status)
    if department_id:
        query = query.filter(WfPlan.department_id == department_id)
    if plan_year:
        query = query.filter(WfPlan.plan_year == plan_year)

    total, items = _apply_pagination(query, page, per_page, SORTABLE_PLANS, sort_by, sort_order)
    result = []
    for p in items:
        d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
        d["department_name"] = None
        d["owner_name"] = p.owner.full_name if p.owner else None
        if p.department_id:
            dept = db.query(Department.name).filter(Department.id == p.department_id).scalar()
            d["department_name"] = dept
        result.append(d)
    return {"total": total, "page": page, "per_page": per_page, "items": result}


def get_plan(db: Session, org_id: int, plan_id: int) -> WfPlan:
    plan = db.query(WfPlan).options(joinedload(WfPlan.owner)).filter(
        WfPlan.id == plan_id, WfPlan.organization_id == org_id,
        WfPlan.deleted_at.is_(None)
    ).first()
    if not plan:
        raise NotFoundException("Workforce plan", plan_id)
    return plan


def create_plan(db: Session, org_id: int, data: WfPlanCreate, user_id: int) -> WfPlan:
    if data.status and data.status not in ("draft", "active", "approved", "on_hold", "completed", "cancelled"):
        raise BadRequestException(f"Invalid status: {data.status}")
    plan = WfPlan(
        organization_id=org_id,
        title=data.title,
        description=data.description,
        plan_year=data.plan_year,
        status=data.status or "draft",
        department_id=data.department_id,
        owner_id=data.owner_id,
        budget=data.budget,
        target_headcount=data.target_headcount,
        current_headcount=data.current_headcount,
        created_by=user_id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def update_plan(db: Session, org_id: int, plan_id: int, data: WfPlanUpdate, user_id: int) -> WfPlan:
    plan = get_plan(db, org_id, plan_id)
    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in ("draft", "active", "approved", "on_hold", "completed", "cancelled"):
        raise BadRequestException(f"Invalid status: {update_data['status']}")
    for field, value in update_data.items():
        setattr(plan, field, value)
    plan.updated_by = user_id
    db.commit()
    db.refresh(plan)
    return plan


def delete_plan(db: Session, org_id: int, plan_id: int) -> None:
    plan = get_plan(db, org_id, plan_id)
    plan.deleted_at = datetime.utcnow()
    db.commit()


# ════════════════════════════════════════════════════════════════════════════
# HEADCOUNT CRUD
# ════════════════════════════════════════════════════════════════════════════

def list_headcounts(db: Session, org_id: int, page: int = 1, per_page: int = 20,
                    department_id: Optional[int] = None, fiscal_year: Optional[int] = None,
                    sort_by: str = "fiscal_year", sort_order: str = "desc") -> dict:
    query = db.query(WfHeadcount).options(joinedload(WfHeadcount.department))
    query = _org_filter(query, WfHeadcount, org_id)

    if department_id:
        query = query.filter(WfHeadcount.department_id == department_id)
    if fiscal_year:
        query = query.filter(WfHeadcount.fiscal_year == fiscal_year)

    total, items = _apply_pagination(query, page, per_page, SORTABLE_HEADCOUNT, sort_by, sort_order)
    result = []
    for h in items:
        d = {c.name: getattr(h, c.name) for c in h.__table__.columns}
        d["department_name"] = h.department.name if h.department else None
        result.append(d)
    return {"total": total, "page": page, "per_page": per_page, "items": result}


def get_headcount(db: Session, org_id: int, hc_id: int) -> WfHeadcount:
    hc = db.query(WfHeadcount).filter(
        WfHeadcount.id == hc_id, WfHeadcount.organization_id == org_id,
        WfHeadcount.deleted_at.is_(None)
    ).first()
    if not hc:
        raise NotFoundException("Headcount record", hc_id)
    return hc


def create_headcount(db: Session, org_id: int, data: WfHeadcountCreate, user_id: int) -> WfHeadcount:
    hc = WfHeadcount(
        organization_id=org_id,
        department_id=data.department_id,
        fiscal_year=data.fiscal_year,
        approved_positions=data.approved_positions,
        filled_positions=data.filled_positions,
        vacant_positions=data.vacant_positions,
        planned_hires=data.planned_hires,
        projected_cost=data.projected_cost,
        created_by=user_id,
    )
    db.add(hc)
    db.commit()
    db.refresh(hc)
    return hc


def update_headcount(db: Session, org_id: int, hc_id: int, data: WfHeadcountUpdate, user_id: int) -> WfHeadcount:
    hc = get_headcount(db, org_id, hc_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(hc, field, value)
    hc.updated_by = user_id
    db.commit()
    db.refresh(hc)
    return hc


def delete_headcount(db: Session, org_id: int, hc_id: int) -> None:
    hc = get_headcount(db, org_id, hc_id)
    hc.deleted_at = datetime.utcnow()
    db.commit()


# ════════════════════════════════════════════════════════════════════════════
# SUCCESSION CRUD
# ════════════════════════════════════════════════════════════════════════════

def list_successions(db: Session, org_id: int, page: int = 1, per_page: int = 20,
                     readiness_level: Optional[str] = None, risk_level: Optional[str] = None,
                     employee_id: Optional[int] = None,
                     sort_by: str = "created_at", sort_order: str = "desc") -> dict:
    query = db.query(WfSuccession).options(
        joinedload(WfSuccession.employee), joinedload(WfSuccession.successor)
    )
    query = _org_filter(query, WfSuccession, org_id)

    if readiness_level:
        query = query.filter(WfSuccession.readiness_level == readiness_level)
    if risk_level:
        query = query.filter(WfSuccession.risk_level == risk_level)
    if employee_id:
        query = query.filter(WfSuccession.employee_id == employee_id)

    total, items = _apply_pagination(query, page, per_page, SORTABLE_SUCCESSION, sort_by, sort_order)
    result = []
    for s in items:
        d = {c.name: getattr(s, c.name) for c in s.__table__.columns}
        d["employee_name"] = s.employee.full_name if s.employee else None
        d["successor_name"] = s.successor.full_name if s.successor else None
        result.append(d)
    return {"total": total, "page": page, "per_page": per_page, "items": result}


def get_succession(db: Session, org_id: int, succ_id: int) -> WfSuccession:
    succ = db.query(WfSuccession).filter(
        WfSuccession.id == succ_id, WfSuccession.organization_id == org_id,
        WfSuccession.deleted_at.is_(None)
    ).first()
    if not succ:
        raise NotFoundException("Succession record", succ_id)
    return succ


def create_succession(db: Session, org_id: int, data: WfSuccessionCreate, user_id: int) -> WfSuccession:
    if data.readiness_level and data.readiness_level not in ("not_ready", "moderately_ready", "ready", "fully_ready"):
        raise BadRequestException(f"Invalid readiness level: {data.readiness_level}")
    if data.risk_level and data.risk_level not in ("low", "medium", "high", "critical"):
        raise BadRequestException(f"Invalid risk level: {data.risk_level}")
    succ = WfSuccession(
        organization_id=org_id,
        employee_id=data.employee_id,
        successor_employee_id=data.successor_employee_id,
        readiness_level=data.readiness_level or "not_ready",
        risk_level=data.risk_level or "medium",
        target_position=data.target_position,
        review_date=data.review_date,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(succ)
    db.commit()
    db.refresh(succ)
    return succ


def update_succession(db: Session, org_id: int, succ_id: int, data: WfSuccessionUpdate, user_id: int) -> WfSuccession:
    succ = get_succession(db, org_id, succ_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(succ, field, value)
    succ.updated_by = user_id
    db.commit()
    db.refresh(succ)
    return succ


def delete_succession(db: Session, org_id: int, succ_id: int) -> None:
    succ = get_succession(db, org_id, succ_id)
    succ.deleted_at = datetime.utcnow()
    db.commit()


# ════════════════════════════════════════════════════════════════════════════
# REPORTS
# ════════════════════════════════════════════════════════════════════════════

def list_reports(db: Session, org_id: int, page: int = 1, per_page: int = 20,
                 report_type: Optional[str] = None,
                 sort_by: str = "generated_at", sort_order: str = "desc") -> dict:
    query = db.query(WfReport).filter(
        WfReport.organization_id == org_id
    )
    if report_type:
        query = query.filter(WfReport.report_type == report_type)

    total, items = _apply_pagination(query, page, per_page, SORTABLE_REPORTS, sort_by, sort_order)
    result = []
    for r in items:
        d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
        if r.generated_by:
            emp = db.query(Employee).filter(Employee.id == r.generated_by).first()
            d["generated_by_name"] = emp.full_name if emp else None
        result.append(d)
    return {"total": total, "page": page, "per_page": per_page, "items": result}


def create_report(db: Session, org_id: int, data: WfReportCreate, user_id: int) -> WfReport:
    report = WfReport(
        organization_id=org_id,
        report_name=data.report_name,
        report_type=data.report_type,
        generated_by=user_id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def generate_report_data(db: Session, org_id: int, report_type: str) -> list[dict]:
    if report_type == "headcount_summary":
        rows = db.query(WfHeadcount).filter(
            WfHeadcount.organization_id == org_id, WfHeadcount.deleted_at.is_(None)
        ).all()
        return [
            {
                "department_id": r.department_id,
                "fiscal_year": r.fiscal_year,
                "approved_positions": r.approved_positions,
                "filled_positions": r.filled_positions,
                "vacant_positions": r.vacant_positions,
                "planned_hires": r.planned_hires,
                "projected_cost": float(r.projected_cost or 0),
            }
            for r in rows
        ]
    elif report_type == "succession_pipeline":
        rows = db.query(WfSuccession).options(
            joinedload(WfSuccession.employee), joinedload(WfSuccession.successor)
        ).filter(
            WfSuccession.organization_id == org_id, WfSuccession.deleted_at.is_(None)
        ).all()
        return [
            {
                "employee_name": r.employee.full_name if r.employee else None,
                "successor_name": r.successor.full_name if r.successor else None,
                "readiness_level": r.readiness_level,
                "risk_level": r.risk_level,
                "target_position": r.target_position,
            }
            for r in rows
        ]
    else:
        rows = db.query(WfPlan).filter(
            WfPlan.organization_id == org_id, WfPlan.deleted_at.is_(None)
        ).all()
        return [
            {
                "title": r.title,
                "plan_year": r.plan_year,
                "status": r.status,
                "budget": float(r.budget or 0),
                "target_headcount": r.target_headcount,
                "current_headcount": r.current_headcount,
            }
            for r in rows
        ]
