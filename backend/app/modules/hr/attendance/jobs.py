"""Attendance scheduled jobs (attendance plan M8). Registered from doc_templates.jobs.register, so they run on the
background leader only. Every organization is closed in its own transaction under its tenant context; paused
organizations (and a global pause) are skipped. Logs carry ids only."""
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger("zoiko.attendance.jobs")


def close_org(db, org: int, now: datetime) -> int:
    from app.modules.hr.attendance.day_close import close_due_days
    results = close_due_days(db, org, now)
    for r in results:
        logger.info("attendance day closed: org=%s day=%s written=%s updated=%s missed=%s", org, r.work_date, r.written,
                    r.updated, r.missed_punches)
    return len(results)


def end_of_day_job(now: Optional[datetime] = None) -> Optional[int]:
    from app.modules.hr.attendance import clock
    from app.modules.hr.documents.automation import limits
    from app.modules.hr.documents.automation.jobs import _for_each_org, _session
    db = _session()
    try:
        if limits.globally_paused(db):
            return 0
        return _for_each_org(db, None, close_org, now or clock.utcnow())
    except Exception:
        db.rollback()
        logger.exception("attendance end-of-day job failed")
        return None
    finally:
        db.close()


def register(scheduler) -> None:
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(end_of_day_job, CronTrigger(minute="*/30"), id="hr_attendance_end_of_day",
                      name="Close finished attendance days (absent, leave, holiday, weekly off, missed punch-out)",
                      replace_existing=True, misfire_grace_time=1800, coalesce=True, max_instances=1)
