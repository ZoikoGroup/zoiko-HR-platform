"""Exit cases: the state machine and every rule of the offboarding module.

submitted ──approve──▶ approved ──last working day──▶ exited ──close──▶ closed
    │  └─reject──▶ rejected     │  └─withdrawal agreed──▶ withdrawn
    └─withdraw──▶ withdrawn      └─cancel (HR exits)──▶ cancelled

The person stays an active employee until the last working day. On that day finalize_exit() (nightly job, or at once
when the day has already come) closes the account in one go: status, sign-in, sessions, seat, reportees, the lifecycle
record and the documents module's exit handling. HR can stop access earlier ("stop access now") without ending the case.
"""
import calendar
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException, ZoikoException
from app.modules.employee.models import Employee, EmployeeStatus
from app.modules.hr.offboarding import settings as S
from app.modules.hr.offboarding.models import (EXIT_TYPES, NOTICE_HANDLING, OPEN_STATUSES, OffboardingActivity,
                                               OffboardingAssetReturn, OffboardingCase, OffboardingDocument,
                                               OffboardingInterview, OffboardingSettlement, OffboardingTask)

logger = logging.getLogger("zoiko.offboarding")

HR_ROLES = ("super_admin", "admin", "hr_admin")
EXIT_TYPE_LABELS = {"resignation": "Resignation", "termination": "Termination", "end_of_contract": "End of contract",
                    "mutual_separation": "Mutual separation", "retirement": "Retirement", "death_in_service": "Death in service"}
NOTICE_LABELS = {"serve": "Serving notice", "waive": "Notice waived", "pay_in_lieu": "Pay in lieu of notice",
                 "garden_leave": "Garden leave"}
ROLE_LABELS = {"hr": "HR", "manager": "Manager", "it": "IT", "finance": "Finance", "admin": "Admin", "employee": "Employee"}


class OffboardingError(ZoikoException):
    def __init__(self, message: str, code: str = "OFFBOARDING_CONFLICT", status_code: int = 409, details=None):
        super().__init__(status_code=status_code, error_code=code, message=message)
        self.details = details


def today() -> date:
    """Today's date (a function so tests can move the clock)."""
    return date.today()


def role_of(user) -> str:
    r = getattr(user, "role", None)
    return str(getattr(r, "value", r) or "").lower()


def is_hr(user) -> bool:
    return role_of(user) in HR_ROLES


def require_hr(user) -> None:
    if not is_hr(user):
        raise ForbiddenException("Only HR and organisation admins can do this.")


def name_of(emp) -> str:
    if emp is None:
        return ""
    return f"{emp.first_name or ''} {emp.last_name or ''}".strip() or (emp.email or "")


def _employee(db: Session, org_id: int, employee_id: int) -> Employee:
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.organization_id == org_id).first()
    if emp is None:
        raise NotFoundException("Employee", employee_id)
    return emp


def get_case(db: Session, org_id: int, case_id: int) -> OffboardingCase:
    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id, OffboardingCase.organization_id == org_id).first()
    if case is None:
        raise NotFoundException("Exit case", case_id)
    return case


def open_case_of(db: Session, org_id: int, employee_id: int) -> Optional[OffboardingCase]:
    return (db.query(OffboardingCase)
            .filter(OffboardingCase.organization_id == org_id, OffboardingCase.employee_id == employee_id,
                    OffboardingCase.status.in_(OPEN_STATUSES))
            .order_by(OffboardingCase.id.desc()).first())


def log(db: Session, case: OffboardingCase, actor_id: Optional[int], action: str, message: str, hr_only: bool = False) -> None:
    db.add(OffboardingActivity(organization_id=case.organization_id, case_id=case.id, actor_id=actor_id, action=action,
                               message=message[:500], hr_only=hr_only))


def _audit(db: Session, actor, case: OffboardingCase, action: str, details: Optional[dict] = None) -> None:
    try:
        from app.modules.super_admin import activity_service
        emp = db.get(Employee, case.employee_id)
        activity_service.record_activity(db, action_type=action, actor=actor, organization_id=case.organization_id,
                                         target_name=name_of(emp), target_code=case.case_number, entity_type="OffboardingCase",
                                         entity_id=case.id, details=details, commit=False)
    except Exception:
        logger.exception("offboarding audit entry failed (case %s)", case.id)


# ── notice ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def _add_business_days(start: date, n: int) -> date:
    d = start
    while n > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def _add_months(start: date, n: int) -> date:
    m = start.month - 1 + n
    y = start.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(start.day, calendar.monthrange(y, m)[1]))


def notice_for_employee(db: Session, emp: Employee, start: Optional[date] = None) -> dict:
    """The notice the person must give, from the company profile's notice rules (the person's employee type and whether
    they are still on probation), else the offboarding default. Returns days (calendar), end date and a label."""
    start = start or today()
    value, unit = None, None
    try:
        from app.modules.hr import company_profile as CP
        profile = CP.get_profile(db, emp.organization_id)
        etype = getattr(emp.employment_type, "value", emp.employment_type)
        slug = emp.worker_category or etype
        stages = CP.notice_for(profile, slug)
        on_probation = etype == "probation"
        picked = stages.get("during" if on_probation else "after") or stages.get("after") or stages.get("during")
        if picked:
            value, unit = int(picked[0]), picked[1]
    except Exception:
        logger.exception("notice rules could not be read (org %s)", emp.organization_id)
    if value is None:
        value, unit = int(S.get_settings(db, emp.organization_id)["default_notice_days"]), "calendar_days"
    if unit == "business_days":
        end = _add_business_days(start, value)
    elif unit == "weeks":
        end = start + timedelta(weeks=value)
    elif unit == "months":
        end = _add_months(start, value)
    else:
        end = start + timedelta(days=value)
    unit_label = {"calendar_days": "days", "business_days": "working days", "weeks": "weeks", "months": "months"}.get(unit, "days")
    return {"value": value, "unit": unit, "label": f"{value} {unit_label}", "days": (end - start).days, "end_date": end}


# ── serialisation ────────────────────────────────────────────────────────────────────────────────────────────────────

def _progress(db: Session, case: OffboardingCase) -> dict:
    tasks = db.query(OffboardingTask.status, OffboardingTask.mandatory).filter(OffboardingTask.case_id == case.id,
                                                                              OffboardingTask.status != "cancelled").all()
    assets = db.query(OffboardingAssetReturn.status).filter(OffboardingAssetReturn.case_id == case.id).all()
    done = sum(1 for s, _ in tasks if s in ("done", "exception"))
    return {"tasks_total": len(tasks), "tasks_done": done,
            "mandatory_open": sum(1 for s, m in tasks if m and s == "open"),
            "assets_total": len(assets), "assets_pending": sum(1 for (s,) in assets if s == "pending")}


def display_status(case: OffboardingCase) -> str:
    if case.status == "approved":
        if case.withdrawal_requested_at:
            return "withdrawal_requested"
        if case.notice_handling == "garden_leave":
            return "garden_leave"
        return "serving_notice"
    return case.status


def case_out(db: Session, case: OffboardingCase, view: str = "hr", people: Optional[dict] = None) -> dict:
    """view: hr (everything), manager (no HR notes), employee (the person's own case: no HR notes, no internal notes)."""
    people = people if people is not None else {}

    def person(pid):
        if not pid:
            return None
        if pid not in people:
            people[pid] = db.get(Employee, pid)
        p = people[pid]
        return {"id": p.id, "name": name_of(p), "employee_code": p.employee_code} if p else None
    emp = people.get(case.employee_id) or db.get(Employee, case.employee_id)
    people[case.employee_id] = emp
    dept = getattr(getattr(emp, "department", None), "name", None)
    desg = getattr(getattr(emp, "designation", None), "name", None) or getattr(getattr(emp, "designation", None), "title", None)
    days_left = (case.last_working_day - today()).days if case.last_working_day else None
    out = {
        "id": case.id, "case_number": case.case_number, "status": case.status, "display_status": display_status(case),
        "exit_type": case.exit_type, "exit_type_label": EXIT_TYPE_LABELS.get(case.exit_type, case.exit_type),
        "source": case.source, "reason_category": case.reason_category, "reason": case.reason,
        "employee": {"id": emp.id, "name": name_of(emp), "employee_code": emp.employee_code, "email": emp.email,
                     "job_title": emp.job_title, "department": dept, "designation": desg,
                     "date_of_joining": emp.date_of_joining, "manager": person(emp.reporting_manager_id),
                     "is_active": bool(emp.is_active)} if emp else None,
        "resignation_date": case.resignation_date, "requested_last_day": case.requested_last_day,
        "notice_days": case.notice_days, "notice_end_date": case.notice_end_date,
        "notice_handling": case.notice_handling, "notice_handling_label": NOTICE_LABELS.get(case.notice_handling),
        "last_working_day": case.last_working_day, "days_left": days_left,
        "decided_by": person(case.decided_by), "decided_at": case.decided_at, "decision_note": case.decision_note,
        "withdrawal_requested_at": case.withdrawal_requested_at, "withdrawal_reason": case.withdrawal_reason,
        "access_revoked_at": case.access_revoked_at, "exited_at": case.exited_at, "closed_at": case.closed_at,
        "created_at": case.created_at, "progress": _progress(db, case),
    }
    if view in ("hr", "manager"):
        out.update({"requested_by": person(case.requested_by), "reportees_to": person(case.reportees_to_id),
                    "rehire_eligible": case.rehire_eligible})
    if view == "hr":
        out.update({"hr_notes": case.hr_notes, "rehire_notes": case.rehire_notes, "closed_by": person(case.closed_by)})
    return out


def _next_number(db: Session, org_id: int) -> str:
    year = today().year
    n = db.query(func.count(OffboardingCase.id)).filter(OffboardingCase.organization_id == org_id).scalar() or 0
    while True:
        n += 1
        num = f"EXT-{year}-{n:04d}"
        if not db.query(OffboardingCase.id).filter(OffboardingCase.organization_id == org_id,
                                                   OffboardingCase.case_number == num).first():
            return num


# ── notifications ────────────────────────────────────────────────────────────────────────────────────────────────────

def _notify(db: Session, org_id: int, ids, event: str, link: str, *, date_=None, title=None) -> None:
    ids = [i for i in (ids if isinstance(ids, (list, tuple, set)) else [ids]) if i]
    if not ids:
        return
    from app.modules.hr.hr_notifications import notify_employee
    notify_employee(db, org_id, list(set(ids)), event, link=link, date=date_, title=title, commit=False)


def _email(db: Session, org_id: int, emp: Optional[Employee], **ctx) -> None:
    if emp is None or not (emp.email or emp.personal_email):
        return
    try:
        from app.services.email_service import send_offboarding_email
        send_offboarding_email(ctx.pop("to", None) or emp.email, recipient_name=name_of(emp), db=db,
                               organization_id=org_id, **ctx)
    except Exception:
        logger.exception("offboarding e-mail failed (org %s)", org_id)


def _hr_people(db: Session, org_id: int) -> list:
    rows = db.query(Employee).filter(Employee.organization_id == org_id, Employee.is_active.is_(True)).all()
    return [e for e in rows if role_of(e) in ("admin", "hr_admin")]


def _fmt(d) -> str:
    return f"{d.day} {d:%b %Y}" if d else "not set"


# ── creating a case ──────────────────────────────────────────────────────────────────────────────────────────────────

def _validate_reason_category(cat: Optional[str]) -> Optional[str]:
    if cat in (None, ""):
        return None
    if cat not in {c["key"] for c in S.REASON_CATEGORIES}:
        raise BadRequestException("Choose a reason from the list.")
    return cat


def submit_resignation(db: Session, user: Employee, body: dict) -> OffboardingCase:
    """The person resigns from My Exit → Resign."""
    org = user.organization_id
    if open_case_of(db, org, user.id):
        raise OffboardingError("You already have a resignation or exit in progress.", "OFFBOARDING_CASE_EXISTS")
    if not user.is_active:
        raise ForbiddenException("Your account is not active.")
    reason = " ".join(str(body.get("reason") or "").split())
    if not reason:
        raise BadRequestException("Tell us briefly why you are resigning.")
    if len(reason) > 2000:
        raise BadRequestException("The reason can be at most 2000 characters.")
    category = _validate_reason_category(body.get("reason_category"))
    if not category:
        raise BadRequestException("Choose the main reason.")
    start = today()
    notice = notice_for_employee(db, user, start)
    requested = body.get("requested_last_day")
    if requested:
        if isinstance(requested, str):
            try:
                requested = date.fromisoformat(requested)
            except ValueError:
                raise BadRequestException("The last day is not a valid date.")
        if requested < start:
            raise BadRequestException("Your last day cannot be in the past.")
        if requested > start + timedelta(days=365):
            raise BadRequestException("Your last day can be at most a year from today.")
    case = OffboardingCase(organization_id=org, employee_id=user.id, case_number=_next_number(db, org), exit_type="resignation",
                           status="submitted", source="employee", reason_category=category, reason=reason,
                           resignation_date=start, requested_last_day=requested or None, notice_days=notice["days"],
                           notice_end_date=notice["end_date"], notice_handling="serve",
                           last_working_day=requested or notice["end_date"], requested_by=user.id)
    db.add(case)
    db.flush()
    log(db, case, user.id, "submitted", "Resignation submitted" + (f"; asked for a last day of {_fmt(requested)}" if requested else ""))
    cfg = S.get_settings(db, org)
    approvers = [p.id for p in _hr_people(db, org) if p.id != user.id]
    if cfg["approver"] == "manager_or_hr" and user.reporting_manager_id:
        approvers.append(user.reporting_manager_id)
    _notify(db, org, approvers, "offboarding.resignation_submitted", "/zoiko-hr/offboarding/resignations")
    _audit(db, user, case, "offboarding.resignation_submitted")
    db.commit()
    for pid in set(approvers):
        _email(db, org, db.get(Employee, pid), heading="A resignation is waiting for your decision",
               intro=f"{name_of(user)} has resigned. Their notice ends on {_fmt(notice['end_date'])}.",
               rows=[("Employee", name_of(user)), ("Requested last day", _fmt(case.last_working_day))],
               button_url_path="/zoiko-hr/offboarding/resignations", button_label="Review resignation")
    return case


def _parse_date(v, label: str) -> Optional[date]:
    if v in (None, ""):
        return None
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v))
    except ValueError:
        raise BadRequestException(f"{label} is not a valid date.")


def start_exit(db: Session, actor: Employee, body: dict) -> OffboardingCase:
    """HR starts an exit (Offboarding → New exit): any exit type, for anyone in the organisation."""
    require_hr(actor)
    org = actor.organization_id
    emp = _employee(db, org, int(body.get("employee_id") or 0))
    if emp.id == actor.id:
        raise BadRequestException("You cannot start your own exit here. Use My Exit → Resign.")
    if open_case_of(db, org, emp.id):
        raise OffboardingError("This person already has an exit in progress.", "OFFBOARDING_CASE_EXISTS")
    if not emp.is_active:
        raise BadRequestException("This person has already left.")
    exit_type = body.get("exit_type")
    if exit_type not in EXIT_TYPES:
        raise BadRequestException("Choose the type of exit.")
    handling = body.get("notice_handling") or "serve"
    if handling not in NOTICE_HANDLING:
        raise BadRequestException("Choose how the notice is handled.")
    category = _validate_reason_category(body.get("reason_category"))
    reason = (str(body.get("reason") or "").strip() or None)
    if reason and len(reason) > 2000:
        raise BadRequestException("The reason can be at most 2000 characters.")
    notice_date = _parse_date(body.get("notice_date"), "The notice date") or today()
    notice = notice_for_employee(db, emp, notice_date)
    lwd = _parse_date(body.get("last_working_day"), "The last working day")
    if lwd is None:
        lwd = notice["end_date"] if handling in ("serve", "garden_leave") else notice_date
    if lwd < notice_date:
        raise BadRequestException("The last working day cannot be before the notice date.")
    if exit_type == "death_in_service":
        handling = "waive"
    reportees_to = body.get("reportees_to_id")
    if reportees_to:
        target = _employee(db, org, int(reportees_to))
        if target.id == emp.id or not target.is_active:
            raise BadRequestException("Direct reports must move to an active colleague.")
    cfg = S.get_settings(db, org)
    needs_second = bool(cfg["second_approval_for_hr_exits"]) and exit_type != "resignation"
    case = OffboardingCase(organization_id=org, employee_id=emp.id, case_number=_next_number(db, org), exit_type=exit_type,
                           status="submitted", source="hr", reason_category=category, reason=reason,
                           hr_notes=(str(body.get("hr_notes") or "").strip()[:4000] or None),
                           resignation_date=notice_date, notice_days=notice["days"], notice_end_date=notice["end_date"],
                           notice_handling=handling, last_working_day=lwd,
                           reportees_to_id=int(reportees_to) if reportees_to else None, requested_by=actor.id)
    db.add(case)
    db.flush()
    log(db, case, actor.id, "started", f"{EXIT_TYPE_LABELS[exit_type]} started by {name_of(actor)}")
    _audit(db, actor, case, "offboarding.exit_started", {"exit_type": exit_type})
    if body.get("stop_access_now"):
        _stop_access(db, case, actor, emp)
    if needs_second:
        approvers = [p.id for p in _hr_people(db, org) if p.id not in (actor.id, emp.id)]
        _notify(db, org, approvers, "offboarding.approval_needed", f"/zoiko-hr/offboarding/cases/{case.id}")
        db.commit()
        return case
    _approve(db, case, actor, {})
    return case


# ── deciding ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def can_decide(db: Session, case: OffboardingCase, user: Employee) -> bool:
    if user.id == case.employee_id or user.id == case.requested_by and case.source == "hr":
        return False
    if is_hr(user):
        return True
    if case.exit_type != "resignation":
        return False
    emp = db.get(Employee, case.employee_id)
    cfg = S.get_settings(db, case.organization_id)
    return cfg["approver"] == "manager_or_hr" and emp is not None and emp.reporting_manager_id == user.id


def approve(db: Session, case: OffboardingCase, actor: Employee, body: dict) -> OffboardingCase:
    if case.status != "submitted":
        raise OffboardingError("Only a case waiting for a decision can be approved.")
    if not can_decide(db, case, actor):
        if actor.id == case.requested_by and case.source == "hr":
            raise ForbiddenException("Another HR person must approve an exit you started.")
        raise ForbiddenException("You cannot decide on this exit.")
    _approve(db, case, actor, body)
    return case


def _approve(db: Session, case: OffboardingCase, actor: Employee, body: dict) -> None:
    org = case.organization_id
    emp = db.get(Employee, case.employee_id)
    lwd = _parse_date(body.get("last_working_day"), "The last working day")
    if lwd is not None:
        if case.resignation_date and lwd < case.resignation_date:
            raise BadRequestException("The last working day cannot be before the notice date.")
        case.last_working_day = lwd
    handling = body.get("notice_handling")
    if handling:
        if handling not in NOTICE_HANDLING:
            raise BadRequestException("Choose how the notice is handled.")
        case.notice_handling = handling
    if body.get("reportees_to_id"):
        target = _employee(db, org, int(body["reportees_to_id"]))
        if target.id == emp.id or not target.is_active:
            raise BadRequestException("Direct reports must move to an active colleague.")
        case.reportees_to_id = target.id
    case.status = "approved"
    case.decided_by, case.decided_at = actor.id, datetime.utcnow()
    case.decision_note = (str(body.get("note") or "").strip()[:2000] or None)
    log(db, case, actor.id, "approved", f"Approved by {name_of(actor)}; last working day {_fmt(case.last_working_day)}")
    _audit(db, actor, case, "offboarding.approved", {"last_working_day": str(case.last_working_day)})
    db.flush()
    created = create_tasks(db, case)
    from app.modules.hr.offboarding import settlement as settlement_service
    sync_assets(db, case)
    settlement_service.ensure(db, case)
    cfg = S.get_settings(db, org)
    if cfg["interview_auto_send"] and case.exit_type in ("resignation", "end_of_contract", "mutual_separation", "retirement"):
        send_interview(db, case, None, commit=False)
    event = "offboarding.resignation_approved" if case.exit_type == "resignation" else "offboarding.exit_started"
    if case.exit_type != "death_in_service":
        _notify(db, org, emp.id, event, "/employee/ess/exit/status", date_=case.last_working_day)
    assignees = {t.assignee_id for t in created if t.assignee_id and t.assignee_id != emp.id}
    _notify(db, org, list(assignees), "offboarding.tasks_assigned", "/employee/ess/offboarding-tasks")
    db.commit()
    if cfg["auto_issue_acknowledgement"] and case.exit_type == "resignation":
        from app.modules.hr.offboarding import documents as doc_service
        try:
            doc_service.issue(db, case, actor, "resignation_acknowledgement", notify=False)
        except Exception:
            db.rollback()
            logger.exception("resignation acknowledgement could not be issued (case %s)", case.id)
    if case.exit_type != "death_in_service":
        heading = "Your resignation has been accepted" if case.exit_type == "resignation" else "Your exit details"
        _email(db, org, emp, heading=heading,
               intro=f"Your last working day is {_fmt(case.last_working_day)}. My Exit shows your tasks and what happens next.",
               rows=[("Last working day", _fmt(case.last_working_day)),
                     ("Notice", NOTICE_LABELS.get(case.notice_handling, case.notice_handling))],
               button_url_path="/employee/ess/exit/status", button_label="Open My Exit")
    for pid in assignees:
        mine = [t for t in created if t.assignee_id == pid]
        _email(db, org, db.get(Employee, pid), heading="Offboarding tasks assigned to you",
               intro=f"{name_of(emp)} is leaving on {_fmt(case.last_working_day)}. These clearance tasks are yours.",
               rows=[(t.title, f"Due {_fmt(t.due_date)}") for t in mine],
               button_url_path="/employee/ess/offboarding-tasks", button_label="Open my offboarding tasks")
    if case.last_working_day and case.last_working_day < today():
        finalize_exit(db, case, actor)


def reject(db: Session, case: OffboardingCase, actor: Employee, note: str) -> OffboardingCase:
    if case.status != "submitted":
        raise OffboardingError("Only a case waiting for a decision can be rejected.")
    if not can_decide(db, case, actor):
        raise ForbiddenException("You cannot decide on this exit.")
    note = " ".join(str(note or "").split())
    if not note:
        raise BadRequestException("Say why it is not accepted. The employee sees this.")
    case.status = "rejected"
    case.decided_by, case.decided_at, case.decision_note = actor.id, datetime.utcnow(), note[:2000]
    log(db, case, actor.id, "rejected", f"Not accepted by {name_of(actor)}")
    _audit(db, actor, case, "offboarding.rejected")
    _notify(db, case.organization_id, case.employee_id, "offboarding.resignation_rejected", "/employee/ess/exit/resign")
    db.commit()
    return case


def withdraw(db: Session, case: OffboardingCase, user: Employee, reason: str) -> OffboardingCase:
    """The person takes the resignation back: at once while it waits for a decision, as a request once approved."""
    if case.employee_id != user.id or case.exit_type != "resignation":
        raise ForbiddenException("You can only withdraw your own resignation.")
    reason = " ".join(str(reason or "").split())
    if case.status == "submitted":
        case.status = "withdrawn"
        case.withdrawal_reason = reason[:2000] or None
        log(db, case, user.id, "withdrawn", "Resignation withdrawn by the employee")
        _audit(db, user, case, "offboarding.withdrawn")
        db.commit()
        return case
    if case.status != "approved":
        raise OffboardingError("This resignation can no longer be withdrawn.")
    if case.withdrawal_requested_at:
        raise OffboardingError("You already asked to withdraw it. HR will decide.")
    if not reason:
        raise BadRequestException("Tell HR why you want to withdraw.")
    case.withdrawal_requested_at, case.withdrawal_reason = datetime.utcnow(), reason[:2000]
    log(db, case, user.id, "withdrawal_requested", "The employee asked to withdraw the resignation")
    approvers = [p.id for p in _hr_people(db, case.organization_id) if p.id != user.id]
    _notify(db, case.organization_id, approvers, "offboarding.withdrawal_requested", "/zoiko-hr/offboarding/resignations")
    db.commit()
    return case


def _wind_down(db: Session, case: OffboardingCase) -> None:
    db.query(OffboardingTask).filter(OffboardingTask.case_id == case.id, OffboardingTask.status == "open").update(
        {"status": "cancelled"}, synchronize_session=False)
    db.query(OffboardingAssetReturn).filter(OffboardingAssetReturn.case_id == case.id,
                                            OffboardingAssetReturn.status == "pending").delete(synchronize_session=False)
    st = db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == case.id).first()
    if st and st.status != "paid":
        st.status = "not_applicable"
    iv = db.query(OffboardingInterview).filter(OffboardingInterview.case_id == case.id).first()
    if iv and iv.status in ("sent", "draft", "not_sent"):
        iv.status = "declined"


def decide_withdrawal(db: Session, case: OffboardingCase, actor: Employee, accept: bool, note: str = "") -> OffboardingCase:
    require_hr(actor)
    if case.status != "approved" or not case.withdrawal_requested_at:
        raise OffboardingError("There is no withdrawal request to decide.")
    if actor.id == case.employee_id:
        raise ForbiddenException("You cannot decide on your own withdrawal.")
    note = " ".join(str(note or "").split())[:2000]
    if accept:
        case.status = "withdrawn"
        _wind_down(db, case)
        emp = db.get(Employee, case.employee_id)
        if case.access_revoked_at and emp is not None and not emp.is_active:
            emp.is_active = True
            case.access_revoked_at = None
        log(db, case, actor.id, "withdrawal_accepted", f"Withdrawal accepted by {name_of(actor)}")
    else:
        if not note:
            raise BadRequestException("Say why the withdrawal is not accepted. The employee sees this.")
        case.withdrawal_requested_at = None
        log(db, case, actor.id, "withdrawal_declined", f"Withdrawal not accepted by {name_of(actor)}: {note}")
    case.decision_note = note or case.decision_note
    _audit(db, actor, case, "offboarding.withdrawal_" + ("accepted" if accept else "declined"))
    _notify(db, case.organization_id, case.employee_id, "offboarding.withdrawal_decided", "/employee/ess/exit/status")
    db.commit()
    return case


def cancel(db: Session, case: OffboardingCase, actor: Employee, reason: str) -> OffboardingCase:
    require_hr(actor)
    if case.status not in ("submitted", "approved"):
        raise OffboardingError("Only an exit that has not happened yet can be cancelled.")
    if case.exit_type == "resignation" and case.source == "employee":
        raise OffboardingError("A resignation is withdrawn by the employee or rejected, not cancelled.")
    reason = " ".join(str(reason or "").split())
    if not reason:
        raise BadRequestException("Say why the exit is cancelled.")
    case.status = "cancelled"
    _wind_down(db, case)
    emp = db.get(Employee, case.employee_id)
    if case.access_revoked_at and emp is not None and not emp.is_active:
        emp.is_active = True
        case.access_revoked_at = None
    case.decision_note = reason[:2000]
    log(db, case, actor.id, "cancelled", f"Exit cancelled by {name_of(actor)}: {reason}", hr_only=True)
    _audit(db, actor, case, "offboarding.cancelled")
    db.commit()
    return case


def update_case(db: Session, case: OffboardingCase, actor: Employee, body: dict) -> OffboardingCase:
    """Notice & dates, reportees, rehire and HR notes."""
    require_hr(actor)
    if case.status in ("closed", "rejected", "withdrawn", "cancelled"):
        raise OffboardingError("This case is finished and cannot be changed.")
    changes = []
    if "last_working_day" in body and case.status in ("submitted", "approved"):
        lwd = _parse_date(body["last_working_day"], "The last working day")
        if lwd is None:
            raise BadRequestException("The last working day is required.")
        if case.resignation_date and lwd < case.resignation_date:
            raise BadRequestException("The last working day cannot be before the notice date.")
        if lwd != case.last_working_day:
            delta = (lwd - case.last_working_day).days if case.last_working_day else 0
            for t in db.query(OffboardingTask).filter(OffboardingTask.case_id == case.id, OffboardingTask.status == "open"):
                if t.due_date:
                    t.due_date = t.due_date + timedelta(days=delta)
            changes.append(f"last working day {_fmt(case.last_working_day)} → {_fmt(lwd)}")
            case.last_working_day = lwd
    if "notice_handling" in body and body["notice_handling"] != case.notice_handling:
        if body["notice_handling"] not in NOTICE_HANDLING:
            raise BadRequestException("Choose how the notice is handled.")
        changes.append(f"notice: {NOTICE_LABELS[body['notice_handling']]}")
        case.notice_handling = body["notice_handling"]
    if "reportees_to_id" in body:
        rid = body["reportees_to_id"]
        if rid:
            target = _employee(db, case.organization_id, int(rid))
            if target.id == case.employee_id or not target.is_active:
                raise BadRequestException("Direct reports must move to an active colleague.")
            case.reportees_to_id = target.id
        else:
            case.reportees_to_id = None
        changes.append("direct reports' new manager updated")
    if "reason_category" in body:
        case.reason_category = _validate_reason_category(body["reason_category"])
    if "rehire_eligible" in body:
        case.rehire_eligible = None if body["rehire_eligible"] is None else bool(body["rehire_eligible"])
        changes.append("rehire eligibility updated")
    if "rehire_notes" in body:
        case.rehire_notes = (str(body["rehire_notes"] or "").strip()[:2000] or None)
    if "hr_notes" in body:
        case.hr_notes = (str(body["hr_notes"] or "").strip()[:4000] or None)
    if changes:
        log(db, case, actor.id, "updated", f"{name_of(actor)} changed " + "; ".join(changes), hr_only="rehire" in " ".join(changes))
        _audit(db, actor, case, "offboarding.updated", {"changes": changes})
    db.commit()
    if case.status == "approved" and case.last_working_day and case.last_working_day < today():
        finalize_exit(db, case, actor)
    return case


# ── access and the last day ──────────────────────────────────────────────────────────────────────────────────────────

def _stop_access(db: Session, case: OffboardingCase, actor, emp: Employee) -> None:
    from app.core.privacy.sessions import revoke_all_sessions
    emp.is_active = False
    revoke_all_sessions(emp)
    case.access_revoked_at = datetime.utcnow()
    log(db, case, getattr(actor, "id", None), "access_stopped", "Sign-in stopped and every session ended")
    _audit(db, actor, case, "offboarding.access_stopped")


def stop_access(db: Session, case: OffboardingCase, actor: Employee) -> OffboardingCase:
    require_hr(actor)
    if case.status not in ("submitted", "approved"):
        raise OffboardingError("Access can only be stopped for an exit in progress.")
    if case.access_revoked_at:
        raise OffboardingError("Access is already stopped.")
    emp = db.get(Employee, case.employee_id)
    if emp.id == actor.id:
        raise BadRequestException("You cannot stop your own access.")
    _stop_access(db, case, actor, emp)
    db.commit()
    return case


def finalize_exit(db: Session, case: OffboardingCase, actor=None) -> OffboardingCase:
    """The last working day has passed: close the account for good. Safe to run twice."""
    if case.status != "approved":
        return case
    from app.core.privacy.sessions import revoke_all_sessions
    from app.modules.hr.models import EmployeeLifecycle
    emp = db.get(Employee, case.employee_id)
    lwd = case.last_working_day or today()
    emp.status = EmployeeStatus.RESIGNED if case.exit_type == "resignation" else EmployeeStatus.TERMINATED
    emp.is_active = False
    revoke_all_sessions(emp)
    if not case.access_revoked_at:
        case.access_revoked_at = datetime.utcnow()
    new_manager = case.reportees_to_id or emp.reporting_manager_id
    moved = 0
    for r in db.query(Employee).filter(Employee.organization_id == case.organization_id, Employee.reporting_manager_id == emp.id,
                                       Employee.id != emp.id):
        r.reporting_manager_id = new_manager if new_manager != r.id else None
        moved += 1
    db.add(EmployeeLifecycle(employee_id=emp.id, organization_id=case.organization_id,
                             event_type="resignation" if case.exit_type == "resignation" else "exit",
                             event_date=lwd, effective_date=lwd, status="completed", reason=case.reason,
                             new_value={"status": emp.status.value, "exit_type": case.exit_type, "case": case.case_number,
                                        "last_working_date": str(lwd)},
                             initiated_by=case.requested_by, approved_by=case.decided_by))
    case.status = "exited"
    case.exited_at = datetime.utcnow()
    log(db, case, getattr(actor, "id", None), "exited",
        f"Last working day reached: account closed" + (f", {moved} direct report(s) moved" if moved else ""))
    _audit(db, actor, case, "offboarding.exited", {"reportees_moved": moved})
    db.commit()
    from app.modules.hr.documents.hooks import on_employee_exited
    on_employee_exited(db, emp, exit_date=lwd, exit_type=case.exit_type, last_working_day=lwd)
    try:
        from app.modules.hr.offboarding import documents as doc_service
        doc_service.send_link(db, case)
    except Exception:
        db.rollback()
        logger.exception("exit documents link could not be sent (case %s)", case.id)
    return case


def record_immediate_exit(db: Session, emp: Employee, *, exit_type: str, last_working_day: Optional[date] = None,
                          reason: Optional[str] = None, actor=None) -> Optional[OffboardingCase]:
    """The older one-step exits (Employees → resign / exit / deactivate) end the account at once. They still get an exit
    case, already past the last day, so clearance, assets, settlement and documents can be worked in Offboarding.
    Never raises: the exit itself has already happened."""
    try:
        org = emp.organization_id
        if org is None:
            return None
        case = open_case_of(db, org, emp.id)
        if case is not None:
            if case.status == "approved":
                case.last_working_day = last_working_day or today()
                db.commit()
                finalize_exit(db, case, actor)
            return case
        lwd = last_working_day or today()
        etype = exit_type if exit_type in EXIT_TYPES else "termination"
        case = OffboardingCase(organization_id=org, employee_id=emp.id, case_number=_next_number(db, org), exit_type=etype,
                               status="exited", source="legacy", reason=reason, resignation_date=lwd, notice_handling="waive",
                               last_working_day=lwd, requested_by=getattr(actor, "id", None),
                               decided_by=getattr(actor, "id", None), decided_at=datetime.utcnow(),
                               access_revoked_at=datetime.utcnow(), exited_at=datetime.utcnow())
        db.add(case)
        db.flush()
        log(db, case, getattr(actor, "id", None), "exited", f"{EXIT_TYPE_LABELS[etype]} recorded from Employees: account closed")
        create_tasks(db, case)
        sync_assets(db, case)
        from app.modules.hr.offboarding import settlement as settlement_service
        settlement_service.ensure(db, case)
        db.commit()
        return case
    except Exception:
        db.rollback()
        logger.exception("exit case could not be recorded for employee %s", getattr(emp, "id", "?"))
        return None


def close_blockers(db: Session, case: OffboardingCase) -> list:
    out = []
    if case.status != "exited":
        out.append("The last working day has not passed yet." if case.status == "approved" else "Only a case after the exit can be closed.")
    open_mandatory = db.query(OffboardingTask).filter(OffboardingTask.case_id == case.id, OffboardingTask.mandatory.is_(True),
                                                      OffboardingTask.status == "open").count()
    if open_mandatory:
        out.append(f"{open_mandatory} required clearance task(s) are still open.")
    pending_assets = db.query(OffboardingAssetReturn).filter(OffboardingAssetReturn.case_id == case.id,
                                                             OffboardingAssetReturn.status == "pending").count()
    if pending_assets:
        out.append(f"{pending_assets} asset(s) are not returned or written off.")
    if S.get_settings(db, case.organization_id)["close_requires_settlement"]:
        st = db.query(OffboardingSettlement).filter(OffboardingSettlement.case_id == case.id).first()
        if st is not None and st.status not in ("paid", "not_applicable"):
            out.append("The final settlement is not paid or marked not applicable.")
    return out


def close(db: Session, case: OffboardingCase, actor: Employee) -> OffboardingCase:
    require_hr(actor)
    blockers = close_blockers(db, case)
    if blockers:
        raise OffboardingError("The case cannot be closed yet: " + " ".join(blockers), "OFFBOARDING_CLOSE_BLOCKED",
                               details=blockers)
    case.status, case.closed_at, case.closed_by = "closed", datetime.utcnow(), actor.id
    log(db, case, actor.id, "closed", f"Case closed by {name_of(actor)}")
    _audit(db, actor, case, "offboarding.closed")
    db.commit()
    return case


# ── clearance tasks ──────────────────────────────────────────────────────────────────────────────────────────────────

def _assignee_for(db: Session, case: OffboardingCase, role: str, emp: Employee, cfg: dict) -> Optional[int]:
    if role == "employee":
        return emp.id
    if role == "manager":
        return emp.reporting_manager_id
    return (cfg.get("task_assignees") or {}).get(role)


def create_tasks(db: Session, case: OffboardingCase) -> list:
    if db.query(OffboardingTask.id).filter(OffboardingTask.case_id == case.id).first():
        return []
    emp = db.get(Employee, case.employee_id)
    cfg = S.get_settings(db, case.organization_id)
    tpl = S.pick_template(db, case.organization_id, case.exit_type, emp.department_id)
    lwd = case.last_working_day or today()
    out = []
    for i, it in enumerate(tpl.items or []):
        role = it.get("owner_role")
        if case.exit_type == "death_in_service" and role == "employee":
            continue
        t = OffboardingTask(organization_id=case.organization_id, case_id=case.id, title=it["title"],
                            description=it.get("description"), owner_role=role,
                            assignee_id=_assignee_for(db, case, role, emp, cfg), mandatory=bool(it.get("mandatory", True)),
                            due_date=lwd + timedelta(days=int(it.get("due_offset_days") or 0)), sort_order=i)
        db.add(t)
        out.append(t)
    db.flush()
    log(db, case, None, "tasks_created", f"{len(out)} clearance task(s) created from “{tpl.name}”")
    return out


def task_out(db: Session, t: OffboardingTask, people: Optional[dict] = None) -> dict:
    people = people if people is not None else {}

    def person(pid):
        if not pid:
            return None
        if pid not in people:
            people[pid] = db.get(Employee, pid)
        p = people[pid]
        return {"id": p.id, "name": name_of(p)} if p else None
    return {"id": t.id, "case_id": t.case_id, "title": t.title, "description": t.description, "owner_role": t.owner_role,
            "owner_label": ROLE_LABELS.get(t.owner_role, t.owner_role), "assignee": person(t.assignee_id),
            "mandatory": bool(t.mandatory), "due_date": t.due_date, "status": t.status, "note": t.note,
            "exception_reason": t.exception_reason, "completed_by": person(t.completed_by), "completed_at": t.completed_at,
            "overdue": t.status == "open" and t.due_date is not None and t.due_date < today()}


def _task(db: Session, org_id: int, task_id: int) -> OffboardingTask:
    t = db.query(OffboardingTask).filter(OffboardingTask.id == task_id, OffboardingTask.organization_id == org_id).first()
    if t is None:
        raise NotFoundException("Task", task_id)
    return t


def can_work_task(db: Session, t: OffboardingTask, case: OffboardingCase, user: Employee) -> bool:
    if is_hr(user) and user.id != case.employee_id:
        return True
    if t.assignee_id == user.id:
        return True
    if t.owner_role == "employee" and case.employee_id == user.id:
        return True
    return False


def set_task_done(db: Session, user: Employee, task_id: int, done: bool, note: Optional[str] = None) -> OffboardingTask:
    t = _task(db, user.organization_id, task_id)
    case = get_case(db, user.organization_id, t.case_id)
    if not can_work_task(db, t, case, user):
        raise ForbiddenException("This task is not yours.")
    if case.status not in ("approved", "exited"):
        raise OffboardingError("Tasks can only be updated while the exit is in progress.")
    if t.status in ("cancelled",):
        raise OffboardingError("This task was cancelled.")
    if note is not None:
        note = str(note).strip()[:2000] or None
    if done:
        t.status, t.completed_by, t.completed_at = "done", user.id, datetime.utcnow()
        if note is not None:
            t.note = note
        log(db, case, user.id, "task_done", f"“{t.title}” done by {name_of(user)}")
    else:
        if t.status == "exception" and not is_hr(user):
            raise ForbiddenException("Only HR can reopen a task with an exception.")
        t.status, t.completed_by, t.completed_at, t.exception_reason = "open", None, None, None
        log(db, case, user.id, "task_reopened", f"“{t.title}” reopened by {name_of(user)}")
    db.commit()
    return t


def task_exception(db: Session, actor: Employee, task_id: int, reason: str) -> OffboardingTask:
    require_hr(actor)
    t = _task(db, actor.organization_id, task_id)
    case = get_case(db, actor.organization_id, t.case_id)
    reason = " ".join(str(reason or "").split())
    if not reason:
        raise BadRequestException("Say why this task is not needed.")
    t.status, t.exception_reason, t.completed_by, t.completed_at = "exception", reason[:2000], actor.id, datetime.utcnow()
    log(db, case, actor.id, "task_exception", f"“{t.title}” marked not needed: {reason}", hr_only=True)
    db.commit()
    return t


def assign_task(db: Session, actor: Employee, task_id: int, assignee_id: Optional[int], due_date=None) -> OffboardingTask:
    require_hr(actor)
    t = _task(db, actor.organization_id, task_id)
    case = get_case(db, actor.organization_id, t.case_id)
    if assignee_id:
        emp = _employee(db, actor.organization_id, int(assignee_id))
        if not emp.is_active and emp.id != case.employee_id:
            raise BadRequestException("Assign the task to an active colleague.")
        t.assignee_id = emp.id
        _notify(db, actor.organization_id, emp.id, "offboarding.tasks_assigned", "/employee/ess/offboarding-tasks")
    else:
        t.assignee_id = None
    if due_date is not None:
        t.due_date = _parse_date(due_date, "The due date")
    log(db, case, actor.id, "task_assigned", f"“{t.title}” assigned")
    db.commit()
    return t


def add_task(db: Session, actor: Employee, case: OffboardingCase, body: dict) -> OffboardingTask:
    require_hr(actor)
    if case.status not in ("approved", "exited"):
        raise OffboardingError("Tasks can be added once the exit is approved.")
    title = " ".join(str(body.get("title") or "").split())
    if not title:
        raise BadRequestException("Give the task a title.")
    role = body.get("owner_role")
    if role not in ROLE_LABELS:
        raise BadRequestException("Choose who owns the task.")
    emp = db.get(Employee, case.employee_id)
    cfg = S.get_settings(db, case.organization_id)
    assignee = body.get("assignee_id") or _assignee_for(db, case, role, emp, cfg)
    if assignee:
        _employee(db, case.organization_id, int(assignee))
    t = OffboardingTask(organization_id=case.organization_id, case_id=case.id, title=title[:200],
                        description=(str(body.get("description") or "").strip()[:1000] or None), owner_role=role,
                        assignee_id=int(assignee) if assignee else None, mandatory=bool(body.get("mandatory", True)),
                        due_date=_parse_date(body.get("due_date"), "The due date") or case.last_working_day,
                        sort_order=100)
    db.add(t)
    db.flush()
    log(db, case, actor.id, "task_added", f"Task “{t.title}” added")
    if t.assignee_id and t.assignee_id != case.employee_id:
        _notify(db, case.organization_id, t.assignee_id, "offboarding.tasks_assigned", "/employee/ess/offboarding-tasks")
    db.commit()
    return t


# ── assets ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def sync_assets(db: Session, case: OffboardingCase) -> int:
    """Every asset assigned to the leaver gets a return row (once)."""
    from app.modules.hr.models import Asset, AssetStatus
    have = {a for (a,) in db.query(OffboardingAssetReturn.asset_id).filter(OffboardingAssetReturn.case_id == case.id)}
    added = 0
    for a in db.query(Asset).filter(Asset.organization_id == case.organization_id, Asset.employee_id == case.employee_id,
                                    Asset.status == AssetStatus.ASSIGNED):
        if getattr(a, "is_deleted", False) or a.id in have:
            continue
        db.add(OffboardingAssetReturn(organization_id=case.organization_id, case_id=case.id, asset_id=a.id, asset_name=a.name,
                                      asset_tag=a.asset_tag))
        added += 1
    if added:
        db.flush()
        log(db, case, None, "assets_listed", f"{added} assigned asset(s) to recover")
    return added


def asset_out(r: OffboardingAssetReturn, case: Optional[OffboardingCase] = None, emp: Optional[Employee] = None) -> dict:
    out = {"id": r.id, "case_id": r.case_id, "asset_id": r.asset_id, "asset_name": r.asset_name, "asset_tag": r.asset_tag,
           "status": r.status, "condition": r.condition, "note": r.note,
           "recovery_amount": float(r.recovery_amount) if r.recovery_amount is not None else None, "resolved_at": r.resolved_at}
    if case is not None:
        out.update({"case_number": case.case_number, "last_working_day": case.last_working_day})
    if emp is not None:
        out["employee"] = {"id": emp.id, "name": name_of(emp), "employee_code": emp.employee_code}
    return out


def resolve_asset(db: Session, actor: Employee, return_id: int, body: dict) -> OffboardingAssetReturn:
    require_hr(actor)
    from app.modules.hr.models import Asset, AssetCondition, AssetStatus
    r = db.query(OffboardingAssetReturn).filter(OffboardingAssetReturn.id == return_id,
                                                OffboardingAssetReturn.organization_id == actor.organization_id).first()
    if r is None:
        raise NotFoundException("Asset return", return_id)
    case = get_case(db, actor.organization_id, r.case_id)
    if case.status not in ("approved", "exited"):
        raise OffboardingError("Assets can be recorded while the exit is in progress.")
    status = body.get("status")
    if status not in ("returned", "damaged", "lost", "written_off", "pending"):
        raise BadRequestException("Choose what happened to the asset.")
    amount = body.get("recovery_amount")
    if amount not in (None, ""):
        try:
            amount = round(float(amount), 2)
        except (TypeError, ValueError):
            raise BadRequestException("The amount to recover must be a number.")
        if amount < 0:
            raise BadRequestException("The amount to recover cannot be negative.")
    else:
        amount = None
    asset = db.query(Asset).filter(Asset.id == r.asset_id, Asset.organization_id == actor.organization_id).first()
    note = (str(body.get("note") or "").strip()[:1000] or None)
    if status == "pending":
        r.status, r.resolved_at, r.received_by, r.recovery_amount = "pending", None, None, None
    else:
        if asset is not None and asset.employee_id == case.employee_id and asset.status == AssetStatus.ASSIGNED:
            asset.employee_id, asset.assigned_date = None, None
            asset.updated_by = actor.id
            if status == "returned":
                asset.status = AssetStatus.AVAILABLE
                cond = body.get("condition")
                if cond in {c.value for c in AssetCondition}:
                    asset.condition = AssetCondition(cond)
            elif status == "damaged":
                asset.status = AssetStatus.BROKEN
                asset.condition = AssetCondition.DAMAGED
            elif status == "lost":
                asset.status = AssetStatus.LOST
            else:
                asset.status = AssetStatus.RETIRED
        r.status, r.resolved_at, r.received_by = status, datetime.utcnow(), actor.id
        r.condition = body.get("condition") or ("damaged" if status == "damaged" else r.condition)
        r.recovery_amount = amount if status in ("damaged", "lost") else None
    r.note = note
    log(db, case, actor.id, "asset_" + status, f"{r.asset_name or 'Asset'} ({r.asset_tag or '-'}): {status.replace('_', ' ')}")
    db.flush()
    from app.modules.hr.offboarding import settlement as settlement_service
    settlement_service.refresh_computed(db, case)
    db.commit()
    return r


# ── exit interview ───────────────────────────────────────────────────────────────────────────────────────────────────

def send_interview(db: Session, case: OffboardingCase, actor, commit: bool = True) -> OffboardingInterview:
    if actor is not None:
        require_hr(actor)
    if case.status not in ("approved", "exited"):
        raise OffboardingError("The exit interview can be sent once the exit is approved.")
    iv = db.query(OffboardingInterview).filter(OffboardingInterview.case_id == case.id).first()
    if iv and iv.status in ("submitted",):
        raise OffboardingError("The exit interview is already answered.")
    if iv is None:
        iv = OffboardingInterview(organization_id=case.organization_id, case_id=case.id)
        db.add(iv)
    if iv.status in ("not_sent", "declined", None):
        iv.questions = S.get_settings(db, case.organization_id)["interview_questions"]
    iv.status, iv.sent_at = "sent", datetime.utcnow()
    db.flush()
    log(db, case, getattr(actor, "id", None), "interview_sent", "Exit interview sent")
    _notify(db, case.organization_id, case.employee_id, "offboarding.interview_requested", "/employee/ess/exit/interview")
    if commit:
        db.commit()
    return iv


def interview_out(iv: Optional[OffboardingInterview], with_answers: bool = True) -> Optional[dict]:
    if iv is None:
        return None
    out = {"id": iv.id, "case_id": iv.case_id, "status": iv.status, "questions": iv.questions or [], "sent_at": iv.sent_at,
           "submitted_at": iv.submitted_at}
    if with_answers:
        out.update({"answers": iv.answers or {}, "primary_reason": iv.primary_reason, "would_recommend": iv.would_recommend})
    return out


def _check_answers(questions: list, answers: dict, final: bool) -> dict:
    clean = {}
    for q in questions:
        v = (answers or {}).get(q["id"])
        if v in (None, ""):
            if final and q.get("required"):
                raise BadRequestException(f"Answer “{q['text']}”.")
            continue
        if q["type"] == "rating":
            if not isinstance(v, int) or not 1 <= v <= 5:
                raise BadRequestException(f"“{q['text']}” needs a rating from 1 to 5.")
        elif q["type"] == "nps":
            if not isinstance(v, int) or not 0 <= v <= 10:
                raise BadRequestException(f"“{q['text']}” needs a score from 0 to 10.")
        elif q["type"] == "choice":
            if v not in q.get("options", []):
                raise BadRequestException(f"Choose an option for “{q['text']}”.")
        elif q["type"] == "yesno":
            if v not in ("yes", "no", "not_sure"):
                raise BadRequestException(f"Answer “{q['text']}” with yes, no or not sure.")
        else:
            v = str(v).strip()[:4000]
        clean[q["id"]] = v
    return clean


def save_interview(db: Session, user: Employee, answers: dict, submit: bool) -> OffboardingInterview:
    case = open_case_of(db, user.organization_id, user.id)
    if case is None:
        raise NotFoundException("Exit interview")
    iv = db.query(OffboardingInterview).filter(OffboardingInterview.case_id == case.id).first()
    if iv is None or iv.status not in ("sent", "draft"):
        raise OffboardingError("There is no exit interview waiting for your answers.")
    iv.answers = _check_answers(iv.questions or [], answers or {}, submit)
    if submit:
        iv.status, iv.submitted_at = "submitted", datetime.utcnow()
        for q in iv.questions or []:
            v = iv.answers.get(q["id"])
            if q["type"] == "choice" and q["id"] == "q_reason":
                iv.primary_reason = v
            if q["type"] == "nps" and isinstance(v, int):
                iv.would_recommend = v
        if iv.primary_reason is None:
            iv.primary_reason = case.reason_category
        log(db, case, user.id, "interview_submitted", "Exit interview submitted")
    else:
        iv.status = "draft"
    db.commit()
    return iv


# ── lists ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def list_cases(db: Session, org_id: int, *, status=None, exit_type=None, department_id=None, search=None, lwd_from=None,
               lwd_to=None, page: int = 1, per_page: int = 25) -> dict:
    q = db.query(OffboardingCase).join(Employee, Employee.id == OffboardingCase.employee_id).filter(
        OffboardingCase.organization_id == org_id)
    if status == "open":
        q = q.filter(OffboardingCase.status.in_(OPEN_STATUSES))
    elif status == "serving_notice":
        q = q.filter(OffboardingCase.status == "approved")
    elif status:
        q = q.filter(OffboardingCase.status == status)
    if exit_type:
        q = q.filter(OffboardingCase.exit_type == exit_type)
    if department_id:
        q = q.filter(Employee.department_id == int(department_id))
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(Employee.first_name.ilike(term), Employee.last_name.ilike(term), Employee.email.ilike(term),
                         Employee.employee_code.ilike(term), OffboardingCase.case_number.ilike(term)))
    if lwd_from:
        q = q.filter(OffboardingCase.last_working_day >= _parse_date(lwd_from, "From"))
    if lwd_to:
        q = q.filter(OffboardingCase.last_working_day <= _parse_date(lwd_to, "To"))
    total = q.count()
    page, per_page = max(1, int(page)), max(1, min(100, int(per_page)))
    rows = q.order_by(OffboardingCase.created_at.desc(), OffboardingCase.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    people: dict = {}
    return {"items": [case_out(db, c, "hr", people) for c in rows], "total": total, "page": page, "per_page": per_page}


def dashboard(db: Session, org_id: int) -> dict:
    t = today()
    month_start = t.replace(day=1)
    month_end = t.replace(day=calendar.monthrange(t.year, t.month)[1])
    C = OffboardingCase
    base = db.query(C).filter(C.organization_id == org_id)
    open_count = base.filter(C.status.in_(OPEN_STATUSES)).count()
    leaving_month = base.filter(C.status.in_(("approved", "exited", "closed")), C.last_working_day >= month_start,
                                C.last_working_day <= month_end).count()
    awaiting = base.filter(or_(C.status == "submitted", (C.status == "approved") & C.withdrawal_requested_at.isnot(None))).count()
    overdue = (db.query(OffboardingTask).join(C, C.id == OffboardingTask.case_id)
               .filter(OffboardingTask.organization_id == org_id, OffboardingTask.status == "open",
                       OffboardingTask.due_date < t, C.status.in_(("approved", "exited"))).count())
    assets_pending = (db.query(OffboardingAssetReturn).join(C, C.id == OffboardingAssetReturn.case_id)
                      .filter(OffboardingAssetReturn.organization_id == org_id, OffboardingAssetReturn.status == "pending",
                              C.status.in_(("approved", "exited"))).count())
    settlements_pending = (db.query(OffboardingSettlement).join(C, C.id == OffboardingSettlement.case_id)
                           .filter(OffboardingSettlement.organization_id == org_id,
                                   OffboardingSettlement.status.in_(("draft", "approved")),
                                   C.status.in_(("approved", "exited"))).count())
    year_ago = t - timedelta(days=365)
    exits_12m = base.filter(C.status.in_(("exited", "closed")), C.last_working_day >= year_ago).count()
    active = db.query(func.count(Employee.id)).filter(Employee.organization_id == org_id, Employee.is_active.is_(True)).scalar() or 0
    avg_headcount = active + exits_12m / 2
    attrition = round(exits_12m * 100 / avg_headcount, 1) if avg_headcount else 0.0
    upcoming = (base.filter(C.status == "approved", C.last_working_day >= t).order_by(C.last_working_day).limit(8).all())
    people: dict = {}
    by_type = dict(base.with_entities(C.exit_type, func.count(C.id)).filter(C.status.in_(OPEN_STATUSES)).group_by(C.exit_type).all())
    recent = (db.query(OffboardingActivity).filter(OffboardingActivity.organization_id == org_id)
              .order_by(OffboardingActivity.created_at.desc(), OffboardingActivity.id.desc()).limit(10).all())
    case_numbers = dict(db.query(C.id, C.case_number).filter(C.id.in_({a.case_id for a in recent} or {0})).all())
    return {
        "kpis": {"open_exits": open_count, "leaving_this_month": leaving_month, "awaiting_decision": awaiting,
                 "overdue_tasks": overdue, "assets_pending": assets_pending, "settlements_pending": settlements_pending,
                 "attrition_rate": attrition, "exits_last_12_months": exits_12m},
        "open_by_type": [{"exit_type": k, "label": EXIT_TYPE_LABELS.get(k, k), "count": v} for k, v in by_type.items()],
        "upcoming": [case_out(db, c, "hr", people) for c in upcoming],
        "recent_activity": [{"case_id": a.case_id, "case_number": case_numbers.get(a.case_id), "message": a.message,
                             "action": a.action, "created_at": a.created_at} for a in recent],
    }


def activity(db: Session, case: OffboardingCase, hr_view: bool) -> list:
    q = db.query(OffboardingActivity).filter(OffboardingActivity.case_id == case.id)
    if not hr_view:
        q = q.filter(OffboardingActivity.hr_only.is_(False))
    return [{"id": a.id, "action": a.action, "message": a.message, "created_at": a.created_at}
            for a in q.order_by(OffboardingActivity.created_at.desc(), OffboardingActivity.id.desc()).all()]


def task_board(db: Session, org_id: int, *, owner_role=None, overdue_only=False, assignee_id=None) -> list:
    q = (db.query(OffboardingTask, OffboardingCase).join(OffboardingCase, OffboardingCase.id == OffboardingTask.case_id)
         .filter(OffboardingTask.organization_id == org_id, OffboardingTask.status == "open",
                 OffboardingCase.status.in_(("approved", "exited"))))
    if owner_role:
        q = q.filter(OffboardingTask.owner_role == owner_role)
    if overdue_only:
        q = q.filter(OffboardingTask.due_date < today())
    if assignee_id:
        q = q.filter(OffboardingTask.assignee_id == int(assignee_id))
    people: dict = {}
    out = []
    for t, c in q.order_by(OffboardingTask.due_date, OffboardingTask.id).all():
        row = task_out(db, t, people)
        emp = people.get(c.employee_id) or db.get(Employee, c.employee_id)
        people[c.employee_id] = emp
        row["case"] = {"id": c.id, "case_number": c.case_number, "last_working_day": c.last_working_day,
                       "employee": {"id": emp.id, "name": name_of(emp)} if emp else None}
        out.append(row)
    return out


def interview_analytics(db: Session, org_id: int, *, date_from=None, date_to=None, department_id=None) -> dict:
    C = OffboardingCase
    q = (db.query(OffboardingInterview, C, Employee).join(C, C.id == OffboardingInterview.case_id)
         .join(Employee, Employee.id == C.employee_id).filter(OffboardingInterview.organization_id == org_id))
    if date_from:
        q = q.filter(OffboardingInterview.sent_at >= _parse_date(date_from, "From"))
    if date_to:
        q = q.filter(OffboardingInterview.sent_at < _parse_date(date_to, "To") + timedelta(days=1))
    if department_id:
        q = q.filter(Employee.department_id == int(department_id))
    rows = q.order_by(OffboardingInterview.sent_at.desc()).all()
    labels = {c["key"]: c["label"] for c in S.REASON_CATEGORIES}
    reasons, depts, scores, months = {}, {}, [], {}
    items = []
    for iv, c, emp in rows:
        dept = getattr(getattr(emp, "department", None), "name", None) or "No department"
        if iv.status == "submitted":
            key = iv.primary_reason or c.reason_category or "other"
            reasons[key] = reasons.get(key, 0) + 1
            depts[dept] = depts.get(dept, 0) + 1
            if iv.would_recommend is not None:
                scores.append(iv.would_recommend)
            m = (iv.submitted_at or iv.sent_at).strftime("%Y-%m")
            months[m] = months.get(m, 0) + 1
        items.append({"id": iv.id, "case_id": c.id, "case_number": c.case_number, "status": iv.status,
                      "employee": {"id": emp.id, "name": name_of(emp)}, "department": dept,
                      "primary_reason": iv.primary_reason, "primary_reason_label": labels.get(iv.primary_reason),
                      "would_recommend": iv.would_recommend, "sent_at": iv.sent_at, "submitted_at": iv.submitted_at})
    submitted = sum(1 for i in items if i["status"] == "submitted")
    nps = None
    if scores:
        promoters = sum(1 for s in scores if s >= 9)
        detractors = sum(1 for s in scores if s <= 6)
        nps = round((promoters - detractors) * 100 / len(scores))
    return {"items": items, "summary": {"sent": len(items), "submitted": submitted,
                                        "response_rate": round(submitted * 100 / len(items)) if items else 0, "enps": nps},
            "by_reason": sorted([{"key": k, "label": labels.get(k, k), "count": v} for k, v in reasons.items()],
                                key=lambda r: -r["count"]),
            "by_department": sorted([{"label": k, "count": v} for k, v in depts.items()], key=lambda r: -r["count"]),
            "by_month": [{"month": k, "count": months[k]} for k in sorted(months)]}
