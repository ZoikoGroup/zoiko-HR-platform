"""
modules/billing/scheduler.py
-----------------------------
APScheduler integration for periodic plan-change execution.

Import and call setup_scheduler(app) from main.py to register a daily
job that executes due plan changes. Falls back gracefully if APScheduler
is not installed.

Per Section 13/J3: downgrades take effect at renewal anchor date.
This scheduler runs daily at 02:00 UTC to process any changes whose
effective_at has arrived.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger("zoiko.billing.scheduler")

_SCHEDULER_AVAILABLE = False
try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    _SCHEDULER_AVAILABLE = True
except ImportError:
    pass

_scheduler = None


def _execute_plan_changes_job():
    """Job function: execute all due plan changes."""
    try:
        from app.database import SessionLocal
        from app.modules.billing.plan_change_service import execute_due_changes

        db = SessionLocal()
        try:
            result = execute_due_changes(db)
            logger.info(
                "[scheduler] Plan changes: %d due, %d executed, %d blocked, %d failed",
                result["total_due"], result["executed"], result["blocked"], result["failed"],
            )
        finally:
            db.close()
    except Exception as e:
        logger.error("[scheduler] Plan change execution job failed: %s", e)


def setup_scheduler(app=None) -> bool:
    """Register the plan-change scheduler with the FastAPI app lifecycle.

    If APScheduler is not installed, logs a warning and returns False.
    The scheduler runs daily at 02:00 UTC.

    Usage in main.py:
        from app.modules.billing.scheduler import setup_scheduler
        setup_scheduler(app)
    """
    if not _SCHEDULER_AVAILABLE:
        logger.warning(
            "[scheduler] APScheduler not installed — plan change execution "
            "must be run manually via scripts/execute_plan_changes.py"
        )
        return False

    global _scheduler
    _scheduler = BackgroundScheduler()

    _scheduler.add_job(
        _execute_plan_changes_job,
        CronTrigger(hour=2, minute=0),
        id="plan_change_execution",
        name="Execute due plan changes",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    if app:
        @app.on_event("startup")
        def start_scheduler():
            _scheduler.start()
            logger.info("[scheduler] Plan change scheduler started — daily at 02:00 UTC")

        @app.on_event("shutdown")
        def stop_scheduler():
            if _scheduler.running:
                _scheduler.shutdown(wait=False)
                logger.info("[scheduler] Plan change scheduler stopped")
    else:
        _scheduler.start()
        logger.info("[scheduler] Plan change scheduler started (standalone) — daily at 02:00 UTC")

    return True


def get_scheduler():
    """Return the scheduler instance (or None if not initialized)."""
    return _scheduler


def is_scheduler_available() -> bool:
    return _SCHEDULER_AVAILABLE
