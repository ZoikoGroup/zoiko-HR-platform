"""Offboarding nightly run (registered from doc_templates.jobs.register, so only the background leader runs it).

Per organisation, in its own tenant context:
  * finish exits whose last working day has passed (account closed, seat freed, reportees moved, documents link sent);
  * remind owners of overdue clearance tasks (at most every `reminder_every_days`);
  * open an exit case for fixed-term contracts ending within `contract_end_lookahead_days` (HR then approves it).
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger("zoiko.offboarding.jobs")


def run_org(db, org: int, now: datetime) -> int:
    from app.modules.employee.models import Employee
    from app.modules.hr.offboarding import service as svc, settings as S
    from app.modules.hr.offboarding.models import OffboardingCase, OffboardingTask
    t = svc.today()
    n = 0
    for case in (db.query(OffboardingCase).filter(OffboardingCase.organization_id == org, OffboardingCase.status == "approved",
                                                  OffboardingCase.last_working_day < t).all()):
        svc.finalize_exit(db, case, None)
        n += 1
    cfg = S.get_settings(db, org)
    every = timedelta(days=int(cfg["reminder_every_days"]))
    overdue = (db.query(OffboardingTask).join(OffboardingCase, OffboardingCase.id == OffboardingTask.case_id)
               .filter(OffboardingTask.organization_id == org, OffboardingTask.status == "open", OffboardingTask.due_date < t,
                       OffboardingTask.assignee_id.isnot(None), OffboardingCase.status.in_(("approved", "exited")))
               .all())
    for task in overdue:
        if task.reminded_at and now - task.reminded_at < every:
            continue
        case = db.get(OffboardingCase, task.case_id)
        link = "/employee/ess/exit/tasks" if task.assignee_id == case.employee_id else "/employee/ess/offboarding-tasks"
        svc._notify(db, org, task.assignee_id, "offboarding.task_overdue", link, title=task.title)
        task.reminded_at = now
        n += 1
    db.commit()
    ahead = int(cfg["contract_end_lookahead_days"])
    if ahead:
        ending = (db.query(Employee).filter(Employee.organization_id == org, Employee.is_active.is_(True),
                                            Employee.contract_end_date.isnot(None), Employee.contract_end_date >= t,
                                            Employee.contract_end_date <= t + timedelta(days=ahead)).all())
        for emp in ending:
            if svc.open_case_of(db, org, emp.id):
                continue
            if db.query(OffboardingCase.id).filter(OffboardingCase.organization_id == org, OffboardingCase.employee_id == emp.id,
                                                   OffboardingCase.exit_type == "end_of_contract",
                                                   OffboardingCase.last_working_day == emp.contract_end_date).first():
                continue   # HR already decided on this contract end (rejected or cancelled)
            case = OffboardingCase(organization_id=org, employee_id=emp.id, case_number=svc._next_number(db, org),
                                   exit_type="end_of_contract", status="submitted", source="system",
                                   reason_category="contract_end", reason="Fixed-term contract ends",
                                   resignation_date=t, notice_handling="serve", last_working_day=emp.contract_end_date)
            db.add(case)
            db.flush()
            svc.log(db, case, None, "started", f"Contract ends on {svc._fmt(emp.contract_end_date)}: exit opened for HR to confirm")
            hr = [p.id for p in svc._hr_people(db, org) if p.id != emp.id]
            svc._notify(db, org, hr, "offboarding.approval_needed", f"/zoiko-hr/offboarding/cases/{case.id}")
            db.commit()
            n += 1
    return n


def offboarding_job(now: Optional[datetime] = None) -> Optional[int]:
    from app.modules.hr.documents.automation import limits
    from app.modules.hr.documents.automation.jobs import _for_each_org, _session
    db = _session()
    try:
        if limits.globally_paused(db):
            return 0
        return _for_each_org(db, None, run_org, now or datetime.utcnow())
    except Exception:
        db.rollback()
        logger.exception("offboarding job failed")
        return None
    finally:
        db.close()


def register(scheduler) -> None:
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(offboarding_job, CronTrigger(hour=0, minute=20), id="hr_offboarding_daily",
                      name="Offboarding: finish exits past the last working day, task reminders, contracts ending",
                      replace_existing=True, misfire_grace_time=3600, coalesce=True, max_instances=1)
