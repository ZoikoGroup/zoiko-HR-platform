"""Background worker: delivers due webhooks and runs due workflow executions.

An in-process APScheduler interval job, matching the existing billing scheduler.
Run a single API process (or one dedicated worker) so jobs are not duplicated."""

import logging

logger = logging.getLogger("zoiko.integrations")

_scheduler = None
INTERVAL_SECONDS = 15


def run_once() -> None:
    from app.database import SessionLocal
    from app.modules.integrations import delivery, engine

    db = SessionLocal()
    try:
        delivery.process_due_deliveries(db)
        engine.process_due_executions(db)
    except Exception:
        logger.exception("integrations worker tick failed")
    finally:
        db.close()


def start_worker():
    global _scheduler
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        logger.warning("[integrations] APScheduler not installed - webhooks/workflows will not be processed")
        return None
    if _scheduler is not None and _scheduler.running:
        return _scheduler
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(run_once, "interval", seconds=INTERVAL_SECONDS, id="integrations_worker",
                       replace_existing=True, max_instances=1, coalesce=True)
    _scheduler.start()
    logger.info("[integrations] worker started (every %ss)", INTERVAL_SECONDS)
    return _scheduler


def stop_worker():
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
