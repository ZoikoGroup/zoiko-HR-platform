"""Hooks the rest of the platform calls into the documents module. Each one is safe to call and never raises: documents
setup must not break organization registration or employee creation.
"""
import logging

from sqlalchemy.orm import Session

logger = logging.getLogger("zoiko.documents")


def on_organization_created(db: Session, organization_id: int) -> None:
    """System categories and ACTIVE system automation rules for a brand-new organization (decision Q10)."""
    try:
        from app.modules.hr.documents.automation.seeds import seed_org
        from app.modules.hr.documents.category_service import seed_org_categories
        seed_org_categories(db, organization_id)
        seed_org(db, organization_id, status="active")
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("documents setup failed for organization %s", organization_id)


def on_employee_created(db: Session, employee, source: str = "manual") -> None:
    """Emit employee.created (ids only). The onboarding-checklist rule reacts to it."""
    try:
        from app.modules.hr.documents.automation import events as ev
        org = employee.organization_id
        if org is None:
            return
        emp_type = getattr(getattr(employee, "employment_type", None), "value", getattr(employee, "employment_type", None))
        ev.emit(db, org, ev.EmployeeCreated(
            employee_id=employee.id, department_id=getattr(employee, "department_id", None),
            designation_id=getattr(employee, "designation_id", None), employment_type=str(emp_type) if emp_type else None,
            joining_date=getattr(employee, "date_of_joining", None), source=source))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("employee.created could not be emitted for employee %s", getattr(employee, "id", "?"))


def on_employee_exited(db: Session, employee, *, exit_date=None, exit_type=None, last_working_day=None) -> None:
    """Lock immediately (ZHR-DOCS-ARCH-001 §13.1): open document tasks are cancelled and review locks the person held are
    released. This does not depend on any automation rule being active. The person's files stay; the offboarding job
    archives them after the organization's lock period. employee.exited is emitted for custom rules."""
    try:
        from app.modules.hr.documents import audit_service
        from app.modules.hr.documents.automation import events as ev, tasks as task_service
        org = employee.organization_id
        if org is None:
            return
        cancelled = task_service.cancel_for_employee(db, org, employee.id, "exited")
        released = _release_locks_of(db, org, employee.id)
        audit_service.record(db, org_id=org, actor=None, actor_type="system", action="employee_exited", target_type="employee",
                             target_id=employee.id, employee_id=employee.id,
                             after={"tasks_cancelled": cancelled, "locks_released": released,
                                    "exit_date": str(exit_date) if exit_date else None})
        ev.emit(db, org, ev.EmployeeExited(employee_id=employee.id, exit_date=exit_date, exit_type=str(exit_type) if exit_type else None,
                                           last_working_day=last_working_day))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("documents exit handling failed for employee %s", getattr(employee, "id", "?"))


def on_employee_role_changed(db: Session, employee, *, from_role=None, to_role=None, from_department_id=None,
                             from_designation_id=None, changed_by=None) -> None:
    """Role, department or designation changed. Review locks are released if the person can no longer review; the
    `sys.role_change_reassign` rule then re-checks which documents they must provide."""
    try:
        from app.modules.hr.documents.automation import events as ev
        from app.modules.hr.documents.permissions import ADMINS
        org = employee.organization_id
        if org is None:
            return
        role = lambda r: str(getattr(r, "value", r) or "").lower() or None
        if role(to_role) and role(to_role) not in ADMINS:
            _release_locks_of(db, org, employee.id)
        ev.emit(db, org, ev.EmployeeRoleChanged(
            employee_id=employee.id, from_role=role(from_role), to_role=role(to_role) or role(getattr(employee, "role", None)),
            from_department_id=from_department_id, to_department_id=getattr(employee, "department_id", None),
            from_designation_id=from_designation_id, to_designation_id=getattr(employee, "designation_id", None),
            changed_by=changed_by))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("employee.role_changed could not be handled for employee %s", getattr(employee, "id", "?"))


def _release_locks_of(db: Session, organization_id: int, employee_id: int) -> int:
    from app.modules.hr.models import HrDocument
    docs = (db.query(HrDocument).filter(HrDocument.organization_id == organization_id, HrDocument.review_locked_by == employee_id)
            .all())
    for d in docs:
        d.review_locked_by, d.review_locked_until = None, None
    return len(docs)
