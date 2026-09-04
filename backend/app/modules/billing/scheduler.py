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


def _execute_delinquency_walk_job():
    """Job function: advance the delinquency timeline (day 10/20/45) for every
    open case and dispatch stage-change notices (Section 10 G1-G5)."""
    try:
        from app.database import SessionLocal
        from app.modules.billing.delinquency_service import run_delinquency_walk

        db = SessionLocal()
        try:
            result = run_delinquency_walk(db)
            logger.info(
                "[scheduler] Delinquency walk: %d open, %d advanced, %d notified",
                result["open_cases"], result["advanced"], result["notified"],
            )
        finally:
            db.close()
    except Exception as e:
        logger.error("[scheduler] Delinquency walk job failed: %s", e)


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

    if app:
        # Backwards-compatible registration for apps that do not use lifespan.
        # Modern apps (main.py) call start_scheduler()/stop_scheduler() directly
        # inside the FastAPI lifespan block instead.
        @app.on_event("startup")
        def _app_start():
            start_scheduler()

        @app.on_event("shutdown")
        def _app_stop():
            stop_scheduler()
    else:
        start_scheduler()

    return True


def _ensure_scheduler():
    """Lazily build the BackgroundScheduler and register all daily jobs."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler()

    _scheduler.add_job(
        _execute_plan_changes_job,
        CronTrigger(hour=2, minute=0),
        id="plan_change_execution",
        name="Execute due plan changes",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    _scheduler.add_job(
        _execute_delinquency_walk_job,
        CronTrigger(hour=2, minute=5),
        id="delinquency_walk",
        name="Advance delinquency timeline and dispatch notices",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    return _scheduler


def start_scheduler() -> bool:
    """Start the background scheduler (registers plan-change + delinquency jobs
    on first start). Safe to call once from the FastAPI lifespan."""
    if not _SCHEDULER_AVAILABLE:
        logger.warning("[scheduler] APScheduler not installed — background jobs disabled")
        return False
    global _scheduler
    _scheduler = _ensure_scheduler()
    if not _scheduler.running:
        _scheduler.start()
    logger.info("[scheduler] Background scheduler started — plan changes 02:00, delinquency walk 02:05 UTC")
    return True


def stop_scheduler() -> bool:
    """Stop the background scheduler. Safe to call from the FastAPI lifespan."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("[scheduler] Background scheduler stopped")
        return True
    return False


def get_scheduler():
    """Return the scheduler instance (or None if not initialized)."""
    return _scheduler


def is_scheduler_available() -> bool:
    return _SCHEDULER_AVAILABLE
